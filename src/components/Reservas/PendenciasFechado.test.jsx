// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const api = vi.hoisted(() => ({ acao: vi.fn() }))
vi.mock('../../lib/db', () => ({ viradaReservaAcao: (b) => api.acao(b) }))

const { default: PendenciasFechado } = await import('./PendenciasFechado.jsx')
const { default: ViradaAssistidaModal } = await import('./ViradaAssistidaModal.jsx')

const functions = [{ id: 'f1', name: 'IPVA', accountId: 'c1' }, { id: 'f2', name: 'Seguro', accountId: 'c1' }, { id: 'f3', name: 'Outra', accountId: 'c2' }]
const pend = (extra = {}) => ({
  id: 'p1', lancamento_id: 't1', function_id: 'f1', account_id: 'c1', data: '2026-08-10', valor: 40, descricao: 'Depósito', motivo: 'novo',
  dataAjuste: '2026-09-15', observacaoSugerida: 'Referente a "Depósito" de 10/08/2026 (período fechado)',
  podeReabrir: true, motivoReabrir: null, fechamentosADesfazer: ['2026-09-14', '2026-08-14'], ...extra,
})
const montar = (itens, props = {}) => render(<PendenciasFechado itens={itens} functions={functions} accounts={[{ id: 'c1', name: 'Reserva' }]} hoje="2026-11-06" podeEditar onMudou={vi.fn()} {...props} />)

beforeEach(() => { api.acao.mockReset() })
afterEach(() => { cleanup() })

describe('pendência de lançamento em período fechado', () => {
  it('mostra as duas opções e o Ajuste vem preenchido com função, valor e observação', async () => {
    api.acao.mockResolvedValue({ ok: true, refazer: { desde: '2026-09-15', itens: [] } })
    montar([pend()])
    fireEvent.click(screen.getByRole('button', { name: 'Ajuste no próximo período' }))
    expect(screen.getByRole('button', { name: 'Reabrir' })).toBeTruthy()
    const form = screen.getByTestId('pendencia-form-ajuste')
    expect(form.querySelector('select').value).toBe('f1')
    expect(form.querySelector('input[inputmode], input').value).toContain('40')
    expect(screen.getByDisplayValue(/Referente a "Depósito"/)).toBeTruthy()
    // função de outra conta não é oferecida
    expect([...form.querySelectorAll('option')].map(o => o.textContent)).not.toContain('Outra')
    fireEvent.click(screen.getByRole('button', { name: 'Lançar Ajuste' }))
    await waitFor(() => expect(api.acao).toHaveBeenCalledTimes(1))
    expect(api.acao.mock.calls[0][0]).toMatchObject({ acao: 'pendencia_ajustar', id: 'p1', functionId: 'f1' })
  })

  it('Reabrir indisponível: botão desligado e o motivo aparece', () => {
    montar([pend({ podeReabrir: false, motivoReabrir: 'Fechamento antigo.', fechamentosADesfazer: [] })])
    expect(screen.getByRole('button', { name: 'Reabrir' }).disabled).toBe(true)
    expect(screen.getByText(/Fechamento antigo/)).toBeTruthy()
  })

  it('Reabrir diz o que será desfeito e, depois, oferece refazer os rendimentos', async () => {
    api.acao.mockResolvedValueOnce({ ok: true, refazer: { desde: '2026-08-10', itens: [{ lancamentoId: 'r1', date: '2026-09-20', description: 'Juros', antes: { f1: 10 }, depois: { f1: 7, f2: 3 } }] } })
    api.acao.mockResolvedValueOnce({ ok: true, refeitos: 1 })
    montar([pend()])
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }))
    expect(screen.getByTestId('pendencia-confirma-reabrir').textContent).toMatch(/14\/09\/2026, 14\/08\/2026/)
    fireEvent.click(screen.getAllByRole('button', { name: 'Reabrir' }).at(-1))
    const oferta = await screen.findByTestId('pendencia-refazer-rendimentos')
    expect(oferta.textContent).toMatch(/Juros/)
    fireEvent.click(screen.getByRole('button', { name: 'Refazer rendimentos' }))
    await waitFor(() => expect(api.acao).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'rendimentos_refazer', desde: '2026-08-10' })))
    await waitFor(() => expect(screen.queryByTestId('pendencia-refazer-rendimentos')).toBeNull())
  })

  it('lista agrupada por mês, sem ações para quem não edita', () => {
    montar([pend(), pend({ id: 'p2', data: '2026-07-10' })], { podeEditar: false })
    expect(screen.getAllByTestId('pendencias-grupo')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Reabrir' })).toBeNull()
  })
})

describe('virada com diferença não explicada', () => {
  const conta = {
    accountId: 'c1', nome: 'Reserva', funcoes: [{ functionId: 'f1', nome: 'IPVA', saldoInicial: 0, entradas: 0, saidas: 0, ajuste: 0, rendimentos: 0, saldoFinal: 10 }],
    somaFuncoes: 10, saldoConta: 110, diferenca: 100, rendimentosMes: 0, rendimentoARatear: 0, rendimentoSemBase: 0, pendenciasFechado: 0, aceitoAntes: 0, lancamentosSemFuncao: 0, resto: 100,
  }
  const status = { disponivel: true, pendentes: [{ inicio: '2026-08-01', fim: '2026-08-31' }] }

  it('o botão só libera depois de escolher; a decisão vai ao servidor', async () => {
    api.acao.mockImplementation(async (b) => (b.acao === 'previa'
      ? { bloqueios: [], previa: { contas: [conta], semConta: [], avisos: [], totais: {} } }
      : { virada: { data_inicio: '2026-08-01', data_corte: '2026-08-31' }, resumo: { contas: [] } }))
    render(<ViradaAssistidaModal status={status} hoje="2026-09-10" onVirou={vi.fn()} onAgoraNao={vi.fn()} onFechar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia e continuar' }))
    const bloco = await screen.findByTestId('virada-decisao-c1')
    expect(bloco.textContent).toMatch(/A virada para aqui/)
    const confirmar = screen.getByRole('button', { name: /Confirmar virada/ })
    expect(confirmar.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Lançar como Ajuste'))
    expect(confirmar.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Deixar a distribuir'))
    expect(confirmar.disabled).toBe(false)
    fireEvent.click(confirmar)
    await waitFor(() => expect(api.acao).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'confirmar', decisoes: { c1: { tipo: 'a_distribuir' } } })))
  })
})
