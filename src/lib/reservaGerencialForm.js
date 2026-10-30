// Formulário de lançamento (30/10): "Será pago com reserva" e "Classificação gerencial" são a mesma
// pergunta numa despesa de CARTÃO. A conta de reserva que é conta-origem (defaultAccountId) de um
// grupo gerencial numerado define o grupo; o grupo cuja conta-origem é de reserva liga a reserva.
// O motor (reconcileFaturaState/applyEnsureGerencial) lê só grupo + reservaFuncaoId — por isso o
// cartão grava o grupo da reserva, nunca reserva_conta_id. Conta de reserva sem grupo: resgate
// avulso, como antes. PURO: recebe o estado do formulário e devolve o novo; sem nomes fixos.
import { funcaoUnicaDaConta } from './funcaoReserva.js'

const ehContaReserva = (a) => !!a && (a.isReserva || a.vinculoTipo === 'reserva')
const ehNumerado = (g) => !!g && typeof g.number === 'number' && g.number !== 1

// Grupo numerado (≠1) cuja conta-origem é esta conta, ou null.
export function grupoDaContaReserva(contaId, gerencialGroups) {
  if (!contaId) return null
  return (gerencialGroups || []).find(g => ehNumerado(g) && g.defaultAccountId === contaId)?.id || null
}

// Conta de RESERVA que é a conta-origem do grupo, ou null (grupo D/1, sem conta ou conta comum).
export function contaReservaDoGrupoGerencial(grupoId, { gerencialGroups, accounts }) {
  const g = (gerencialGroups || []).find(x => x.id === grupoId)
  if (!ehNumerado(g) || !g.defaultAccountId) return null
  return ehContaReserva((accounts || []).find(a => a.id === g.defaultAccountId)) ? g.defaultAccountId : null
}

// Função ao trocar de conta de reserva: a atual se for da conta; senão a última escolhida nessa
// conta (memo: { [contaId]: funcaoId }); senão a única da conta; senão vazio (o usuário escolhe).
export function funcaoParaConta(funcaoAtual, contaId, { reserveFunctions, memo } = {}) {
  const daConta = (id) => !!id && (reserveFunctions || []).some(f => f.id === id && f.accountId === contaId)
  if (daConta(funcaoAtual)) return funcaoAtual
  if (daConta(memo?.[contaId])) return memo[contaId]
  return funcaoUnicaDaConta(contaId, reserveFunctions) || ''
}

// ctx: { cartao (bloco gerencial ativo), gerencialGroups, accounts, reserveFunctions, memo, defaultGrupoId }
const grupoVeioDaReserva = (f, ctx) => !!contaReservaDoGrupoGerencial(f.grupoGerencial, ctx)

export function escolherContaReserva(f, contaId, ctx) {
  const funcao = funcaoParaConta(f.reservaFuncaoId, contaId, ctx)
  const prox = { ...f, useReserva: true, reservaAccountId: contaId, reservaFuncaoId: funcao }
  if (!ctx.cartao) return prox
  const g = grupoDaContaReserva(contaId, ctx.gerencialGroups)
  if (g) prox.grupoGerencial = g
  // Saiu de uma reserva com grupo para uma sem grupo: a classificação era a da reserva → D.
  else if (grupoVeioDaReserva(f, ctx)) prox.grupoGerencial = ctx.defaultGrupoId
  return prox
}

export function desligarReserva(f, ctx) {
  return {
    ...f, useReserva: false, reservaAccountId: '', reservaFuncaoId: '',
    ...(ctx.cartao && grupoVeioDaReserva(f, ctx) ? { grupoGerencial: ctx.defaultGrupoId } : {}),
  }
}

// Classificação escolhida lá embaixo. Grupo de conta de reserva → liga a reserva com essa conta
// (pede só a função). Outro grupo numerado (conta comum, ex. "Imperium") desliga a reserva, como
// antes (o motor gera o resgate pela conta-origem). D/1 mantêm a reserva sem grupo, se houver.
export function escolherGrupo(f, grupoId, ctx) {
  const conta = contaReservaDoGrupoGerencial(grupoId, ctx)
  if (conta) return escolherContaReserva({ ...f, grupoGerencial: grupoId }, conta, ctx)
  const g = (ctx.gerencialGroups || []).find(x => x.id === grupoId)
  const reservaComGrupo = f.useReserva && !!grupoDaContaReserva(f.reservaAccountId, ctx.gerencialGroups)
  if (f.useReserva && (ehNumerado(g) || reservaComGrupo)) return { ...desligarReserva(f, { ...ctx, cartao: false }), grupoGerencial: grupoId }
  return { ...f, grupoGerencial: grupoId }
}

// Classificação "definida pela reserva" (travada): cartão, reserva ligada e o grupo do formulário
// É o da conta de reserva. Lançamento antigo divergente não trava (ver divergenciaReserva).
export function grupoTravadoPelaReserva(f, ctx) {
  if (!ctx.cartao || !f.useReserva) return null
  const g = grupoDaContaReserva(f.reservaAccountId, ctx.gerencialGroups)
  return g && g === f.grupoGerencial ? g : null
}

// Despesa de cartão com grupo e reserva que não batem (lançamento antigo): texto do aviso ou null.
// Nada é corrigido ao abrir; o usuário acerta escolhendo a reserva/função.
export function divergenciaReserva(f, ctx) {
  if (!ctx.cartao) return null
  const nome = (id) => { const a = (ctx.accounts || []).find(x => x.id === id); return a?.apelido || a?.name || 'outra conta' }
  const contaGrupo = (ctx.gerencialGroups || []).find(g => g.id === f.grupoGerencial)?.defaultAccountId
  const fn = f.reservaFuncaoId ? (ctx.reserveFunctions || []).find(x => x.id === f.reservaFuncaoId) : null
  if (fn && contaGrupo && ehNumerado((ctx.gerencialGroups || []).find(g => g.id === f.grupoGerencial)) && fn.accountId !== contaGrupo) {
    return `A função "${fn.name}" é de ${nome(fn.accountId)}, mas a classificação é de ${nome(contaGrupo)}. Nada foi alterado: escolha a função (ou a reserva) certa antes de salvar.`
  }
  const gReserva = f.useReserva ? grupoDaContaReserva(f.reservaAccountId, ctx.gerencialGroups) : null
  if (gReserva && gReserva !== f.grupoGerencial) {
    return `A reserva ${nome(f.reservaAccountId)} tem classificação própria, diferente da gravada. Nada foi alterado: escolha a classificação ou a reserva certa antes de salvar.`
  }
  return null
}

// Estado inicial da reserva no formulário: vínculo gravado (reservaContaId/resgate avulso) ou, no
// cartão, a conta de reserva do grupo gravado. Função única só em lançamento NOVO (a edição abre
// como está gravada).
export function reservaInicial({ contaVinculada, grupoGerencial, reservaFuncaoId, novo }, ctx) {
  const conta = contaVinculada || (ctx.cartao ? contaReservaDoGrupoGerencial(grupoGerencial, ctx) : null)
  if (!conta) return { useReserva: false, reservaAccountId: '', reservaFuncaoId: reservaFuncaoId || '' }
  return {
    useReserva: true, reservaAccountId: conta,
    reservaFuncaoId: reservaFuncaoId || (novo ? (funcaoUnicaDaConta(conta, ctx.reserveFunctions) || '') : ''),
  }
}
