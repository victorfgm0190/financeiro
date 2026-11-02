// @vitest-environment jsdom
// Tarefas guiadas "Faça comigo": avançam por clique, preenchimento e salvar; "Sair" não deixa resto;
// passo que não aparece não trava; celular troca o "+ Novo" pelo "+" da barra. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import GuiaInterativo from './GuiaInterativo'
import AjudaTela from './AjudaTela'
import PrimeirosPassos from './PrimeirosPassos'
import { iniciarTarefa, _reiniciarTour, tourAtivo } from './tourEstado'
import { passosDaTarefa, itemNovo } from './tarefaPassos'
import { _reiniciarBoasVindas } from '../../lib/boasVindasApi'
import { TAREFAS, TODAS_AS_TAREFAS, tarefaPorId, tarefaDisponivel, tarefasDaTela } from '../../lib/tarefasGuiadas'
import { AJUDA_TELAS } from '../../lib/ajudaTelas'
import { montarContextoAjuda } from './contextoAjuda'
import { navegarPara } from '../../lib/abrirTela'
import { gravarTarefaConcluida } from '../../../api/boas-vindas.js'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../lib/abrirTela', async (orig) => ({ ...(await orig()), navegarPara: vi.fn() }))
vi.mock('../Schedule/ScheduleForm', () => ({ default: () => null }))
vi.mock('../Schedule/ProvisaoForm', () => ({ default: () => null }))
vi.mock('../Assistente/Assistente', () => ({ default: () => null }))

let estadoApp
const app = (extra = {}) => {
  estadoApp = {
    dbStatus: 'connected', podeVer: () => true, pode: () => true, settings: { controleGerencial: true },
    schedules: [], accounts: [], transactions: [], profiles: [], cardImports: [], contratos: [],
    ...extra,
  }
  useApp.mockImplementation(() => estadoApp)
}
let banco
beforeEach(() => {
  cleanup(); _reiniciarTour(); _reiniciarBoasVindas()
  banco = { tourVistoEm: '2026-11-01T10:00:00Z', guiasLigados: true, guiasOcultos: [], progresso: {} }
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const b = opts.body ? JSON.parse(opts.body) : {}
    if (b.tarefaConcluida) banco.progresso = { ...banco.progresso, tarefas: { ...(banco.progresso.tarefas || {}), [b.tarefaConcluida]: 'x' } }
    if (b.guiaOculto) banco.guiasOcultos = [...banco.guiasOcultos, b.guiaOculto]
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(banco)) }
  }))
  app()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

const visivel = (el) => { if (el) el.getBoundingClientRect = () => ({ top: 200, bottom: 230, left: 100, right: 220, width: 120, height: 30 }) }
// Tela fictícia de Agendamentos com o formulário já aberto (os alvos da tarefa "conta a pagar").
function TelaAgenda() {
  return (
    <>
      <button data-guia="schedule.novo" ref={visivel}>+ Novo agendamento</button>
      <div data-guia="agendamento-form.tipo" ref={visivel}><select aria-label="Tipo" defaultValue=""><option value="">—</option><option value="expense">Saída</option></select></div>
      <div data-guia="agendamento-form.descricao" ref={visivel}><input aria-label="Descrição" /></div>
      <GuiaInterativo />
    </>
  )
}
const balao = () => screen.queryByTestId('balao-tarefa')
const texto = () => screen.getByTestId('texto-tarefa').textContent
const conta = tarefaPorId('schedule.conta-pagar')

describe('conteúdo', () => {
  it('38 tarefas guardadas; as desta fase no ar; todo alvo é um data-guia', () => {
    expect(TODAS_AS_TAREFAS).toHaveLength(38)
    expect(TAREFAS.length).toBeGreaterThan(20)
    for (const t of TAREFAS) {
      expect(t.passos.length, t.id).toBeGreaterThanOrEqual(3)
      for (const p of t.passos) expect(['clique', 'preencher', 'salvar', 'nenhuma'], t.id).toContain(p.espera)
    }
  })
  it('módulo/permissão desligados escondem a tarefa', () => {
    const sem = montarContextoAjuda({ podeVer: () => true, pode: (m) => m !== 'agendamentos', settings: {} })
    expect(tarefaDisponivel(conta, sem)).toBe(false)
    expect(tarefasDaTela('schedule', sem).length).toBe(1) // só o filtro (não precisa incluir)
  })
  it('celular: "+ Novo agendamento" vira o "+" da barra e a ação do menu; provisão fica só no computador', () => {
    const p = passosDaTarefa(conta, { celular: true })
    expect(p.slice(0, 2).map(x => x.alvo)).toEqual(['mobile.novo', 'mobile.acao-agendamento'])
    expect(p.length).toBe(conta.passos.length + 1)
    const ctx = montarContextoAjuda({ podeVer: () => true, pode: () => true, settings: {} })
    expect(tarefaDisponivel(tarefaPorId('schedule.provisao'), ctx, { celular: true })).toBe(false)
    expect(tarefaDisponivel(tarefaPorId('schedule.provisao'), ctx, { celular: false })).toBe(true)
  })
  it('item novo = não estava no começo e passa no filtro', () => {
    expect(itemNovo([{ id: 'a' }, { id: 'b', transactionType: 'income' }], new Set(['a']), (s) => s.transactionType === 'expense')).toBeNull()
    expect(itemNovo([{ id: 'a' }, { id: 'c', transactionType: 'expense' }], new Set(['a']), conta.novoItem.filtro)?.id).toBe('c')
  })
})

describe('tarefa na tela', () => {
  it('navega até a tela, avança por clique e por preenchimento, e termina ao salvar', async () => {
    const { rerender } = render(<TelaAgenda />)
    act(() => iniciarTarefa('schedule.conta-pagar'))
    expect(navegarPara).toHaveBeenCalledWith('schedule', undefined)
    await waitFor(() => expect(texto()).toBe(conta.passos[0].texto))
    fireEvent.click(screen.getByRole('button', { name: '+ Novo agendamento' }))
    await waitFor(() => expect(texto()).toBe(conta.passos[1].texto)) // tipo: só explica (Próximo)
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    await waitFor(() => expect(texto()).toBe(conta.passos[2].texto)) // descrição: preencher
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Aluguel' } })
    await waitFor(() => expect(texto()).toBe(conta.passos[3].texto))
    // salvou: o item novo aparece no app
    estadoApp = { ...estadoApp, schedules: [{ id: 's1', transactionType: 'expense' }] }
    rerender(<TelaAgenda />)
    await waitFor(() => expect(texto()).toBe(conta.final))
    expect(screen.getByRole('heading', { name: 'Pronto!' })).toBeTruthy()
    await waitFor(() => expect(banco.progresso.tarefas['schedule.conta-pagar']).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Fazer outra tarefa' }))
    expect(screen.getByRole('button', { name: tarefaPorId('schedule.conta-receber').titulo })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(balao()).toBeNull()
  })
  it('"Sair do guia" (e Esc) encerra sem deixar nada na tela', async () => {
    render(<TelaAgenda />)
    act(() => iniciarTarefa('schedule.conta-pagar'))
    await waitFor(() => expect(balao()).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Sair do guia' }))
    expect(balao()).toBeNull()
    expect(document.querySelector('.guia-spotlight')).toBeNull()
    expect(tourAtivo()).toBeNull()
    act(() => iniciarTarefa('schedule.conta-pagar'))
    await waitFor(() => expect(balao()).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(balao()).toBeNull()
  })
  it('passo que não aparece: depois de alguns segundos, balão no centro com Próximo (não trava)', async () => {
    vi.useFakeTimers()
    render(<GuiaInterativo />)
    act(() => iniciarTarefa('schedule.conta-pagar'))
    await act(async () => { vi.advanceTimersByTime(9000) })
    expect(texto()).toMatch(/^Não achei este passo na tela agora/)
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByText(/passo 2 de/)).toBeTruthy()
  })
  it('o guia nunca preenche nem salva: nada é chamado no app', async () => {
    const addSchedule = vi.fn()
    app({ addSchedule })
    render(<TelaAgenda />)
    act(() => iniciarTarefa('schedule.conta-pagar'))
    await waitFor(() => expect(balao()).toBeTruthy())
    for (let k = 0; k < conta.passos.length; k++) fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(addSchedule).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Descrição').value).toBe('')
  })
})

describe('onde as tarefas aparecem', () => {
  it('"?" › Faça comigo lista as tarefas da tela com ✓ nas concluídas e inicia a escolhida', async () => {
    banco.progresso = { tarefas: { 'schedule.conta-pagar': 'x' } }
    render(<><AjudaTela pagina="schedule" /><GuiaInterativo /></>)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: `Ajuda: ${AJUDA_TELAS.schedule.titulo}` }))
    const item = await screen.findByRole('menuitem', { name: new RegExp(conta.titulo) })
    expect(item.querySelector('[aria-label="concluída"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(tarefaPorId('schedule.conta-receber').titulo) }))
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa', tarefaId: 'schedule.conta-receber' })
  })
  it('checklist: "Fazer agora" inicia a tarefa guiada da etapa', async () => {
    render(<><PrimeirosPassos /><GuiaInterativo /></>)
    await screen.findByTestId('primeiros-passos')
    fireEvent.click(screen.getAllByRole('button', { name: 'Fazer agora' })[0]) // perfil
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa', tarefaId: 'settings.perfil-cpf' })
    expect(navegarPara).toHaveBeenCalledWith('settings', { hash: '#config/geral/perfis' })
  })
})

describe('API', () => {
  it('tarefa concluída só com id conhecido', async () => {
    const q = vi.fn(async () => [{ progresso: { tarefas: { 'schedule.conta-pagar': 'x' } } }])
    expect((await gravarTarefaConcluida(q, 'u1', 'schedule.conta-pagar')).progresso.tarefas).toHaveProperty('schedule.conta-pagar')
    expect(q.mock.calls[0][1]).toEqual(['u1', 'schedule.conta-pagar'])
    expect(await gravarTarefaConcluida(q, 'u1', 'nao-existe')).toBeNull()
  })
})
