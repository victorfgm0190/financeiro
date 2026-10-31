// Assistente IA — lote de lançamentos (src/lib/assistente/lote.js), parte do APP: o que impede a
// gravação direta de um item ("Salvar selecionados") e o lançamento gravado direto. PURO.
import { camposParaConferir, ROTULO_CAMPO } from '../assistente'
import { parecidosNaCriacao } from '../casamentoFatura'
import { agendamentosDoLancamento, agendamentosParecidos, favorecidosParecidos } from './agendamentoDoLancamento'

// ─── App: pendências e gravação direta ────────────────────────────────────────────────────────────
// Motivos que exigem revisar o item na prévia normal (o "Salvar selecionados" não grava). Campo com
// dúvida aparece pelo nome (rotuloConferir: "categoria", "data", "valor"…).
export const rotuloConferir = (campo) => ROTULO_CAMPO[campo] || campo
export const MOTIVOS = {
  conta: 'falta a conta',
  duplicado: 'possível duplicado',
  agendamento: 'bate com agendamento',
  agendamentoParecido: 'parecido com agendamento',
  favorecido: 'favorecido',
  cartao: 'em qual cartão?',
  parcelado: 'parcelado',
  moeda: 'compra em dólar',
  transferencia: 'transferência',
  agendamentoNovo: 'agendamento',
  gerencial: 'grupo gerencial',
  reserva: 'reserva',
  fatura: 'fatura de referência',
  repetir: 'repetir',
}

// Sugestão do item com a conta escolhida na lista (vale como citada).
export function sugestaoComConta(sugestao, contaId) {
  if (!contaId || sugestao.conta_id) return sugestao
  return { ...sugestao, conta_id: contaId, confianca: { ...(sugestao.confianca || {}), conta: 1 } }
}

const TIPO = { despesa: 'expense', receita: 'income', transferencia: 'transfer' }

// item: { ferramenta, sugestao } (sugestao já com a conta da lista). ctx: dados do app.
export function pendenciasDoItem(item, ctx) {
  const { ferramenta } = item
  const p = item.sugestao
  const out = []
  if (ferramenta === 'criar_agendamento') return [MOTIVOS.agendamentoNovo]
  if (p.pergunta_cartao) out.push(MOTIVOS.cartao)
  if (!p.conta_id) out.push(MOTIVOS.conta)
  if (p.tipo === 'transferencia') out.push(MOTIVOS.transferencia)
  if (Number(p.parcelas) > 1) out.push(MOTIVOS.parcelado)
  if (p.moeda && p.moeda !== 'BRL') out.push(MOTIVOS.moeda)
  // A conta aparece e se troca na própria lista: não conta como campo a conferir.
  for (const c of camposParaConferir(ferramenta, p)) if (c !== 'accountId') out.push(rotuloConferir(c))
  if (!p.conta_id || out.includes(MOTIVOS.moeda)) return [...new Set(out)]
  const lanc = { type: TIPO[p.tipo] || 'expense', amount: Number(p.valor), date: p.data, accountId: p.conta_id, payee: p.favorecido_id || p.favorecido_novo || '', description: p.descricao || '' }
  const conta = (ctx.accounts || []).find(a => a.id === p.conta_id)
  if (parecidosNaCriacao(lanc, { transactions: ctx.transactions, preLancamentos: ctx.preLancamentos || [], closingDay: conta?.closingDay || 14 }).length) out.push(MOTIVOS.duplicado)
  if (ctx.getNextOccurrences && agendamentosDoLancamento(lanc, ctx).length) out.push(MOTIVOS.agendamento)
  else if (ctx.getNextOccurrences && agendamentosParecidos(lanc, ctx).length) out.push(MOTIVOS.agendamentoParecido)
  // Só sugestão: favorecido cadastrado parecido com o nome que veio → revisar ("Usar?" na prévia).
  if (favorecidosParecidos(p, ctx.payees || []).length) out.push(MOTIVOS.favorecido)
  const cartaoDespesa = conta?.type === 'credit' && lanc.type === 'expense'
  if (cartaoDespesa && grupoGeridoDaCategoria(p.categoria_id, ctx)) out.push(MOTIVOS.gerencial)
  // Instruções do pedido que só o formulário aplica (lib/assistente/camposDoPedido.js): revisão.
  if (cartaoDespesa && ctx.gerencialLigado !== false && p.grupo_gerencial_id && grupoGerido(p.grupo_gerencial_id, ctx)) out.push(MOTIVOS.gerencial)
  if (lanc.type === 'expense' && (p.reserva_conta_id || p.reserva_funcao_id)) out.push(MOTIVOS.reserva)
  if (cartaoDespesa && p.fatura) out.push(MOTIVOS.fatura)
  if (p.repetir) out.push(MOTIVOS.repetir)
  return [...new Set(out)]
}

// Cartão com controle gerencial ligado: a categoria pode levar a um grupo gerido (1 ou numerado),
// que passa pelo motor da fatura no formulário — fica para a revisão.
function grupoGeridoDaCategoria(categoriaId, ctx) {
  if (ctx.gerencialLigado === false) return false
  const cat = (ctx.categories || []).find(c => c.id === categoriaId)
  return cat?.defaultGerencialGroup ? grupoGerido(cat.defaultGerencialGroup, ctx) : false
}
const grupoGerido = (grupoId, ctx) => {
  const g = (ctx.gerencialGroups || []).find(x => x.id === grupoId)
  return !!g && g.number !== 'D'
}

// Gravação direta (só item SEM pendência: despesa/receita simples) — os mesmos campos do formulário.
export function lancamentoDireto(sugestao, { accounts = [], gerencialGroups = [], gerencialLigado = true } = {}) {
  const p = sugestao
  const conta = accounts.find(a => a.id === p.conta_id)
  const type = TIPO[p.tipo] || 'expense'
  const cartaoGerencial = conta?.type === 'credit' && type === 'expense' && gerencialLigado
  return {
    type, accountId: p.conta_id, amount: Math.round(Number(p.valor) * 100) / 100, date: p.data,
    description: p.descricao || p.favorecido_novo || '', payee: p.favorecido_id || p.favorecido_novo || '',
    categoryId: p.categoria_id || '', costCenter: p.centro_custo_id || '', accountType: conta?.type,
    ...(p.tipo_documento_id ? { tipoDocumentoId: p.tipo_documento_id } : {}),
    ...(p.observacoes ? { notes: p.observacoes } : {}),
    ...(cartaoGerencial ? { grupoGerencial: gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D' } : {}),
  }
}

// Linha da lista: rótulo curto do tipo.
export const rotuloTipo = (p, ferramenta) => (ferramenta === 'criar_agendamento' ? 'Agendamento' : { despesa: 'Despesa', receita: 'Receita', transferencia: 'Transferência' }[p.tipo] || 'Lançamento')
