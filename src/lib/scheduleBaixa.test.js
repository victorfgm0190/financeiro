import { describe, it, expect } from 'vitest'
import {
  candidatosBaixa, atribuirBaixas, planejarBaixas, aplicarBaixa, desfazerBaixa, baixasDaImportacao,
  mapaCobertura, ocorrenciasProjetadas, isOcorrenciaCobertaPorCartao, faturaDaData, faturaDoLancamento,
  lancamentosVinculados, TIPO_BAIXA,
} from './scheduleBaixa'
import { computeOccurrences } from './occurrences'
import { detectParcela } from './installments'
import { inferirSerieParcela, findParcelaDaSerie, findParcelaEquivalente, addMonthToFatura } from './parcelas'

// ── Caso real ────────────────────────────────────────────────────────────────
// Agendamento "Yelumseg SEGURO CARRO" (parcelas 7..12 do seguro), cartão Itaú com fechamento 13.
// Lançamentos já no cartão: 6/12 (fatura 09/2026) e 8/12..12/12 (11/2026..03/2027), todos SEM
// serie_id e com as descrições que a importação antiga gerou.
const CARD = 'acc_1780091925522'
const card = { id: CARD, closingDay: 13 }
const accounts = [{ id: CARD, type: 'credit', closingDay: 13 }]
const agendamento = {
  id: 'sch_1790946611080', description: 'Yelumseg SEGURO CARRO', payee: 'Yelumseg',
  transactionType: 'expense', accountId: CARD, accountType: 'credit', amount: 205.61,
  frequency: 'monthly', occurrenceType: 'installment', installments: 6,
  startDate: '2026-09-30', nextOccurrence: '2026-09-30', registered: [], skipped: [], registeredMeta: {},
}
const parcela = (id, num, fatura, description) => ({
  id, accountId: CARD, accountType: 'credit', type: 'expense', amount: 205.61, description,
  installmentNum: num, installmentTotal: 12, faturaMonthYear: fatura, date: `${addMonthToFatura(fatura, -1)}-15`,
  serieId: null,
})
const lancamentosIniciais = [
  parcela('y6', 6, '2026-09', 'Yelumseg Parc6'),
  parcela('y8', 8, '2026-11', 'Yelumseg Parc6 8/12'),
  parcela('y9', 9, '2026-12', 'Yelumseg Parc6 9/12'),
  parcela('y10', 10, '2027-01', 'Yelumseg Parc6 10/12'),
  parcela('y11', 11, '2027-02', 'Yelumseg Parc2 11/12'),
  parcela('y12', 12, '2027-03', 'Yelumseg Parc3 12/12'),
]

// Mesma sequência do ImportPanel para UMA linha de fatura Itaú: detecta a parcela, infere a série,
// procura a parcela já gravada (regra A) ou cria a nova + as futuras que faltam (regra B), planeja
// e aplica as baixas com o import_id no meta.
function importar(description, { transactions, schedules, importId, totalManual = null }) {
  const det = detectParcela(description)
  const serie = inferirSerieParcela({ base: det.base, num: det.num, total: det.total, amount: 205.61, accountId: CARD }, transactions)
  const anchor = serie?.anchor || null
  const total = det.total || totalManual || serie?.total
  const fatura = anchor ? addMonthToFatura(anchor.faturaMonthYear, det.num - Number(anchor.installmentNum)) : '2026-09'
  const existente = anchor ? findParcelaDaSerie(anchor, det.num, 205.61, transactions) : null
  const serieId = transactions.find(t => anchor && t.serieId && findParcelaDaSerie(anchor, Number(t.installmentNum), 205.61, [t]))?.serieId
    || `serie_${importId}`

  const futuras = []
  if (!existente) {
    for (let k = det.num + 1; k <= total; k++) {
      const futFatura = addMonthToFatura(fatura, k - det.num)
      const ex = (anchor && findParcelaDaSerie(anchor, k, 205.61, transactions))
        || findParcelaEquivalente({ accountId: CARD, base: det.base, amount: 205.61, num: k, total, faturaMonthYear: futFatura, serieId }, transactions)
      futuras.push({ id: `fut_${k}`, parentId: 'L1', num: k, faturaMonthYear: futFatura, amount: 205.61, existenteId: ex?.id || null })
    }
  }
  const plano = planejarBaixas({
    linhas: [{
      id: 'L1', description, payee: description, amount: 205.61, type: 'expense',
      faturaMonthYear: existente ? faturaDoLancamento(existente, 13) : fatura, existenteId: existente?.id || null,
    }],
    futuras, schedules, transactions, card,
  })
  const b = plano.get('L1')
  const criados = []
  let txs = [...transactions]
  const novoId = existente ? null : `${importId}_${det.num}`
  if (!existente) {
    txs.push({
      ...parcela(novoId, det.num, fatura, description), installmentTotal: total, serieId,
      scheduleId: (b?.ativa && b.tipo === TIPO_BAIXA.IMPORTADO) ? b.escolhido.scheduleId : undefined,
    })
    criados.push(novoId)
    for (const f of futuras) {
      if (f.existenteId) continue
      const id = `${importId}_${f.num}`
      txs.push({ ...parcela(id, f.num, f.faturaMonthYear, `${det.base} ${f.num}/${total}`), installmentTotal: total, serieId })
      criados.push(id)
      f.criadoId = id
    }
  }
  let scheds = schedules
  const baixar = (sid, date, tipo, lancamento_id) => {
    scheds = scheds.map(s => s.id === sid ? aplicarBaixa(s, date, { tipo, lancamento_id, import_id: importId }) : s)
  }
  if (b?.ativa) {
    if (b.tipo === TIPO_BAIXA.JA_NO_CARTAO) baixar(b.escolhido.scheduleId, b.escolhido.occurrenceDate, b.tipo, b.existenteId)
    else {
      baixar(b.escolhido.scheduleId, b.escolhido.occurrenceDate, TIPO_BAIXA.IMPORTADO, novoId)
      for (const c of b.coberturas) {
        baixar(c.scheduleId, c.occurrenceDate, TIPO_BAIXA.COBERTA_PARCELA, c.existenteId || futuras.find(f => f.id === c.parcelaId)?.criadoId)
      }
    }
  }
  return { transactions: txs, schedules: scheds, criados, plano }
}

const contarPorNumero = (txs) => {
  const m = new Map()
  for (const t of txs) if (t.installmentNum) m.set(t.installmentNum, (m.get(t.installmentNum) || 0) + 1)
  return m
}

describe('faturaDaData', () => {
  it('fecha pelo closingDay (dia 30 com fechamento 13 vai para a fatura seguinte)', () => {
    expect(faturaDaData('2026-09-30', 13)).toBe('2026-10')
    expect(faturaDaData('2026-09-13', 13)).toBe('2026-09')
    expect(faturaDaData('2026-12-30', 13)).toBe('2027-01')
  })
})

describe('caso real Yelumseg', () => {
  it('ocorrências do agendamento: 30/09 … 28/02, uma por fatura de 10/2026 a 03/2027', () => {
    const occs = computeOccurrences(agendamento, 12)
    expect(occs).toEqual(['2026-09-30', '2026-10-30', '2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28'])
    expect(occs.map(d => faturaDaData(d, 13))).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
  })

  it('a) "Yelumseg Parc7" cria só a 7/12, baixa 30/09 como importado e 30/10..28/02 como coberta_parcela', () => {
    const r = importar('Yelumseg Parc7', { transactions: lancamentosIniciais, schedules: [agendamento], importId: 'imp_a' })
    expect(r.criados).toEqual(['imp_a_7'])
    const nova = r.transactions.find(t => t.id === 'imp_a_7')
    expect(nova).toMatchObject({ installmentNum: 7, installmentTotal: 12, faturaMonthYear: '2026-10' })

    const s = r.schedules[0]
    expect(s.registered).toHaveLength(6)                 // 6/6
    expect(computeOccurrences(s, 12)).toEqual([])
    expect(s.registeredMeta['2026-09-30']).toEqual({ tipo: 'importado', lancamento_id: 'imp_a_7', import_id: 'imp_a' })
    expect(s.registeredMeta['2026-10-30']).toMatchObject({ tipo: 'coberta_parcela', lancamento_id: 'y8' })
    expect(s.registeredMeta['2027-02-28']).toMatchObject({ tipo: 'coberta_parcela', lancamento_id: 'y12' })

    for (const [, n] of contarPorNumero(r.transactions)) expect(n).toBe(1) // nenhuma parcela duplicada
  })

  it('b) depois "Yelumseg Parc8": regra A, nada criado e nada baixado de novo', () => {
    const a = importar('Yelumseg Parc7', { transactions: lancamentosIniciais, schedules: [agendamento], importId: 'imp_a' })
    const b = importar('Yelumseg Parc8', { transactions: a.transactions, schedules: a.schedules, importId: 'imp_b' })
    expect(b.criados).toEqual([])
    expect(b.plano.size).toBe(0)
    expect(b.schedules[0]).toEqual(a.schedules[0])
  })

  it('c) estorno do import (a): 7/12 apagada e agendamento volta para 0/6', () => {
    const a = importar('Yelumseg Parc7', { transactions: lancamentosIniciais, schedules: [agendamento], importId: 'imp_a' })
    // revertCardImport: apaga os lançamentos do lote (txIds) e desfaz as baixas daquele import_id.
    const txs = a.transactions.filter(t => !a.criados.includes(t.id))
    const s = baixasDaImportacao(a.schedules[0], 'imp_a').reduce(desfazerBaixa, a.schedules[0])
    expect(txs.some(t => t.installmentNum === 7)).toBe(false)
    expect(txs).toHaveLength(lancamentosIniciais.length)  // as futuras já existentes ficam
    expect(s.registered).toEqual([])
    expect(s.registeredMeta).toEqual({})
    expect(s.nextOccurrence).toBe('2026-09-30')
    expect(computeOccurrences(s, 12)).toHaveLength(6)
  })

  it('d) sem importar: a ocorrência de 30/10 (fatura 11/2026) está coberta e sai da projeção', () => {
    const cob = mapaCobertura({ schedules: [agendamento], transactions: lancamentosIniciais, accounts })
    const doAgendamento = cob.get(agendamento.id)
    expect([...doAgendamento.entries()]).toEqual([
      ['2026-10-30', 'y8'], ['2026-11-30', 'y9'], ['2026-12-30', 'y10'], ['2027-01-30', 'y11'], ['2027-02-28', 'y12'],
    ])
    const projetadas = ocorrenciasProjetadas(agendamento, 12, cob)
    expect(projetadas).toEqual(['2026-09-30'])
    expect(projetadas.some(d => faturaDaData(d, 13) === '2026-11')).toBe(false)
    expect(isOcorrenciaCobertaPorCartao(agendamento, '2026-10-30', lancamentosIniciais, { closingDay: 13 })).toBe(true)
    expect(isOcorrenciaCobertaPorCartao(agendamento, '2026-09-30', lancamentosIniciais, { closingDay: 13 })).toBe(false)
    // Regra C só sinaliza: o agendamento continua igual.
    expect(computeOccurrences(agendamento, 12)).toHaveLength(6)
  })

  it('regra C: lançamento já vinculado a outra ocorrência não cobre', () => {
    const vinculado = lancamentosIniciais.map(t => t.id === 'y8' ? { ...t, scheduleId: 'outro' } : t)
    const cob = mapaCobertura({ schedules: [agendamento], transactions: vinculado, accounts })
    expect(cob.get(agendamento.id).has('2026-10-30')).toBe(false)
  })
})

describe('item 0 — parcelas futuras sem duplicar', () => {
  it('importar Parc6, Parc7 e Parc8 em sequência: cada installment_num existe 1 vez', () => {
    const base = [parcela('y5', 5, '2026-08', 'Yelumseg Parc5')]
    let r = importar('Yelumseg Parc6', { transactions: base, schedules: [], importId: 'imp6', totalManual: 12 })
    r = importar('Yelumseg Parc7', { transactions: r.transactions, schedules: [], importId: 'imp7' })
    expect(r.criados).toEqual([])
    r = importar('Yelumseg Parc8', { transactions: r.transactions, schedules: [], importId: 'imp8' })
    expect(r.criados).toEqual([])
    const porNum = contarPorNumero(r.transactions)
    for (let k = 5; k <= 12; k++) expect(porNum.get(k)).toBe(1)
  })

  it('reconhece a futura gerada pela importação antiga ("Parc2 11/12") como já existente', () => {
    const ex = findParcelaEquivalente({
      accountId: CARD, base: 'Yelumseg', amount: 205.61, num: 11, total: 12, faturaMonthYear: '2027-02',
    }, lancamentosIniciais)
    expect(ex?.id).toBe('y11')
    expect(findParcelaEquivalente({
      accountId: CARD, base: 'Yelumseg', amount: 205.61, num: 11, total: 12, faturaMonthYear: '2027-03',
    }, lancamentosIniciais)).toBeNull()
  })
})

describe('candidatosBaixa / atribuirBaixas — princípio cartão + valor + fatura', () => {
  const linha = { description: 'Yelumseg Parc7', payee: 'Yelumseg Parc7', amount: 205.61, type: 'expense', faturaMonthYear: '2026-10' }

  it('casa pela fatura, não pela data', () => {
    expect(candidatosBaixa(linha, [agendamento], card)[0]).toMatchObject({ occurrenceDate: '2026-09-30', fatura: '2026-10' })
    expect(candidatosBaixa({ ...linha, faturaMonthYear: '2026-11' }, [agendamento], card)[0].occurrenceDate).toBe('2026-10-30')
    expect(candidatosBaixa({ ...linha, faturaMonthYear: '2027-04' }, [agendamento], card)).toEqual([])
  })

  it('respeita cartão, valor (±R$ 0,05), tipo e agendamentos do motor', () => {
    expect(candidatosBaixa(linha, [agendamento], { id: 'outro', closingDay: 13 })).toEqual([])
    expect(candidatosBaixa({ ...linha, amount: 205.70 }, [agendamento], card)).toEqual([])
    expect(candidatosBaixa({ ...linha, amount: 205.65 }, [agendamento], card)).toHaveLength(1)
    expect(candidatosBaixa({ ...linha, type: 'income' }, [agendamento], card)).toEqual([])
    expect(candidatosBaixa(linha, [{ ...agendamento, tipo: 'pagamento_fatura' }], card)).toEqual([])
  })

  it('similaridade só desempata', () => {
    const outro = { ...agendamento, id: 'sch_outro', description: 'Academia', payee: 'Academia' }
    expect(candidatosBaixa(linha, [outro, agendamento], card).map(c => c.scheduleId)).toEqual([agendamento.id, 'sch_outro'])
    expect(candidatosBaixa(linha, [outro], card)).toHaveLength(1)
  })

  it('uma ocorrência só é baixada por UMA linha; escolha manual tem prioridade', () => {
    const cands = candidatosBaixa(linha, [agendamento], card)
    const m = atribuirBaixas([{ id: 1, candidatos: cands }, { id: 2, candidatos: cands }])
    expect(m.get(1).ativa).toBe(true)
    expect(m.has(2)).toBe(false)
    expect(atribuirBaixas([{ id: 1, candidatos: cands, desligada: true }]).get(1).ativa).toBe(false)
  })
})

describe('lancamentosVinculados', () => {
  it('scheduleId e registered_meta de ocorrência ainda registrada', () => {
    const s = aplicarBaixa(agendamento, '2026-09-30', { tipo: 'ja_no_cartao', lancamento_id: 'y6', import_id: null })
    expect(lancamentosVinculados([s], [{ id: 'x', scheduleId: 'z' }])).toEqual(new Set(['x', 'y6']))
    expect(lancamentosVinculados([desfazerBaixa(s, '2026-09-30')], [])).toEqual(new Set())
  })
})
