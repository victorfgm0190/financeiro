import { query, parseBody } from './_db.js'
import { registroPorBanco } from './_conexao.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { TELAS_COM_GUIA, ETAPAS_CHECKLIST } from '../src/lib/ajudaTelas.js'
import { TODAS_AS_TAREFAS } from '../src/lib/tarefasGuiadas.js'

// BOAS-VINDAS e GUIA DA TELA do usuário logado (preferências pessoais, no banco do ambiente — não no
// navegador, para valerem em todos os aparelhos). O user_id vem SEMPRE da sessão, nunca do corpo.
//   GET                                   → { tourVistoEm, checklistOcultoEm, guiasLigados, guiasOcultos: [telaId] }
//   POST { guiasLigados: true|false }     → interruptor geral dos guias (desligado: nada abre sozinho)
//   POST { ajudaCampos: true|false }      → mostrar os ícones ⓘ de ajuda nos campos (padrão: ligados)
//   POST { guiaReativar: '<tela>' }       → o tour desta tela volta a abrir sozinho
//   POST { etapa: '<id>', estado }        → checklist "Primeiros passos": 'pulada' | 'nao-se-aplica' |
//                                           'feita' (etapas sem dado próprio, ex.: usou o Assistente) |
//                                           null (desfaz). Fica em progresso.etapas.<id> = { estado, em }.
//   POST { tarefaConcluida: '<id>' }      → tarefa guiada "Faça comigo" concluída (progresso.tarefas.<id> = data)
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
// Interruptor geral dos guias (por usuário). Desligado: nenhum tour/guia abre sozinho e o "?" some;
// as marcações de cada tela (guia_telas_ocultas) ficam guardadas para quando religar.
export const DDL_GUIAS_LIGADOS = 'ALTER TABLE boas_vindas_usuario ADD COLUMN IF NOT EXISTS guias_ligados BOOLEAN NOT NULL DEFAULT true'
// Ícones ⓘ de ajuda nos campos (por usuário, padrão ligado). Desligado: o HelpCampo não aparece.
export const DDL_AJUDA_CAMPOS = 'ALTER TABLE boas_vindas_usuario ADD COLUMN IF NOT EXISTS ajuda_campos BOOLEAN NOT NULL DEFAULT true'
// Progresso dos Primeiros passos (e, depois, das tarefas guiadas): { etapas: { <id>: { estado, em } } }.
export const DDL_PROGRESSO = "ALTER TABLE boas_vindas_usuario ADD COLUMN IF NOT EXISTS progresso JSONB NOT NULL DEFAULT '{}'::jsonb"
export const ESTADOS_ETAPA = ['pulada', 'nao-se-aplica', 'feita']
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
  await query(DDL_GUIAS_LIGADOS)
  await query(DDL_AJUDA_CAMPOS)
  await query(DDL_PROGRESSO)
  await query(DDL_GUIAS)
  pronto.marcar()
}

const linhaParaJson = (r) => ({
  tourVistoEm: r?.tour_visto_em || null, checklistOcultoEm: r?.checklist_oculto_em || null, guiasLigados: r?.guias_ligados !== false, ajudaCampos: r?.ajuda_campos !== false,
  progresso: r?.progresso && typeof r.progresso === 'object' ? r.progresso : {},
})

// Tarefa guiada concluída (só ids conhecidos). Guarda a primeira data.
export async function gravarTarefaConcluida(q, userId, tarefaId) {
  if (!TODAS_AS_TAREFAS.some(t => t.id === tarefaId)) return null
  const [r] = await q(
    `INSERT INTO boas_vindas_usuario (user_id, progresso)
       VALUES ($1, jsonb_build_object('tarefas', jsonb_build_object($2::text, to_jsonb(now()))))
     ON CONFLICT (user_id) DO UPDATE SET progresso = CASE
         WHEN boas_vindas_usuario.progresso->'tarefas' ? $2::text THEN boas_vindas_usuario.progresso
         ELSE jsonb_set(jsonb_set(boas_vindas_usuario.progresso, '{tarefas}', COALESCE(boas_vindas_usuario.progresso->'tarefas', '{}'::jsonb)), ARRAY['tarefas', $2::text], to_jsonb(now()))
       END, updated_at = now()
     RETURNING tour_visto_em, checklist_oculto_em, guias_ligados, ajuda_campos, progresso`,
    [userId, tarefaId],
  )
  return linhaParaJson(r)
}

// Estado de UMA etapa do checklist (null = volta a pendente). Etapa/estado desconhecidos → null.
export async function gravarEtapa(q, userId, etapa, estado) {
  if (!ETAPAS_CHECKLIST.includes(etapa)) return null
  if (estado !== null && !ESTADOS_ETAPA.includes(estado)) return null
  const valor = estado === null ? null : JSON.stringify({ estado, em: new Date().toISOString() })
  const [r] = await q(
    `INSERT INTO boas_vindas_usuario (user_id, progresso)
       VALUES ($1, CASE WHEN $3::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('etapas', jsonb_build_object($2::text, $3::jsonb)) END)
     ON CONFLICT (user_id) DO UPDATE SET progresso = CASE
         WHEN $3::jsonb IS NULL THEN boas_vindas_usuario.progresso #- ARRAY['etapas', $2::text]
         ELSE jsonb_set(jsonb_set(boas_vindas_usuario.progresso, '{etapas}', COALESCE(boas_vindas_usuario.progresso->'etapas', '{}'::jsonb)), ARRAY['etapas', $2::text], $3::jsonb)
       END, updated_at = now()
     RETURNING tour_visto_em, checklist_oculto_em, guias_ligados, ajuda_campos, progresso`,
    [userId, etapa, valor],
  )
  return linhaParaJson(r)
}

export async function gravarAjudaCampos(q, userId, ligada) {
  const [r] = await q(
    `INSERT INTO boas_vindas_usuario (user_id, ajuda_campos) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET ajuda_campos = EXCLUDED.ajuda_campos, updated_at = now()
     RETURNING tour_visto_em, checklist_oculto_em, guias_ligados, ajuda_campos, progresso`,
    [userId, !!ligada],
  )
  return linhaParaJson(r)
}

export async function gravarGuiasLigados(q, userId, ligados) {
  const [r] = await q(
    `INSERT INTO boas_vindas_usuario (user_id, guias_ligados) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET guias_ligados = EXCLUDED.guias_ligados, updated_at = now()
     RETURNING tour_visto_em, checklist_oculto_em, guias_ligados, ajuda_campos, progresso`,
    [userId, !!ligados],
  )
  return linhaParaJson(r)
}

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
     RETURNING tour_visto_em, checklist_oculto_em, guias_ligados, ajuda_campos, progresso`,
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
export const reativarGuia = (q, userId, tela) => q('DELETE FROM guia_telas_ocultas WHERE user_id = $1 AND tela_id = $2', [userId, tela])
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
      const [r] = await query('SELECT tour_visto_em, checklist_oculto_em, guias_ligados, ajuda_campos, progresso FROM boas_vindas_usuario WHERE user_id = $1', [userId])
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
      if (typeof body?.guiaReativar === 'string') { await reativarGuia(query, userId, body.guiaReativar); fez = true }
      if (typeof body?.guiasLigados === 'boolean') { await gravarGuiasLigados(query, userId, body.guiasLigados); fez = true }
      if (typeof body?.ajudaCampos === 'boolean') { await gravarAjudaCampos(query, userId, body.ajudaCampos); fez = true }
      if (typeof body?.tarefaConcluida === 'string') {
        if (!(await gravarTarefaConcluida(query, userId, body.tarefaConcluida))) return res.status(400).json({ error: 'Tarefa desconhecida' })
        fez = true
      }
      if (typeof body?.etapa === 'string' && 'estado' in body) {
        if (!(await gravarEtapa(query, userId, body.etapa, body.estado ?? null))) return res.status(400).json({ error: 'Etapa ou estado desconhecido' })
        fez = true
      }
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
