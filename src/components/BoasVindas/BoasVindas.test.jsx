// @vitest-environment jsdom
// Boas-vindas, checklist "Primeiros passos" e ajuda por tela. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import BoasVindasTour from './BoasVindasTour'
import PrimeirosPassos from './PrimeirosPassos'
import AjudaTela from './AjudaTela'
import { passosVisiveis, checklistComStatus, AJUDA_TELAS, PASSOS_BOAS_VINDAS } from '../../lib/ajudaTelas'
import { montarContextoAjuda } from './contextoAjuda'
import { _reiniciarBoasVindas, abrirTour } from '../../lib/boasVindasApi'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../lib/api', async (orig) => ({ ...(await orig()), getSessao: () => ({ id: 'u1', nivel: 'admin' }) }))
vi.mock('../Schedule/ScheduleForm', () => ({ default: () => <p>form-agendamento</p> }))

const PAGINAS = ['accounts', 'credit', 'schedule', 'transactions', 'cashflow', 'reservas', 'import']
function app({ ia = true, gerencial = true, paginas = PAGINAS, profiles = [], accounts = [], schedules = [] } = {}) {
  const a = {
    podeVer: (p) => paginas.includes(p),
    pode: (m, acao) => (m === 'lancamentos' && acao === 'incluir' ? ia : true),
    settings: { controleGerencial: gerencial }, dbStatus: 'connected',
    profiles, accounts, schedules, addProfile: vi.fn(() => 'prf_x'),
    accountGroups: [], activeAccountGroups: [], categories: [], addAccount: vi.fn(), updateAccount: vi.fn(),
    recalcularSaldo: vi.fn(), activeProfileId: null, setAvisoToast: vi.fn(),
  }
  useApp.mockReturnValue(a)
  return a
}

// Servidor falso de /api/boas-vindas
let banco
beforeEach(() => {
  _reiniciarBoasVindas()
  banco = { tourVistoEm: null, checklistOcultoEm: null }
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    if (opts.method === 'POST') {
      const b = JSON.parse(opts.body)
      if (b.tourVisto) banco.tourVistoEm = banco.tourVistoEm || '2026-11-01T12:00:00Z'
      if (b.checklistOculto === true) banco.checklistOcultoEm = '2026-11-01T12:00:00Z'
    }
    return { ok: true, status: 200, json: async () => ({ ...banco }) }
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })
const posts = () => fetch.mock.calls.filter(([, o]) => o?.method === 'POST').map(([, o]) => JSON.parse(o.body))

describe('passos do tour conforme o ambiente', () => {
  it('IA e gerencial desligados: os passos deles não aparecem', () => {
    const ids = (o) => passosVisiveis(montarContextoAjuda({ podeVer: (p) => PAGINAS.includes(p), pode: (m) => m !== 'lancamentos' || o.ia, settings: { controleGerencial: o.gerencial } })).map(p => p.id)
    expect(ids({ ia: true, gerencial: true })).toEqual(PASSOS_BOAS_VINDAS.map(p => p.id))
    expect(ids({ ia: false, gerencial: true })).not.toContain('assistente')
    expect(ids({ ia: true, gerencial: false })).not.toContain('gerencial')
  })
  it('tela que o usuário não vê no menu não vira passo; a dica do Importar Fatura só se ele existir', () => {
    const ctx = montarContextoAjuda({ podeVer: (p) => p === 'credit', pode: () => true, settings: {} })
    const passos = passosVisiveis(ctx)
    expect(passos.map(p => p.id)).not.toContain('contas')
    expect(passos.find(p => p.id === 'cartao').dica).toBeNull()
  })
  it('checklist: status pelos dados; conta só conta com perfil', () => {
    const ctx = montarContextoAjuda({ podeVer: () => true, pode: () => true, settings: {} })
    const r = checklistComStatus(ctx, { profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: null }, { id: 'c', type: 'credit' }], schedules: [] })
    expect(r.itens.map(i => [i.id, i.feito])).toEqual([['perfil', true], ['conta', false], ['cartao', true], ['agendamento', false]])
    expect(r.completo).toBe(false)
  })
  it('toda tela do menu tem guia com descrição e itens', () => {
    for (const p of ['dashboard', 'accounts', 'credit', 'schedule', 'import', 'importar-lancamentos', 'cashflow', 'transactions', 'reservas', 'envelopes', 'budget', 'patrimonio', 'contratos', 'reports', 'alerts', 'settings', 'assistente', 'inicio', 'mais', 'despesas']) {
      expect(AJUDA_TELAS[p]?.descricao, p).toBeTruthy()
      expect(AJUDA_TELAS[p].itens.length, p).toBeGreaterThan(0)
    }
  })
})

describe('tour de boas-vindas', () => {
  it('primeiro acesso: aparece; "Pular" grava no banco e não reaparece', async () => {
    app()
    render(<BoasVindasTour />)
    expect(await screen.findByText('Bem-vindo ao Finup!')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByText('Perfis (CPF/CNPJ)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    await waitFor(() => expect(posts()).toEqual([{ tourVisto: true }]))
    expect(screen.queryByTestId('tour-boas-vindas')).toBeNull()
    // "outro navegador": estado novo, o banco já diz que viu
    cleanup(); _reiniciarBoasVindas()
    render(<BoasVindasTour />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(screen.queryByTestId('tour-boas-vindas')).toBeNull()
  })
  it('"Rever tour" abre de novo mesmo depois de visto', async () => {
    banco.tourVistoEm = '2026-10-01T00:00:00Z'
    app()
    render(<BoasVindasTour />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('tour-boas-vindas')).toBeNull()
    abrirTour()
    expect(await screen.findByText('Bem-vindo ao Finup!')).toBeTruthy()
  })
  it('último passo: "Primeiros passos" com os atalhos; sem IA não há passo do Assistente', async () => {
    app({ ia: false })
    render(<BoasVindasTour />)
    await screen.findByText('Bem-vindo ao Finup!')
    const titulos = []
    for (let k = 0; k < 20; k++) {
      titulos.push(screen.getByRole('heading', { level: 3 }).textContent)
      const prox = screen.queryByRole('button', { name: 'Próximo' })
      if (!prox) break
      fireEvent.click(prox)
    }
    expect(titulos).not.toContain('Assistente')
    expect(titulos.at(-1)).toBe('Primeiros passos')
    expect(screen.getByRole('button', { name: /Criar ou conferir perfil/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Criar o primeiro agendamento/ })).toBeTruthy()
  })
})

describe('checklist Primeiros passos', () => {
  it('aparece enquanto falta algo; "Ocultar" grava e some', async () => {
    app()
    render(<PrimeirosPassos />)
    expect(await screen.findByTestId('primeiros-passos')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Fazer agora' })).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    await waitFor(() => expect(screen.queryByTestId('primeiros-passos')).toBeNull())
    expect(posts()).toEqual([{ checklistOculto: true }])
  })
  it('tudo feito: não aparece', async () => {
    app({ profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }, { id: 'c', type: 'credit' }], schedules: [{ id: 's' }] })
    render(<PrimeirosPassos />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('primeiros-passos')).toBeNull()
  })
  it('"Fazer agora" do perfil sem nenhum perfil: abre o cadastro rápido', async () => {
    const a = app()
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    fireEvent.click(screen.getAllByRole('button', { name: 'Fazer agora' })[0])
    fireEvent.change(screen.getByPlaceholderText('Nome da pessoa'), { target: { value: 'Pessoa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }))
    expect(a.addProfile).toHaveBeenCalled()
  })
})

describe('ajuda da tela', () => {
  it('"?" abre o guia com a descrição, os itens numerados e as dicas', () => {
    app()
    render(<AjudaTela pagina="accounts" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Contas' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver todas as funções desta tela' }))
    const guia = screen.getByTestId('guia-tela')
    expect(guia.textContent).toContain(AJUDA_TELAS.accounts.descricao)
    expect(guia.textContent).toContain('Nova Conta')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByTestId('guia-tela')).toBeNull()
  })
  it('tela sem texto de ajuda: sem botão', () => {
    const { container } = render(<AjudaTela pagina="inexistente" />)
    expect(container.innerHTML).toBe('')
  })
})
