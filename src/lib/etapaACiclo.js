// Quando a etapa A de um gasto do grupo G é DEVIDA — regra única do "Verificar e corrigir"
// (lib/verificarCartao) e do motor de integridade (lib/integridade/regras: GER_ETAPA_A_FALTANDO e
// GER_FECHAMENTO_FATURA). Decisão de 14/11/2026:
//   • à vista / parcela 1: a etapa A nasce na compra (regra de sempre de cada chamador);
//   • parcela 2..N: quando a FATURA dela entra no CICLO FINANCEIRO ATUAL do cliente, pelo FECHAMENTO
//     da fatura (cicloFinanceiroAtual — a função do motor da fatura — com o início do mês financeiro
//     de cada cliente). Ex.: mês começando dia 15 e fatura 12/2026 fechando em 13/12 → em 14/11
//     (ciclo 15/10–14/11) aguarda; a partir de 15/11 (ciclo 15/11–14/12) é devida.
// Puro, com imports .js (roda também no servidor, em api/integridade.js).
import { cicloFinanceiroAtual } from './cicloFinanceiro.js'
import { isParcelaGeradaOrigin } from './origins.js'

// Parcela 2..N (mesmo critério do applyEnsureGerencial, que não cria a etapa A delas).
export const ehParcela2aN = (t) => Number(t?.installmentNum) > 1 || t?.parentTxId != null || isParcelaGeradaOrigin(t)

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Dia em que a fatura 'AAAA-MM' FECHA: o dia de fechamento do cartão no mês da fatura (limitado ao
// último dia do mês) — a fatura do mês M fecha no dia F de M.
export function fechamentoDaFatura(fatura, card) {
  const [y, m] = fatura.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return `${fatura}-${String(Math.min(card?.closingDay || 14, ultimo)).padStart(2, '0')}`
}

//   'passada' → o fechamento é anterior ao ciclo atual (a etapa A já devia existir);
//   'mes'     → o fechamento cai no ciclo atual (o "Executar Gerenciais" do mês);
//   'futura'  → o fechamento é depois do ciclo atual (aguardando a vez).
export function situacaoDaEtapaA(card, fatura, hoje, settings) {
  const { start, end } = cicloFinanceiroAtual(settings || {}, new Date(`${hoje}T12:00:00`))
  const fecha = fechamentoDaFatura(fatura, card)
  return fecha < iso(start) ? 'passada' : fecha <= iso(end) ? 'mes' : 'futura'
}

// Configuração do mês financeiro a partir do que cada chamador tem: o estado do app (settings) ou
// as colunas de configuracoes lidas no servidor.
export const configDoCiclo = (dados) => ({
  financialMonthStartDay: dados?.settings?.financialMonthStartDay ?? dados?.financialMonthStartDay ?? 1,
  financialMonthMode: dados?.settings?.financialMonthMode ?? dados?.financialMonthMode ?? 'custom',
})
