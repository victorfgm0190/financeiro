#!/usr/bin/env node
// Simula a tela de Revisão da importação de fatura do Itaú SEM confirmar nada: lê o arquivo com o
// parser real, resolve a parcela de cada linha como o handleFile do ImportPanel (coluna
// Parcelamento, "ParcN" + série gravada) e roda o casamento da Revisão (lib/revisaoImportacao)
// contra os lançamentos do cartão no Neon. Só faz SELECT.
//
//   node --env-file=.env.local scripts/simular-revisao-fatura.mjs <arquivo.xlsx> <accountId> [YYYY-MM] [--todas]
//
// --todas lista todas as linhas; sem ele, só as que não são "Novo" simples.
// --mesmo simula o clique em "É o mesmo" em todas as possíveis duplicatas.
// No fim mostra, por colisão ("No banco"), os campos que o UPDATE mudaria (patchColisao) e o
// resumo que a tela final daria confirmando tudo como está.
import fs from 'node:fs'
import pg from 'pg'
import * as XLSX from 'xlsx'
import { parseItauXLS } from '../src/lib/parsers/itauFatura.js'
import { detectInstallment, detectParcela } from '../src/lib/installments.js'
import { inferirSerieParcela, installmentSystemDate } from '../src/lib/parcelas.js'
import {
  resolverLinhasRevisao, projetarTotalFatura, fmtFatura, totalParcelasDoTx, numeroParcelaDoTx,
  linhasAImportar, patchColisao, camposAlteradosColisao, textoResumoImportacao,
} from '../src/lib/revisaoImportacao.js'

const [, , file, accountId, faturaArg, ...flags] = process.argv
if (!file || !accountId) {
  console.error('Uso: node --env-file=.env.local scripts/simular-revisao-fatura.mjs <arquivo.xlsx> <accountId> [YYYY-MM] [--todas]')
  process.exit(2)
}
const todas = flags.includes('--todas') || faturaArg === '--todas'
const mesmo = flags.includes('--mesmo') || faturaArg === '--mesmo'
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null))

const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true })
const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
const { rows: parsed, faturaMY } = parseItauXLS(aoa)
const fatura = (faturaArg && /^\d{4}-\d{2}$/.test(faturaArg)) ? faturaArg : faturaMY

const db = new pg.Client({ connectionString: process.env.NEON_DATABASE_URL })
await db.connect()
const { rows: accRows } = await db.query('SELECT id, name, closing_day FROM contas WHERE id = $1', [accountId])
const { rows: txRows } = await db.query('SELECT * FROM lancamentos WHERE account_id = $1', [accountId])
const { rows: cfgRows } = await db.query('SELECT financial_month_start_day FROM configuracoes LIMIT 1')
await db.end()
const closingDay = accRows[0]?.closing_day || 14
const financialStartDay = cfgRows[0]?.financial_month_start_day || 1
const transactions = txRows.map(r => ({
  id: r.id, type: r.type, accountId: r.account_id, amount: Number(r.amount),
  date: ymd(r.date), dateCartao: ymd(r.date_cartao), description: r.description || '',
  accountType: r.account_type || '', isEspelho: !!r.is_espelho,
  faturaMonthYear: r.fatura_month_year || null, installmentNum: r.installment_num ?? null,
  installmentTotal: r.installment_total ?? null, installmentOccurrence: r.installment_occurrence ?? null,
  serieId: r.serie_id || null, categoryId: r.category_id || '', grupoGerencial: r.grupo_gerencial || null,
  reservaFuncaoId: r.reserva_funcao_id || null, faturaRef: r.fatura_ref || null,
}))

// Mesma resolução de parcela do handleFile (ImportPanel) para o ramo Itaú.
const rows = parsed.map((row, i) => {
  const parcDet = detectParcela(row.description)
  const porExtenso = !!parcDet && !detectInstallment(row.description)
  const serie = (porExtenso && row.type === 'expense')
    ? inferirSerieParcela({ base: parcDet.base, num: parcDet.num, total: parcDet.total, amount: row.amount, accountId }, transactions)
    : null
  const anchor = serie?.anchor || null
  const installInfo = !parcDet ? null
    : !porExtenso ? parcDet
    : (parcDet.total || anchor) ? { num: parcDet.num, total: parcDet.total || serie.total, base: parcDet.base, matchStr: null } : null
  return { ...row, _id: i, _installment: installInfo, _serieAnchor: anchor, _dateCartao: row.date, faturaMonthYear: fatura, _itau: true, _generated: false }
})

let resolved = resolverLinhasRevisao(rows, { accountId, transactions, closingDay })
if (mesmo) {
  const escolha = new Map(resolved.filter(r => r._dupLevel === 'possivel').map(r => [r._id, r._dupTx.id]))
  resolved = resolverLinhasRevisao(rows.map(r => escolha.has(r._id) ? { ...r, _mesmoQueId: escolha.get(r._id) } : r), { accountId, transactions, closingDay })
}
const proj = projetarTotalFatura(resolved, { fatura, accountId, transactions, closingDay })

const parc = (t) => { const n = numeroParcelaDoTx(t), tt = totalParcelasDoTx(t); return n ? ` ${n}${tt ? '/' + tt : ''}` : '' }
const status = (r) => r._collisionTx ? (r._mesmoConfirmado ? 'É o mesmo ↻' : 'No banco ↻')
  : r._dupLevel === 'certeza' ? 'Já existe'
  : r._dupLevel === 'possivel' ? 'Possível duplicata'
  : 'Novo'
const descTx = (t) => `${t.description} (parc.${parc(t) || ' —'} · fatura ${fmtFatura(t.faturaMonthYear)} · ${brl(t.amount)} · ${t.id})`

console.log(`\nRevisão simulada — ${file}`)
console.log(`Cartão ${accRows[0]?.name || accountId} (fechamento ${closingDay}) · fatura ${fmtFatura(fatura)} · ${resolved.length} linhas\n`)
const cont = {}
for (const r of resolved) {
  const s = status(r)
  cont[s] = (cont[s] || 0) + 1
  const destaque = s !== 'Novo' || r._tambemEm.length > 0 || /yelumseg|aramis|m6 comercio/i.test(r.description)
  if (!todas && !destaque) continue
  const inst = r._installment ? ` [${r._installment.num}/${r._installment.total}]` : ''
  console.log(`  ${r._dateCartao}  ${brl(r.type === 'income' ? -r.amount : r.amount).padStart(12)}  ${(r.description + inst).padEnd(40)}  ${s}`)
  const tx = r._collisionTx || r._dbTx || r._dupTx
  if (tx) console.log(`${' '.repeat(16)}↳ banco: ${descTx(tx)}`)
  for (const o of r._tambemEm) console.log(`${' '.repeat(16)}↳ também em ${fmtFatura(o.fatura)}: ${descTx(o.tx)}`)
}
console.log('\n  Status:', Object.entries(cont).map(([k, v]) => `${k}: ${v}`).join(' · '))
console.log(`\n  Total do arquivo            ${brl(proj.arquivo).padStart(14)}`)
console.log(`  Total projetado da fatura   ${brl(proj.projetado).padStart(14)}`)
console.log(`  Diferença                   ${brl(proj.diferenca).padStart(14)}   ${Math.abs(proj.diferenca) <= 0.01 ? 'OK' : '*** NÃO CONFERE ***'}`)
if (proj.itens.length) {
  console.log('\n  Itens que explicam a diferença (arquivo − projetado):')
  for (const it of proj.itens) {
    const d = it.linha ? `${it.linha.description} (${it.linha._dateCartao})` : descTx(it.tx)
    console.log(`    ${brl(it.valor).padStart(12)}  ${d} — ${it.motivo}`)
  }
  const soma = Math.round(proj.itens.reduce((s, i) => s + i.valor, 0) * 100) / 100
  console.log(`    ${brl(soma).padStart(12)}  (soma)`)
}

// Colisões: o que o UPDATE gravaria. Data de sistema do ramo Itaú (applyReferenceFatura +
// computeSaveDate do ImportPanel): parcela > 1 → dia financeiro do mês anterior à fatura;
// parcela 1 / à vista → date_cartao.
const saveDateItau = (r) => {
  const num = r._installment?.num || 1
  return num > 1 ? installmentSystemDate(fatura, num, r._dateCartao, financialStartDay) : r._dateCartao
}
const faturaRefDe = (my) => { const [y, m] = (my || '').split('-'); return y && m ? `${m}/${y}` : null }
const colisoes = resolved.filter(r => r._collisionTx)
let atualizados = 0
if (colisoes.length) console.log('\n  Colisões — campos que o UPDATE mudaria:')
for (const r of colisoes) {
  const tx = r._collisionTx
  const patch = patchColisao(r, tx, { saveDate: saveDateItau(r), faturaRef: faturaRefDe(r.faturaMonthYear), serieId: tx.serieId || r._serieId })
  const muda = camposAlteradosColisao(patch, tx, r)
  if (muda.length) atualizados++
  console.log(`    ${r.description.padEnd(40)} ${muda.length ? muda.map(k => `${k}: ${JSON.stringify(tx[k] ?? null)} → ${JSON.stringify(patch[k])}`).join('; ') : 'idêntico — nada a gravar'}`)
}
const existiam = resolved.filter(r => r._isDuplicate).length + (colisoes.length - atualizados)
const novos = linhasAImportar(resolved).length
console.log(`\n  Botão: Confirmar (${novos}${atualizados > 0 ? ` +${atualizados}↻` : ''})`)
console.log(`  Tela final: ${textoResumoImportacao({ novos, existiam, atualizados })}\n`)
