// @vitest-environment jsdom
// Modal Efetivar Provisão (pergunta "vale para as próximas?" só com data real ≠ ocorrência) e modal
// Desfazer efetivação (confirmação / bloqueio). Dados FICTÍCIOS. Hoje = 16/11/2026 (segunda).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { EfetivarProvisaoModal, DesfazerEfetivacaoModal } = await import('./SchedulePanel.jsx')
const { computeOccurrences } = await import('../../lib/occurrences')
const lib = await import('../../lib/efetivacaoProvisao')
const { agendamentoDaEfetivacao } = await import('../../lib/herancaCampos')
const { MSG_EFETIVACAO_SEM_VINCULO } = await import('../../lib/recursosBanco')

const semanal = {
  id: 'prov_s', description: 'PROVISÃO TESTE', transactionType: 'expense', accountId: 'cc', amount: 200,
  frequency: 'weekly', startDate: '2026-11-13', occurrenceType: 'continuous', installments: 0,
  registered: [], skipped: [], overrides: {}, isProvisao: true, efetivacoes: [],
}
const base = (o = {}) => Object.assign(app, {
  reserveFunctions: [], recursosBanco: { efetivacoesProvisao: true },
  getProximaProvisaoOccurrence: (s) => computeOccurrences(s, 1)[0] || null,
  ...o,
})

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0)) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Efetivar Provisão — pergunta das próximas', () => {
  it('data real = ocorrência: não pergunta e confirma sem aplicar às próximas', () => {
    base()
    const onConfirm = vi.fn()
    render(<EfetivarProvisaoModal schedule={semanal} accounts={[]} onClose={() => {}} onConfirm={onConfirm} />)
    expect(screen.queryByTestId('efetivar-aplicar-proximas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Efetivar/ }))
    expect(onConfirm).toHaveBeenCalledWith({ amount: 200, date: '2026-11-13', occurrenceDate: '2026-11-13', aplicarProximas: false })
  })

  it('data real diferente: pergunta com prévia; "Não, só esta" é o padrão', () => {
    base()
    const onConfirm = vi.fn()
    render(<EfetivarProvisaoModal schedule={semanal} accounts={[]} onClose={() => {}} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))  // 16/11
    const box = screen.getByTestId('efetivar-aplicar-proximas')
    expect(box.textContent).toMatch(/Não, só esta.*Próximas: 20\/11\/2026 \(sexta\), 27\/11\/2026 \(sexta\)/)
    expect(box.textContent).toMatch(/Sim, também as próximas.*Próximas: 23\/11\/2026 \(segunda\), 30\/11\/2026 \(segunda\)/)
    const [nao, sim] = screen.getAllByRole('radio')
    expect(nao.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Efetivar/ }))
    expect(onConfirm).toHaveBeenLastCalledWith({ amount: 200, date: '2026-11-16', occurrenceDate: '2026-11-13', aplicarProximas: false })
    fireEvent.click(sim)
    fireEvent.click(screen.getByRole('button', { name: /Efetivar/ }))
    expect(onConfirm).toHaveBeenLastCalledWith({ amount: 200, date: '2026-11-16', occurrenceDate: '2026-11-13', aplicarProximas: true })
  })

  it('"Uma vez" não pergunta, mesmo com data diferente; texto sem reserva descreve o que acontece', () => {
    base()
    render(<EfetivarProvisaoModal schedule={{ ...semanal, frequency: 'once' }} accounts={[]} onClose={() => {}} onConfirm={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(screen.queryByTestId('efetivar-aplicar-proximas')).toBeNull()
    expect(screen.getByText(/a provisão passa a ser uma despesa com o valor e a data informados/)).toBeTruthy()
    expect(screen.queryByText(/apenas o valor e a data serão atualizados/)).toBeNull()
  })

  it('recorrente sem reserva: diz que cria o agendamento da despesa; banco sem coluna avisa', () => {
    base({ recursosBanco: { efetivacoesProvisao: false } })
    render(<EfetivarProvisaoModal schedule={semanal} accounts={[]} onClose={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/será criado só o agendamento da despesa/)).toBeTruthy()
    expect(screen.getByText(MSG_EFETIVACAO_SEM_VINCULO)).toBeTruthy()
  })
})

describe('Desfazer efetivação — modal', () => {
  const efetivado = (pago = false) => {
    const desp = agendamentoDaEfetivacao(semanal, { id: 'desp1', valor: 230, date: '2026-11-16' })
    const r = lib.aplicarEfetivacao([semanal], 'prov_s', { valor: 230, dataReal: '2026-11-16', ocorrencia: '2026-11-13', despesa: desp, id: 'e1', em: 'x' })
    return pago ? r.schedules.map(s => (s.id === 'desp1' ? { ...s, registered: ['2026-11-16'] } : s)) : r.schedules
  }
  const ligar = (lista) => {
    const desfazer = vi.fn(() => ({ ok: true }))
    base({ situacaoDesfazerEfetivacao: (id) => lib.situacaoDesfazer(lista, id), desfazerEfetivacaoProvisao: desfazer })
    return desfazer
  }

  it('confirma: mostra o que volta e o que sai, e chama o desfazer', () => {
    const desfazer = ligar(efetivado())
    const onClose = vi.fn()
    render(<DesfazerEfetivacaoModal scheduleId="prov_s" onClose={onClose} />)
    const t = document.body.textContent
    expect(t).toMatch(/ocorrência de 13\/11\/2026 fica de novo como provisão/)
    expect(t).toMatch(/despesa de 16\/11\/2026 .* será excluído/)
    fireEvent.click(screen.getByRole('button', { name: /^Desfazer$/ }))
    expect(desfazer).toHaveBeenCalledWith('prov_s')
    expect(onClose).toHaveBeenCalled()
  })

  it('já paga: mostra o bloqueio e não oferece o botão', () => {
    const desfazer = ligar(efetivado(true))
    render(<DesfazerEfetivacaoModal scheduleId="desp1" onClose={() => {}} />)
    expect(screen.getByTestId('desfazer-bloqueado').textContent).toBe('Esta efetivação já foi paga. Estorne o pagamento antes de desfazer.')
    expect(screen.queryByRole('button', { name: /^Desfazer$/ })).toBeNull()
    expect(desfazer).not.toHaveBeenCalled()
  })
})
