// @vitest-environment jsdom
// Etapa 3, bloco 4 (Configurações): todo campo visível de cada formulário (data-help-form) está num
// data-help-id com conteúdo na base — inclusive os que só aparecem depois de uma ação. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|set|add|update|delete|salvar|criar|atualizar|excluir|alternar|reordenar|recarregar|carregar|registrar)/.test(k) ? vi.fn(async () => ({})) : [])) }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../../lib/assistenteApi', async (orig) => ({ ...(await orig()), listarApelidos: vi.fn(async () => [{ id: 'a1', tipo: 'categoria', termo: 'termo exemplo', ref_id: 'cat', usos: 2 }]) }))
vi.mock('../../lib/importacaoApi', async (orig) => ({ ...(await orig()), listarDepara: vi.fn(async () => [{ id: 'd1', nome_origem: 'texto exemplo', categoria_id: 'cat' }]) }))
vi.mock('../../lib/usuariosApi', async (orig) => ({ ...(await orig()), listarUsuarios: vi.fn(async () => ({ usuarios: [], perfis: [{ id: 'pf', name: 'Perfil Exemplo' }] })) }))

const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
const base = await import('../../help/index.js')
const { default: SettingsPanel } = await import('./SettingsPanel.jsx')
const { CONFIG_ABAS, configHash } = await import('../../lib/configRota.js')
const { default: IdentidadeAmbiente } = await import('./IdentidadeAmbiente.jsx')
const { default: TiposDocumentoPanel } = await import('./TiposDocumentoPanel.jsx')
const { default: TrocarSenhaModal } = await import('./TrocarSenhaModal.jsx')
const { default: UsuariosPanel } = await import('./UsuariosPanel.jsx')
const { default: FeriadosPanel } = await import('./FeriadosPanel.jsx')
const { default: ApelidosIaPanel } = await import('./ApelidosIaPanel.jsx')
const { default: DeParaImportacaoPanel } = await import('./DeParaImportacaoPanel.jsx')
const { default: ControleGerencialChave } = await import('./ControleGerencialChave.jsx')
const { default: GuiasTelasPanel } = await import('../BoasVindas/GuiasTelasPanel.jsx')

const nada = () => {}
Object.assign(app, {
  profiles: [{ id: 'pf', name: 'Perfil Exemplo', type: 'pf' }],
  accounts: [{ id: 'cc', name: 'Conta Exemplo', type: 'checking', profileId: 'pf' }],
  accountGroups: [{ id: 'g1', name: 'Grupo Exemplo', type: 'financeiro', anchorAccountId: 'cc' }],
  categories: [{ id: 'cat', name: 'Categoria Exemplo', type: 'expense' }],
  gerencialGroups: [{ id: 'gD', number: 'D', name: 'Despesa' }, { id: 'g1n', number: 1, name: 'Grupo Um' }],
  classificationRules: [], gerencialRules: [], tiposDocumento: [], feriados: [], feriadosCarregados: true,
  data: { schedules: [], transactions: [] }, settings: { controleGerencial: true }, usuario: { id: 'u1', nivel: 'admin', origem: 'db' },
  pode: () => true, dbStatus: 'connected',
})
afterEach(() => { cleanup(); window.location.hash = '' })

const auditar = (form) => {
  const raiz = document.querySelector(`[data-help-form="${form}"]`)
  expect(raiz, form).toBeTruthy()
  const semConteudo = [...raiz.querySelectorAll('[data-help-id]')].map(e => e.dataset.helpId).filter(id => !base.helpDoCampo(id))
  return [...controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 140)), ...semConteudo]
}
const abaDe = (s) => CONFIG_ABAS.find(a => a.secoes.some(x => x.id === s)).id
const secao = (s) => { cleanup(); window.location.hash = configHash(abaDe(s), s); render(<SettingsPanel />) }

describe('Configurações: todo campo visível tem ajuda', () => {
  it('Período, estornos e IOF', { timeout: 60_000 }, () => {
    secao('periodo')
    expect(auditar('periodo')).toEqual([])
    app.settings = { ...app.settings, estornoCartaoEnabled: true }
    secao('estornos')
    expect(auditar('estornos')).toEqual([])
    expect(auditar('iof')).toEqual([])
  })
  it('Regras de classificação e de grupo gerencial; grupo gerencial novo', { timeout: 60_000 }, () => {
    secao('classificacao')
    expect(auditar('classificacao')).toEqual([])
    secao('grupo-gerencial')
    expect(auditar('regraGerencial')).toEqual([])
    secao('controle-gerencial')
    expect(auditar('controleGerencial')).toEqual([])
    fireEvent.click(document.querySelector('[data-guia="settings:controle-gerencial.novo-grupo"]'))
    expect(auditar('grupoGerencial')).toEqual([])
  })
  it('Backup e ajuste de saldo por grupo', { timeout: 60_000 }, () => {
    secao('backup')
    expect(auditar('backup')).toEqual([])
    secao('manutencao')
    fireEvent.change(document.querySelector('[data-guia="settings:manutencao.ajuste-grupo"]'), { target: { value: 'g1' } })
    expect(document.querySelector('[data-help-id="ajusteSaldo.esperado"]')).toBeTruthy()
    expect(auditar('ajusteSaldo')).toEqual([])
  })
  it('Identidade, tipos de documento e trocar senha', () => {
    render(<IdentidadeAmbiente />)
    expect(auditar('identidade')).toEqual([])
    cleanup()
    render(<TiposDocumentoPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Novo tipo/ }))
    expect(auditar('tipoDocumento')).toEqual([])
    cleanup()
    render(<TrocarSenhaModal open onClose={nada} />)
    expect(auditar('trocarSenha')).toEqual([])
  })
  it('Usuários: novo usuário personalizado, com perfis escolhidos', async () => {
    render(<UsuariosPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /Novo usuário/ }))
    fireEvent.change(document.getElementById('u-nivel'), { target: { value: 'personalizado' } })
    fireEvent.click(screen.getByText('Todos os perfis'))
    expect(document.querySelector('[data-help-id="usuario.permissoes"]')).toBeTruthy()
    expect(auditar('usuario')).toEqual([])
  })
  it('Feriados, apelidos da IA, de-para e controle gerencial', async () => {
    render(<FeriadosPanel />)
    expect(auditar('feriados')).toEqual([])
    cleanup()
    render(<ApelidosIaPanel />)
    await screen.findByDisplayValue('termo exemplo')
    expect(auditar('apelidos')).toEqual([])
    cleanup()
    render(<DeParaImportacaoPanel />)
    await screen.findByText('texto exemplo')
    expect(auditar('depara')).toEqual([])
    cleanup()
    render(<ControleGerencialChave />)
    expect(auditar('controleGerencial')).toEqual([])
  })
  it('Guias das telas', () => {
    render(<GuiasTelasPanel />)
    expect(auditar('guias')).toEqual([])
  })
})

it('a ajuda nunca usa o placeholder com exemplo', async () => {
  render(<TiposDocumentoPanel />)
  fireEvent.click(screen.getByRole('button', { name: /Novo tipo/ }))
  await waitFor(() => expect(document.querySelector('[data-help-id="tipoDocumento.sigla"] input').placeholder).toBe('Sigla curta'))
})
