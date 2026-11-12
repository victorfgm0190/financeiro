// @vitest-environment jsdom
// Tela nova da conferência da Importar Fatura (Etapa 6b): resumo, cartão "É este?" com lado a lado,
// atalhos de teclado, blocos recolhidos e o lugar da sugestão do Assistente. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'

vi.mock('../../lib/atalhos/api', () => ({
  listarAtalhos: async () => [], gravarAtalhos: async () => {}, restaurarAtalho: async () => {}, restaurarTodosAtalhos: async () => {},
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../lib/abrirTela', () => ({ navegarPara: vi.fn() }))
const { AtalhosProvider } = await import('../../context/AtalhosContext.jsx')
const {
  ResumoConferencia, CartoesDecisao, BlocoConferencia, ListaJaNoFinup, ListaJaConciliados, ListaNaoEntram, ListaAguardando, SugestaoAssistente,
} = await import('./ConferenciaBlocos.jsx')
const { montarBlocos, resumoDosBlocos, perguntasDeDecisao } = await import('../../lib/blocosConferencia.js')

afterEach(() => cleanup())

const linha = (id, extra = {}) => ({ _id: id, description: `LOJA ${id}`, amount: 10, type: 'expense', selected: true, date: '2026-11-03', _dateCartao: '2026-11-03', faturaMonthYear: '2026-11', ...extra })
const tx = (id, extra = {}) => ({ id, description: `Loja ${id}`, amount: 10, type: 'expense', date: '2026-11-03', faturaMonthYear: '2026-11', reconciled: false, origin: 'manual', ...extra })
const tecla = (init) => act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })) })

const DUP = linha('dup', { selected: false, _dupLevel: 'possivel', _dupTx: tx('t6', { installmentNum: 4, installmentTotal: 4 }), _installment: { num: 3, total: 4 } })
const DOIS = linha('dois', { selected: false, _jaLancadoOpcoes: [tx('t4'), tx('t5', { description: 'Outra loja' })] })
const REC = linha('rec', { selected: false, amount: 44.9, _recorrentePergunta: { scheduleId: 'sch_1', descricao: 'Streaming', valorAgendado: 39.9, ocorrencia: '2026-11-05', fatura: '2026-11' } })

describe('1. Resumo', () => {
  it('três números grandes e o total do arquivo × o que fica na fatura', () => {
    const rows = [linha('a'), linha('b', { amount: 20 }), linha('c', { selected: false, _isDuplicate: true, _dbTx: tx('x') }), DUP]
    const resumo = resumoDosBlocos(montarBlocos(rows, null), { arquivo: 50, projetado: 50 })
    const onIr = vi.fn()
    render(<ResumoConferencia resumo={resumo} onIr={onIr} />)
    expect(screen.getByTestId('resumo-novos').textContent).toMatch(/^2Novos.*30,00/)
    expect(screen.getByTestId('resumo-ja').textContent).toMatch(/^1Já estão no Finup0 conciliados antes · 1 juntados agora/)
    expect(screen.getByTestId('resumo-decisao').textContent).toMatch(/^1Pedem sua decisão.*10,00 ficam de fora/)
    expect(screen.getByTestId('resumo-decisao').className).toMatch(/aviso/)
    expect(screen.getByTestId('resumo-totais').textContent).toMatch(/Total do arquivo: R\$\s?50,00.*Fica na fatura do Finup depois de confirmar: R\$\s?50,00/)
    fireEvent.click(screen.getByTestId('resumo-decisao'))
    expect(onIr).toHaveBeenCalledWith('decisao')
  })
})

describe('1b. Topo × blocos: o mesmo nome nunca com números diferentes', () => {
  it('"Já estão no Finup" é o total; o bloco dos juntados agora tem outro nome', async () => {
    const { BLOCOS } = await import('../../lib/blocosConferencia.js')
    const rows = [
      linha('c', { selected: false, _isDuplicate: true, _dbTx: tx('x1', { reconciled: true }) }),
      linha('d', { selected: false, _isDuplicate: true, _dbTx: tx('x2', { reconciled: true }) }),
      linha('j', { selected: false, _isDuplicate: true, _dbTx: tx('x3'), _jaLancado: { tx: tx('x3'), origem: 'regra_nova' } }),
    ]
    const resumo = resumoDosBlocos(montarBlocos(rows, null), null)
    render(<ResumoConferencia resumo={resumo} />)
    expect(screen.getByTestId('resumo-ja').textContent).toMatch(/^3Já estão no Finup2 conciliados antes · 1 juntados agora/)
    expect(BLOCOS.map(b => b.titulo)).toEqual(['Pedem sua decisão', 'Novos', 'Juntados agora (ficam conciliados)', 'Já conciliados antes', 'Não entram', 'Aguardando o banco'])
    expect(BLOCOS.filter(b => b.titulo === 'Já estão no Finup')).toHaveLength(0)
  })
})

describe('2. Pedem sua decisão — "É este?"', () => {
  const montar = (rows, props = {}) => {
    const onSim = vi.fn(); const onNao = vi.fn()
    const r = render(<AtalhosProvider><CartoesDecisao perguntas={perguntasDeDecisao(rows)} ctx={{ mostrarGrupo: false }} onSim={onSim} onNao={onNao} {...props} /></AtalhosProvider>)
    return { onSim, onNao, ...r }
  }
  it('um cartão por linha, "1 de N", lado a lado com a diferença realçada e a frase de cada botão', () => {
    const { onSim, onNao } = montar([DUP, REC])
    expect(screen.getByTestId('decisao-posicao').textContent).toBe('1 de 2')
    expect(screen.getByTestId('decisao-titulo').textContent).toBe('É este?')
    const parcela = screen.getByTestId('campo-parcela')
    expect(parcela.textContent).toMatch(/3\/4.*4\/4.*difere/)
    expect(parcela.querySelector('[data-difere="sim"]')).toBeTruthy()
    expect(screen.getByTestId('campo-valor').querySelector('[data-difere="sim"]')).toBeNull()
    for (const campo of ['dataCartao', 'dataFinup', 'descricao', 'valor', 'parcela', 'categoria', 'fatura', 'origem']) expect(screen.getByTestId(`campo-${campo}`)).toBeTruthy()
    expect(screen.getByTestId('campo-origem').textContent).toMatch(/Arquivo do banco.*Parcela prevista de compra parcelada/)
    expect(screen.getByTestId('decisao-sim').parentElement.textContent).toMatch(/Nada novo é criado/)
    expect(screen.getByTestId('decisao-nao').parentElement.textContent).toMatch(/entra como lançamento novo/)
    fireEvent.click(screen.getByTestId('decisao-sim'))
    expect(onSim).toHaveBeenCalledWith(expect.objectContaining({ id: 'dup', tipo: 'duplicata' }), expect.objectContaining({ id: 't6' }))
    fireEvent.click(screen.getByTestId('decisao-proxima'))
    expect(screen.getByTestId('decisao-posicao').textContent).toBe('2 de 2')
    expect(screen.getByTestId('decisao-titulo').textContent).toBe('É este agendamento?')
    expect(screen.getByTestId('campo-valor').textContent).toMatch(/44,90.*39,90 \(agendado\)/)
    fireEvent.click(screen.getByTestId('decisao-nao'))
    expect(onNao).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec', tipo: 'recorrente' }))
  })
  it('mais de um candidato: cada um lado a lado com a linha, um "Sim" por candidato', () => {
    const { onSim } = montar([DOIS])
    expect(screen.getAllByRole('columnheader').map(c => c.textContent)).toEqual(['', 'Na fatura', 'No Finup · opção 1', 'No Finup · opção 2'])
    expect(screen.queryByTestId('decisao-sim')).toBeNull()
    fireEvent.click(screen.getByTestId('decisao-sim-2'))
    expect(onSim).toHaveBeenCalledWith(expect.objectContaining({ id: 'dois' }), expect.objectContaining({ id: 't5' }))
  })
  it('atalhos do app: Alt+S sim, Alt+O não, Alt+. próxima, Alt+, anterior', async () => {
    const { onSim, onNao } = montar([DUP, REC])
    await act(async () => {})
    expect(screen.getByTestId('decisao-sim').textContent).toMatch(/\(Alt\+S\)/)
    tecla({ code: 'Period', key: '.', altKey: true })
    expect(screen.getByTestId('decisao-posicao').textContent).toBe('2 de 2')
    tecla({ code: 'Comma', key: ',', altKey: true })
    expect(screen.getByTestId('decisao-posicao').textContent).toBe('1 de 2')
    tecla({ code: 'KeyS', key: 's', altKey: true })
    expect(onSim).toHaveBeenCalledTimes(1)
    tecla({ code: 'KeyO', key: 'o', altKey: true })
    expect(onNao).toHaveBeenCalledWith(expect.objectContaining({ id: 'dup' }))
  })
  it('Alt+S com mais de um candidato não escolhe sozinho', async () => {
    const { onSim } = montar([DOIS])
    await act(async () => {})
    tecla({ code: 'KeyS', key: 's', altKey: true })
    expect(onSim).not.toHaveBeenCalled()
  })
  it('sem perguntas: "Nada pede sua decisão"', () => {
    montar([linha('a')])
    expect(screen.getByTestId('decisao-vazia').textContent).toMatch(/Nada pede sua decisão/)
  })
  it('lugar da sugestão do Assistente: vazio sem sugestão; com sugestão válida, entre a comparação e os botões', () => {
    montar([DUP])
    expect(screen.queryByTestId('sugestao-assistente')).toBeNull()
    cleanup()
    montar([DUP], { sugestoes: { dup: { linhaId: 'dup', decisao: 'mesmo', candidatoId: 't6', confianca: 'alta', motivo: 'Mesma loja e mesmo valor.' } } })
    const cartao = screen.getByTestId('decisao-cartao')
    const sug = within(cartao).getByTestId('sugestao-assistente')
    expect(sug.textContent).toMatch(/Sugestão do Assistente \(confiança alta\): Mesma loja/)
    expect(sug.compareDocumentPosition(screen.getByTestId('decisao-sim')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sug.compareDocumentPosition(screen.getByTestId('campo-origem')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })
  it('sugestão compacta (lista de Novos) só com sugestão', () => {
    const { container } = render(<SugestaoAssistente compacto sugestao={null} />)
    expect(container.textContent).toBe('')
  })
})

describe('3. Blocos recolhidos', () => {
  it('recolhido com contador; abre ao clicar; vazio não abre', () => {
    const onAlternar = vi.fn()
    const { rerender } = render(<BlocoConferencia id="novos" titulo="Novos" qtd={3} aberto={false} onAlternar={onAlternar}><p>tabela</p></BlocoConferencia>)
    const botao = screen.getByRole('button', { name: /Novos.*\(3\)/ })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('tabela')).toBeNull()
    fireEvent.click(botao)
    expect(onAlternar).toHaveBeenCalled()
    rerender(<BlocoConferencia id="novos" titulo="Novos" qtd={3} aberto onAlternar={onAlternar}><p>tabela</p></BlocoConferencia>)
    expect(screen.getByText('tabela')).toBeTruthy()
    rerender(<BlocoConferencia id="vazio" titulo="Não entram" qtd={0} aberto={false} onAlternar={onAlternar} />)
    expect(screen.getByRole('button', { name: /Não entram/ }).disabled).toBe(true)
  })
  it('"Já estão no Finup": cada par numa linha, com o que foi juntado e "Não é este" só quando a regra deixa', () => {
    const casado = linha('ja', { selected: false, _isDuplicate: true, _dbTx: tx('t1', { description: 'Padaria' }), _jaLancado: { tx: tx('t1', { description: 'Padaria' }), origem: 'regra_nova' } })
    const mesmaParcela = linha('col', { selected: false, _collisionTx: tx('t3', { installmentNum: 2, installmentTotal: 5 }) })
    const onAcao = vi.fn()
    render(<ListaJaNoFinup linhas={[casado, mesmaParcela]} onAcao={onAcao} />)
    const itens = within(screen.getByTestId('lista-ja-no-finup')).getAllByRole('listitem')
    expect(itens[0].textContent).toMatch(/LOJA ja.*→ no Finup: “Padaria” · Lançado por você/)
    expect(itens[1].textContent).toMatch(/Parcela prevista de compra parcelada/)
    expect(screen.queryByTestId('nao-e-este-col')).toBeNull()
    fireEvent.click(screen.getByTestId('nao-e-este-ja'))
    expect(onAcao).toHaveBeenCalledWith(casado, 'novo')
  })
  it('"Já conciliados antes": só consulta; diferença de valor aparece com ⚠', () => {
    const r = linha('c', { amount: 12, selected: false, _isDuplicate: true, _dbTx: tx('t2', { reconciled: true, amount: 10, dateCartao: '2026-11-03' }), _collisionTx: tx('t2', { reconciled: true, amount: 10, dateCartao: '2026-11-03' }) })
    render(<ListaJaConciliados linhas={[r]} />)
    const lista = screen.getByTestId('lista-ja-conciliados')
    expect(lista.textContent).toMatch(/⚠ Valor: no Finup R\$\s?10,00 · na fatura R\$\s?12,00/)
    expect(within(lista).queryByRole('button')).toBeNull()
  })
  it('"Não entram" e "Aguardando o banco": nenhum botão de excluir', () => {
    const onIncluir = vi.fn()
    render(<><ListaNaoEntram linhas={[linha('f', { selected: false })]} onIncluir={onIncluir} /><ListaAguardando itens={[{ tx: tx('p', { description: 'Parcela prevista', faturaMonthYear: '2026-11' }), valor: -10 }]} /></>)
    expect(screen.queryByRole('button', { name: /exclu/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Importar esta linha' }))
    expect(onIncluir).toHaveBeenCalled()
    expect(screen.getByTestId('lista-aguardando').textContent).toMatch(/Parcela prevista.*fatura 11\/2026/)
  })
})
