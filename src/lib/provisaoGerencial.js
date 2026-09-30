// Núcleo PURO da provisão gerencial do Grupo G (transferência Conta Principal → Ger.<apelido>) —
// a mesma lógica do botão "Executar Gerenciais" (executarProvisoesGerenciais), extraída para ser
// reaproveitada pelo ajuste do Motor de Integridade. Não mexe em saldo: quem chama decide (o botão
// ajusta incrementalmente como sempre fez; o motor deixa o recalcularSaldo recalcular).

import { prevMonthScheduleDate } from './fatura.js'

export const contaPrincipalDe = (accounts) =>
  accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
  accounts.find(a => a.isMain && a.type !== 'credit') ||
  accounts.find(a => a.type === 'checking') || null

export const nomeSubcontaGer = (card) => `Ger. ${card?.apelido || card?.name?.slice(0, 6) || 'CC'}`

// Fatura (MM/AAAA) de um lançamento a partir de faturaRef ou faturaMonthYear.
function faturaRefDe(tx) {
  if (tx?.faturaRef) return tx.faturaRef
  if (tx?.faturaMonthYear) {
    const [y, m] = tx.faturaMonthYear.split('-')
    return y && m ? `${m}/${y}` : null
  }
  return null
}

// Monta a provisão de UMA parcela/gasto G. Devolve { accounts, tx, subcontaCriada } ou null quando
// falta o Grupo G ou a conta principal. `accounts` já inclui a subconta Ger. criada, se não existia.
//   opcoes.id / opcoes.origin — o botão usa tx_ger_<timestamp> + gerencial_auto; o motor usa o id
//   determinístico tx_gerA_<gasto> + etapa_a (idempotente, e é o id que as cascatas conhecem).
//   opcoes.faturaRef — sobrescreve a fatura derivada da parcela (o motor passa a que ele calculou).
export function montarProvisaoGerencial(d, parcela, { id, origin, faturaRef, agora = new Date().toISOString() } = {}) {
  const g1 = d.gerencialGroups?.find(g => g.number === 1)
  if (!g1) return null
  const contaPrincipal = contaPrincipalDe(d.accounts)
  if (!contaPrincipal) return null

  // Dia de início do ciclo financeiro: base das datas das transferências das parcelas 2..N.
  const financialStartDay = d.settings?.financialMonthStartDay || 1

  // Data da transferência gerencial (Conta Principal → Ger.):
  //  • Parcela 1 (ou sem padrão X/N): data original do lançamento.
  //  • Parcelas 2..N: dia financeiro do mês ANTERIOR ao mês da fatura_ref da parcela
  //    (provisão no início do ciclo anterior ao da fatura).
  // Número da parcela: usa a coluna installment_num quando disponível; cai para o último
  // "X/N" da descrição (parcelas legadas com sufixo "(i/N)"), pegando a última ocorrência
  // para não confundir com uma data "5/6" no início da descrição.
  let instNum = Number(parcela.installmentNum) || null
  if (!instNum) {
    const instMatches = [...(parcela.description || '').matchAll(/(\d{1,2})\s*\/\s*\d{1,2}/g)]
    instNum = instMatches.length ? Number(instMatches[instMatches.length - 1][1]) : 1
  }
  let transferDate = parcela.date
  if (instNum >= 2 && parcela.faturaMonthYear) {
    const [fy, fm] = parcela.faturaMonthYear.split('-')
    transferDate = prevMonthScheduleDate(`${fm}/${fy}`, financialStartDay)
  }

  const card = d.accounts.find(a => a.id === parcela.accountId)
  let accounts = d.accounts
  let subconta = accounts.find(a => a.name === nomeSubcontaGer(card))
  let subcontaCriada = false
  if (!subconta) {
    subconta = {
      id: 'acc_ger_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name: nomeSubcontaGer(card), type: 'checking', balance: 0,
      bank: contaPrincipal.bank || '', apelido: `G${card?.apelido || card?.name?.slice(0, 6) || 'CC'}`.slice(0, 8),
      fluxoCaixaPrincipal: false, isMain: false, contaCorrentePrincipal: false,
      grupoGerencial: g1.id, accountGroupId: contaPrincipal.accountGroupId || null,
    }
    accounts = [...accounts, subconta]
    subcontaCriada = true
  }

  const tx = {
    id,
    type: 'transfer',
    accountId: contaPrincipal.id,
    toAccountId: subconta.id,
    amount: parcela.amount,
    date: transferDate,
    description: `Reserva Gerencial - ${parcela.description}`,
    grupoGerencial: g1.id,
    origin,
    parentTxId: parcela.id,
    // Rastreabilidade: herda cartão/fatura/despesa-origem da parcela que gerou a provisão.
    cardId: parcela.accountId,
    faturaRef: faturaRef || faturaRefDe(parcela),
    sourceExpenseId: parcela.id,
    createdAt: agora,
  }
  return { accounts, tx, subcontaCriada }
}
