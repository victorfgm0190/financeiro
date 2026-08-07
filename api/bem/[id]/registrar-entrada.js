import { query, parseBody, withTransaction } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import {
  getRouteId, num, round2, hoje, fail,
  criarLancamentoCategorizado, registrarMovimentacao, explicarErro,
} from '../../_bem.js'

// POST /api/bem/[id]/registrar-entrada — registra a entrada à vista do bem.
//
// Cada item de `transferencias` é de um dos dois tipos, e eles afetam o SALDO do bem de forma
// diferente — é a distinção central deste endpoint:
//   • { transferencia_id } → vincula um lançamento já existente ao bem. NÃO mexe no saldo: a
//     transferência já creditou a conta do bem quando foi criada.
//   • { bem_origem_id }    → trade-in: um bem antigo dado como parte do pagamento. MEXE no
//     saldo, porque não existe lançamento por trás dele (a perda/ganho nasce com
//     account_id = NULL justamente para não mover saldo).
//
// No trade-in o bem antigo é liquidado: perda/ganho = valor_venda − valor_nota_fiscal, o saldo
// é reduzido pelo valor negociado e a conta é marcada como vendida apontando para o bem novo.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')

  try {
    const body = await parseBody(req)
    const bemId = getRouteId(req, 1) || body.bem_id
    if (!bemId) return fail(res, 400, 'bem_id é obrigatório')

    const itens = Array.isArray(body.transferencias) ? body.transferencias : []
    if (itens.length === 0) return fail(res, 400, 'transferencias deve ser um array não vazio')

    const [bem] = await query(`SELECT * FROM contas WHERE id = $1`, [bemId])
    if (!bem) return fail(res, 404, `bem ${bemId} não encontrado`)

    const data = body.data && String(body.data).slice(0, 10) || hoje()

    // Valida tudo antes de escrever: um item inválido no meio não pode deixar entrada parcial.
    for (const [i, item] of itens.entries()) {
      const valor = Number(item?.valor)
      if (!Number.isFinite(valor) || valor <= 0) {
        return fail(res, 400, `transferencias[${i}].valor deve ser um número maior que zero`)
      }
      if (!item?.transferencia_id && !item?.bem_origem_id) {
        return fail(res, 400, `transferencias[${i}] precisa de transferencia_id ou bem_origem_id`)
      }
      if (item.transferencia_id) {
        const [tx] = await query(`SELECT id FROM lancamentos WHERE id = $1`, [item.transferencia_id])
        if (!tx) return fail(res, 404, `transferência ${item.transferencia_id} não encontrada`)
      }
      if (item.bem_origem_id) {
        const [antigo] = await query(`SELECT id, foi_vendido FROM contas WHERE id = $1`, [item.bem_origem_id])
        if (!antigo) return fail(res, 404, `bem de origem ${item.bem_origem_id} não encontrado`)
        if (antigo.foi_vendido) return fail(res, 400, `bem de origem ${item.bem_origem_id} já foi vendido`)
      }
    }

    const resultado = await withTransaction(async (q) => {
      // Os dois tipos de item entram no total exibido, mas SÓ o trade-in mexe no saldo do bem.
      // Uma transferência já creditou a conta do bem quando foi criada (applyTransferEffect no
      // AppContext credita toAccountId, e o sync persiste esse balance), então somá-la de novo
      // aqui contava o mesmo dinheiro duas vezes. Para a transferência este endpoint é só o
      // vínculo (`bem_id` no lançamento) + o registro no histórico.
      let entradaTotalTransferencias = 0
      let entradaTotalTradeIn = 0
      let jaVinculadas = 0
      const bensAntigos = []

      for (const item of itens) {
        const valor = round2(Number(item.valor))

        if (item.transferencia_id) {
          entradaTotalTransferencias = round2(entradaTotalTransferencias + valor)
          // Idempotência: só vincula o que ainda não aponta para ESTE bem. Sem a guarda, chamar
          // o endpoint duas vezes com a mesma transferência gravava uma segunda movimentação
          // 'entrada_venda' e duplicava a linha no histórico do bem.
          const vinculadas = await q(
            `UPDATE lancamentos SET bem_id = $2, category_id = COALESCE($3, category_id)
               WHERE id = $1 AND (bem_id IS NULL OR bem_id <> $2)
             RETURNING id`,
            [item.transferencia_id, bemId, item.categoria_id || null],
          )
          if (vinculadas.length === 0) {
            jaVinculadas++
            continue
          }
          await registrarMovimentacao(q, {
            bemId,
            tipo: 'entrada_venda',
            data,
            descricao: item.descricao || 'Entrada à vista',
            valor,
            categoriaId: item.categoria_id || null,
            lancamentoId: item.transferencia_id,
          })
          continue
        }

        entradaTotalTradeIn = round2(entradaTotalTradeIn + valor)

        const [antigo] = await q(`SELECT * FROM contas WHERE id = $1`, [item.bem_origem_id])
        const valorNF = num(antigo.valor_nota_fiscal)
        // Sinal contábil: negativo = perda, positivo = ganho.
        const perdaGanho = round2(valor - valorNF)
        const isGanho = perdaGanho > 0

        const categoriaResultado = item.categoria_id
          || (isGanho
            ? (antigo.categoria_ganho_bem_id || bem.categoria_ganho_bem_id)
            : (antigo.categoria_perda_bem_id || bem.categoria_perda_bem_id))

        let lancamentoId = null
        if (perdaGanho !== 0 && categoriaResultado) {
          lancamentoId = await criarLancamentoCategorizado(q, {
            categoriaId: categoriaResultado,
            valor: Math.abs(perdaGanho),
            descricao: `${isGanho ? 'Ganho' : 'Perda'} de venda de bem — ${antigo.name}`,
            bemId,
            data,
            tipo: isGanho ? 'income' : 'expense',
            origin: 'patrimonio_auto',
          })
        }

        const saldoAnterior = num(antigo.balance)
        const saldoNovo = round2(saldoAnterior - valor)
        await q(
          `UPDATE contas SET balance = $2, foi_vendido = TRUE, data_venda = $3, bem_destino_id = $4
             WHERE id = $1`,
          [antigo.id, saldoNovo, data, bemId],
        )

        const movimentacaoId = await registrarMovimentacao(q, {
          bemId,
          tipo: 'entrada_trade_in',
          data,
          descricao: item.descricao || `Recebido ${antigo.name} como entrada`,
          bemOrigemId: antigo.id,
          valor,
          perdaGanho,
          categoriaId: categoriaResultado || null,
          lancamentoId,
        })

        bensAntigos.push({
          id: antigo.id,
          nome: antigo.name,
          valor_nota_fiscal: valorNF,
          valor_entrada: valor,
          saldo_anterior: saldoAnterior,
          saldo_reducido: saldoNovo,
          foi_vendido: true,
          data_venda: data,
          perda_ganho: perdaGanho,
          perda: isGanho ? 0 : Math.abs(perdaGanho),
          ganho: isGanho ? perdaGanho : 0,
          categoria_id: categoriaResultado || null,
          lancamento_id: lancamentoId,
          movimentacao_id: movimentacaoId,
        })
      }

      // `balance = balance + $2` em vez de ler-somar-gravar: o valor antigo vinha de um SELECT
      // feito FORA desta transação (linha do `SELECT * FROM contas` lá em cima), então duas
      // chamadas concorrentes perdiam uma das somas. Com a soma no próprio UPDATE o cálculo é
      // atômico. Com trade-in zerado o UPDATE é aritmeticamente inócuo e serve só para ler o
      // saldo corrente de dentro da transação.
      const [contaBem] = await q(
        `UPDATE contas SET balance = balance + $2 WHERE id = $1 RETURNING balance`,
        [bemId, entradaTotalTradeIn],
      )
      const saldoBemNovo = round2(num(contaBem?.balance))
      const saldoBemAnterior = round2(saldoBemNovo - entradaTotalTradeIn)

      return {
        entradaTotal: round2(entradaTotalTransferencias + entradaTotalTradeIn),
        entradaTotalTransferencias,
        entradaTotalTradeIn,
        jaVinculadas,
        saldoBemAnterior,
        saldoBemNovo,
        bensAntigos,
      }
    })

    return res.json({
      success: true,
      // Soma dos DOIS tipos — é o valor da entrada como um todo, que é o que a UI exibe.
      // O saldo, porém, só se mexe pelo trade-in: `entrada_total` ≠ (saldo − saldo_anterior)
      // sempre que houver transferência, e isso é o comportamento correto.
      entrada_total: resultado.entradaTotal,
      entrada_transferencias: resultado.entradaTotalTransferencias,
      entrada_trade_in: resultado.entradaTotalTradeIn,
      transferencias_ja_vinculadas: resultado.jaVinculadas,
      bem: {
        id: bemId,
        nome: bem.name,
        saldo_anterior: resultado.saldoBemAnterior,
        saldo: resultado.saldoBemNovo,
      },
      bens_antigos: resultado.bensAntigos,
      // Conveniência para o caso mais comum (um único trade-in).
      bem_antigo: resultado.bensAntigos[0] || null,
    })
  } catch (err) {
    console.error('[api/bem/[id]/registrar-entrada]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
