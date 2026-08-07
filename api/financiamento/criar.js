import { query, parseBody, withTransaction } from '../_db.js'
import { requireAuth } from '../_auth.js'
import {
  genId, num, round2, isIsoDate, fail,
  montarProvisao, criarAgendamentosParcelas, ACCOUNT_TYPE_DIVIDA, explicarErro,
} from '../_bem.js'

// POST /api/financiamento/criar — provisiona o financiamento inteiro de uma vez:
// conta de dívida em "Dívidas e Passivos", N parcelas em financing_installments e N
// agendamentos de transferência (conta corrente → conta de dívida), um por vencimento.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')

  try {
    const body = await parseBody(req)
    const {
      bem_id, valor_principal, num_parcelas, valor_parcela, banco,
      data_primeira_parcela, conta_origem_id,
    } = body

    if (!bem_id) return fail(res, 400, 'bem_id é obrigatório')
    if (!Number.isFinite(Number(valor_principal)) || Number(valor_principal) <= 0) {
      return fail(res, 400, 'valor_principal deve ser um número maior que zero')
    }
    const nParcelas = Number(num_parcelas)
    if (!Number.isInteger(nParcelas) || nParcelas < 1 || nParcelas > 600) {
      return fail(res, 400, 'num_parcelas deve ser um inteiro entre 1 e 600')
    }
    if (!Number.isFinite(Number(valor_parcela)) || Number(valor_parcela) <= 0) {
      return fail(res, 400, 'valor_parcela deve ser um número maior que zero')
    }
    if (!isIsoDate(data_primeira_parcela)) {
      return fail(res, 400, 'data_primeira_parcela deve estar no formato YYYY-MM-DD')
    }

    const [bem] = await query(`SELECT * FROM contas WHERE id = $1`, [bem_id])
    if (!bem) return fail(res, 404, `bem ${bem_id} não encontrado`)

    const [jaExiste] = await query(
      `SELECT id FROM financing WHERE bem_id = $1 AND status <> 'canceled' LIMIT 1`, [bem_id],
    )
    if (jaExiste) {
      return fail(res, 400, `bem ${bem_id} já possui o financiamento ${jaExiste.id}`)
    }

    // Conta que paga as parcelas: a informada, senão a conta corrente principal do usuário.
    let contaOrigem = null
    if (conta_origem_id) {
      const [c] = await query(`SELECT id FROM contas WHERE id = $1`, [conta_origem_id])
      if (!c) return fail(res, 404, `conta de origem ${conta_origem_id} não encontrada`)
      contaOrigem = c.id
    } else {
      const [c] = await query(
        `SELECT id FROM contas
          WHERE type NOT IN ('credit', 'asset', 'liability')
          ORDER BY conta_corrente_principal DESC NULLS LAST, is_main DESC NULLS LAST, created_at
          LIMIT 1`,
      )
      if (!c) return fail(res, 400, 'nenhuma conta corrente encontrada — informe conta_origem_id')
      contaOrigem = c.id
    }

    const valorPrincipal = round2(num(valor_principal))
    const valorParcela = round2(num(valor_parcela))
    const provisao = montarProvisao({
      valorPrincipal,
      numParcelas: nParcelas,
      valorParcela,
      dataPrimeiraParcela: String(data_primeira_parcela).slice(0, 10),
    })

    if (provisao.jurosTotais < 0) {
      return fail(res, 400,
        `valor_parcela × num_parcelas (${provisao.valorTotal}) é menor que valor_principal (${valorPrincipal})`)
    }

    const financingId = genId('fin')
    const contaDividaId = genId('acc_divida')

    const criado = await withTransaction(async (q) => {
      // Saldo = −valor_TOTAL (principal + juros), não −principal: quem amortiza é
      // POST /parcela/[id]/pagar, com `saldo + valor_pago` — o valor cheio da parcela. Começar
      // no principal faria a dívida terminar POSITIVA em juros_totais depois da última parcela.
      // Os dois números só fecham em zero juntos.
      const [contaDivida] = await q(
        `INSERT INTO contas (id, name, type, balance, initial_balance, descricao)
         VALUES ($1, $2, $3, $4, $4, $5)
         RETURNING id, name, type, balance`,
        [contaDividaId, `Contas a Pagar - Fin. ${bem.name}`, ACCOUNT_TYPE_DIVIDA,
          round2(-provisao.valorTotal), `Financiamento ${banco || ''} — ${bem.name}`.trim()],
      )

      await q(
        `INSERT INTO financing
           (id, bem_id, valor_principal, juros_totais, valor_total, num_parcelas, valor_parcela,
            principal_por_parcela, juros_por_parcela, banco, status, conta_divida_id,
            conta_origem_id, data_primeira_parcela)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$12,$13)`,
        [financingId, bem_id, valorPrincipal, provisao.jurosTotais, provisao.valorTotal,
          nParcelas, valorParcela, provisao.principalPorParcela, provisao.jurosPorParcela,
          banco || null, contaDividaId, contaOrigem, String(data_primeira_parcela).slice(0, 10)],
      )

      const parcelas = []
      for (const p of provisao.parcelas) {
        const id = genId('fip')
        await q(
          `INSERT INTO financing_installments
             (id, financing_id, numero_parcela, principal_provisioned, juros_provisioned,
              total_provisioned, principal_pago, juros_pago, total_pago, desvio_juros,
              data_vencimento, status)
           VALUES ($1,$2,$3,$4,$5,$6,0,0,0,0,$7,'open')`,
          [id, financingId, p.numero, p.principal_provisioned, p.juros_provisioned,
            p.total_provisioned, p.data_vencimento],
        )
        parcelas.push({ ...p, id })
      }

      const scheduleIds = await criarAgendamentosParcelas(q, {
        parcelas,
        contaOrigemId: contaOrigem,
        contaDestinoId: contaDividaId,
        valorParcela,
        descricaoBase: `Parcela`,
        numParcelas: nParcelas,
        categoriaPrestacaoId: bem.categoria_prestacao_id || null,
      })
      // Descrição final inclui o nome do bem; feita aqui para não repetir a string por parcela.
      for (let i = 0; i < scheduleIds.length; i++) {
        await q(
          `UPDATE agendamentos SET description = $2 WHERE id = $1`,
          [scheduleIds[i], `Parcela ${parcelas[i].numero}/${nParcelas} - ${bem.name}`],
        )
        await q(
          `UPDATE financing_installments SET schedule_id = $2 WHERE id = $1`,
          [parcelas[i].id, scheduleIds[i]],
        )
      }

      return { parcelas, scheduleIds, contaDivida }
    })

    return res.json({
      success: true,
      financiamento: {
        id: financingId,
        bem_id,
        bem_nome: bem.name,
        valor_principal: valorPrincipal,
        juros_totais: provisao.jurosTotais,
        valor_total: provisao.valorTotal,
        num_parcelas: nParcelas,
        valor_parcela: valorParcela,
        principal_por_parcela: provisao.principalPorParcela,
        juros_por_parcela: provisao.jurosPorParcela,
        banco: banco || null,
        status: 'open',
        conta_divida_id: contaDividaId,
        conta_origem_id: contaOrigem,
        data_primeira_parcela: String(data_primeira_parcela).slice(0, 10),
        parcelas_criadas: criado.parcelas.length,
        agendamentos_criados: criado.scheduleIds.length,
      },
      // A conta de dívida sempre foi criada (é o primeiro INSERT da transação), mas só o id
      // dela saía daqui — e um id sozinho não dá para o frontend pôr a conta no estado React.
      // Sem a linha inteira ela só aparecia no próximo full-load, o que faz parecer que o
      // endpoint não a criou. `type` vem junto de propósito: é 'liability' ('Dívida / Passivo'
      // em AccountForm, agrupado em Dívidas no Patrimônio), nunca 'debt'.
      conta_divida: {
        id: criado.contaDivida.id,
        name: criado.contaDivida.name,
        type: criado.contaDivida.type,
        balance: num(criado.contaDivida.balance),
      },
    })
  } catch (err) {
    console.error('[api/financiamento/criar]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
