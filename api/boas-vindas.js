import { query, parseBody } from './_db.js'
import { registroPorBanco } from './_conexao.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { TELAS_COM_GUIA } from '../src/lib/ajudaTelas.js'

// BOAS-VINDAS e GUIA DA TELA do usuário logado (preferências pessoais, no banco do ambiente — não no
// navegador, para valerem em todos os aparelhos). O user_id vem SEMPRE da sessão, nunca do corpo.
//   GET                                   → { tourVistoEm, checklistOcultoEm, guiasOcultos: [telaId] }
//   POST { tourVisto: true }              → marca o tour como visto (pular ou concluir)
//   POST { checklistOculto: true|false }  → oculta (ou volta a mostrar) o checklist
//   POST { guiaOculto: '<tela>' }         → "Não mostrar mais" o guia desta tela
//   POST { guiasTodos: true }             → desativa o guia de todas as telas
//   DELETE                                → reativa todos os guias
// user_id sem FK: o login de emergência tem id 'env:<usuário>' e não tem linha em usuarios.
export const DDL_BOAS_VINDAS = `CREATE TABLE IF NOT EXISTS boas_vindas_usuario (
    user_id TEXT PRIMARY KEY,
    tour_visto_em TIMESTAMPTZ,
    checklist_oculto_em TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`
export const DDL_GUIAS = `CREATE TABLE IF NOT EXISTS guia_telas_ocultas (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    tela_id TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, tela_id)
  )`

// "Já rodei" POR BANCO (um database por ambiente).
const pronto = registroPorBanco()
export async function ensureBoasVindasSchema() {
  if (pronto.jaRodou()) return
  await query(DDL_BOAS_VINDAS)
  await query(DDL_GUIAS)
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

// Telas com guia marcadas como "Não mostrar mais". Só ids conhecidos (src/lib/ajudaTelas.js).
export async function ocultarGuias(q, userId, telas) {
  const validas = [...new Set(telas)].filter(t => TELAS_COM_GUIA.includes(t))
  if (!validas.length) return 0
  await q(
    `INSERT INTO guia_telas_ocultas (user_id, tela_id) SELECT $1, unnest($2::text[])
     ON CONFLICT (user_id, tela_id) DO NOTHING`,
    [userId, validas],
  )
  return validas.length
}
export const reativarGuias = (q, userId) => q('DELETE FROM guia_telas_ocultas WHERE user_id = $1', [userId])
export const listarGuiasOcultos = async (q, userId) =>
  (await q('SELECT tela_id FROM guia_telas_ocultas WHERE user_id = $1 ORDER BY tela_id', [userId])).map(r => r.tela_id)

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  const userId = req.user?.id
  if (!userId) return res.status(400).json({ error: 'Sessão sem usuário' })
  try {
    await ensureBoasVindasSchema()
    const resposta = async () => {
      const [r] = await query('SELECT tour_visto_em, checklist_oculto_em FROM boas_vindas_usuario WHERE user_id = $1', [userId])
      return { ...linhaParaJson(r), guiasOcultos: await listarGuiasOcultos(query, userId) }
    }
    if (req.method === 'GET') return res.json(await resposta())
    if (req.method === 'POST') {
      const body = await parseBody(req)
      let fez = false
      if (body?.tourVisto === true || typeof body?.checklistOculto === 'boolean') {
        fez = !!(await gravarBoasVindas(query, userId, { tourVisto: body.tourVisto, checklistOculto: body.checklistOculto }))
      }
      if (typeof body?.guiaOculto === 'string') {
        if (!(await ocultarGuias(query, userId, [body.guiaOculto]))) return res.status(400).json({ error: 'Tela desconhecida' })
        fez = true
      }
      if (body?.guiasTodos === true) { await ocultarGuias(query, userId, TELAS_COM_GUIA); fez = true }
      if (!fez) return res.status(400).json({ error: 'Nada para gravar' })
      return res.json(await resposta())
    }
    if (req.method === 'DELETE') {
      await reativarGuias(query, userId)
      return res.json(await resposta())
    }
    return res.status(405).end()
  } catch (err) {
    console.error('[api/boas-vindas]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
