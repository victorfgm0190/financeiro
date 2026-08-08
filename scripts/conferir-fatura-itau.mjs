#!/usr/bin/env node
// Confere um arquivo de fatura do Itaú (XLS/XLSX) ANTES de importar: roda o parser real do app
// e compara a soma das linhas lidas com o total que o próprio Itaú declara no cabeçalho.
// Qualquer diferença acima de R$ 0,01 significa linha que o leitor não interpretou.
//
//   node scripts/conferir-fatura-itau.mjs "caminho/da/fatura.xlsx" [--detalhe]
//
// --detalhe lista os estornos e as parcelas encontradas. Nenhum dado é gravado nem enviado:
// o script só lê o arquivo local.
import fs from 'node:fs'
import * as XLSX from 'xlsx'
import { parseItauXLS, computeFileTotals } from '../src/lib/parsers/itauFatura.js'
import { assignInstallmentOccurrences } from '../src/lib/parcelas.js'
import { installmentKey, detectInstallment } from '../src/lib/installments.js'

const [, , file, ...flags] = process.argv
const detalhe = flags.includes('--detalhe')
// Conta fictícia: a conferência do arquivo não depende de qual cartão é — só precisa de um
// account_id constante para que as chaves de parcela sejam comparáveis entre si.
const CONTA = 'conta'

if (!file) {
  console.error('Uso: node scripts/conferir-fatura-itau.mjs "caminho/da/fatura.xlsx" [--detalhe]')
  process.exit(2)
}
if (!fs.existsSync(file)) {
  console.error(`Arquivo não encontrado: ${file}`)
  process.exit(2)
}

const brl = (n) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: true })
const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })

const { rows, faturaStr, faturaMY, totalDeclarado } = parseItauXLS(aoa)
if (rows.length === 0) {
  console.error('Nenhum lançamento encontrado. O arquivo é a fatura exportada pelo internet banking do Itaú?')
  process.exit(1)
}

const t = computeFileTotals(rows)
const diff = totalDeclarado == null ? null : Math.round((t.total - totalDeclarado) * 100) / 100

console.log(`\nFatura ${faturaStr || faturaMY || '(mês não identificado)'} — ${file}\n`)
console.log(`  Despesas          ${String(t.qtdDespesas).padStart(4)}   ${brl(t.despesas).padStart(14)}`)
console.log(`  Estornos          ${String(t.qtdEstornos).padStart(4)}  -${brl(t.estornos).padStart(14)}`)
console.log(`  ${'-'.repeat(38)}`)
console.log(`  Total lido        ${String(t.qtd).padStart(4)}   ${brl(t.total).padStart(14)}`)
if (totalDeclarado != null) {
  console.log(`  Declarado pelo Itaú      ${brl(totalDeclarado).padStart(14)}`)
  console.log(`  Diferença                ${brl(diff).padStart(14)}   ${Math.abs(diff) <= 0.01 ? 'OK' : '*** NÃO CONFERE ***'}`)
} else {
  console.log('  (o cabeçalho não traz o total declarado — conferência do parse indisponível)')
}

// Conferência das chaves de parcela: duas linhas com a MESMA installment_key não cabem no
// banco (índice único uq_lancamentos_installment) — a segunda vira UPDATE da primeira e o valor
// dela some da fatura. O ordinal de gêmeas resolve isso; aqui verificamos que resolveu mesmo.
const comOcorrencia = assignInstallmentOccurrences(rows.map(r => ({
  ...r, _installment: detectInstallment(r.description), faturaMonthYear: faturaMY,
})), CONTA, faturaMY)

const porChave = new Map()
for (const r of comOcorrencia) {
  if (!r._installment) continue
  const k = installmentKey({
    accountId: CONTA, description: r.description,
    installmentNum: r._installment.num, installmentTotal: r._installment.total,
    amount: r.amount, faturaMonthYear: faturaMY,
    installmentOccurrence: r._installmentOccurrence,
  })
  if (!porChave.has(k)) porChave.set(k, [])
  porChave.get(k).push(r)
}
const colisoes = [...porChave.values()].filter(g => g.length > 1)
const gemeas = comOcorrencia.filter(r => r._installmentOccurrence)

console.log(`\n  Parcelas               ${String(porChave.size).padStart(4)} chaves únicas`)
if (gemeas.length) {
  console.log(`  Gêmeas legítimas       ${String(gemeas.length).padStart(4)} (recebem ordinal #2, #3…)`)
  for (const g of gemeas) console.log(`    #${g._installmentOccurrence}  ${g.date}  ${brl(g.amount).padStart(12)}  ${g.description}`)
}
if (colisoes.length) {
  console.log(`\n  *** ${colisoes.length} COLISÃO(ÕES) DE CHAVE — estas linhas se perderiam na gravação:`)
  for (const g of colisoes) console.log(`    x${g.length}  ${g[0].date}  ${brl(g[0].amount)}  ${g[0].description}`)
}

if (detalhe) {
  const estornos = rows.filter(r => r.type === 'income')
  console.log(`\n  Estornos (${estornos.length}):`)
  for (const e of estornos) console.log(`    ${e.date}  ${brl(e.amount).padStart(12)}  ${e.description}`)
}
console.log()

const totalDivergente = totalDeclarado != null && Math.abs(diff) > 0.01
process.exit(totalDivergente || colisoes.length > 0 ? 1 : 0)
