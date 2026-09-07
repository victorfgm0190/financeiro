import { query, parseBody, withTransaction } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import {
  num, round2, fail, explicarErro, ensureBemSchema, criarRateiosParcela,
} from '../../_bem.js'

// POST /api/financiamento/parcelas/popular-rateios — divide os agendamentos de parcela de um
// financiamento ANTIGO nas duas categorias do bem, via rateio.
//
// Body: { bem_id } ou { financing_id }.
//
// O agendamento continua sendo UM por parcela, com o valor cheio: o que muda é que ele passa a
// ter duas linhas de rateio — principal na categoria de prestação e juros na de taxa de
// financiamento. Financiamento criado a partir de agora já nasce assim (ver criar.js); este
// endpoint existe para os que foram provisionados antes.
//
// IDEMPOTENTE: parcela cujo agendamento JÁ tem rateio é pulada, e a resposta a contabiliza em
// `ja_tinham`. Rodar duas vezes não duplica nem sobrescreve — inclusive não sobrescreve um
// rateio que o usuário tenha ajustado à mão, que é o caso em que reescrever seria pior.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')

  try {
    // A tabela de rateios é garantida aqui (ver ensureBemSchema), junto com a limpeza dos
    // agendamentos separados pela abordagem anterior.
    await ensureBemSchema()

    const body = await parseBody(req)
    const bemId = body.bem_id || null
    const financingId = body.financing_id || null
    if (!bemId && !financingId) return fail(res, 400, 'bem_id ou financing_id é obrigatório')

    const [fin] = financingId
      ? await query(`SELECT * FROM financing WHERE id = $1`, [financingId])
      : await query(
        `SELECT * FROM financing WHERE bem_id = $1 AND status <> 'canceled'
          ORDER BY created_at DESC LIMIT 1`, [bemId],
      )
    if (!fin) {
      return fail(res, 404,
        `financiamento não encontrado para ${financingId ? `id ${financingId}` : `bem ${bemId}`}`)
    }

    const [bem] = await query(`SELECT * FROM contas WHERE id = $1`, [fin.bem_id])
    if (!bem) return fail(res, 404, `bem ${fin.bem_id} não encontrado`)

    if (!bem.categoria_prestacao_id) {
      return fail(res, 400,
        `${bem.name} está sem a categoria de Prestação — parametrize o bem antes`)
    }

    const parcelas = await query(
      `SELECT id, numero_parcela, schedule_id, principal_provisioned, juros_provisioned
         FROM financing_installments
        WHERE financing_id = $1
        ORDER BY numero_parcela`,
      [fin.id],
    )

    // Exigida só quando alguma parcela tem juros — um financiamento sem juros se resolve com a
    // categoria de prestação sozinha.
    const temJuros = parcelas.some(p => num(p.juros_provisioned) > 0)
    if (temJuros && !bem.categoria_taxa_finan_id) {
      return fail(res, 400,
        `${bem.name} está sem a categoria de Taxa de Financiamento — parametrize o bem antes`)
    }

    // Uma consulta só para saber quem já tem rateio, em vez de uma por parcela.
    const scheduleIds = parcelas.map(p => p.schedule_id).filter(Boolean)
    const comRateio = new Set(
      scheduleIds.length > 0
        ? (await query(
          `SELECT DISTINCT lancamento_id FROM lancamento_rateios WHERE lancamento_id = ANY($1)`,
          [scheduleIds],
        )).map(r => r.lancamento_id)
        : [],
    )

    const erros = []
    let jaTinham = 0
    const aProcessar = []
    const rateiosCriados = []

    for (const p of parcelas) {
      if (!p.schedule_id) {
        erros.push({
          parcela: num(p.numero_parcela),
          erro: 'parcela sem agendamento vinculado (schedule_id nulo)',
        })
        continue
      }
      if (comRateio.has(p.schedule_id)) {
        jaTinham += 1
        continue
      }
      aProcessar.push(p)
    }

    // TODAS as parcelas numa transação só. Uma transação por parcela seriam 60 idas ao banco
    // num financiamento típico — tempo suficiente para estourar o limite da função serverless,
    // e o resultado seria uma migração parcial sem nenhum aviso de que parou no meio.
    if (aProcessar.length > 0) {
      await withTransaction(async (q) => {
        for (const p of aProcessar) {
          await criarRateiosParcela(q, {
            scheduleId: p.schedule_id,
            principal: p.principal_provisioned,
            juros: p.juros_provisioned,
            categoriaPrestacaoId: bem.categoria_prestacao_id,
            categoriaTaxaFinanId: bem.categoria_taxa_finan_id,
          })
        }
      })
    }
    const sucessos = aProcessar.length

    // As linhas gravadas, já no formato do estado do app (rowToRateio). O app PRECISA espelhar
    // isto: `data.rateios` só é recarregado no full-load, então sem devolvê-las o usuário
    // clicaria no botão, veria o toast de sucesso e continuaria sem ver a divisão em lugar
    // nenhum — foi o que aconteceu com os agendamentos criados no servidor.
    // Devolvidas SEMPRE que houver agendamentos, não só quando algo foi criado agora: se as
    // parcelas já tinham rateio mas o app não os tem no estado (aberto desde antes), o botão
    // continua servindo para sincronizar a tela.
    if (scheduleIds.length > 0) {
      const linhas = await query(
        `SELECT id, lancamento_id, categoria_id, valor, descricao
           FROM lancamento_rateios
          WHERE lancamento_id = ANY($1)
          ORDER BY lancamento_id, created_at`,
        [scheduleIds],
      )
      for (const l of linhas) {
        rateiosCriados.push({
          id: l.id,
          lancamentoId: l.lancamento_id,
          categoriaId: l.categoria_id || '',
          valor: round2(num(l.valor)),
          descricao: l.descricao || '',
        })
      }
    }

    return res.json({
      success: true,
      financiamento_id: fin.id,
      bem_id: fin.bem_id,
      bem_nome: bem.name,
      total_parcelas: parcelas.length,
      sucessos,
      ja_tinham: jaTinham,
      erros,
      rateios: rateiosCriados,
      mensagem: sucessos > 0
        ? `${sucessos} parcela(s) atualizada(s) com Principal + Juros`
        : 'Nenhuma parcela precisava de rateio',
    })
  } catch (err) {
    console.error('[api/financiamento/parcelas/popular-rateios]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
