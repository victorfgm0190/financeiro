// Filtro por CONTAS ENVOLVIDAS (sub-filtro "Resgates Anuais" da tela Agendamentos).
// As contas vêm dos próprios agendamentos (origem + destino), nunca de uma lista fixa.

// Contas presentes nos agendamentos, com a quantidade de agendamentos em que cada uma aparece
// (origem OU destino; um agendamento conta 1 vez por conta). Ordem: quantidade desc, nome asc.
export function contasEnvolvidas(schedules, accounts = []) {
  const contagem = new Map()
  for (const s of schedules) {
    for (const id of new Set([s.accountId, s.toAccountId].filter(Boolean))) {
      contagem.set(id, (contagem.get(id) || 0) + 1)
    }
  }
  return [...contagem]
    .map(([accountId, count]) => {
      const acc = accounts.find(a => a.id === accountId)
      return { accountId, nome: acc?.apelido || acc?.name || '?', count }
    })
    .sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome, 'pt-BR'))
}

// Nenhuma conta → tudo. 1 conta → origem OU destino. 2+ → as DUAS pontas entre as selecionadas
// (agendamento sem destino não tem duas pontas e sai).
export function filtrarPorContas(schedules, selecionadas) {
  const sel = selecionadas instanceof Set ? selecionadas : new Set(selecionadas || [])
  if (sel.size === 0) return schedules
  if (sel.size === 1) return schedules.filter(s => sel.has(s.accountId) || sel.has(s.toAccountId))
  return schedules.filter(s => sel.has(s.accountId) && sel.has(s.toAccountId))
}
