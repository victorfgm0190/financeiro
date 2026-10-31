// @vitest-environment jsdom
// Cenário 8 (pendências 31/10): boleto com "Contrato nº 12345" e contrato cadastrado com esse nº →
// a prévia oferece "Vincular ao contrato X"; o nº vai no campo próprio, não na descrição/observação.
// Item 9: baixa sugerida como CARTÃO na prévia (caixa de marcar) e dentro do "Confirmar tudo".
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
const ia = vi.hoisted(() => ({ apelidos: [], aprender: null }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/assistenteApi', () => ({
  aprenderApelidos: (...a) => ia.aprender(...a), concluirPreLancamento: async () => ({}), listarPreLancamentos: async () => [],
  guardarPreLancamento: async () => ({}), cotacaoDolar: async () => ({}), listarApelidos: async () => ia.apelidos,
}))
vi.mock('../Transactions/TransactionForm', () => ({
  default: ({ initial, onSalvo, rotuloGravar }) => (
    <div>
      <p data-testid="form">{`desc=${initial.description} notes=${initial.notes || '-'} nº=${initial.numeroContrato || '-'} contrato=${initial.contratoId || '-'} rep=${initial.repeatFrequency || '-'}`}</p>
      <button type="button" onClick={() => onSalvo({ ...initial, amount: String(initial.amount) }, 'tx_novo')}>{rotuloGravar || 'Registrar'}</button>
    </div>
  ),
}))
vi.mock('../Schedule/ScheduleForm', () => ({ default: () => <p data-testid="agendamento">AGENDAMENTO</p> }))
const { default: PreviaAssistente } = await import('./PreviaAssistente.jsx')

const CONTRATO = { id: 'ct_1', numero: '12345', tipo: 'pagar', status: 'ativo', objeto: 'Academia X', favorecido: 'Academia X Ltda' }
const base = (o = {}) => Object.assign(app, {
  transactions: [], schedules: [], accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }],
  activeProfileId: null, updateAccount: vi.fn(), pode: () => true, getNextOccurrences: () => [], settings: {},
  addTransaction: vi.fn(), setReconciled: vi.fn(), vincularLancamento: vi.fn(() => ({ ok: true })),
  categories: [{ id: 'cat_aca', name: 'Academia' }], payees: [], gerencialGroups: [], reserveFunctions: [], tiposDocumento: [],
  contratos: [], ...o,
})
const sug = (o = {}) => ({
  tipo: 'despesa', valor: 150, data: '2026-11-12', conta_id: 'cc', categoria_id: 'cat_aca', descricao: 'Academia',
  favorecido_novo: 'Academia X', confianca: {}, termos: {}, ...o,
})
const abrir = (s, texto = 'foto do boleto') =>
  render(<PreviaAssistente ferramenta="registrar_lancamento" sugestao={s} textoOriginal={texto} onClose={() => {}} onToast={() => {}} guardarAoFechar={false} />)
const boleto = { natureza: 'boleto', numero_contrato: '12345', vencimento: '2026-11-12', pago: true }

afterEach(() => { cleanup(); vi.clearAllMocks(); ia.apelidos = [] })
ia.aprender = vi.fn(async () => ({}))

describe('Prévia: nº do contrato e contrato cadastrado (cenário 8)', () => {
  it('contrato cadastrado com o nº → cartão "Vincular ao contrato X" marcado; nº no campo próprio, descrição/observação limpas', () => {
    base({ contratos: [CONTRATO] })
    abrir(sug({ documento: boleto }))
    const caixa = screen.getByRole('checkbox', { name: /Vincular ao contrato Academia X/ })
    expect(caixa.checked).toBe(true)
    expect(screen.getByTestId('form').textContent).toBe('desc=Academia notes=- nº=12345 contrato=ct_1 rep=-')
    // O contrato já gera as parcelas: sem a pergunta "Despesa + agendamento" destacada.
    expect(screen.getByText(/já cadastrado/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmar tudo' })).toBeTruthy()
    // Desmarcar: o lançamento sai sem o contrato (o nº continua no campo).
    fireEvent.click(caixa)
    expect(screen.getByTestId('form').textContent).toMatch(/nº=12345 contrato=- /)
  })

  it('sem contrato cadastrado: sem o cartão; o nº continua no campo próprio (não na observação)', () => {
    base({ contratos: [{ ...CONTRATO, numero: '99999' }] })
    abrir(sug({ documento: boleto }))
    expect(screen.queryByRole('checkbox', { name: /Vincular ao contrato/ })).toBeNull()
    expect(screen.getByTestId('form').textContent).toMatch(/^desc=Academia notes=- nº=12345 contrato=- /)
  })
})

describe('Prévia: baixa sugerida como cartão (item 9)', () => {
  const agendado = { id: 'sch_aca', description: 'Academia X', payee: 'Academia X', transactionType: 'expense', accountId: 'cc', amount: 150, frequency: 'monthly', startDate: '2026-10-12' }
  const comAgendamento = () => base({ schedules: [agendado], getNextOccurrences: (s) => (s.id === 'sch_aca' ? ['2026-11-12'] : []) })

  it('agendamento que bate → cartão marcado; "Confirmar tudo" grava o lançamento e liga à ocorrência', () => {
    comAgendamento()
    abrir(sug({ descricao: 'Academia X' }), 'paguei a academia 150')
    const caixa = screen.getByRole('checkbox', { name: /Dar baixa no agendamento/ })
    expect(caixa.checked).toBe(true)
    // Não pergunta "Despesa + agendamento": a despesa paga um agendamento que já existe.
    expect(screen.queryByRole('button', { name: /Despesa \+ agendamento/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar tudo' }))
    expect(app.vincularLancamento).toHaveBeenCalledTimes(1)
    expect(app.vincularLancamento.mock.calls[0][0]).toMatchObject({ txId: 'tx_novo', scheduleId: 'sch_aca', data: '2026-11-12', tx: { id: 'tx_novo', amount: 150 } })
  })

  it('desmarcado → só o lançamento, sem baixa', () => {
    comAgendamento()
    abrir(sug({ descricao: 'Academia X' }), 'paguei a academia 150')
    fireEvent.click(screen.getByRole('checkbox', { name: /Dar baixa no agendamento/ }))
    fireEvent.click(screen.getByRole('button', { name: /Registrar|Confirmar tudo/ }))
    expect(app.vincularLancamento).not.toHaveBeenCalled()
  })
})

describe('Prévia: preferência aprendida (cenário 10)', () => {
  const academia = () => sug({ descricao: 'Mensalidade', favorecido_novo: null, documento: { natureza: 'boleto', pago: true } })
  it('preferência ativa do perfil → "Só despesa" vem sugerido, com o motivo', async () => {
    base({ activeProfileId: 'perfil_pf' })
    ia.apelidos = [{ tipo: 'acao_despesa', termo: 'perfil_pf|f:academia x', ref_id: 'so_despesa', usos: 2 }]
    render(<PreviaAssistente ferramenta="registrar_lancamento" sugestao={{ ...academia(), favorecido_id: 'Academia X' }} textoOriginal="boleto academia" onClose={() => {}} onToast={() => {}} guardarAoFechar={false} />)
    expect((await screen.findByText(/costuma escolher "Só despesa"/))).toBeTruthy()
    expect(screen.getByRole('button', { name: /Só despesa/ }).textContent).toMatch(/sugerido/)
  })
  it('outro perfil: a preferência não vale; escolher "Só despesa" grava a preferência deste perfil', async () => {
    base({ activeProfileId: 'perfil_pj' })
    ia.apelidos = [{ tipo: 'acao_despesa', termo: 'perfil_pf|f:academia x', ref_id: 'so_despesa', usos: 2 }]
    render(<PreviaAssistente ferramenta="registrar_lancamento" sugestao={{ ...academia(), favorecido_id: 'Academia X' }} textoOriginal="boleto academia" onClose={() => {}} onToast={() => {}} guardarAoFechar={false} />)
    await screen.findByRole('button', { name: /Despesa \+ agendamento/ })
    expect(screen.getByRole('button', { name: /Despesa \+ agendamento/ }).textContent).toMatch(/sugerido/)
    fireEvent.click(screen.getByRole('button', { name: /Só despesa/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    const itens = ia.aprender.mock.calls.flatMap(c => c[0])
    expect(itens).toContainEqual({ tipo: 'acao_despesa', termo: 'perfil_pj|f:academia x', ref_id: 'so_despesa' })
  })
})
