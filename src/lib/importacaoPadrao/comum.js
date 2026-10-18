// IMPORTAÇÃO PADRÃO DE LANÇAMENTOS — peças comuns (sem navegador, testáveis no Node).
// Fluxo: escolher a conta → gerar o Excel (excel.js) → ler o arquivo preenchido (.xlsx/.csv/.ofx,
// leitura.js) → prévia (previa.js) → gravar pelo app (addTransaction) com um id de lote.
import { excelSerialToISO } from '../dindinParse'
import { parseValorBR } from '../valorBR'

export const LINHAS_PREPARADAS = 1000
export const LINHA_CABECALHO = 3 // linhas 1-2: título; 3: cabeçalho; dados a partir da 4
export const COLUNAS = [
  { id: 'data', titulo: 'DATA' },
  { id: 'valor', titulo: 'VALOR' },
  { id: 'descricao', titulo: 'DESCRIÇÃO' },
  { id: 'categoria', titulo: 'CATEGORIA' },
  { id: 'favorecido', titulo: 'FAVORECIDO' },
]
export const ABA_LANCAMENTOS = 'Lançamentos'
export const ABA_LISTAS = 'Listas'
export const ABA_INSTRUCOES = 'Instruções'
export const ABA_ID = '_finup'
export const TIPOS_CONTA_IMPORTAVEIS = ['checking', 'savings', 'cash']

// minúsculo, sem acento, espaços simples (cabeçalhos, de-para, comparação de categorias).
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

// Cabeçalho → id da coluna (DATA, Valor, "descricao", "Descrição"…). null = coluna desconhecida.
export function colunaDoCabecalho(texto) {
  const n = normalizar(texto)
  if (!n) return null
  if (n === 'data' || n.startsWith('data ')) return 'data'
  if (n === 'valor' || n.startsWith('valor ')) return 'valor'
  if (n.startsWith('descri')) return 'descricao'
  if (n.startsWith('categ')) return 'categoria'
  if (n.startsWith('favorec')) return 'favorecido'
  return null
}

// Data → 'YYYY-MM-DD' ou null. Aceita número de série do Excel (contado em UTC: sem dia a
// mais/menos por fuso), Date, 'dd/mm/aaaa', 'd/m/aa', 'aaaa-mm-dd', 'dd-mm-aaaa', 'dd.mm.aaaa'.
// Confere se a data existe (31/02 → null).
export function lerData(v) {
  if (v == null || v === '') return null
  let iso = null
  if (typeof v === 'number') iso = excelSerialToISO(v) || null
  else if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    // Date vindo de planilha: o dia "de calendário" é o UTC quando a hora é 0h UTC; senão o local.
    const utc = v.getUTCHours() === 0 && v.getUTCMinutes() === 0
    const y = utc ? v.getUTCFullYear() : v.getFullYear()
    const m = (utc ? v.getUTCMonth() : v.getMonth()) + 1
    const d = utc ? v.getUTCDate() : v.getDate()
    iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  } else {
    const s = String(v).trim()
    let m
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
      const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
      iso = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    } else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) iso = `${m[1]}-${m[2]}-${m[3]}`
    else if (/^\d{4,6}(\.\d+)?$/.test(s)) iso = excelSerialToISO(Number(s)) || null
  }
  if (!iso) return null
  const [y, mo, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  if (y < 1990 || y > 2100) return null
  return iso
}

// Valor → número (negativo = saída) ou NaN. Número da planilha ou texto: "1.234,56", "1234.56",
// "-12,30", "R$ 1.234,56", "(12,30)" (negativo), "12,30-".
export function lerValor(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN
  let s = String(v ?? '').replace(/\s|R\$/gi, '')
  if (!s) return NaN
  let negativo = false
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1) }
  if (/-$/.test(s)) { negativo = true; s = s.slice(0, -1) }
  if (s.startsWith('+')) s = s.slice(1)
  let n = parseValorBR(s)
  // "1234.567"? parseValorBR não aceita 3 casas com ponto como decimal; mantém NaN (valor inválido).
  if (!Number.isFinite(n)) return NaN
  if (negativo) n = -Math.abs(n)
  return Math.round(n * 100) / 100
}

// Rótulos das categorias para a lista do Excel e para reconhecer o que veio no arquivo. Nome
// repetido (comum: "Alimentação" em grupos diferentes) → "Nome (Grupo)" em todos os repetidos.
export function rotulosCategorias(categorias = []) {
  const porNome = new Map()
  for (const c of categorias) {
    const n = normalizar(c.name)
    if (!n) continue
    porNome.set(n, [...(porNome.get(n) || []), c])
  }
  const lista = []
  for (const c of categorias) {
    if (!normalizar(c.name)) continue
    const repetido = porNome.get(normalizar(c.name)).length > 1
    lista.push({ id: c.id, rotulo: repetido ? `${c.name} (${c.group || 'sem grupo'})` : c.name })
  }
  return lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}

// Índice texto normalizado → id: rótulo exato; o nome sozinho só quando não é ambíguo.
export function indiceCategorias(categorias = []) {
  const idx = new Map()
  const rotulos = rotulosCategorias(categorias)
  for (const r of rotulos) idx.set(normalizar(r.rotulo), r.id)
  const contagem = new Map()
  for (const c of categorias) contagem.set(normalizar(c.name), (contagem.get(normalizar(c.name)) || 0) + 1)
  for (const c of categorias) if (contagem.get(normalizar(c.name)) === 1) idx.set(normalizar(c.name), c.id)
  return idx
}

export const fmtDataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '')
export const fmtValorBR = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
