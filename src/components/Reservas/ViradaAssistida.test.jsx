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

describe('pendência de recálculo', () => {
  it('mostra o aviso e "Refazer recálculo" chama o servidor; "Entendi" não dá baixa na pendência', async () => {
    base()
    api.status = vi.fn(async () => STATUS({ pendentes: [], recalculoPendente: true, recalculos: [
      { id: 'pend1', campo: 'recalculo_pendente', motivo: 'x' },
      { id: 'm1', campo: 'entradas', tabela: 'reserve_period_snapshots', data_corte: '2026-08-14', function_id: 'f1', antes: 0, depois: 40 },
    ] }))
    api.acao = vi.fn(async () => ({ ok: true, mudancas: 2 }))
    render(<ReservasPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Resumo' }))
    await waitFor(() => expect(screen.getByTestId('recalculo-pendente')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    await waitFor(() => expect(api.acao).toHaveBeenCalledWith({ acao: 'ciente', ids: ['m1'] }))
    fireEvent.click(screen.getByRole('button', { name: 'Refazer recálculo' }))
    await waitFor(() => expect(api.acao).toHaveBeenCalledWith({ acao: 'recalcular' }))
  })
})

describe('sequência de vários meses (o status recarrega entre um e outro)', () => {
  const TRES = [
    { inicio: '2026-07-15', fim: '2026-08-14' },
    { inicio: '2026-08-15', fim: '2026-09-14' },
    { inicio: '2026-09-15', fim: '2026-10-14' },
  ]
  it('fecha 1 de 3, 2 de 3, 3 de 3, na ordem, sem pular mês e com a mensagem do mês certo', async () => {
    base()
    let fechados = 0
    // Como o servidor: depois de cada virada o status deixa de listar o mês fechado.
    api.status = vi.fn(async () => STATUS({ ultimoCorte: fechados ? TRES[fechados - 1].fim : '2026-07-14', pendentes: TRES.slice(fechados) }))
    api.acao = vi.fn(async (b) => {
      if (b.acao === 'previa') return { ...PREVIA, mes: TRES.find(m => m.fim === b.fim) }
      const m = TRES.find(x => x.fim === b.fim)
      expect(m).toBe(TRES[fechados]) // o motor exige ordem: só o primeiro pendente
      fechados++
      return { repetida: false, virada: { id: `v${fechados}`, data_inicio: m.inicio, data_corte: m.fim }, resumo: { contas: [] } }
    })
    render(<ReservasPanel />)
    await waitFor(() => expect(pergunta()).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e continuar' }))

    const rotulos = ['15/07/2026 a 14/08/2026', '15/08/2026 a 14/09/2026', '15/09/2026 a 14/10/2026']
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(screen.getByText(`(${i + 1} de 3)`, { exact: false })).toBeTruthy())
      fireEvent.click(await screen.findByRole('button', { name: `Confirmar virada de ${rotulos[i]}` }))
      await waitFor(() => expect(screen.getByTestId('virada-resultado').textContent).toContain(`Mês ${rotulos[i]} fechado (${i + 1} de 3)`))
      expect(app.recarregarHistoricoReservas).toHaveBeenCalledTimes(i + 1)
      if (i < 2) fireEvent.click(screen.getByRole('button', { name: `Ver prévia de ${rotulos[i + 1]}` }))
    }
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeTruthy()
    expect(api.acao.mock.calls.filter(([b]) => b.acao === 'confirmar').map(([b]) => b.fim)).toEqual(['2026-08-14', '2026-09-14', '2026-10-14'])
  })

  it('"Parar aqui" depois do 1º mês: a próxima entrada oferece o mês seguinte, não pula', async () => {
    base()
    let fechados = 0
    api.status = vi.fn(async () => STATUS({ pendentes: TRES.slice(fechados) }))
    api.acao = vi.fn(async (b) => {
      if (b.acao === 'previa') return { ...PREVIA, mes: TRES.find(m => m.fim === b.fim) }
      fechados++
      return { virada: { id: 'v1', data_inicio: TRES[0].inicio, data_corte: TRES[0].fim }, resumo: { contas: [] } }
    })
    const r = render(<ReservasPanel />)
    await waitFor(() => expect(pergunta()).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e continuar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar virada de 15/07/2026 a 14/08/2026' }))
    await waitFor(() => expect(screen.getByTestId('virada-resultado').textContent).toContain('Mês 15/07/2026 a 14/08/2026 fechado'))
    expect(screen.getByRole('button', { name: 'Ver prévia de 15/08/2026 a 14/09/2026' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Parar aqui' }))
    r.unmount()
    render(<ReservasPanel />)
    await waitFor(() => expect(screen.getByTestId('virada-pendentes').textContent).toMatch(/^15\/08\/2026 a 14\/09\/2026/))
  })
})
