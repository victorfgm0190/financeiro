// @vitest-environment jsdom
// Etapa 5 — Configurações › Guias: ícones ⓘ (F1 continua funcionando com eles desligados), oferta do
// Preenchimento Guiado (liga/desliga) e "Reativar ofertas de guia", por usuário via /api/boas-vindas.
// Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'

vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ dbStatus: 'connected', podeVer: () => true, pode: () => true, settings: {}, profiles: [], accounts: [], categories: [] }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../lib/abrirTela', () => ({ navegarPara: vi.fn() }))

const { default: GuiasTelasPanel } = await import('./GuiasTelasPanel.jsx')
const { default: BotaoPreencherGuia } = await import('../Ajuda/BotaoPreencherGuia.jsx')
const { default: HelpCampoPainel } = await import('../Ajuda/HelpCampoPainel.jsx')
const { default: HelpCampo } = await import('../shared/HelpCampo.jsx')
const { _reiniciarBoasVindas, carregarBoasVindas } = await import('../../lib/boasVindasApi')
const { fecharHelpCampo } = await import('../../help/helpCampoEstado.js')
const { _reiniciarPreenchimento } = await import('../../help/guiaPreenchimento.js')
const { gravarOfertaGuiaLigada, reativarOfertasGuia } = await import('../../../api/boas-vindas.js')

// "Banco" de /api/boas-vindas do usuário.
let banco
const servidor = () => vi.fn(async (url, opts = {}) => {
  const b = opts.body ? JSON.parse(opts.body) : {}
  const p = banco.progresso
  if (opts.method === 'POST') {
    if (typeof b.ajudaCampos === 'boolean') banco.ajudaCampos = b.ajudaCampos
    if (typeof b.guiaOfertaLigada === 'boolean') { if (b.guiaOfertaLigada) delete p.guiaOfertaDesligada; else p.guiaOfertaDesligada = true }
    if (b.guiaOfertasReativar) { delete p.guiaOfertas; delete p.guiaOfertaDesligada }
    if (b.guiaOferta) p.guiaOfertas = { ...(p.guiaOfertas || {}), [b.guiaOferta.form]: b.guiaOferta.resposta }
  }
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify({ ...banco, guiasOcultos: [] })) }
})
beforeEach(() => {
  _reiniciarBoasVindas(); _reiniciarPreenchimento()
  banco = { tourVistoEm: '2026-11-01T10:00:00Z', guiasLigados: true, ajudaCampos: true, progresso: { guiaOfertas: { agendamento: 'nao' } } }
  vi.stubGlobal('fetch', servidor())
})
afterEach(() => { act(() => fecharHelpCampo()); cleanup(); vi.unstubAllGlobals() })

const Form = () => (
  <div data-help-form="agendamento">
    <BotaoPreencherGuia form="agendamento" />
    <div data-help-id="agendamento.description"><label>Descrição<HelpCampo campo="agendamento.description" /></label><input aria-label="Descrição" /></div>
  </div>
)

describe('Configurações › Guias (Etapa 5)', () => {
  it('oferta: desligar grava no usuário e some dos formulários; "Reativar ofertas" volta a oferecer', async () => {
    render(<GuiasTelasPanel />)
    const sw = await screen.findByRole('switch', { name: 'Oferecer o preenchimento guiado' })
    await waitFor(() => expect(sw.disabled).toBe(false))
    expect(sw.checked).toBe(true)
    fireEvent.click(sw)
    await waitFor(() => expect(banco.progresso.guiaOfertaDesligada).toBe(true))
    expect(screen.getByRole('switch', { name: 'Oferecer o preenchimento guiado' }).checked).toBe(false)
    cleanup()
    render(<Form />)
    expect(screen.queryByTestId('oferta-guia')).toBeNull()
    expect(screen.getByTestId('botao-preencher-guia')).toBeTruthy() // o botão fica sempre
    cleanup()
    render(<GuiasTelasPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Reativar ofertas de guia/ }))
    await waitFor(() => expect(banco.progresso).toEqual({}))
    expect(screen.getByRole('switch', { name: 'Oferecer o preenchimento guiado' }).checked).toBe(true)
    cleanup()
    render(<Form />)
    expect(screen.getByTestId('oferta-guia')).toBeTruthy()
  })

  it('ícones ⓘ desligados: some o ícone, mas a F1 continua abrindo a ajuda do campo', async () => {
    banco.ajudaCampos = false
    await carregarBoasVindas()
    render(<><HelpCampoPainel /><Form /></>)
    expect(screen.queryByTestId('help-campo')).toBeNull()
    const campo = screen.getByLabelText('Descrição')
    act(() => campo.focus())
    const ev = new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true })
    act(() => { campo.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    expect(screen.getByTestId('help-campo-painel').textContent).toContain('Descrição')
  })
})

describe('API', () => {
  it('liga/desliga a oferta só mexe em progresso.guiaOfertaDesligada; reativar apaga as respostas', async () => {
    const chamadas = []
    const q = async (sql, params) => { chamadas.push({ sql, params }); return [{ progresso: {} }] }
    await gravarOfertaGuiaLigada(q, 'u1', false)
    expect(chamadas[0].sql).toContain(`'{"guiaOfertaDesligada": true}'::jsonb`)
    expect(chamadas[0].params).toEqual(['u1', '{"guiaOfertaDesligada": true}', false])
    await gravarOfertaGuiaLigada(q, 'u1', true)
    expect(chamadas[1].params[2]).toBe(true)
    await reativarOfertasGuia(q, 'u1')
    expect(chamadas[2].sql).toContain("- 'guiaOfertas' - 'guiaOfertaDesligada'")
    expect(chamadas[2].sql).not.toMatch(/ajuda_campos =|guias_ligados =/)
  })
})
