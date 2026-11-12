// @vitest-environment jsdom
// Central de Ajuda: busca, âncoras (#ajuda/<tela>/<item>), "Mostrar na tela" (tour no item certo),
// "Faça comigo" (inicia a tarefa), módulos desligados e permissões escondendo seções. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import CentralAjuda from './CentralAjuda'
import { telaNaAjuda, rotaDaTela, tarefaDaSecao, montarIndice, buscar, telasDaAjuda } from './centralAjudaRegras'
import { _reiniciarTour, tourAtivo } from '../BoasVindas/tourEstado'
import { montarContextoAjuda } from '../BoasVindas/contextoAjuda'
import { AJUDA_TELAS, opcoesFinaisBoasVindas } from '../../lib/ajudaTelas'
import { TAREFAS } from '../../lib/tarefasGuiadas'
import { PERGUNTAS_FREQUENTES, perguntasVisiveis } from '../../lib/perguntasFrequentes'
import { ajudaHash, parseAjudaHash, ehHashAjuda, idAncora } from '../../lib/ajudaRota'
import { EVENTO_NAVEGAR } from '../../lib/abrirTela'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../BoasVindas/PrimeirosPassos', () => ({ default: () => <div data-testid="primeiros-passos" /> }))

const ctxDe = ({ ver = () => true, pode = () => true, gerencial = true } = {}) =>
  montarContextoAjuda({ podeVer: ver, pode: (m, a) => pode(m, a), settings: { controleGerencial: gerencial } })
const app = (opcoes = {}) => useApp.mockReturnValue({
  podeVer: opcoes.ver || (() => true), pode: opcoes.pode || (() => true), settings: { controleGerencial: opcoes.gerencial ?? true },
})

beforeEach(() => { _reiniciarTour(); window.history.replaceState(null, '', '/'); app() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('conteúdo', () => {
  it('toda função tem explicação e exemplo; telas e itens sem texto de cliente', () => {
    let itens = 0
    for (const [id, t] of Object.entries(AJUDA_TELAS)) {
      expect(t.titulo, id).toBeTruthy()
      for (const i of t.itens) { itens++; expect(i.detalhe, `${id}.${i.chave}`).toBeTruthy(); expect(i.exemplo || i.semExemplo, `${id}.${i.chave}`).toBeTruthy() }
    }
    expect(itens).toBeGreaterThan(300)
  })
  it('pelo menos 15 perguntas frequentes, cada uma apontando para uma tela que existe', () => {
    expect(PERGUNTAS_FREQUENTES.length).toBeGreaterThanOrEqual(15)
    for (const p of PERGUNTAS_FREQUENTES) {
      expect(AJUDA_TELAS[p.tela], p.id).toBeTruthy()
      if (p.chave) expect(AJUDA_TELAS[p.tela].itens.some(i => i.chave === p.chave), `${p.id} → ${p.chave}`).toBe(true)
    }
  })
  it('"Quero ver tudo em detalhes" liberado no fim das boas-vindas', () => {
    expect(opcoesFinaisBoasVindas().map(o => o.id)).toContain('detalhes')
  })
})

describe('rota #ajuda', () => {
  it('monta e lê o hash, inclusive subtela', () => {
    expect(ajudaHash('schedule', 'recorrente')).toBe('#ajuda/schedule/recorrente')
    expect(parseAjudaHash(ajudaHash('settings:perfis', 'novo'))).toEqual({ tela: 'settings:perfis', chave: 'novo' })
    expect(parseAjudaHash('#ajuda')).toEqual({ tela: null, chave: null })
    expect(ehHashAjuda('#config/geral/perfis')).toBe(false)
    expect(ehHashAjuda('#ajudante')).toBe(false)
  })
})

describe('regras', () => {
  it('módulo sem permissão, controle gerencial desligado e Assistente sem permissão somem', () => {
    const ctx = ctxDe({ ver: (p) => p !== 'contratos', pode: (m) => m !== 'lancamentos', gerencial: false })
    expect(telaNaAjuda('contratos', ctx)).toBe(false)
    expect(telaNaAjuda('contratos:regras', ctx)).toBe(false)
    expect(telaNaAjuda('assistente', ctx)).toBe(false)
    expect(telaNaAjuda('settings:grupo-gerencial', ctx)).toBe(false)
    expect(telaNaAjuda('accounts', ctx)).toBe(true)
    expect(telaNaAjuda('clientes', ctxDe())).toBe(false)
  })
  it('Configurações: aba sem o módulo some; seção "todos" fica; Usuários só para quem vê usuários', () => {
    const ctx = ctxDe({ pode: (m) => m !== 'configuracoes' && m !== 'usuarios' })
    expect(telaNaAjuda('settings:periodo', ctx)).toBe(false)
    expect(telaNaAjuda('settings:guias', ctx)).toBe(true)
    expect(telaNaAjuda('settings:dados-aparelho', ctx)).toBe(true)
    expect(telaNaAjuda('settings:usuarios', ctx)).toBe(false)
    expect(telaNaAjuda('settings:categorias', ctx)).toBe(true)
  })
  it('celular: só telas que existem no celular', () => {
    const ctx = ctxDe()
    expect(telaNaAjuda('import', ctx, { celular: true })).toBe(false)
    expect(telaNaAjuda('inicio', ctx, { celular: true })).toBe(true)
    expect(telaNaAjuda('inicio', ctx)).toBe(false)
    expect(telaNaAjuda('schedule', ctx, { celular: true })).toBe(true)
  })
  it('rota do "Mostrar na tela": página do menu ou seção de Configurações', () => {
    expect(rotaDaTela('schedule')).toEqual({ pagina: 'schedule' })
    expect(rotaDaTela('settings:perfis')).toEqual({ pagina: 'settings', hash: '#config/geral/perfis' })
    expect(rotaDaTela('accounts:extrato')).toBeNull()
  })
  it('cada tarefa aparece em uma seção só', () => {
    const ctx = ctxDe()
    const telas = telasDaAjuda(ctx)
    for (const t of TAREFAS) {
      if (t.tela === 'assistente') continue
      const onde = telas.filter(id => tarefaDaSecao(t, id))
      expect(onde.length, `${t.id}: ${onde.join(', ')}`).toBeGreaterThanOrEqual(1)
      expect(onde.filter(id => !(t.telasExtras || []).includes(id)).length, t.id).toBe(1)
    }
  })
  it('busca "parcela" acha função, tarefa e pergunta; ignora acento e plural', () => {
    const ctx = ctxDe()
    const indice = montarIndice(telasDaAjuda(ctx), ctx, perguntasVisiveis(ctx))
    const r = buscar(indice, 'parcela')
    expect(r.some(e => e.tipo === 'funcao')).toBe(true)
    expect(r.some(e => e.tipo === 'pergunta' && e.id === 'compra-parcelada')).toBe(true)
    expect(buscar(indice, 'provisao').length).toBeGreaterThan(0)
    expect(buscar(indice, 'x')).toEqual([])
  })
})

// Este teste desenha a Central inteira (todas as seções, funções e perguntas). Sozinho leva ~2 s, mas
// com a suíte toda rodando em paralelo já passou dos 5 s padrão do Vitest (na rodada da suíte com o
// relógio em 15/11/2026; não tem relação com a data). O limite maior é só folga de tempo: o que o teste confere não mudou.
const LIMITE_CENTRAL_INTEIRA_MS = 20000

describe('tela', () => {
  it('busca, "Comece por aqui", perguntas e uma seção por tela visível', { timeout: LIMITE_CENTRAL_INTEIRA_MS }, () => {
    app({ ver: (p) => p !== 'contratos' })
    render(<CentralAjuda />)
    expect(screen.getByTestId('comece-por-aqui')).toBeTruthy()
    expect(screen.getByTestId('primeiros-passos')).toBeTruthy()
    expect(screen.getByTestId('perguntas-frequentes')).toBeTruthy()
    expect(screen.getByTestId('secao-schedule')).toBeTruthy()
    expect(screen.queryByTestId('secao-contratos')).toBeNull()
    expect(screen.queryByTestId('secao-clientes')).toBeNull()
    fireEvent.change(screen.getByLabelText('O que você quer fazer?'), { target: { value: 'parcela' } })
    const res = screen.getByTestId('resultados-busca')
    expect(within(res).getAllByRole('button').length).toBeGreaterThan(1)
  })
  it('âncora no hash destaca o item e reage a nova navegação', () => {
    window.history.replaceState(null, '', '/' + ajudaHash('schedule', 'novo'))
    render(<CentralAjuda />)
    expect(screen.getByTestId('funcao-schedule.novo').className).toContain('ring-1')
    act(() => {
      window.history.replaceState(null, '', '/' + ajudaHash('accounts', 'nova'))
      window.dispatchEvent(new CustomEvent(EVENTO_NAVEGAR, { detail: { page: 'ajuda' } }))
    })
    expect(screen.getByTestId('funcao-accounts.nova').className).toContain('ring-1')
    expect(document.getElementById(idAncora('accounts', 'nova'))).toBeTruthy()
  })
  it('"Mostrar na tela" navega e abre o tour já no item', () => {
    vi.useFakeTimers()
    const ir = vi.fn()
    window.addEventListener(EVENTO_NAVEGAR, ir)
    render(<CentralAjuda />)
    const item = screen.getByTestId('funcao-schedule.novo')
    fireEvent.click(within(item).getByRole('button', { name: 'Mostrar na tela' }))
    expect(ir.mock.calls.at(-1)[0].detail.page).toBe('schedule')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(tourAtivo()).toMatchObject({ tipo: 'tour', tela: 'schedule', chave: 'novo' })
    window.removeEventListener(EVENTO_NAVEGAR, ir)
  })
  it('"Mostrar na tela" de uma seção de Configurações usa o hash da seção', () => {
    vi.useFakeTimers()
    render(<CentralAjuda />)
    const item = screen.getByTestId(`funcao-settings:perfis.${AJUDA_TELAS['settings:perfis'].itens[0].chave}`)
    fireEvent.click(within(item).getByRole('button', { name: 'Mostrar na tela' }))
    expect(window.location.hash).toBe('#config/geral/perfis')
  })
  it('"Faça comigo" inicia a tarefa', () => {
    render(<CentralAjuda />)
    const t = TAREFAS.find(x => x.tela === 'schedule' && !x.hash)
    fireEvent.click(within(screen.getByTestId('secao-schedule')).getByRole('button', { name: t.titulo }))
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa', tarefaId: t.id })
  })
})
