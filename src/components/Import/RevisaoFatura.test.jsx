// @vitest-environment jsdom
// Peças de apresentação da revisão da fatura (Importar Fatura → etapa 2). Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import {
  ConferenciaFatura, DataCelula, FaturaCelula, DescricaoCelula,
  ParcelasJaNoBanco, BarraAcoesRevisao, BlocoRecolhido, LinkRegrasClassificacao,
} from './RevisaoFatura'
import { contarRevisaoFatura } from '../../lib/contagemRevisaoFatura'

afterEach(() => { cleanup(); localStorage.clear() })

const linha = (id, extra = {}) => ({ _id: id, description: `Loja ${id}`, amount: 10, type: 'expense', selected: true, ...extra })
const ROWS = [
  linha('a'), linha('b', { amount: 20 }),
  linha('c', { selected: false, _isDuplicate: true }),
  linha('d', { selected: false, _jaLancadoOpcoes: [{ id: 'x' }] }),
  linha('e', { selected: false, amount: 5 }),
]
const contagem = contarRevisaoFatura(ROWS)

const conf = (extra = {}) => ({
  diferenca: -63, explicada: -63, semExplicacao: 0, qtdItens: 2, totalmenteExplicada: true, semDiferenca: false,
  grupos: [
    { tipo: 'so_no_banco', titulo: 'Gravado no Finup, ainda não veio no arquivo', qtd: 1, subtotal: -30, itens: [{ tipo: 'so_no_banco', valor: -30, tx: { description: 'Assinatura Z', date: '2026-11-02' } }] },
    { tipo: 'aguardando_banco', titulo: 'Parcelas previstas aguardando lançamento do banco', qtd: 1, subtotal: -33, itens: [{ tipo: 'aguardando_banco', valor: -33, tx: { description: 'Loja Y 3/5', date: '2026-11-05' } }] },
  ],
  ...extra,
})
const SESSAO = { ambSigla: 'XX', id: 'u1' }

describe('2. Conferência da fatura', () => {
  it('100% explicada: recolhida, ✓ e "Diferença de R$ X totalmente explicada (N itens)"; abre com grupos e subtotais', () => {
    render(<ConferenciaFatura conferencia={conf()} sessao={SESSAO} />)
    const botao = screen.getByRole('button', { name: /Conferência da fatura/ })
    expect(botao.textContent).toMatch(/Diferença de R\$\s*63,00 totalmente explicada \(2 itens\)/)
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Assinatura Z')).toBeNull()
    fireEvent.click(botao)
    expect(screen.getByText(/Gravado no Finup, ainda não veio no arquivo/)).toBeTruthy()
    expect(screen.getByText(/Parcelas previstas aguardando lançamento do banco/)).toBeTruthy()
    expect(screen.getByText('Assinatura Z')).toBeTruthy()
  })
  it('lembra aberto/fechado por usuário', () => {
    render(<ConferenciaFatura conferencia={conf()} sessao={SESSAO} />)
    fireEvent.click(screen.getByRole('button', { name: /Conferência da fatura/ }))
    cleanup()
    render(<ConferenciaFatura conferencia={conf()} sessao={SESSAO} />)
    expect(screen.getByRole('button', { name: /Conferência da fatura/ }).getAttribute('aria-expanded')).toBe('true')
    cleanup()
    render(<ConferenciaFatura conferencia={conf()} sessao={{ ambSigla: 'XX', id: 'outro' }} />)
    expect(screen.getByRole('button', { name: /Conferência da fatura/ }).getAttribute('aria-expanded')).toBe('false')
  })
  it('sobra sem explicação: alerta "R$ Y sem explicação" e abre expandido', () => {
    render(<ConferenciaFatura conferencia={conf({ semExplicacao: 5, totalmenteExplicada: false })} sessao={SESSAO} />)
    const botao = screen.getByRole('button', { name: /Conferência da fatura/ })
    expect(botao.textContent).toMatch(/R\$\s*5,00 sem explicação/)
    expect(botao.getAttribute('aria-expanded')).toBe('true')
  })
  it('itens sem decisão: não contam como explicados — "N itens ainda sem decisão — R$ X não serão importados"', () => {
    const pend = { tipo: 'sem_decisao', titulo: 'Ainda sem decisão — não serão importadas', qtd: 2, subtotal: 80, naoExplica: true,
      itens: [{ tipo: 'sem_decisao', valor: 50, linha: { _id: 'p1', description: 'Loja P', date: '2026-11-01' } }, { tipo: 'sem_decisao', valor: 30, linha: { _id: 'p2', description: 'Loja Q', date: '2026-11-02' } }] }
    render(<ConferenciaFatura conferencia={conf({ grupos: [pend, ...conf().grupos], semDecisao: { qtd: 2, valor: 80 }, totalmenteExplicada: false })} sessao={SESSAO} />)
    const botao = screen.getByRole('button', { name: /Conferência da fatura/ })
    expect(botao.textContent).toMatch(/2 itens ainda sem decisão — R\$\s*80,00 não serão importados/)
    expect(botao.textContent).not.toMatch(/totalmente explicada/)
    expect(botao.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Loja P')).toBeTruthy()
  })
  it('linha do arquivo citada leva até ela', () => {
    const ir = vi.fn()
    const c = conf({ grupos: [{ tipo: 'linha_fora', titulo: 'Linhas desmarcadas, não serão importadas', qtd: 1, subtotal: 7, itens: [{ tipo: 'linha_fora', valor: 7, linha: { _id: 'l1', description: 'Loja Desmarcada', date: '2026-11-01' } }] }] })
    render(<ConferenciaFatura conferencia={c} sessao={SESSAO} onIrParaLinha={ir} />)
    fireEvent.click(screen.getByRole('button', { name: /Conferência da fatura/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Loja Desmarcada' }))
    expect(ir).toHaveBeenCalledWith('l1')
  })
})

describe('3. Tabela', () => {
  it('Data: só a do cartão; indicador quando a do sistema é outra; clique edita as duas', () => {
    const onChange = vi.fn()
    render(<DataCelula row={{ _dateCartao: '2026-10-05', date: '2026-10-14' }} onChange={onChange} />)
    expect(screen.getByLabelText('data do sistema diferente')).toBeTruthy()
    expect(screen.queryByText('Sistema')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /05\/10\/2026/ }))
    expect(screen.getByText('Cartão')).toBeTruthy()
    expect(screen.getByText('Sistema')).toBeTruthy()
    cleanup()
    render(<DataCelula row={{ _dateCartao: '2026-10-05', date: '2026-10-05' }} onChange={onChange} />)
    expect(screen.queryByLabelText('data do sistema diferente')).toBeNull()
  })
  it('Fatura: texto, destacado quando ≠ mês de referência; o seletor só abre no clique', () => {
    const onChange = vi.fn()
    render(<FaturaCelula row={{ faturaMonthYear: '2026-12' }} referencia="2026-11" opcoes={[{ value: '2026-11' }, { value: '2026-12' }]} onChange={onChange} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    const b = screen.getByRole('button', { name: /12\/2026/ })
    expect(b.className).toMatch(/aviso/)
    fireEvent.click(b)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2026-11' } })
    expect(onChange).toHaveBeenCalledWith({ faturaMonthYear: '2026-11' })
  })
  it('Descrição: principal inteira e cidade/sufixo na 2ª linha', () => {
    render(<DescricaoCelula row={{ description: 'PADARIA PAO QUENTE     SAO PAULO' }} onChange={() => {}} selos={<span>À vista</span>} />)
    expect(screen.getByRole('button', { name: 'PADARIA PAO QUENTE' })).toBeTruthy()
    expect(screen.getByText('SAO PAULO')).toBeTruthy()
    expect(screen.getByText('À vista')).toBeTruthy()
  })
})

const colisao = (id, mudou) => ({
  id, descricao: `Loja ${id}`, parcela: '3/10', valor: 10, aplicar: mudou, csv: null,
  campos: Object.fromEntries(['descricao', 'parcela', 'data', 'valor', 'categoria', 'grupo', 'reserva'].map(k => [k, { antes: 'A', depois: mudou && k === 'categoria' ? 'B' : 'A' }])),
})

describe('4. Rodapé', () => {
  it('parcelas já no banco: só as com diferença, em tabela com um cabeçalho', () => {
    render(<ParcelasJaNoBanco linhas={[colisao('x', true)]} identicas={[colisao('y', false), colisao('z', false)]} aplicar={1} onToggle={() => {}} />)
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['', 'Descrição', 'Parcela', 'Data', 'Valor', 'Categoria', 'Grupo'])
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.queryByText(/idêntico ao banco/)).toBeNull()
    expect(screen.getByText(/2 idênticas \(ocultas\)/)).toBeTruthy()
  })
  it('conciliado com diferença no arquivo: só informação, sem caixa de marcar e sem tabela de atualizar', () => {
    const conciliadas = [{ id: 'k', descricao: 'Seguradora Parc8sao Paulobra', parcela: '8/12', valor: 205.61,
      diferencas: [{ campo: 'dataCartao', banco: '2026-10-31', arquivo: '2026-10-30' }] }]
    render(<ParcelasJaNoBanco linhas={[]} conciliadas={conciliadas} identicas={[]} aplicar={0} onToggle={() => {}} />)
    const nota = screen.getByRole('note')
    expect(nota.textContent).toMatch(/1 lançamento já conciliado com diferença no arquivo — só informação/)
    expect(nota.textContent).toMatch(/Data do cartão: no Finup 31\/10\/2026 · no arquivo 30\/10\/2026/)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText(/marcada/)).toBeNull()
  })
  it('todas idênticas: uma linha recolhida "N parcelas já no banco, todas idênticas"', () => {
    render(<ParcelasJaNoBanco linhas={[]} identicas={[colisao('y', false), colisao('z', false)]} aplicar={0} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: /2 parcelas já no banco, todas idênticas/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('bloco recolhido com contador; link para as regras de classificação', () => {
    render(<><BlocoRecolhido titulo="Parcelas de faturas futuras" contador={4}><p>conteúdo</p></BlocoRecolhido><LinkRegrasClassificacao /></>)
    expect(screen.getByRole('button', { name: /Parcelas de faturas futuras.*\(4\)/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('conteúdo')).toBeNull()
    expect(screen.getByRole('link', { name: /Gerenciar regras de classificação/ }).getAttribute('href')).toBe('#config/regras/classificacao')
  })
})

describe('5. Barra de ações', () => {
  it('resumo "n lançamentos · R$ total" e o aviso dos itens sem decisão', () => {
    render(<BarraAcoesRevisao contagem={contagem} acoes={<button>Classificar Auto</button>} confirmar={<button>Confirmar (2)</button>} />)
    const barra = screen.getByTestId('barra-acoes-revisao')
    expect(barra.textContent).toMatch(/2 lançamentos · R\$\s*30,00/)
    expect(barra.textContent).toMatch(/1 item ainda sem decisão — R\$\s*\d+,\d{2} não será importado/)
    expect(barra.className).toMatch(/sticky/)
  })
})
