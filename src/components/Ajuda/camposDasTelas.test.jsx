// @vitest-environment jsdom
// Etapa 6 — help de campo nas telas restantes: todo campo visível de cada formulário (data-help-form)
// está num data-help-id com conteúdo na base (o mesmo critério do aviso em dev e do Preenchimento
// Guiado). E o `npm run help:check` (scripts/help-check.mjs) sai limpo. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|salvar|registrar|recarregar|abrir|fechar|criar|atualizar|carregar|planejar|aplicar|vincular|mark|possiveis|contratoPor|recalcular)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))

const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
const { varrerHelp } = await import('../../help/avisoDev.js')
const base = await import('../../help/index.js')
const { checar, analisarArquivo } = await import('../../../scripts/help-check.mjs')
const { default: AccountForm } = await import('../Accounts/AccountForm.jsx')
const { default: TransactionForm } = await import('../Transactions/TransactionForm.jsx')
// Telas grandes: com a suíte inteira em paralelo, a montagem passa do limite padrão.
const LENTO = { timeout: 90_000 }

Object.assign(app, {
  profiles: [{ id: 'pf', name: 'Pessoal', type: 'pf', document: '000.000.000-00' }],
  accounts: [{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf', balance: 100 }],
  accountGroups: [{ id: 'g1', name: 'Grupo Exemplo' }], activeAccountGroups: [],
  categories: [{ id: 'cat', name: 'Moradia', type: 'expense' }, { id: 'rec', name: 'Rendimentos', type: 'income' }],
  payees: [], transactions: [], schedules: [], settings: {}, activeProfileId: 'pf', dbStatus: 'connected',
  pode: () => true,
})
afterEach(cleanup)

const semPasso = (form) => {
  const raiz = document.querySelector(`[data-help-form="${form}"]`)
  expect(raiz, form).toBeTruthy()
  return controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 160))
}

describe('help:check (scripts/help-check.mjs)', () => {
  it('limpo: nenhum campo sem data-help-id, nenhum id sem conteúdo, nada pendente', LENTO, () => {
    const raiz = join(import.meta.dirname, '../../..')
    const listar = (d) => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? listar(p) : /\.jsx$/.test(n) && !/\.test\.jsx$/.test(n) ? [p] : [] })
    const r = checar(listar(join(raiz, 'src')).map(c => ({ caminho: relative(raiz, c), codigo: readFileSync(c, 'utf8') })), base)
    expect(r.semId).toEqual([])
    expect(r.semConteudo).toEqual([])
    expect(r.pendentes).toEqual([])
  })
  it('acusa campo fora de data-help-id e aceita os componentes que repassam o id', () => {
    const { semId, ids } = analisarArquivo(`
      function Linha({ helpId }) { return <label><input type="checkbox" /></label> }
      export default () => (
        <form data-help-form="x">
          <div data-help-id="a.b"><input /></div>
          <input />
          <Campo help="a.c"><select /></Campo>
          <Linha nome="Texto livre" ajuda="não é id" />
          <CategorySelect helpId="a.d" />
          <input type="hidden" />
          <div data-guia-fora><input type="file" /></div>
        </form>)`)
    expect(semId.map(s => s.nome)).toEqual(['input', 'Linha'])
    expect(ids.map(i => i.id)).toEqual(['a.b', 'a.c', 'a.d'])
  })
})

describe('aviso em dev', () => {
  it('avisa campo sem passo e id sem conteúdo, uma vez cada', () => {
    document.body.innerHTML = '<form data-help-form="x"><input aria-label="Solto"><div data-help-id="nada.disso"><input></div></form>'
    const vistos = new Set()
    const m = varrerHelp(document, vistos)
    expect(m.some(x => x.includes('"Solto"'))).toBe(true)
    expect(m.some(x => x.includes('"nada.disso"'))).toBe(true)
    expect(varrerHelp(document, vistos)).toEqual([])
    document.body.innerHTML = ''
  })
})

describe('Contas: todo campo visível tem passo', () => {
  it('cada tipo de conta (e finalidade/investimento/rendimento abertos)', LENTO, () => {
    render(<AccountForm initial={null} onClose={() => {}} />)
    const tipo = (rotulo) => fireEvent.click(screen.getByText(rotulo, { selector: 'span' }))
    for (const t of ['Conta Corrente', 'Poupança', 'Cartão de Crédito', 'Dinheiro', 'Gerencial', 'Bem / Ativo', 'Dívida / Passivo']) {
      tipo(t)
      expect(semPasso('conta'), t).toEqual([])
    }
    tipo('Poupança')
    fireEvent.click(screen.getByText('É Investimento?'))
    fireEvent.click(screen.getByText('Reserva', { selector: 'span' }))
    fireEvent.change(screen.getByDisplayValue('Geral (sem categoria fixa)'), { target: { value: 'especifica' } })
    expect(semPasso('conta'), 'poupança: reserva específica + investimento').toEqual([])
    fireEvent.click(screen.getByText('Patrimônio', { selector: 'span' }))
    expect(semPasso('conta'), 'patrimônio').toEqual([])
  })
})

describe('Lançamentos: todo campo visível tem passo', () => {
  it('despesa, receita e transferência; formulário rápido', LENTO, () => {
    render(<TransactionForm initial={null} onClose={() => {}} onToast={() => {}} preLancamentos={[]} />)
    for (const t of ['Despesa', 'Receita', 'Transferência']) {
      const b = screen.queryAllByRole('button').find(x => x.textContent.trim().startsWith(t))
      if (b) fireEvent.click(b)
      expect(semPasso('lancamento'), t).toEqual([])
    }
    cleanup()
    render(<TransactionForm initial={null} onClose={() => {}} onToast={() => {}} preLancamentos={[]} rapido />)
    expect(semPasso('lancamento'), 'rápido').toEqual([])
  })
})

describe('Configurações › Cadastros: listas editáveis têm passo e ⓘ na legenda', () => {
  it('Categorias, Centros de custo e Grupos de contas', LENTO, async () => {
    const { default: SettingsPanel } = await import('../Settings/SettingsPanel.jsx')
    const { CONFIG_ABAS, configHash } = await import('../../lib/configRota.js')
    const abaDe = (s) => CONFIG_ABAS.find(a => a.secoes.some(x => x.id === s)).id
    Object.assign(app, {
      categories: [{ id: 'cat', name: 'Moradia', type: 'expense', group: 'Casa', geraEspelho: true }, { id: 'rec', name: 'Rendimentos', type: 'income' }],
      categoryGroups: ['Casa'], gerencialGroups: [], costCenters: ['Obra'],
      accountGroups: [{ id: 'g1', name: 'Grupo Exemplo', type: 'financeiro', order: 0 }],
    })
    const abrir = (s) => { cleanup(); window.location.hash = configHash(abaDe(s), s); render(<SettingsPanel />) }
    abrir('categorias')
    expect(semPasso('categoriaLista')).toEqual([])
    const legenda = screen.getByTestId('legenda-categorias')
    expect(legenda.querySelectorAll('[data-testid="help-campo"]').length).toBeGreaterThanOrEqual(5)
    for (const id of ['categoriaLista.perfis', 'categoriaLista.grupo', 'categoriaLista.grupoGerencial', 'categoriaLista.espelho', 'categoriaLista.contaEspelho']) {
      expect(document.querySelector(`[data-help-form="categoriaLista"] [data-help-id="${id}"]`), id).toBeTruthy()
      expect(base.helpDoCampo(id), id).toBeTruthy()
    }
    abrir('centros-custo')
    expect(semPasso('centroCusto')).toEqual([])
    abrir('grupos-contas')
    expect(semPasso('grupoConta')).toEqual([])
    fireEvent.click(document.querySelector('[data-guia="settings:grupos-contas.editar"]'))
    expect(semPasso('grupoConta'), 'editando').toEqual([])
    window.location.hash = ''
  })
  it('Favorecidos: busca, seleção e sincronizar', LENTO, async () => {
    const { default: FavorecidosPanel } = await import('../Settings/FavorecidosPanel.jsx')
    app.data = { payees: [{ name: 'Loja Exemplo' }], transactions: [{ id: 't', payee: 'Mercado Exemplo' }], schedules: [], classificationRules: [] }
    render(<FavorecidosPanel />)
    expect(semPasso('favorecidos')).toEqual([])
    expect(screen.getByTestId('legenda-favorecidos').querySelector('[data-testid="help-campo"]')).toBeTruthy()
  })
})
