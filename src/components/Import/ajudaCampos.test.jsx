// @vitest-environment jsdom
// Etapa 3, bloco 4 (Importar): todo campo visível de cada formulário (data-help-form) está num
// data-help-id com conteúdo na base — passo inicial, mapeamento do arquivo e células da revisão
// (inclusive as que só aparecem ao clicar). Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|set|add|update|delete|salvar|registrar|recarregar|carregar|learn)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))

const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
const base = await import('../../help/index.js')
const { default: ImportPanel } = await import('./ImportPanel.jsx')
const { default: CsvColumnMapperModal } = await import('./CsvColumnMapperModal.jsx')
const { DataCelula, FaturaCelula, DescricaoCelula, ParcelasJaNoBanco } = await import('./RevisaoFatura.jsx')
const { CartoesDecisao } = await import('./ConferenciaBlocos.jsx')
const { perguntasDeDecisao } = await import('../../lib/blocosConferencia.js')
const { JaLancadoStatus } = await import('./JaLancadoCelula.jsx')
const { default: ImportarLancamentosPanel } = await import('../ImportarLancamentos/ImportarLancamentosPanel.jsx')

const nada = () => {}
Object.assign(app, {
  accounts: [{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf' }, { id: 'vs', name: 'Cartão Exemplo', type: 'credit', profileId: 'pf', closingDay: 5, dueDay: 12 }],
  accountGroups: [], categories: [{ id: 'cat', name: 'Categoria Exemplo', type: 'expense' }], transactions: [], schedules: [],
  gerencialGroups: [], payees: ['Favorecido Exemplo'], settings: {}, activeProfileId: 'pf', pode: () => true,
})
afterEach(cleanup)

const auditar = (form) => {
  const raiz = document.querySelector(`[data-help-form="${form}"]`)
  expect(raiz, form).toBeTruthy()
  const semConteudo = [...raiz.querySelectorAll('[data-help-id]')].map(e => e.dataset.helpId).filter(id => !base.helpDoCampo(id))
  return [...controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 140)), ...semConteudo]
}

describe('Importar: todo campo visível tem ajuda', () => {
  it('Importar fatura — passo inicial (cartão, mês, arquivo, conciliar)', { timeout: 60_000 }, () => {
    render(<ImportPanel />)
    const abaCartao = screen.queryByRole('button', { name: 'Cartão de Crédito' })
    if (abaCartao) {
      expect(auditar('contaCorrente')).toEqual([])
      fireEvent.click(abaCartao)
    }
    expect(auditar('importarFatura')).toEqual([])
    for (const id of ['importarFatura.cartao', 'importarFatura.mes', 'importarFatura.arquivo', 'importarFatura.conciliar']) {
      expect(document.querySelector(`[data-help-id="${id}"]`), id).toBeTruthy()
    }
  })
  it('Mapear arquivo do banco: uma coluna de valor e débito/crédito', () => {
    const tabela = { linhas: [['Data', 'Histórico', 'Valor'], ['01/11/2026', 'Compra Exemplo', '-10,00']] }
    render(<CsvColumnMapperModal tabela={tabela} tipo="cartao" onImportar={nada} onSalvar={nada} onClose={nada} />)
    expect(auditar('mapeador')).toEqual([])
    fireEvent.click(screen.getByText('Débito e crédito separados'))
    expect(document.querySelector('[data-help-id="mapeador.debito"]')).toBeTruthy()
    expect(auditar('mapeador')).toEqual([])
  })
  it('Revisão da fatura: datas, fatura e descrição em edição, decidir e parcelas já no banco', () => {
    const row = { _id: 'r', description: 'Compra Exemplo', date: '2026-11-01', _dateCartao: '2026-10-30', faturaMonthYear: '2026-11', amount: 10, selected: false, _dupTx: { id: 't', description: 'Compra Exemplo', date: '2026-11-01', amount: 10 }, _dupLevel: 'possivel' }
    const linhaBanco = { id: 'p', descricao: 'Parcela Exemplo', aplicar: true, campos: Object.fromEntries(['descricao', 'parcela', 'data', 'valor', 'categoria', 'grupo', 'reserva'].map(k => [k, { antes: 'a', depois: k === 'valor' ? 'b' : 'a' }])) }
    render(
      <div data-help-form="importarFatura">
        <DataCelula row={row} onChange={nada} />
        <FaturaCelula row={row} referencia="2026-11" opcoes={[{ value: '2026-11' }, { value: '2026-12' }]} onChange={nada} />
        <DescricaoCelula row={row} onChange={nada} />
        <CartoesDecisao perguntas={perguntasDeDecisao([row])} ctx={{}} onSim={nada} onNao={nada} />
        <ParcelasJaNoBanco linhas={[linhaBanco]} identicas={[]} aplicar={1} onToggle={nada} />
      </div>,
    )
    expect(auditar('importarFatura')).toEqual([])
    fireEvent.click(document.querySelector('button[data-help-id="revisaoFatura.data"]'))
    fireEvent.click(document.querySelector('button[data-help-id="revisaoFatura.fatura"]'))
    fireEvent.click(document.querySelector('button[data-help-id="revisaoFatura.descricao"]'))
    expect(document.querySelectorAll('label[data-help-id="revisaoFatura.data"]').length).toBe(2)
    expect(auditar('importarFatura')).toEqual([])
  })
  it('Já lançado: favorecido (outro) e escolha entre candidatos', () => {
    const tx = { id: 't', description: 'Compra Exemplo', date: '2026-11-01', amount: 10, payee: 'Favorecido Exemplo' }
    const sugerido = { nome: 'Loja Exemplo', aprendido: false }
    render(
      <div data-help-form="importarFatura">
        <JaLancadoStatus row={{ _id: 'r1', amount: 10, _jaLancado: { tx, sugerido, origem: 'regra' }, _favModo: 'outro' }} categories={[]} payees={['Favorecido Exemplo']} updateRow={nada} />
        <JaLancadoStatus row={{ _id: 'r2', amount: 10, _jaLancadoOpcoes: [tx] }} categories={[]} payees={[]} updateRow={nada} />
      </div>,
    )
    expect(auditar('importarFatura')).toEqual([])
  })
  it('Importar lançamentos — conta e arquivo', () => {
    render(<ImportarLancamentosPanel />)
    expect(auditar('importarLanc')).toEqual([])
    expect(document.querySelector('[data-help-id="importarLanc.arquivo"]')).toBeTruthy()
  })
})
