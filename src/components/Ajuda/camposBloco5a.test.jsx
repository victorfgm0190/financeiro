// @vitest-environment jsdom
// Etapa 3, bloco 5a: formulários que gravam (Agendamentos, Reservas, Envelopes, Orçamento, Cartão,
// Contas, Dívidas, modais de lançamento, cadastros soltos, Fluxo de Caixa e Início no celular).
// Todo campo visível de cada data-help-form está num data-help-id com conteúdo na base. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|set|add|update|delete|salvar|registrar|recarregar|carregar|criar|renomear|vincular|mesclar|efetivar)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))

const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
const base = await import('../../help/index.js')
const { EfetivarProvisaoModal } = await import('../Schedule/SchedulePanel.jsx')
const { default: OcorrenciaEditModal } = await import('../Schedule/OcorrenciaEditModal.jsx')
const { default: BudgetPanel } = await import('../Budget/BudgetPanel.jsx')
const { default: RendimentoModal } = await import('../Accounts/RendimentoModal.jsx')
const { default: DebtPlanModal } = await import('../Transactions/DebtPlanModal.jsx')
const { default: RateioModal } = await import('../shared/RateioModal.jsx')
const { default: ReconciliarModal } = await import('../shared/ReconciliarModal.jsx')
const { default: ScheduleMatchModal } = await import('../shared/ScheduleMatchModal.jsx')
const { default: EscopoSerieDialog } = await import('../shared/EscopoSerieDialog.jsx')
const { default: PerfilRapido } = await import('../shared/PerfilRapido.jsx')
const { default: ConsultaModal } = await import('../CashFlow/ConsultaModal.jsx')

const nada = () => {}
const contas = [{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf', balance: 100 }, { id: 'pp', name: 'Aplicação Exemplo', type: 'savings', profileId: 'pf', balance: 500 }]
Object.assign(app, {
  accounts: contas, profileAccounts: contas, accountGroups: [], profiles: [{ id: 'pf', name: 'Perfil Exemplo' }],
  categories: [{ id: 'd1', name: 'Despesa Exemplo', type: 'expense' }, { id: 'r1', name: 'Receita Exemplo', type: 'income' }],
  budgets: [], transactions: [], schedules: [], reserveFunctions: [], payees: [], activeProfileId: 'pf', categoryGroupOrder: [],
  pode: () => true, getNextOccurrences: () => [], recursosBanco: {}, settings: {},
  getFinancialPeriod: () => ({ start: new Date(2026, 10, 1), end: new Date(2026, 10, 30) }), profileReportTransactions: [],
})
afterEach(cleanup)

const auditar = (form) => {
  const raiz = document.querySelector(`[data-help-form="${form}"]`)
  expect(raiz, form).toBeTruthy()
  const semConteudo = [...raiz.querySelectorAll('[data-help-id]')].map(e => e.dataset.helpId).filter(id => !base.helpDoCampo(id))
  return [...controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 140)), ...semConteudo]
}

describe('Bloco 5a: todo campo visível tem ajuda', () => {
  it('Efetivar provisão e editar ocorrência', () => {
    const sch = { id: 's', description: 'Provisão Exemplo', amount: 100, startDate: '2026-12-10', frequency: 'once', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {}, accountId: 'cc' }
    render(<EfetivarProvisaoModal schedule={sch} accounts={contas} onClose={nada} onConfirm={nada} />)
    expect(auditar('efetivarProvisao')).toEqual([])
    cleanup()
    render(<OcorrenciaEditModal originalDate="2026-12-10" defaultAmount={100} onSave={nada} onClose={nada} />)
    expect(auditar('ocorrencia')).toEqual([])
  })
  it('Orçamento novo', () => {
    render(<BudgetPanel />)
    fireEvent.click(screen.getAllByRole('button').find(b => /Novo|Orçamento/.test(b.textContent)))
    expect(auditar('orcamento')).toEqual([])
  })
  it('Lançar rendimento e plano de dívida', () => {
    render(<RendimentoModal account={contas[1]} onClose={nada} />)
    expect(auditar('rendimento')).toEqual([])
    cleanup()
    render(<DebtPlanModal account={contas[0]} group={{ type: 'emprestimo' }} amount={1200} date="2026-12-01" onClose={nada} />)
    expect(auditar('planoDivida')).toEqual([])
  })
  it('Rateio, reconciliar em lote e lançamento × agendamento', () => {
    render(<RateioModal total={100} categories={app.categories} categoryType="expense" initial={[{ categoriaId: 'd1', valor: 60, descricao: 'Parte Exemplo' }, { categoriaId: '', valor: 40 }]} onSave={nada} onDeleteAll={nada} onClose={nada} perfilId="pf" />)
    expect(auditar('rateio')).toEqual([])
    cleanup()
    render(<ReconciliarModal items={[{ id: 't', date: '2026-12-01', description: 'Lançamento Exemplo', amount: 10, reconciled: false }]} onApply={nada} onClose={nada} />)
    expect(auditar('reconciliarLote')).toEqual([])
    cleanup()
    const sch = { id: 's', description: 'Agendamento Exemplo', amount: 90, frequency: 'monthly', startDate: '2026-01-10', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {} }
    render(<ScheduleMatchModal schedule={sch} tx={{ id: 't', amount: 100, date: '2026-12-10' }} categories={[]} diferencas={[{ campo: 'categoryId', rotulo: 'Categoria', deLancamento: 'A', doAgendamento: 'B' }]} onRegister={nada} onKeep={nada} onNeverAsk={nada} />)
    fireEvent.click(screen.getByText('Manter os deste lançamento'))
    expect(auditar('vinculoAgendamento')).toEqual([])
  })
  it('Escopo da série (as três variantes) e perfil rápido', () => {
    const mudancas = [{ campo: 'amount' }]
    for (const variante of [undefined, 'ocorrencia', 'parcelamento']) {
      render(<EscopoSerieDialog mudancas={mudancas} nProximas={2} variante={variante} anoOcorrencia="2026" onConfirm={nada} onCancel={nada} />)
      expect(auditar('escopoSerie'), String(variante)).toEqual([])
      cleanup()
    }
    render(<PerfilRapido open onClose={nada} />)
    expect(auditar('perfilRapido')).toEqual([])
  })
  it('Consulta salva do Fluxo de Caixa (por conta e por grupo)', () => {
    render(<ConsultaModal initial={null} consultas={[]} accounts={contas} accountGroups={[{ id: 'g', name: 'Grupo Exemplo' }]} transactions={[]} profiles={app.profiles} activeProfileId="pf" hoje="2026-11-09" onSalvar={nada} onClose={nada} />)
    expect(auditar('consultaFluxo')).toEqual([])
    const grupo = screen.queryAllByRole('button').find(b => /grupo/i.test(b.textContent))
    if (grupo) { fireEvent.click(grupo); expect(auditar('consultaFluxo')).toEqual([]) }
  })
})
