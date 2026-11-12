import process from 'node:process'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { parseBody, withTransaction } from './_db.js'
import { centralQuery } from './_central.js'
import { temTodosPerfis } from '../src/lib/permissoes.js'
import { novaReferencia, registrarErro } from './_erro.js'
import {
  ErroBackup, gerarManifesto, lerPagina, lerPaginas, gravarParte, previa, aplicarRestauracao, conferirNoBanco, limparPreparo,
  usuariosComPerfisQueSomem,
} from './_backup.js'

// BACKUP COMPLETO DO AMBIENTE (Configurações → Backup). Só administrador com acesso a TODOS os perfis.
//   GET  ?acao=manifesto                         → { manifesto }  (contagem + impressão digital por tabela)
//   GET  ?acao=paginas&de=x&offset=n             → { blocos: [{ tabela, linhas }], proximo }  (várias tabelas, até ~2 MB)
//   GET  ?acao=pagina&tabela=x&offset=n          → { linhas, proximo }  (uma tabela, até ~2 MB)
//   POST { acao: 'previa', manifesto, perfis }   → versão, quantidades atuais, perfis que somem, agenda
//   POST { acao: 'parte', loteId, tabela, parte, linhas } → grava uma parte na área de preparo
//   POST { acao: 'aplicar', loteId, manifesto, perfis }   → restaura tudo numa transação + conferência
//   POST { acao: 'conferir', manifesto }         → conferência do arquivo × banco, sem restaurar
//   POST { acao: 'limpar', loteId }              → descarta o lote (e restos antigos)
// Regras e passos: api/_backup.js. Formato: src/lib/backupFormato.js.

const SO_ADMIN = 'Backup e restauração: só administrador com acesso a todos os perfis.'

async function assinaturasDaAgenda(sigla) {
  try {
    const [r] = await centralQuery('SELECT count(*)::int AS n FROM agenda_feeds WHERE ambiente_sigla = $1 AND revogado_em IS NULL', [sigla])
    return r?.n ?? 0
  } catch { return null } // central sem a tabela: sem aviso
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.user.nivel !== 'admin' || !temTodosPerfis(req.user.perfis)) return res.status(403).json({ error: SO_ADMIN })
  const sigla = req.ambiente?.sigla || null
  try {
    if (req.method === 'GET') {
      const acao = req.query?.acao
      if (acao === 'manifesto') {
        const manifesto = await withTransaction(async (q) => {
          await q('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
          return gerarManifesto(q, { ambiente: sigla, appHash: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null })
        })
        return res.json({ manifesto })
      }
      if (acao === 'paginas') {
        const r = await withTransaction(async (q) => {
          await q('SET TRANSACTION READ ONLY')
          return lerPaginas(q, req.query.de ? String(req.query.de) : null, Number(req.query.offset) || 0)
        })
        return res.json(r)
      }
      if (acao === 'pagina') {
        const r = await withTransaction(async (q) => {
          await q('SET TRANSACTION READ ONLY')
          return lerPagina(q, String(req.query.tabela || ''), Number(req.query.offset) || 0)
        })
        return res.json(r)
      }
      return res.status(400).json({ error: 'Ação desconhecida' })
    }
    if (req.method !== 'POST') return res.status(405).end()
    const b = await parseBody(req)
    const perfis = Array.isArray(b.perfis) ? b.perfis.filter(p => typeof p === 'string') : []
    switch (b.acao) {
      case 'previa': {
        const r = await withTransaction(async (q) => { await q('SET TRANSACTION READ ONLY'); return previa(q, b.manifesto || {}, perfis) })
        return res.json({ ...r, agenda: { assinaturas: await assinaturasDaAgenda(sigla) }, destino: { ...r.destino, ambiente: sigla } })
      }
      case 'parte':
        return res.json(await withTransaction((q) => gravarParte(q, b)))
      case 'aplicar': {
        const r = await withTransaction((q) => aplicarRestauracao(q, { loteId: b.loteId, manifesto: b.manifesto }))
        const perfisSomem = await withTransaction((q) => usuariosComPerfisQueSomem(q, perfis))
        console.log('[api/backup] restaurado', JSON.stringify({ ambiente: sigla, origem: b.manifesto?.ambiente, tempoMs: r.tempoMs }))
        return res.json({ ...r, perfisSomem })
      }
      case 'conferir': {
        const conferencia = await withTransaction(async (q) => { await q('SET TRANSACTION READ ONLY'); return conferirNoBanco(q, b.manifesto || {}) })
        return res.json({ conferencia })
      }
      case 'limpar':
        return res.json({ apagadas: await withTransaction((q) => limparPreparo(q, b.loteId)) })
      default:
        return res.status(400).json({ error: 'Ação desconhecida' })
    }
  } catch (err) {
    if (err instanceof ErroBackup) return res.status(err.status).json({ error: err.message, versao: err.versao, conferencia: err.conferencia })
    const ref = novaReferencia()
    registrarErro('api/backup', err, ref)
    return res.status(500).json({ error: `Falha no backup. Nada foi alterado. (código ${ref})`, ref })
  }
}

export default comAmbiente(handler)
