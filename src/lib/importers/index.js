// Importadores de arquivos de banco (cartão e conta corrente) — ponto único de entrada.
// Detecção no upload: OFX → parser OFX; cabeçalho conhecido → Itaú / Dindin / modelo (do usuário
// ou pronto); desconhecido → tela de mapeamento. Interface dos registros: ./registro.js.

import { isItauCSV } from '../parsers/itauFatura.js'
import { pareceOfx } from './adaptadores.js'
import { acharModelo, assinaturaCabecalho } from './generico.js'

export * from './registro.js'
export * from './adaptadores.js'
export * from './generico.js'

// Formato do arquivo, antes de ler as linhas: 'ofx' | 'itau-csv' | 'planilha' (XLS/XLSX/CSV
// genérico — o chamador tenta Itaú/Dindin e, sem eles, o modelo / o mapeamento).
export function formatoDoArquivo(nome, textoInicial = '') {
  if (/\.ofx$/i.test(nome || '') || pareceOfx(textoInicial)) return 'ofx'
  if (/\.csv$/i.test(nome || '') && isItauCSV(textoInicial)) return 'itau-csv'
  return 'planilha'
}

// Planilha genérica: { modelo } quando reconhecida pelo cabeçalho; senão { modelo: null }.
export function detectarModelo(tabela, tipo, modelosDoUsuario = []) {
  return { modelo: acharModelo(tabela, tipo, modelosDoUsuario) }
}

// Mapeamento antigo do localStorage ('finup_csv_mappings': { 'cab1|cab2|…': { dateCol, amountCol,
// descCol, negativeIsExpense } }, nomes de coluna) → modelo de import_layouts (índices).
export const CHAVE_MAPEAMENTOS_ANTIGOS = 'finup_csv_mappings'
export function modeloDoMapeamentoAntigo(chave, antigo) {
  const cab = String(chave || '').split('|')
  const idx = (nome) => { const i = cab.findIndex(h => h === String(nome || '').toLowerCase()); return i >= 0 ? i : null }
  const mapeamento = {
    linhaCabecalho: 0, colData: idx(antigo?.dateCol), colDescricao: idx(antigo?.descCol), colValor: idx(antigo?.amountCol),
    formatoData: 'dmy', decimal: ',', sinalDespesa: antigo?.negativeIsExpense === false ? 'positivo' : 'negativo', ignorar: [],
  }
  return { nome: 'Modelo CSV (salvo neste navegador)', banco: '', tipo: 'cartao', assinatura: assinaturaCabecalho(cab), mapeamento }
}
