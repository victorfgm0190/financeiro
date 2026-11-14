// @vitest-environment jsdom
// Extrato da função (Reservas › Fluxo Futuro). REGRA DE OURO: o saldo no fim de cada mês do extrato
// é IDÊNTICO ao da grade do Fluxo Futuro — por função e no TOTAL GERAL, no período da grade e em
// outros períodos. Dados FICTÍCIOS.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/db', async (orig) => ({
  ...(await orig()),
  fetchViradaReservaStatus: async () => ({ disponivel: true, perguntar: false, pendentes: [], podeDesfazer: false, recalculos: [] }),
  viradaReservaAcao: async () => ({}),
  fetchReserveFunctionTransactions: async () => ({ transactions: [] }),
  fetchReserveLedgerMonths: async () => ({ months: [] }),
  fetchReserveLedgerSummary: async () => ({ rows: [] }),
}))
vi.mock('../../lib/boasVindasApi', async (orig) => ({
  ...(await orig()),
  carregarBoasVindas: async () => null,
  assinarBoasVindas: () => () => {},
  estadoBoasVindas: () => null,
  definirPeriodoFluxo: vi.fn(),
}))
const { default: ReservasPanel } = await import('./ReservasPanel.jsx')
const { default: ExtratoReservaModal } = await import('./ExtratoReservaModal.jsx')
const { useDadosExtratoReserva } = await import('./dadosExtratoReserva.js')

// Como o menu Relatórios abre o "Fluxo de Caixa da Reserva": o MESMO componente, em página.
function PeloMenu() {
  const d = useDadosExtratoReserva()
  return (
    <ExtratoReservaModal pagina seletorFuncao funcao={null} funcoes={d.funcoes} saldoInicialDe={d.saldoInicialDe}
      previstosDoPeriodo={d.previstosDoPeriodo} realizadosDe={d.realizadosDe} periodoInicial={d.periodoInicial} atual={d.atual} hoje={d.hoje} />
  )
}

// Ocorrências: mensal a partir de startDate (n por agendamento); 'once' = só a data.
const somarMes = (d, k) => {
  const [y, m, dd] = d.split('-').map(Number)
  const x = new Date(y, m - 1 + k, dd)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const ocorrencias = (s, n) => (s.frequency === 'once' ? [s.startDate] : Array.from({ length: n }, (_, k) => somarMes(s.startDate, k)))

const CONTAS = [
  { id: 'acc_c', name: 'Corrente', type: 'checking' },
  { id: 'acc_r', name: 'Reserva', apelido: 'RES', type: 'checking', isReserva: true },
]
const FUNCOES = [
  { id: 'f1', name: 'IPVA', accountId: 'acc_r', saldoInicial: 0, order: 1 },
  { id: 'f2', name: 'Seguro Residencial', accountId: 'acc_r', saldoInicial: 0, order: 2 },
]
const LANCAMENTOS = [
  { id: 't1', type: 'transfer', accountId: 'acc_c', toAccountId: 'acc_r', amount: 200, date: '2026-10-20', description: 'Depósito IPVA', reservaFuncaoId: 'f1' },
  { id: 't2', type: 'transfer', accountId: 'acc_r', toAccountId: 'acc_c', amount: 50.1, date: '2026-11-05', description: 'Resgate IPVA', reservaFuncaoId: 'f1' },
  { id: 't3', type: 'transfer', accountId: 'acc_c', toAccountId: 'acc_r', amount: 40, date: '2026-10-01', description: 'Antes do período', reservaFuncaoId: 'f2' },
]
const AGENDAMENTOS = [
  { id: 's1', transactionType: 'transfer', accountId: 'acc_c', toAccountId: 'acc_r', amount: 100, startDate: '2026-11-20', frequency: 'monthly', description: 'Provisão IPVA', reservaFuncaoId: 'f1' },
  { id: 's2', transactionType: 'transfer', accountId: 'acc_r', toAccountId: 'acc_c', amount: 1200, startDate: '2027-01-10', frequency: 'once', description: 'Pagamento IPVA', reservaFuncaoId: 'f1' },
  { id: 's3', transactionType: 'transfer', accountId: 'acc_c', toAccountId: 'acc_r', amount: 33.33, startDate: '2026-11-25', frequency: 'monthly', description: 'Provisão seguro', reservaFuncaoId: 'f2' },
  { id: 's4', transactionType: 'expense', accountId: 'acc_c', amount: 80.47, startDate: '2026-12-15', frequency: 'monthly', description: 'Seguro', isProvisao: true, reservaFuncaoId: 'f2' },
]

const base = () => {
  for (const k of Object.keys(app)) delete app[k]
  Object.assign(app, {
    profileAccounts: CONTAS, accounts: CONTAS, profileTransactions: LANCAMENTOS, transactions: LANCAMENTOS,
    categories: [], profileSchedules: AGENDAMENTOS, schedules: AGENDAMENTOS, scheduleReservaFuncoes: [],
    profiles: [], activeProfileId: null,
    getFinancialPeriod: () => ({ start: new Date(2026, 9, 15), end: new Date(2026, 10, 14) }),
    getOccurrencesProjecao: ocorrencias, reorderReserveFunctions: vi.fn(),
    reservePeriods: [
      { id: 'p1', function_id: 'f1', data_inicio: '2026-10-15', saldo_inicial: 500 },
      { id: 'p2', function_id: 'f2', data_inicio: '2026-10-15', saldo_inicial: 120.5 },
    ],
    reserveAdjustments: [
      { id: 'a1', function_id: 'f2', data: '2026-11-01', valor: 3.33, lancamento_id: 'rend1', observacao: 'Rendimento out' },
      // IPVA: dois rendimentos, o depósito de 20/10 no meio, mais dois → dois grupos.
      { id: 'a2', function_id: 'f1', data: '2026-10-16', valor: 1, lancamento_id: 'rend2', observacao: 'Rendimento' },
      { id: 'a3', function_id: 'f1', data: '2026-10-18', valor: 0.5, lancamento_id: 'rend3', observacao: 'Rendimento' },
      { id: 'a4', function_id: 'f1', data: '2026-11-02', valor: 0.25, lancamento_id: 'rend4', observacao: 'Rendimento' },
      { id: 'a5', function_id: 'f1', data: '2026-11-03', valor: 0.75, lancamento_id: 'rend5', observacao: 'Rendimento' },
    ],
    reserveSnapshots: [],
    addReservePeriod: vi.fn(), addReserveAdjustment: vi.fn(), updateReserveAdjustment: vi.fn(), deleteReserveAdjustment: vi.fn(),
    recarregarHistoricoReservas: vi.fn(async () => {}), reserveHistoryLoaded: true,
    dbStatus: 'connected', syncing: false, filaPendentes: [], pode: () => true,
    reserveFunctions: FUNCOES, addReserveFunction: vi.fn(), updateReserveFunction: vi.fn(), deleteReserveFunction: vi.fn(),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0))
  base()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const abrirFluxo = async () => {
  render(<ReservasPanel />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Fluxo Futuro' }))
}
const texto = (el) => el.textContent.trim()
const subtotais = () => {
  const dlg = screen.getByTestId('extrato-reserva')
  return Object.fromEntries(within(dlg).getAllByTestId('extrato-subtotal').map(tr => [tr.dataset.chave, texto(within(tr).getByTestId('extrato-subtotal-saldo'))]))
}
// Grade: período padrão Out/26–Set/27, janela ancorada em Out (índice 0 = saldo de hoje).
const MESES_GRADE = 12
const gradeDe = (id) => Array.from({ length: MESES_GRADE }, (_, mi) => texto(screen.getByTestId(id === 'total' ? `fluxo-saldo-total-${mi}` : `fluxo-saldo-${id}-${mi}`)))
const chaveDoMes = (mi) => (mi === 0 ? 'hoje' : String(mi))
const fechar = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar' }))

describe('Extrato da função — os números batem com a grade', () => {
  it.each([['f1', 'IPVA'], ['f2', 'Seguro Residencial']])('função %s: saldo de cada fim de mês = grade', async (id, nome) => {
    await abrirFluxo()
    const grade = gradeDe(id)
    fireEvent.click(screen.getAllByRole('button', { name: `Fluxo de Caixa da Reserva: ${nome}` })[0])
    const sub = subtotais()
    expect(Object.keys(sub)).toHaveLength(MESES_GRADE)
    grade.forEach((v, mi) => expect(sub[chaveDoMes(mi)], `mês ${mi}`).toBe(v))
    expect(texto(screen.getByTestId('extrato-saldo-final'))).toBe(grade[MESES_GRADE - 1])
  })

  it('TOTAL GERAL: soma de todas as funções, coluna "Função" e saldo = rodapé da grade', async () => {
    await abrirFluxo()
    const grade = gradeDe('total')
    fireEvent.click(screen.getAllByRole('button', { name: 'Fluxo de Caixa da Reserva: TOTAL GERAL' })[0])
    const sub = subtotais()
    grade.forEach((v, mi) => expect(sub[chaveDoMes(mi)], `mês ${mi}`).toBe(v.replace('—', '0,00')))
    const tabela = within(screen.getByTestId('extrato-reserva')).getAllByRole('table')[0]
    expect(within(tabela).getByRole('columnheader', { name: 'Função' })).toBeTruthy()
  })

  it('realizados desde o início do período e previstos marcados; saldo inicial e negativo', async () => {
    await abrirFluxo()
    fireEvent.click(screen.getAllByRole('button', { name: 'Fluxo de Caixa da Reserva: IPVA' })[0])
    const dlg = screen.getByTestId('extrato-reserva')
    // Saldo inicial do período da reserva (15/10): 500.
    expect(texto(within(dlg).getByTestId('extrato-saldo-inicial'))).toMatch('500,00')
    expect(within(dlg).getAllByText('Depósito IPVA').length).toBeGreaterThan(0)
    expect(within(dlg).getAllByText('Previsto').length).toBeGreaterThan(0)
    // 500 + 200 − 50,10 + 100 (20/11) + 100 (20/12) − 1.200 (10/01) < 0
    expect(texto(screen.getByTestId('extrato-negativo'))).toBe('Fica negativo em 10/01')
  })

  it('outros períodos (atalhos e "De" mais à frente) seguem iguais à grade', async () => {
    await abrirFluxo()
    const grade = gradeDe('f2')
    fireEvent.click(screen.getAllByRole('button', { name: 'Fluxo de Caixa da Reserva: Seguro Residencial' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Próximos 3 meses' }))
    let sub = subtotais()
    expect(Object.keys(sub).sort()).toEqual(['1', '2', 'hoje'])
    ;[0, 1, 2].forEach(mi => expect(sub[chaveDoMes(mi)]).toBe(grade[mi]))
    // Jan/27–Mar/27 (índices 3 a 5): saldo inicial = fim de Dez/26 na grade, sem realizados.
    fireEvent.change(screen.getByLabelText('Mês inicial'), { target: { value: '2027-01' } })
    fireEvent.change(screen.getByLabelText('Mês final'), { target: { value: '2027-03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    sub = subtotais()
    expect(Object.keys(sub).sort()).toEqual(['3', '4', '5'])
    ;[3, 4, 5].forEach(mi => expect(sub[String(mi)]).toBe(grade[mi]))
    expect(texto(screen.getByTestId('extrato-saldo-inicial'))).toBe(grade[2])
    fechar()
    expect(screen.queryByTestId('extrato-reserva')).toBeNull()
  })

  it('Agrupar rendimentos: ligada por padrão, quebra no depósito, e os números não mudam ao desligar', async () => {
    await abrirFluxo()
    const grade = gradeDe('f1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Fluxo de Caixa da Reserva: IPVA' })[0])
    const dlg = screen.getByTestId('extrato-reserva')
    const chave = within(dlg).getByRole('switch', { name: 'Agrupar rendimentos' })
    expect(chave.checked).toBe(true)
    expect(within(dlg).getAllByText('Rendimentos de 16/10 a 18/10').length).toBeGreaterThan(0)
    expect(within(dlg).getAllByText('Rendimentos de 02/11 a 03/11').length).toBeGreaterThan(0)
    const ligada = { sub: subtotais(), fim: texto(screen.getByTestId('extrato-saldo-final')), ini: texto(screen.getByTestId('extrato-saldo-inicial')) }
    grade.forEach((v, mi) => expect(ligada.sub[chaveDoMes(mi)]).toBe(v))
    fireEvent.click(chave)
    expect(within(dlg).queryAllByText(/^Rendimentos de /)).toHaveLength(0)
    expect(subtotais()).toEqual(ligada.sub)
    expect(texto(screen.getByTestId('extrato-saldo-final'))).toBe(ligada.fim)
    expect(texto(screen.getByTestId('extrato-saldo-inicial'))).toBe(ligada.ini)
  })

  it('clicar na célula do mês continua abrindo o detalhamento de antes', async () => {
    await abrirFluxo()
    fireEvent.click(screen.getAllByTitle('Ver os agendamentos que compõem este valor')[0])
    expect(screen.getByText(/Entradas previstas — /)).toBeTruthy()
    expect(screen.queryByTestId('extrato-reserva')).toBeNull()
  })

  it('menu Relatórios (Fluxo de Caixa da Reserva): mesmos valores de Reservas › Fluxo Futuro, por função e em "Todas"', async () => {
    await abrirFluxo()
    const porReservas = {}
    for (const [id, nome] of [['f1', 'IPVA'], ['f2', 'Seguro Residencial'], ['total', 'TOTAL GERAL']]) {
      fireEvent.click(screen.getAllByRole('button', { name: `Fluxo de Caixa da Reserva: ${nome}` })[0])
      porReservas[id] = { sub: subtotais(), fim: texto(screen.getByTestId('extrato-saldo-final')) }
      fechar()
    }
    cleanup()
    render(<PeloMenu />)
    const seletor = screen.getByLabelText('Função de reserva')
    expect(seletor.value).toBe('')
    expect(subtotais()).toEqual(porReservas.total.sub)
    expect(screen.getByTestId('extrato-por-funcao').textContent).toMatch('IPVA')
    for (const id of ['f1', 'f2']) {
      fireEvent.change(seletor, { target: { value: id } })
      expect(subtotais()).toEqual(porReservas[id].sub)
      expect(texto(screen.getByTestId('extrato-saldo-final'))).toBe(porReservas[id].fim)
    }
  })
})
