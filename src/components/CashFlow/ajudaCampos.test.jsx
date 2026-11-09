// @vitest-environment jsdom
// Etapa 3, bloco 2 (Fluxo de Caixa e Provisão): todo campo visível de cada formulário (data-help-form)
// está num data-help-id com conteúdo na base — inclusive os que só aparecem depois de uma escolha.
// Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|add|update|delete|registrar|salvar)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))

const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
const base = await import('../../help/index.js')
const { default: EfetivarModal } = await import('./EfetivarModal.jsx')
const { default: MudarDataModal } = await import('./MudarDataModal.jsx')
const { default: ProvisaoForm } = await import('../Schedule/ProvisaoForm.jsx')
const { default: ProvisorioForm } = await import('../Reports/ProvisorioForm.jsx')

const nada = () => {}
Object.assign(app, {
  accounts: [{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf', isPrincipal: true, principal: true }, { id: 'pp', name: 'Poupança Exemplo', type: 'savings', profileId: 'pf' }],
  profileAccounts: [{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf' }],
  profiles: [{ id: 'pf', name: 'Perfil Exemplo' }],
  categories: [{ id: 'd1', name: 'Despesa Exemplo', type: 'expense' }, { id: 'r1', name: 'Receita Exemplo', type: 'income' }],
  reserveFunctions: [{ id: 'f1', name: 'Função Exemplo', accountId: 'pp' }],
  accountGroups: [], payees: ['Favorecido Exemplo'], transactions: [], activeProfileId: 'pf', categoryGroupOrder: [],
  pode: () => true, getNextOccurrences: () => ['2026-12-10', '2027-01-10'],
})
afterEach(cleanup)

const auditar = (form) => {
  const raiz = document.querySelector(`[data-help-form="${form}"]`)
  expect(raiz, form).toBeTruthy()
  const semConteudo = [...raiz.querySelectorAll('[data-help-id]')].map(e => e.dataset.helpId).filter(id => !base.helpDoCampo(id))
  return [...controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 140)), ...semConteudo]
}

describe('Fluxo de Caixa e Provisão: todo campo visível tem ajuda', () => {
  it('Efetivar provisório (agendamento e lançamento realizado)', () => {
    render(<EfetivarModal prov={{ id: 'p', type: 'saida', amount: 100, date: '2026-12-01', description: 'Provisório Exemplo', account_id: 'cc' }} onConfirmar={nada} onClose={nada} />)
    expect(auditar('efetivarProvisorio')).toEqual([])
    fireEvent.click(screen.getByText('Lançamento realizado'))
    expect(document.querySelector('[data-help-id="efetivarProvisorio.data"]')).toBeTruthy()
    expect(auditar('efetivarProvisorio')).toEqual([])
  })
  it('Mudar data (simular e gravar numa série)', () => {
    const schedule = { id: 's', frequency: 'monthly', startDate: '2026-01-10', transactionType: 'expense', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {} }
    render(<MudarDataModal linha={{ description: 'Aluguel Exemplo', saida: 100, date: '2026-12-10', _origDate: '2026-12-10', _scheduleId: 's' }} schedule={schedule} primeiraPendente="2026-12-10" onSimular={nada} onGravar={nada} onClose={nada} />)
    expect(auditar('mudarData')).toEqual([])
    fireEvent.click(screen.getByText('Gravar no agendamento'))
    expect(auditar('mudarData')).toEqual([])
  })
  it('Provisão: recorrente, parcelada e com reserva', () => {
    render(<ProvisaoForm initial={null} onClose={nada} />)
    expect(auditar('provisao')).toEqual([])
    fireEvent.click(screen.getByText(/Será pago com reserva/))
    expect(document.querySelector('[data-help-id="provisao.funcaoReserva"]')).toBeTruthy()
    expect(auditar('provisao')).toEqual([])
    cleanup()
    render(<ProvisaoForm initial={{ description: 'Seguro Exemplo', amount: 1200, startDate: '2026-12-10', frequency: 'annual', parcelasPorOcorrencia: 1 }} onClose={nada} />)
    for (const id of ['provisao.ateQuando', 'provisao.parcelasPorOcorrencia']) expect(document.querySelector(`[data-help-id="${id}"]`), id).toBeTruthy()
    expect(auditar('provisao')).toEqual([])
  })
  it('Provisório do Fluxo por Conta', () => {
    render(<ProvisorioForm initial={null} contaPadrao="cc" onSalvar={nada} onClose={nada} />)
    expect(auditar('provisorio')).toEqual([])
    expect(screen.getByRole('button', { name: 'Saída' }).getAttribute('aria-pressed')).toBe('true')
  })
})
