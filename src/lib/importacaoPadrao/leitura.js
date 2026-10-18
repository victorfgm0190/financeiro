import { ABA_LANCAMENTOS, ABA_ID, colunaDoCabecalho, lerData, lerValor, normalizar } from './comum'
import { decodificarOfx, pareceOfx, lerOfx } from './ofx'

// LEITURA do arquivo preenchido → { formato, linhas, erros, contaArquivo, ofx }.
//   linhas: [{ linha, data, valor, descricao, categoria, favorecido, fitid, erros: [] }]
//     `linha` = número da linha na planilha/CSV (ou a posição da transação no OFX);
//     `erros` = motivos da linha (data/valor/descrição) — a prévia separa válidas × com erro.
//   contaArquivo: { id, nome, ambiente } do Excel gerado pelo Finup (aba _finup), senão null.
//   ofx: { banco, conta } do extrato, senão null.
// .xlsx: lê TODAS as linhas preenchidas, inclusive depois da 1.000ª. `XLSX` (SheetJS) vem de fora.

const vazio = (v) => v == null || String(v).trim() === ''

function validarLinha(l) {
  const erros = []
  if (vazio(l.dataBruta)) erros.push('data vazia')
  else if (!l.data) erros.push(`data inválida ("${String(l.dataBruta).trim()}")`)
  if (vazio(l.valorBruto)) erros.push('valor vazio')
  else if (!Number.isFinite(l.valor)) erros.push(`valor inválido ("${String(l.valorBruto).trim()}")`)
  else if (l.valor === 0) erros.push('valor zero')
  if (!l.descricao) erros.push('descrição vazia')
  return erros
}

// Linhas cruas (matriz) → linhas da importação, a partir do cabeçalho reconhecido.
function deMatriz(matriz, { primeiraLinha = 1 } = {}) {
  let iCab = -1
  let mapa = null
  for (let i = 0; i < Math.min(matriz.length, 30); i++) {
    const cols = (matriz[i] || []).map(colunaDoCabecalho)
    if (cols.includes('data') && cols.includes('valor') && cols.includes('descricao')) {
      iCab = i
      mapa = cols
      break
    }
  }
  if (iCab < 0) return { linhas: [], erros: [{ linha: 0, motivo: 'Cabeçalho não encontrado: o arquivo precisa das colunas DATA, VALOR e DESCRIÇÃO' }] }
  const idx = (id) => mapa.indexOf(id)
  const linhas = []
  for (let i = iCab + 1; i < matriz.length; i++) {
    const r = matriz[i] || []
    const pega = (id) => (idx(id) >= 0 ? r[idx(id)] : '')
    if (['data', 'valor', 'descricao', 'categoria', 'favorecido'].every(id => vazio(pega(id)))) continue
    const l = {
      linha: i + primeiraLinha,
      dataBruta: pega('data'), valorBruto: pega('valor'),
      data: lerData(pega('data')), valor: lerValor(pega('valor')),
      descricao: String(pega('descricao') ?? '').replace(/\s+/g, ' ').trim(),
      categoria: String(pega('categoria') ?? '').trim(),
      favorecido: String(pega('favorecido') ?? '').replace(/\s+/g, ' ').trim(),
      fitid: null,
    }
    l.erros = validarLinha(l)
    delete l.dataBruta
    delete l.valorBruto
    linhas.push(l)
  }
  return { linhas, erros: linhas.filter(l => l.erros.length).map(l => ({ linha: l.linha, motivo: `Linha ${l.linha}: ${l.erros.join(', ')}` })) }
}

export function lerXlsx(XLSX, bytes) {
  const wb = XLSX.read(bytes, { type: 'array' }) // sem cellDates: datas chegam como série (contada em UTC)
  const nomeAba = wb.SheetNames.find(n => normalizar(n) === normalizar(ABA_LANCAMENTOS))
    || wb.SheetNames.find(n => n !== ABA_ID && !/^(listas|instru)/i.test(normalizar(n)))
  const ws = wb.Sheets[nomeAba]
  const ref = ws?.['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
  const matriz = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true }) : []
  const r = deMatriz(matriz, { primeiraLinha: (ref?.s.r ?? 0) + 1 })
  let contaArquivo = null
  const wid = wb.Sheets[ABA_ID]
  if (wid) {
    const kv = Object.fromEntries(XLSX.utils.sheet_to_json(wid, { header: 1, defval: '' }).map(([k, v]) => [String(k), v]))
    if (kv.conta_id) contaArquivo = { id: String(kv.conta_id), nome: String(kv.conta_nome || ''), ambiente: String(kv.ambiente || '') }
  }
  return { formato: 'xlsx', ...r, contaArquivo, ofx: null }
}

// Divide uma linha de CSV respeitando aspas ("a;b" fica inteiro; "" = aspas literal).
function dividirCsv(linha, sep) {
  const out = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++ } else if (ch === '"') aspas = false
      else atual += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) { out.push(atual.trim()); atual = '' } else atual += ch
  }
  out.push(atual.trim())
  return out
}

export function lerCsv(texto) {
  let s = String(texto || '')
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1)
  const linhasTexto = s.replace(/\r\n?/g, '\n').split('\n')
  const primeira = linhasTexto.find(l => l.trim()) || ''
  const sep = primeira.split(';').length >= primeira.split(',').length ? ';' : ','
  const matriz = linhasTexto.map(l => (l.trim() ? dividirCsv(l, sep) : []))
  return { formato: 'csv', ...deMatriz(matriz), contaArquivo: null, ofx: null }
}

// Bytes → texto para CSV: UTF-8; se não for UTF-8 válido, windows-1252 (CSV salvo pelo Excel).
function textoCsv(bytes) {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

// Decide o formato pelo conteúdo (e pela extensão como desempate).
export function lerArquivo({ nome = '', bytes, XLSX }) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const ext = String(nome).toLowerCase().split('.').pop()
  const zip = u8[0] === 0x50 && u8[1] === 0x4b // .xlsx é um zip ("PK")
  if (zip || ext === 'xlsx' || ext === 'xls') return lerXlsx(XLSX, u8)
  const textoOfx = decodificarOfx(u8)
  if (ext === 'ofx' || pareceOfx(textoOfx)) {
    const r = lerOfx(textoOfx)
    return { formato: 'ofx', linhas: r.linhas, erros: r.erros, contaArquivo: null, ofx: { banco: r.banco, conta: r.conta } }
  }
  return lerCsv(textoCsv(u8))
}
