// Procedência canônica de um lançamento (coluna `origin`). Cada ponto de CRIAÇÃO carimba um
// destes valores; a coluna é gravada na criação e NUNCA alterada em edições posteriores.
//
// Os predicados abaixo aceitam TANTO o valor canônico novo QUANTO o legado ainda presente no
// banco (não houve migração de dados históricos) — assim as cascatas de exclusão/estorno,
// os filtros de relatório e o isAutomacao continuam funcionando para lançamentos antigos.
export const ORIGIN = {
  MANUAL: 'manual',
  DUPLICADO: 'duplicado',
  IMPORTACAO_FATURA: 'importacao_fatura',
  RECONCILIACAO_FATURA: 'reconciliacao_fatura',
  PARCELA_GERADA: 'parcela_gerada',
  ETAPA_A: 'etapa_a',
  RESERVA_AUTO: 'reserva_auto',
  PATRIMONIO_AUTO: 'patrimonio_auto',
  INVEST_AUTO: 'invest_auto',
  ESPELHO: 'espelho',
  AGENDAMENTO: 'agendamento',
  AGENDAMENTO_AUTO: 'agendamento_auto',
  GERENCIAL_AUTO: 'gerencial_auto',
  PAGAMENTO_DIVIDA: 'pagamento_divida',
  IMPORTACAO_DINDIN: 'importacao_dindin',
  AJUSTE_GRUPO: 'ajuste_grupo',
}

// Equivalências canônico ⇄ legado (valor antigo ainda gravado em linhas históricas).
const INVEST_ORIGINS = new Set(['invest_auto', 'investAuto'])
const PATRIMONIO_ORIGINS = new Set(['patrimonio_auto', 'patrimonioAuto'])
const GERENCIAL_ORIGINS = new Set(['gerencial_auto', 'auto-provisao'])
const PARCELA_ORIGINS = new Set(['parcela_gerada', 'parcela'])
const RESERVA_SHADOW_ORIGINS = new Set(['reserva_auto', 'reservaAuto'])

export const isInvestAutoOrigin = (tx) => INVEST_ORIGINS.has(tx?.origin)
export const isPatrimonioOrigin = (tx) => PATRIMONIO_ORIGINS.has(tx?.origin)
export const isGerencialAutoOrigin = (tx) => GERENCIAL_ORIGINS.has(tx?.origin)
export const isParcelaGeradaOrigin = (tx) => PARCELA_ORIGINS.has(tx?.origin)
export const isReservaShadowOrigin = (tx) => RESERVA_SHADOW_ORIGINS.has(tx?.origin)

// "Automação" = sombra de reserva (flag reservaAuto) + provisão gerencial + aporte de
// investimento + patrimônio. Espelha exatamente o antigo predicado inline, agora tolerante
// aos valores legados e canônicos de cada categoria.
export const isAutomacaoOrigin = (tx) =>
  !!tx?.reservaAuto || isGerencialAutoOrigin(tx) || isInvestAutoOrigin(tx) || isPatrimonioOrigin(tx)
