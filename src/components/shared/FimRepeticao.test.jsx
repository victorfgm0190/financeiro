// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('./DateInput', () => ({ default: ({ value, onChange, ...p }) => <input aria-label={p['aria-label']} value={value} onChange={onChange} /> }))
const { default: FimRepeticao } = await import('./FimRepeticao.jsx')
afterEach(() => cleanup())

describe('Até quando (Repetir / agendamento)', () => {
  it('12) "Até a data" calcula e mostra o nº de ocorrências e a última', () => {
    const onChange = vi.fn()
    render(<FimRepeticao inicio="2026-11-10" recorrencia="monthly" occurrenceType="continuous" installments={0} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Até a data' }))
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2027-12-31' } })
    expect(screen.getByRole('status').textContent).toBe('14 ocorrências, última em 10/12/2027')
    expect(onChange).toHaveBeenLastCalledWith({ occurrenceType: 'installment', installments: 14 })
  })
  it('Sem fim e Número de vezes', () => {
    const onChange = vi.fn()
    render(<FimRepeticao inicio="2026-11-10" recorrencia="weekly" occurrenceType="installment" installments={4} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sem fim' }))
    expect(onChange).toHaveBeenLastCalledWith({ occurrenceType: 'continuous', installments: 0 })
    fireEvent.click(screen.getByRole('radio', { name: 'Até a data' }))
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-12-01' } })
    expect(screen.getByRole('status').textContent).toBe('4 ocorrências, última em 01/12/2026')
  })
})
