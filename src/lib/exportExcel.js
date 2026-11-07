// Exportação de relatórios para Excel — utilitário ÚNICO do Finup (ExcelJS, carregado sob demanda).
// Toda tela monta só os dados (título, filtros, resumo, colunas, linhas, totais) e chama
// exportarExcel(); o layout (logo, identidade do ambiente, cores, fórmulas, impressão) mora aqui.
//
// Identidade: nome e frase do ambiente (Configurações › Geral › Identidade do ambiente; nome vazio =
// nome do usuário logado) e o perfil filtrado chegam por definirIdentidadeExport(), chamado pelo
// AppContext — nada fixo no código.
//
// Spec de uma aba:
//   titulo, filtros (string | string[]), resumo, colunas, linhas, totais, nome (nome da aba)
//   colunas: [{ chave, titulo, tipo: 'texto'|'data'|'moeda'|'numero'|'status'|'selo', largura?,
//               cor?: (linha) => 'receita'|'despesa'|null }]
//   linhas:  objetos com as chaves das colunas (data em 'AAAA-MM-DD' ou Date; moeda em número).
//            `_estilo`: 'grupo' | 'subtotal' | 'total' → linha de agrupamento (negrito, fora das somas).
//            `_subtotal: true` (com _estilo 'subtotal'): valores = SOMA das linhas de detalhe desde o
//            último 'grupo' (fórmula).
//   resumo:  [{ rotulo, cor?, soma?: chave, onde?: [{ coluna, valor }], contar?: true, valor?: número fixo, numero?: true,
//               partes?: [{ sinal: 1|-1, soma | valor, onde }] }] → fórmulas SOMA/SOMASES sobre a tabela.
//   totais:  { titulo?: string (padrão 'TOTAL'), rotulo?: (n) => string, somar: [chaves],
//              comCor?: true (aplica coluna.cor ao total, com o valor somado na chave da coluna) } | false
// exportarExcel({ ...aba, nomeArquivo } | { abas: [aba...], nomeArquivo })

export const VERDE = '0F6E56'
const VERDE_CLARO = 'E8F5EF'
const CINZA_ESCURO = '1F2937'
const CINZA = '6B7280'
const CINZA_BORDA = 'E5E7EB'
const ZEBRA = 'F5F7F9'
const CARTAO = 'F9FAFB'
const COR_VALOR = { receita: VERDE, despesa: '953D18' }
const SELOS = {
  verde: { fundo: 'DCFCE7', texto: '166534' },
  ambar: { fundo: 'FEF3C7', texto: '92400E' },
  vermelho: { fundo: 'FEE2E2', texto: '991B1B' },
  cinza: { fundo: 'F3F4F6', texto: '374151' },
}
const FONTE = 'Arial'
export const SITE = 'finup.app.br'
export const LOGO_URL = '/brand/finup-logo.png'

// ─── Identidade (registrada pelo AppContext) ─────────────────────────────────────────────────────
let identidade = { nomeAmbiente: '', frase: '', perfil: 'Todos os perfis' }
export function definirIdentidadeExport({ nomeAmbiente = '', nomeUsuario = '', frase = '', perfil = '' } = {}) {
  identidade = {
    nomeAmbiente: String(nomeAmbiente || '').trim() || String(nomeUsuario || '').trim(),
    frase: String(frase || '').trim(),
    perfil: String(perfil || '').trim() || 'Todos os perfis',
  }
}
export const identidadeExport = () => ({ ...identidade })

// ─── Nome do arquivo: Finup_<Relatorio>_<periodo>.xlsx, sem acento nem espaço ────────────────────
const slug = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/[^A-Za-z0-9_.-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
export function nomeArquivoFinup(relatorio, periodo) {
  return `Finup_${slug(relatorio) || 'Relatorio'}${periodo ? `_${slug(periodo)}` : ''}.xlsx`
}

// ─── Status → cor do selo ────────────────────────────────────────────────────────────────────────
export function corDoSelo(valor) {
  const v = String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!v) return null
  if (/vencid|atras|estorn|cancel/.test(v)) return 'vermelho'
  if (/^a (receber|pagar|vencer)|a confirmar/.test(v)) return 'ambar'
  if (/receb|pago|concilia|conclu|efetiv|entrada|registrad|realizad/.test(v)) return 'verde'
  if (/saida/.test(v)) return 'vermelho'
  if (/pendent|a pagar|a receber|provis|a vencer|aberto|projetad|previst|agendad/.test(v)) return 'ambar'
  return 'cinza'
}

// ─── Valores ─────────────────────────────────────────────────────────────────────────────────────
const comoData = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()))
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100)
const FMT = { moeda: '"R$" #,##0.00;-"R$" #,##0.00', data: 'dd/mm/yyyy', numero: '#,##0.##' }
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const textoDe = (col, v) => {
  if (v == null || v === '') return ''
  if (col.tipo === 'moeda') return brl(v)
  if (col.tipo === 'data') return '00/00/0000'
  return String(v)
}
const letra = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const esc = (s) => String(s).replace(/"/g, '""')
const dataHora = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ─── Montagem (pura: recebe a classe ExcelJS e o PNG da logo) ────────────────────────────────────
// → workbook. `logo`: ArrayBuffer/Uint8Array do PNG ou null. `agora` p/ testes.
export function montarPlanilha(ExcelJS, spec, { logo = null, ident = identidade, agora = new Date() } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finup'
  wb.created = agora
  const abas = spec.abas?.length ? spec.abas : [spec]
  const logoId = logo ? wb.addImage({ buffer: logo, extension: 'png' }) : null
  const usados = new Set()
  for (const aba of abas) {
    let nome = String(aba.nome || aba.titulo || 'Relatório').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Relatório'
    for (let i = 2; usados.has(nome); i++) nome = `${nome.slice(0, 28)} ${i}`
    usados.add(nome)
    montarAba(wb.addWorksheet(nome, { views: [{ showGridLines: false }] }), aba, { logoId, ident, agora })
  }
  return wb
}

function montarAba(ws, aba, { logoId, ident, agora }) {
  const colunas = aba.colunas || []
  const linhas = aba.linhas || []
  const nCols = Math.max(colunas.length, 3)
  const ultima = letra(nCols)
  const fonte = (extra = {}) => ({ name: FONTE, size: 10, color: { argb: `FF${CINZA_ESCURO}` }, ...extra })
  const cel = (ref, valor, estilo = {}) => {
    const c = ws.getCell(ref)
    c.value = valor
    c.font = fonte(estilo.font)
    if (estilo.alignment) c.alignment = estilo.alignment
    if (estilo.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${estilo.fill}` } }
    if (estilo.numFmt) c.numFmt = estilo.numFmt
    if (estilo.border) c.border = estilo.border
    return c
  }

  // Cabeçalho (linhas 1-3): logo em A, título/identidade em B, site e data na última coluna.
  ws.getRow(1).height = 24
  ws.getRow(2).height = 16
  ws.getRow(3).height = 15
  // Bloco da direita (site e "Gerado em") ocupa as duas últimas colunas quando há espaço.
  const dir = nCols >= 5 ? letra(nCols - 1) : ultima
  const fimTitulo = letra(nCols >= 5 ? nCols - 2 : nCols - 1)
  if (nCols > 2) for (const r of [1, 2, 3]) ws.mergeCells(`B${r}:${fimTitulo}${r}`)
  if (dir !== ultima) for (const r of [1, 2]) ws.mergeCells(`${dir}${r}:${ultima}${r}`)
  cel('B1', aba.titulo || '', { font: { bold: true, size: 15 }, alignment: { vertical: 'middle' } })
  const linha2 = [ident.nomeAmbiente, `Perfil: ${ident.perfil || 'Todos os perfis'}`].filter(Boolean).join('  ·  ')
  cel('B2', linha2, { font: { bold: true, size: 10 }, alignment: { vertical: 'middle' } })
  if (ident.frase) cel('B3', ident.frase, { font: { italic: true, size: 9, color: { argb: `FF${VERDE}` } }, alignment: { vertical: 'top' } })
  cel(`${dir}1`, SITE, { font: { bold: true, size: 10, color: { argb: `FF${VERDE}` } }, alignment: { horizontal: 'right', vertical: 'middle' } })
  cel(`${dir}2`, `Gerado em ${dataHora(agora)}`, { font: { size: 8, color: { argb: `FF${CINZA}` } }, alignment: { horizontal: 'right', vertical: 'middle' } })
  for (let c = 1; c <= nCols; c++) {
    const x = ws.getCell(`${letra(c)}3`)
    x.border = { ...(x.border || {}), bottom: { style: 'thick', color: { argb: `FF${VERDE}` } } }
  }
  if (logoId != null) {
    // ~112x36 px, centralizada na altura das linhas 1-3 (24+16+15 pt ≈ 73 px).
    ws.addImage(logoId, { tl: { col: 0.06, row: 0.55 }, ext: { width: 112, height: 36 }, editAs: 'oneCell' })
  }

  let r = 5
  // Filtros aplicados.
  const filtros = (Array.isArray(aba.filtros) ? aba.filtros : [aba.filtros]).filter(Boolean)
  if (filtros.length) {
    ws.mergeCells(`A${r}:${ultima}${r}`)
    cel(`A${r}`, filtros.join('   ·   '), { font: { italic: true, size: 9, color: { argb: `FF${CINZA}` } }, alignment: { wrapText: true, vertical: 'middle' } })
    ws.getRow(r).height = Math.min(48, 14 * Math.ceil(filtros.join('   ·   ').length / (nCols * 14)) + 2)
    r += 2
  }

  // Posições da tabela (o resumo referencia o intervalo de dados por fórmula).
  const resumo = (aba.resumo || []).slice(0, nCols)
  const linhaResumo = r
  if (resumo.length) r += 3
  const cab = r
  const primeira = cab + 1
  const ultimaDados = cab + linhas.length
  const idx = new Map(colunas.map((c, i) => [c.chave, i + 1]))
  const faixa = (chave) => `$${letra(idx.get(chave))}$${primeira}:$${letra(idx.get(chave))}$${Math.max(ultimaDados, primeira)}`
  const detalhe = linhas.filter(l => !l._estilo)
  const casa = (l, onde = []) => onde.every(o => String(l[o.coluna] ?? '') === String(o.valor))
  // Com linhas de grupo/subtotal, uma coluna oculta marca o detalhe ("D") e entra como critério:
  // somas e contagens nunca pegam os subtotais.
  const temGrupos = linhas.some(l => l._estilo)
  const colAux = nCols + 1
  const faixaAux = `$${letra(colAux)}$${primeira}:$${letra(colAux)}$${Math.max(ultimaDados, primeira)}`
  const criterios = (onde) => [...(temGrupos ? [`${faixaAux},"D"`] : []), ...onde.map(o => `${faixa(o.coluna)},"${esc(o.valor)}"`)]

  const formulaDe = (p) => {
    if (p.valor != null) {
      const v = num(p.valor) || 0
      return { f: String(v), v }
    }
    const onde = p.onde || []
    const cr = criterios(onde)
    if (p.contar) {
      const f = cr.length ? `COUNTIFS(${cr.join(',')})` : `ROWS(${faixa(colunas[0].chave)})`
      return { f, v: detalhe.filter(l => casa(l, onde)).length }
    }
    const v = detalhe.filter(l => casa(l, onde)).reduce((s, l) => s + (num(l[p.soma]) || 0), 0)
    const f = cr.length ? `SUMIFS(${faixa(p.soma)},${cr.join(',')})` : `SUM(${faixa(p.soma)})`
    return { f, v }
  }

  if (resumo.length) {
    const span = Math.max(1, Math.floor(nCols / resumo.length))
    resumo.forEach((item, i) => {
      const c1 = i * span + 1
      const c2 = i === resumo.length - 1 ? Math.max(c1, Math.min(nCols, c1 + span - 1)) : c1 + span - 1
      const a = `${letra(c1)}${linhaResumo}`, b = `${letra(c2)}${linhaResumo}`
      const a2 = `${letra(c1)}${linhaResumo + 1}`, b2 = `${letra(c2)}${linhaResumo + 1}`
      if (c2 > c1) { ws.mergeCells(`${a}:${b}`); ws.mergeCells(`${a2}:${b2}`) }
      const partes = item.partes || [item]
      const calc = partes.map(p => ({ ...formulaDe(p), sinal: p.sinal || 1 }))
      const formula = calc.map((c, k) => `${k === 0 ? (c.sinal < 0 ? '-' : '') : (c.sinal < 0 ? '-' : '+')}${c.f}`).join('')
      const valor = Math.round(calc.reduce((s, c) => s + c.sinal * c.v, 0) * 100) / 100
      const cor = item.cor === 'verde' || item.cor === 'receita' ? VERDE
        : item.cor === 'vermelho' || item.cor === 'despesa' ? '991B1B'
          : item.cor === 'ambar' ? '92400E' : CINZA_ESCURO
      const borda = { style: 'thin', color: { argb: `FF${CINZA_BORDA}` } }
      cel(a, item.rotulo, { font: { size: 8, color: { argb: `FF${CINZA}` } }, fill: CARTAO, alignment: { vertical: 'bottom', indent: 1 }, border: { top: borda, left: borda, right: borda } })
      cel(a2, { formula, result: valor }, {
        font: { bold: true, size: 13, color: { argb: `FF${cor}` } }, fill: CARTAO, alignment: { vertical: 'middle', indent: 1, horizontal: 'left' },
        numFmt: item.numero || partes.every(p => p.contar) ? '0' : FMT.moeda, border: { bottom: borda, left: borda, right: borda },
      })
      for (let c = c1 + 1; c <= c2; c++) {
        for (const rr of [linhaResumo, linhaResumo + 1]) {
          const x = ws.getCell(`${letra(c)}${rr}`)
          x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${CARTAO}` } }
        }
      }
    })
    ws.getRow(linhaResumo).height = 16
    ws.getRow(linhaResumo + 1).height = 24
  }

  // Cabeçalho da tabela.
  colunas.forEach((c, i) => {
    cel(`${letra(i + 1)}${cab}`, c.titulo, {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: VERDE,
      alignment: { vertical: 'middle', horizontal: c.tipo === 'moeda' || c.tipo === 'numero' ? 'right' : 'left', wrapText: true },
    })
  })
  ws.getRow(cab).height = 20

  // Dados.
  const bordaLinha = { bottom: { style: 'thin', color: { argb: `FF${CINZA_BORDA}` } } }
  linhas.forEach((l, k) => {
    const rr = primeira + k
    const destaque = l._estilo
    const fundo = destaque === 'grupo' ? 'EEF2F0' : destaque ? VERDE_CLARO : (k % 2 ? ZEBRA : null)
    colunas.forEach((c, i) => {
      const ref = `${letra(i + 1)}${rr}`
      const bruto = l[c.chave]
      let valor = bruto ?? ''
      const estilo = { border: bordaLinha, alignment: { vertical: 'middle' }, font: {} }
      if (fundo) estilo.fill = fundo
      if (destaque) estilo.font.bold = true
      if (c.tipo === 'data') {
        const d = comoData(bruto)
        valor = d || (bruto ? String(bruto) : '')
        if (d) { estilo.numFmt = FMT.data; estilo.alignment.horizontal = 'center' }
      } else if (c.tipo === 'moeda' || c.tipo === 'numero') {
        const n = num(bruto)
        valor = n == null ? '' : n
        if (l._subtotal) {
          // Subtotal por fórmula: as linhas de detalhe desde o último grupo (o grupo fica fora).
          let ini = k - 1
          while (ini >= 0 && linhas[ini]._estilo !== 'grupo') ini--
          const det = linhas.slice(ini + 1, k).filter(x => !x._estilo)
          const v = Math.round(det.reduce((s, x) => s + (num(x[c.chave]) || 0), 0) * 100) / 100
          const col = letra(i + 1)
          valor = k - 1 >= ini + 1
            ? { formula: `SUM(${col}${primeira + ini + 1}:${col}${primeira + k - 1})`, result: v }
            : 0
        }
        estilo.numFmt = c.tipo === 'moeda' ? FMT.moeda : FMT.numero
        estilo.alignment.horizontal = 'right'
        const cor = c.cor?.(l)
        if (cor && COR_VALOR[cor]) estilo.font.color = { argb: `FF${COR_VALOR[cor]}` }
      } else if ((c.tipo === 'status' || c.tipo === 'selo') && bruto) {
        const s = SELOS[(c.selo?.(bruto, l)) || corDoSelo(bruto) || 'cinza']
        estilo.fill = s.fundo
        estilo.font = { ...estilo.font, bold: true, size: 9, color: { argb: `FF${s.texto}` } }
        estilo.alignment.horizontal = 'center'
      }
      cel(ref, valor, estilo)
    })
    if (temGrupos) ws.getCell(`${letra(colAux)}${rr}`).value = destaque ? '' : 'D'
  })
  if (temGrupos) ws.getColumn(colAux).hidden = true

  // TOTAL.
  let fimTabela = ultimaDados
  if (aba.totais !== false && aba.totais) {
    const rr = ultimaDados + 1
    fimTabela = rr
    const n = detalhe.length
    const rotulo = aba.totais.rotulo ? aba.totais.rotulo(n) : `${n} ${n === 1 ? 'título' : 'títulos'}`
    const somar = new Set(aba.totais.somar || [])
    const topo = { top: { style: 'medium', color: { argb: `FF${VERDE}` } } }
    colunas.forEach((c, i) => {
      const ref = `${letra(i + 1)}${rr}`
      let valor = ''
      const estilo = { fill: VERDE_CLARO, border: topo, font: { bold: true }, alignment: { vertical: 'middle' } }
      if (i === 0) valor = aba.totais.titulo || 'TOTAL'
      else if (i === 1 && !somar.has(c.chave)) valor = rotulo
      if (somar.has(c.chave)) {
        const { f, v } = formulaDe({ soma: c.chave })
        valor = { formula: f, result: Math.round(v * 100) / 100 }
        estilo.numFmt = c.tipo === 'moeda' ? FMT.moeda : FMT.numero
        estilo.alignment.horizontal = 'right'
        const cor = aba.totais.comCor ? c.cor?.({ [c.chave]: v }) : null
        if (cor && COR_VALOR[cor]) estilo.font.color = { argb: `FF${COR_VALOR[cor]}` }
      }
      cel(ref, valor, estilo)
    })
    if (colunas.length < 2) cel(`B${rr}`, rotulo, { fill: VERDE_CLARO, border: topo, font: { bold: true } })
    ws.getRow(rr).height = 18
  }

  // Larguras pelo conteúdo; A larga o bastante para a logo.
  colunas.forEach((c, i) => {
    const maior = Math.max(String(c.titulo || '').length, ...linhas.map(l => textoDe(c, l[c.chave]).length), 6)
    let w = c.largura || Math.min(50, Math.max(9, maior + 3))
    if (i === 0) w = Math.max(w, 17)
    ws.getColumn(i + 1).width = w
  })
  for (let i = colunas.length; i < nCols; i++) ws.getColumn(i + 1).width = i === 0 ? 17 : 14

  // Congelado até o cabeçalho da tabela, autofiltro, impressão.
  ws.views = [{ state: 'frozen', ySplit: cab, xSplit: 0, showGridLines: false }]
  if (colunas.length) ws.autoFilter = { from: { row: cab, column: 1 }, to: { row: Math.max(cab, ultimaDados), column: colunas.length } }
  ws.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
    printTitlesRow: `${cab}:${cab}`, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    printArea: `A1:${ultima}${Math.max(fimTabela, cab)}`,
  }
  ws.headerFooter = { oddFooter: `&C&"${FONTE},Regular"&8Finup · ${SITE} · Página &P de &N` }
}

// ─── Download / compartilhamento ─────────────────────────────────────────────────────────────────
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ehCelular = () => {
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches } catch { return false }
}

// Celular/PWA (iPhone): compartilhar o arquivo (abre Arquivos, WhatsApp…) quando o navegador deixa;
// senão, ou no computador, o download por link.
export async function entregarArquivo(blob, nome, { tipo = MIME_XLSX } = {}) {
  if (ehCelular() && typeof File !== 'undefined' && globalThis.navigator?.canShare) {
    try {
      const file = new File([blob], nome, { type: tipo })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: nome })
        return 'compartilhado'
      }
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelado'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'baixado'
}

let logoCache = null
async function carregarLogo() {
  if (logoCache) return logoCache
  try {
    const r = await fetch(LOGO_URL)
    if (!r.ok) return null
    logoCache = await r.arrayBuffer()
    return logoCache
  } catch {
    return null
  }
}

// Gera e entrega o .xlsx. nomeArquivo: string pronta (nomeArquivoFinup) ou { relatorio, periodo }.
export async function exportarExcel(spec) {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), carregarLogo()])
  const wb = montarPlanilha(ExcelJS, spec, { logo })
  const buf = await wb.xlsx.writeBuffer()
  const nome = typeof spec.nomeArquivo === 'string'
    ? spec.nomeArquivo
    : nomeArquivoFinup(spec.nomeArquivo?.relatorio || spec.titulo, spec.nomeArquivo?.periodo)
  return entregarArquivo(new Blob([buf], { type: MIME_XLSX }), nome)
}
