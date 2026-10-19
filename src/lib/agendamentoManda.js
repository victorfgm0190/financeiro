// "O agendamento manda": lançamento que casa com um agendamento recorrente herda dele o grupo
// gerencial, a função de reserva, a categoria, o favorecido e o tipo de documento — com
// prioridade sobre a regra de classificação e o "Classificar Auto". Vale na importação de fatura
// e de conta corrente e no "Cobrança recorrente detectada" do Novo Lançamento.

// Campo do agendamento → campo do lançamento / da linha da importação (função de reserva fica em
// `_reservaFuncaoId` na linha). Ordem = ordem de exibição.
export const CAMPOS_DO_AGENDAMENTO = [
  { campo: 'grupoGerencial', linha: 'grupoGerencial', rotulo: 'Grupo gerencial' },
  { campo: 'reservaFuncaoId', linha: '_reservaFuncaoId', rotulo: 'Função de reserva' },
  { campo: 'categoryId', linha: 'categoryId', rotulo: 'Categoria' },
  { campo: 'payee', linha: 'payee', rotulo: 'Favorecido' },
  { campo: 'tipoDocumentoId', linha: 'tipoDocumentoId', rotulo: 'Tipo de documento' },
]
export const CAMPOS_LINHA_AGENDAMENTO = CAMPOS_DO_AGENDAMENTO.map(c => c.linha)

const vazio = (v) => v == null || v === ''
const igual = (a, b) => (vazio(a) && vazio(b)) || a === b

// Mesma heurística do findMatchingSchedule (AppContext): mesmo tipo, valor ±R$ 0,50 e favorecido
// (ou, sem favorecido, a 1ª palavra significativa da descrição do agendamento na do lançamento).
export function casaAgendamento(tx, schedule) {
  if (!tx || !schedule) return false
  if (schedule.transactionType !== (tx.type || 'expense')) return false
  if (Math.abs(Number(schedule.amount) - Number(tx.amount)) > 0.50) return false
  const txPayee = (tx.payee || '').toLowerCase().trim()
  const sPayee = (schedule.payee || '').toLowerCase().trim()
  const txDesc = (tx.description || '').toLowerCase()
  const sDesc = (schedule.description || '').toLowerCase()
  if (txPayee && sPayee) return txPayee === sPayee || txPayee.includes(sPayee) || sPayee.includes(txPayee)
  if (txDesc && sDesc) {
    const keyword = sDesc.split(/\s+/).find(w => w.length > 3)
    return keyword ? txDesc.includes(keyword) : false
  }
  return false
}

// Agendamento cujos campos o lançamento herda: recorrente do usuário (os gerados pelo motor da
// fatura têm `tipo`), da MESMA conta e que casa pela heurística acima. `excecoes` = favorecidos
// do "Não perguntar mais" (settings.recurringMatchExceptions).
export function agendamentoQueManda(tx, schedules, { excecoes = [] } = {}) {
  if (!tx?.accountId) return null
  const txPayee = (tx.payee || '').toLowerCase().trim()
  if (txPayee && excecoes.includes(txPayee)) return null
  return (schedules || []).find(s =>
    !s.tipo && s.frequency && s.frequency !== 'once' && s.accountId === tx.accountId && casaAgendamento(tx, s)) || null
}

// Campos preenchidos no agendamento, já com os nomes da LINHA (importação).
export function camposDoAgendamentoParaLinha(schedule) {
  const out = {}
  for (const c of CAMPOS_DO_AGENDAMENTO) if (!vazio(schedule?.[c.campo])) out[c.linha] = schedule[c.campo]
  return out
}

// Linha da importação com os campos do agendamento. `_doAgendamento` guarda o vínculo (selo,
// pergunta ao editar e proteção contra o "Classificar Auto").
export function aplicarAgendamentoNaLinha(row, schedule) {
  if (!schedule) return row
  const campos = camposDoAgendamentoParaLinha(schedule)
  if (!Object.keys(campos).length) return row
  return {
    ...row, ...campos,
    _doAgendamento: { scheduleId: schedule.id, descricao: schedule.description || '', campos: Object.keys(campos) },
    _suggestedCategory: false, _suggestedReserva: false,
  }
}

// Campos do agendamento que a edição `changes` (nomes da linha) passou a contrariar: lista
// [{ campo, rotulo, de (agendamento), para (linha) }] — base da pergunta "Atualizar também o
// agendamento?". Trocar o grupo leva junto a função de reserva (o select zera a função).
export function divergenciasDaEdicao(schedule, changes) {
  if (!schedule || !changes) return []
  const out = []
  for (const c of CAMPOS_DO_AGENDAMENTO) {
    if (!(c.linha in changes)) continue
    if (igual(schedule[c.campo], changes[c.linha])) continue
    out.push({ campo: c.campo, rotulo: c.rotulo, de: schedule[c.campo] ?? null, para: changes[c.linha] ?? null })
  }
  return out
}

// Diferenças entre um lançamento (nomes do lançamento) e o agendamento, só nos campos que o
// agendamento tem preenchidos (Novo Lançamento → "Cobrança recorrente detectada").
export function diferencasLancamentoAgendamento(tx, schedule) {
  if (!tx || !schedule) return []
  return CAMPOS_DO_AGENDAMENTO
    .filter(c => !vazio(schedule[c.campo]) && !igual(schedule[c.campo], tx[c.campo]))
    .map(c => ({ campo: c.campo, rotulo: c.rotulo, deLancamento: tx[c.campo] ?? null, doAgendamento: schedule[c.campo] }))
}

// Patch do lançamento com os campos do agendamento (só os que o agendamento tem).
export function patchLancamentoDoAgendamento(schedule) {
  const out = {}
  for (const c of CAMPOS_DO_AGENDAMENTO) if (!vazio(schedule?.[c.campo])) out[c.campo] = schedule[c.campo]
  return out
}

// Mudanças para atualizar o agendamento a partir de [{ campo, para }] — e o histórico (de → para).
export function mudancasNoAgendamento(schedule, divergencias) {
  const changes = {}
  const mudancas = []
  for (const d of divergencias || []) {
    if (igual(schedule?.[d.campo], d.para)) continue
    changes[d.campo] = d.para ?? null
    mudancas.push({ campo: d.campo, de: schedule?.[d.campo] ?? null, para: d.para ?? null })
  }
  return { changes, mudancas }
}
