// COMPOSIÇÃO DO BOLETO NA PARCELA DE CONDOMÍNIO ABERTA — funções puras.
// O boleto costuma chegar antes do pagamento: os itens são informados na PARCELA pendente
// (schedule.composicao, com `informada: true`). O valor pendente passa a ser o total do boleto e os
// itens do proprietário viram um crédito 'previsto' (origem_agendamento_id = a parcela), que já
// abate no aluguel de destino pela regra do contrato. No pagamento o crédito vira 'aberto' (o MESMO
// crédito: nada duplica) e a composição vai para o lançamento. Séries/previsões das próximas
// parcelas seguem a regra de sempre (lib/contratos/condominio.js); a parcela informada não é
// sobrescrita por elas (valorManual).
import { occEfetiva } from '../fluxoCaixa.js'
import { ehParcelaGerada, parcelaPaga, r2 } from './parcelas.js'
import { RESP, composicaoCondominio, itemDiferenca } from './composicao.js'
import { DESC_PREVISTO } from './condominio.js'
import { destinosCreditos, composicaoComCreditos, distribuirCreditos, aluguelPendentes } from './creditos.js'

export const vencimentoParcela = (s) => occEfetiva(s, s.startDate).date

// Parcela de condomínio gerada pelo contrato e ainda não paga.
export const ehCondominioAberto = (s, contrato) => !!s && !!contrato && ehParcelaGerada(s, contrato.id)
  && s.contratoPapel === 'condominio' && !parcelaPaga(s) && !(s.skipped || []).includes(s.startDate)

export const temComposicaoInformada = (s) => s?.composicao?.tipo === 'condominio' && !!s.composicao.informada

// Composição gravada na parcela (sem o `informada`, é a mesma que vai ao lançamento no pagamento).
export function composicaoDaParcela(itens) {
  return { ...composicaoCondominio(itens), informada: true }
}

// Mudanças na parcela ao informar o boleto. O total vira o valor pendente; um valor de ocorrência
// (overrides[data].amount) sairia na frente do total — por isso some (a data, se houver, fica).
export function planoInformarParcela(parcela, composicao) {
  const ov = parcela.overrides?.[parcela.startDate]
  const changes = {
    amount: r2(composicao.total), valorStatus: 'confirmado',
    composicao: {
      ...composicao, informada: true,
      ...(parcela.composicao?.numero != null ? { numero: parcela.composicao.numero } : {}),
      ...(parcela.composicao?.total_parcelas !== undefined ? { total_parcelas: parcela.composicao.total_parcelas } : {}),
    },
  }
  if (ov && typeof ov === 'object' && ov.amount != null) {
    const { amount: _a, ...resto } = ov // eslint-disable-line no-unused-vars
    changes.overrides = { ...parcela.overrides, [parcela.startDate]: resto }
  }
  return changes
}

// "Remover composição": a parcela volta ao condomínio previsto (o valor que a regra de sempre dá).
export function planoRemoverComposicao(parcela, valorPrevisto) {
  const v = r2(valorPrevisto)
  return {
    amount: v,
    composicao: {
      itens: [{ tipo: 'previsto', desc: DESC_PREVISTO, valor: v }], total: v,
      ...(parcela.composicao?.numero != null ? { numero: parcela.composicao.numero } : {}),
      ...(parcela.composicao?.total_parcelas !== undefined ? { total_parcelas: parcela.composicao.total_parcelas } : {}),
    },
  }
}

const ddmm = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : '')

// Itens do proprietário → dados do crédito previsto (sem lançamento; data = vencimento da parcela).
export function creditoPrevistoDaParcela(composicao, { contratoId, parcela }) {
  const itens = (composicao?.itens || []).filter(i => i.responsavel === RESP.PROPRIETARIO && Number(i.valor) > 0)
  const valor = r2(itens.reduce((a, i) => a + Number(i.valor), 0))
  if (!(valor > 0)) return null
  const data = vencimentoParcela(parcela)
  return {
    contrato_id: contratoId, origem_lancamento_id: null, origem_agendamento_id: parcela.id,
    itens: itens.map(i => ({ desc: i.desc, valor: r2(i.valor) })), descricao: `Condomínio ${ddmm(data)}`,
    valor, data_origem: data, status: 'previsto',
  }
}

// O crédito ligado a uma parcela de condomínio (no máximo um): pela parcela de origem ou pelo
// lançamento que a pagou.
export function creditoDaParcela(creditos, parcelaId, txId = null) {
  return (creditos || []).find(c => (txId && c.origem_lancamento_id === txId))
    || (creditos || []).find(c => parcelaId && c.origem_agendamento_id === parcelaId) || null
}

// O que fazer com o crédito da parcela quando a composição muda (informar, editar ou remover).
//   atual: crédito existente (ou null); novo: dados do crédito pela composição nova (ou null).
// → { acao: 'nada' | 'criar' | 'atualizar' | 'remover' | 'conflito', ... }
//   conflito: o crédito já foi ABATIDO num aluguel pago e o valor muda (ou some) — o usuário decide.
export function planoCreditoDaParcela({ atual, novo }) {
  if (!atual && !novo) return { acao: 'nada' }
  if (!atual) return { acao: 'criar', dados: novo }
  if (atual.status === 'compensado') {
    if (novo && r2(novo.valor) === r2(atual.valor)) return { acao: 'atualizar', id: atual.id, dados: { itens: novo.itens } }
    return { acao: 'conflito', id: atual.id, abatido: r2(atual.valor), novo: r2(novo?.valor || 0) }
  }
  if (!novo) return { acao: 'remover', id: atual.id }
  return { acao: 'atualizar', id: atual.id, dados: { itens: novo.itens, valor: novo.valor, descricao: novo.descricao } }
}

// Pagamento de parcela com boleto informado. Valor pago = total: a composição informada vai inteira
// ao lançamento. Diferente: com tela, pergunta (prévia com os itens informados); sem tela
// (auto-registro), a diferença vira "Diferença/arredondamento" do inquilino.
// → { composicao, pedir }
export function composicaoNoPagamento(parcela, valorPago, { auto = false } = {}) {
  const c = parcela?.composicao
  if (!temComposicaoInformada(parcela)) return null
  const itens = (c.itens || []).map(({ desc, valor, responsavel, regra, so_neste_boleto: unico }) =>
    ({ desc, valor, responsavel, ...(regra ? { regra } : {}), ...(unico ? { so_neste_boleto: true } : {}) }))
  const dif = r2(Number(valorPago) - r2(c.total))
  if (Math.abs(dif) < 0.005) return { composicao: composicaoCondominio(itens), pedir: false }
  if (!auto) return { composicao: null, itensIniciais: itens, pedir: true }
  return { composicao: composicaoCondominio([...itens, itemDiferenca(dif)]), pedir: false }
}

// Prévia: em qual aluguel o crédito previsto entra e como fica o valor dele.
// → { parcela, antes, depois } | null
export function previaDoAbatimento(contrato, schedules, creditos, creditoNovo, { substituirId = null } = {}) {
  if (!creditoNovo || !contrato) return null
  const provisorio = { ...creditoNovo, id: substituirId || '__previa__', contrato_id: contrato.id }
  const lista = [...(creditos || []).filter(c => c.id !== provisorio.id), provisorio]
  const d = destinosCreditos(contrato, schedules, lista).get(provisorio.id)
  if (!d || d.bloqueado) return d ? { parcela: d.parcela, bloqueado: true } : null
  const dist = distribuirCreditos(contrato, schedules, lista)
  const alvo = aluguelPendentes(contrato, schedules).find(s => s.id === d.parcela.id)
  const depois = composicaoComCreditos(alvo, dist.get(alvo.id) || []).amount
  return { parcela: alvo, antes: r2(alvo.amount), depois }
}
