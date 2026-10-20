// Data padrão dos modais de pagamento/confirmação (DataPagamentoField): o VENCIMENTO do item;
// sem vencimento, hoje no fuso de São Paulo (hojeSP — nunca toISOString, que vira o dia à noite).
import { hojeSP } from './integridade/regras.js'

export { hojeSP }

// Normaliza o vencimento para YYYY-MM-DD (o backend às vezes devolve '2026-10-15T00:00:00.000Z').
export function normalizarVencimento(v) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || ''))
  return m ? m[1] : ''
}

export function dataPadraoPagamento(vencimento) {
  return normalizarVencimento(vencimento) || hojeSP()
}
