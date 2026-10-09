import { describe, it, expect } from 'vitest'
import { filtrarAgendamentos, dataExibidaAgendamento, diaLocal } from './agendamentosFiltro'

// getNextOccurrences simplificado: devolve a(s) próxima(s) data(s) ORIGINAL(is) declaradas no fixture.
const getNext = (s, n = 1) => (s._next || []).slice(0, n)
const HOJE = '2026-10-08'
const FILTRO_14 = { from: '2026-10-14', to: '2026-10-14' }
const ids = (l) => l.map(s => s.id)

const isoComHora = {
  id: 'iso_hora', description: 'Data ISO com hora', amount: 50, frequency: 'once',
  startDate: '2026-10-14T15:30:00.000Z', _next: ['2026-10-14T15:30:00.000Z'],
}
// Ocorrência original 15/10 movida para 14/10 (override): a coluna mostra 14/10.
const comOverride = {
  id: 'override', description: 'Resgate Reserva - Aniversário', amount: 123, frequency: 'once',
  tipo: 'resgate_reserva', startDate: '2026-10-15', _next: ['2026-10-15'],
  overrides: { '2026-10-15': { date: '2026-10-14' } },
}
// Resgate cuja composição usa ids sintéticos sch:<schedule>@<data> (o filtro só olha a data).
const resgateSintetico = {
  id: 'fsch_resg', description: 'Resgate Reserva - Salão', amount: 500, frequency: 'once',
  tipo: 'resgate_reserva', startDate: '2026-10-14', _next: ['2026-10-14'],
  sourceExpenseIds: ['sch:sch_salao@2026-10-14'],
  overrides: { _gerencialKey: 'x', _sourceTxIds: ['sch:sch_salao@2026-10-14'] },
}
// Controle: original 14/10 movida para 15/10 — exibe 15/10, NÃO entra no filtro de 14/10.
const movidoPara15 = {
  id: 'movido_15', description: 'Movido', amount: 10, frequency: 'once',
  startDate: '2026-10-14', _next: ['2026-10-14'],
  overrides: { '2026-10-14': { date: '2026-10-15' } },
}
const todos = [isoComHora, comOverride, resgateSintetico, movidoPara15]

describe('diaLocal', () => {
  it('ISO com hora → dia gravado, sem conversão de fuso', () => {
    expect(diaLocal('2026-10-14T23:30:00-03:00')).toBe('2026-10-14')
    expect(diaLocal('2026-10-14T02:00:00.000Z')).toBe('2026-10-14')
    expect(diaLocal('2026-10-14')).toBe('2026-10-14')
  })
  it('Date → dia local', () => {
    expect(diaLocal(new Date(2026, 9, 14, 23, 59))).toBe('2026-10-14')
  })
  it('vazio/inválido → ""', () => {
    expect(diaLocal('')).toBe('')
    expect(diaLocal(null)).toBe('')
    expect(diaLocal('14/10/2026')).toBe('')
  })
})

describe('filtrarAgendamentos — data 14/10 a 14/10', () => {
  it('a data filtrada é a data exibida (override aplicado)', () => {
    expect(dataExibidaAgendamento(comOverride, getNext, HOJE)).toBe('2026-10-14')
    expect(dataExibidaAgendamento(movidoPara15, getNext, HOJE)).toBe('2026-10-15')
  })

  it('ISO com hora, override de data e resgate sintético em 14/10 entram; o movido para 15/10 não', () => {
    expect(ids(filtrarAgendamentos(todos, FILTRO_14, getNext, HOJE))).toEqual(['iso_hora', 'override', 'fsch_resg'])
  })

  it('Data De / Data Até são inclusivos', () => {
    expect(ids(filtrarAgendamentos(todos, { from: '2026-10-14' }, getNext, HOJE))).toEqual(['iso_hora', 'override', 'fsch_resg', 'movido_15'])
    expect(ids(filtrarAgendamentos(todos, { to: '2026-10-14' }, getNext, HOJE))).toEqual(['iso_hora', 'override', 'fsch_resg'])
    expect(ids(filtrarAgendamentos(todos, { from: '2026-10-15', to: '2026-10-15' }, getNext, HOJE))).toEqual(['movido_15'])
  })

  it('filtros combinados: valor 123–123 + data 14/10 mantém o resgate movido', () => {
    expect(ids(filtrarAgendamentos(todos, { ...FILTRO_14, min: 123, max: 123 }, getNext, HOJE))).toEqual(['override'])
  })

  it('sem nenhum filtro devolve a lista intacta', () => {
    expect(filtrarAgendamentos(todos, {}, getNext, HOJE)).toBe(todos)
  })
})
