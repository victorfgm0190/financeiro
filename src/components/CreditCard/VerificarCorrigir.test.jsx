// @vitest-environment jsdom
// "Verificar e corrigir" (tela do cartão): prévia por seção, só aplica o que for marcado e confirmado,
// com histórico; controle gerencial desligado só mostra o não gerencial; aviso da fatura e menu "Mais"
// só para administrador. Dados FICTÍCIOS.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
const sessao = vi.hoisted(() => ({ nivel: 'admin' }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/api', async (orig) => ({ ...(await orig()), getSessao: () => sessao }))
const { default: VerificarCorrigirModal } = await import('./VerificarCorrigirModal.jsx')
const { default: CreditCardPanel } = await import('./CreditCardPanel.jsx')

const CARD = { id: 'card', name: 'Cartão', apelido: 'Card', type: 'credit', closingDay: 13, dueDay: 20, creditLimit: 5000, profileId: 'p1', active: true }
const CC = { id: 'cc', name: 'Conta', type: 'checking', contaCorrentePrincipal: true, profileId: 'p1', balance: 0 }
const GER = { id: 'ger', name: 'Ger. Card', type: 'gerencial', grupoGerencial: 'grp_1', balance: 100 }
const g = (o) => ({ type: 'expense', accountId: 'card', accountType: 'credit', reconciled: false, ...o })
const TXS = [
  // a + b: gasto do grupo G gravado sem o tipo da conta (sem etapa A)
  g({ id: 'vivo', accountType: null, grupoGerencial: 'grp_1', date: '2026-10-27', amount: 216, faturaMonthYear: '2026-11', description: 'VIVO' }),
  // d: duplicata gravada em 10/2024
  g({ id: 'amz_ok', date: '2026-09-15', dateCartao: '2026-09-15', amount: 47.4, faturaMonthYear: '2026-10', description: 'Amazon Br *Amazon Br' }),
  g({ id: 'amz_2024', date: '2026-09-15', dateCartao: '2026-09-15', amount: 47.4, faturaMonthYear: '2024-10', description: 'Amazon Br *Amazon Br' }),
  // g: fatura antiga sem pagamento, antes da última paga (10/2026)
  g({ id: 'antiga', date: '2026-03-10', amount: 26.36, faturaMonthYear: '2026-03', description: 'MP *OUTLET 01/10' }),
  { id: 'pg10', type: 'credit_payment', accountId: 'card', amount: 47.4, date: '2026-10-20', faturaMonthYear: '2026-10' },
]
const base = (o = {}) => {
  for (const k of Object.keys(app)) delete app[k]
  Object.assign(app, {
    profileTransactions: TXS, transactions: TXS, profileAccounts: [CC, CARD, GER], accounts: [CC, CARD, GER],
    profileSchedules: [], schedules: [], scheduleReservaFuncoes: [], categories: [], rateiosByLancamento: new Map(),
    gerencialGroups: [{ id: 'grp_1', number: 1, alias: 'G', name: 'Gerencial' }, { id: 'grp_D', number: 'D', alias: 'D', name: 'Despesa' }],
    settings: { faturasFechadas: {} }, pode: () => true, getOccurrencesProjecao: () => [],
    revisarMovimentosFatura: vi.fn(async () => ({ acoes: [], resumo: { total: 0 } })),
    recalcularAgendamentosFatura: vi.fn(), reconciliarGerencial: vi.fn(async () => ({})), ensureGerencialState: vi.fn(),
    updateTransaction: vi.fn(), deleteTransaction: vi.fn(), fecharFatura: vi.fn(), executarProvisoesGerenciais: vi.fn(), abrirFatura: vi.fn(), registrarEdicao: vi.fn(async () => ({})),
    isFaturaFechada: () => false, creditUsage: () => 0, addTransaction: vi.fn(), setReconciled: vi.fn(),
    ...o,
  })
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0))
  sessao.nivel = 'admin'
  base()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const abrir = async (props = {}) => {
  render(<VerificarCorrigirModal card={CARD} billKey="2026-11" onClose={vi.fn()} {...props} />)
  await act(async () => {})
}
const marcar = (nome) => fireEvent.click(screen.getByRole('checkbox', { name: nome }))

describe('Verificar e corrigir — prévia e aplicação', () => {
  it('mostra as seções com o que está diferente (a, b, d, e, g) e nada muda sem confirmar', async () => {
    await abrir()
    for (const s of ['a', 'b', 'd', 'e', 'g']) expect(screen.getByTestId(`secao-${s}`)).toBeTruthy()
    expect(within(screen.getByTestId('secao-b')).getByText(/216,00 sem etapa A/)).toBeTruthy()
    expect(within(screen.getByTestId('secao-d')).getByText(/Excluir duplicata/)).toBeTruthy()
    expect(within(screen.getByTestId('secao-g')).getByText(/Fechar a fatura 03\/2026/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' }).at(-1))
    expect(app.updateTransaction).not.toHaveBeenCalled()
    expect(app.deleteTransaction).not.toHaveBeenCalled()
    expect(app.fecharFatura).not.toHaveBeenCalled()
  })

  it('aplica só o marcado, depois de confirmar, com histórico e o resultado', async () => {
    await abrir()
    fireEvent.click(within(screen.getByTestId('secao-a')).getByRole('checkbox', { name: 'VIVO' })) // (a)
    fireEvent.click(within(screen.getByTestId('secao-d')).getAllByRole('checkbox')[0]) // (d)
    marcar('Fechar a fatura 03/2026')               // (g)
    fireEvent.click(screen.getByRole('button', { name: /Corrigir selecionados \(3\)/ }))
    expect(screen.getByTestId('verificar-confirmar')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar e aplicar/ })) })
    expect(app.registrarEdicao).toHaveBeenCalledTimes(1)
    const hist = app.registrarEdicao.mock.calls[0][0].historico
    expect(hist.some(h => h.entidade_id === 'vivo' && h.campo === 'accountType' && /sem tipo de conta/.test(h.motivo))).toBe(true)
    expect(app.updateTransaction).toHaveBeenCalledWith('vivo', { accountType: 'credit' })
    expect(app.ensureGerencialState).toHaveBeenCalledWith('vivo')        // a etapa A que faltava
    expect(app.recalcularAgendamentosFatura).toHaveBeenCalledWith('card', '2026', '11')
    expect(app.deleteTransaction).toHaveBeenCalledWith('amz_2024')
    expect(app.deleteTransaction).not.toHaveBeenCalledWith('amz_ok')
    expect(app.fecharFatura).toHaveBeenCalledWith('card', '2026-03')
    expect(app.reconciliarGerencial).not.toHaveBeenCalled()               // (e) não marcado: saldo não é regravado
    expect(screen.getByTestId('verificar-resultado').textContent).toMatch('3 itens corrigidos')
  })

  it('(e) saldo da conta Ger.: só regrava quando marcado', async () => {
    await abrir()
    expect(within(screen.getByTestId('secao-e')).getByText(/gravado R\$\s*100,00 → pelas transferências R\$\s*0,00/)).toBeTruthy()
    fireEvent.click(within(screen.getByTestId('secao-e')).getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: /Corrigir selecionados/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar e aplicar/ })) })
    expect(app.reconciliarGerencial).toHaveBeenCalledWith('card', ['2026-11'])
  })

  it('(b) recálculo do motor da fatura e (c)/(f) aparecem com o que o motor mudaria', async () => {
    base({
      revisarMovimentosFatura: vi.fn(async () => ({ acoes: [{ tipo: 'ATUALIZAR_RESGATE', grupo: 'Reserva', valor_anterior: 100, valor_novo: 90 }], resumo: { total: 1 } })),
      profileSchedules: [{ id: 'pag12', tipo: 'pagamento_fatura', cardId: 'card', faturaMesAno: '2026-12', amount: 20, registered: [], skipped: [], description: 'Pagamento Fatura Card 12/2026' }],
      profileTransactions: [...TXS, { id: 'fant', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 30, date: '2026-10-01', description: 'Ajuste solto' }],
    })
    await abrir()
    expect(within(screen.getByTestId('secao-b')).getByText(/Recalcular a fatura 11\/2026 pelo motor \(1 mudança\)/)).toBeTruthy()
    expect(within(screen.getByTestId('secao-c')).getByText(/Ajuste solto/)).toBeTruthy()
    expect(within(screen.getByTestId('secao-f')).getByText(/Pagamento Fatura Card 12\/2026/)).toBeTruthy()
    marcar('Excluir lançamento "fantasma": Ajuste solto')
    marcar('Remover: Pagamento Fatura Card 12/2026')
    fireEvent.click(screen.getByRole('button', { name: /Corrigir selecionados/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar e aplicar/ })) })
    expect(app.deleteTransaction).toHaveBeenCalledWith('fant')
    expect(app.recalcularAgendamentosFatura).toHaveBeenCalledWith('card', '2026', '12')
  })

  it('(b) parcela 2..N devida sem etapa A: corrigida como no Executar Gerenciais; parcela de fatura futura só informa', async () => {
    base({ profileTransactions: [
      g({ id: 'p5', grupoGerencial: 'grp_1', date: '2026-10-15', amount: 31.49, faturaMonthYear: '2026-11', installmentNum: 5, installmentTotal: 7, description: 'Htm Bruna 5/7' }),
      g({ id: 'p6', grupoGerencial: 'grp_1', date: '2027-01-15', amount: 31.49, faturaMonthYear: '2027-02', installmentNum: 7, installmentTotal: 7, description: 'Htm Bruna 7/7' }),
    ] })
    render(<VerificarCorrigirModal card={CARD} billKey="2026-11" onClose={vi.fn()} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('checkbox', { name: 'Verificar todas as faturas deste cartão' }))
    await act(async () => {})
    expect(within(screen.getByTestId('secao-b')).queryByText('Htm Bruna 7/7')).toBeNull()
    expect(screen.getByTestId('b-aguardando').textContent).toMatch(/1 parcela de fatura futura aguardando/)
    marcar('Htm Bruna 5/7')
    fireEvent.click(screen.getByRole('button', { name: /Corrigir selecionados/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Confirmar e aplicar/ })) })
    expect(app.executarProvisoesGerenciais).toHaveBeenCalledWith(['p5'])
    expect(app.ensureGerencialState).not.toHaveBeenCalled()
  })

  it('controle gerencial desligado: só as seções a, d e g', async () => {
    base({ settings: { faturasFechadas: {}, controleGerencial: false } })
    await abrir()
    expect(screen.getByTestId('secao-a')).toBeTruthy()
    expect(screen.getByTestId('secao-d')).toBeTruthy()
    expect(screen.getByTestId('secao-g')).toBeTruthy()
    for (const s of ['b', 'c', 'e', 'f']) expect(screen.queryByTestId(`secao-${s}`)).toBeNull()
    expect(app.revisarMovimentosFatura).not.toHaveBeenCalled()
  })
})

describe('tela do cartão: aviso e menu "Mais"', () => {
  it('administrador: os três botões antigos sumiram; o aviso mostra a pendência e abre a seção certa', async () => {
    render(<CreditCardPanel />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /^Atualizar$/ })).toBeNull()
    expect(screen.queryByText(/Revisar Movimentos Automáticos/)).toBeNull()
    expect(screen.queryByText(/Reconciliar Gerenciais/)).toBeNull()
    const aviso = screen.getByTestId('aviso-verificar')
    expect(aviso.textContent).toMatch(/216,00 sem etapa A/)
    fireEvent.click(within(aviso).getByRole('button', { name: 'Verificar e corrigir' }))
    await act(async () => {})
    expect(screen.getByTestId('secao-a').className).toMatch('border-primary')
    cleanup()
    render(<CreditCardPanel />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /Mais/ }))
    expect(screen.getByRole('menuitem', { name: /Verificar e corrigir/ })).toBeTruthy()
  })

  it('faixas: erro (atenção) e tarefa do mês (neutra) juntas; "Executar agora" abre a seção B com as parcelas marcadas', async () => {
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0)) // 15/11: mês financeiro começa dia 15 → a 12/2026 entra no ciclo
    const parcela = g({ id: 'dez2', grupoGerencial: 'grp_1', date: '2026-11-15', amount: 49.37, faturaMonthYear: '2026-12', installmentNum: 2, installmentTotal: 3, description: 'Amazon 2/3' })
    base({ settings: { faturasFechadas: {}, financialMonthStartDay: 15, financialMonthMode: 'custom' }, profileTransactions: [...TXS, parcela], transactions: [...TXS, parcela] })
    render(<CreditCardPanel />)
    await act(async () => {})
    expect(screen.getByTestId('aviso-verificar').textContent).toMatch(/216,00 sem etapa A/)
    const mes = screen.getByTestId('aviso-mes')
    expect(mes.textContent).toMatch(/1 parcela da fatura 12\/2026 pronta para a etapa A \(R\$\s*49,37\)/)
    fireEvent.click(within(mes).getByRole('button', { name: 'Executar agora' }))
    await act(async () => {})
    expect(screen.getByTestId('b-grupo-mes')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Amazon 2/3' }).checked).toBe(true)
  })

  it('quem não é administrador não vê o menu nem o aviso', async () => {
    sessao.nivel = 'operador'
    render(<CreditCardPanel />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /Mais/ })).toBeNull()
    expect(screen.queryByTestId('aviso-verificar')).toBeNull()
  })
})
