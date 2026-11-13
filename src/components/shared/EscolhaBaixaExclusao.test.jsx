// @vitest-environment jsdom
// Exclusão de um lançamento que pagou parcela de agendamento: pergunta se a parcela volta a pendente
// (padrão) ou fica baixada sem lançamento. Lançamento sem baixa: nada aparece.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: EscolhaBaixaExclusao } = await import('./EscolhaBaixaExclusao.jsx')

const AG = { id: 'ag', description: 'MATERIAL', frequency: 'monthly', registered: ['2026-10-10'], registeredMeta: { '2026-10-10': { tipo: 'pago', lancamento_id: 'tx1' } } }
function Harness({ tx, onChange }) {
  const [m, setM] = useState(false)
  return <EscolhaBaixaExclusao tx={tx} manter={m} onChange={(v) => { setM(v); onChange(v) }} />
}
afterEach(() => cleanup())

describe('EscolhaBaixaExclusao', () => {
  it('lançamento que baixou: duas opções, "Voltar para pendente" marcada', () => {
    app.schedules = [AG]
    const onChange = vi.fn()
    render(<Harness tx={{ id: 'tx1', date: '2026-10-12' }} onChange={onChange} />)
    expect(screen.getByTestId('escolha-baixa-exclusao').textContent).toMatch(/pagou a ocorrência de 10\/10\/2026 do agendamento MATERIAL/)
    const [pendente, manter] = screen.getAllByRole('radio')
    expect(pendente.checked).toBe(true)
    fireEvent.click(manter)
    expect(onChange).toHaveBeenCalledWith(true)
  })
  it('lançamento sem baixa: não mostra nada', () => {
    app.schedules = [AG]
    render(<Harness tx={{ id: 'outro', date: '2026-10-12' }} onChange={() => {}} />)
    expect(screen.queryByTestId('escolha-baixa-exclusao')).toBeNull()
  })
})
