// @vitest-environment jsdom
// Jornada guiada: painel compacto/expandido, contador sem Extras, pulado como resolvido, "Entendi" só
// depois do tour, tour da jornada sem links de desligar (mesmo com guias desligados), aviso de
// pré-requisito, atalho por objetivo, liga/desliga. Servidor de /api/boas-vindas falso; dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import PrimeirosPassos from './PrimeirosPassos'
import JornadaBoasVindas from './JornadaBoasVindas'
import JornadaBarra from './JornadaBarra'
import GuiaInterativo from './GuiaInterativo'
import AvisoPrerequisitos from './AvisoPrerequisitos'
import { _reiniciarBoasVindas } from '../../lib/boasVindasApi'
import { _reiniciarJornada } from './jornadaEstado'
import { _reiniciarTour, tourAtivo } from './tourEstado'
import { navegarPara } from '../../lib/abrirTela'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../lib/api', async (orig) => ({ ...(await orig()), getSessao: () => ({ id: 'u1', nivel: 'admin' }) }))
vi.mock('../Schedule/ScheduleForm', () => ({ default: () => <p>form-agendamento</p> }))
vi.mock('../Schedule/ProvisaoForm', () => ({ default: () => <p>form-provisao</p> }))
vi.mock('../Assistente/Assistente', () => ({ default: () => <p>assistente</p> }))
vi.mock('../../lib/abrirTela', async (orig) => ({ ...(await orig()), navegarPara: vi.fn() }))

const PAGINAS = ['settings', 'accounts', 'credit', 'transactions', 'schedule', 'cashflow', 'reports']
function app({ profiles = [], accounts = [], transactions = [], schedules = [], reserveFunctions = [], contratos = [], pode, paginas = PAGINAS } = {}) {
  const a = {
    podeVer: (p) => paginas.includes(p), pode: pode || (() => true),
    settings: {}, dbStatus: 'connected', usuario: { nome: 'Ana Souza' },
    profiles, accounts, transactions, schedules, reserveFunctions, cardImports: [], contratos, addProfile: vi.fn(() => 'prf_x'),
    accountGroups: [], activeAccountGroups: [], categories: [], addAccount: vi.fn(), updateAccount: vi.fn(),
    recalcularSaldo: vi.fn(), activeProfileId: null, setAvisoToast: vi.fn(),
  }
  useApp.mockReturnValue(a)
  return a
}

let banco
beforeEach(() => {
  _reiniciarBoasVindas(); _reiniciarJornada(); _reiniciarTour()
  banco = { tourVistoEm: '2026-11-01T00:00:00Z', checklistOcultoEm: null, guiasLigados: true, jornadaLigada: true, guiasOcultos: [], progresso: {} }
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    if (opts.method === 'POST') {
      const b = JSON.parse(opts.body)
      if (b.tourVisto) banco.tourVistoEm = banco.tourVistoEm || '2026-11-01T12:00:00Z'
      if (b.checklistOculto === true) banco.checklistOcultoEm = '2026-11-01T12:00:00Z'
      if ('jornadaLigada' in b) banco.jornadaLigada = b.jornadaLigada
      if ('jornadaExpandida' in b) banco.progresso = { ...banco.progresso, jornadaExpandida: b.jornadaExpandida }
      if ('jornadaObjetivo' in b) banco.progresso = { ...banco.progresso, objetivo: b.jornadaObjetivo }
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
const COM_CONTA = { profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }] }
const expandir = () => fireEvent.click(screen.getByRole('button', { name: /Ver fases/ }))

describe('painel compacto', () => {
  it('padrão compacto: contador, próximo passo e continuar, sem a lista; "Ver fases" expande e grava; "Recolher" volta', async () => {
    app({ ...COM_CONTA, schedules: [{ id: 's' }] })
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    // 2 conhecer (config) + perfil, conta, cartão + lançamento, agendamento + painel, fluxo, relatórios = 10
    expect(progresso()).toBe('3/10')
    expect(screen.getByTestId('proximo-passo').textContent).toBe('Onde ficam os cadastros')
    expect(screen.getByRole('button', { name: /Continuar de onde parei/ })).toBeTruthy()
    expect(screen.queryByTestId('fase-cadastros')).toBeNull()
    expandir()
    await screen.findByTestId('fase-cadastros')
    await waitFor(() => expect(posts()).toEqual([{ jornadaExpandida: true }]))
    fireEvent.click(screen.getByRole('button', { name: /Recolher/ }))
    await waitFor(() => expect(screen.queryByTestId('fase-cadastros')).toBeNull())
  })

  it('a escolha vem do banco; na Central de Ajuda fica sempre expandido', async () => {
    banco.progresso = { jornadaExpandida: true }
    app()
    render(<PrimeirosPassos />)
    await screen.findByTestId('fase-cadastros')
    cleanup(); _reiniciarBoasVindas()
    banco.progresso = {}
    app()
    render(<PrimeirosPassos expandido />)
    await screen.findByTestId('fase-cadastros')
    expect(screen.queryByRole('button', { name: /Ver fases/ })).toBeNull()
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
    app(COM_CONTA)
    banco.progresso = { etapas: CONFIG_VISTA, jornadaExpandida: true }
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
    banco.progresso = { etapas: CONFIG_VISTA, jornadaExpandida: true }
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

describe('conclusão: Extras fora do contador, pulado resolvido', () => {
  const CONHECER = ['j-configuracoes', 'j-categorias', 'j-painel', 'j-fluxo', 'j-relatorios']
  const vistos = Object.fromEntries(CONHECER.map(id => [id, { estado: 'feita' }]))
  const TUDO = { ...COM_CONTA, transactions: [{ id: 't', type: 'expense' }], schedules: [{ id: 's' }] }

  it('Extras não entra no x/y e não bloqueia os parabéns; aparece recolhido com o próprio x/y', async () => {
    banco.progresso = { etapas: { ...vistos, cartao: { estado: 'nao-se-aplica' } } }
    app({ ...TUDO, paginas: [...PAGINAS, 'contratos', 'reservas'] })
    render(<PrimeirosPassos />)
    const painel = await screen.findByTestId('primeiros-passos')
    expect(painel.textContent).toMatch(/Parabéns/)
    const extras = screen.getByTestId('fase-extras')
    expect(extras.textContent).toMatch(/Extras \(opcional\)/)
    expect(extras.textContent).toMatch(/0\/3/) // conta de reserva, função e contrato (importar some sem cartão)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByTestId('primeiros-passos')).toBeNull())
  })

  it('com Extras pendente, o contador mostra só as fases principais', async () => {
    app({ paginas: [...PAGINAS, 'contratos', 'reservas'] })
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    expect(progresso()).toBe('0/10')
  })

  it('pulado conta como resolvido para os parabéns e continua retomável; contador "x/y · n pulados"', async () => {
    banco.progresso = { etapas: { ...vistos, cartao: { estado: 'pulada' }, lancamento: { estado: 'pulada' } }, jornadaExpandida: true }
    app({ ...COM_CONTA, schedules: [{ id: 's' }] })
    render(<PrimeirosPassos />)
    const painel = await screen.findByTestId('primeiros-passos')
    expect(painel.textContent).toMatch(/Parabéns/)
    fireEvent.click(screen.getByRole('button', { name: /Ver etapas puladas \(2\)/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Retomar' })[0])
    await waitFor(() => expect(screen.getByTestId('pulados-jornada').textContent).toMatch(/1 pulado/))
    expect(progresso()).toBe('8/10')
  })
})

describe('tour aberto pela jornada', () => {
  const abrirTour = async () => {
    app(COM_CONTA)
    render(<><PrimeirosPassos /><JornadaBarra /><GuiaInterativo /></>)
    await screen.findByTestId('primeiros-passos')
    fireEvent.click(screen.getByRole('button', { name: /Continuar de onde parei/ }))
    expect(navegarPara).toHaveBeenCalledWith('settings', {})
    // Enquanto a tela abre, a barra já está esmaecida e sem "Entendi".
    expect(screen.getByTestId('jornada-barra').dataset.emTour).toBe('sim')
    return screen.findByTestId('tour-tela', {}, { timeout: 2000 })
  }
  const barraBotao = (nome) => Array.from(screen.getByTestId('jornada-barra').querySelectorAll('button')).find(b => b.textContent.includes(nome))

  it('sem links de desligar; "Entendi" só depois do tour: até o fim mostra "Concluir este passo?"', async () => {
    const tour = await abrirTour()
    expect(tour.textContent).not.toMatch(/Não quero guias/)
    expect(tour.textContent).not.toMatch(/Não mostrar mais nesta tela/)
    const barra = screen.getByTestId('jornada-barra')
    expect(barra.textContent).toMatch(/Siga o tour da tela/)
    expect(barraBotao('Entendi')).toBeUndefined()
    for (let k = 0; k < 60 && screen.queryByTestId('tour-tela'); k++) {
      fireEvent.click(screen.getByRole('button', { name: /^(Próximo|Concluir)$/ }))
    }
    await waitFor(() => expect(screen.getByTestId('jornada-barra').textContent).toMatch(/Concluir este passo\?/))
    expect(barraBotao('Próximo:')).toBeTruthy()
    expect(barraBotao('Ver de novo')).toBeUndefined()
    fireEvent.click(barraBotao('Entendi'))
    await waitFor(() => expect(banco.progresso.etapas['j-configuracoes'].estado).toBe('feita'))
    expect(posts().some(p => 'guiaOculto' in p)).toBe(false) // preferências dos guias intactas
  })

  it('fechado no meio: "Entendi ✔" e "Ver de novo", sem "Concluir este passo?"', async () => {
    await abrirTour()
    fireEvent.click(screen.getByRole('button', { name: 'Pular tour' }))
    await waitFor(() => expect(barraBotao('Entendi')).toBeTruthy())
    expect(barraBotao('Ver de novo')).toBeTruthy()
    expect(screen.getByTestId('jornada-barra').textContent).not.toMatch(/Concluir este passo/)
    expect(posts()).toEqual([])
  })

  it('abre com os guias das telas desligados e com a tela oculta, sem mudar essas preferências', async () => {
    banco.guiasLigados = false
    banco.guiasOcultos = ['settings']
    await abrirTour()
    expect(tourAtivo()).toMatchObject({ tipo: 'tour', tela: 'settings', jornada: true })
    fireEvent.click(screen.getByRole('button', { name: 'Pular tour' }))
    await waitFor(() => expect(tourAtivo()).toBeNull())
    expect(posts()).toEqual([])
    expect(banco.guiasLigados).toBe(false)
    expect(banco.guiasOcultos).toEqual(['settings'])
  })

  it('"Fazer comigo" abre a tarefa pela jornada, mesmo com os guias desligados', async () => {
    banco.guiasLigados = false
    banco.progresso = { etapas: CONFIG_VISTA }
    app()
    render(<><PrimeirosPassos /><GuiaInterativo /></>)
    await screen.findByTestId('primeiros-passos')
    fireEvent.click(screen.getByRole('button', { name: /Continuar de onde parei/ }))
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa', tarefaId: 'settings.perfil-cpf', jornada: true })
    expect(posts()).toEqual([])
  })
})

describe('aviso de pré-requisito (fora da jornada)', () => {
  it('sem perfil e sem conta: lista ⬜ e "Fazer agora" abre o "Faça comigo"; vale com a jornada desligada', async () => {
    banco.jornadaLigada = false
    const onIr = vi.fn()
    app()
    render(<AvisoPrerequisitos funcao="contrato" onIr={onIr} />)
    const aviso = screen.getByTestId('aviso-prerequisitos')
    expect(aviso.textContent).toMatch(/Para cadastrar um contrato você precisa antes de/)
    expect(aviso.textContent).toMatch(/Criar o seu perfil/)
    expect(aviso.textContent).toMatch(/Cadastrar a primeira conta/)
    fireEvent.click(screen.getAllByRole('button', { name: 'Fazer agora' })[0])
    expect(onIr).toHaveBeenCalled()
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa', tarefaId: 'settings.perfil-cpf' })
  })

  it('parte feita: ✅ no que já existe e botão só no que falta; com tudo, não aparece', () => {
    const a = app({ profiles: [{ id: 'p' }] })
    a.categories = [{ id: 'cat_1' }]
    const { unmount } = render(<AvisoPrerequisitos funcao="contrato" />)
    expect(screen.getAllByRole('button', { name: 'Fazer agora' })).toHaveLength(1)
    expect(screen.getAllByLabelText('já feito')).toHaveLength(2)
    unmount()
    const b = app(COM_CONTA)
    b.categories = [{ id: 'cat_1' }]
    render(<AvisoPrerequisitos funcao="contrato" />)
    expect(screen.queryByTestId('aviso-prerequisitos')).toBeNull()
  })

  it('ambiente sem categoria (só a do sistema): Novo Contrato avisa e "Fazer agora" abre o "Faça comigo" de categoria', () => {
    const a = app(COM_CONTA)
    a.categories = [{ id: 'cat_res_ger' }]
    render(<AvisoPrerequisitos funcao="contrato" />)
    expect(screen.getByTestId('aviso-prerequisitos').textContent).toMatch(/Criar uma categoria/)
    fireEvent.click(screen.getByRole('button', { name: 'Fazer agora' }))
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa', tarefaId: 'settings.categoria' })
  })

  it('lançamento aceita conta ou cartão; não aparece enquanto os dados não carregaram', () => {
    app({ accounts: [{ id: 'c', type: 'credit' }] })
    render(<AvisoPrerequisitos funcao="lancamento" />)
    expect(screen.queryByTestId('aviso-prerequisitos')).toBeNull()
    cleanup()
    const a = app()
    a.dbStatus = 'connecting'
    render(<AvisoPrerequisitos funcao="lancamento" />)
    expect(screen.queryByTestId('aviso-prerequisitos')).toBeNull()
  })
})

describe('atalho por objetivo', () => {
  it('no painel expandido: escolhe o objetivo, grava e abre o 1º passo que falta; só os passos necessários', async () => {
    banco.progresso = { jornadaExpandida: true }
    app({ paginas: [...PAGINAS, 'contratos'] })
    render(<PrimeirosPassos />)
    const lista = await screen.findByTestId('objetivos-jornada')
    expect(lista.textContent).toMatch(/Quero ir direto para/)
    expect(lista.textContent).not.toMatch(/Montar reservas/) // módulo sem acesso
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar um contrato' }))
    await waitFor(() => expect(posts()).toEqual([{ jornadaObjetivo: 'contrato' }]))
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa', tarefaId: 'settings.perfil-cpf' })
    const obj = await screen.findByTestId('objetivo-jornada')
    expect(obj.textContent).toMatch(/Cadastrar um contrato · 3 passos até lá/)
    expect(screen.getByTestId('proximo-passo').textContent).toBe('Criar o seu perfil')
  })

  it('ao concluir o objetivo, a jornada volta ao normal', async () => {
    banco.progresso = { objetivo: 'contas-pagar' }
    app({ ...COM_CONTA, schedules: [{ id: 's' }] })
    render(<PrimeirosPassos />)
    await screen.findByTestId('primeiros-passos')
    await waitFor(() => expect(posts()).toEqual([{ jornadaObjetivo: null }]))
    expect(screen.queryByTestId('objetivo-jornada')).toBeNull()
  })

  it('nas boas-vindas: objetivo marca visto e leva ao passo', async () => {
    banco.tourVistoEm = null
    app(COM_CONTA)
    render(<JornadaBoasVindas />)
    await screen.findByTestId('objetivos-boas-vindas')
    fireEvent.click(screen.getByRole('button', { name: 'Controlar meu cartão' }))
    await waitFor(() => expect(posts()).toEqual([{ tourVisto: true }, { jornadaObjetivo: 'cartao' }]))
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa', tarefaId: 'accounts.cadastrar-cartao' })
  })
})

describe('liga/desliga', () => {
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
