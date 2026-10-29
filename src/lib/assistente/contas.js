// Assistente IA — que contas a IA pode usar ao GRAVAR (lançamento, agendamento, baixa, transferência).
// PURO (backend e testes). Imports com .js.
//
//   'gerencial' — subcontas "Ger." (mesmo critério de lib/integridade/regras.js ehSubcontaGer:
//                 type 'gerencial', is_gerencial ou nome "Ger. …"). São movimentadas só pelo
//                 Finup (classificação gerencial): a IA NUNCA grava nelas — nem sugere, nem aceita
//                 citada, nem como origem ou destino. Consulta (saldo) continua permitida.
//   'sugerivel' — a IA escolhe sozinha: cartões de crédito ativos com finalidade "Uso comum" e a
//                 Conta favorita ★ (is_main) do perfil ativo (sem perfil ativo: as favoritas visíveis).
//   'citar'     — todas as outras (reservas, patrimônio, investimento, financiamento, demais
//                 correntes, inativas): só se o pedido CITOU a conta (nome, apelido ou apelido
//                 aprendido em ia_apelidos); senão o campo volta vazio e a prévia pergunta.
// Reservas NÃO são gerenciais: transferir para uma reserva citada é permitido.
import { normalizarTermo } from './texto.js'

const limpo = (s) => normalizarTermo(s).replace(/[^a-z0-9]+/g, ' ').trim()

// O termo aparece no texto como palavra(s) inteira(s)? "Ger. Itaupers" ~ "no ger itaupers".
export function citado(texto, termo) {
  const t = limpo(termo)
  return t.length >= 2 && ` ${limpo(texto)} `.includes(` ${t} `)
}

export const ehSubcontaGerencial = (c) =>
  !!c && c.type !== 'credit' && (c.type === 'gerencial' || !!c.is_gerencial || /^Ger\. /.test(c.name || ''))

const usoComum = (c) => (c.vinculo_tipo || 'none') === 'none' && !c.is_reserva && !c.is_investimento && !c.conta_aplicacao

// rows: contas (snake_case, como vêm do banco) já recortadas pelos perfis do usuário.
export function papelDaConta(c, perfilAtivo = null) {
  if (ehSubcontaGerencial(c)) return 'gerencial'
  const ativa = c.active !== false
  if (ativa && c.type === 'credit' && usoComum(c)) return 'sugerivel'
  if (ativa && c.is_main && (!perfilAtivo || c.profile_id === perfilAtivo)) return 'sugerivel'
  return 'citar'
}

// Mesma regra para a conta do app (camelCase, lib/db.js) — seletor "em qual conta?" da prévia.
export const papelDaContaApp = (a, perfilAtivo = null) => papelDaConta({
  name: a.name, type: a.type, is_gerencial: a.isGerencial, vinculo_tipo: a.vinculoTipo, is_reserva: a.isReserva,
  is_investimento: a.isInvestimento, conta_aplicacao: a.contaAplicacao, is_main: a.isMain, profile_id: a.profileId, active: a.active,
}, perfilAtivo)

export const classificarContas = (rows, perfilAtivo = null) =>
  rows.map(c => ({ ...c, papel: papelDaConta(c, perfilAtivo) }))

// O pedido cita a conta? (nome, apelido ou termo de um apelido aprendido que aponta para ela)
export function contaCitada(c, texto, apelidos = []) {
  if (!c || !texto) return false
  if (citado(texto, c.name) || citado(texto, c.apelido)) return true
  return apelidos.some(a => a.tipo === 'conta' && a.ref_id === c.id && citado(texto, a.termo))
}

// Conta que o modelo escolheu para GRAVAR → { id, gerencial }. `destino`: transferência (só ativa).
export function contaParaGravar(ctx, id, { destino = false } = {}) {
  const c = id ? ctx.idx.contas.get(id) : null
  if (!c) return { id: null, gerencial: false }
  if (c.papel === 'gerencial') return { id: null, gerencial: true }
  if (destino && c.active === false) return { id: null, gerencial: false }
  if (c.papel === 'sugerivel' || contaCitada(c, ctx.textoPedido, ctx.apelidos)) return { id, gerencial: false }
  return { id: null, gerencial: false }
}

// Conta favorita ★ do perfil ativo (sem perfil ativo: nenhuma — a prévia pergunta).
export function favoritaDoPerfil(ctx) {
  if (!ctx.perfilAtivo) return null
  return [...ctx.idx.contas.values()].find(c => c.is_main && c.active !== false && c.papel !== 'gerencial' && c.profile_id === ctx.perfilAtivo) || null
}

// Sinal de compra no cartão no texto ("no cartão", "crédito", "final 4541").
export const temSinalDeCartao = (texto) => /\b(cartao|cartoes|credito|final \d{4})\b/.test(limpo(texto))

// ESCOLHA DA CONTA de origem (lançamento/agendamento) → { id, gerencial, confianca }:
//   • citou a conta (nome, apelido, apelido aprendido — ex.: "final 4541" aprendido numa correção)
//     → ela, confiança 1 (qualquer conta permitida, exceto gerencial);
//   • compra no cartão (sinal no texto ou foto) e o modelo escolheu um cartão sugerível → ele;
//   • senão → Conta favorita do perfil ativo com confiança baixa ("● confira"); sem perfil ativo
//     (Tudo) ou sem favorita → vazio, e a prévia pergunta entre as sugeríveis.
export const CONFIANCA_FAVORITA = 0.4
export function escolherConta(ctx, id, confiancaModelo = 0) {
  const r = contaParaGravar(ctx, id)
  if (r.gerencial) return { id: null, gerencial: true, confianca: 0 }
  const c = r.id ? ctx.idx.contas.get(r.id) : null
  if (c && contaCitada(c, ctx.textoPedido, ctx.apelidos)) return { id: c.id, gerencial: false, confianca: 1 }
  if (c && c.type === 'credit' && (ctx.temImagem || temSinalDeCartao(ctx.textoPedido))) return { id: c.id, gerencial: false, confianca: confiancaModelo }
  const fav = favoritaDoPerfil(ctx)
  return fav ? { id: fav.id, gerencial: false, confianca: CONFIANCA_FAVORITA } : { id: null, gerencial: false, confianca: 0 }
}

// O pedido cita uma subconta gerencial? (nome/apelido dela, "conta gerencial", "gerencial do <cartão>")
// → a conta, ou null. Rede de segurança: o modelo pode trocar "Ger. Itaupers" pelo cartão Itaupers.
export function gerencialCitada(ctx, texto) {
  if (!texto) return null
  const contas = [...ctx.idx.contas.values()]
  const gers = contas.filter(c => c.papel === 'gerencial')
  if (!gers.length) return null
  const direta = gers.find(c => contaCitada(c, texto, ctx.apelidos))
  if (direta) return direta
  const t = ` ${limpo(texto)} `
  if (/ (sub)?conta gerencial /.test(t)) return gers.length === 1 ? gers[0] : { id: null, name: null }
  for (const card of contas.filter(c => c.type === 'credit')) {
    for (const nome of [card.apelido, card.name].map(limpo).filter(n => n.length >= 2)) {
      if (new RegExp(` gerencial (do|da|de) (cartao )?${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `).test(t)) {
        return gers.find(g => limpo(g.name) === `ger ${limpo(card.apelido || card.name)}`) || gers[0]
      }
    }
  }
  return null
}

export const MENSAGEM_CONTA_GERENCIAL = (nome) =>
  `A conta ${nome ? `"${nome}" ` : ''}é gerencial: ela é movimentada automaticamente pela classificação gerencial do Finup. O assistente não lança nela — abra a conta para conferir.`
