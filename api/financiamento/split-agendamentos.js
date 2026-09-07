import { query, parseBody, withTransaction } from '../_db.js'
import { requireAuth } from '../_auth.js'
import {
  genId, num, round2, fail, explicarErro, ensureBemSchema,
  COMPONENTE_FIN_UNICO, COMPONENTE_FIN_PRINCIPAL, COMPONENTE_FIN_JUROS,
} from '../_bem.js'

// /api/financiamento/split-agendamentos — separa os agendamentos de parcela ANTIGOS (um por
// parcela, com o valor cheio) nos dois que a criação passou a gerar: principal e juros.
//
//   GET  ?bem_id=&financing_id=  → só conta o que seria migrado (read-only).
//   POST { bem_id?, financing_id? } → migra.
//
// A migração é IN-PLACE, e não DELETE + 2 INSERTs:
//   • o agendamento existente VIRA o de principal (valor → principal, categoria → prestação,
//     tipo_componente → 'financiamento_principal');
//   • um segundo agendamento, o de juros, é inserido do lado dele.
// Apagar o original jogaria fora `registered`/`skipped` — o histórico de quais ocorrências já
// foram baixadas — e o vínculo `financing_installments.schedule_id`, que pagar.js usa. Uma
// parcela já paga voltaria a aparecer como pendente em Contas a Pagar.
//
// Pelo mesmo motivo o agendamento de juros NASCE com o `registered`/`skipped` do principal
// copiado: para uma parcela já quitada ele precisa nascer quitado, senão a separação cria uma
// cobrança que não existe.
//
// IDEMPOTENTE por construção: só entram na lista os agendamentos ainda marcados como
// 'financiamento' (o formato antigo). Depois de migrados eles são 'financiamento_principal' e
// deixam de casar. Rodar duas vezes não duplica nada — por isso não há flag `force`: ela só
// poderia servir para reprocessar o que já está certo, que é exatamente o que duplica.
//
// Parcela sem juros (juros_value = 0) fica como está: um agendamento de R$ 0,00 na tela de
// Contas a Pagar não informa nada.

const SELECT_CANDIDATOS = `
  SELECT a.id, a.description, a.account_id, a.amount, a.payee,
         a.start_date, a.next_occurrence, a.registered, a.skipped,
         a.principal_value, a.juros_value, a.financing_installment_id,
         fi.numero_parcela, fi.schedule_juros_id,
         f.id AS financing_id, f.conta_divida_id, f.num_parcelas,
         c.id AS bem_id, c.name AS bem_nome,
         c.categoria_prestacao_id, c.categoria_taxa_finan_id
    FROM agendamentos a
    JOIN financing_installments fi ON fi.id = a.financing_installment_id
    JOIN financing f ON f.id = fi.financing_id
    JOIN contas c ON c.id = f.bem_id
   WHERE a.tipo_componente = $1
     AND COALESCE(a.juros_value, 0) > 0`

async function buscarCandidatos({ bemId, financingId }) {
  const params = [COMPONENTE_FIN_UNICO]
  let sql = SELECT_CANDIDATOS
  if (bemId) {
    params.push(bemId)
    sql += ` AND f.bem_id = $${params.length}`
  }
  if (financingId) {
    params.push(financingId)
    sql += ` AND f.id = $${params.length}`
  }
  return query(`${sql} ORDER BY f.id, fi.numero_parcela`, params)
}

// Agrupa por bem para o preview: o usuário decide olhando "este carro tem 57 parcelas a
// separar", não olhando 57 linhas iguais.
function resumirPorBem(candidatos) {
  const porBem = new Map()
  for (const c of candidatos) {
    const atual = porBem.get(c.bem_id) || {
      bem_id: c.bem_id,
      bem_nome: c.bem_nome,
      financing_id: c.financing_id,
      agendamentos: 0,
      total_principal: 0,
      total_juros: 0,
      // Sem ela o agendamento de juros nasceria sem categoria — o único motivo de existir da
      // separação. O preview avisa ANTES, em vez de o POST falhar 57 vezes.
      categoria_taxa_ok: !!c.categoria_taxa_finan_id,
      categoria_prestacao_ok: !!c.categoria_prestacao_id,
    }
    atual.agendamentos += 1
    atual.total_principal = round2(atual.total_principal + num(c.principal_value))
    atual.total_juros = round2(atual.total_juros + num(c.juros_value))
    porBem.set(c.bem_id, atual)
  }
  return [...porBem.values()].sort((a, b) => a.bem_nome.localeCompare(b.bem_nome, 'pt-BR'))
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET' && req.method !== 'POST') {
    return fail(res, 405, 'Método não permitido')
  }

  try {
    // `schedule_juros_id` e os marcadores novos são schema recente.
    await ensureBemSchema()

    const body = req.method === 'POST' ? await parseBody(req) : {}
    const bemId = (req.method === 'POST' ? body.bem_id : req.query?.bem_id) || null
    const financingId = (req.method === 'POST' ? body.financing_id : req.query?.financing_id) || null

    const candidatos = await buscarCandidatos({ bemId, financingId })
    const resumo = resumirPorBem(candidatos)

    if (req.method === 'GET') {
      return res.json({
        success: true,
        pendentes: candidatos.length,
        // Cada agendamento vira dois — é o número que a UI mostra no "de X para Y".
        resultado_esperado: candidatos.length * 2,
        bens: resumo,
      })
    }

    const semCategoria = resumo.filter(b => !b.categoria_taxa_ok)
    if (semCategoria.length > 0) {
      return fail(res, 400,
        `parametrize a categoria de Taxa de Financiamento antes de separar: `
        + semCategoria.map(b => b.bem_nome).join(', '))
    }

    const erros = []
    // O agendamento que VIRA o de principal tem `amount` e `category_id` reescritos aqui — e as
    // duas colunas ESTÃO em scheduleToRow. Sem devolvê-las para o app espelhar no estado, o
    // primeiro sync depois da migração reenviaria o valor CHEIO da parcela por cima do
    // principal, e aí a parcela passaria a somar principal cheio + juros: a previsão contaria os
    // juros duas vezes.
    const principaisAtualizados = []
    let sucessos = 0
    let criados = 0

    for (const c of candidatos) {
      // A parcela já tem o agendamento de juros gravado — outra execução (ou uma criação já no
      // formato novo) chegou antes. Retaggear o principal ainda assim deixaria dois agendamentos
      // de juros para a mesma parcela.
      if (c.schedule_juros_id) {
        erros.push({
          agendamento_id: c.id,
          parcela: c.numero_parcela,
          erro: 'parcela já possui agendamento de juros',
        })
        continue
      }

      const principal = round2(num(c.principal_value))
      const juros = round2(num(c.juros_value))
      // O valor do agendamento antigo é a soma dos dois. Se não fecha, o desdobramento gravado
      // não descreve mais essa parcela (edição à mão do valor, por exemplo) e separar aqui
      // criaria duas linhas que somam diferente do que o usuário vê hoje.
      if (Math.abs(round2(principal + juros) - round2(num(c.amount))) > 0.01) {
        erros.push({
          agendamento_id: c.id,
          parcela: c.numero_parcela,
          erro: `principal + juros (${round2(principal + juros)}) não bate com o valor do `
            + `agendamento (${round2(num(c.amount))})`,
        })
        continue
      }

      try {
        const jurosId = genId('sch_fin_j')
        await withTransaction(async (q) => {
          await q(
            `UPDATE agendamentos
                SET amount = $2, category_id = $3, transaction_type = 'transfer',
                    to_account_id = $4, principal_value = $2, juros_value = 0,
                    tipo_componente = $5
              WHERE id = $1`,
            [c.id, principal, c.categoria_prestacao_id || null, c.conta_divida_id || null,
              COMPONENTE_FIN_PRINCIPAL],
          )

          await q(
            `INSERT INTO agendamentos
               (id, description, transaction_type, account_id, to_account_id, amount, category_id,
                frequency, start_date, next_occurrence, occurrence_type, installments,
                auto_register, confirmado, tipo, financing_installment_id,
                registered, skipped, overrides,
                principal_value, juros_value, tipo_componente, payee)
             VALUES ($1, $2, 'expense', $3, NULL, $4, $5, 'once', $6, $7, 'continuous', NULL,
                     FALSE, FALSE, 'financiamento_parcela', $8,
                     $9::jsonb, $10::jsonb, '{}',
                     0, $4, $11, $12)`,
            [jurosId, `${c.description} - Juros`, c.account_id || null, juros,
              c.categoria_taxa_finan_id || null, c.start_date, c.next_occurrence,
              c.financing_installment_id,
              // Copiados do principal: uma parcela já baixada tem que nascer baixada dos dois
              // lados, senão a separação inventa uma cobrança pendente.
              JSON.stringify(c.registered ?? []), JSON.stringify(c.skipped ?? []),
              COMPONENTE_FIN_JUROS, c.payee || null],
          )

          await q(
            `UPDATE financing_installments SET schedule_id = $2, schedule_juros_id = $3
              WHERE id = $1`,
            [c.financing_installment_id, c.id, jurosId],
          )
        })
        sucessos += 1
        criados += 1
        principaisAtualizados.push({
          id: c.id,
          amount: principal,
          category_id: c.categoria_prestacao_id || null,
        })
      } catch (err) {
        erros.push({ agendamento_id: c.id, parcela: c.numero_parcela, erro: explicarErro(err) })
      }
    }

    return res.json({
      success: true,
      processados: candidatos.length,
      sucessos,
      agendamentos_criados: criados,
      // Depois da separação são 2 por parcela migrada: o original (agora principal) + o de juros.
      agendamentos_resultantes: sucessos * 2,
      erros,
      // Ver o comentário de `principaisAtualizados`: o app PRECISA aplicar isto no estado.
      principais_atualizados: principaisAtualizados,
      bens: resumo.map(b => ({ bem_id: b.bem_id, bem_nome: b.bem_nome, agendamentos: b.agendamentos })),
    })
  } catch (err) {
    console.error('[api/financiamento/split-agendamentos]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
