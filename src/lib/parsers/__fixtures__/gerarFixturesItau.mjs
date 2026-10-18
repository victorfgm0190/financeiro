// Gera as faturas .xlsx do Itaú usadas em itauFatura.test.js. Estrutura idêntica à do arquivo
// exportado pelo internet banking (aba "Fatura 11-26": título na B8, Valor/Vencimento em G9:I10,
// lançamentos a partir da linha 15) com dados FICTÍCIOS — nome, agência e conta não são reais.
// Os valores são os da fatura aberta de novembro/2026 do cartão final 5060.
//
//   node src/lib/parsers/__fixtures__/gerarFixturesItau.mjs
import * as XLSX from 'xlsx'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const d = (y, m, dia) => new Date(y, m - 1, dia)

const LANCAMENTOS = [
  [d(2026, 10, 14), 'Anuidade Diferenci', 'Parcela 11 de 12', 62, 'Titular'],
  [d(2026, 9, 24), 'Vindi  *Finclasssp', 'Parcela 2 de 12', 39.95, 'Adicional'],
  [d(2026, 3, 8), 'Shopee *Guardanapo', 'Parcela 9 de 10', 54.93, 'Adicional'],
  [d(2026, 3, 2), 'Luisinho Manutenc ', 'Parcela 9 de 10', 335.71, 'Titular'],
]

function fatura({ titulo, rotuloValor, vencimento }) {
  const linha = () => Array(10).fill('')
  const aoa = Array.from({ length: 25 }, linha)
  const set = (r, c, v) => { aoa[r - 1][c] = v } // r = linha do Excel (1-based), c = coluna (A=0)
  set(3, 1, 'Nome'); set(3, 2, 'Fulano de Tal')
  set(4, 1, 'Agência'); set(4, 2, '0000')
  set(5, 1, 'Conta'); set(5, 2, '00000-0')
  set(8, 1, titulo)
  set(9, 1, 'Cartão'); set(9, 6, rotuloValor)
  set(10, 1, 'Cartão Fictício Visa - final 0000'); set(10, 6, 492.59)
  if (vencimento) { set(9, 8, 'Vencimento'); set(10, 8, vencimento) }
  set(13, 1, 'Lançamentos')
  ;['Data', 'Lançamento', 'Parcelamento', 'Valor', '', 'Titularidade', 'Nome', 'Tipo do cartão', 'Número do cartão']
    .forEach((h, i) => set(14, 1 + i, h))
  LANCAMENTOS.forEach(([data, desc, parc, valor, tit], i) => {
    const r = 15 + i
    set(r, 1, data); set(r, 2, desc); set(r, 3, parc); set(r, 4, valor)
    set(r, 6, tit); set(r, 7, tit === 'Titular' ? 'Fulano de Tal' : 'Beltrana de Tal')
    set(r, 8, 'Físico'); set(r, 9, tit === 'Titular' ? '****0000' : '****1111')
  })
  set(20, 3, 'Subtotal  ')
  set(24, 1, 'Importante saber')
  const ws = XLSX.utils.aoa_to_sheet(aoa, { dateNF: 'dd/mm/yyyy' })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fatura 11-26')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })
}

const VARIACOES = {
  'itau-fatura-aberta.xlsx': { titulo: 'Fatura Aberta - Novembro/2026', rotuloValor: 'Valor (parcial)', vencimento: d(2026, 11, 20) },
  'itau-fatura-fechada.xlsx': { titulo: 'Fatura Fechada - Novembro/2026', rotuloValor: 'Valor total', vencimento: d(2026, 11, 20) },
  'itau-fatura-divergente.xlsx': { titulo: 'Fatura Aberta - Outubro/2026', rotuloValor: 'Valor (parcial)', vencimento: d(2026, 11, 20) },
  'itau-fatura-sem-mes.xlsx': { titulo: 'Fatura do cartão', rotuloValor: 'Valor', vencimento: null },
}

for (const [nome, opts] of Object.entries(VARIACOES)) writeFileSync(join(dir, nome), fatura(opts))
