// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Estorno de lançamento de parcela de contrato rescindido: pergunta antes de reabrir (teste1:
// condomínio de 05/12 do contrato 9779779879 virou pendência solta).
const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: EstornoLancamentoDialog } = await import('./EstornoLancamentoDialog.jsx')
const { default: CampoValor } = await import('./CampoValor.jsx')

const parcela = {
  id: 'ctr_k1_condominio_202612', contratoId: 'k1', contratoPapel: 'condominio', frequency: 'once', startDate: '2026-12-05',
  amount: 1300, registered: ['2026-12-05'], registeredMeta: { '2026-12-05': { lancamento_id: 'tx_c' } }, skipped: [], overrides: {},
}
const tx = { id: 'tx_c', scheduleId: parcela.id, date: '2026-12-05', dataOcorrencia: '2026-12-05', amount: 1300 }

function preparar(status) {
  Object.assign(app, {
    schedules: [parcela], contratosHabilitado: true,
    contratoPorId: () => ({ id: 'k1', status, numero: '9779779879' }),
    reverseTransaction: vi.fn(), estornarLancamentoContrato: vi.fn(async () => ({})),
  })
  const onFeito = vi.fn()
  const onClose = vi.fn()
  render(<EstornoLancamentoDialog tx={tx} onClose={onClose} onFeito={onFeito} />)
  return { onFeito, onClose }
}

afterEach(cleanup)

describe('EstornoLancamentoDialog', () => {
  it('contrato rescindido: pergunta; "Não" estorna e cancela a parcela', async () => {
    const { onFeito } = preparar('rescindido')
    expect(screen.getByText(/Reabrir esta parcela no contrato rescindido\?/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Não, estornar e cancelar/ }))
    await vi.waitFor(() => expect(app.estornarLancamentoContrato).toHaveBeenCalledWith(tx, { reabrir: false }))
    expect(app.reverseTransaction).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(onFeito).toHaveBeenCalledWith('Lançamento estornado. Parcela de 05/12/2026 cancelada no contrato.'))
  })

  it('contrato rescindido: "Sim" reabre a parcela', async () => {
    const { onFeito } = preparar('rescindido')
    fireEvent.click(screen.getByRole('button', { name: /Sim, reabrir/ }))
    await vi.waitFor(() => expect(app.estornarLancamentoContrato).toHaveBeenCalledWith(tx, { reabrir: true }))
    await vi.waitFor(() => expect(onFeito.mock.calls[0][0]).toMatch(/voltou a pendente no contrato rescindido/))
  })

  it('contrato ativo: confirmação normal, com a data da OCORRÊNCIA', async () => {
    preparar('ativo')
    expect(screen.queryByText(/Reabrir esta parcela/)).toBeNull()
    expect(screen.getByText(/voltará para pendente na data 05\/12\/2026/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Estorno' }))
    await vi.waitFor(() => expect(app.estornarLancamentoContrato).toHaveBeenCalledWith(tx, { reabrir: true }))
  })

  it('lançamento sem contrato: estorno de sempre', async () => {
    Object.assign(app, { schedules: [], contratosHabilitado: true, contratoPorId: () => null, reverseTransaction: vi.fn(), estornarLancamentoContrato: vi.fn() })
    render(<EstornoLancamentoDialog tx={{ id: 'tx_x', date: '2026-10-01', amount: 10 }} onClose={() => {}} onFeito={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Estorno' }))
    await vi.waitFor(() => expect(app.reverseTransaction).toHaveBeenCalledWith('tx_x'))
    expect(app.estornarLancamentoContrato).not.toHaveBeenCalled()
  })
})

describe('CampoValor', () => {
  function Campo() {
    const [v, setV] = useState('')
    return <CampoValor value={v} onChange={setV} placeholder="Ex.: 200,00" />
  }
  it('2 casas ao digitar e milhar ao sair', () => {
    render(<Campo />)
    const input = screen.getByPlaceholderText('Ex.: 200,00')
    fireEvent.change(input, { target: { value: '100,000' } })
    expect(input.value).toBe('100,00')
    fireEvent.change(input, { target: { value: '3900' } })
    fireEvent.blur(input)
    expect(input.value).toBe('3.900,00')
  })
})
