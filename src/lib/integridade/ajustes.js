// Ajuste de pendências 'auto' do Motor de Integridade (antecipação da Etapa 3).
//
// Só estas regras têm ajuste por enquanto:
//   GER_ETAPA_A_FALTANDO → cria a etapa A com a MESMA lógica do "Executar Gerenciais"
//                          (lib/provisaoGerencial), id determinístico tx_gerA_<gasto>.
//   GER_ETAPA_A_VALOR    → alinha valor e fatura da etapa A existente ao gasto.
//
// Tudo puro: planeja sobre o estado atual (preview do modal) e aplica sobre o estado do updater —
// o plano é refeito ali, então clicar 2× (ou o React rodar o updater 2×) não duplica nada.
// Saldo NÃO é tocado aqui: quem aplica chama recalcularSaldo nas contas afetadas.

import { montarContexto, executarRegras, ymParaRef, rb } from './regras.js'
import { montarProvisaoGerencial } from '../provisaoGerencial.js'
import { ORIGIN } from '../origins.js'

export const REGRAS_AJUSTAVEIS = new Set(['GER_ETAPA_A_FALTANDO', 'GER_ETAPA_A_VALOR'])

export const podeAjustar = (p) =>
  !!p && p.severidade === 'auto' && p.status === 'pendente' && REGRAS_AJUSTAVEIS.has(p.regra)

const brl = (v) => `R$ ${Math.abs(rb(v)).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
const conta = (d, id) => {
  const a = d.accounts.find(x => x.id === id)
  return a ? `${a.name} (${a.id})` : id
}

// Plano de UMA pendência sobre o estado `d`: { ok: true, acao, tx, anterior?, accounts, texto, valor }
// ou { ok: false, motivo }. `accounts` só difere de d.accounts se a subconta Ger. precisar nascer.
export function planejarAjuste(d, pendencia, opcoes = {}) {
  if (!REGRAS_AJUSTAVEIS.has(pendencia?.regra)) return { ok: false, motivo: 'Regra sem ajuste automático nesta versão.' }
  const ctx = montarContexto(d, { desde: null, ...opcoes })
  const g = ctx.gastoById.get(pendencia.origem_id)
  if (!g) return { ok: false, motivo: 'O gasto não existe mais (ou deixou de ser despesa de cartão).' }
  if (g.classe !== 'G') return { ok: false, motivo: 'O gasto não é mais do Grupo G.' }
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
    contasAfetadas.add(plano.tx.accountId)
    contasAfetadas.add(plano.tx.toAccountId)
    aplicados.push({ pendenciaId: p.id, origem_id: p.origem_id, acao: plano.acao, txId: plano.tx.id, valor: rb(plano.tx.amount), texto: plano.texto })
  }
  return { nd, aplicados, ignorados, contasAfetadas: [...contasAfetadas] }
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
