// @vitest-environment jsdom
// Etapa 3, bloco 5b: busca e filtros, cartões de prévia do Assistente e telas sem login. Todo campo
// visível de cada data-help-form está num data-help-id com conteúdo na base. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|set|add|update|delete|salvar|registrar|recarregar|carregar|criar|abrir|atualizar)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../BoasVindas/subtelaGuia', () => ({ useSubtelaGuia: () => {} }))

const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
const base = await import('../../help/index.js')
const { default: LancamentoFiltros } = await import('../shared/LancamentoFiltros.jsx')
const { default: GlobalSearch } = await import('../shared/GlobalSearch.jsx')
const { default: RelatorioFatura } = await import('../CreditCard/RelatorioFatura.jsx')
const { default: ExtratoGerencial } = await import('../CreditCard/ExtratoGerencial.jsx')
const { default: ContratosPanel } = await import('../Contratos/ContratosPanel.jsx')
const { default: SeletorPeriodoFluxo } = await import('../Reservas/SeletorPeriodoFluxo.jsx')
const { default: CartaoAgendamentoPrevia } = await import('../Assistente/CartaoAgendamentoPrevia.jsx')
const { default: CartaoBaixaPrevia, CartaoContratoPrevia } = await import('../Assistente/CartaoBaixaPrevia.jsx')
const { default: EscolherConta } = await import('../Assistente/EscolherConta.jsx')
const { default: CompraEmDolar } = await import('../Assistente/CompraEmDolar.jsx')
const { default: Login } = await import('../../pages/Login.jsx')
const { default: CadastroCliente } = await import('../../pages/CadastroCliente.jsx')
const { default: DefinirSenha } = await import('../../pages/DefinirSenha.jsx')

const nada = () => {}
const contas = [{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf', balance: 100 }, { id: 'cx', name: 'Outra Conta Exemplo', type: 'checking', profileId: 'pf', balance: 50 }]
const cartao = { id: 'k1', name: 'Cartão Exemplo', type: 'credit', profileId: 'pf', closingDay: 5, dueDay: 12 }
Object.assign(app, {
  accounts: [...contas, cartao], profileAccounts: contas, creditCards: [cartao], accountGroups: [], profiles: [{ id: 'pf', name: 'Perfil Exemplo' }],
  categories: [{ id: 'd1', name: 'Despesa Exemplo', type: 'expense' }], transactions: [], schedules: [], payees: [], activeProfileId: 'pf',
  categoryGroupOrder: [], pode: () => true, settings: {}, contratos: [], contratosCarregados: true, creditosContratos: [],
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const auditar = (form) => {
  const raizes = [...document.querySelectorAll(`[data-help-form="${form}"]`)]
  expect(raizes.length, form).toBeGreaterThan(0)
  return raizes.flatMap(raiz => {
    const semConteudo = [...raiz.querySelectorAll('[data-help-id]')].map(e => e.dataset.helpId).filter(id => !base.helpDoCampo(id))
    return [...controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 140)), ...semConteudo]
  })
}

describe('Bloco 5b: todo campo visível tem ajuda', () => {
  it('Filtros de lançamentos (com categoria e faixa de valor; com valor exato/aproximado) e a legenda com ⓘ', () => {
    render(<LancamentoFiltros filtros={{}} setFiltros={nada} fields={['data', 'historico', 'favorecido', 'de', 'para', 'categoria', 'valor']} categories={app.categories} />)
    expect(auditar('filtrosLancamentos')).toEqual([])
    expect(screen.getByTestId('legenda-filtros-lanc').textContent).toMatch(/Data.*Categoria.*Valor de\/até/)
    cleanup()
    render(<LancamentoFiltros filtros={{}} setFiltros={nada} fields={['data', 'historico', 'valorBusca']} />)
    expect(auditar('filtrosLancamentos')).toEqual([])
  })
  it('Busca global', () => {
    render(<GlobalSearch open onClose={nada} />)
    expect(auditar('buscaGlobal')).toEqual([])
  })
  it('Relatório da fatura, extrato gerencial e filtros de Contratos', () => {
    render(<RelatorioFatura />)
    expect(auditar('filtrosRelatorioFatura')).toEqual([])
    cleanup()
    render(<ExtratoGerencial />)
    expect(auditar('filtrosExtratoGerencial')).toEqual([])
    cleanup()
    render(<ContratosPanel />)
    expect(auditar('filtrosContratos')).toEqual([])
  })
  it('Período do Fluxo Futuro (Reservas)', () => {
    render(<SeletorPeriodoFluxo periodo={{ de: '2026-11', ate: '2027-10' }} atual="2026-11" onAplicar={nada} />)
    fireEvent.click(screen.getByRole('button', { name: /Nov/ }))
    expect(auditar('periodoFluxoReservas')).toEqual([])
  })
  it('Cartões de prévia do Assistente: agendamento, baixa (com escolha), contrato, outra conta e compra em dólar', () => {
    render(<CartaoAgendamentoPrevia cfg={{ ativo: true, repeatFrequency: 'monthly', repeatOccurrenceType: 'continuous', repeatStartDate: '2026-11-10' }} onChange={nada} />)
    expect(auditar('previaAgendamento')).toEqual([])
    cleanup()
    const cand = [{ schedule_id: 's1', ocorrencia: '2026-11-10', data: '2026-11-10', valor: 90, descricao: 'Agendamento Exemplo' }, { schedule_id: 's2', ocorrencia: '2026-11-12', data: '2026-11-12', valor: 95, descricao: 'Outro Exemplo' }]
    render(<CartaoBaixaPrevia candidatos={cand} alvo={cand[0]} marcado onMarcar={nada} onEscolher={nada} />)
    expect(auditar('previaBaixa')).toEqual([])
    cleanup()
    render(<CartaoContratoPrevia contrato={{ nome: 'Contrato Exemplo', numero: '123' }} marcado onMarcar={nada} />)
    expect(auditar('previaContrato')).toEqual([])
    cleanup()
    render(<EscolherConta accounts={contas} activeProfileId="pf" onEscolher={nada} />)
    fireEvent.click(screen.getByRole('button', { name: /Outra conta/ }))
    expect(auditar('escolherConta')).toEqual([])
    cleanup()
    render(<CompraEmDolar valorOriginal={10} cambio={{ separada: true, aliquota: 0.035, iof: 1.9, valorCompra: 55, cotacao: 5.5, spread: 0.04, origem: 'padrao' }} carregando={false} categories={app.categories} catIof="" onCatIof={nada} />)
    expect(auditar('compraDolar')).toEqual([])
  })
  it('Telas sem login: Login, Esqueci minha senha, Pedido de cadastro (PF e PJ) e Definir senha', async () => {
    render(<Login />)
    expect(auditar('login')).toEqual([])
    const esqueci = screen.queryByRole('button', { name: /Esqueci/ })
    if (esqueci) { fireEvent.click(esqueci); expect(auditar('esqueciSenha')).toEqual([]) }
    cleanup()
    render(<CadastroCliente />)
    expect(auditar('pedidoCadastro')).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Pessoa jurídica' }))
    expect(auditar('pedidoCadastro')).toEqual([])
    cleanup()
    window.history.pushState({}, '', '/definir-senha?token=exemplo')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, nome: 'Pessoa Exemplo', tipo: 'convite' }) })))
    render(<DefinirSenha />)
    await waitFor(() => expect(document.querySelector('[data-help-form="definirSenha"]')).toBeTruthy())
    expect(auditar('definirSenha')).toEqual([])
    window.history.pushState({}, '', '/')
  })
})
