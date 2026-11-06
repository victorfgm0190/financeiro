// Espelha no estado do app o que /api/financiamento/parcela/[id]/pagar acabou de gravar. A mesma
// função serve à baixa por Contas a Pagar e à aba Parcelas do bem, para as duas darem o mesmo
// resultado:
//   • os lançamentos entram com o id do backend (o upsert do sync casa na linha existente, sem criar
//     outra) e o saldo da conta de origem cai uma vez só;
//   • bem e dívida são asset/liability: o saldo é do backend e o app só copia;
//   • a ocorrência só é marcada quando a parcela fecha, como no servidor. Sem marcar no estado, o sync
//     regravava `registered` antigo e a parcela voltava para pagar de novo.
import { ORIGIN } from './origins.js'
import { metaBaixaGerada } from './scheduleBaixa.js'

export function espelharBaixaParcela(resposta, {
  contaOrigemId, dataPagamento, scheduleId, ocorrencia, addTransaction, atualizarSaldo, markScheduleRegistered,
}) {
  const criados = resposta.lancamentos_criados || []
  for (const l of criados) {
    addTransaction({
      id: l.id,
      type: 'expense',
      accountId: contaOrigemId,
      amount: l.valor,
      date: l.data || dataPagamento,
      categoryId: l.categoria_id || '',
      description: l.descricao,
      scheduleId: scheduleId || null,
      dataOcorrencia: ocorrencia || null,
      bemId: resposta.saldos_atualizados?.bem?.id || null,
      origin: ORIGIN.PAGAMENTO_DIVIDA,
    })
  }
  for (const c of [resposta.saldos_atualizados?.bem, resposta.saldos_atualizados?.divida]) {
    if (c?.id) atualizarSaldo(c.id, c.saldo_novo)
  }
  if (scheduleId && ocorrencia && resposta.parcela?.status === 'paid') {
    markScheduleRegistered(scheduleId, ocorrencia, metaBaixaGerada(criados[0]?.id))
  }
}
