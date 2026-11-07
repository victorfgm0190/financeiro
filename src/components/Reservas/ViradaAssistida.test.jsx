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
  fetchReserveLedgerMonths: async () => ({ months: api.ledgerMonths || [] }),
  fetchReserveLedgerSummary: async () => ({ rows: api.ledger || [] }),
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
    await waitFor(() => expect(screen.getByText(/O período foi fechado\. O fechamento/)).toBeTruthy())
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

describe('Resumo e Histórico', () => {
  const CONTA = { id: 'acc_r', name: 'Reserva', apelido: 'Reserva', type: 'checking', isReserva: true, balance: 0 }
  const fns = [{ id: 'f_neg', name: 'Consórcio', accountId: 'acc_r', saldoInicial: 0, ordem: 0 }, { id: 'f_pos', name: 'Viagem', accountId: 'acc_r', saldoInicial: 0, ordem: 1 }]
  const periodos = [
    { id: 'p1', function_id: 'f_neg', data_inicio: '2026-10-15', saldo_inicial: -7583.04 },
    { id: 'p2', function_id: 'f_pos', data_inicio: '2026-10-15', saldo_inicial: 100 },
  ]

  it('valor negativo fica inteiro: sinal "−" tipográfico (não quebra antes do R$) e célula sem quebra de linha', async () => {
    base({ profileAccounts: [CONTA], accounts: [CONTA], reserveFunctions: fns, reservePeriods: periodos })
    api.status = vi.fn(async () => STATUS({ pendentes: [] }))
    render(<ReservasPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Resumo' }))
    const linha = screen.getAllByText('Consórcio').map(el => el.closest('tr')).find(Boolean)
    const celulas = [...linha.querySelectorAll('td')].filter(td => /R\$/.test(td.textContent))
    const negativas = celulas.filter(td => td.textContent.includes('7.583,04'))
    expect(negativas.length).toBeGreaterThan(0)
    for (const td of negativas) {
      expect(td.textContent).toContain('−R$')
      expect(td.textContent).not.toMatch(/-R\$/)
      expect(td.querySelector('.whitespace-nowrap') || td.className.includes('whitespace-nowrap')).toBeTruthy()
    }
  })

  it('Resumo no perfil: funções do perfil + "Sem vínculo" (com selo); Total = soma das exibidas', async () => {
    const perfis = [{ id: 'p1', name: 'PF', type: 'pf' }, { id: 'p2', name: 'PJ', type: 'pj' }]
    const c1 = { ...CONTA, id: 'acc_1', name: 'R1', apelido: 'R1', profileId: 'p1' }
    const c2 = { ...CONTA, id: 'acc_2', name: 'R2', apelido: 'R2', profileId: 'p2' }
    const c0 = { ...CONTA, id: 'acc_0', name: 'R0', apelido: 'R0', profileId: null }
    const fs = [
      { id: 'a', name: 'Função A', accountId: 'acc_1', saldoInicial: 0, ordem: 0 },
      { id: 'b', name: 'Função B', accountId: 'acc_2', saldoInicial: 0, ordem: 0 },
      { id: 's', name: 'Função S', accountId: 'acc_0', saldoInicial: 0, ordem: 0 },
    ]
    const per = [
      { id: 'pa', function_id: 'a', data_inicio: '2026-10-15', saldo_inicial: 100 },
      { id: 'pb', function_id: 'b', data_inicio: '2026-10-15', saldo_inicial: 1000 },
      { id: 'ps', function_id: 's', data_inicio: '2026-10-15', saldo_inicial: 10 },
    ]
    base({ profileAccounts: [c1], accounts: [c1, c2, c0], profiles: perfis, activeProfileId: 'p1', reserveFunctions: fs, reservePeriods: per })
    api.status = vi.fn(async () => STATUS({ pendentes: [] }))
    render(<ReservasPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Resumo' }))
    expect(screen.getAllByText('Função A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Função S').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Função B')).toHaveLength(0)
    expect(screen.getAllByText('Sem vínculo').length).toBeGreaterThan(0)
    const total = screen.getByText(/Total reservado:/).parentElement.textContent
    expect(total).toContain('110,00')
  })

  it('função "Sem vínculo": saldo, Dep/Res e projeção iguais em Tudo, Perfil A e Perfil B', async () => {
    const { computeOccurrences } = await import('../../lib/occurrences')
    const perfis = [{ id: 'p1', name: 'A', type: 'pf' }, { id: 'p2', name: 'B', type: 'pj' }]
    const c1 = { ...CONTA, id: 'acc_1', name: 'C1', apelido: 'C1', isReserva: false, profileId: 'p1' }
    const c2 = { ...CONTA, id: 'acc_2', name: 'C2', apelido: 'C2', isReserva: false, profileId: 'p2' }
    const c0 = { ...CONTA, id: 'acc_0', name: 'R0', apelido: 'R0', profileId: null }
    const contas = [c1, c2, c0]
    const fs = [{ id: 's', name: 'Função S', accountId: 'acc_0', saldoInicial: 0, ordem: 0 }]
    const per = [{ id: 'ps', function_id: 's', data_inicio: '2026-10-15', saldo_inicial: 10 }]
    const txs = [
      { id: 't1', type: 'transfer', accountId: 'acc_1', toAccountId: 'acc_0', amount: 100, date: '2026-11-01', reservaFuncaoId: 's' },
      { id: 't2', type: 'transfer', accountId: 'acc_2', toAccountId: 'acc_0', amount: 50, date: '2026-11-02', reservaFuncaoId: 's' },
    ]
    const scheds = [{ id: 'ag', description: 'Depósito B', transactionType: 'transfer', accountId: 'acc_2', toAccountId: 'acc_0', amount: 30, frequency: 'monthly', startDate: '2026-12-05', reservaFuncaoId: 's', registered: [], skipped: [] }]
    const linhas = {}
    for (const perfil of [null, 'p1', 'p2']) {
      const doPerfil = perfil ? contas.filter(a => a.profileId === perfil) : contas
      const ids = new Set(doPerfil.map(a => a.id))
      base({
        accounts: contas, profiles: perfis, activeProfileId: perfil, reserveFunctions: fs, reservePeriods: per,
        profileAccounts: doPerfil, transactions: txs, schedules: scheds,
        profileTransactions: txs.filter(t => ids.has(t.accountId) || ids.has(t.toAccountId)),
        profileSchedules: scheds.filter(s => ids.has(s.accountId) || ids.has(s.toAccountId)),
        getOccurrencesProjecao: (s, n = 12) => computeOccurrences(s, n),
        getNextOccurrences: (s, n = 12) => computeOccurrences(s, n), settings: {},
      })
      api.status = vi.fn(async () => STATUS({ pendentes: [] }))
      render(<ReservasPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Resumo' }))
      const resumo = screen.getAllByText('Função S').map(el => el.closest('tr')).find(Boolean).textContent
      const total = screen.getByText(/Total reservado:/).parentElement.textContent
      fireEvent.click(screen.getByRole('button', { name: 'Fluxo Futuro' }))
      const fluxo = screen.getAllByText('Função S').map(el => el.closest('tr')).find(Boolean).textContent.replace('Sem vínculo', '')
      linhas[perfil || 'tudo'] = { resumo, total, fluxo }
      cleanup()
    }
    expect(linhas.tudo.total).toContain('160,00') // 10 + 100 (de A) + 50 (de B)
    expect(linhas.tudo.fluxo).toContain('190,00') // + 30 agendado em Dez/26 (conta do perfil B)
    expect(linhas.p1).toEqual(linhas.tudo)
    expect(linhas.p2).toEqual(linhas.tudo)
  })

  it('Histórico mostra 15/07/2026 → 14/08/2026 mesmo com função sem período anterior', async () => {
    const snaps = [
      { id: 's1', function_id: 'f_pos', function_name: 'Viagem', data_inicio: '2026-07-15', data_fim: '2026-08-14', saldo_inicial: 1, entradas: 0, saidas: 0, ajuste: 0, rendimentos: 0, saldo: 1, saldo_atualizado: 1 },
      { id: 's2', function_id: 'f_neg', function_name: 'Consórcio', data_inicio: '0001-01-01', data_fim: '2026-08-14', saldo_inicial: 0, entradas: 0, saidas: 0, ajuste: 0, rendimentos: 0, saldo: 0, saldo_atualizado: 0 },
    ]
    base({ reserveSnapshots: snaps })
    api.status = vi.fn(async () => STATUS({ pendentes: [] }))
    render(<ReservasPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    const opcao = screen.getByRole('option')
    expect(opcao.textContent).toBe('15/07/2026 → 14/08/2026')
  })
})

describe('Histórico e Razão Diário no filtro de perfil', () => {
  const CONTA = { type: 'checking', isReserva: true, balance: 0 }
  const perfis = [{ id: 'pA', name: 'A', type: 'pf' }, { id: 'pB', name: 'B', type: 'pj' }]
  const contas = [
    { ...CONTA, id: 'ca', name: 'RA', apelido: 'RA', profileId: 'pA' },
    { ...CONTA, id: 'cb', name: 'RB', apelido: 'RB', profileId: 'pB' },
    { ...CONTA, id: 'cs', name: 'RS', apelido: 'RS', profileId: null },
  ]
  const fs = [
    { id: 'a', name: 'Função A', accountId: 'ca', saldoInicial: 0, ordem: 0 },
    { id: 'b', name: 'Função B', accountId: 'cb', saldoInicial: 0, ordem: 1 },
    { id: 's', name: 'Função S', accountId: 'cs', saldoInicial: 0, ordem: 2 },
  ]
  // 'z' = função já excluída (fechamento e razão órfãos): só em "Tudo".
  const snap = (id, fid, nome, saldo) => ({ id, function_id: fid, function_name: nome, data_inicio: '2026-09-15', data_fim: '2026-10-14', saldo_inicial: saldo, entradas: 0, saidas: 0, ajuste: 0, rendimentos: 0, saldo, saldo_atualizado: saldo })
  const snaps = [snap('h1', 'a', 'Função A', 100), snap('h2', 'b', 'Função B', 1000), snap('h3', 's', 'Função S', 10), snap('h4', 'z', 'Função Z', 7)]
  const lin = (fid, nome, v) => ({ function_id: fid, function_name: nome, snapshot_date: '2026-11-01', entrada_dia: v, saida_dia: 0, ajuste_dia: 0, saldo_acumulado: v, saldo_atualizado: v, divergencia: 0 })
  const ledger = [lin('a', 'Função A', 100), lin('b', 'Função B', 1000), lin('s', 'Função S', 10), lin('z', 'Função Z', 7)]

  const abrir = async (perfil, aba) => {
    base({ accounts: contas, profileAccounts: perfil ? contas.filter(c => c.profileId === perfil) : contas, profiles: perfis, activeProfileId: perfil, reserveFunctions: fs, reserveSnapshots: snaps })
    api.status = vi.fn(async () => STATUS({ pendentes: [] }))
    api.ledger = ledger
    render(<ReservasPanel />)
    fireEvent.click(screen.getByRole('button', { name: aba }))
  }
  const linhaDe = (nome) => screen.queryAllByText(nome).map(el => el.closest('tr')).find(Boolean)
  const nomesNaTabela = () => ['Função A', 'Função B', 'Função S', 'Função Z'].filter(linhaDe)

  it('Histórico: cada perfil vê as suas e a "Sem vínculo" (com selo, mesmo valor); excluída só em Tudo; Total = soma da tela', async () => {
    const res = {}
    for (const perfil of [null, 'pA', 'pB']) {
      await abrir(perfil, 'Histórico')
      res[perfil || 'tudo'] = {
        nomes: nomesNaTabela(),
        s: linhaDe('Função S').textContent.replace('Sem vínculo', ''),
        selo: linhaDe('Função S').textContent.includes('Sem vínculo'),
        total: linhaDe('Total').textContent,
      }
      cleanup()
    }
    expect(res.tudo.nomes).toEqual(['Função A', 'Função B', 'Função S', 'Função Z'])
    expect(res.pA.nomes).toEqual(['Função A', 'Função S'])
    expect(res.pB.nomes).toEqual(['Função B', 'Função S'])
    expect(res.pA.s).toBe(res.tudo.s)
    expect(res.pB.s).toBe(res.tudo.s)
    expect(res.tudo.selo && res.pA.selo && res.pB.selo).toBe(true)
    expect(res.tudo.total).toContain('1.117,00')
    expect(res.pA.total).toContain('110,00')
    expect(res.pB.total).toContain('1.010,00')
  })

  it('Razão Diário: linhas e chips só das funções do perfil; "Sem vínculo" igual em todos; excluída só em Tudo', async () => {
    const res = {}
    for (const perfil of [null, 'pA', 'pB']) {
      await abrir(perfil, 'Razão Diário')
      await waitFor(() => expect(linhaDe('Função S')).toBeTruthy())
      res[perfil || 'tudo'] = {
        nomes: nomesNaTabela(),
        s: linhaDe('Função S').textContent.replace('Sem vínculo', ''),
        chips: screen.getAllByRole('button').map(b => b.textContent).filter(t => t.startsWith('Função')),
      }
      cleanup()
    }
    expect(res.tudo.nomes).toEqual(['Função A', 'Função B', 'Função S', 'Função Z'])
    expect(res.pA.nomes).toEqual(['Função A', 'Função S'])
    expect(res.pB.nomes).toEqual(['Função B', 'Função S'])
    expect(res.pA.s).toBe(res.tudo.s)
    expect(res.pB.s).toBe(res.tudo.s)
    expect(res.pA.chips).toEqual(['Função A', 'Função SSem vínculo'])
    expect(res.pB.chips).toEqual(['Função B', 'Função SSem vínculo'])
  })
})
