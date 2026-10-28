import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { contextoPerfis, recortarLeitura } from './_permissoesApi.js'
import { comAmbiente } from './_ambiente.js'
import { faixaValorCentavos, modoValor } from '../src/lib/buscaGlobal.js'

// Busca Global combinada: lançamentos (lancamentos) + agendamentos (agendamentos).
// Filtros: value + valueMode ('exato' = mesmo valor; 'aproximado' = mesma parte inteira), em
// centavos e pelo valor absoluto; description e payee (ILIKE, combinados com E); text (legado:
// descrição OU favorecido); from/to (período); profileId (filtra pelas contas do perfil ativo).
// O status (pago/não pago) e o status de recorrência dos agendamentos são refinados no frontend,
// que tem a lógica de ocorrências.
const LIMIT = 50

// WHERE parametrizado de cada tabela. Nada vindo do corpo é concatenado no SQL: só entra em params.
export function filtrosBusca({ value, valueMode, text, description, payee, from, to, accIds }) {
  const faixa = faixaValorCentavos(value, modoValor(valueMode))
  const likes = [
    [(text || '').trim(), (i) => `(description ILIKE $${i} OR payee ILIKE $${i})`],
    [(description || '').trim(), (i) => `description ILIKE $${i}`],
    [(payee || '').trim(), (i) => `payee ILIKE $${i}`],
  ].filter(([t]) => t)

  const montar = (tabela) => {
    const where = []
    const params = []
    const p = (v) => { params.push(v); return params.length }
    if (faixa) where.push(`ROUND(ABS(amount)::numeric * 100) BETWEEN $${p(faixa[0])} AND $${p(faixa[1])}`)
    for (const [t, sql] of likes) where.push(sql(p(`%${t}%`)))
    if (tabela === 'tx') {
      if (from) where.push(`date >= $${p(from)}`)
      if (to) where.push(`date <= $${p(to)}`)
      // Sombras automáticas de reserva/investimento (reserva_auto, sem conta) não são itens da
      // busca — a transferência de origem as representa (e ganha o selo no front).
      where.push(`reserva_auto IS NOT TRUE`)
      if (accIds) { const i = p(accIds); where.push(`(account_id = ANY($${i}) OR to_account_id = ANY($${i}))`) }
    } else {
      // Período: começou até a data final; a recorrência é resolvida no front.
      if (to) where.push(`start_date <= $${p(to)}`)
      if (accIds) where.push(`(account_id IS NULL OR account_id = ANY($${p(accIds)}))`)
    }
    return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params }
  }
  return { tx: montar('tx'), sc: montar('sc') }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { value, valueMode, text, description, payee, from, to, profileId } = await parseBody(req)

    // Perfil ativo: ids das contas que pertencem a ele.
    let accIds = null
    if (profileId) {
      const rows = await query(`SELECT id FROM contas WHERE profile_id = $1`, [profileId])
      accIds = rows.map(r => r.id)
      if (accIds.length === 0) accIds = ['__none__'] // garante conjunto vazio
    }

    const f = filtrosBusca({ value, valueMode, text, description, payee, from, to, accIds })
    const txRows = await query(`SELECT * FROM lancamentos ${f.tx.where} ORDER BY date DESC NULLS LAST LIMIT ${LIMIT}`, f.tx.params)
    const scRows = await query(`SELECT * FROM agendamentos ${f.sc.where} ORDER BY start_date DESC NULLS LAST LIMIT ${LIMIT}`, f.sc.params)

    // Perfis permitidos do usuário: só o que pertence às contas desses perfis.
    const ctx = await contextoPerfis(query, req.user)
    res.json({ transactions: recortarLeitura('lancamentos', txRows, ctx), schedules: recortarLeitura('agendamentos', scRows, ctx) })
  } catch (err) {
    console.error('[api/search]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
