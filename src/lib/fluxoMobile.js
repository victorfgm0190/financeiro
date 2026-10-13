// Fluxo de Caixa no celular: atalhos de horizonte e agrupamento da lista por dia. Só apresentação —
// as linhas são as mesmas que o painel já calculou (computeFluxoCaixa + montarLinhasSimuladas).

import { resolverTipoDocumento, itemDaLinhaFluxo } from './tiposDocumento.js'
import { statusConfirmacaoLinha } from './fluxoStatus.js'

// Seletor do topo no mobile. É o mesmo `horizonte` (dias a partir de hoje) do painel, só com
// janelas maiores que os chips do desktop (HORIZONTES).
export const HORIZONTES_MOBILE = [
  { dias: 30, rotulo: 'Mês' },
  { dias: 90, rotulo: '3 meses' },
  { dias: 365, rotulo: '12 meses' },
]

// [{ date, rows }] na ordem em que as linhas chegam (já ordenadas por data), um grupo por dia.
export function agruparPorDia(rows) {
  const grupos = []
  for (const r of rows || []) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.date === r.date) ultimo.rows.push(r)
    else grupos.push({ date: r.date, rows: [r] })
  }
  return grupos
}

// Marcadores da linha no celular, antes da descrição: [badge doc] [ícone status]. Mesma resolução
// do desktop (resolverTipoDocumento + statusConfirmacaoLinha); só filtra a EXIBIÇÃO: os fallbacks
// ENV (envelope) e RES (resgate) somem, porque a descrição já identifica o item. CC e tipos
// gravados aparecem normalmente. → { doc: tipo | null, status: STATUS_CONFIRMACAO.* | null }
const FALLBACK_OCULTO_MOBILE = new Set(['ENV', 'RES'])
export function marcadoresLinhaMobile(r, ctx, tipos) {
  const tipo = resolverTipoDocumento(itemDaLinhaFluxo(r, ctx), tipos)
  const doc = tipo && !(tipo.fallback && FALLBACK_OCULTO_MOBILE.has(tipo.sigla)) ? tipo : null
  return { doc, status: statusConfirmacaoLinha(r, ctx)?.status ?? null }
}
