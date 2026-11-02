// @vitest-environment jsdom
// Boas-vindas (resumo curto), checklist "Primeiros passos" (pendente/feita/pulada/não se aplica) e
// a ajuda "?" da tela. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import BoasVindasTour from './BoasVindasTour'
import PrimeirosPassos from './PrimeirosPassos'
import AjudaTela from './AjudaTela'
import { passosVisiveis, checklistComStatus, AJUDA_TELAS, PASSOS_BOAS_VINDAS, opcoesFinaisBoasVindas } from '../../lib/ajudaTelas'
import { montarContextoAjuda } from './contextoAjuda'
import { _reiniciarBoasVindas, abrirTour } from '../../lib/boasVindasApi'
import { navegarPara } from '../../lib/abrirTela'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../lib/api', async (orig) => ({ ...(await orig()), getSessao: () => ({ id: 'u1', nivel: 'admin' }) }))
vi.mock('../Schedule/ScheduleForm', () => ({ default: () => <p>form-agendamento</p> }))
vi.mock('../Schedule/ProvisaoForm', () => ({ default: () => <p>form-provisao</p> }))
vi.mock('../Assistente/Assistente', () => ({ default: () => <p>assistente</p> }))
vi.mock('../../lib/abrirTela', async (orig) => ({ ...(await orig()), navegarPara: vi.fn() }))

const PAGINAS = ['accounts', 'credit', 'schedule', 'transactions', 'cashflow', 'reservas', 'import', 'contratos']
function app({ ia = true, gerencial = true, paginas = PAGINAS, profiles = [], accounts = [], schedules = [], cardImports = [], contratos = [] } = {}) {
  const a = {
    podeVer: (p) => paginas.includes(p),
    pode: (m, acao) => (m === 'lancamentos' && acao === 'incluir' ? ia : true),
    settings: { controleGerencial: gerencial }, dbStatus: 'connected',
    profiles, accounts, schedules, cardImports, contratos, addProfile: vi.fn(() => 'prf_x'),
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
  banco = { tourVistoEm: null, checklistOcultoEm: null, guiasLigados: true, guiasOcultos: [], progresso: {} }
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    if (opts.method === 'POST') {
      const b = JSON.parse(opts.body)
      if (b.tourVisto) banco.tourVistoEm = banco.tourVistoEm || '2026-11-01T12:00:00Z'
      if (b.checklistOculto === true) banco.checklistOcultoEm = '2026-11-01T12:00:00Z'
      if (b.checklistOculto === false) banco.checklistOcultoEm = null
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
const ctxDe = (o = {}) => montarContextoAjuda({ podeVer: (p) => (o.paginas || PAGINAS).includes(p), pode: (m) => m !== 'lancamentos' || o.ia !== false, settings: { controleGerencial: o.gerencial !== false } })

describe('boas-vindas: resumo geral curto', () => {
  it('um passo por área, 1 frase cada; no máximo 9 áreas + "Como você quer continuar?"', () => {
    expect(PASSOS_BOAS_VINDAS.length).toBeLessThanOrEqual(9)
    for (const p of PASSOS_BOAS_VINDAS) expect(p.texto.split(/[.!?](\s|$)/).filter(t => t && t.trim()).length, p.id).toBe(1)
  })
  it('módulos desligados (IA, gerencial) e telas sem acesso não viram passo', () => {
    expect(passosVisiveis(ctxDe()).map(p => p.id)).toEqual(PASSOS_BOAS_VINDAS.map(p => p.id))
    expect(passosVisiveis(ctxDe({ ia: false })).map(p => p.id)).not.toContain('assistente')
    expect(passosVisiveis(ctxDe({ gerencial: false })).map(p => p.id)).not.toContain('gerencial')
    expect(passosVisiveis(ctxDe({ paginas: ['credit'] })).map(p => p.id)).toEqual(['perfis', 'cartao', 'painel', 'assistente'])
  })
  it('saídas finais desta fase: Começar a usar e Primeiros passos ("ver tudo em detalhes" ainda escondido)', () => {
    expect(opcoesFinaisBoasVindas().map(o => o.id)).toEqual(['usar', 'primeiros-passos'])
  })
  it('primeiro acesso: aparece; Avançar, Voltar, Pular etapa; "Pular" grava e não reaparece em outro navegador', async () => {
    app()
    render(<BoasVindasTour />)
    expect(await screen.findByText('Perfis (CPF/CNPJ)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }))
    expect(screen.getByText('Contas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pular etapa' }))
    expect(screen.getByText('Cartões')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByText('Contas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    await waitFor(() => expect(posts()).toEqual([{ tourVisto: true }]))
    expect(screen.queryByTestId('tour-boas-vindas')).toBeNull()
    cleanup(); _reiniciarBoasVindas()
    render(<BoasVindasTour />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(screen.queryByTestId('tour-boas-vindas')).toBeNull()
  })
  it('último passo: "Primeiros passos" leva ao Painel com o checklist; sem IA não há passo do Assistente', async () => {
    app({ ia: false })
    render(<BoasVindasTour />)
    await screen.findByText('Perfis (CPF/CNPJ)')
    for (let k = 0; k < 20 && screen.queryByRole('button', { name: 'Avançar' }); k++) fireEvent.click(screen.getByRole('button', { name: 'Avançar' }))
    expect(screen.getByText('Como você quer continuar?')).toBeTruthy()
    expect(screen.queryByText('Quero ver tudo em detalhes')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Primeiros passos/ }))
    expect(navegarPara).toHaveBeenCalledWith('dashboard')
    await waitFor(() => expect(posts()).toEqual([{ tourVisto: true }]))
  })
  it('"Começar a usar" fecha e marca como visto', async () => {
    app()
    render(<BoasVindasTour />)
    await screen.findByText('Perfis (CPF/CNPJ)')
    for (let k = 0; k < 20 && screen.queryByRole('button', { name: 'Avançar' }); k++) fireEvent.click(screen.getByRole('button', { name: 'Avançar' }))
    fireEvent.click(screen.getByRole('button', { name: /Começar a usar/ }))
    expect(screen.queryByTestId('tour-boas-vindas')).toBeNull()
    await waitFor(() => expect(posts()).toEqual([{ tourVisto: true }]))
  })
  it('"Rever tour" abre de novo mesmo depois de visto; com os guias desligados não abre sozinho', async () => {
    banco.tourVistoEm = '2026-10-01T00:00:00Z'
    app()
    render(<BoasVindasTour />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('tour-boas-vindas')).toBeNull()
    abrirTour()
    expect(await screen.findByText('Perfis (CPF/CNPJ)')).toBeTruthy()
    cleanup(); _reiniciarBoasVindas()
    banco.tourVistoEm = null; banco.guiasLigados = false
    render(<BoasVindasTour />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('tour-boas-vindas')).toBeNull()
  })
})

describe('primeiros passos: estados', () => {
  it('pendente / feita (pelos dados) / pulada / não se aplica; progresso fora do "não se aplica"', () => {
    const progresso = { etapas: { agendamento: { estado: 'pulada' }, cartao: { estado: 'nao-se-aplica' } } }
    const r = checklistComStatus(ctxDe({ ia: false }), { profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }], schedules: [], progresso })
    const est = Object.fromEntries(r.itens.map(i => [i.id, i.estado]))
    expect(est).toMatchObject({ perfil: 'feita', conta: 'feita', cartao: 'nao-se-aplica', agendamento: 'pulada', provisao: 'pendente', reserva: 'pendente', contrato: 'pendente' })
    expect(est['importar-fatura']).toBeUndefined() // depende do cartão, que não se aplica
    expect(est.assistente).toBeUndefined() // IA desligada
    expect(r.total).toBe(r.itens.length - 1)
    expect(r.feitas).toBe(2)
  })
  it('feita pelos dados: provisão, reserva, fatura importada, contrato; conta sem perfil não conta', () => {
    const r = checklistComStatus(ctxDe(), {
      profiles: [], accounts: [{ id: 'a', type: 'checking', profileId: null }, { id: 'r', type: 'savings', isReserva: true }],
      schedules: [{ id: 's', isProvisao: true }], cardImports: [{ id: 'i', filename: 'fatura.xlsx' }], contratos: [{ id: 'c' }],
      progresso: { etapas: { assistente: { estado: 'feita' } } },
    })
    const est = Object.fromEntries(r.itens.map(i => [i.id, i.estado]))
    expect(est).toMatchObject({ conta: 'pendente', agendamento: 'pendente', provisao: 'feita', reserva: 'feita', 'importar-fatura': 'feita', contrato: 'feita', assistente: 'feita' })
  })
  it('na tela: progresso; "Não tenho cartão de crédito" sai do progresso; "Ver etapas puladas" desfaz', async () => {
    app({ ia: false, profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }], schedules: [{ id: 's' }] })
    render(<PrimeirosPassos />)
    expect((await screen.findByTestId('progresso-checklist')).textContent).toMatch(/3 de 8 concluídas/)
    fireEvent.click(screen.getByRole('button', { name: 'Não tenho cartão de crédito' }))
    await waitFor(() => expect(banco.progresso.etapas.cartao.estado).toBe('nao-se-aplica'))
    await waitFor(() => expect(screen.getByTestId('progresso-checklist').textContent).toMatch(/3 de 6 concluídas/)) // cartão e importar fatura saem
    fireEvent.click(screen.getByRole('button', { name: /Ver etapas puladas \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(banco.progresso.etapas.cartao).toBeUndefined())
  })
  it('perfil não tem "não se aplica": "Pular por enquanto" mostra o aviso de "Sem vínculo" antes', async () => {
    app()
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    const linha = screen.getByText('Criar o seu perfil (CPF ou CNPJ)').closest('li')
    expect(linha.textContent).not.toMatch(/Não tenho/)
    fireEvent.click(Array.from(linha.querySelectorAll('button')).find(b => b.textContent === 'Pular por enquanto'))
    expect(screen.getByRole('alert').textContent).toMatch(/Sem vínculo/)
    fireEvent.click(screen.getByRole('button', { name: 'Pular mesmo assim' }))
    await waitFor(() => expect(banco.progresso.etapas.perfil.estado).toBe('pulada'))
    fireEvent.click(screen.getByRole('button', { name: /Ver etapas puladas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }))
    await waitFor(() => expect(banco.progresso.etapas.perfil).toBeUndefined())
  })
  it('"Ocultar" grava e some; tudo pulado: não aparece; guias desligados: não aparece', async () => {
    app()
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }))
    await waitFor(() => expect(screen.queryByTestId('primeiros-passos')).toBeNull())
    cleanup(); _reiniciarBoasVindas()
    banco.checklistOcultoEm = null
    banco.progresso = { etapas: Object.fromEntries(['perfil', 'conta', 'cartao', 'agendamento', 'provisao', 'reserva', 'importar-fatura', 'contrato', 'assistente'].map(id => [id, { estado: 'pulada' }])) }
    app()
    render(<PrimeirosPassos />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('primeiros-passos')).toBeNull()
    cleanup(); _reiniciarBoasVindas()
    banco.progresso = {}; banco.guiasLigados = false
    app()
    render(<PrimeirosPassos />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('primeiros-passos')).toBeNull()
  })
  it('"Fazer agora" ainda abre o formulário (perfil sem nenhum perfil: cadastro rápido)', async () => {
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
