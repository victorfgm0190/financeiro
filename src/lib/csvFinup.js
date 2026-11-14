// CSV no padrão do Finup (Excel em português): separador ";", valores entre aspas, número com
// vírgula decimal, BOM para o Excel abrir com acentos. O nome do arquivo é o MESMO do Excel do
// relatório (nomeArquivoFinup), só com a extensão .csv.
import { entregarArquivo, nomeArquivoFinup } from './exportExcel.js'

const celula = (v) => {
  const t = typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : String(v ?? '')
  return `"${t.replace(/"/g, '""')}"`
}

export function gerarCsv(cabecalho, linhas) {
  return [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n')
}

export const nomeArquivoCsv = ({ relatorio, periodo } = {}) => nomeArquivoFinup(relatorio, periodo).replace(/\.xlsx$/, '.csv')

// Gera e entrega o CSV. Erro vira mensagem na tela (padrão das exportações do Finup).
export async function exportarCsv({ nomeArquivo, cabecalho, linhas }) {
  try {
    const csv = gerarCsv(cabecalho, linhas)
    return await entregarArquivo(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), nomeArquivoCsv(nomeArquivo), { tipo: 'text/csv' })
  } catch (err) {
    window.alert(`Não consegui exportar o CSV: ${err?.message || err}`)
    return null
  }
}
