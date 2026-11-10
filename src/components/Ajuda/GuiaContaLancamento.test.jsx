// @vitest-environment jsdom
// Preencher com guia em NOVA/EDITAR CONTA e NOVO/EDITAR LANÇAMENTO (Etapa 5 do pacote pós-help): os
// formulários de verdade (AccountForm, TransactionForm) com o guia montado. Confere: o tipo de conta
// muda os campos e o guia acompanha; as abas Receita/Despesa/Transferência refazem a ordem sem travar;
// Enter avança (foco na opção escolhida); obrigatório segura o Próximo; Salvar no meio leva ao campo
// que falta com o aviso; "Dividir em categorias" e "Mais opções" não abrem sozinhos; nenhum balão do ⓘ
// abre sozinho; formulário rápido do "+" (celular). Dados fictícios.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
const tela = vi.hoisted(() => ({ celular: false }))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|salvar|registrar|recarregar|abrir|fechar|criar|atualizar|carregar|planejar|aplicar|vincular|mark|possiveis|contratoPor|recalcular|find|ensure|reverse|baixar|save)/.test(k) ? vi.fn(() => []) : [])) }),
  isResgatePago: () => false,
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => tela.celular }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))
vi.mock('../BoasVindas/useGuiaTela', () => ({ useEstadoBoasVindas: () => null }))
vi.mock('../../lib/abrirTela', () => ({ navegarPara: vi.fn() }))
vi.mock('../../lib/boasVindasApi', async (orig) => ({ ...(await orig()), responderOfertaGuia: vi.fn(async () => true), marcarTarefaConcluida: vi.fn(async () => true) }))

const { default: GuiaPreenchimento } = await import('./GuiaPreenchimento.jsx')
const { default: AccountForm } = await import('../Accounts/AccountForm.jsx')
const { default: TransactionForm } = await import('../Transactions/TransactionForm.jsx')
const { _reiniciarPreenchimento, encerrarPreenchimento } = await import('../../help/guiaPreenchimento.js')
const { lerHelpCampo, fecharHelpCampo } = await import('../../help/helpCampoEstado.js')
const { helpDoFormulario } = await import('../../help/index.js')
// Formulários grandes: com a suíte inteira em paralelo, a montagem passa do limite padrão.
const LENTO = { timeout: 90_000 }

beforeEach(() => {
  _reiniciarPreenchimento()
  tela.celular = false
  for (const k of Object.keys(app)) delete app[k]
  Object.assign(app, {
    profiles: [{ id: 'pf', name: 'Perfil Exemplo', type: 'pf', document: '' }],
    accounts: [
      { id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf', balance: 100 },
      { id: 'pp', name: 'Poupança Exemplo', type: 'savings', profileId: 'pf', balance: 50 },
    ],
    accountGroups: [], activeAccountGroups: [],
    categories: [{ id: 'cat', name: 'Moradia', type: 'expense' }, { id: 'rec', name: 'Salário', type: 'income' }],
    payees: [], costCenters: [], transactions: [], schedules: [], gerencialGroups: [], reserveFunctions: [], tiposDocumento: [],
    settings: {}, activeProfileId: 'pf', dbStatus: 'connected',
    pode: () => true,
    addAccount: vi.fn(), updateAccount: vi.fn(), addTransaction: vi.fn(),
  })
})
afterEach(() => { act(() => { encerrarPreenchimento(); fecharHelpCampo() }); cleanup() })

const balao = () => screen.getByTestId('guia-preenchimento')
const campo = () => balao().dataset.campo
const enter = (el) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
const comecar = () => {
  fireEvent.click(screen.getByTestId('botao-preencher-guia'))
  fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
}
// Nenhum balão do ⓘ (nem o painel do help de campo) abriu sozinho.
const semAjudaAberta = () => {
  expect(screen.queryByRole('tooltip')).toBeNull()
  expect(lerHelpCampo().aberto).toBe(false)
}
// Pula campo a campo e devolve a ordem percorrida (até sair da fase de campos).
const percorrer = (limite = 60) => {
  const vistos = []
  for (let i = 0; i < limite && balao().dataset.fase === 'campo'; i++) {
    vistos.push(campo())
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
  }
  return vistos
}
const tipoConta = (rotulo) => fireEvent.click(screen.getByText(rotulo, { selector: 'span' }))
const aba = (rotulo) => fireEvent.click(screen.getAllByRole('button').find(b => b.textContent.trim() === rotulo))

describe('Preencher com guia — Nova conta', () => {
  it('roteiro na base; botão no formulário; o guia some da linha do topo ao começar (sem espaço em branco)', LENTO, () => {
    expect(helpDoFormulario('conta')).toBeTruthy()
    render(<><AccountForm initial={null} onClose={() => {}} /><GuiaPreenchimento /></>)
    const linha = screen.getByTestId('botao-preencher-guia').parentElement
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    expect(balao().dataset.fase).toBe('objetivo')
    expect(balao().textContent).toContain(helpDoFormulario('conta').objetivo)
    expect(linha.isConnected ? linha.getClientRects().length : 0).toBe(0)
    expect(document.querySelector('[data-help-form="conta"] > [data-guia-fora]').className).toContain('hidden')
  })

  it('Enter avança (foco no tipo escolhido), nome obrigatório segura o Próximo, nenhum balão do ⓘ abre sozinho', LENTO, () => {
    render(<><AccountForm initial={null} onClose={() => {}} /><GuiaPreenchimento /></>)
    comecar()
    expect(campo()).toBe('conta.tipo')
    expect(document.activeElement).toMatchObject({ type: 'radio', value: 'checking' })
    enter(document.activeElement)
    expect(campo()).toBe('conta.nome')
    expect(balao().textContent).toContain('Obrigatório')
    const nome = document.activeElement
    expect(nome.tagName).toBe('INPUT')
    enter(nome)
    expect(campo()).toBe('conta.nome')
    expect(screen.getByRole('alert').textContent).toContain('Informe o nome da conta.')
    fireEvent.change(nome, { target: { value: 'Conta Nova Exemplo' } })
    enter(nome)
    expect(campo()).toBe('conta.apelido')
    semAjudaAberta()
  })

  it('o tipo escolhido muda os campos seguintes e o guia acompanha (cartão, bem/dívida, poupança com investimento)', LENTO, () => {
    render(<><AccountForm initial={null} onClose={() => {}} /><GuiaPreenchimento /></>)
    comecar()
    tipoConta('Cartão de Crédito')
    const cartao = percorrer()
    expect(cartao.slice(0, 6)).toEqual(['conta.tipo', 'conta.nome', 'conta.apelido', 'conta.banco', 'conta.grupo', 'conta.vinculo'])
    for (const id of ['cartao.limite', 'cartao.fechamento', 'cartao.vencimento', 'cartao.finais', 'cartao.spread', 'cartao.iofSeparado', 'cartao.contaPagadora']) expect(cartao, id).toContain(id)
    expect(cartao).not.toContain('conta.saldoInicial')
    expect(cartao).not.toContain('conta.finalidade')
    expect(cartao.indexOf('cartao.limite')).toBeLessThan(cartao.indexOf('cartao.fechamento'))
    // Dias do cartão obrigatórios: o guia lista o que falta antes do resumo.
    expect(balao().dataset.fase).toBe('faltando')
    expect(screen.getByRole('button', { name: 'Dia de fechamento' })).toBeTruthy()
    act(() => encerrarPreenchimento())

    comecar()
    tipoConta('Dívida / Passivo')
    const divida = percorrer()
    for (const id of ['conta.valorAtual', 'conta.valorAquisicao', 'conta.dataAquisicao']) expect(divida, id).toContain(id)
    for (const id of ['conta.saldoInicial', 'cartao.limite', 'conta.destacar', 'conta.investimento']) expect(divida, id).not.toContain(id)
    act(() => encerrarPreenchimento())

    comecar()
    tipoConta('Poupança')
    fireEvent.click(screen.getByText('É Investimento?'))
    const poupanca = percorrer()
    expect(poupanca).toContain('conta.investimento')
    expect(poupanca).toContain('conta.categoriaInvestimento')
    expect(poupanca).not.toContain('conta.central')
    semAjudaAberta()
  })

  it('trocar o tipo DURANTE o guia: o campo atual some e o guia segue para o próximo da tela nova (sem travar)', LENTO, async () => {
    render(<><AccountForm initial={null} onClose={() => {}} /><GuiaPreenchimento /></>)
    comecar()
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(campo()).toBe('conta.saldoInicial')
    tipoConta('Bem / Ativo')
    await waitFor(() => expect(campo()).toBe('conta.valorAtual'))
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(campo()).toBe('conta.valorAquisicao')
    // Voltar ao tipo e trocar de novo: o próximo é o primeiro campo novo ainda não visto.
    tipoConta('Cartão de Crédito')
    await waitFor(() => expect(campo()).toBe('cartao.limite'))
  })

  it('Salvar no meio do guia: não grava, o guia vai ao campo obrigatório que falta e mostra o aviso', LENTO, async () => {
    render(<><AccountForm initial={null} onClose={() => {}} /><GuiaPreenchimento /></>)
    comecar()
    tipoConta('Cartão de Crédito')
    fireEvent.change(screen.getByPlaceholderText('Digite o nome da conta'), { target: { value: 'Cartão Exemplo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }))
    await waitFor(() => expect(campo()).toBe('cartao.fechamento'))
    expect(screen.getByRole('alert').textContent).toContain('Informe o dia de fechamento')
    expect(app.addAccount).not.toHaveBeenCalled()
  })

  it('editar conta: o botão aparece, sem a oferta da 1ª abertura', LENTO, () => {
    render(<><AccountForm initial={{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf', balance: 100, initialBalance: 100 }} onClose={() => {}} /><GuiaPreenchimento /></>)
    expect(screen.getByTestId('botao-preencher-guia')).toBeTruthy()
    expect(screen.queryByTestId('oferta-guia')).toBeNull()
    comecar()
    expect(campo()).toBe('conta.tipo')
  })
})

describe('Preencher com guia — Novo lançamento', () => {
  const novo = (props = {}) => render(<><TransactionForm initial={null} onClose={() => {}} onToast={() => {}} preLancamentos={[]} {...props} /><GuiaPreenchimento /></>)

  it('Despesa: Enter no tipo escolhido avança; valor obrigatório segura o Próximo; categoria com "Dividir" sem abrir o rateio', LENTO, () => {
    expect(helpDoFormulario('lancamento')).toBeTruthy()
    novo()
    comecar()
    expect(campo()).toBe('lancamento.tipo')
    expect(document.activeElement.textContent).toBe('Despesa')
    expect(document.activeElement.getAttribute('aria-pressed')).toBe('true')
    enter(document.activeElement)
    // A conta já vem com a conta principal: obrigatória, mas preenchida — o Próximo passa.
    expect(campo()).toBe('lancamento.conta')
    expect(balao().textContent).toContain('Obrigatório')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(campo()).toBe('lancamento.valor')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(campo()).toBe('lancamento.valor')
    expect(screen.getByRole('alert').textContent).toContain('Informe o valor.')
    const ordem = ['lancamento.conta', ...percorrer()]
    expect(ordem.slice(0, 2)).toEqual(['lancamento.conta', 'lancamento.valor'])
    expect(ordem.indexOf('lancamento.data')).toBeGreaterThan(1)
    expect(ordem).toContain('lancamento.categoria')
    expect(ordem).not.toContain('lancamento.contaDestino')
    expect(screen.queryByTestId('legenda-rateio')).toBeNull()
    semAjudaAberta()
  })

  it('campo só com botão de ação: o foco vai ao Próximo do balão (Enter não abre o "Dividir em categorias")', LENTO, () => {
    novo()
    comecar()
    while (campo() !== 'lancamento.categoria') fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    // Seletor da categoria (aria-haspopup) com o foco; o "Dividir" nunca recebe o foco do guia.
    expect(document.activeElement.getAttribute('aria-haspopup')).toBe('listbox')
    expect(document.activeElement.textContent).not.toContain('Dividir')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.queryByTestId('legenda-rateio')).toBeNull()
  })

  it('trocar de aba durante o guia refaz a ordem sem travar (Despesa → Transferência → Receita)', LENTO, async () => {
    novo()
    comecar()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(campo()).toBe('lancamento.conta')
    aba('Transferência')
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    // A conta destino (nova) vem logo depois da conta de origem.
    expect(campo()).toBe('lancamento.contaDestino')
    expect(balao().textContent).toContain('Obrigatório')
    const transf = [campo(), ...percorrer().slice(1)]
    expect(transf).toContain('lancamento.valor')
    expect(transf).not.toContain('lancamento.categoria')
    expect(transf).not.toContain('lancamento.favorecido')
    act(() => encerrarPreenchimento())

    comecar()
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: i ? 'Pular' : 'Próximo' }))
    expect(campo()).toBe('lancamento.contaDestino')
    // O campo atual some com a troca de aba: o guia segue para o próximo da tela nova.
    aba('Receita')
    await waitFor(() => expect(campo()).toBe('lancamento.valor'))
    const receita = [campo(), ...percorrer().slice(1)]
    expect(receita).toContain('lancamento.categoria')
    expect(receita).toContain('lancamento.favorecido')
    expect(receita).not.toContain('lancamento.contaDestino')
    semAjudaAberta()
  })

  it('Salvar no meio do guia: não grava, vai ao primeiro campo que falta (na ordem da tela) com o aviso', LENTO, async () => {
    novo()
    comecar()
    expect(campo()).toBe('lancamento.tipo')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    await waitFor(() => expect(campo()).toBe('lancamento.valor'))
    expect(screen.getByRole('alert').textContent).toContain('Informe o valor.')
    expect(app.addTransaction).not.toHaveBeenCalled()
  })

  it('prévia do Assistente (destaques): sem botão de guia', LENTO, () => {
    novo({ destaques: ['amount'] })
    expect(screen.queryByTestId('botao-preencher-guia')).toBeNull()
  })

  it('celular, formulário rápido do "+": percorre os campos sem abrir "Mais opções" e chega ao Salvar', LENTO, () => {
    tela.celular = true
    novo({ rapido: true })
    comecar()
    expect(balao().dataset.lado).toMatch(/^(cima|baixo)$/)
    expect(campo()).toBe('lancamento.tipo')
    expect(document.activeElement.textContent).toBe('Saída')
    const ordem = percorrer()
    expect(ordem.slice(0, 5)).toEqual(['lancamento.tipo', 'lancamento.valor', 'lancamento.descricao', 'lancamento.conta', 'lancamento.categoria'])
    expect(ordem.filter(id => !['lancamento.tipoDocumento'].includes(id))).toHaveLength(5)
    expect(screen.getByRole('button', { name: /Mais opções/ })).toBeTruthy()
    expect(screen.queryByText('Data', { selector: 'label' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir mesmo assim' }))
    expect(balao().dataset.fase).toBe('resumo')
    expect(screen.getByTestId('guia-resumo').textContent).toContain('Despesa de')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.fase).toBe('salvar')
    semAjudaAberta()
  })

  it('"Mais opções" tocado durante o guia: o formulário completo abre e o guia continua nele', LENTO, async () => {
    tela.celular = true
    novo({ rapido: true })
    comecar()
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(campo()).toBe('lancamento.valor')
    fireEvent.click(screen.getByRole('button', { name: /Mais opções/ }))
    expect(screen.getByTestId('guia-preenchimento')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(campo()).not.toBe('lancamento.valor')
    expect(screen.getByText('Data', { selector: 'label', exact: false })).toBeTruthy()
  })
})
