// @vitest-environment jsdom
// Pergunta da virada assistida ao entrar em Reservas: só com mês encerrado e pendente, só para quem
// pode editar, respeitando a opção de Configurações; "Agora não" não grava e a pergunta volta na
// próxima entrada; bloqueios da tela (dados, sincronização, conexão). Dados FICTÍCIOS.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
const api = vi.hoisted(() => ({ status: null, acao: null }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/db', async (orig) => ({
  ...(await orig()),
  fetchViradaReservaStatus: (...a) => api.status(...a),
  viradaReservaAcao: (...a) => api.acao(...a),
  fetchReserveFunctionTransactions: async () => ({ transactions: [] }),
}))
const { default: ReservasPanel } = await import('./ReservasPanel.jsx')

const PEND = [{ inicio: '2026-10-15', fim: '2026-11-14' }]
const STATUS = (o = {}) => ({ disponivel: true, perguntar: true, ultimoCorte: '2026-10-14', pendentes: PEND, podeDesfazer: false, recalculos: [], ...o })
const PREVIA = {
  hoje: '2026-11-20', mes: PEND[0], bloqueios: [],
  previa: {
    mes: { ...PEND[0], rotulo: '15/10/2026 a 14/11/2026' }, semConta: [], linhas: [],
    avisos: [{ codigo: 'negativa', texto: '1 função(ões) com saldo negativo no fim do mês.', itens: [{ functionId: 'f1', nome: 'Viagem', saldo: -10 }] }],
    contas: [{ accountId: 'acc_r', nome: 'Reserva', somaFuncoes: 100, saldoConta: 100, diferenca: 0, diferencaAnterior: 0, explicadoNoMes: 0, semExplicacao: 0, rendimentosMes: 1.5,
      funcoes: [{ functionId: 'f1', nome: 'Viagem', saldoInicial: 90, entradas: 20, saidas: 0, ajuste: 0, rendimentos: 1.5, saldoFinal: 111.5 }] }],
    totais: { somaFuncoes: 100, saldoContas: 100, rendimentosMes: 1.5 },
  },
}

const base = (o = {}) => {
  for (const k of Object.keys(app)) delete app[k]
  Object.assign(app, {
    profileAccounts: [], profileTransactions: [], categories: [], profileSchedules: [], scheduleReservaFuncoes: [],
    getFinancialPeriod: () => ({ start: new Date(2026, 9, 15), end: new Date(2026, 10, 14) }),
    getOccurrencesProjecao: () => [], reorderReserveFunctions: vi.fn(),
    reservePeriods: [], reserveAdjustments: [], reserveSnapshots: [],
    addReservePeriod: vi.fn(), addReserveAdjustment: vi.fn(), updateReserveAdjustment: vi.fn(), deleteReserveAdjustment: vi.fn(),
    recarregarHistoricoReservas: vi.fn(async () => {}), reserveHistoryLoaded: true,
    dbStatus: 'connected', syncing: false, filaPendentes: [],
    pode: () => true,
    reserveFunctions: [], addReserveFunction: vi.fn(), updateReserveFunction: vi.fn(), deleteReserveFunction: vi.fn(),
    ...o,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0))
  api.status = vi.fn(async () => STATUS())
  api.acao = vi.fn(async ({ acao }) => (acao === 'previa' ? PREVIA : { repetida: false, virada: { id: 'v1' }, resumo: { contas: [] }, criados: { snapshots: 1, periodos: 1 } }))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const pergunta = () => screen.queryByText('Deseja fazer a virada de saldo?')

describe('pergunta ao entrar em Reservas', () => {
  it('aparece com mês encerrado e pendente, listando os meses', async () => {
    base()
    render(<ReservasPanel />)
    await waitFor(() => expect(pergunta()).not.toBeNull())
    expect(api.status).toHaveBeenCalledWith('2026-11-20')
    expect(screen.getByTestId('virada-pendentes').textContent).toMatch('15/10/2026 a 14/11/2026')
    expect(screen.getByRole('button', { name: 'Ver prévia e continuar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeTruthy()
  })

  it('não aparece sem mês pendente (antes do dia de início ou depois da virada)', async () => {
    base()
    api.status = vi.fn(async () => STATUS({ pendentes: [] }))
    render(<ReservasPanel />)
    await waitFor(() => expect(api.status).toHaveBeenCalled())
    await act(async () => {})
    expect(pergunta()).toBeNull()
  })

  it('"Agora não" não grava nada e a pergunta volta na próxima entrada', async () => {
    base()
    const r = render(<ReservasPanel />)
    await waitFor(() => expect(pergunta()).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(pergunta()).toBeNull()
    expect(api.acao).not.toHaveBeenCalled()
    r.unmount()
    render(<ReservasPanel />)
    await waitFor(() => expect(pergunta()).not.toBeNull())
    expect(api.acao).not.toHaveBeenCalled()
  })

  it('opção desligada: não pergunta, mas o botão Virar Saldo continua abrindo a virada', async () => {
    base()
    api.status = vi.fn(async () => STATUS({ perguntar: false }))
    render(<ReservasPanel />)
    await waitFor(() => expect(api.status).toHaveBeenCalled())
    await act(async () => {})
    expect(pergunta()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resumo' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Virar Saldo/ })[0])
    await waitFor(() => expect(pergunta()).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy()
  })

  it('usuário sem permissão para a virada não vê a pergunta', async () => {
    base({ pode: (mod, acao) => !(mod === 'reservas' && acao === 'editar') })
    render(<ReservasPanel />)
    await waitFor(() => expect(api.status).toHaveBeenCalled())
    await act(async () => {})
    expect(pergunta()).toBeNull()
  })

  it('espera os dados carregarem antes de perguntar', async () => {
    base({ reserveHistoryLoaded: false })
    render(<ReservasPanel />)
    await act(async () => {})
    expect(api.status).not.toHaveBeenCalled()
    expect(pergunta()).toBeNull()
  })
})

describe('bloqueios da tela', () => {
  it('sincronização pendente bloqueia a prévia, com explicação', async () => {
    base({ filaPendentes: [{ id: 'x' }] })
    render(<ReservasPanel />)
    await waitFor(() => expect(pergunta()).not.toBeNull())
    expect(screen.getByTestId('virada-bloqueios').textContent).toMatch(/ainda não enviadas/)
    expect(screen.getByRole('button', { name: 'Ver prévia e continuar' }).disabled).toBe(true)
  })

  it('sem conexão: a pergunta não abre sozinha, e a virada manual mostra o bloqueio', async () => {
    base({ dbStatus: 'local' })
    render(<ReservasPanel />)
    await act(async () => {})
    expect(pergunta()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resumo' }))
    fireEvent.click(screen.getAllByRole('button', { name: /Virar Saldo/ })[0])
    await waitFor(() => expect(screen.getByTestId('virada-bloqueios').textContent).toMatch(/Sem conexão/))
  })
})

describe('prévia e confirmação', () => {
  it('mostra a prévia por conta e os avisos; confirmar grava uma vez (clique duplo seguro)', async () => {
    base()
    render(<ReservasPanel />)
    await waitFor(() => expect(pergunta()).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e continuar' }))
    await waitFor(() => expect(screen.getByTestId('virada-conta-acc_r')).toBeTruthy())
    expect(api.acao).toHaveBeenCalledWith({ acao: 'previa', fim: '2026-11-14', hoje: '2026-11-20' })
    expect(screen.getByTestId('virada-avisos').textContent).toMatch(/saldo negativo/)
    expect(screen.getByTestId('virada-conta-acc_r').textContent).toMatch(/Soma das funções/)
    const btn = screen.getByRole('button', { name: /Confirmar virada de 15\/10\/2026 a 14\/11\/2026/ })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(screen.getByText(/O Saldo das funções não mudou: apenas o período foi fechado/)).toBeTruthy())
    const confirmacoes = api.acao.mock.calls.filter(([b]) => b.acao === 'confirmar')
    expect(confirmacoes).toHaveLength(1)
    expect(confirmacoes[0][0].chave).toBeTruthy()
    expect(app.recarregarHistoricoReservas).toHaveBeenCalled()
  })
})
