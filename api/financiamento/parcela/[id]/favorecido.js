import { query, parseBody, withTransaction } from '../../../_db.js'
import { requireAuth } from '../../../_auth.js'
import {
  getRouteId, fail, explicarErro, ensureBemSchema, sincronizarFavorecidoAgendamentos,
} from '../../../_bem.js'

// PATCH /api/financiamento/parcela/[id]/favorecido — o lado INVERSO da sincronização.
// Body: { payee }
//
// Editar o favorecido de UMA parcela pela tela de Agendamentos passa a valer para o
// financiamento inteiro: grava `financing.banco` e reaplica o mesmo texto em TODAS as parcelas.
// A alternativa — deixar a parcela divergir sozinha — daria um financiamento com dois
// favorecidos, e o próximo PATCH pela aba Parcelas apagaria a divergência sem avisar.
//
// Fica em parcela/[id]/ (e não num arquivo solto com o id no body) pelo mesmo motivo de
// pagar.js: é uma ação SOBRE uma parcela, e o id dela é rota, não payload.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'PATCH') return fail(res, 405, 'Método não permitido')

  try {
    await ensureBemSchema()

    const parcelaId = getRouteId(req, 1)
    if (!parcelaId) return fail(res, 400, 'id da parcela é obrigatório')

    const body = await parseBody(req)
    if (!('payee' in body)) return fail(res, 400, 'payee é obrigatório')
    const payee = String(body.payee ?? '').trim() || null

    const [parcela] = await query(
      `SELECT id, financing_id FROM financing_installments WHERE id = $1`, [parcelaId],
    )
    if (!parcela) return fail(res, 404, `parcela ${parcelaId} não encontrada`)

    const [fin] = await query(`SELECT * FROM financing WHERE id = $1`, [parcela.financing_id])
    if (!fin) return fail(res, 404, `financiamento ${parcela.financing_id} não encontrado`)

    // O vínculo com a conta favorecida só sobrevive se o texto novo ainda for o nome dela.
    // Sem isso a aba Parcelas mostraria `banco_favorecido_nome` ("Safra") enquanto as parcelas
    // mostram "Itaú" — a mesma informação em dois lugares, discordando.
    let favorecidoId = fin.banco_favorecido_id || null
    let favorecidoNome = null
    if (favorecidoId) {
      const [c] = await query(`SELECT id, name FROM contas WHERE id = $1`, [favorecidoId])
      if (c && payee && c.name === payee) favorecidoNome = c.name
      else favorecidoId = null
    }

    const agendamentosAtualizados = await withTransaction(async (q) => {
      await q(
        `UPDATE financing SET banco = $2, banco_favorecido_id = $3 WHERE id = $1`,
        [fin.id, payee, favorecidoId],
      )
      // A conta "Contas a Pagar - Fin. <bem>" mostra a quem a dívida é devida — mesmo passo do
      // PATCH /api/financiamento/[id], para os dois caminhos deixarem o banco no mesmo estado.
      if (fin.conta_divida_id) {
        const [bem] = await q(`SELECT name FROM contas WHERE id = $1`, [fin.bem_id])
        await q(
          `UPDATE contas SET descricao = $2 WHERE id = $1`,
          [fin.conta_divida_id, `Financiamento ${payee || ''} — ${bem?.name ?? ''}`.trim()],
        )
      }
      return sincronizarFavorecidoAgendamentos(q, fin.id, payee)
    })

    return res.json({
      success: true,
      financiamento: {
        id: fin.id,
        banco: payee,
        banco_favorecido_id: favorecidoId,
        banco_favorecido_nome: favorecidoNome,
      },
      // Mesmo contrato do PATCH /api/financiamento/[id]: o app PRECISA espelhar isto, porque
      // `payee` está em scheduleToRow e o próximo sync mandaria os valores antigos do estado.
      agendamentos_atualizados: agendamentosAtualizados,
      agendamentos_payee: payee,
    })
  } catch (err) {
    console.error('[api/financiamento/parcela/[id]/favorecido]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
