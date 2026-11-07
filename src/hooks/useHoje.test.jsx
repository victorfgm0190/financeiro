// @vitest-environment jsdom
// Lista "próximos 7 dias" do Dashboard com o app aberto de um dia para o outro: a data de hoje
// (useHoje) vira sozinha e a janela anda junto. Dados FICTÍCIOS.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useMemo } from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useHoje } from './useHoje'
import { proximosAgendamentos, somarDias } from '../lib/proximosAgendamentos'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 7, 23, 58, 0)) // 07/11/2026 23:58
})
afterEach(() => { cleanup(); vi.useRealTimers() })

// Um agendamento com a próxima ocorrência em 15/11 (fora da janela de 07/11, dentro da de 08/11).
const ag = { id: 'a1', amount: 50 }
const proximas = () => ['2026-11-15', '2026-12-15']
const useListaProximos = () => {
  const hoje = useHoje()
  const lista = useMemo(() => proximosAgendamentos([ag], proximas, hoje), [hoje])
  return { hoje, datas: lista.map(i => i.date) }
}

describe('somarDias', () => {
  it('soma no calendário local, virando mês e ano', () => {
    expect(somarDias('2026-11-07', 7)).toBe('2026-11-14')
    expect(somarDias('2026-11-28', 7)).toBe('2026-12-05')
    expect(somarDias('2026-12-30', 7)).toBe('2027-01-06')
  })
})

describe('useHoje + próximos 7 dias', () => {
  it('passa da meia-noite com o app aberto: o timer vira o dia e a lista inclui o dia novo da janela', () => {
    const { result } = renderHook(useListaProximos)
    expect(result.current.hoje).toBe('2026-11-07')
    expect(result.current.datas).toEqual([])            // janela até 14/11
    act(() => { vi.advanceTimersByTime(3 * 60 * 1000) }) // 00:01 do dia 08
    expect(result.current.hoje).toBe('2026-11-08')
    expect(result.current.datas).toEqual(['2026-11-15']) // janela até 15/11
  })

  it('ao voltar para o app (aba visível) confere o dia na hora, sem esperar o timer', () => {
    const { result } = renderHook(useListaProximos)
    vi.setSystemTime(new Date(2026, 10, 8, 9, 0, 0))   // o computador dormiu; o timer não rodou
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current.hoje).toBe('2026-11-08')
    expect(result.current.datas).toEqual(['2026-11-15'])
  })

  it('no mesmo dia não muda nada', () => {
    vi.setSystemTime(new Date(2026, 10, 7, 10, 0, 0))
    const { result } = renderHook(useListaProximos)
    const antes = result.current
    act(() => { vi.advanceTimersByTime(5 * 60 * 1000); window.dispatchEvent(new Event('focus')) })
    expect(result.current.hoje).toBe('2026-11-07')
    expect(result.current.datas).toBe(antes.datas)       // mesmo objeto: nem renderizou de novo
  })
})
