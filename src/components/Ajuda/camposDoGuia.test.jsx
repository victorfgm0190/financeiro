// @vitest-environment jsdom
// Preenchimento Guiado: TODO campo visível dos formulários com guia tem um passo (está dentro de um
// data-help-id com conteúdo na base). Novo agendamento (despesa e transferência), Registrar
// agendamento (3 abas) e o wizard do contrato (todas as etapas, aluguel a receber por
// administradora). Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { computeOccurrences } from '../../lib/occurrences'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|salvar|registrar|recarregar|abrir|fechar|criar|atualizar|carregar|planejar|aplicar|vincular|mark|possiveis|contratoPor)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))

const { default: ScheduleForm } = await import('../Schedule/ScheduleForm.jsx')
const { PayModal } = await import('../Schedule/SchedulePanel.jsx')
const { default: ContratoWizard } = await import('../Contratos/ContratoWizard.jsx')
const { controlesSemPasso, camposNaTela } = await import('../../help/guiaPreenchimento.js')

const CONTAS = [
  { id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf' },
  { id: 'cc2', name: 'Poupança Exemplo', type: 'savings', profileId: 'pf' },
]
Object.assign(app, {
  profiles: [{ id: 'pf', name: 'Pessoal', type: 'pf' }], accounts: CONTAS, accountGroups: [],
  categories: [{ id: 'cat', name: 'Moradia', type: 'expense' }, { id: 'rec', name: 'Moradia', type: 'income' }],
  payees: [], transactions: [], schedules: [], gerencialGroups: [], reserveFunctions: [], scheduleReservaFuncoes: [],
  tiposDocumento: [{ id: 'td', sigla: 'BOL', nome: 'Boleto', natureza: 'ambos', ativo: true }],
  rateiosByLancamento: new Map(), possiveisDuplicados: new Map(), settings: { controleGerencial: true }, activeProfileId: 'pf', categoryGroupOrder: [],
  costCenters: [], indicesContratos: {}, dbStatus: 'connected',
  getNextOccurrences: (s, n) => computeOccurrences(s, n), pode: () => true, temHistorico: () => false, contratoPorId: () => null,
  carregarIndice: vi.fn(async () => null),
})
afterEach(cleanup)

const semPasso = (form) => {
  const raiz = document.querySelector(`[data-help-form="${form}"]`)
  return controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 140))
}

describe('todo campo visível tem passo no guia', () => {
  it('Novo agendamento: despesa e transferência', () => {
    render(<ScheduleForm initial={null} onClose={() => {}} onAviso={() => {}} />)
    expect(semPasso('agendamento')).toEqual([])
    expect(camposNaTela(document.querySelector('[data-help-form="agendamento"]'))).toContain('agendamento.tipoDocumento')
    fireEvent.click(screen.getByRole('button', { name: 'Transferência' }))
    expect(semPasso('agendamento')).toEqual([])
  })

  it('Registrar agendamento: pagamento, recebimento e transferência', () => {
    const ag = { id: 's1', description: 'Conta de luz', transactionType: 'expense', accountId: 'cc', amount: 180, frequency: 'monthly', startDate: '2026-11-12', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {} }
    render(<PayModal schedule={ag} nextDate={ag.startDate} accounts={CONTAS} categories={app.categories} gerencialGroups={[{ id: 'g', name: 'Grupo' }]}
      addTransaction={vi.fn()} markScheduleRegistered={vi.fn()} onClose={() => {}} />)
    for (const aba of ['Pagamento', 'Recebimento', 'Transferência']) {
      fireEvent.click(screen.getByRole('button', { name: aba }))
      expect(semPasso('registrarAgendamento'), aba).toEqual([])
    }
  })

  it('Contrato (aluguel a receber por administradora): todas as etapas', () => {
    render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
    const raiz = () => document.querySelector('[data-help-form="contrato"]')
    const campo = (rotulo) => within(raiz()).getByText(rotulo, { selector: 'label' }).parentElement
    const mudar = (el, v) => fireEvent.change(el, { target: { value: v } })
    mudar(campo('Modalidade').querySelector('select'), 'aluguel')
    mudar(campo('Tipo').querySelector('select'), 'receber')
    fireEvent.click(screen.getByText(/Recebo por uma administradora/))
    expect(semPasso('contrato'), 'Dados').toEqual([])
    expect(camposNaTela(raiz())).toEqual(expect.arrayContaining(['contrato.numero', 'contrato.objeto', 'contrato.fim']))
    mudar(screen.getByPlaceholderText('Digite o nome do favorecido'), 'Administradora Exemplo')
    fireEvent.click(screen.getByLabelText(/Sem data de fim/))
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
    expect(semPasso('contrato'), 'Valores').toEqual([])
    mudar(campo('Conta de recebimento').querySelector('select'), 'cc')
    mudar(within(campo('Valor do aluguel (contratual)')).getAllByRole('textbox')[0], '2.200,00')
    mudar(campo('Dia de vencimento do inquilino').querySelector('input'), '5')
    mudar(campo('Dia do repasse').querySelector('input'), '10')
    for (let i = 0; i < 4 && screen.queryByRole('button', { name: /Avançar/ }); i++) {
      fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
      expect(semPasso('contrato'), `etapa ${i + 2}`).toEqual([])
    }
    // Chegou à última etapa (Confirmar): todas as etapas foram conferidas.
    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeTruthy()
  })
})

describe('"Obrigatório" do guia = validação do formulário', () => {
  it('agendamento: frequência vazia barra o Salvar (e o guia); tipo de documento só quando exigido', async () => {
    const { errosDoAgendamento } = await import('../Schedule/ScheduleForm.jsx')
    const base = { description: 'Luz', accountId: 'cc', amount: '180', startDate: '2026-11-12', frequency: 'monthly', transactionType: 'expense', occurrenceType: 'continuous' }
    expect(errosDoAgendamento(base)).toEqual([])
    expect(errosDoAgendamento({ ...base, frequency: '' }).map(e => e.id)).toEqual(['agendamento.frequency'])
    expect(errosDoAgendamento(base, { tipoDocObrigatorio: true }).map(e => e.id)).toEqual(['agendamento.tipoDocumento'])
    expect(errosDoAgendamento({ ...base, occurrenceType: 'installment', installments: '' }).map(e => e.id)).toEqual(['agendamento.occurrence'])
  })
  it('agendamento: Salvar barrado nunca é silencioso (aviso com o 1º erro, some ao corrigir)', () => {
    render(<ScheduleForm initial={null} onClose={() => {}} onAviso={() => {}} />)
    fireEvent.submit(document.querySelector('[data-help-form="agendamento"]'))
    expect(screen.getByTestId('erro-salvar-agendamento').textContent).toBe('Preencha a descrição.')
    fireEvent.change(document.querySelector('[data-help-id="agendamento.description"] input'), { target: { value: 'Luz' } })
    expect(screen.queryByTestId('erro-salvar-agendamento')).toBeNull()
  })
  it('contrato: errosDaEtapa lista tudo; o primeiro é o do Avançar; fim só obrigatório sem "Sem data de fim"', async () => {
    const { errosDaEtapa, validarEtapaCampo } = await import('../../lib/contratos/validacao.js')
    const f = { modalidade: 'outro', perfil_id: 'pf', favorecido: '', data_inicio: '2026-01-01', data_fim: '', sem_fim: false }
    expect(errosDaEtapa(0, f).map(e => e.campo)).toEqual(['favorecido', 'data_fim', 'data_fim'])
    expect(validarEtapaCampo(0, f).campo).toBe('favorecido')
    expect(errosDaEtapa(0, { ...f, favorecido: 'X', sem_fim: true })).toEqual([])
  })
})
