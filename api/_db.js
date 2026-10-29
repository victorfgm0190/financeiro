import { poolDoContexto, bancoAtual } from './_conexao.js'

// Todas as funções daqui usam o banco do AMBIENTE da requisição (api/_conexao.js): o handler roda
// dentro de comAmbiente() (api/_ambiente.js). Sem contexto de ambiente, getPool() lança — nunca há
// um banco padrão. O banco central da plataforma é acessado por api/_central.js.
const getPool = () => poolDoContexto()

export async function query(sql, params = []) {
  const { rows } = await getPool().query(sql, params)
  return rows
}

// Postgres limita o protocolo a 65.535 bind-parameters por comando. Chunkamos as rows para
// nunca chegar perto disso (nº de params = rows_no_chunk × nº_de_colunas).
const MAX_BIND_PARAMS = 60000
const MAX_CHUNK_ROWS = 500

// Campos de parcela de lancamentos que um UPDATE nunca pode apagar. O sync manda TODAS as linhas a
// cada gravação (syncSection), então qualquer cópia do lançamento sem esses campos — um formulário
// de edição que os devolvia null, uma aba com estado antigo — zerava o vínculo da série no banco.
// Com a proteção, NULL vindo do app mantém o valor gravado; valor novo não-nulo continua valendo.
// A limpeza intencional ("Marcar como à vista") manda _limpar_parcela = true e grava o NULL.
export const CAMPOS_PARCELA_PROTEGIDOS = ['installment_num', 'installment_total', 'installment_key', 'serie_id']
export const FLAG_LIMPAR_PARCELA = '_limpar_parcela'

// Nome de tabela/coluna não vai como parâmetro ($n): entra no texto do SQL. Por isso só passa nome
// simples em minúsculas (sem aspas, espaço, ponto-e-vírgula…), e sempre entre aspas duplas — nada
// que veio do navegador vira SQL. Fora do padrão → ErroIdentificador (400 no /api/sync).
export const IDENT = /^[a-z_][a-z0-9_]*$/
export class ErroIdentificador extends Error {
  constructor(message) {
    super(message)
    this.status = 400
  }
}
export function citarIdent(nome) {
  if (typeof nome !== 'string' || !IDENT.test(nome)) {
    throw new ErroIdentificador(`Nome inválido de tabela/coluna: ${JSON.stringify(String(nome).slice(0, 60))}`)
  }
  return `"${nome}"`
}

// SQL do upsert de um lote. `preservarSeNulo`: colunas cujo valor gravado vence um NULL de entrada.
export function montarUpsertSql(table, cols, nRows, conflictCol, preservarSeNulo = []) {
  const t = citarIdent(table)
  const conflito = citarIdent(conflictCol)
  let idx = 1
  const values = Array.from({ length: nRows }, () => `(${cols.map(() => `$${idx++}`).join(', ')})`).join(', ')
  // Quando cols só tem a coluna de conflito, o SET fica vazio ("DO UPDATE SET " sem nada
  // depois) → "syntax error at end of input". Nesse caso não há o que atualizar: DO NOTHING.
  const updateCols = cols.filter(c => c !== conflictCol)
  const preservar = new Set(preservarSeNulo)
  const set = (c) => {
    const col = citarIdent(c)
    return preservar.has(c) ? `${col} = COALESCE(EXCLUDED.${col}, ${t}.${col})` : `${col} = EXCLUDED.${col}`
  }
  const conflictClause = updateCols.length === 0
    ? `ON CONFLICT (${conflito}) DO NOTHING`
    : `ON CONFLICT (${conflito}) DO UPDATE SET ${updateCols.map(set).join(', ')}`
  return `INSERT INTO ${t} (${cols.map(citarIdent).join(', ')}) VALUES ${values} ${conflictClause}`
}

// Separa as linhas de lancamentos em protegidas × limpeza intencional e tira a flag (não é coluna).
export function separarLimpezaDeParcela(rows) {
  const protegidas = []
  const limpar = []
  for (const r of rows) {
    if (!(FLAG_LIMPAR_PARCELA in r)) { protegidas.push(r); continue }
    const { [FLAG_LIMPAR_PARCELA]: flag, ...resto } = r
    ;(flag ? limpar : protegidas).push(resto)
  }
  return { protegidas, limpar }
}

// Colunas Postgres ARRAY (TEXT[]) por tabela. O resto dos arrays/objetos do app mora em JSONB e
// vai como JSON; um TEXT[] recebendo '["a"]' quebraria ("malformed array literal") — esses vão
// como array JS, que o driver pg serializa no formato de array do Postgres.
export const COLUNAS_TEXT_ARRAY = { categorias: ['perfil_ids'] }

export function serializarParam(table, col, v) {
  if (v === null || v === undefined) return null
  if (Array.isArray(v) && COLUNAS_TEXT_ARRAY[table]?.includes(col)) return v.map(String)
  if (Array.isArray(v) || (typeof v === 'object' && !(v instanceof Date))) return JSON.stringify(v)
  return v
}

// Executa um único INSERT ... ON CONFLICT para um lote de rows homogêneas (mesmas colunas).
async function upsertChunk(client, table, cols, rows, conflictCol, preservarSeNulo = []) {
  // Guardas: rows/cols vazios geram VALUES vazio → "syntax error at end of input".
  if (!rows || rows.length === 0 || !cols || cols.length === 0) return 0

  const params = rows.flatMap(row => cols.map(c => serializarParam(table, c, row[c])))
  const sql = montarUpsertSql(table, cols, rows.length, conflictCol, preservarSeNulo)
  try {
    // rowCount conta inseridas + atualizadas. Devolvido para cima porque um upsert que grava
    // ZERO linhas era indistinguível de um que gravou todas: os dois terminavam sem erro.
    const { rowCount } = await client.query(sql, params)
    return rowCount ?? 0
  } catch (err) {
    // Loga o SQL gerado (sem os valores dos params) para facilitar debug futuro no Vercel.
    console.error('[upsertChunk] SQL falhou:', sql, '| nº params:', params.length, '| erro:', err.message)
    throw err
  }
}

// lancamentos tem um índice único parcial uq_lancamentos_installment(installment_key) WHERE
// installment_key IS NOT NULL. Como o upsert usa ON CONFLICT ("id"), um conflito nesse índice
// (parcela já no banco com id diferente) NÃO é absorvido e derruba o INSERT inteiro. Aqui:
//   1) deduplica as rows de entrada por installment_key (mantém a última — mesma parcela);
//   2) remapeia o id das que já existem no banco para o id existente → vira UPDATE via id.
async function reconcileInstallmentKeys(client, rows) {
  const withKey = rows.filter(r => r.installment_key)
  if (withKey.length === 0) return rows

  // (1) dedup por installment_key preservando a ordem e a última ocorrência
  const lastIdxByKey = new Map()
  rows.forEach((r, i) => { if (r.installment_key) lastIdxByKey.set(r.installment_key, i) })
  const deduped = rows.filter((r, i) => !r.installment_key || lastIdxByKey.get(r.installment_key) === i)

  // (2) remapeia ids das parcelas já existentes no banco
  const keys = [...new Set(deduped.filter(r => r.installment_key).map(r => r.installment_key))]
  const { rows: existing } = await client.query(
    'SELECT id, installment_key FROM lancamentos WHERE installment_key = ANY($1)',
    [keys],
  )
  if (existing.length === 0) return deduped
  const keyToId = new Map(existing.map(r => [r.installment_key, r.id]))
  return deduped.map(r => {
    if (!r.installment_key) return r
    const dbId = keyToId.get(r.installment_key)
    return dbId && dbId !== r.id ? { ...r, id: dbId } : r
  })
}

// contas tem índices únicos parciais: uma Conta central (conta_corrente_principal) e uma favorita
// (is_main) por perfil. O Postgres confere índice único linha a linha dentro do INSERT, então trocar
// a flag de A para B no mesmo lote falhava se B viesse antes de A ("salvei e sumiu"). Antes do
// upsert, desliga a flag em TODAS as linhas recebidas que a têm ligada no banco; o upsert religa
// só as que chegam ligadas. Mesma transação: se o upsert falhar, o ROLLBACK desfaz isto também.
// Conta de DÍVIDA de financiamento (liability 'acc_divida_…'): balance e initial_balance são do
// backend (/api/financiamento/*: saldo devedor do principal). O sync grava os outros campos da
// conta normalmente, mas esses dois sempre ficam com o valor do banco — uma sessão com estado
// antigo (ou a fila offline) não consegue gravar o saldo velho de volta. Conta ainda inexistente
// no banco segue como veio (quem cria é o próprio endpoint).
export const ehContaDividaFinanciamento = (r) => !!r && String(r.id || '').startsWith('acc_divida') && (r.type == null || r.type === 'liability')
export async function saldoDoBancoNasDividas(client, rows) {
  const ids = rows.filter(r => ehContaDividaFinanciamento(r) && ('balance' in r || 'initial_balance' in r)).map(r => r.id)
  if (!ids.length) return rows
  const { rows: atuais } = await client.query(
    `SELECT id, balance, initial_balance FROM contas WHERE id = ANY($1) AND type = 'liability'`, [ids])
  const doBanco = new Map(atuais.map(a => [a.id, a]))
  return rows.map(r => {
    const a = doBanco.get(r.id)
    if (!a) return r
    const out = { ...r }
    if ('balance' in out) out.balance = a.balance
    if ('initial_balance' in out) out.initial_balance = a.initial_balance
    return out
  })
}

export const FLAGS_UNICAS_CONTAS = ['conta_corrente_principal', 'is_main']
export async function desligarFlagsUnicasAntes(client, rows) {
  for (const col of FLAGS_UNICAS_CONTAS) {
    const ids = rows.filter(r => r && col in r && r.id).map(r => r.id)
    if (ids.length) await client.query(`UPDATE contas SET "${col}" = false WHERE id = ANY($1) AND "${col}"`, [ids])
  }
}

// Faz upsert de um array de rows numa tabela, em lotes, dentro de uma transação.
// Os rows já devem estar em snake_case (produzidos pelos *ToRow do frontend).
// Devolve quantas linhas foram efetivamente gravadas (inseridas + atualizadas). Quem chama usa
// isso para provar que a escrita aconteceu: antes, uma requisição que não gravava nada terminava
// exatamente como uma que gravava tudo, e a única forma de descobrir era recarregar o app.
// Upsert usando um client JÁ em transação (quem chama faz BEGIN/COMMIT). É o miolo do upsertRows,
// separado para endpoints que precisam gravar linhas + outra coisa (ex.: histórico de alterações)
// na MESMA transação.
// Colunas NOVAS que o app já manda, mas que um ambiente pode ainda não ter (migração não rodada
// nele): saem do upsert em vez de derrubar o sync daquele ambiente. "Presente" fica em cache por
// banco; "ausente" é conferido de novo a cada minuto (a migração pode rodar com a instância quente).
export const COLUNAS_OPCIONAIS = {
  lancamentos: ['importacao_id', 'fitid', 'data_ocorrencia', 'contrato_id', 'composicao'],
  agendamentos: ['sincronizar_agenda', 'contrato_id', 'contrato_papel', 'valor_status', 'composicao'],
}
const cacheColunasOpcionais = new Map()
export const _limparCacheColunasOpcionais = () => cacheColunasOpcionais.clear()

async function colunasOpcionaisAusentes(client, table) {
  const opcionais = COLUNAS_OPCIONAIS[table]
  if (!opcionais) return []
  const chave = `${bancoAtual()}:${table}`
  let c = cacheColunasOpcionais.get(chave)
  if (!c || (c.faltam.length && c.ate < Date.now())) {
    const { rows } = await client.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = ANY($2)',
      [table, opcionais],
    )
    const tem = new Set(rows.map(r => r.column_name))
    c = { faltam: opcionais.filter(col => !tem.has(col)), ate: Date.now() + 60_000 }
    cacheColunasOpcionais.set(chave, c)
  }
  return c.faltam
}

// Colunas reais da tabela, em cache por banco. Coluna desconhecida relê o banco uma vez antes de
// recusar (a migração pode ter rodado com a instância quente).
const cacheColunasDaTabela = new Map()
export const _limparCacheColunasDaTabela = () => cacheColunasDaTabela.clear()

async function colunasDaTabela(client, table, { reler = false } = {}) {
  const chave = `${bancoAtual()}:${table}`
  let cols = cacheColunasDaTabela.get(chave)
  if (!cols || reler) {
    const { rows } = await client.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
      [table],
    )
    cols = new Set(rows.map(r => r.column_name))
    if (cols.size) cacheColunasDaTabela.set(chave, cols)
  }
  return cols
}

// Toda chave das linhas tem de ser coluna da tabela (em QUALQUER linha, não só na primeira).
// Tabela sem colunas = não existe. As duas saem como ErroIdentificador (400) antes de gravar.
async function conferirColunas(client, table, rows) {
  const chaves = new Set()
  for (const r of rows) for (const k of Object.keys(r)) if (!(table === 'lancamentos' && k === FLAG_LIMPAR_PARCELA)) chaves.add(k)
  for (const k of chaves) citarIdent(k)
  let reais = await colunasDaTabela(client, table)
  if ([...chaves].some(k => !reais.has(k))) reais = await colunasDaTabela(client, table, { reler: true })
  if (!reais.size) throw new ErroIdentificador(`Tabela inexistente: ${table}`)
  const desconhecidas = [...chaves].filter(k => !reais.has(k))
  if (desconhecidas.length) throw new ErroIdentificador(`Coluna inexistente em ${table}: ${desconhecidas.slice(0, 5).join(', ')}`)
}

export async function upsertRowsNoClient(client, table, rows, conflictCol = 'id') {
  if (!rows || rows.length === 0) return 0
  citarIdent(table)
  const faltam = await colunasOpcionaisAusentes(client, table)
  if (faltam.length) {
    rows = rows.map((r) => {
      const copia = { ...r }
      for (const col of faltam) delete copia[col]
      return copia
    })
  }
  await conferirColunas(client, table, rows)
  if (table === 'contas') {
    await desligarFlagsUnicasAntes(client, rows)
    rows = await saldoDoBancoNasDividas(client, rows)
  }
  // Lotes: [rows, colunas preservadas se NULL]. Só lancamentos tem a proteção de parcela.
  let lotes = [[rows, []]]
  if (table === 'lancamentos') {
    const { protegidas, limpar } = separarLimpezaDeParcela(rows)
    lotes = [
      [await reconcileInstallmentKeys(client, protegidas), CAMPOS_PARCELA_PROTEGIDOS],
      [await reconcileInstallmentKeys(client, limpar), []],
    ]
  }
  let gravadas = 0
  for (const [lote, preservar] of lotes) {
    if (!lote.length) continue
    const cols = Object.keys(lote[0])
    const perChunk = Math.max(1, Math.min(MAX_CHUNK_ROWS, Math.floor(MAX_BIND_PARAMS / cols.length)))
    for (let i = 0; i < lote.length; i += perChunk) {
      gravadas += await upsertChunk(client, table, cols, lote.slice(i, i + perChunk), conflictCol, preservar)
    }
  }
  return gravadas
}

export async function upsertRows(table, rows, conflictCol = 'id') {
  if (!rows || rows.length === 0) return 0
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const gravadas = await upsertRowsNoClient(client, table, rows, conflictCol)
    await client.query('COMMIT')
    return gravadas
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw err
  } finally {
    client.release()
  }
}

// Executa `fn` dentro de uma transação, passando um `q(sql, params)` com a mesma assinatura de
// `query` mas amarrado ao client da transação. COMMIT no retorno, ROLLBACK em qualquer throw.
// Endpoints que fazem várias escritas dependentes (pagar parcela, criar financiamento) precisam
// disso — `query` usa o pool e cada chamada sairia numa conexão/transação diferente.
// O 2º argumento (client) serve a quem precisa do upsertRowsNoClient na mesma transação.
export async function withTransaction(fn) {
  const client = await getPool().connect()
  const q = async (sql, params = []) => (await client.query(sql, params)).rows
  try {
    await client.query('BEGIN')
    const result = await fn(q, client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw err
  } finally {
    client.release()
  }
}

export async function deleteRows(table, ids, col = 'id') {
  if (!ids || ids.length === 0) return 0
  const { rowCount } = await getPool().query(
    `DELETE FROM ${citarIdent(table)} WHERE ${citarIdent(col)} = ANY($1)`, [ids],
  )
  return rowCount ?? 0
}

// Substitui atomicamente TODO o detalhamento (schedule_reserva_funcoes) de UM agendamento:
// DELETE por schedule_id + INSERT das novas rows em lotes, numa transação única. Isola esse
// detalhamento — que numa fatura grande passa de 188 linhas — do payload/section do /api/sync
// genérico. As rows já chegam em snake_case (produzidas por scheduleReservaFuncaoToRow no
// frontend). Retorna o nº de linhas inseridas. rows vazio ⇒ só remove (schedule sem detalhe).
export async function replaceScheduleReservaFuncoes(scheduleId, rows, chunkRows = 100) {
  const list = (rows || []).filter(Boolean)
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM schedule_reserva_funcoes WHERE schedule_id = $1', [scheduleId])
    if (list.length > 0) {
      const cols = Object.keys(list[0])
      for (let i = 0; i < list.length; i += chunkRows) {
        await upsertChunk(client, 'schedule_reserva_funcoes', cols, list.slice(i, i + chunkRows), 'id')
      }
    }
    await client.query('COMMIT')
    return list.length
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw err
  } finally {
    client.release()
  }
}

// Lê e parseia o body JSON de uma Vercel Function request.
export async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
    req.on('error', reject)
  })
}
