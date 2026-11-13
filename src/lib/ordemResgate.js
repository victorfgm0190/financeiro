// Ordem no MESMO DIA: o resgate ligado a uma despesa (src/lib/resgateVinculado.js) vem ANTES da
// despesa — na lista e no calendário de Agendamentos, no Fluxo de Caixa (principal e por conta), no
// extrato da conta e na previsão da reserva. Sem importações (usado por fluxoCaixa, que o
// resgateVinculado também usa).
//
// Reconhece o agendamento do resgate (agendamentoVinculadoId), as linhas projetadas dele (id/chave
// 'sch_resgv_…') e o lançamento gerado ('tx_resgv_…'), em qualquer formato de linha das telas.
const PREFIXOS = ['tx_resgv_', 'sch_resgv_']

export function ehDoResgateLigado(x) {
  if (!x) return false
  if (x.agendamentoVinculadoId || x.schedule?.agendamentoVinculadoId) return true
  return [x.id, x._key, x.key, x.scheduleId, x._scheduleId, x.schedule?.id].some(v =>
    typeof v === 'string' && PREFIXOS.some(p => v.startsWith(p) || v.startsWith(`pago:${p}`)))
}

// Comparador de desempate (use depois da data): resgate ligado primeiro, o resto na ordem de antes.
export const resgatePrimeiro = (a, b) => Number(ehDoResgateLigado(b)) - Number(ehDoResgateLigado(a))
