// @vitest-environment jsdom
// Atualização sem perder trabalho em andamento: com uma importação em revisão o aviso diz o que seria
// perdido e "Atualizar depois" não recarrega; ao terminar, volta com "Pronto!"; a obrigatória espera;
// sem trabalho é o aviso de sempre; depois de atualizar, volta para a mesma tela. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import AvisoAtualizacao from './AvisoAtualizacao'
import { iniciarServiceWorker, marcarVersaoPronta, _reiniciarAtualizacao } from '../../lib/atualizacao'
import { _reiniciarAvisos } from '../../lib/filaDeAvisos'
import { _reiniciarBoasVindas, carregarBoasVindas } from '../../lib/boasVindasApi'
import { _reiniciarTour } from '../BoasVindas/tourEstado'
import { _reiniciarJornada } from '../BoasVindas/jornadaEstado'
import { registrarTrabalho, removerTrabalho, _reiniciarTrabalhos, haTrabalhoEmAndamento, fraseDosTrabalhos } from '../../lib/trabalhoEmAndamento'
import { definirTelaAtual, lerTelaGuardada } from '../../lib/telaAposAtualizar'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))

const n = (id, extra = {}) => ({ id, data: id.slice(0, 10).replace(/\./g, '-'), titulo: id, publico: 'todos', obrigatoria: false, itens: [`Novidade ${id}`], ...extra })
const LOCAIS = [n('2026.11.11')]
let sw
const aviso = () => screen.queryByTestId('aviso-atualizacao')
const pausa = (ms = 60) => act(() => new Promise(r => setTimeout(r, ms)))
const FRASE = 'uma importação de fatura do cartão Exemplo'

async function versaoNova(extra = {}) {
  await act(() => marcarVersaoPronta({ buscar: async () => ({ ok: true, json: async () => ({ novidades: [n('2026.11.12', extra), ...LOCAIS] }) }), locais: LOCAIS }))
}

beforeEach(async () => {
  _reiniciarAtualizacao(); _reiniciarAvisos(); _reiniciarTour(); _reiniciarJornada(); _reiniciarBoasVindas(); _reiniciarTrabalhos()
  localStorage.clear(); sessionStorage.clear()
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  useApp.mockReturnValue({ dbStatus: 'connected', enviarAgora: vi.fn(async () => ({ ok: true })) })
  const updateSW = vi.fn(async () => {})
  sw = { updateSW, registerSW: vi.fn(() => updateSW), reload: vi.fn() }
  iniciarServiceWorker(sw.registerSW, { addEventListener() {}, document: { addEventListener() {} }, location: { reload: sw.reload } })
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tourVistoEm: '2026-11-01T10:00:00Z', guiasOcultos: [], guiasLigados: true }) })))
  await carregarBoasVindas()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; _reiniciarTrabalhos() })

describe('registro de trabalho em andamento', () => {
  it('registra, junta a frase e sai; fechar a aba só pergunta enquanto há trabalho', () => {
    const ev = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented }
    expect(ev()).toBe(false)
    registrarTrabalho('a', FRASE)
    expect(haTrabalhoEmAndamento()).toBe(true)
    expect(ev()).toBe(true)
    registrarTrabalho('b', 'um lançamento que ainda não foi salvo')
    expect(fraseDosTrabalhos()).toBe('um lançamento que ainda não foi salvo e mais 1 tarefa sem gravar')
    removerTrabalho('a'); removerTrabalho('b')
    expect(ev()).toBe(false)
  })
})

describe('aviso de atualização com trabalho em andamento', () => {
  it('importação em revisão: diz o que seria perdido; "Atualizar depois" não recarrega e esconde', async () => {
    registrarTrabalho('importar', FRASE)
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    expect((await screen.findByTestId('aviso-atualizacao-trabalho')).textContent)
      .toBe(`Você está no meio de ${FRASE}. Se atualizar agora, o que não foi confirmado será perdido. Termine (Confirmar ou Cancelar) e atualize depois.`)
    expect(screen.queryByRole('button', { name: /Atualizar agora/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar depois' }))
    await pausa()
    expect(aviso()).toBeNull()
    expect(sw.updateSW).not.toHaveBeenCalled()
    expect(sw.reload).not.toHaveBeenCalled()
  })

  it('Confirmar/Cancelar (o trabalho sai do registro): o aviso volta com "Pronto!" e "Atualizar agora"', async () => {
    registrarTrabalho('importar', FRASE)
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar depois' }))
    await pausa()
    expect(aviso()).toBeNull()
    act(() => removerTrabalho('importar'))
    expect((await screen.findByTestId('aviso-atualizacao-pronto')).textContent).toBe('Pronto! Agora você pode atualizar o Finup.')
    fireEvent.click(screen.getByRole('button', { name: /Atualizar agora/ }))
    await pausa()
    expect(sw.updateSW).toHaveBeenCalled()
  })

  it('"Atualizar mesmo assim" pede confirmação antes de atualizar', async () => {
    registrarTrabalho('importar', FRASE)
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar mesmo assim' }))
    expect(screen.getByTestId('aviso-atualizacao-confirmar').textContent).toMatch(/Tem certeza\? Você vai perder o que não foi confirmado \(uma importação de fatura/)
    expect(sw.updateSW).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.queryByTestId('aviso-atualizacao-confirmar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar mesmo assim' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sim, atualizar mesmo assim' }))
    await pausa()
    expect(sw.updateSW).toHaveBeenCalled()
  })

  it('versão OBRIGATÓRIA também espera a tarefa terminar', async () => {
    registrarTrabalho('importar', FRASE)
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova({ obrigatoria: true, motivo: 'O banco mudou.' })
    const el = await screen.findByTestId('aviso-atualizacao')
    expect(el.dataset.obrigatoria).toBe('sim')
    expect(screen.getByTestId('aviso-atualizacao-trabalho')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Atualizar agora/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar depois' }))
    await pausa()
    expect(sw.updateSW).not.toHaveBeenCalled()
    act(() => removerTrabalho('importar'))
    expect(await screen.findByRole('button', { name: /Atualizar agora/ })).toBeTruthy()
  })

  it('sem trabalho em andamento: o aviso de sempre (Mais tarde / Atualizar agora)', async () => {
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    expect(await screen.findByText('Deseja atualizar agora?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mais tarde' })).toBeTruthy()
    expect(screen.queryByTestId('aviso-atualizacao-trabalho')).toBeNull()
  })

  it('depois de atualizar, volta para a MESMA tela', async () => {
    definirTelaAtual({ page: 'import', mobile: 'inicio' })
    render(<AvisoAtualizacao intervalo={20} />)
    await versaoNova()
    fireEvent.click(await screen.findByRole('button', { name: /Atualizar agora/ }))
    await pausa()
    expect(lerTelaGuardada()).toEqual({ page: 'import', mobile: 'inicio' })
    expect(lerTelaGuardada()).toBeNull() // lida uma vez só
  })
})
