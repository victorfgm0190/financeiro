// CSV no padrão do Finup (Excel em português): separador ";", valores entre aspas, número com
// vírgula decimal. Quem chama põe o BOM e entrega o arquivo (exportExcel.entregarArquivo).
const celula = (v) => {
  const t = typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : String(v ?? '')
  return `"${t.replace(/"/g, '""')}"`
}

export function gerarCsv(cabecalho, linhas) {
  return [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n')
}
