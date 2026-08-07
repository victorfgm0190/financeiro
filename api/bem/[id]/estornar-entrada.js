import { query, parseBody, withTransaction } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import { getRouteId, num, round2, fail, explicarErro } from '../../_bem.js'

// POST /api/bem/[id]/estornar-entrada — desfaz TODA a entrada à vista registrada no bem
// (transferências vinculadas + trade-ins), deixando-o pronto para registrar de novo.
//
// O estorno desfaz exatamente o que POST /registrar-entrada fez, e nada além disso. Os dois
// tipos de item voltam de formas diferentes, pelo mesmo motivo que entram diferente:
//
//   • trade-in → o módulo criou tudo: o saldo do bem antigo foi zerado, ele foi marcado como
//     vendido e a perda/ganho virou um lançamento 'patrimonio_auto'. Tudo isso é revertido: o
//     saldo volta (de saldo_origem_anterior), as flags de venda saem e o lançamento é APAGADO.
//   • transferência → o lançamento já existia ANTES, criado à mão pelo usuário; ele creditou a
//     conta do bem quando foi feito e o registrar-entrada só encostou nele para pôr `bem_id`.
//     Aqui ele é DESVINCULADO (bem_id = NULL), nunca apagado — apagá-lo destruiria uma
//     transferência bancária real e deixaria a conta de origem com saldo errado, porque quem
//     sabe desfazer os dois lados de uma transferência é o deleteTransaction do AppContext.
//     Quem quiser mesmo apagá-las faz isso pelo Extrato, com o efeito de saldo correto.
//
// Movimentações de 'pagamento_parcela' não são tocadas: são do financiamento, não da entrada.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')

  try {
    const body = await parseBody(req)
    const bemId = getRouteId(req, 1) || body.bem_id
    if (!bemId) return fail(res, 400, 'bem_id é obrigatório')

    const [bem] = await query(`SELECT id, name, balance FROM contas WHERE id = $1`, [bemId])
    if (!bem) return fail(res, 404, `bem ${bemId} não encontrado`)

    const [entradas] = await query(
      `SELECT COUNT(*)::int AS n FROM bem_movimentacoes
        WHERE bem_id = $1 AND tipo IN ('entrada_venda', 'entrada_trade_in')`,
      [bemId],
    )
    if (!entradas?.n) return fail(res, 400, 'Este bem não tem entrada registrada para estornar')

    // Guarda deliberada, não bloqueio: com financiamento aberto a entrada é a base do valor
    // financiado, então desfazê-la sozinha deixa os dois números incoerentes. Quem sabe se isso
    // é o desejado é o usuário, e ele responde por escrito — daí o flag em vez de um 400 seco.
    const [fin] = await query(
      `SELECT id, valor_principal FROM financing WHERE bem_id = $1 AND status <> 'cancelled' LIMIT 1`,
      [bemId],
    )
    if (fin && !body.confirmar_com_financiamento) {
      return fail(
        res, 409,
        'Este bem já tem financiamento. Estornar a entrada agora deixa o valor financiado '
        + 'sem a base que o originou. Reenvie com confirmar_com_financiamento para prosseguir.',
      )
    }

    const resultado = await withTransaction(async (q) => {
      const movs = await q(
        `SELECT * FROM bem_movimentacoes
          WHERE bem_id = $1 AND tipo IN ('entrada_venda', 'entrada_trade_in')
          ORDER BY created_at`,
        [bemId],
      )

      let totalTradeIn = 0
      const transferenciasDesvinculadas = []
      const lancamentosRemovidos = []
      const bensRestaurados = []

      for (const m of movs) {
        if (m.tipo === 'entrada_trade_in') {
          // Só o trade-in mexeu no saldo do bem destino — é só ele que precisa voltar de lá.
          totalTradeIn = round2(totalTradeIn + num(m.valor))

          if (m.bem_origem_id) {
            const [antigo] = await q(
              `SELECT id, name, valor_nota_fiscal FROM contas WHERE id = $1`, [m.bem_origem_id],
            )
            if (antigo) {
              // Movimentação antiga (anterior à coluna) não tem o saldo original guardado. A
              // nota fiscal é o melhor palpite — é com ela que o bem nasce em /api/bem/criar —
              // e o `estimado` avisa a UI de que esse número merece conferência.
              const estimado = m.saldo_origem_anterior == null
              const saldoRestaurado = estimado
                ? round2(num(antigo.valor_nota_fiscal))
                : round2(num(m.saldo_origem_anterior))

              await q(
                `UPDATE contas
                    SET balance = $2, foi_vendido = FALSE, data_venda = NULL, bem_destino_id = NULL
                  WHERE id = $1`,
                [antigo.id, saldoRestaurado],
              )
              bensRestaurados.push({
                id: antigo.id,
                nome: antigo.name,
                saldo: saldoRestaurado,
                saldo_estimado: estimado,
              })
            }
          }

          // `origin = 'patrimonio_auto'` no WHERE: apaga só o que o módulo criou. Se o id
          // apontar para outra coisa (dado migrado à mão), o DELETE não pega nada em vez de
          // remover um lançamento que não é nosso.
          if (m.lancamento_id) {
            const [removido] = await q(
              `DELETE FROM lancamentos WHERE id = $1 AND origin = 'patrimonio_auto'
                 RETURNING id, type, amount, description`,
              [m.lancamento_id],
            )
            if (removido) {
              lancamentosRemovidos.push({
                id: removido.id,
                tipo: removido.type,
                valor: num(removido.amount),
                descricao: removido.description,
              })
            }
          }
          continue
        }

        // entrada_venda: desvincula, não apaga. O `AND bem_id = $2` evita roubar de outro bem
        // um lançamento que já tenha sido revinculado desde então.
        if (m.lancamento_id) {
          const [solto] = await q(
            `UPDATE lancamentos SET bem_id = NULL WHERE id = $1 AND bem_id = $2
               RETURNING id, amount, description`,
            [m.lancamento_id, bemId],
          )
          if (solto) {
            transferenciasDesvinculadas.push({
              id: solto.id,
              valor: num(solto.amount),
              descricao: solto.description,
            })
          }
        }
      }

      // Mesma razão do registrar-entrada para a soma ficar dentro do UPDATE: o saldo lido fora
      // da transação pode estar velho. Com trade-in zerado isto é aritmeticamente inócuo.
      const [contaBem] = await q(
        `UPDATE contas SET balance = balance - $2 WHERE id = $1 RETURNING balance`,
        [bemId, totalTradeIn],
      )
      const saldoBemNovo = round2(num(contaBem?.balance))

      const removidas = await q(
        `DELETE FROM bem_movimentacoes
          WHERE bem_id = $1 AND tipo IN ('entrada_venda', 'entrada_trade_in')
          RETURNING id`,
        [bemId],
      )

      return {
        saldoBemNovo,
        saldoBemAnterior: round2(saldoBemNovo + totalTradeIn),
        totalTradeIn,
        transferenciasDesvinculadas,
        lancamentosRemovidos,
        bensRestaurados,
        movimentacoesRemovidas: removidas.length,
      }
    })

    return res.json({
      success: true,
      estornado: true,
      bem: {
        id: bemId,
        nome: bem.name,
        saldo_anterior: resultado.saldoBemAnterior,
        saldo: resultado.saldoBemNovo,
      },
      trade_in_revertido: resultado.totalTradeIn,
      // Continuam existindo no Extrato — a UI precisa dizer isso ao usuário, senão ele acha
      // que "estornar tudo" apagou as transferências e vai procurá-las onde não estão.
      transferencias_desvinculadas: resultado.transferenciasDesvinculadas,
      lancamentos_removidos: resultado.lancamentosRemovidos,
      bens_restaurados: resultado.bensRestaurados,
      movimentacoes_removidas: resultado.movimentacoesRemovidas,
    })
  } catch (err) {
    console.error('[api/bem/[id]/estornar-entrada]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
