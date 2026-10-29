// CONTROLE GERENCIAL OPCIONAL (chave por ambiente: configuracoes.controle_gerencial).
// Desligado, nenhum item NOVO recebe grupo gerencial — e é só o grupo gravado que faz o motor
// (applyEnsureGerencial / reconcileFaturaState, protegidas e intocadas) criar subconta, etapa A,
// devolução ou provisão. O controle fica nos PONTOS DE ENTRADA (formulários, importação, Executar
// Gerenciais), nunca no motor. O histórico não é apagado: o grupo gravado fica; só some da tela.
// PURO (sem React). Imports com .js.
import { computeOccurrences } from './occurrences.js'

// null/undefined (banco ainda sem a coluna) = comportamento de sempre: ligado.
export const controleGerencialAtivo = (settings) => settings?.controleGerencial !== false

// Grupo que gera automação: G (number 1) ou numerado. 'D' (Despesa) e vazio não geram nada.
export function grupoEhGerencial(grupoId, gerencialGroups = []) {
  if (!grupoId) return false
  const g = gerencialGroups.find(x => x.id === grupoId)
  return !!g && g.number !== 'D'
}

// Grupo a gravar num lançamento/agendamento quando o bloco "Classificação gerencial" está
// escondido pela chave: edição mantém o que já estava gravado; item novo não ganha grupo.
export const grupoComChaveDesligada = (initial) => (initial?.id ? (initial.grupoGerencial ?? null) : null)

// Edição com a chave desligada de item que já tem grupo gerencial: valor, data e conta/cartão
// travados (mudá-los moveria a etapa A / devolução já gerada). → mensagem ou null.
export const MSG_TRAVA_GERENCIAL = 'Lançamento do controle gerencial. Para alterar valor, data ou conta, ligue o controle gerencial em Configurações.'
export function travaGerencial(initial, { ativo, gerencialGroups }) {
  if (ativo || !initial?.id) return null
  return grupoEhGerencial(initial.grupoGerencial, gerencialGroups) ? MSG_TRAVA_GERENCIAL : null
}

// Agendamento ligado ao gerencial: devolução/resgate do motor, provisão gerencial ou com grupo
// gerencial gravado.
export function agendamentoGerencial(s, gerencialGroups = [], subcontaIds = new Set()) {
  if (!s) return false
  if (s.tipo === 'gerencial_devolucao' || s.tipo === 'resgate_reserva') return true
  if (s.isProvisao && grupoEhGerencial(s.grupoGerencial, gerencialGroups)) return true
  if (subcontaIds.has(s.accountId) || subcontaIds.has(s.toAccountId)) return true
  return grupoEhGerencial(s.grupoGerencial, gerencialGroups)
}

// Pode desligar? → { contas: [{ conta, saldo }], agendamentos: [{ agendamento, vencimento, valor }] }
// (vazios = pode). saldoDe(conta): o saldo da conta pela MESMA lógica do app (quem chama passa).
// Subconta gerencial: marcação (type 'gerencial' / isGerencial).
export function impedimentosDesligar({ accounts = [], schedules = [], gerencialGroups = [], saldoDe, ocorrencias = computeOccurrences }) {
  const subcontas = accounts.filter(a => a.type !== 'credit' && (a.type === 'gerencial' || a.isGerencial))
  const contas = subcontas
    .map(conta => ({ conta, saldo: Math.round((Number(saldoDe(conta)) || 0) * 100) / 100 }))
    .filter(x => Math.abs(x.saldo) >= 0.005)
  const ids = new Set(subcontas.map(a => a.id))
  const agendamentos = []
  for (const s of schedules) {
    if (s.active === false || !agendamentoGerencial(s, gerencialGroups, ids)) continue
    const prox = (ocorrencias(s, 1) || [])[0] // data da próxima ocorrência PENDENTE
    if (!prox) continue
    const ov = s.overrides?.[prox]
    agendamentos.push({ agendamento: s, vencimento: ov?.date || prox, valor: Number(ov?.amount ?? s.amount) || 0 })
  }
  return { contas, agendamentos }
}

export const subcontasGerenciais = (accounts = []) =>
  accounts.filter(a => a.type !== 'credit' && (a.type === 'gerencial' || a.isGerencial))
