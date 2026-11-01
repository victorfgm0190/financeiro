import { query, parseBody } from './_db.js'
import { registroPorBanco } from './_conexao.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'

// BOAS-VINDAS do usuário logado: se já viu o tour e se ocultou o checklist "Primeiros passos".
// Gravado no banco do ambiente (não no navegador) para não reaparecer em outro aparelho.
//   GET                                   → { tourVistoEm, checklistOcultoEm }
//   POST { tourVisto: true }              → marca o tour como visto (pular ou concluir)
//   POST { checklistOculto: true|false }  → oculta (ou volta a mostrar) o checklist
// user_id sem FK: o login de emergência tem id 'env:<usuário>' e não tem linha em usuarios.
export const DDL_BOAS_VINDAS = `CREATE TABLE IF NOT EXISTS boas_vindas_usuario (
    user_id TEXT PRIMARY KEY,
    tour_visto_em TIMESTAMPTZ,
    checklist_oculto_em TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`

// "Já rodei" POR BANCO (um database por ambiente).
const pronto = registroPorBanco()
export async function ensureBoasVindasSchema() {
  if (pronto.jaRodou()) return
  await query(DDL_BOAS_VINDAS)
  pronto.marcar()
}

const linhaParaJson = (r) => ({ tourVistoEm: r?.tour_visto_em || null, checklistOcultoEm: r?.checklist_oculto_em || null })

// Só os campos pedidos mudam; o resto da linha fica como está.
export async function gravarBoasVindas(q, userId, { tourVisto, checklistOculto }) {
  const sets = []
  if (tourVisto === true) sets.push('tour_visto_em = COALESCE(boas_vindas_usuario.tour_visto_em, now())')
  if (checklistOculto === true) sets.push('checklist_oculto_em = now()')
  if (checklistOculto === false) sets.push('checklist_oculto_em = NULL')
  if (!sets.length) return null
  const [r] = await q(
    `INSERT INTO boas_vindas_usuario (user_id, tour_visto_em, checklist_oculto_em)
       VALUES ($1, ${tourVisto === true ? 'now()' : 'NULL'}, ${checklistOculto === true ? 'now()' : 'NULL'})
     ON CONFLICT (user_id) DO UPDATE SET ${sets.join(', ')}, updated_at = now()
     RETURNING tour_visto_em, checklist_oculto_em`,
    [userId],
  )
  return linhaParaJson(r)
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  const userId = req.user?.id
  if (!userId) return res.status(400).json({ error: 'Sessão sem usuário' })
  try {
    await ensureBoasVindasSchema()
    if (req.method === 'GET') {
      const [r] = await query('SELECT tour_visto_em, checklist_oculto_em FROM boas_vindas_usuario WHERE user_id = $1', [userId])
      return res.json(linhaParaJson(r))
    }
    if (req.method === 'POST') {
      const body = await parseBody(req)
      const out = await gravarBoasVindas(query, userId, { tourVisto: body?.tourVisto, checklistOculto: body?.checklistOculto })
      if (!out) return res.status(400).json({ error: 'Nada para gravar' })
      return res.json(out)
    }
    return res.status(405).end()
  } catch (err) {
    console.error('[api/boas-vindas]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
