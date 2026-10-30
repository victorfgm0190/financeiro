// Resumo de uma seleção de agendamentos (painel "N selecionados" da tela Agendamentos e rodapé do
// modal "Registrar N agendamentos"). Uma única fonte para os dois: o painel passa o valor efetivo
// da próxima ocorrência; o modal, o valor editado em cada linha.
//
// Aplicação = transferência para conta reserva; resgate = transferência a partir de conta reserva.
// O saldo de caixa é receita + resgate − despesa − aplicação. Fatura e transferências comuns ficam
// em grupos à parte, fora do saldo.

const r2 = (n) => Math.round(n * 100) / 100

export const GRUPOS_SELECAO = ['aplicacao', 'resgate', 'despesa', 'receita', 'fatura', 'transferencia']

export function nomeConta(acc) {
  return acc?.apelido || acc?.name || '?'
}

// Grupo de movimentação de um agendamento (null = não entra no resumo).
export function classificarAgendamento(schedule, accounts) {
  const s = schedule
  if (!s) return null
  if (s.tipo === 'pagamento_fatura') return 'fatura'
  if (s.transactionType === 'transfer') {
    if (accounts.find(a => a.id === s.toAccountId)?.isReserva) return 'aplicacao'
    if (accounts.find(a => a.id === s.accountId)?.isReserva) return 'resgate'
    return 'transferencia'
  }
  if (s.transactionType === 'expense') return 'despesa'
  if (s.transactionType === 'income') return 'receita'
  return null
}

// itens: [{ schedule, amount }]. Valores não finitos contam como 0.
export function resumoSelecao(itens, accounts = []) {
  const g = Object.fromEntries(GRUPOS_SELECAO.map(k => [k, { items: [], total: 0 }]))
  const pares = new Map()   // `${contaId}|${reservaId}` → par
  const impacto = new Map() // accountId → delta (só aplicações/resgates)
  const somaImpacto = (id, v) => impacto.set(id, r2((impacto.get(id) || 0) + v))

  for (const { schedule: s, amount } of itens) {
    const key = classificarAgendamento(s, accounts)
    if (!key) continue
    const amt = Number.isFinite(Number(amount)) ? Number(amount) : 0
    g[key].items.push({ id: s.id, description: s.description || '—', amount: amt })
    g[key].total = r2(g[key].total + amt)

    if (key === 'aplicacao' || key === 'resgate') {
      // Par = (conta comum, conta reserva), independente do sentido.
      const contaId = key === 'aplicacao' ? s.accountId : s.toAccountId
      const reservaId = key === 'aplicacao' ? s.toAccountId : s.accountId
      const pk = `${contaId}|${reservaId}`
      if (!pares.has(pk)) {
        pares.set(pk, {
          contaId, reservaId,
          contaNome: nomeConta(accounts.find(a => a.id === contaId)),
          reservaNome: nomeConta(accounts.find(a => a.id === reservaId)),
          aplicado: 0, resgatado: 0, nAplicacoes: 0, nResgates: 0,
        })
      }
      const p = pares.get(pk)
      if (key === 'aplicacao') { p.aplicado = r2(p.aplicado + amt); p.nAplicacoes++ }
      else { p.resgatado = r2(p.resgatado + amt); p.nResgates++ }
      somaImpacto(s.accountId, -amt)
      somaImpacto(s.toAccountId, amt)
    }
  }

  // liquido > 0 = resgate líquido (reserva → conta); < 0 = aplicação líquida (conta → reserva).
  const listaPares = [...pares.values()].map(p => {
    const liquido = r2(p.resgatado - p.aplicado)
    const sentido = liquido > 0 ? 'resgate' : liquido < 0 ? 'aplicacao' : 'zero'
    return {
      ...p, liquido, sentido,
      origemNome: sentido === 'aplicacao' ? p.contaNome : p.reservaNome,
      destinoNome: sentido === 'aplicacao' ? p.reservaNome : p.contaNome,
    }
  })

  const impactoPorConta = [...impacto]
    .filter(([, v]) => v !== 0)
    .map(([id, delta]) => ({ accountId: id, nome: nomeConta(accounts.find(a => a.id === id)), delta }))
    .sort((a, b) => b.delta - a.delta)

  const liquidoReserva = r2(g.resgate.total - g.aplicacao.total)
  const hasInflow = g.receita.items.length > 0 || g.resgate.items.length > 0
  const hasOutflow = g.despesa.items.length > 0 || g.aplicacao.items.length > 0
  const saldo = r2(g.receita.total - g.despesa.total + g.resgate.total - g.aplicacao.total)

  return { g, saldo, showSaldo: hasInflow && hasOutflow, liquidoReserva, pares: listaPares, impactoPorConta }
}

// "Valor transferido de fato" (modal Registrar selecionados): por par (conta ↔ reserva), a
// diferença entre o valor movido no banco e o líquido dos agendamentos vira UMA transferência SEM
// função e sem categoria (origem reserva_a_distribuir: sem espelho, fora dos totais) — o "Saldo a
// distribuir" da reserva. Sentido do par: resgate = reserva → conta; aplicação (ou zero) = conta →
// reserva. Transferiu MAIS → a diferença segue o sentido; MENOS → volta no sentido contrário.
// deFato: { [`${contaId}|${reservaId}`]: número }. Devolve os lançamentos a criar.
export const DESCRICAO_A_DISTRIBUIR = 'Diferença da operação da reserva (saldo a distribuir)'
export function transferenciasDaDiferenca(pares, deFato, { date, origin = 'reserva_a_distribuir' } = {}) {
  const out = []
  for (const p of pares || []) {
    const fato = deFato?.[`${p.contaId}|${p.reservaId}`]
    if (!Number.isFinite(fato) || fato < 0) continue
    const diff = r2(fato - Math.abs(p.liquido))
    if (diff === 0) continue
    const paraReserva = (p.sentido !== 'resgate') === (diff > 0)
    out.push({
      type: 'transfer',
      accountId: paraReserva ? p.contaId : p.reservaId,
      toAccountId: paraReserva ? p.reservaId : p.contaId,
      amount: Math.abs(diff), date, description: DESCRICAO_A_DISTRIBUIR,
      categoryId: null, reservaFuncaoId: null, origin,
    })
  }
  return out
}
