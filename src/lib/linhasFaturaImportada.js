// Linhas da Importar Fatura (cartão): parcela, série e fatura de cada linha do arquivo. FONTE ÚNICA,
// usada pela tela (components/Import/ImportPanel.jsx) e pelas simulações (a partir do TEXTO REAL do
// arquivo, nunca do banco). Só o que decide o casamento mora aqui; classificação (categoria, grupo,
// favorecido, agendamento) continua na tela.
import { installmentKey, detectInstallment, detectParcela } from './installments.js'
import { addMonthToFatura, faturaToDate, installmentSystemDate, inferirSerieParcela, irmaDaParcela, newSerieId } from './parcelas.js'
import { keyOfExistingTx } from './revisaoImportacao.js'

// Calcula o mês da fatura (YYYY-MM) de um lançamento dado o dia de fechamento do cartão.
// dia <= closingDay → fatura do mês corrente; dia > closingDay → fatura do mês seguinte.
export function calcFatura(dateStr, closingDay = 14) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  let m, y
  if (day <= closingDay) { m = d.getMonth() + 1; y = d.getFullYear() }
  else { const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); m = n.getMonth() + 1; y = n.getFullYear() }
  return `${y}-${String(m).padStart(2, '0')}`
}

// fatura_ref (YYYY-MM) a partir do DIA da data ORIGINAL do extrato (date_cartao),
// relativa ao mês de referência selecionado. Correção do bug de desvio de mês:
//   dia <= closingDay → fatura = mês de referência
//   dia >  closingDay → fatura = mês ANTERIOR ao de referência
// (gastos após o fechamento já entraram na fatura que está sendo importada por terem
//  ocorrido depois do último fechamento, então pertencem à fatura anterior).
export function faturaRefFromReference(dateCartaoStr, referenceYYYYMM, closingDay) {
  if (!referenceYYYYMM) return ''
  if (!dateCartaoStr) return referenceYYYYMM
  const day = parseInt((dateCartaoStr.split('-')[2] || '1'), 10)
  return day <= (closingDay || 14) ? referenceYYYYMM : addMonthToFatura(referenceYYYYMM, -1)
}

// Reescreve cada linha base para o mês de referência. As parcelas geradas (siblings)
// seguem ancoradas à fatura da linha base.
//
// Itaú CSV e XLS/XLSX (row._itau): fatura_ref = SEMPRE o mês de referência; a date de sistema
// mantém a data original do arquivo quando ela está dentro do período válido da fatura
// (início = closingDay+1 do mês anterior; fim = closingDay do mês de referência) e, se
// estiver fora (parcelados antigos), clampa para o dia de fechamento do mês de referência.
//
// Dindin (demais): comportamento anterior — fatura_ref pela data original (dia vs
// fechamento) e date no mês de referência mantendo o dia original.
export function applyReferenceFatura(rows, reference, closingDay, dueDay, financialStartDay = 1) {
  if (!reference) return rows
  const [fy, fm] = reference.split('-').map(Number)
  const daysInMonth = new Date(fy, fm, 0).getDate()
  const step1 = rows.map(row => {
    if (row._generated) return row
    const origDay = row._origDay ?? parseInt((row.date || '').split('-')[2] || '1', 10)
    const clampedDay = String(Math.min(origDay, daysInMonth)).padStart(2, '0')
    const dateCartao = row._dateCartao || row.date
    const num = row._installment?.num || 1
    if (row._itau) {
      // Parcela 1 / à vista: date = date_cartao, SEM clamp. O clampDateToFatura que havia aqui
      // jogava uma compra anterior à janela da fatura para o dia de FECHAMENTO — date_cartao
      // 10/07 + fatura 2026-08 (closing 13) virava 13/08. Parcela >1 segue a regra do Finup
      // (dia financeiro do mês anterior à fatura). date_cartao nunca é alterada.
      return {
        ...row,
        faturaMonthYear: reference,
        date: num <= 1 ? dateCartao : installmentSystemDate(reference, num, dateCartao, financialStartDay),
      }
    }
    // Parcela 2..N: a date_cartao é a data da COMPRA ORIGINAL (fatura antiga) — NUNCA recalcula a
    // fatura por ela. Todo o arquivo é o extrato de UMA fatura, então a parcela pertence ao mês de
    // REFERÊNCIA selecionado. Sem isto, parcelas com compra após o fechamento driftam p/ o mês
    // anterior (totalizador partido, mês "pula" ao reprocessar). À vista / parcela 1 mantêm a regra
    // por data (dia da compra vs fechamento), que é legítima.
    const fatura = num > 1 ? reference : faturaRefFromReference(dateCartao, reference, closingDay)
    return {
      ...row,
      faturaMonthYear: fatura,
      date: installmentSystemDate(fatura, num, `${reference}-${clampedDay}`, financialStartDay),
    }
  })
  return step1.map(row => {
    if (!row._generated) return row
    const parent = step1.find(r => r._id === row._seriesId)
    if (!parent) return row
    const faturaI = addMonthToFatura(parent.faturaMonthYear, row._installmentNum - 1)
    // Parcelas geradas (siblings) são sempre num > 1 → data no mês anterior à fatura da parcela.
    return { ...row, faturaMonthYear: faturaI, date: installmentSystemDate(faturaI, row._installmentNum, faturaToDate(faturaI, dueDay) || row.date, financialStartDay) }
  })
}

// Um arquivo de cartão é o extrato de UMA fatura: toda parcela X/N nele pertence a esse mês.
// Ancora a parcela base ao mês de referência (sem o offset que pode driftar) e recomputa
// as parcelas geradas (siblings) a partir dela. À-vista não são tocadas.
export function alignInstallmentsToFatura(rows, fatura, dueDay) {
  if (!fatura) return rows
  const [fy, fm] = fatura.split('-').map(Number)
  const maxDay = new Date(fy, fm, 0).getDate()
  const step1 = rows.map(row => {
    if (row._generated || !row._installment || row.faturaMonthYear === fatura) return row
    const origDay = row._origDay ?? parseInt((row.date || '').split('-')[2] || '1', 10)
    return { ...row, faturaMonthYear: fatura, date: `${fatura}-${String(Math.min(origDay, maxDay)).padStart(2, '0')}` }
  })
  return step1.map(row => {
    if (!row._generated) return row
    const parent = step1.find(r => r._id === row._seriesId)
    if (!parent) return row
    const faturaI = addMonthToFatura(parent.faturaMonthYear, row._installmentNum - 1)
    return { ...row, faturaMonthYear: faturaI, date: faturaToDate(faturaI, dueDay) || row.date }
  })
}

// Chave da SÉRIE de parcelas = installment_key SEM o número da parcela
// (accountId | base | total | cents | serie_inicio). Parcelas irmãs (2/12, 3/12, …)
// compartilham esta chave — usada para herdar o grupo gerencial de uma parcela anterior.
export function serieKeyFromFull(fullKey) {
  if (!fullKey) return null
  const parts = fullKey.split('|')
  if (parts.length < 5) return null
  const total = parts[2].split('/')[1] || parts[2]
  return `${parts[0]}|${parts[1]}|${total}|${parts[3]}|${parts[4]}`
}
export function serieKeyOfExistingTx(tx) { return serieKeyFromFull(keyOfExistingTx(tx)) }

// Herança entre parcelas da MESMA série: índice série → { serieId, grupo, payee } dos lançamentos
// já existentes no cartão. Casa por série (installment_key sem o número) porque a nova parcela
// ainda não tem serie_id. Grupo herda a classificação da irmã (ignora D — herdar D é no-op).
export function indiceSeriesDoCartao(transactions, accountId, grupoD = null) {
  const m = new Map()
  if (!accountId) return m
  for (const t of transactions || []) {
    if (t.accountId !== accountId || t.type !== 'expense' || t.accountType !== 'credit') continue
    const sk = serieKeyOfExistingTx(t)
    if (!sk) continue
    const cur = m.get(sk) || { serieId: null, grupo: null, payee: null }
    if (!cur.serieId && t.serieId) cur.serieId = t.serieId
    if (!cur.payee && t.payee) cur.payee = t.payee
    if (!cur.grupo && t.grupoGerencial && t.grupoGerencial !== grupoD) cur.grupo = t.grupoGerencial
    m.set(sk, cur)
  }
  return m
}

// Parcela, série e fatura de UMA linha do arquivo (antes do mês de referência).
// Parcela "N/Total" ou por extenso ("Yelumseg Parc7", coluna Parcelamento vazia). Por extenso, a
// série é a já gravada no cartão: dela vêm o total (quando o arquivo não traz), o serie_id e a
// classificação. "ParcN" sem total e sem série conhecida segue à vista.
// → { installInfo, anchor, irma, serieInfo, faturaMonthYear, serieId, serieExistente }
export function parcelaDaLinha(row, { accountId, transactions, closingDay = 14, series = null }) {
  const parcDet = detectParcela(row.description)
  const porExtenso = !!parcDet && !detectInstallment(row.description)
  const serieInferida = (porExtenso && accountId && (row.type || 'expense') === 'expense')
    ? inferirSerieParcela({ base: parcDet.base, num: parcDet.num, total: parcDet.total, amount: row.amount, accountId }, transactions)
    : null
  const anchor = serieInferida?.anchor || null
  const installInfo = !parcDet ? null
    : !porExtenso ? parcDet
    : (parcDet.total || anchor) ? { num: parcDet.num, total: parcDet.total || serieInferida.total, base: parcDet.base, matchStr: null, _porExtenso: true }
    : null
  // Parcela N > 1 sem série inferida: categoria e favorecido sugeridos pela irmã do MESMO cartão.
  const irma = (!anchor && installInfo && installInfo.num > 1 && accountId)
    ? irmaDaParcela({ base: installInfo.base, total: installInfo.total, amount: row.amount, accountId }, transactions)
    : null
  const faturaParc1 = calcFatura(row.date, closingDay)
  // Para parcelados X/N com X > 1: fatura = fatura da parcela 1 + (X-1) meses. Série inferida: a
  // fatura sai da irmã gravada — a data do "ParcN" é a da cobrança, não a da compra.
  const faturaMonthYear = anchor?.faturaMonthYear
    ? addMonthToFatura(anchor.faturaMonthYear, installInfo.num - Number(anchor.installmentNum))
    : (installInfo && installInfo.num > 1)
      ? addMonthToFatura(faturaParc1, installInfo.num - 1)
      : faturaParc1
  // Casa a linha à série existente no cartão (installment_key sem o número): serie_id e grupo.
  const serieInfo = (installInfo && accountId)
    ? ((series || indiceSeriesDoCartao(transactions, accountId)).get(serieKeyFromFull(installmentKey({
        accountId, description: row.description,
        installmentNum: installInfo.num, installmentTotal: installInfo.total,
        amount: row.amount, faturaMonthYear,
      }))) || null)
    : null
  // serie_id da linha: o da série já existente ou um novo para uma compra parcelada NOVA.
  const serieId = installInfo ? (anchor?.serieId || serieInfo?.serieId || newSerieId()) : null
  return {
    installInfo, anchor, irma, serieInfo, faturaMonthYear, serieId,
    serieExistente: (installInfo && (anchor?.serieId || serieInfo?.serieId)) || null,
  }
}

// Linhas do arquivo → linhas da revisão, só com o que decide o casamento (sem classificação):
// parcela/série/fatura (parcelaDaLinha), ordem, alinhamento e mês de referência — a MESMA sequência
// da tela. Para simulações e testes a partir do texto real do arquivo.
export function linhasDaFaturaParaRevisao(parsed, { accountId, transactions, closingDay = 14, dueDay = null, reference, isItau = true, financialStartDay = 1 }) {
  const series = indiceSeriesDoCartao(transactions, accountId)
  const base = (parsed || []).map((row, i) => {
    const p = parcelaDaLinha(row, { accountId, transactions, closingDay, series })
    return {
      ...row, _id: i, _installment: p.installInfo, _generated: false, _serieId: p.serieId,
      _serieExistente: p.serieExistente, _serieAnchor: p.anchor,
      faturaMonthYear: p.faturaMonthYear, _origDay: new Date(row.date + 'T00:00:00').getDate(),
      _dateCartao: row.date, _itau: isItau, selected: true,
    }
  }).sort((a, b) => a.faturaMonthYear.localeCompare(b.faturaMonthYear) || a.date.localeCompare(b.date))
  const alinhadas = reference ? alignInstallmentsToFatura(base, reference, dueDay) : base
  return reference ? applyReferenceFatura(alinhadas, reference, closingDay, dueDay, financialStartDay) : alinhadas
}
