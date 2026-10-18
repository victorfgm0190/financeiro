// Leitura da fatura de cartão do Itaú (internet banking), nos dois formatos que o banco
// exporta: CSV ("data,lançamento,valor") e XLS/XLSX. Ambos devolvem o MESMO shape de linha,
// para importação e conciliação seguirem o mesmo caminho.
//
// Vive em lib (e não dentro do ImportPanel) porque é lógica pura e testável: o teste roda o
// parser real contra uma fatura de verdade e confere o total contra o que o Itaú declara.
import { normalizeDate } from '../dindinParse.js'
import { detectInstallment } from '../installments.js'

// Meses PT-BR → número (2 dígitos). Usado para extrair o mês da fatura do cabeçalho do Itaú.
const MESES_PT = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
}
const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const normAcento = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

// Rótulo amigável (ex.: "Agosto/2026") a partir de um YYYY-MM.
export function faturaMYLabel(my) {
  if (!my || !/^\d{4}-\d{2}$/.test(my)) return ''
  const [y, m] = my.split('-')
  return `${NOMES_MES[parseInt(m, 10) - 1]}/${y}`
}

const RE_MES_ANO = new RegExp(`\\b(${Object.keys(MESES_PT).join('|')})\\b\\s*(?:de\\s*)?\\/?\\s*(\\d{4})`)

// "<Mês>/<Ano>" de um texto → YYYY-MM ('' se não houver).
function mesAnoDoTexto(raw) {
  const m = normAcento(raw).toLowerCase().match(RE_MES_ANO)
  return m && MESES_PT[m[1]] ? `${m[2]}-${MESES_PT[m[1]]}` : ''
}

// Data do vencimento: Date (cellDates), serial do Excel ou texto dd/mm/aaaa → YYYY-MM-DD ('' se não for data).
function dataDoVencimento(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'string') {
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
  }
  const d = normalizeDate(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
}

// Cabeçalho da fatura do Itaú (linhas acima da tabela de lançamentos), localizado por RÓTULO:
//   vencimento — célula "Vencimento": a data vem na própria célula ("Vencimento: 20/11/2026"),
//                logo abaixo (layout XLS: rótulo I9, valor I10) ou à direita;
//   mesTitulo  — "<Mês>/<Ano>" do título "Fatura Aberta - Novembro/2026" (conferência);
//   aberta     — true pelo título "Fatura Aberta" ou pelo rótulo "Valor (parcial)", false pelo
//                título "Fatura Fechada", null quando o arquivo não diz.
// As DATAS dos lançamentos nunca entram: são da compra original (parcela de março na fatura de
// novembro) e não dizem de que fatura o arquivo é.
export function extractItauCabecalho(aoa, headerIdx) {
  const norm = (v) => normAcento(v).trim().toLowerCase()
  const linhas = (aoa || []).slice(0, headerIdx)
  let vencimento = '', titulo = '', mesTitulo = '', valorParcial = false
  for (let i = 0; i < linhas.length; i++) {
    const row = linhas[i] || []
    for (let c = 0; c < row.length; c++) {
      const t = norm(row[c])
      if (!t) continue
      if (!vencimento && t.startsWith('vencimento')) {
        vencimento = dataDoVencimento(String(row[c]).replace(/^\s*vencimento\s*:?\s*/i, ''))
          || dataDoVencimento((linhas[i + 1] || [])[c])
          || dataDoVencimento(row[c + 1])
      }
      if (/^valor\b.*\bparcial\b/.test(t)) valorParcial = true
      if (!titulo && /^fatura\b/.test(t) && mesAnoDoTexto(t)) titulo = String(row[c]).trim()
    }
  }
  if (titulo) mesTitulo = mesAnoDoTexto(titulo)
  else {
    // Sem célula "Fatura … - <Mês>/<Ano>": aceita o primeiro "<Mês>/<Ano>" do cabeçalho.
    for (const c of linhas.flat()) { mesTitulo = mesAnoDoTexto(c); if (mesTitulo) break }
  }
  const nt = norm(titulo)
  const aberta = /\bfatura aberta\b/.test(nt) ? true
    : /\bfatura fechada\b/.test(nt) ? false
    : valorParcial ? true : null
  return { vencimento, mesVencimento: vencimento.slice(0, 7), mesTitulo, titulo, aberta }
}

// Mês da fatura (YYYY-MM) a partir do cabeçalho: o do VENCIMENTO; sem vencimento, o do título.
// Vazio quando nenhum dos dois existe — quem chama exige a escolha manual.
export function mesDaFaturaItau(cab) {
  return cab?.mesVencimento || cab?.mesTitulo || ''
}

// Título e vencimento apontam meses diferentes (ambos presentes).
export function cabecalhoDivergente(cab) {
  return !!(cab?.mesVencimento && cab?.mesTitulo && cab.mesVencimento !== cab.mesTitulo)
}

// Valor do XLS do Itaú: já costuma vir como número. Aceita também string (formato pt-BR),
// preservando o sinal. Retorna null quando não é um número válido.
export function parseXlsValor(v) {
  if (typeof v === 'number') return isNaN(v) ? null : v
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const neg = /-/.test(s)
  const cleaned = s.replace(/[R$\s]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.').replace(/-/g, '')
  const n = parseFloat(cleaned)
  if (isNaN(n)) return null
  return neg ? -n : n
}

// Converte a coluna "Parcelamento" (ex.: "Parcela 1 de 5") em sufixo "N/Total" na descrição,
// para que o detector de parcelas (detectInstallment) reconheça o lançamento como parcelado —
// mesmo caminho do CSV, cuja parcela já vem embutida na descrição.
export function mergeParcelaXls(desc, parc) {
  if (!parc) return desc
  const m = String(parc).match(/(\d{1,2})\s*de\s*(\d{1,2})/i)
  if (!m) return desc
  const num = parseInt(m[1], 10), total = parseInt(m[2], 10)
  if (!(total >= 2 && num >= 1 && num <= total)) return desc
  if (detectInstallment(desc)) return desc // já tem padrão N/Total — não duplica
  return `${desc} ${num}/${total}`.trim()
}

// Total declarado pelo PRÓPRIO Itaú no cabeçalho do arquivo: a coluna "Valor (parcial)" da
// tabela de cartões, acima da lista de lançamentos. Uma fatura com adicionais traz uma linha
// por cartão, então soma todas. Serve para conferir o PARSE: se a soma das linhas lidas não
// bate com este número, o arquivo tem linha que o parser não entendeu (ou entendeu a mais).
// Retorna null quando o cabeçalho não traz o valor — nesse caso a conferência do parse é pulada.
export function extractItauTotalDeclarado(aoa, headerIdx) {
  const norm = (v) => normAcento(v).trim().toLowerCase()
  for (let i = 0; i < headerIdx; i++) {
    const col = (aoa[i] || []).findIndex(c => /^valor\b/.test(norm(c)))
    if (col === -1) continue
    let soma = 0, achou = false
    for (let j = i + 1; j < headerIdx; j++) {
      const v = parseXlsValor((aoa[j] || [])[col])
      if (v == null) continue
      soma += v
      achou = true
    }
    if (achou) return Math.round(soma * 100) / 100
  }
  return null
}

// Totais do ARQUIVO da fatura, na convenção do extrato: despesas somam, estornos abatem.
// É exatamente o valor que a fatura precisa ter no Neon depois da importação — a base da
// conferência pós-importação.
export function computeFileTotals(rows) {
  const r2 = (n) => Math.round(n * 100) / 100
  let despesas = 0, estornos = 0, qtdDespesas = 0, qtdEstornos = 0
  for (const r of rows || []) {
    const v = Number(r.amount) || 0
    if (r.type === 'income') { estornos += v; qtdEstornos++ } else { despesas += v; qtdDespesas++ }
  }
  return {
    despesas: r2(despesas), qtdDespesas,
    estornos: r2(estornos), qtdEstornos,
    total: r2(despesas - estornos), qtd: qtdDespesas + qtdEstornos,
  }
}

// Linha de lançamento no shape que a importação consome. Negativos no extrato:
//   "Pagamento Efetuado" → não é lançamento da fatura, é a quitação da anterior → descartado;
//   qualquer outro       → ESTORNO: entra como RECEITA (valor absoluto), pré-classificado na
//                          categoria cujo nome contenha "estorno", quando existir.
// Sem isso o estorno viraria despesa positiva e inflaria a fatura no valor dobrado.
function buildRow(id, { date, description, rawVal, estornoCategoryId }) {
  const estorno = rawVal < 0
  return {
    _id: id,
    date, description, movimentacao: '', amount: Math.abs(rawVal),
    isDeposit: estorno, type: estorno ? 'income' : 'expense',
    selected: true, _isDuplicate: false,
    categoryId: estorno ? estornoCategoryId : '', payee: '', grupoGerencial: '',
  }
}

const isPagamentoFatura = (desc) => desc.toLowerCase().includes('pagamento efetuado')

// Categoria de estorno (primeira cujo nome contenha "estorno"); vazio se não houver.
const estornoCatOf = (categories) =>
  categories.find(c => (c.name || '').toLowerCase().includes('estorno'))?.id || ''

// Detecta se o texto é CSV do Itaú (linha de cabeçalho "data,lançamento,valor")
export function isItauCSV(text) {
  const clean = text.replace(/^\uFEFF/, '')
  return /^data[,;]lan[çc]amento[,;]valor/im.test(clean)
}

const CAB_VAZIO = { vencimento: '', mesVencimento: '', mesTitulo: '', titulo: '', aberta: null }

export function parseItauCSV(text, categories = []) {
  const vazio = { rows: [], cardName: '', faturaStr: '', faturaMY: '', totalDeclarado: null, cabecalho: CAB_VAZIO }
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)

  // Localizar linha de cabeçalho
  const headerIdx = lines.findIndex(l => /^data[,;]lan[çc]amento[,;]valor/i.test(l))
  if (headerIdx === -1) return vazio

  const sep = lines[headerIdx].includes(';') ? ';' : ','
  // Mês da fatura pelo cabeçalho (linhas de preâmbulo antes da tabela de lançamentos).
  const cabecalho = extractItauCabecalho(lines.slice(0, headerIdx).map(l => l.split(sep)), headerIdx)
  const faturaMY = mesDaFaturaItau(cabecalho)
  const estornoCategoryId = estornoCatOf(categories)

  const parsed = []
  let idCtr = 0

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    if (cols.length < 3) continue

    const date = normalizeDate(cols[0])
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const desc = cols[1] || ''
    if (!desc) continue

    const rawVal = parseFloat(cols[2].replace(',', '.'))
    if (isNaN(rawVal) || rawVal === 0) continue
    if (rawVal < 0 && isPagamentoFatura(desc)) continue

    parsed.push(buildRow(idCtr++, { date, description: desc, rawVal, estornoCategoryId }))
  }

  // O CSV não traz o total no cabeçalho — a conferência do parse fica só para o XLS/XLSX.
  return { rows: parsed, cardName: '', faturaStr: faturaMYLabel(faturaMY), faturaMY, totalDeclarado: null, cabecalho }
}

// Parser do XLS/XLSX exportado pelo internet banking do Itaú (fatura de cartão). Recebe a matriz
// de células (parseFile, header:1, cellDates:true) e devolve o MESMO formato de parseItauCSV,
// para o fluxo de conciliação seguir sem alteração.
// Estrutura: linha de cabeçalho com "Data" (col 1); Lançamento (col 2), Parcelamento (col 3),
// Valor (col 4) — colunas localizadas RELATIVAS à célula "Data" para tolerar deslocamentos.
// Retorna também o cabeçalho (vencimento, mês do título, aberta/fechada), faturaMY (YYYY-MM, mês
// do vencimento — ver mesDaFaturaItau) e totalDeclarado (o "Valor" do cabeçalho) p/ conferir o parse.
export function parseItauXLS(aoa, categories = []) {
  const vazio = { rows: [], cardName: '', faturaStr: '', faturaMY: '', totalDeclarado: null, cabecalho: CAB_VAZIO }
  if (!Array.isArray(aoa) || aoa.length === 0) return vazio
  const norm = (v) => normAcento(v).trim().toLowerCase()

  // Localiza a linha de cabeçalho: contém "Data" e "Valor". Guarda a coluna de "Data".
  let headerIdx = -1, dataCol = -1
  for (let i = 0; i < Math.min(aoa.length, 40); i++) {
    const row = aoa[i] || []
    const di = row.findIndex(c => norm(c) === 'data')
    if (di !== -1 && row.some(c => norm(c) === 'valor')) { headerIdx = i; dataCol = di; break }
  }
  if (headerIdx === -1) return vazio

  // Mês de referência e total a partir do cabeçalho (linhas acima da tabela de lançamentos).
  const cabecalho = extractItauCabecalho(aoa, headerIdx)
  const faturaMY = mesDaFaturaItau(cabecalho)
  const totalDeclarado = extractItauTotalDeclarado(aoa, headerIdx)

  const descCol = dataCol + 1, parcCol = dataCol + 2, valorCol = dataCol + 3
  const estornoCategoryId = estornoCatOf(categories)
  const parsed = []
  let idCtr = 0

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] || []
    const date = normalizeDate(row[dataCol])
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const desc = String(row[descCol] ?? '').trim()
    if (!desc) continue

    const rawVal = parseXlsValor(row[valorCol])
    if (rawVal == null || rawVal === 0) continue
    if (rawVal < 0 && isPagamentoFatura(desc)) continue

    // A parcela do estorno fica de fora de propósito: o estorno de um parcelado não é uma
    // parcela, e o sufixo N/Total o faria colidir com a parcela que ele estorna.
    const description = rawVal < 0 ? desc : mergeParcelaXls(desc, row[parcCol])

    parsed.push(buildRow(idCtr++, { date, description, rawVal, estornoCategoryId }))
  }

  return { rows: parsed, cardName: '', faturaStr: faturaMYLabel(faturaMY), faturaMY, totalDeclarado, cabecalho }
}
