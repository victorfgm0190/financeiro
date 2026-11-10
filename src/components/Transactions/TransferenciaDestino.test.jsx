// @vitest-environment jsdom
// Transferência e conta destino (ajustes da Etapa 5): sem destino, a transferência NOVA não grava
// ("Escolha a conta destino."), no formulário e na baixa de agendamento (individual e em lote); a que
// já existe sem destino só avisa e salva; o destino lista as contas dos outros perfis permitidos,
// agrupadas por perfil (o perfil atual primeiro); a origem fica só no perfil atual. Dados fictícios.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
const tela = vi.hoisted(() => ({ celular: false }))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|salvar|registrar|recarregar|abrir|fechar|criar|atualizar|carregar|planejar|aplicar|vincular|mark|possiveis|contratoPor|recalcular|find|ensure|reverse|baixar|save|register|skip|execut|efetiv|toggle|definir|confirm|reconcil|desfazer)/.test(k) ? vi.fn(() => []) : [])) }),
  isResgatePago: () => false,
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => tela.celular }))
vi.mock('../../lib/boasVindasApi', async (orig) => ({ ...(await orig()), responderOfertaGuia: vi.fn(async () => true), marcarTarefaConcluida: vi.fn(async () => true) }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))
vi.mock('../BoasVindas/useGuiaTela', () => ({ useEstadoBoasVindas: () => null }))

const { default: TransactionForm } = await import('./TransactionForm.jsx')
const { PayModal, BatchRegisterModal } = await import('../Schedule/SchedulePanel.jsx')
const { blocosDestinoPorPerfil, contasDaOrigem } = await import('../../lib/contasPorPerfil.js')
const { default: GuiaPreenchimento } = await import('../Ajuda/GuiaPreenchimento.jsx')
const { TransferenciaAcao } = await import('../../mobile/acoes.jsx')
const { _reiniciarPreenchimento, encerrarPreenchimento } = await import('../../help/guiaPreenchimento.js')
// Formulários grandes: com a suíte inteira em paralelo, a montagem passa do limite padrão.
const LENTO = { timeout: 90_000 }

const PERFIS = [
  { id: 'pf', name: 'Pessoa Exemplo Silva', type: 'pf' },
  { id: 'pj', name: 'Empresa Exemplo', type: 'pj' },
]
const CONTAS = [
  { id: 'cpf', name: 'Conta Pessoal', type: 'checking', profileId: 'pf', balance: 100 },
  { id: 'ppf', name: 'Poupança Pessoal', type: 'savings', profileId: 'pf', balance: 50 },
  { id: 'cpj', name: 'Conta Empresa', type: 'checking', profileId: 'pj', balance: 300 },
  { id: 'ipj', name: 'Aplicação Empresa', type: 'savings', profileId: 'pj', balance: 10 },
]

beforeEach(() => {
  tela.celular = false
  _reiniciarPreenchimento()
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  for (const k of Object.keys(app)) delete app[k]
  Object.assign(app, {
    profiles: PERFIS, accounts: CONTAS, activeProfileId: 'pj',
    accountGroups: [], activeAccountGroups: [],
    categories: [{ id: 'cat', name: 'Moradia', type: 'expense' }],
    payees: [], costCenters: [], transactions: [], schedules: [], gerencialGroups: [], reserveFunctions: [], tiposDocumento: [],
    scheduleReservaFuncoes: [], rateiosByLancamento: new Map(), possiveisDuplicados: new Map(), vinculosPorLancamento: new Map(),
    settings: {}, dbStatus: 'connected', pode: () => true,
    addTransaction: vi.fn(() => 'tx_novo'), updateTransaction: vi.fn(),
    registrarEdicao: vi.fn(async () => {}), temHistorico: () => false,
  })
})
afterEach(() => { encerrarPreenchimento(); cleanup() })

const salvar = () => fireEvent.click(document.querySelector('[data-help-salvar="lancamento"]'))
const abrirDestino = () => fireEvent.click(screen.getByRole('button', { name: /Selecione o destino/ }))
const destinoContainer = () => document.querySelector('[data-help-id="lancamento.contaDestino"]')
const itensDaLista = () => [...document.querySelectorAll('[data-item]')].map(b => b.textContent)

describe('regras (src/lib/contasPorPerfil.js)', () => {
  it('destino: perfil atual primeiro, depois os outros; conta de perfil não permitido nunca entra', () => {
    const vazada = { id: 'x', name: 'Conta de Outro', type: 'checking', profileId: 'outro' }
    const blocos = blocosDestinoPorPerfil([...CONTAS, vazada], PERFIS, 'pj', { excludeId: 'cpj' })
    expect(blocos.map(b => b.key)).toEqual(['perfil:pj', 'perfil:pf'])
    expect(blocos[0].atual).toBe(true)
    expect(blocos[0].contas.map(a => a.id)).toEqual(['ipj'])
    expect(blocos.flatMap(b => b.contas).some(a => a.id === 'x')).toBe(false)
  })
  it('origem: só o perfil atual (a já escolhida fica); sem filtro de perfil, todas', () => {
    expect(contasDaOrigem(CONTAS, 'pj').map(a => a.id)).toEqual(['cpj', 'ipj'])
    expect(contasDaOrigem(CONTAS, 'pj', 'cpf').map(a => a.id)).toEqual(['cpf', 'cpj', 'ipj'])
    expect(contasDaOrigem(CONTAS, null)).toHaveLength(4)
  })
})

describe('formulário de lançamento — transferência', () => {
  const novo = (initial) => render(<TransactionForm initial={initial} onClose={() => {}} onToast={() => {}} preLancamentos={[]} />)

  it('NOVA sem conta destino: o Salvar não grava e mostra "Escolha a conta destino." no campo', LENTO, () => {
    novo({ type: 'transfer', accountId: 'cpj', amount: '120' })
    salvar()
    expect(within(destinoContainer()).getByRole('alert').textContent).toBe('Escolha a conta destino.')
    expect(app.addTransaction).not.toHaveBeenCalled()
    // Escolhendo o destino, o aviso some.
    abrirDestino()
    fireEvent.click(screen.getByRole('button', { name: 'Conta Pessoal' }))
    expect(within(destinoContainer()).queryByRole('alert')).toBeNull()
  })

  it('destino lista as contas do outro perfil, agrupadas por perfil (o atual primeiro); a origem só do perfil atual', LENTO, () => {
    novo({ type: 'transfer', accountId: 'cpj' })
    abrirDestino()
    const cabecalhos = screen.getAllByTestId('destino-perfil').map(h => h.textContent)
    expect(cabecalhos).toHaveLength(2)
    expect(cabecalhos[0]).toContain('Empresa Exemplo')
    expect(cabecalhos[0]).toContain('perfil atual')
    expect(cabecalhos[1]).toContain('Pessoa Exemplo Silva')
    const itens = itensDaLista()
    expect(itens).toEqual(expect.arrayContaining(['Aplicação Empresa', 'Conta Pessoal', 'Poupança Pessoal']))
    expect(itens.indexOf('Aplicação Empresa')).toBeLessThan(itens.indexOf('Conta Pessoal'))
    expect(itens).not.toContain('Conta Empresa') // a origem não é destino
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar...'), { key: 'Escape' })
    // Origem: só as contas do perfil atual.
    const origem = document.querySelector('[data-help-id="lancamento.conta"] [aria-haspopup="listbox"]')
    fireEvent.click(origem)
    const contasOrigem = itensDaLista()
    expect(contasOrigem).toEqual(expect.arrayContaining(['Conta Empresa', 'Aplicação Empresa']))
    expect(contasOrigem).not.toContain('Conta Pessoal')
  })

  it('usuário com perfil restrito: só as contas do perfil permitido (sem cabeçalho de outro perfil)', LENTO, () => {
    // O servidor entrega só o perfil permitido e as contas dele; uma conta "vazada" de outro perfil não aparece.
    app.profiles = [PERFIS[1]]
    app.accounts = [CONTAS[2], CONTAS[3], { id: 'cpf', name: 'Conta Pessoal', type: 'checking', profileId: 'pf' }]
    novo({ type: 'transfer', accountId: 'cpj' })
    abrirDestino()
    expect(screen.queryAllByTestId('destino-perfil')).toHaveLength(0)
    const itens = itensDaLista()
    expect(itens).toContain('Aplicação Empresa')
    expect(itens).not.toContain('Conta Pessoal')
  })

  it('EDITAR transferência antiga sem destino: aviso visível e salva', LENTO, () => {
    const antiga = { id: 't_antiga', type: 'transfer', accountId: 'cpj', toAccountId: null, amount: 80, date: '2026-11-05', description: 'Transferência importada', origin: 'importacao' }
    app.transactions = [antiga]
    novo(antiga)
    expect(screen.getByTestId('aviso-sem-destino').textContent).toBe('Esta transferência está sem conta destino.')
    salvar()
    // Gravou (o formulário segue para o fim da edição) sem exigir o destino.
    expect(app.updateTransaction).toHaveBeenCalledWith('t_antiga', expect.objectContaining({ type: 'transfer' }))
    expect(screen.queryByText('Escolha a conta destino.')).toBeNull()
  })
})

describe('celular e guia', () => {
  it('"+" Transferência do celular: sem destino, o Salvar não grava e avisa no campo', LENTO, () => {
    tela.celular = true
    app.profileAccounts = CONTAS.filter(a => a.profileId === 'pj')
    render(<TransferenciaAcao onClose={() => {}} onToast={() => {}} />)
    fireEvent.change(document.querySelector('[data-help-id="lancamento.valor"] input'), { target: { value: '75,00' } })
    fireEvent.click(document.querySelector('[data-help-salvar="lancamento"]'))
    expect(within(destinoContainer()).getByRole('alert').textContent).toBe('Escolha a conta destino.')
    expect(app.addTransaction).not.toHaveBeenCalled()
  })

  it('guia: transferência nova segura o Próximo sem destino; a antiga sem destino só avisa e deixa seguir', LENTO, () => {
    const antiga = { id: 't_antiga', type: 'transfer', accountId: 'cpj', toAccountId: null, amount: 80, date: '2026-11-05', description: 'Transferência importada', origin: 'importacao' }
    app.transactions = [antiga]
    render(<><TransactionForm initial={antiga} onClose={() => {}} onToast={() => {}} preLancamentos={[]} /><GuiaPreenchimento /></>)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    const g = () => screen.getByTestId('guia-preenchimento')
    for (let i = 0; i < 10 && g().dataset.campo !== 'lancamento.contaDestino'; i++) fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(g().dataset.campo).toBe('lancamento.contaDestino')
    expect(g().textContent).toContain('Esta transferência está sem conta destino.')
    expect(g().textContent).not.toContain('Obrigatório')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(g().dataset.campo).not.toBe('lancamento.contaDestino')
  })
})

describe('baixa de agendamento de transferência', () => {
  const ag = (o = {}) => ({
    id: 's1', description: 'Transferência mensal', transactionType: 'transfer', accountId: 'cpj', toAccountId: null, amount: 200,
    frequency: 'monthly', startDate: '2026-11-12', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {}, ...o,
  })
  const contasDoPerfil = CONTAS.filter(a => a.profileId === 'pj')

  it('sem destino: pede o destino antes de confirmar; com o destino (de outro perfil), grava', LENTO, () => {
    const addTransaction = vi.fn(() => 'tx_novo')
    // `accounts` da tela = as do perfil atual (origem); o destino lista também os outros perfis.
    render(<PayModal schedule={ag()} nextDate="2026-11-12" accounts={contasDoPerfil} categories={[]} gerencialGroups={[]}
      addTransaction={addTransaction} markScheduleRegistered={vi.fn()} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Transferência/ }))
    expect(screen.getByRole('alert').textContent).toBe('Escolha a conta destino.')
    expect(addTransaction).not.toHaveBeenCalled()
    const destino = screen.getByLabelText('Banco para')
    expect([...destino.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Perfil: Empresa Exemplo (atual)', 'Perfil: Pessoa Exemplo Silva'])
    fireEvent.change(destino, { target: { value: 'cpf' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Transferência/ }))
    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'transfer', accountId: 'cpj', toAccountId: 'cpf', amount: 200 }))
  })

  it('em lote: a linha sem destino pede a conta e segura o Confirmar; escolhida, vai junto', LENTO, () => {
    const onConfirm = vi.fn()
    render(<BatchRegisterModal selectedRows={[{ schedule: ag(), nextDate: '2026-11-12' }]} accounts={contasDoPerfil} onConfirm={onConfirm} onClose={() => {}} />)
    const confirmar = screen.getByRole('button', { name: /Confirmar Registro/ })
    expect(confirmar.disabled).toBe(true)
    expect(screen.getByText('Escolha a conta destino.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Conta destino de Transferência mensal'), { target: { value: 'cpf' } })
    expect(confirmar.disabled).toBe(false)
    fireEvent.click(confirmar)
    expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({ scheduleId: 's1', toAccountId: 'cpf' })], expect.anything())
  })
})
