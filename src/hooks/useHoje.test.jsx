// @vitest-environment jsdom
// Lista "próximos 7 dias" do Dashboard com o app aberto de um dia para o outro: a data de hoje
// (useHoje) vira sozinha e a janela anda junto. Dados FICTÍCIOS.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useMemo } from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useHoje } from './useHoje'
import { proximosAgendamentos, somarDias } from '../lib/proximosAgendamentos'
import {
  alertasVencimentoCartao, cartoesPorVencimento, dataDoDia, proximoVencimentoCartao, textoDiasCurto, textoVencimento, vencimentoDoCartao,
} from '../lib/dashboardHoje'

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

  it('alerta de vencimento de cartão (dias de calendário): 07 sem alerta, 08 "vence em 5 dias", 13 "vence hoje", 14 sai', () => {
    // Vencimento dia 13 → aparece de 08 a 13, inclusive; no dia 14 passa a olhar o de dezembro.
    const cartoes = [
      { id: 'c13', type: 'credit', dueDay: 13 },
      { id: 'c30', type: 'credit', dueDay: 30 },               // longe: nunca alerta aqui
      { id: 'cx', type: 'credit', dueDay: 13, active: false }, // inativo: nunca alerta
      { id: 'cc', type: 'checking', dueDay: 13 },
    ]
    const useAlertas = () => {
      const hoje = useHoje()
      return useMemo(() => alertasVencimentoCartao(cartoes, hoje).map(x => `${x.account.id}: ${textoVencimento(x.dias)}`), [hoje])
    }
    const { result } = renderHook(useAlertas)                   // 07/11 23:58
    expect(result.current).toEqual([])
    act(() => { vi.advanceTimersByTime(3 * 60 * 1000) })       // 08/11 00:01, pelo timer
    expect(result.current).toEqual(['c13: vence em 5 dias'])
    vi.setSystemTime(new Date(2026, 10, 12, 23, 59, 0))        // 12/11, ao voltar para o app
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toEqual(['c13: vence em 1 dia'])
    vi.setSystemTime(new Date(2026, 10, 13, 0, 0, 30))         // 13/11 logo após a meia-noite
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toEqual(['c13: vence hoje'])
    vi.setSystemTime(new Date(2026, 10, 13, 23, 59, 0))        // ainda dia 13 à noite
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toEqual(['c13: vence hoje'])
    vi.setSystemTime(new Date(2026, 10, 14, 0, 1, 0))          // 14/11: sai (próximo é 13/12)
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toEqual([])
  })

  it('vencimento em dia que não existe no mês usa o último dia do mês (31 em fevereiro e abril)', () => {
    const c31 = [{ id: 'c31', type: 'credit', dueDay: 31 }]
    const alerta = (hoje) => alertasVencimentoCartao(c31, hoje).map(x => [x.vencimento, x.dias])
    expect(proximoVencimentoCartao(31, '2027-02-01')).toBe('2027-02-28')
    expect(proximoVencimentoCartao(31, '2028-02-01')).toBe('2028-02-29')   // ano bissexto
    expect(alerta('2027-02-22')).toEqual([])                               // 6 dias: ainda não
    expect(alerta('2027-02-23')).toEqual([['2027-02-28', 5]])
    expect(alerta('2027-02-28')).toEqual([['2027-02-28', 0]])              // vence hoje
    expect(alerta('2027-03-01')).toEqual([])                               // sai; próximo é 31/03
    expect(proximoVencimentoCartao(31, '2027-03-01')).toBe('2027-03-31')
    expect(proximoVencimentoCartao(31, '2027-04-30')).toBe('2027-04-30')
    expect(proximoVencimentoCartao(31, '2027-05-01')).toBe('2027-05-31')
    expect(alerta('2027-12-29')).toEqual([['2027-12-31', 2]])              // virada de ano
    expect(proximoVencimentoCartao(5, '2027-12-29')).toBe('2028-01-05')
  })

  it('vários cartões: do mais próximo ao mais distante; empate → maior fatura do mês', () => {
    const cs = [
      { id: 'a', type: 'credit', dueDay: 12, creditMonthBill: 100 },
      { id: 'b', type: 'credit', dueDay: 10, creditMonthBill: 50 },
      { id: 'c', type: 'credit', dueDay: 10, creditMonthBill: 900 },
    ]
    expect(alertasVencimentoCartao(cs, '2026-11-08').map(x => [x.account.id, textoVencimento(x.dias)]))
      .toEqual([['c', 'vence em 2 dias'], ['b', 'vence em 2 dias'], ['a', 'vence em 4 dias']])
  })

  it('selo "Próxima fatura" de Contas: vira de dia com o app aberto ("2 dias" → "1 dia" → "vence hoje" → passa ao outro cartão)', () => {
    const cartoes = [
      { id: 'c13', type: 'credit', dueDay: 13, creditMonthBill: 10 },
      { id: 'c20', type: 'credit', dueDay: 20, creditMonthBill: 10 },
    ]
    const useSelo = () => {
      const hoje = useHoje()
      return useMemo(() => {
        const best = cartoesPorVencimento(cartoes, hoje)[0]
        return `${best.account.id} · ${textoDiasCurto(best.dias)}`
      }, [hoje])
    }
    vi.setSystemTime(new Date(2026, 10, 11, 23, 58, 0))   // 11/11 23:58
    const { result } = renderHook(useSelo)
    expect(result.current).toBe('c13 · 2 dias')
    act(() => { vi.advanceTimersByTime(3 * 60 * 1000) })  // 12/11 00:01, pelo timer
    expect(result.current).toBe('c13 · 1 dia')
    vi.setSystemTime(new Date(2026, 10, 13, 7, 0, 0))     // 13/11, ao voltar para o app
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current).toBe('c13 · vence hoje')
    vi.setSystemTime(new Date(2026, 10, 14, 7, 0, 0))     // 14/11: c13 passa para 13/12; c20 é o mais próximo
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toBe('c20 · 6 dias')
  })

  it('selo de Contas com vencimento dia 31 em fevereiro: conta até 28/02 (antes ia para 03/03)', () => {
    const c31 = [{ id: 'c31', type: 'credit', dueDay: 31 }]
    const selo = (hoje) => { const b = cartoesPorVencimento(c31, hoje)[0]; return [b.vencimento, textoDiasCurto(b.dias)] }
    expect(selo('2027-02-20')).toEqual(['2027-02-28', '8 dias'])
    expect(selo('2027-02-27')).toEqual(['2027-02-28', '1 dia'])
    expect(selo('2027-02-28')).toEqual(['2027-02-28', 'vence hoje'])
    expect(selo('2027-03-01')).toEqual(['2027-03-31', '30 dias'])
  })

  it('item 4: para vencimento em dia que existe no mês, o selo de Contas dá os mesmos dias de antes', () => {
    // Fórmula antiga do selo (AccountsPanel daysUntilDue), com "agora" fixado em cada dia.
    const antigo = (dueDay, agora) => {
      const t0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
      let due = new Date(agora.getFullYear(), agora.getMonth(), dueDay)
      if (due < t0) due = new Date(agora.getFullYear(), agora.getMonth() + 1, dueDay)
      return Math.round((due - t0) / 86400000)
    }
    const fimDoMes = (y, m) => new Date(y, m + 1, 0).getDate()
    let comparados = 0
    let diferentes = 0
    for (let d = new Date(2026, 0, 1, 15); d.getFullYear() < 2029; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 15)) {
      const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      for (let dueDay = 1; dueDay <= 31; dueDay++) {
        const novo = vencimentoDoCartao(dueDay, hoje).dias
        // Só muda quando o dia do vencimento não existe no mês corrente ou no seguinte.
        const curto = dueDay > fimDoMes(d.getFullYear(), d.getMonth()) || dueDay > fimDoMes(d.getFullYear(), d.getMonth() + 1)
        if (!curto) { expect(novo).toBe(antigo(dueDay, d)); comparados++ } else if (novo !== antigo(dueDay, d)) diferentes++
      }
    }
    expect(comparados).toBeGreaterThan(30000)
    expect(diferentes).toBeGreaterThan(0) // os casos 29/30/31 em mês curto (a correção)
  }, 15000) // ~34 mil comparações (3 anos × 31 dias): sob a suíte carregada passava dos 5 s padrão

  it('dataDoDia: mesmo dia/mês/ano da data, ao meio-dia local', () => {
    const d = dataDoDia('2026-12-31')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 11, 31, 12])
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
