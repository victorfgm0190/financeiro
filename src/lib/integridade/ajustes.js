// Correção ("Corrigir" / "Corrigir todas") de pendências do Motor de Integridade.
//
// Só estas regras têm correção por enquanto:
//   PARCELA_SEM_VINCULO  → religa a parcela à série: serie_id, installment_num/total e o "N/M" da
//                          descrição (installment_key deriva deles no txToRow, no mesmo padrão das
//                          irmãs). Não mexe em valor, data, fatura nem saldo. 'auto' com uma opção;
//                          'aprovar' exige a opção escolhida (pendencia.opcao).
//   GER_ETAPA_A_FALTANDO → cria a etapa A com a MESMA lógica do "Executar Gerenciais"
//                          (lib/provisaoGerencial), id determinístico tx_gerA_<gasto>.
//   GER_ETAPA_A_VALOR    → alinha valor e fatura da etapa A existente ao gasto.
//
// "Corrigir todas" aplica na ordem de ORDEM_CORRECAO: primeiro religa parcelas (as séries passam a
// ser avaliadas já religadas), depois as etapas A.
//
// Tudo puro: planeja sobre o estado atual (preview do modal) e aplica sobre o estado do updater —
// o plano é refeito ali, então clicar 2× (ou o React rodar o updater 2×) não duplica nada.
// Saldo NÃO é tocado aqui: quem aplica chama recalcularSaldo nas contas afetadas.

import { montarContexto, executarRegras, ymParaRef, rb, opcoesDeVinculo } from './regras.js'
import { montarProvisaoGerencial } from '../provisaoGerencial.js'
import { ORIGIN } from '../origins.js'
import { detectInstallment, installmentKey } from '../installments.js'

export const ORDEM_CORRECAO = ['PARCELA_SEM_VINCULO', 'GER_ETAPA_A_FALTANDO', 'GER_ETAPA_A_VALOR']
export const REGRAS_AJUSTAVEIS = new Set(ORDEM_CORRECAO)

const opcoesDa = (p) => p?.esperado?.opcoes || []
// Botão "Corrigir" no item: automática, ou PARCELA_SEM_VINCULO com opções para escolher.
export const podeAjustar = (p) =>
  !!p && p.status === 'pendente' && REGRAS_AJUSTAVEIS.has(p.regra) &&
  (p.severidade === 'auto' || (p.regra === 'PARCELA_SEM_VINCULO' && opcoesDa(p).length > 0))
// Entra no "Corrigir todas": só as automáticas.
export const podeCorrigirSozinho = (p) => podeAjustar(p) && p.severidade === 'auto'
export const precisaEscolher = (p) => podeAjustar(p) && p.severidade !== 'auto'

export const ordenarParaCorrecao = (pendencias) =>
  [...pendencias].sort((a, b) => ORDEM_CORRECAO.indexOf(a.regra) - ORDEM_CORRECAO.indexOf(b.regra))

// Mesma chave que txToRow grava (src/lib/db.js) — base do índice único uq_lancamentos_installment.
const chaveDoTx = (t) => installmentKey({
  accountId: t.accountId, description: t.description, installmentNum: t.installmentNum,
  installmentTotal: t.installmentTotal, amount: t.amount, faturaMonthYear: t.faturaMonthYear,
  date: t.date, installmentOccurrence: t.installmentOccurrence,
})

// Troca o "N/M" da descrição pelo número religado, mantendo a largura ("01/04" → "02/04").
function descricaoComNumero(description, num, total) {
  const det = detectInstallment(description || '')
  if (!det || (det.num === num && det.total === total)) return description
  const largura = det.matchStr.split('/')[0].length
  return description.replace(det.matchStr, `${String(num).padStart(largura, '0')}/${total}`)
}

function planejarReligar(d, pendencia, opcoes) {
  const tx = d.transactions.find(t => t.id === pendencia.origem_id)
  if (!tx) return { ok: false, motivo: 'O lançamento não existe mais.' }
  if (tx.serieId) return { ok: false, motivo: `O lançamento já está na série ${tx.serieId}.` }
  const ctx = montarContexto(d, { desde: null, ...opcoes })
  const v = opcoesDeVinculo(ctx, tx.id)
  if (!v || !v.opcoes.length) return { ok: false, motivo: 'Nenhuma série candidata para religar.' }
  const escolhida = pendencia.opcao
    ? v.opcoes.find(o => o.id === pendencia.opcao)
    : (v.automatica ? v.opcoes[0] : null)
  if (!escolhida) {
    return { ok: false, motivo: pendencia.opcao ? 'A opção escolhida não vale mais (a série mudou).' : 'Escolha uma das opções.' }
  }
  const novo = {
    ...tx, serieId: escolhida.serie_id, installmentNum: escolhida.num, installmentTotal: escolhida.total,
    description: descricaoComNumero(tx.description, escolhida.num, escolhida.total),
  }
  const chave = chaveDoTx(novo)
  const ocupante = chave && d.transactions.find(t => t.id !== tx.id && chaveDoTx(t) === chave)
  if (ocupante) {
    return { ok: false, motivo: `A chave ${chave} já pertence ao lançamento ${ocupante.id} (índice uq_lancamentos_installment) — nada foi gravado.` }
  }
  const mudouDescricao = novo.description !== tx.description
  return {
    ok: true, acao: 'religar', regra: pendencia.regra, pendenciaId: pendencia.id, gastoId: tx.id,
    tx: novo, anterior: tx, accounts: d.accounts, valor: 0, semEfeitoEmSaldo: true,
    texto: `Religar "${tx.description}" (${brl(tx.amount)}, fatura ${ymParaRef(v.item.fatura)}) como ` +
      `${escolhida.num}/${escolhida.total} da série ${escolhida.serie_id}` +
      (mudouDescricao ? ` — descrição passa a "${novo.description}"` : '') + ` — chave ${chave}`,
  }
}

const brl = (v) => `R$ ${Math.abs(rb(v)).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const conta = (d, id) => {
  const a = d.accounts.find(x => x.id === id)
  return a ? `${a.name} (${a.id})` : id
}

// Plano de UMA pendência sobre o estado `d`: { ok: true, acao, tx, anterior?, accounts, texto, valor }
// ou { ok: false, motivo }. `accounts` só difere de d.accounts se a subconta Ger. precisar nascer.
export function planejarAjuste(d, pendencia, opcoes = {}) {
  if (!REGRAS_AJUSTAVEIS.has(pendencia?.regra)) return { ok: false, motivo: 'Regra sem ajuste automático nesta versão.' }
  if (pendencia.regra === 'PARCELA_SEM_VINCULO') return planejarReligar(d, pendencia, opcoes)
  const ctx = montarContexto(d, { desde: null, ...opcoes })
  const g = ctx.gastoById.get(pendencia.origem_id)
  if (!g) return { ok: false, motivo: 'O gasto não existe mais (ou deixou de ser despesa de cartão).' }
  if (g.classe !== 'G') return { ok: false, motivo: 'O gasto não é mais do Grupo G.' }
  if (ctx.fechada(g.card.id, g.fatura)) return { ok: false, motivo: `A fatura ${ymParaRef(g.fatura)} está fechada — faturas fechadas não são avaliadas.` }
  const etapas = ctx.etapasPorGasto.get(g.tx.id) || []
  const fatura = ymParaRef(g.fatura)

  if (pendencia.regra === 'GER_ETAPA_A_FALTANDO') {
    if (etapas.length) return { ok: false, motivo: `O gasto já tem etapa A (${etapas.map(e => e.tx.id).join(', ')}).` }
    const prov = montarProvisaoGerencial(d, g.tx, {
      id: `tx_gerA_${g.tx.id}`, origin: ORIGIN.ETAPA_A, faturaRef: fatura, agora: opcoes.agora,
    })
    if (!prov) return { ok: false, motivo: 'Sem Grupo G ou sem conta principal configurada.' }
    const para = prov.accounts.find(a => a.id === prov.tx.toAccountId)
    return {
      ok: true, acao: 'criar', regra: pendencia.regra, pendenciaId: pendencia.id, gastoId: g.tx.id,
      tx: prov.tx, accounts: prov.accounts, valor: rb(prov.tx.amount),
      texto: `Criar transferência ${brl(prov.tx.amount)} — ${conta(d, prov.tx.accountId)} → ` +
        `${para.name} (${prov.subcontaCriada ? 'subconta será criada' : para.id}), fatura ${fatura}, ` +
        `data ${prov.tx.date}, id ${prov.tx.id}`,
    }
  }

  // GER_ETAPA_A_VALOR
  if (etapas.length !== 1) return { ok: false, motivo: `O gasto tem ${etapas.length} etapas A — ajuste só com exatamente uma.` }
  const e = etapas[0].tx
  const tx = { ...e, amount: g.tx.amount, faturaRef: fatura }
  if (rb(e.amount) === rb(tx.amount) && e.faturaRef === tx.faturaRef) return { ok: false, motivo: 'A etapa A já está com o valor e a fatura do gasto.' }
  return {
    ok: true, acao: 'atualizar', regra: pendencia.regra, pendenciaId: pendencia.id, gastoId: g.tx.id,
    tx, anterior: e, accounts: d.accounts, valor: rb(rb(tx.amount) - rb(e.amount)),
    texto: `Atualizar transferência ${e.id}: ${brl(e.amount)} (fatura ${e.faturaRef || '—'}) → ` +
      `${brl(tx.amount)} (fatura ${fatura}) — ${conta(d, e.accountId)} → ${conta(d, e.toAccountId)}`,
  }
}

// Aplica uma lista de pendências sobre `d`, replanejando cada uma sobre o estado já ajustado.
// Devolve { nd, aplicados, ignorados, contasAfetadas }.
export function aplicarAjustes(d, pendencias, opcoes = {}) {
  let nd = d
  const aplicados = []
  const ignorados = []
  const contasAfetadas = new Set()
  for (const p of pendencias) {
    const plano = planejarAjuste(nd, p, opcoes)
    if (!plano.ok) { ignorados.push({ pendenciaId: p.id, origem_id: p.origem_id, motivo: plano.motivo }); continue }
    const transactions = plano.acao === 'criar'
      ? [...nd.transactions, plano.tx]
      : nd.transactions.map(t => t.id === plano.tx.id ? plano.tx : t)
    nd = { ...nd, accounts: plano.accounts, transactions }
    // Religar parcela não muda valor nem conta: nenhum saldo a recalcular.
    if (!plano.semEfeitoEmSaldo) {
      contasAfetadas.add(plano.tx.accountId)
      contasAfetadas.add(plano.tx.toAccountId)
    }
    aplicados.push({ pendenciaId: p.id, origem_id: p.origem_id, acao: plano.acao, txId: plano.tx.id, valor: rb(plano.tx.amount), texto: plano.texto })
  }
  return { nd, aplicados, ignorados, contasAfetadas: [...contasAfetadas].filter(Boolean) }
}

// Prévia do modal na MESMA sequência da execução: cada item planejado sobre o estado já corrigido
// pelos anteriores (a etapa A de uma parcela religada enxerga a série religada). Item que exige
// escolha e ainda não tem pendencia.opcao fica sem plano.
export function previaDeCorrecao(d, pendencias, opcoes = {}) {
  let nd = d
  return pendencias.map(p => {
    const escolher = precisaEscolher(p)
    if (escolher && !p.opcao) return { p, escolher, plano: null }
    const plano = planejarAjuste(nd, p, opcoes)
    if (plano.ok) nd = aplicarAjustes(nd, [p], opcoes).nd
    return { p, escolher, plano }
  })
}

// "Varredura só deste item": roda a regra da pendência sobre o estado ajustado e diz, por pendência,
// se a divergência sumiu. Se não sumiu, devolve a descrição atual dela como motivo.
export function verificarPendencias(d, pendencias, opcoes = {}) {
  const regras = [...new Set(pendencias.map(p => p.regra))]
  const atuais = new Map(executarRegras(d, { desde: null, ...opcoes, regras }).map(x => [`${x.regra}|${x.origem_id}`, x]))
  return pendencias.map(p => {
    const ainda = atuais.get(`${p.regra}|${p.origem_id}`)
    return { pendenciaId: p.id, regra: p.regra, origem_id: p.origem_id, resolvida: !ainda, motivo: ainda?.descricao || null }
  })
}
