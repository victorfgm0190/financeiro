// Efetivação de provisão na DATA REAL e "Desfazer efetivação" (src/lib/efetivacaoProvisao.js).
// Dados FICTÍCIOS. 13/11/2026 = sexta; 16/11 = segunda.
import { describe, it, expect } from 'vitest'
import {
  aplicarEfetivacao, desfazerEfetivacao, situacaoDesfazer, previaProximas, ancoraAposEfetivar,
  vinculoDoAgendamento, MSG_JA_PAGA,
} from './efetivacaoProvisao'
import { agendamentoDaEfetivacao, resgateDaEfetivacao } from './herancaCampos'
import { computeOccurrences } from './occurrences'
import { rotuloParcela } from './numeroParcela'
import { scheduleToRow, rowToSchedule } from './db'

const semanal = {
  id: 'prov_s', description: 'PROVISÃO TESTE', transactionType: 'expense', accountId: 'cc', amount: 200,
  frequency: 'weekly', startDate: '2026-11-13', nextOccurrence: null, occurrenceType: 'continuous', installments: 0,
  registered: [], skipped: [], overrides: {}, autoRegister: false, isProvisao: true, provisaoEfetivada: false,
  provisaoEfetivadaUntil: null, efetivacoes: [],
}

// Mesmo caminho do AppContext.efetivarProvisao: despesa (recorrente) e resgate montados por
// herancaCampos com a DATA REAL, aplicados por aplicarEfetivacao.
let seq = 0
function efetivar(schedules, provId, { valor, dataReal, ocorrencia, aplicarProximas = false, reserva = null }) {
  const prov = schedules.find(s => s.id === provId)
  const once = (prov.frequency || 'once') === 'once'
  const despesa = once ? null : agendamentoDaEfetivacao(prov, { id: `desp_${++seq}`, valor, date: dataReal, occurrenceDate: ocorrencia })
  const resgate = reserva ? resgateDaEfetivacao(prov, { id: `resg_${++seq}`, valor, date: dataReal, occurrenceDate: ocorrencia, ...reserva }) : null
  return aplicarEfetivacao(schedules, provId, { valor, dataReal, ocorrencia, aplicarProximas, despesa, resgate, id: `efet_${++seq}`, em: '2026-11-16T12:00:00.000Z' })
}

describe('efetivação na data real (provisão semanal)', () => {
  it('1. 13/11 efetivada em 16/11, "só esta": agendamento em 16/11 e próxima em 20/11', () => {
    const r = efetivar([semanal], 'prov_s', { valor: 230, dataReal: '2026-11-16', ocorrencia: '2026-11-13' })
    const desp = r.schedules.find(s => s.id === r.registro.despesaId)
    expect(desp).toMatchObject({ startDate: '2026-11-16', amount: 230, frequency: 'once', isProvisao: false })
    expect(r.provisao.nextOccurrence).toBe('2026-11-20')
    expect(computeOccurrences(r.provisao, 3)).toEqual(['2026-11-20', '2026-11-27', '2026-12-04'])
    expect(r.registro).toMatchObject({ ocorrencia: '2026-11-13', dataReal: '2026-11-16', aplicarProximas: false })
  })

  it('2. "também as próximas": agendamento em 16/11 e próxima em 23/11 (segundas)', () => {
    const r = efetivar([semanal], 'prov_s', { valor: 230, dataReal: '2026-11-16', ocorrencia: '2026-11-13', aplicarProximas: true })
    expect(r.schedules.find(s => s.id === r.registro.despesaId).startDate).toBe('2026-11-16')
    expect(computeOccurrences(r.provisao, 3)).toEqual(['2026-11-23', '2026-11-30', '2026-12-07'])
    expect(r.registro.aplicarProximas).toBe(true)
  })

  it('a prévia da modal mostra as datas reais de cada opção', () => {
    const o = { ocorrencia: '2026-11-13', dataReal: '2026-11-16' }
    expect(previaProximas(semanal, { ...o, aplicarProximas: false }, 2)).toEqual(['2026-11-20', '2026-11-27'])
    expect(previaProximas(semanal, { ...o, aplicarProximas: true }, 2)).toEqual(['2026-11-23', '2026-11-30'])
    expect(previaProximas({ ...semanal, frequency: 'once' }, { ...o, aplicarProximas: true })).toEqual([])
  })

  it('3. data real = ocorrência: avança normalmente (aplicarProximas é ignorado)', () => {
    const r = efetivar([semanal], 'prov_s', { valor: 200, dataReal: '2026-11-13', ocorrencia: '2026-11-13', aplicarProximas: true })
    expect(r.schedules.find(s => s.id === r.registro.despesaId).startDate).toBe('2026-11-13')
    expect(r.provisao.nextOccurrence).toBe('2026-11-20')
    expect(r.registro.aplicarProximas).toBe(false)
  })

  it('sem data real (payload legado) o agendamento cai na ocorrência — nunca na 1ª da série', () => {
    const prov = { ...semanal, startDate: '2026-10-02', nextOccurrence: '2026-11-13' }
    expect(agendamentoDaEfetivacao(prov, { id: 'x', valor: 1, date: '', occurrenceDate: '2026-11-13' }).startDate).toBe('2026-11-13')
  })
})

describe('4. mensal com dia fixo e parcelada', () => {
  // 4x, dia fixo 31: 31/10, 30/11, 31/12, 31/01.
  const parcelada = {
    ...semanal, id: 'prov_m', frequency: 'monthly', startDate: '2026-10-31', occurrenceType: 'installment', installments: 4,
    overrides: { _diaVencimento: 31 },
  }

  it('"só esta": mantém o dia 31 (30/11 em novembro) e a quantidade (3 restantes, 2/4)', () => {
    expect(computeOccurrences(parcelada, 10)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31'])
    const r = efetivar([parcelada], 'prov_m', { valor: 99, dataReal: '2026-11-03', ocorrencia: '2026-10-31' })
    expect(r.schedules.find(s => s.id === r.registro.despesaId).startDate).toBe('2026-11-03')
    expect(computeOccurrences(r.provisao, 10)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31'])
    expect(r.provisao.overrides._diaVencimento).toBe(31)
    expect(rotuloParcela(r.provisao, '2026-11-30')).toBe('2/4')
  })

  it('"também as próximas": re-ancora no dia da data real e mantém a quantidade', () => {
    const r = efetivar([parcelada], 'prov_m', { valor: 99, dataReal: '2026-11-03', ocorrencia: '2026-10-31', aplicarProximas: true })
    expect(computeOccurrences(r.provisao, 10)).toEqual(['2026-12-03', '2027-01-03', '2027-02-03'])
    expect(r.provisao.overrides._diaVencimento).toBe(3)
  })

  it('efetivando todas, a série termina no total de parcelas', () => {
    let lista = [parcelada]
    for (const occ of ['2026-10-31', '2026-11-30', '2026-12-31']) {
      lista = efetivar(lista, 'prov_m', { valor: 99, dataReal: occ, ocorrencia: occ }).schedules
    }
    expect(computeOccurrences(lista.find(s => s.id === 'prov_m'), 10)).toEqual(['2027-01-31'])
    lista = efetivar(lista, 'prov_m', { valor: 99, dataReal: '2027-01-31', ocorrencia: '2027-01-31' }).schedules
    expect(computeOccurrences(lista.find(s => s.id === 'prov_m'), 10)).toEqual([])
    expect(lista.filter(s => s.id.startsWith('desp_')).length).toBe(4)
  })

  it('mensal sem dia fixo, "também as próximas", ganha o dia da data real', () => {
    const p = { ...parcelada, overrides: {}, startDate: '2026-11-10' }
    expect(ancoraAposEfetivar(p, { ocorrencia: '2026-11-10', dataReal: '2026-11-12', aplicarProximas: true }))
      .toEqual({ ancora: '2026-12-12', diaVencimento: 12 })
    expect(ancoraAposEfetivar(p, { ocorrencia: '2026-11-10', dataReal: '2026-11-12' }))
      .toEqual({ ancora: '2026-12-10', diaVencimento: null })
  })
})

describe('5. provisão com reserva', () => {
  const reserva = { contaReserva: { id: 'res', type: 'savings' }, contaPrincipal: { id: 'cc' } }
  const comReserva = { ...semanal, reservaFuncaoId: 'rf1' }

  it('o resgate nasce na data real e sai junto ao desfazer', () => {
    const r = efetivar([comReserva], 'prov_s', { valor: 230, dataReal: '2026-11-16', ocorrencia: '2026-11-13', reserva })
    const resg = r.schedules.find(s => s.id === r.registro.resgateId)
    expect(resg).toMatchObject({ startDate: '2026-11-16', amount: 230, transactionType: 'transfer', accountId: 'res', toAccountId: 'cc', reservaFuncaoId: 'rf1' })
    const u = desfazerEfetivacao(r.schedules, 'prov_s')
    expect(u.removidos.sort()).toEqual([r.registro.despesaId, r.registro.resgateId].sort())
    expect(u.schedules).toEqual([{ ...comReserva, efetivacoes: [] }])
  })

  it('"Uma vez" com reserva: o resgate também fica na data real', () => {
    const once = { ...comReserva, frequency: 'once', startDate: '2026-11-13' }
    const r = efetivar([once], 'prov_s', { valor: 230, dataReal: '2026-11-16', reserva })
    expect(r.schedules.find(s => s.id === r.registro.resgateId).startDate).toBe('2026-11-16')
    expect(r.registro.despesaId).toBeNull()
  })
})

describe('6. desfazer devolve o estado anterior', () => {
  it('recorrente: a série volta exatamente como era (âncora, overrides, sem o agendamento criado)', () => {
    const prov = { ...semanal, startDate: '2026-10-02', nextOccurrence: '2026-11-13', overrides: { '2026-11-27': { amount: 300 } } }
    const outro = { id: 'outro', description: 'Outro', frequency: 'once', startDate: '2026-11-01', registered: [] }
    const r = efetivar([prov, outro], 'prov_s', { valor: 230, dataReal: '2026-11-16', ocorrencia: '2026-11-13', aplicarProximas: true })
    const u = desfazerEfetivacao(r.schedules, r.registro.despesaId)  // pela linha da despesa também
    expect(u.schedules).toEqual([{ ...prov, efetivacoes: [] }, outro])
    expect(computeOccurrences(u.provisao, 1)).toEqual(['2026-11-13'])
  })

  it('dia fixo trocado pelo "também as próximas" volta ao de antes', () => {
    const prov = { ...semanal, frequency: 'monthly', startDate: '2026-10-31', overrides: { _diaVencimento: 31 } }
    const r = efetivar([prov], 'prov_s', { valor: 1, dataReal: '2026-11-03', ocorrencia: '2026-10-31', aplicarProximas: true })
    expect(r.provisao.overrides._diaVencimento).toBe(3)
    expect(desfazerEfetivacao(r.schedules, 'prov_s').provisao).toEqual({ ...prov, efetivacoes: [] })
  })

  it('"Uma vez": valor, data e situação de antes; reaberta para efetivar', () => {
    const once = { ...semanal, frequency: 'once', startDate: '2026-11-20', amount: 100, autoRegister: false }
    const r = efetivar([once], 'prov_s', { valor: 120, dataReal: '2026-11-22' })
    expect(r.provisao).toMatchObject({ amount: 120, startDate: '2026-11-22', provisaoEfetivada: true, autoRegister: true })
    expect(r.registro).toMatchObject({ ocorrencia: '2026-11-20', dataReal: '2026-11-22', despesaId: null })
    const u = desfazerEfetivacao(r.schedules, 'prov_s')
    expect(u.provisao).toEqual({ ...once, efetivacoes: [] })
    expect(u.removidos).toEqual([])
  })

  it('várias efetivações: desfaz da mais recente para a mais antiga', () => {
    let lista = [semanal]
    const a = efetivar(lista, 'prov_s', { valor: 1, dataReal: '2026-11-16', ocorrencia: '2026-11-13' })
    const b = efetivar(a.schedules, 'prov_s', { valor: 2, dataReal: '2026-11-20', ocorrencia: '2026-11-20' })
    lista = desfazerEfetivacao(b.schedules, 'prov_s').schedules
    expect(lista).toEqual(a.schedules)
    lista = desfazerEfetivacao(lista, 'prov_s').schedules
    expect(lista).toEqual([{ ...semanal, efetivacoes: [] }])
  })
})

describe('7. bloqueios', () => {
  it('despesa já paga → mensagem de estorno e nada muda', () => {
    const r = efetivar([semanal], 'prov_s', { valor: 230, dataReal: '2026-11-16', ocorrencia: '2026-11-13' })
    const pago = r.schedules.map(s => (s.id === r.registro.despesaId ? { ...s, registered: ['2026-11-16'] } : s))
    expect(situacaoDesfazer(pago, 'prov_s')).toMatchObject({ pode: false, motivo: 'pago', mensagem: MSG_JA_PAGA })
    expect(MSG_JA_PAGA).toBe('Esta efetivação já foi paga. Estorne o pagamento antes de desfazer.')
    expect(desfazerEfetivacao(pago, 'prov_s')).toBeNull()
  })

  it('resgate já pago → bloqueia', () => {
    const r = efetivar([{ ...semanal, reservaFuncaoId: 'rf' }], 'prov_s', {
      valor: 1, dataReal: '2026-11-16', ocorrencia: '2026-11-13', reserva: { contaReserva: { id: 'res' }, contaPrincipal: { id: 'cc' } },
    })
    const pago = r.schedules.map(s => (s.id === r.registro.resgateId ? { ...s, registered: ['2026-11-16'] } : s))
    expect(situacaoDesfazer(pago, r.registro.despesaId).motivo).toBe('pago')
  })

  it('"Uma vez" paga depois da efetivação → bloqueia', () => {
    const r = efetivar([{ ...semanal, frequency: 'once' }], 'prov_s', { valor: 1, dataReal: '2026-11-16' })
    const pago = r.schedules.map(s => ({ ...s, registered: ['2026-11-16'] }))
    expect(situacaoDesfazer(pago, 'prov_s').motivo).toBe('pago')
  })

  it('não é a mais recente → explica qual desfazer antes', () => {
    const a = efetivar([semanal], 'prov_s', { valor: 1, dataReal: '2026-11-16', ocorrencia: '2026-11-13' })
    const b = efetivar(a.schedules, 'prov_s', { valor: 2, dataReal: '2026-11-20', ocorrencia: '2026-11-20' })
    const sit = situacaoDesfazer(b.schedules, a.registro.despesaId)
    expect(sit).toMatchObject({ pode: false, motivo: 'nao_mais_recente' })
    expect(sit.mensagem).toMatch(/mais recente.*20\/11\/2026/)
    expect(desfazerEfetivacao(b.schedules, a.registro.despesaId)).toBeNull()
    expect(situacaoDesfazer(b.schedules, b.registro.despesaId).pode).toBe(true)
  })

  it('efetivação antiga, sem vínculo gravado: sem botão e sem adivinhar por descrição/data/valor', () => {
    // Mesmo formato das efetivações antigas: provisão avançada + agendamento igual, sem `efetivacoes`.
    const antiga = { ...semanal, startDate: '2026-11-20', nextOccurrence: '2026-11-20', efetivacoes: undefined }
    const desp = agendamentoDaEfetivacao(semanal, { id: 'desp_antiga', valor: 200, date: '2026-11-13' })
    expect(vinculoDoAgendamento([antiga, desp], 'prov_s')).toBeNull()
    expect(vinculoDoAgendamento([antiga, desp], 'desp_antiga')).toBeNull()
    expect(situacaoDesfazer([antiga, desp], 'desp_antiga')).toMatchObject({ pode: false, motivo: 'sem_vinculo' })
  })

  it('banco sem a coluna: efetiva sem vínculo (não pode desfazer)', () => {
    const r = aplicarEfetivacao([semanal], 'prov_s', { valor: 1, dataReal: '2026-11-16', ocorrencia: '2026-11-13', comVinculo: false })
    expect(r.registro).toBeNull()
    expect(r.provisao.efetivacoes).toEqual([])
    expect(r.provisao.nextOccurrence).toBe('2026-11-20')
  })
})

describe('8. o vínculo sobrevive ao recarregar (mapeamento do sync/load)', () => {
  it('scheduleToRow → JSON (corpo do /api/sync) → rowToSchedule devolve as efetivações intactas', () => {
    const r = efetivar([{ ...semanal, reservaFuncaoId: 'rf' }], 'prov_s', {
      valor: 230, dataReal: '2026-11-16', ocorrencia: '2026-11-13', aplicarProximas: true,
      reserva: { contaReserva: { id: 'res' }, contaPrincipal: { id: 'cc' } },
    })
    const row = JSON.parse(JSON.stringify(scheduleToRow(r.provisao)))
    expect(row.efetivacoes).toEqual(r.provisao.efetivacoes)
    const volta = rowToSchedule(row)
    expect(volta.efetivacoes).toEqual(r.provisao.efetivacoes)
    // Recarregado, o desfazer funciona igual.
    const lista = r.schedules.map(s => (s.id === 'prov_s' ? volta : s))
    expect(situacaoDesfazer(lista, 'prov_s').pode).toBe(true)
  })

  it('agendamento sem efetivações manda [] (neutro: ambiente sem a coluna não recusa o sync)', () => {
    expect(scheduleToRow({ ...semanal, efetivacoes: undefined }).efetivacoes).toEqual([])
    expect(rowToSchedule({ id: 'x' }).efetivacoes).toEqual([])
  })
})
