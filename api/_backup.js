// BACKUP COMPLETO DO AMBIENTE — leitura, preparo e restauração no banco. Usado pela rota
// api/backup.js e pelos scripts scripts/backup-exportar.js e scripts/backup-conferir.js (mesmo
// código). Formato e regras puras: src/lib/backupFormato.js.
//
// Todas as funções recebem `q(sql, params) → rows`. A exportação e a conferência rodam numa
// transação com TimeZone UTC (as datas com fuso saem sempre iguais no texto da linha).
//
// RESTAURAÇÃO (aplicarRestauracao) — tudo numa transação só; qualquer erro desfaz tudo:
//   1. confere a versão (compararVersao) e se todas as partes do arquivo chegaram à área de preparo;
//   2. trava as tabelas do backup (ninguém grava durante a troca);
//   3. guarda o que é do destino (título e frase do rodapé);
//   4. desliga os gatilhos do app (updated_at) — cópia fiel, sem regra de gravação;
//   5. apaga as tabelas do backup dos filhos para os pais (ordem das chaves estrangeiras) e grava as
//      linhas do arquivo dos pais para os filhos, direto da área de preparo (jsonb_populate_recordset:
//      o próprio Postgres converte cada valor; coluna que o arquivo não tem fica no valor padrão);
//   6. devolve o rodapé, acerta as sequências, religa os gatilhos;
//   7. recalcula quantidade e impressão digital de cada tabela e compara com o manifesto — diferença
//      desfaz tudo;
//   8. limpa a área de preparo do lote.
// Usuários e acesso (FORA_DO_BACKUP) nunca são tocados.
import { Buffer } from 'node:buffer'
import {
  FORMATO, VERSAO_FORMATO, LIMITE_BYTES_PARTE, FORA_DO_BACKUP, tabelaNoBackup, colunasMantidas, compararVersao, ultimaMigracao,
} from '../src/lib/backupFormato.js'

export class ErroBackup extends Error {
  constructor(msg, status = 409, extra = {}) { super(msg); this.status = status; Object.assign(this, extra) }
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`
const NOME_VALIDO = /^[a-z_][a-z0-9_]*$/

export async function prepararSessao(q) {
  await q("SET LOCAL TimeZone = 'UTC'")
  await q('SET LOCAL extra_float_digits = 1')
}

// ─── Estrutura do banco ─────────────────────────────────────────────────────────────────────────
export async function colunasDoBanco(q) {
  const rows = await q(`SELECT c.table_name AS t, c.column_name AS c
    FROM information_schema.columns c JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' ORDER BY c.table_name, c.ordinal_position`)
  const out = {}
  for (const r of rows) (out[r.t] ||= []).push(r.c)
  return out
}

export async function migracoesDoBanco(q) {
  const [{ existe }] = await q("SELECT to_regclass('public._migracoes') IS NOT NULL AS existe")
  if (!existe) return []
  return (await q('SELECT nome FROM _migracoes ORDER BY nome')).map(r => r.nome)
}

export async function chavesPrimarias(q) {
  const rows = await q(`SELECT tc.table_name AS t, kcu.column_name AS c, kcu.ordinal_position AS o
    FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema AND kcu.table_name = tc.table_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY' ORDER BY 1, 3`)
  const out = {}
  for (const r of rows) (out[r.t] ||= []).push(r.c)
  return out
}

// Arestas filho → pai das chaves estrangeiras entre tabelas do schema public.
export async function vinculos(q) {
  return (await q(`SELECT c.conrelid::regclass::text AS filho, c.confrelid::regclass::text AS pai
    FROM pg_constraint c WHERE c.contype = 'f'`)).map(r => ({ filho: r.filho.replace(/^public\.|"/g, ''), pai: r.pai.replace(/^public\.|"/g, '') }))
}

// Ordem dos pais para os filhos (Kahn, desempate alfabético). Auto-referência e ciclo não travam:
// o que sobrar entra no fim, em ordem alfabética.
export function ordenarPorVinculos(tabelas, arestas) {
  const set = new Set(tabelas)
  const pais = new Map(tabelas.map(t => [t, new Set()]))
  for (const { filho, pai } of arestas) if (set.has(filho) && set.has(pai) && filho !== pai) pais.get(filho).add(pai)
  const feito = []
  const resta = new Set(tabelas)
  for (;;) {
    const prontas = [...resta].filter(t => [...pais.get(t)].every(p => !resta.has(p))).sort()
    if (!prontas.length) break
    for (const t of prontas) { feito.push(t); resta.delete(t) }
  }
  return [...feito, ...[...resta].sort()]
}

// ─── Linha, chave de ordem e impressão digital (iguais na exportação e na conferência) ─────────
function exprLinha(colsExcluir) {
  return colsExcluir.length
    ? `(to_jsonb(t) - ARRAY[${colsExcluir.map(c => `'${c.replace(/'/g, "''")}'`).join(', ')}]::text[])::text`
    : 'to_jsonb(t)::text'
}
function exprChave(cols, pk) {
  if (cols.includes('id')) return 't.id::text'
  if (pk?.length) return pk.map(c => `coalesce(t.${ident(c)}::text, '')`).join(` || E'\\x1f' || `)
  return "''::text"
}
// Colunas que NÃO entram na linha: as mantidas do destino e, na conferência, as que o arquivo não tem.
function excluidas(tabela, colsBanco, colsArquivo = null) {
  const fora = new Set(colunasMantidas(tabela))
  if (colsArquivo) { const a = new Set(colsArquivo); for (const c of colsBanco) if (!a.has(c)) fora.add(c) }
  return colsBanco.filter(c => fora.has(c))
}
const ORDEM = 'ORDER BY k COLLATE "C", x COLLATE "C"'
const subconsulta = (tabela, colsBanco, pk, colsArquivo) =>
  `SELECT ${exprLinha(excluidas(tabela, colsBanco, colsArquivo))} AS x, ${exprChave(colsBanco, pk)} AS k FROM ${ident(tabela)} AS t`

export async function impressaoNoBanco(q, tabela, { colsBanco, pk, colsArquivo = null }) {
  const [r] = await q(`SELECT count(*)::int AS linhas,
      encode(sha256(convert_to(coalesce(string_agg(x, E'\\n' ${ORDEM}), ''), 'UTF8')), 'hex') AS impressao
    FROM (${subconsulta(tabela, colsBanco, pk, colsArquivo)}) s`)
  return { linhas: r.linhas, impressao: r.impressao }
}

// Várias tabelas numa consulta só (UNION ALL): o manifesto e a conferência faziam uma ida ao banco por
// tabela (61 hoje). → { tabela: { linhas, impressao } }
const literal = (s) => `'${String(s).replace(/'/g, "''")}'`
export async function impressoesNoBanco(q, itens) {
  if (!itens.length) return {}
  const sql = itens.map(({ tabela, colsBanco, pk, colsArquivo = null }) => `(SELECT ${literal(tabela)}::text AS tabela, count(*)::int AS linhas,
      encode(sha256(convert_to(coalesce(string_agg(x, E'\\n' ${ORDEM}), ''), 'UTF8')), 'hex') AS impressao
    FROM (${subconsulta(tabela, colsBanco, pk, colsArquivo)}) s)`).join('\nUNION ALL\n')
  return Object.fromEntries((await q(sql)).map(r => [r.tabela, { linhas: r.linhas, impressao: r.impressao }]))
}

// ─── Exportação ─────────────────────────────────────────────────────────────────────────────────
export async function lerEstrutura(q) {
  const [colunas, pks, migracoes] = [await colunasDoBanco(q), await chavesPrimarias(q), await migracoesDoBanco(q)]
  const tabelas = Object.keys(colunas).filter(tabelaNoBackup).sort()
  return { colunas, pks, migracoes, tabelas }
}

export async function gerarManifesto(q, { ambiente, appHash = null, agora = new Date() } = {}) {
  await prepararSessao(q)
  const { colunas, pks, migracoes, tabelas } = await lerEstrutura(q)
  const imps = await impressoesNoBanco(q, tabelas.map(t => ({ tabela: t, colsBanco: colunas[t], pk: pks[t] })))
  const out = {}
  for (const t of tabelas) out[t] = { ...imps[t], colunas: colunas[t].filter(c => !colunasMantidas(t).includes(c)) }
  return {
    formato: FORMATO, versaoFormato: VERSAO_FORMATO,
    ambiente: ambiente || null, geradoEm: agora.toISOString(), appHash,
    schema: { ultima: ultimaMigracao(migracoes), migracoes },
    tabelas: out,
  }
}

// Uma página de linhas de uma tabela, a partir de `offset`, até LIMITE_BYTES_PARTE.
// → { linhas: [texto], proximo: offset | null }
// `estrutura` ({ colunas, pks }) evita reler o catálogo a cada página (script de linha de comando).
export async function lerPagina(q, tabela, offset = 0, { limiteBytes = LIMITE_BYTES_PARTE, lote = 2000, estrutura = null, sessaoPronta = false } = {}) {
  if (!NOME_VALIDO.test(String(tabela)) || !tabelaNoBackup(tabela)) throw new ErroBackup('Tabela fora do backup.', 400)
  if (!sessaoPronta) await prepararSessao(q)
  const cols = (estrutura?.colunas || await colunasDoBanco(q))[tabela]
  if (!cols) throw new ErroBackup(`Tabela inexistente: ${tabela}`, 404)
  const pk = (estrutura?.pks || await chavesPrimarias(q))[tabela]
  const ini = Math.max(0, Math.floor(Number(offset) || 0))
  const rows = await q(`SELECT x FROM (${subconsulta(tabela, cols, pk, null)}) s ${ORDEM} OFFSET $1 LIMIT $2`, [ini, lote + 1])
  const linhas = []
  let bytes = 0
  for (const r of rows.slice(0, lote)) {
    const b = Buffer.byteLength(r.x, 'utf8') + 4
    if (linhas.length && bytes + b > limiteBytes) break
    linhas.push(r.x)
    bytes += b
  }
  const acabou = linhas.length === rows.length // não sobrou nada além do que coube
  return { linhas, proximo: acabou ? null : ini + linhas.length, bytes }
}

// VÁRIAS tabelas numa resposta só, na ordem do backup (alfabética), a partir de `de`/`offset`, até
// `limiteBytes` no total. Uma chamada por tabela (61 hoje, quase todas pequenas, cada uma relendo o
// catálogo) fazia a exportação pela tela levar ~25 s só em idas e voltas. Agora, por chamada: uma
// consulta mede o tamanho das tabelas que faltam, uma consulta (UNION ALL) traz todas as que cabem, e
// a tabela grande que não cabe é paginada sozinha (lerPagina). Mesma linha e mesma ordem de lerPagina.
// → { blocos: [{ tabela, linhas }], proximo: { tabela, offset } | null }
export async function lerPaginas(q, de = null, offset = 0, { limiteBytes = LIMITE_BYTES_PARTE, lote = 2000, estrutura = null } = {}) {
  await prepararSessao(q)
  const est = estrutura || { colunas: await colunasDoBanco(q), pks: await chavesPrimarias(q) }
  const nomes = Object.keys(est.colunas).filter(tabelaNoBackup).sort()
  let i = 0
  if (de != null && de !== '') {
    if (!NOME_VALIDO.test(String(de)) || !tabelaNoBackup(de)) throw new ErroBackup('Tabela fora do backup.', 400)
    i = nomes.indexOf(de)
    if (i < 0) throw new ErroBackup(`Tabela inexistente: ${de}`, 404)
  }
  const blocos = []
  let resta = limiteBytes
  const proxima = (j) => (j < nomes.length ? { tabela: nomes[j], offset: 0 } : null)
  const paginar = async (j, ini) => {
    const r = await lerPagina(q, nomes[j], ini, { limiteBytes: resta, lote, estrutura: est, sessaoPronta: true })
    blocos.push({ tabela: nomes[j], linhas: r.linhas })
    resta -= r.bytes
    return r.proximo
  }
  const sub = (t) => subconsulta(t, est.colunas[t], est.pks[t], null)

  // Continuação de uma tabela grande.
  const ini = Math.max(0, Math.floor(Number(offset) || 0))
  if (ini > 0) {
    const p = await paginar(i, ini)
    if (p != null) return { blocos, proximo: { tabela: nomes[i], offset: p } }
    i++
    if (resta <= 0) return { blocos, proximo: proxima(i) }
  }
  if (i >= nomes.length) return { blocos, proximo: null }

  // Tamanho de cada tabela que falta (os mesmos bytes que lerPagina conta).
  const resto = nomes.slice(i)
  const tam = Object.fromEntries((await q(resto.map(t => `(SELECT ${literal(t)}::text AS tabela,
      coalesce(sum(octet_length(x) + 4), 0)::bigint AS b FROM (${sub(t)}) s)`).join('\nUNION ALL\n'))).map(r => [r.tabela, Number(r.b)]))
  const cabem = []
  for (const t of resto) {
    if (tam[t] > resta) break
    cabem.push(t)
    resta -= tam[t]
  }
  if (cabem.length) {
    const linhas = Object.fromEntries(cabem.map(t => [t, []]))
    const rows = await q(`SELECT tabela, x FROM (${cabem.map((t, n) => `(SELECT ${literal(t)}::text AS tabela, ${n}::int AS ord, x, k FROM (${sub(t)}) s)`).join('\nUNION ALL\n')}) u
      ORDER BY ord, k COLLATE "C", x COLLATE "C"`)
    for (const r of rows) linhas[r.tabela].push(r.x)
    for (const t of cabem) blocos.push({ tabela: t, linhas: linhas[t] })
  }
  const j = i + cabem.length
  if (j >= nomes.length) return { blocos, proximo: null }
  if (cabem.length) return { blocos, proximo: proxima(j) }
  // A próxima tabela sozinha passa do limite: vai em páginas.
  const p = await paginar(j, 0)
  return { blocos, proximo: p != null ? { tabela: nomes[j], offset: p } : proxima(j + 1) }
}

// ─── Restauração: área de preparo ──────────────────────────────────────────────────────────────
export async function preparoExiste(q) {
  const [{ existe }] = await q("SELECT to_regclass('public.backup_preparo') IS NOT NULL AS existe")
  return existe
}
const ERRO_SEM_PREPARO = 'Este ambiente ainda não tem a atualização do banco para restaurar backup (área de preparo). Nada foi alterado.'

export async function gravarParte(q, { loteId, tabela, parte, linhas }) {
  if (!(await preparoExiste(q))) throw new ErroBackup(ERRO_SEM_PREPARO, 409)
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(loteId || ''))) throw new ErroBackup('Lote inválido.', 400)
  if (!NOME_VALIDO.test(String(tabela)) || !tabelaNoBackup(tabela)) throw new ErroBackup('Tabela fora do backup.', 400)
  if (!Array.isArray(linhas) || linhas.some(l => typeof l !== 'string')) throw new ErroBackup('Parte fora do formato.', 400)
  const n = Math.floor(Number(parte))
  if (!(n >= 0)) throw new ErroBackup('Parte inválida.', 400)
  const dados = `[${linhas.join(',')}]`
  try { JSON.parse(dados) } catch { throw new ErroBackup(`Parte ${n} de ${tabela} corrompida (JSON inválido).`, 400) }
  // Restos antigos (restauração abandonada há mais de 1 dia) saem junto.
  await q("DELETE FROM backup_preparo WHERE criado_em < now() - interval '1 day'")
  await q(`INSERT INTO backup_preparo (lote_id, tabela, parte, linhas, dados) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (lote_id, tabela, parte) DO UPDATE SET linhas = EXCLUDED.linhas, dados = EXCLUDED.dados, criado_em = now()`,
  [loteId, tabela, n, linhas.length, dados])
  return { ok: true }
}

export async function limparPreparo(q, loteId = null) {
  if (!(await preparoExiste(q))) return 0
  const r = await q(`DELETE FROM backup_preparo WHERE lote_id = $1 OR criado_em < now() - interval '1 day' RETURNING 1`, [loteId || ''])
  return r.length
}

// Usuários ATIVOS do destino com "perfis permitidos" que não existem entre os perfis informados.
export async function usuariosComPerfisQueSomem(q, perfisIds) {
  const [{ existe }] = await q("SELECT to_regclass('public.usuarios') IS NOT NULL AS existe")
  if (!existe) return []
  const ids = new Set(perfisIds || [])
  const rows = await q('SELECT id, username, nome, perfis_permitidos FROM usuarios WHERE ativo IS NOT FALSE ORDER BY nome')
  const out = []
  for (const u of rows) {
    const pp = typeof u.perfis_permitidos === 'string' ? (() => { try { return JSON.parse(u.perfis_permitidos) } catch { return null } })() : u.perfis_permitidos
    if (!Array.isArray(pp)) continue // "todos"
    const somem = pp.filter(p => !ids.has(p))
    if (somem.length) out.push({ id: u.id, nome: u.nome || u.username, username: u.username, perfisQueSomem: somem, restam: pp.length - somem.length })
  }
  return out
}

// Prévia: versão, quantidades atuais × arquivo, área de preparo.
export async function previa(q, manifesto, perfisIds = []) {
  await prepararSessao(q)
  const { colunas, migracoes, tabelas } = await lerEstrutura(q)
  const versao = compararVersao(manifesto, { migracoes, colunas: Object.fromEntries(tabelas.map(t => [t, colunas[t]])) })
  const atuais = {}
  for (const t of tabelas) atuais[t] = (await q(`SELECT count(*)::int AS n FROM ${ident(t)}`))[0].n
  return {
    versao, atuais, preparo: await preparoExiste(q),
    perfisSomem: await usuariosComPerfisQueSomem(q, perfisIds),
    destino: { ultima: ultimaMigracao(migracoes) },
  }
}

// ─── Restauração: aplicar (DENTRO de uma transação aberta pelo chamador) ───────────────────────
export async function aplicarRestauracao(q, { loteId, manifesto, aoMedir = null }) {
  const t0 = Date.now()
  const passo = (nome) => aoMedir?.(nome, Date.now() - t0)
  await prepararSessao(q)
  await q("SET LOCAL statement_timeout = '120s'")
  if (!(await preparoExiste(q))) throw new ErroBackup(ERRO_SEM_PREPARO, 409)
  if (manifesto?.formato !== FORMATO) throw new ErroBackup('Manifesto inválido.', 400)

  const { colunas, pks, migracoes, tabelas } = await lerEstrutura(q)
  const versao = compararVersao(manifesto, { migracoes, colunas: Object.fromEntries(tabelas.map(t => [t, colunas[t]])) })
  if (versao.recusar.length) throw new ErroBackup(versao.recusar.join(' '), 409, { versao })

  // Todas as partes chegaram?
  const recebido = Object.fromEntries((await q(
    'SELECT tabela, sum(linhas)::int AS n FROM backup_preparo WHERE lote_id = $1 GROUP BY tabela', [loteId],
  )).map(r => [r.tabela, r.n]))
  const faltando = Object.entries(manifesto.tabelas).filter(([t, i]) => (recebido[t] || 0) !== Number(i.linhas)).map(([t]) => t)
  if (faltando.length) throw new ErroBackup(`O envio do arquivo não terminou (${faltando.slice(0, 5).join(', ')}${faltando.length > 5 ? '…' : ''}). Nada foi alterado.`, 409)
  passo('conferido')

  const ordem = ordenarPorVinculos(tabelas, await vinculos(q))
  await q(`LOCK TABLE ${ordem.map(ident).join(', ')} IN ACCESS EXCLUSIVE MODE`)

  // Do destino: título e frase do rodapé (por id da linha de configurações).
  const mantidos = {}
  for (const [t, cols] of Object.entries({ configuracoes: colunasMantidas('configuracoes') })) {
    const presentes = cols.filter(c => colunas[t]?.includes(c))
    if (!presentes.length || !colunas[t].includes('id')) continue
    mantidos[t] = { cols: presentes, rows: await q(`SELECT id, ${presentes.map(ident).join(', ')} FROM ${ident(t)}`) }
  }

  const comGatilho = new Set((await q(`SELECT DISTINCT c.relname AS t FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT g.tgisinternal`)).map(r => r.t))
  for (const t of ordem) if (comGatilho.has(t)) await q(`ALTER TABLE ${ident(t)} DISABLE TRIGGER USER`)

  for (const t of [...ordem].reverse()) await q(`DELETE FROM ${ident(t)}`)
  passo('apagado')
  for (const t of ordem) {
    const info = manifesto.tabelas[t]
    if (!info || !Number(info.linhas)) continue
    const cols = (info.colunas || []).filter(c => colunas[t].includes(c))
    const lista = cols.map(ident).join(', ')
    await q(`INSERT INTO ${ident(t)} (${lista})
      SELECT ${cols.map(c => `r.${ident(c)}`).join(', ')}
        FROM backup_preparo p CROSS JOIN LATERAL jsonb_populate_recordset(NULL::${ident(t)}, p.dados::jsonb) AS r
       WHERE p.lote_id = $1 AND p.tabela = $2`, [loteId, t])
  }
  passo('gravado')

  for (const [t, { cols, rows }] of Object.entries(mantidos)) {
    for (const r of rows) {
      await q(`UPDATE ${ident(t)} SET ${cols.map((c, i) => `${ident(c)} = $${i + 2}`).join(', ')} WHERE id = $1`, [r.id, ...cols.map(c => r[c])])
    }
  }
  // Sequências (ids seriais): continuam do maior id gravado.
  const seqs = await q(`SELECT table_name AS t, column_name AS c FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`)
  for (const { t, c } of seqs) {
    if (!ordem.includes(t)) continue
    await q(`SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT max(${ident(c)}) FROM ${ident(t)}), 0) + 1, false)`, [`public.${t}`, c])
  }
  for (const t of ordem) if (comGatilho.has(t)) await q(`ALTER TABLE ${ident(t)} ENABLE TRIGGER USER`)

  // Conferência dentro da transação: diferente → desfaz tudo.
  const conferencia = await conferirNoBanco(q, manifesto, { colunas, pks })
  const diferentes = conferencia.filter(c => !c.ok)
  if (diferentes.length) {
    throw new ErroBackup(`A cópia não ficou idêntica ao arquivo (${diferentes.map(d => d.tabela).slice(0, 5).join(', ')}). Nada foi alterado.`, 409, { conferencia })
  }
  passo('conferido_depois')
  await q('DELETE FROM backup_preparo WHERE lote_id = $1', [loteId])
  return { conferencia, versao, tempoMs: Date.now() - t0 }
}

// ─── Conferência (com ou sem restauração) ───────────────────────────────────────────────────────
// → [{ tabela, arquivo: { linhas, impressao }, banco: { linhas, impressao } | null, ok, motivo? }]
// Inclui as tabelas do banco que o arquivo não traz (ok só se estiverem vazias).
export async function conferirNoBanco(q, manifesto, estrutura = null) {
  await prepararSessao(q)
  const { colunas, pks } = estrutura || await lerEstrutura(q)
  const out = []
  const doArquivo = Object.entries(manifesto.tabelas || {}).sort(([a], [b]) => a.localeCompare(b))
  const comparaveis = doArquivo.filter(([t, info]) => colunas[t] && (info.colunas || []).every(c => colunas[t].includes(c)))
  const imps = await impressoesNoBanco(q, comparaveis.map(([t, info]) => ({ tabela: t, colsBanco: colunas[t], pk: pks[t], colsArquivo: info.colunas })))
  for (const [t, info] of doArquivo) {
    const arquivo = { linhas: Number(info.linhas), impressao: info.impressao }
    if (!colunas[t]) { out.push({ tabela: t, arquivo, banco: null, ok: false, motivo: 'tabela não existe neste banco' }); continue }
    const faltam = (info.colunas || []).filter(c => !colunas[t].includes(c))
    if (faltam.length) { out.push({ tabela: t, arquivo, banco: null, ok: false, motivo: `colunas que este banco não tem: ${faltam.join(', ')}` }); continue }
    const banco = imps[t]
    out.push({ tabela: t, arquivo, banco, ok: banco.linhas === arquivo.linhas && banco.impressao === arquivo.impressao })
  }
  for (const t of Object.keys(colunas).filter(tabelaNoBackup).sort()) {
    if (manifesto.tabelas?.[t]) continue
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM ${ident(t)}`)
    out.push({ tabela: t, arquivo: null, banco: { linhas: n, impressao: null }, ok: n === 0, motivo: 'tabela que o arquivo não traz' })
  }
  return out
}

export { FORA_DO_BACKUP }
