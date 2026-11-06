// @vitest-environment jsdom
// Jornada guiada: painel de progresso, conclusão automática pelo dado, "Entendi", pular/retomar,
// liga/desliga e boas-vindas. Servidor de /api/boas-vindas falso; dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import PrimeirosPassos from './PrimeirosPassos'
import JornadaBoasVindas from './JornadaBoasVindas'
import JornadaBarra from './JornadaBarra'
import { _reiniciarBoasVindas } from '../../lib/boasVindasApi'
import { _reiniciarJornada } from './jornadaEstado'
import { navegarPara } from '../../lib/abrirTela'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../lib/api', async (orig) => ({ ...(await orig()), getSessao: () => ({ id: 'u1', nivel: 'admin' }) }))
vi.mock('../Schedule/ScheduleForm', () => ({ default: () => <p>form-agendamento</p> }))
vi.mock('../Schedule/ProvisaoForm', () => ({ default: () => <p>form-provisao</p> }))
vi.mock('../Assistente/Assistente', () => ({ default: () => <p>assistente</p> }))
vi.mock('../../lib/abrirTela', async (orig) => ({ ...(await orig()), navegarPara: vi.fn() }))

const PAGINAS = ['settings', 'accounts', 'credit', 'transactions', 'schedule', 'cashflow', 'reports']
function app({ profiles = [], accounts = [], transactions = [], schedules = [], pode } = {}) {
  const a = {
    podeVer: (p) => PAGINAS.includes(p), pode: pode || (() => true),
    settings: {}, dbStatus: 'connected', usuario: { nome: 'Ana Souza' },
    profiles, accounts, transactions, schedules, cardImports: [], contratos: [], addProfile: vi.fn(() => 'prf_x'),
    accountGroups: [], activeAccountGroups: [], categories: [], addAccount: vi.fn(), updateAccount: vi.fn(),
    recalcularSaldo: vi.fn(), activeProfileId: null, setAvisoToast: vi.fn(),
  }
  useApp.mockReturnValue(a)
  return a
}

let banco
beforeEach(() => {
  _reiniciarBoasVindas(); _reiniciarJornada()
  banco = { tourVistoEm: '2026-11-01T00:00:00Z', checklistOcultoEm: null, guiasLigados: true, jornadaLigada: true, guiasOcultos: [], progresso: {} }
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    if (opts.method === 'POST') {
      const b = JSON.parse(opts.body)
      if (b.tourVisto) banco.tourVistoEm = banco.tourVistoEm || '2026-11-01T12:00:00Z'
      if (b.checklistOculto === true) banco.checklistOcultoEm = '2026-11-01T12:00:00Z'
      if ('jornadaLigada' in b) banco.jornadaLigada = b.jornadaLigada
      if ('etapa' in b) {
        const etapas = { ...(banco.progresso.etapas || {}) }
        if (b.estado) etapas[b.etapa] = { estado: b.estado, em: 'x' }; else delete etapas[b.etapa]
        banco.progresso = { ...banco.progresso, etapas }
      }
    }
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(banco)) }
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })
const posts = () => fetch.mock.calls.filter(([, o]) => o?.method === 'POST').map(([, o]) => JSON.parse(o.body))
const progresso = () => screen.getByTestId('progresso-jornada').textContent
const CONFIG_VISTA = { 'j-configuracoes': { estado: 'feita' }, 'j-categorias': { estado: 'feita' } }

describe('painel da jornada', () => {
  it('"Sua jornada" conta o que já existe no banco; próximo passo; a barra acompanha e "Entendi ✔" conclui', async () => {
    app({ profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }], schedules: [{ id: 's' }] })
    render(<><PrimeirosPassos /><JornadaBarra /></>)
    await screen.findByTestId('primeiros-passos')
    // 2 conhecer (config) + perfil, conta, cartão + lançamento, agendamento + painel, fluxo, relatórios = 10
    expect(progresso()).toBe('3/10')
    expect(screen.getByTestId('proximo-passo').textContent).toBe('Onde ficam os cadastros')
    fireEvent.click(screen.getByRole('button', { name: /Continuar de onde parei/ }))
    expect(navegarPara).toHaveBeenCalledWith('settings', {})
    const barra = await screen.findByTestId('jornada-barra')
    fireEvent.click(Array.from(barra.querySelectorAll('button')).find(b => b.textContent === 'Entendi ✔'))
    await waitFor(() => expect(banco.progresso.etapas['j-configuracoes'].estado).toBe('feita'))
    await waitFor(() => expect(progresso()).toBe('4/10'))
  })

  it('passo "fazer" conclui sozinho quando o dado aparece (sem clique nem gravação)', async () => {
    app()
    const { rerender } = render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    expect(progresso()).toBe('0/10')
    app({ profiles: [{ id: 'p1' }] })
    rerender(<PrimeirosPassos />)
    expect(progresso()).toBe('1/10')
    expect(posts()).toEqual([])
  })

  it('"não se aplica" sai do total e pode ser desfeito', async () => {
    app({ profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }] })
    banco.progresso = { etapas: CONFIG_VISTA }
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    expect(progresso()).toBe('4/10')
    fireEvent.click(screen.getByRole('button', { name: 'Não tenho cartão de crédito' }))
    await waitFor(() => expect(progresso()).toBe('4/9'))
    fireEvent.click(screen.getByRole('button', { name: /Ver etapas puladas \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(banco.progresso.etapas.cartao).toBeUndefined())
  })

  it('perfil: pular pede confirmação; sem tarefa disponível, "Fazer comigo" abre o cadastro rápido', async () => {
    const a = app({ pode: (m) => m !== 'configuracoes' })
    banco.progresso = { etapas: CONFIG_VISTA }
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    fireEvent.click(screen.getAllByRole('button', { name: 'Pular por enquanto' })[0])
    expect(screen.getByRole('alert').textContent).toMatch(/Sem vínculo/)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Fazer comigo' })[0])
    fireEvent.change(screen.getByPlaceholderText('Nome da pessoa'), { target: { value: 'Pessoa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }))
    expect(a.addProfile).toHaveBeenCalled()
  })
})

describe('liga/desliga e conclusão', () => {
  it('desligada: sem painel e sem boas-vindas; religar retoma sem perder os checks', async () => {
    banco.jornadaLigada = false
    banco.tourVistoEm = null
    banco.progresso = { etapas: { 'j-configuracoes': { estado: 'feita' } } }
    app()
    render(<><PrimeirosPassos /><JornadaBoasVindas /></>)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('primeiros-passos')).toBeNull()
    expect(screen.queryByTestId('jornada-boas-vindas')).toBeNull()
    cleanup(); _reiniciarBoasVindas()
    banco.jornadaLigada = true; banco.tourVistoEm = '2026-11-01T00:00:00Z'
    app()
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    expect(progresso()).toBe('1/10')
  })

  it('tudo concluído: parabéns, e "Fechar" tira o painel', async () => {
    const conhecer = ['j-configuracoes', 'j-categorias', 'j-painel', 'j-fluxo', 'j-relatorios']
    banco.progresso = { etapas: { ...Object.fromEntries(conhecer.map(id => [id, { estado: 'feita' }])), cartao: { estado: 'nao-se-aplica' } } }
    app({ profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }], transactions: [{ id: 't', type: 'expense' }], schedules: [{ id: 's' }] })
    render(<PrimeirosPassos />)
    expect((await screen.findByTestId('primeiros-passos')).textContent).toMatch(/Parabéns/)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByTestId('primeiros-passos')).toBeNull())
  })
})

describe('boas-vindas da jornada', () => {
  it('primeiro acesso: "Olá, {nome}!", mapa dos módulos; "Começar" marca visto e abre o 1º passo', async () => {
    banco.tourVistoEm = null
    app()
    render(<JornadaBoasVindas />)
    const modal = await screen.findByTestId('jornada-boas-vindas')
    expect(modal.textContent).toMatch(/Olá, Ana!/)
    expect(modal.textContent).toMatch(/Vou te levar para conhecer o sistema passo a passo/)
    fireEvent.click(screen.getByRole('button', { name: /Começar/ }))
    await waitFor(() => expect(posts()).toEqual([{ tourVisto: true }]))
    expect(navegarPara).toHaveBeenCalledWith('settings', {})
  })

  it('"Já sei usar, pular" marca visto e desliga a jornada', async () => {
    banco.tourVistoEm = null
    app()
    render(<JornadaBoasVindas />)
    await screen.findByTestId('jornada-boas-vindas')
    fireEvent.click(screen.getByRole('button', { name: 'Já sei usar, pular' }))
    await waitFor(() => expect(posts()).toEqual([{ tourVisto: true }, { jornadaLigada: false }]))
    expect(banco.jornadaLigada).toBe(false)
  })
})
