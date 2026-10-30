// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { computeOccurrences } from '../../lib/occurrences'

// Prévia de 1 item (e item do lote): SMS "MP *BARBEARIACONS 70,00" × agendamento quinzenal
// "BARBEARIA CONSTANCIA" 120 no mesmo cartão. Só sugere: "É ele?" e "pode ser o favorecido…".
const app = vi.hoisted(() => ({}))
const api = vi.hoisted(() => ({ aprenderApelidos: vi.fn(async () => ({})) }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/assistenteApi', () => ({
  aprenderApelidos: (...a) => api.aprenderApelidos(...a), concluirPreLancamento: async () => ({}), listarPreLancamentos: async () => [],
  guardarPreLancamento: async () => ({}), cotacaoDolar: async () => ({}),
}))
vi.mock('../Transactions/TransactionForm', () => ({ default: ({ initial }) => <p>FORMULÁRIO payee={initial.payee || '(vazio)'}</p> }))
vi.mock('./PreviaBaixa', () => ({ default: ({ candidato, valorNasProximas }) => <p>BAIXA {candidato.schedule_id} próximas={String(valorNasProximas)}</p> }))
const { default: PreviaAssistente } = await import('./PreviaAssistente.jsx')

const barb = {
  id: 'barb', description: 'BARBEARIA CONSTANCIA', payee: 'Barbearia Constância', transactionType: 'expense', accountId: 'itau', amount: 120,
  frequency: 'biweekly', startDate: '2026-10-10', occurrenceType: 'continuous', registered: ['2026-10-10'], skipped: [], overrides: {},
}
Object.assign(app, {
  transactions: [], accounts: [{ id: 'itau', name: 'Itaupers', type: 'credit', closingDay: 1 }, { id: 'nu', name: 'Nubank', type: 'credit' }],
  activeProfileId: 'PV', updateAccount: vi.fn(), pode: () => true, getNextOccurrences: (s, n) => computeOccurrences(s, n),
  settings: {}, addTransaction: vi.fn(), categories: [], payees: ['Barbearia Constância', 'Posto Central'],
})
const sugestao = (o = {}) => ({
  tipo: 'despesa', valor: 70, data: '2026-10-23', conta_id: 'itau', categoria_id: null, descricao: 'MP *BARBEARIACONS', favorecido_id: null,
  favorecido_novo: 'MP *BARBEARIACONS', confianca: { valor: 1, data: 1, conta: 1, categoria: 1, descricao: 1, favorecido: 1 }, termos: {}, ...o,
})
const abrir = (schedules = [barb], s = sugestao()) => {
  app.schedules = schedules
  return render(<PreviaAssistente ferramenta="registrar_lancamento" sugestao={s} textoOriginal="SMS" onClose={() => {}} onToast={() => {}} guardarAoFechar={false} />)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PreviaAssistente: parecidos', () => {
  it('"Não é" → lançamento comum; aviso de favorecido; "Usar" troca e aprende o apelido', async () => {
    abrir()
    expect(screen.getByText(/Parecido com o agendamento/).textContent).toMatch(/BARBEARIA CONSTANCIA.*previsto R\$\s?120,00.*24\/10\/2026/)
    fireEvent.click(screen.getByRole('button', { name: 'Não é' }))
    expect(screen.getByText('FORMULÁRIO payee=MP *BARBEARIACONS')).toBeTruthy()
    expect(screen.getByText(/pode ser o favorecido/).textContent).toMatch(/BARBEARIACONS pode ser o favorecido Barbearia Constância\. Usar\?/)
    fireEvent.click(screen.getByRole('button', { name: 'Usar' }))
    expect(screen.getByText('FORMULÁRIO payee=Barbearia Constância')).toBeTruthy()
    expect(api.aprenderApelidos).toHaveBeenCalledWith([{ tipo: 'favorecido', termo: 'BARBEARIACONS', ref_id: 'Barbearia Constância' }])
    expect(screen.queryByText(/pode ser o favorecido/)).toBeNull()
  })

  it('"Sim, dar baixa" com valor diferente pergunta só esta ou também as próximas', () => {
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Sim, dar baixa' }))
    expect(screen.getByRole('button', { name: /Baixar com R\$\s?70,00 só esta ocorrência/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Baixar e usar R\$\s?70,00 nas próximas/ }))
    expect(screen.getByText('BAIXA barb próximas=true')).toBeTruthy()
  })

  it('agendamento em outro cartão: sem aviso de agendamento; "Não" no favorecido some com o aviso', () => {
    abrir([{ ...barb, accountId: 'nu' }])
    expect(screen.queryByText(/Parecido com o agendamento/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Não' }))
    expect(screen.queryByText(/pode ser o favorecido/)).toBeNull()
    expect(api.aprenderApelidos).not.toHaveBeenCalled()
  })
})
