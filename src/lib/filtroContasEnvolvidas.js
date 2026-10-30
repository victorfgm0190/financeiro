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

// ─── Filtro por CONTA DE RESERVA (aba Contas Anuais: A pagar, Pagos e Resgates anuais) ────────
const ehContaReserva = (a) => !!a && (a.isReserva || a.vinculoTipo === 'reserva')

// Opções do seletor: as contas de reserva presentes (origem ou destino) em `todos` (a aba inteira,
// para a lista não mudar ao trocar de status), com a quantidade de itens de `doStatus` (o status
// atual) em que cada uma aparece. Ordem: nome. agendamentoDe: item → agendamento (linhas de Pagos
// trazem o agendamento em .schedule).
export function contasReservaDaAba(todos, doStatus, accounts = [], agendamentoDe = (s) => s) {
  const reservas = new Map()
  for (const s of todos || []) {
    for (const id of [s.accountId, s.toAccountId]) {
      if (!id || reservas.has(id)) continue
      const acc = accounts.find(a => a.id === id)
      if (ehContaReserva(acc)) reservas.set(id, acc.apelido || acc.name || '?')
    }
  }
  return [...reservas]
    .map(([accountId, nome]) => ({
      accountId, nome,
      count: (doStatus || []).filter(i => { const s = agendamentoDe(i); return s?.accountId === accountId || s?.toAccountId === accountId }).length,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// '' (Todas) → tudo; senão, os itens com a conta na origem OU no destino (aplicação e resgate).
export function filtrarPorContaReserva(itens, contaId, agendamentoDe = (s) => s) {
  if (!contaId) return itens
  return (itens || []).filter(i => { const s = agendamentoDe(i); return s?.accountId === contaId || s?.toAccountId === contaId })
}
