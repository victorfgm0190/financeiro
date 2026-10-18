import {
  COLUNAS, LINHAS_PREPARADAS, LINHA_CABECALHO, ABA_LANCAMENTOS, ABA_LISTAS, ABA_INSTRUCOES, ABA_ID, rotulosCategorias,
} from './comum'

// EXCEL GERADO PARA A CONTA ESCOLHIDA (exceljs). Abas:
//   Lançamentos — título travado (conta e ambiente), cabeçalho e 1.000 linhas preparadas com
//                 validação: DATA (data, dd/mm/aaaa), VALOR (número, '#,##0.00' — o Excel em
//                 português mostra 1.234,56), DESCRIÇÃO, CATEGORIA (lista) e FAVORECIDO (lista que
//                 aceita texto novo). Só o título é protegido; as colunas de digitação ficam
//                 desbloqueadas na coluna inteira (dá para passar da linha 1.000).
//   Instruções  — cada coluna explicada e 2 linhas de exemplo.
//   Listas      — oculta: categorias e favorecidos (cabe qualquer quantidade).
//   _finup      — veryHidden: id e nome da conta, ambiente e data — avisa se o arquivo for de outra conta.
// `ExcelJS` vem de fora (import dinâmico na tela; import normal nos testes).

const VERDE = 'FF0F6E56'
const CINZA = 'FFF2F5F4'
const LARGURAS = [14, 16, 48, 34, 32]

export async function gerarExcelImportacao(ExcelJS, { conta, ambiente, categorias = [], favorecidos = [], agora = new Date() }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finup'
  wb.created = agora
  const rotulos = rotulosCategorias(categorias).map(r => r.rotulo)
  const favs = [...new Set(favorecidos.map(f => String(f || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const amb = String(ambiente || '').toUpperCase()
  const ultima = LINHA_CABECALHO + LINHAS_PREPARADAS

  // ── Lançamentos ───────────────────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet(ABA_LANCAMENTOS, { views: [{ state: 'frozen', ySplit: LINHA_CABECALHO }] })
  ws.columns = COLUNAS.map((c, i) => ({ key: c.id, width: LARGURAS[i] }))
  // Colunas inteiras desbloqueadas (e com o formato certo): o usuário digita onde quiser.
  COLUNAS.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    col.protection = { locked: false }
    if (c.id === 'data') col.numFmt = 'dd/mm/yyyy'
    if (c.id === 'valor') col.numFmt = '#,##0.00'
  })
  const travar = (cell) => { cell.protection = { locked: true } }

  ws.mergeCells(1, 1, 1, COLUNAS.length)
  const t1 = ws.getCell(1, 1)
  t1.value = `Importação de lançamentos — conta: ${conta.name}`
  t1.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
  t1.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 26
  ws.mergeCells(2, 1, 2, COLUNAS.length)
  const t2 = ws.getCell(2, 1)
  t2.value = `Ambiente: ${amb} · gerado em ${agora.toLocaleDateString('pt-BR')} · preencha a partir da linha ${LINHA_CABECALHO + 1}. Valor negativo = saída. Veja a aba "${ABA_INSTRUCOES}".`
  t2.font = { italic: true, size: 10, color: { argb: 'FF5B6B66' } }
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } }
  COLUNAS.forEach((c, i) => {
    const cab = ws.getCell(LINHA_CABECALHO, i + 1)
    cab.value = c.titulo
    cab.font = { bold: true }
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFF0EA' } }
    cab.border = { bottom: { style: 'thin', color: { argb: VERDE } } }
    travar(ws.getCell(1, i + 1)); travar(ws.getCell(2, i + 1)); travar(cab)
  })

  const faixa = (col) => `${col}${LINHA_CABECALHO + 1}:${col}${ultima}`
  ws.dataValidations.add(faixa('A'), {
    type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(1990, 0, 1))],
    showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Data inválida', error: 'Digite uma data no formato dd/mm/aaaa.',
    showInputMessage: true, promptTitle: 'DATA', prompt: 'dd/mm/aaaa',
  })
  ws.dataValidations.add(faixa('B'), {
    type: 'decimal', operator: 'between', allowBlank: true, formulae: [-999999999.99, 999999999.99],
    showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Valor inválido', error: 'Digite só o número, ex.: 1.234,56 (negativo = saída).',
    showInputMessage: true, promptTitle: 'VALOR', prompt: 'Positivo = entrada · negativo = saída',
  })
  ws.dataValidations.add(faixa('C'), {
    type: 'textLength', operator: 'lessThanOrEqual', allowBlank: true, formulae: [250],
    showInputMessage: true, promptTitle: 'DESCRIÇÃO', prompt: 'Obrigatória',
  })
  if (rotulos.length) {
    ws.dataValidations.add(faixa('D'), {
      type: 'list', allowBlank: true, formulae: [`${ABA_LISTAS}!$A$2:$A$${rotulos.length + 1}`],
      // aviso (não bloqueia): categoria fora da lista vira de-para na importação
      showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Categoria fora da lista',
      error: 'Essa categoria não existe no Finup. Na importação você escolhe a correspondente ou cria uma nova.',
    })
  }
  if (favs.length) {
    ws.dataValidations.add(faixa('E'), {
      type: 'list', allowBlank: true, formulae: [`${ABA_LISTAS}!$B$2:$B$${favs.length + 1}`],
      showErrorMessage: false, // aceita favorecido novo
    })
  }
  await ws.protect('', {
    selectLockedCells: true, selectUnlockedCells: true, formatCells: true, formatColumns: true, formatRows: true,
    insertRows: true, deleteRows: true, sort: true, autoFilter: true,
  })

  // ── Instruções ────────────────────────────────────────────────────────────────────────────
  const wi = wb.addWorksheet(ABA_INSTRUCOES)
  wi.columns = [{ width: 16 }, { width: 90 }]
  const linhasInstr = [
    ['Como preencher', ''],
    ['', `Preencha a aba "${ABA_LANCAMENTOS}" a partir da linha ${LINHA_CABECALHO + 1}, um lançamento por linha. Este arquivo é da conta "${conta.name}" (ambiente ${amb}).`],
    ['DATA', 'Data do lançamento, no formato dd/mm/aaaa. Obrigatória.'],
    ['VALOR', 'Só o número, com vírgula nos centavos (1.234,56). Positivo = entrada; negativo = saída (ex.: -89,90). Obrigatório.'],
    ['DESCRIÇÃO', 'Texto do lançamento (ex.: "Supermercado"). Obrigatória.'],
    ['CATEGORIA', 'Opcional. Escolha na lista. Texto fora da lista: na importação você escolhe a correspondente ou cria uma nova (fica salvo para as próximas). Vazio = sem categoria.'],
    ['FAVORECIDO', 'Opcional. Escolha na lista ou digite um nome novo.'],
    ['', ''],
    ['Exemplos', ''],
  ]
  linhasInstr.forEach(r => wi.addRow(r))
  wi.getCell('A1').font = { bold: true, size: 14 }
  wi.getCell('A9').font = { bold: true, size: 12 }
  for (let r = 3; r <= 7; r++) wi.getCell(`A${r}`).font = { bold: true }
  const ex = wi.addRow(COLUNAS.map(c => c.titulo))
  ex.font = { bold: true }
  const cat1 = rotulos.find(r => /salari/i.test(r)) || rotulos[0] || ''
  const cat2 = rotulos.find(r => /aliment|mercado/i.test(r)) || rotulos[1] || ''
  const e1 = wi.addRow([new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), 5)), 5000, 'Salário do mês', cat1, 'Empresa X'])
  const e2 = wi.addRow([new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), 8)), -234.5, 'Supermercado', cat2, 'Mercado Bom Preço'])
  for (const r of [e1, e2]) { r.getCell(1).numFmt = 'dd/mm/yyyy'; r.getCell(2).numFmt = '#,##0.00' }
  wi.getColumn(3).width = 30; wi.getColumn(4).width = 28; wi.getColumn(5).width = 24
  wi.getColumn(2).alignment = { wrapText: true, vertical: 'top' }

  // ── Listas (oculta) e identificação (veryHidden) ──────────────────────────────────────────
  const wl = wb.addWorksheet(ABA_LISTAS, { state: 'hidden' })
  wl.getCell('A1').value = 'CATEGORIAS'
  wl.getCell('B1').value = 'FAVORECIDOS'
  rotulos.forEach((r, i) => { wl.getCell(i + 2, 1).value = r })
  favs.forEach((f, i) => { wl.getCell(i + 2, 2).value = f })

  const wid = wb.addWorksheet(ABA_ID, { state: 'veryHidden' })
  ;[['conta_id', conta.id], ['conta_nome', conta.name], ['ambiente', String(ambiente || '').toLowerCase()],
    ['gerado_em', agora.toISOString()], ['versao', 1]].forEach(r => wid.addRow(r))

  wb.views = [{ activeTab: 0 }]
  return wb.xlsx.writeBuffer()
}

export const nomeArquivoExcel = (conta, agora = new Date()) =>
  `importar-${String(conta.name || 'conta').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${agora.toISOString().slice(0, 10)}.xlsx`
