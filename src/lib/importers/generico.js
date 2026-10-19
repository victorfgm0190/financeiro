// Planilha genérica (CSV / XLS / XLSX de qualquer banco) com MODELO de mapeamento:
//   tabela  = { linhas: [[célula, …], …] } (a planilha inteira, como veio)
//   modelo  = { linhaCabecalho, colData, colDescricao, colValor | (colDebito, colCredito),
//               colFavorecido?, formatoData: 'dmy'|'ymd'|'mdy', decimal: ','|'.',
//               sinalDespesa: 'negativo'|'positivo', ignorar: ['pagamento efetuado', …] }
//   (colunas = índice da coluna na linha de cabeçalho)
// O arquivo é reconhecido pela ASSINATURA do cabeçalho (nomes das colunas normalizados): modelos
// prontos ficam aqui no código (MODELOS_PRONTOS); os do usuário, na tabela import_layouts (/api).

import { registro, lerData, lerValor, normalizarTexto } from './registro.js'

// CSV → linhas de células. Separador ';' ou ',' (o que mais aparece na 1ª linha), aspas com "".
export function lerCsv(texto) {
  let t = String(texto || '').replace(/\r\n?/g, '\n')
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1)
  const primeira = t.split('\n').find(l => l.trim()) || ''
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ','
  const linhas = []
  let linha = [], cel = '', aspas = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { cel += '"'; i++ }
      else if (ch === '"') aspas = false
      else cel += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) { linha.push(cel.trim()); cel = '' }
    else if (ch === '\n') { linha.push(cel.trim()); linhas.push(linha); linha = []; cel = '' }
    else cel += ch
  }
  if (cel || linha.length) { linha.push(cel.trim()); linhas.push(linha) }
  return { linhas: linhas.filter(l => l.some(c => c !== '')), separador: sep }
}

const texto = (c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? '')).trim()

// Linha de cabeçalho provável: a primeira, entre as 15 primeiras, com 3+ células de texto e nenhuma
// data/valor (as de título do extrato têm 1–2 células).
export function linhaDeCabecalhoProvavel(linhas) {
  for (let i = 0; i < Math.min(15, linhas.length); i++) {
    const cels = linhas[i].map(texto).filter(Boolean)
    if (cels.length >= 3 && cels.every(c => !lerData(c) && !Number.isFinite(lerValor(c)))) return i
  }
  return 0
}

export const cabecalhoDe = (tabela, linhaCabecalho) => (tabela.linhas[linhaCabecalho] || []).map(texto)

// Assinatura: nomes das colunas normalizados (sem acento/caixa), na ordem, separados por '|'.
export const assinaturaCabecalho = (cabecalho) => (cabecalho || []).map(normalizarTexto).filter(Boolean).join('|')

// Palpite inicial do modelo pelo nome das colunas.
export function palpiteDeModelo(tabela) {
  const linhaCabecalho = linhaDeCabecalhoProvavel(tabela.linhas)
  const cab = cabecalhoDe(tabela, linhaCabecalho).map(normalizarTexto)
  const achar = (...n) => { const i = cab.findIndex(h => n.some(x => h.includes(x))); return i >= 0 ? i : null }
  const colDebito = achar('debito', 'saida', 'pagamento')
  const colCredito = achar('credito', 'entrada', 'deposito')
  const colValor = achar('valor', 'value', 'amount', 'montante', 'quantia')
  return {
    linhaCabecalho,
    colData: achar('data', 'date', 'dt '),
    colDescricao: achar('descri', 'historico', 'lancamento', 'estabelec', 'title', 'memo'),
    colValor,
    colDebito: colValor == null ? colDebito : null,
    colCredito: colValor == null ? colCredito : null,
    colFavorecido: achar('favorecido', 'beneficiario', 'payee'),
    formatoData: 'dmy', decimal: ',', sinalDespesa: 'negativo',
    ignorar: ['pagamento efetuado', 'saldo', 'subtotal', 'total'],
  }
}

export const modeloValido = (m) => m && m.colData != null && m.colDescricao != null &&
  (m.colValor != null || (m.colDebito != null && m.colCredito != null))

// Tabela + modelo → { registros, ignoradas } (linhas puladas: cabeçalho, ignorar, sem data/valor).
export function aplicarModelo(tabela, m) {
  const ignorar = (m.ignorar || []).map(normalizarTexto).filter(Boolean)
  const registros = []
  let ignoradas = 0
  tabela.linhas.forEach((cels, i) => {
    if (i <= (m.linhaCabecalho ?? 0)) return
    const linhaTexto = normalizarTexto(cels.map(texto).join(' '))
    if (!linhaTexto) return
    if (ignorar.some(p => linhaTexto.includes(p))) { ignoradas++; return }
    const date = lerData(cels[m.colData], m.formatoData)
    const description = texto(cels[m.colDescricao])
    let valor
    if (m.colValor != null) {
      const v = lerValor(cels[m.colValor], m.decimal)
      valor = Number.isFinite(v) ? (m.sinalDespesa === 'positivo' ? -v : v) : NaN
    } else {
      const deb = Math.abs(lerValor(cels[m.colDebito], m.decimal) || 0)
      const cred = Math.abs(lerValor(cels[m.colCredito], m.decimal) || 0)
      valor = deb > 0 ? -deb : cred > 0 ? cred : NaN
    }
    if (!date || !description || !Number.isFinite(valor) || valor === 0) { ignoradas++; return }
    registros.push(registro({
      date, description, amount: valor, type: valor < 0 ? 'expense' : 'income',
      payee: m.colFavorecido != null ? texto(cels[m.colFavorecido]) : '',
      raw: { linha: i + 1, celulas: cels.map(texto) },
    }))
  })
  return { registros, ignoradas }
}

// Modelos prontos (no código, iguais para todos): reconhecidos pela assinatura do cabeçalho.
export const MODELOS_PRONTOS = [
  {
    id: 'pronto:nubank-cartao', nome: 'Nubank — cartão (CSV)', banco: 'Nubank', tipo: 'cartao',
    assinatura: 'date|title|amount',
    mapeamento: { linhaCabecalho: 0, colData: 0, colDescricao: 1, colValor: 2, formatoData: 'ymd', decimal: '.', sinalDespesa: 'positivo', ignorar: ['pagamento recebido'] },
  },
  {
    id: 'pronto:nubank-conta', nome: 'Nubank — conta (CSV)', banco: 'Nubank', tipo: 'conta',
    assinatura: 'data|valor|identificador|descricao',
    mapeamento: { linhaCabecalho: 0, colData: 0, colDescricao: 3, colValor: 1, formatoData: 'dmy', decimal: '.', sinalDespesa: 'negativo', ignorar: [] },
  },
]

// Modelo para a tabela: o do usuário (assinatura + tipo) vence o pronto. null = abrir o mapeamento.
export function acharModelo(tabela, tipo, modelosDoUsuario = []) {
  for (const lista of [modelosDoUsuario || [], MODELOS_PRONTOS]) {
    for (const mod of lista) {
      if (mod.tipo && mod.tipo !== tipo) continue
      const linha = mod.mapeamento?.linhaCabecalho ?? 0
      if (assinaturaCabecalho(cabecalhoDe(tabela, linha)) === mod.assinatura) return mod
    }
  }
  return null
}
