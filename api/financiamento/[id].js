import { query, parseBody } from '../_db.js'
import { requireAuth } from '../_auth.js'
import {
  getRouteId, genId, num, round2, fail, SELECT_PARCELAS, serializarParcela, explicarErro,
  ensureBemSchema, withFavorecido,
} from '../_bem.js'

// GET   /api/financiamento/[id] — financiamento completo: provisão × realizado, desvios e as
// N parcelas. `desvio_juros` acumulado é a diferença entre os juros provisionados das parcelas
// já baixadas e os juros efetivamente pagos nelas.
//
// PATCH /api/financiamento/[id] — hoje só edita o BANCO FAVORECIDO (quem recebe as parcelas).
// Fica no mesmo arquivo porque a Vercel roteia por caminho, não por método: um endpoint
// separado exigiria uma rota nova só para gravar uma coluna.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method === 'PATCH') return patch(req, res)
  if (req.method !== 'GET') return fail(res, 405, 'Método não permitido')

  try {
    const id = getRouteId(req)
    if (!id) return fail(res, 400, 'id é obrigatório')

    const [fin] = await query(`SELECT * FROM financing WHERE id = $1`, [id])
    if (!fin) return fail(res, 404, `financiamento ${id} não encontrado`)

    const [bem] = await query(`SELECT id, name FROM contas WHERE id = $1`, [fin.bem_id])
    const rows = await query(
      `${SELECT_PARCELAS} WHERE financing_id = $1 ORDER BY numero_parcela`, [id],
    )
    const parcelas = rows.map(serializarParcela)

    const realizado = parcelas.reduce((acc, p) => ({
      principal: round2(acc.principal + p.principal_pago),
      juros: round2(acc.juros + p.juros_pago),
      total: round2(acc.total + p.total_pago),
    }), { principal: 0, juros: 0, total: 0 })

    const provisao = {
      principal: num(fin.valor_principal),
      juros: num(fin.juros_totais),
      total: num(fin.valor_total),
    }

    // Só as parcelas já tocadas entram no desvio — as ainda abertas não são "juros a menos",
    // são juros que ainda nem venceram.
    const desvioJuros = round2(
      parcelas.filter(p => p.status !== 'open').reduce((s, p) => s + p.desvio_juros, 0),
    )

    // Saldo devedor pela soma das parcelas: é o mesmo total_restante, mas vindo da coluna que a
    // aba Parcelas exibe linha a linha — assim o rodapé nunca discorda das linhas.
    const saldoRestante = round2(parcelas.reduce((s, p) => s + p.saldo_restante, 0))

    return res.json({
      success: true,
      financiamento: {
        id: fin.id,
        bem_id: fin.bem_id,
        bem_nome: bem?.name ?? null,
        valor_principal: provisao.principal,
        juros_totais: provisao.juros,
        valor_total: provisao.total,
        num_parcelas: num(fin.num_parcelas),
        valor_parcela: num(fin.valor_parcela),
        banco: fin.banco ?? null,
        status: fin.status,
        conta_divida_id: fin.conta_divida_id ?? null,
        conta_origem_id: fin.conta_origem_id ?? null,
        ...(await withFavorecido(query, fin)),
        provisao,
        realizado,
        analise: {
          principal_restante: round2(provisao.principal - realizado.principal),
          juros_restantes: round2(provisao.juros - realizado.juros),
          desvio_juros: desvioJuros,
          total_restante: round2(provisao.total - realizado.total),
          saldo_restante: saldoRestante,
        },
        parcelas,
      },
    })
  } catch (err) {
    console.error('[api/financiamento/[id]]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}

// Tipos de conta que o app aceita para um banco favorecido. 'asset'/'liability' ficam de fora:
// são bem e dívida, não recebem parcela de ninguém.
const TIPOS_BANCO = ['checking', 'savings', 'credit']

// PATCH — troca o banco favorecido. `banco_favorecido_id: null` desvincula.
// `novo_banco: { nome, tipo }` cria a conta aqui e já a usa como favorecida — criar do lado do
// React e só então mandar o id abriria uma janela em que o id ainda não existe no banco (o sync
// é debounced) e o PATCH devolveria 404. A linha criada volta na resposta para o app espelhá-la
// no estado com o MESMO id, igual à conta de dívida de /api/financiamento/criar.
async function patch(req, res) {
  try {
    // `banco_favorecido_id` é coluna nova: um banco que ainda não passou por /api/load não a tem.
    await ensureBemSchema()

    const id = getRouteId(req)
    if (!id) return fail(res, 400, 'id é obrigatório')

    const body = await parseBody(req)
    if (!('banco_favorecido_id' in body) && !('banco' in body) && !body.novo_banco) {
      return fail(res, 400, 'informe banco_favorecido_id, novo_banco ou banco')
    }

    const [fin] = await query(`SELECT * FROM financing WHERE id = $1`, [id])
    if (!fin) return fail(res, 404, `financiamento ${id} não encontrado`)

    let contaCriada = null
    if (body.novo_banco) {
      const nome = String(body.novo_banco.nome || '').trim()
      if (!nome) return fail(res, 400, 'novo_banco.nome é obrigatório')
      const tipo = body.novo_banco.tipo || 'checking'
      if (!TIPOS_BANCO.includes(tipo)) {
        return fail(res, 400, `novo_banco.tipo deve ser um de: ${TIPOS_BANCO.join(', ')}`)
      }
      const [existente] = await query(
        `SELECT id, name, type FROM contas WHERE lower(name) = lower($1) LIMIT 1`, [nome],
      )
      // Reaproveita a conta homônima em vez de criar uma segunda com o mesmo nome — o usuário
      // que digita "BANCO SAFRA" numa tela onde ele já existe quer aquele, não um clone.
      if (existente) {
        contaCriada = { ...existente, balance: 0, ja_existia: true }
      } else {
        const [nova] = await query(
          `INSERT INTO contas (id, name, type, balance, initial_balance)
           VALUES ($1, $2, $3, 0, 0) RETURNING id, name, type, balance`,
          [genId('acc'), nome, tipo],
        )
        contaCriada = { ...nova, ja_existia: false }
      }
    }

    let favorecidoId = contaCriada ? contaCriada.id
      : 'banco_favorecido_id' in body ? (body.banco_favorecido_id || null)
      : (fin.banco_favorecido_id || null)

    let favorecido = null
    if (favorecidoId) {
      const [c] = await query(`SELECT id, name FROM contas WHERE id = $1`, [favorecidoId])
      if (!c) return fail(res, 404, `conta favorecida ${favorecidoId} não encontrada`)
      // Uma conta não pode ser favorecida do próprio financiamento que ela representa: o
      // pagamento sairia e entraria no mesmo lugar.
      if (c.id === fin.conta_divida_id || c.id === fin.bem_id) {
        return fail(res, 400, `${c.name} é a conta de dívida/bem deste financiamento`)
      }
      favorecido = c
    }

    // `banco` continua sendo o texto exibido: quando o favorecido é escolhido e nenhum texto foi
    // informado, ele passa a ser o nome da conta — é o que faz a troca aparecer na UI inteira.
    const bancoTexto = 'banco' in body
      ? (String(body.banco || '').trim() || null)
      : (favorecido ? favorecido.name : fin.banco ?? null)

    await query(
      `UPDATE financing SET banco_favorecido_id = $2, banco = $3 WHERE id = $1`,
      [id, favorecidoId, bancoTexto],
    )

    // A conta "Contas a Pagar - Fin. <bem>" é a face visível do financiamento no Patrimônio —
    // é a descrição dela que mostra a quem a dívida é devida.
    if (fin.conta_divida_id) {
      const [bem] = await query(`SELECT name FROM contas WHERE id = $1`, [fin.bem_id])
      await query(
        `UPDATE contas SET descricao = $2 WHERE id = $1`,
        [fin.conta_divida_id, `Financiamento ${bancoTexto || ''} — ${bem?.name ?? ''}`.trim()],
      )
    }

    return res.json({
      success: true,
      financiamento: {
        id: fin.id,
        banco: bancoTexto,
        banco_favorecido_id: favorecidoId,
        banco_favorecido_nome: favorecido?.name ?? null,
      },
      conta_criada: contaCriada && !contaCriada.ja_existia ? {
        id: contaCriada.id,
        name: contaCriada.name,
        type: contaCriada.type,
        balance: num(contaCriada.balance),
      } : null,
    })
  } catch (err) {
    console.error('[api/financiamento/[id]] PATCH', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
