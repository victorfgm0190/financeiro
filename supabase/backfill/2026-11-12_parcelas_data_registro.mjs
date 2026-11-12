// Lote das parcelas ANTIGAS — data de registro na regra nova (decisão 9 da Etapa 6b, pedido de 12/11/2026).
//
// Regra (a mesma do app, importada de src/lib/parcelas.js — nada reescrito aqui):
//   data de registro da parcela N = dataRegistroParcela(data da compra da série, N)
//   (mesmo dia da compra, N-1 meses depois; sem esse dia no mês, o último dia do mês).
//
// ESCOPO: despesa de cartão parcelada, parcela N >= 2 (parcela 1 e à vista NUNCA entram), NÃO conciliada,
// não espelho, de fatura >= a fatura ABERTA de hoje daquele cartão (faturaAbertaDoCartao: a calculada
// pela data de hoje e pelo fechamento; fechada → a próxima aberta). Todos os grupos.
//
// DATA DA COMPRA — uma por série (serie_id; sem serie_id, a série do parent_tx_id):
//   1. date_cartao da parcela 1 da série; senão
//   2. a data da compra inferida (dataCompraDaParcela) das parcelas da série, a mais frequente
//      (empate: a mais antiga).
//   Datas da série (inferidas de cada parcela com date_cartao + data_compra já gravada) que divergem em
//   mais de 3 dias → a série NÃO muda e vai para a lista de revisão manual. Série sem nenhuma data →
//   também não muda (lista "sem data da compra").
//   Grava data_compra em todas as parcelas do escopo da série e date = dataRegistroParcela(compra, N).
//
// NÃO MUDA (conferido antes × depois na mesma transação; diferença → ROLLBACK):
//   fatura_month_year, amount, description, category_id, grupo_gerencial, reconciled das parcelas; as
//   transferências gerenciais (tx_gerA_* / tx_ger_*: data, valor, conciliação); os resgates
//   (agendamentos resgate_reserva: data, valor, gastos); a contagem e o total de cada fatura de cada cartão.
//   A etapa A das parcelas 2..N e o resgate dependem da FATURA, não da data de registro (ver
//   docs/importar-fatura-6b-diagnostico.md, "Regra 2 — sem mudança em função protegida").
//
// Histórico: uma linha por campo alterado (date, dataCompra) em historico_alteracoes, lote
// 'backfill_2026-11-12_parcelas_data_registro', autor 'sistema', escopo 'parcela', valor anterior gravado.
// Idempotente: só muda linha cuja date/data_compra difere do alvo; rodar de novo não muda nada (o script
// confere isso dentro da própria transação).
//
// Uso (na raiz; feche o app no ambiente durante o --aplicar e recarregue depois):
//   node --env-file=.env.local supabase/backfill/2026-11-12_parcelas_data_registro.mjs --ambiente teste1
//        → DRY-RUN: faz tudo numa transação e dá ROLLBACK (relatório + conferências)
//   ... --ambiente teste1 --antes docs/privado/<arquivo>.json   → também grava o "antes" das linhas que mudam
//   ... --ambiente teste1 --aplicar                              → COMMIT
//   ... --ambiente teste1 --reverter [--aplicar]                 → volta date/data_compra pelo histórico do lote
import process from 'node:process'
import { writeFileSync } from 'node:fs'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../../api/_conexao.js'
import { papelDoBanco } from '../../api/_usuarioBanco.js'
import { dataRegistroParcela, dataCompraDaParcela } from '../../src/lib/parcelas.js'
import { faturaAbertaDoCartao } from '../../src/lib/faturaAberta.js'

const LOTE = 'backfill_2026-11-12_parcelas_data_registro'
const MOTIVO = 'Correção de dados: data de registro da parcela no mesmo dia da compra (decisão 9)'
const TOLERANCIA_DIAS = 3

const args = process.argv.slice(2)
const val = (k) => (args.includes(k) ? String(args[args.indexOf(k) + 1] || '') : null)
const aplicar = args.includes('--aplicar')
const reverter = args.includes('--reverter')
const sigla = (val('--ambiente') || '').toLowerCase()
const arquivoAntes = val('--antes')
if (!sigla) { console.error('✖ Informe --ambiente <sigla>.'); process.exit(1) }
if (!process.env.CENTRAL_DATABASE_URL) { console.error('✖ Rode com node --env-file=.env.local'); process.exit(1) }

const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null)
const dias = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)
const br = (d) => (d ? d.split('-').reverse().join('/') : '—')
const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

const central = new pg.Client(configTlsVerificado(process.env.CENTRAL_DATABASE_URL))
await central.connect()
const [amb] = (await central.query('SELECT sigla, database_name FROM ambientes WHERE sigla = $1', [sigla])).rows
await central.end()
if (!amb) { console.error(`✖ Ambiente ${sigla} não encontrado no central.`); process.exit(1) }

const db = new pg.Client(configTlsVerificado(urlDoDatabase(amb.database_name)))
await db.connect()
const q = async (sql, p = []) => (await db.query(sql, p)).rows

// Retrato de tudo o que NÃO pode mudar (comparado antes × depois).
async function retrato(idsEscopo) {
  const parcelas = await q(`SELECT id, fatura_month_year, amount::text, description, category_id, grupo_gerencial,
                                   COALESCE(reconciled, false) AS reconciled
                              FROM lancamentos WHERE id = ANY($1) ORDER BY id`, [idsEscopo])
  const gerenciais = await q(`SELECT id, date, amount::text, COALESCE(reconciled, false) AS reconciled, fatura_ref
                                FROM lancamentos WHERE type = 'transfer' AND (id LIKE 'tx\\_gerA\\_%' OR id LIKE 'tx\\_ger\\_%')
                               ORDER BY id`)
  const resgates = await q(`SELECT id, start_date, amount::text, source_expense_ids
                              FROM agendamentos WHERE tipo = 'resgate_reserva' ORDER BY id`)
  const faturas = await q(`SELECT l.account_id, l.fatura_month_year, COUNT(*)::int AS n, SUM(l.amount)::text AS total
                             FROM lancamentos l JOIN contas c ON c.id = l.account_id AND c.type = 'credit'
                            WHERE l.fatura_month_year IS NOT NULL
                            GROUP BY 1, 2 ORDER BY 1, 2`)
  return { parcelas, gerenciais, resgates, faturas }
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Cálculo do alvo (sem gravar nada).
async function calcular() {
  const [cfg] = await q('SELECT financial_month_start_day AS fsd, faturas_fechadas FROM configuracoes WHERE id = 1')
  const FSD = Number(cfg?.fsd) || 1
  const fechadas = cfg?.faturas_fechadas || {}
  const cartoes = new Map((await q(`SELECT c.id, c.name, ca.closing_day, ca.due_day FROM contas c
                                      LEFT JOIN cartoes ca ON ca.id = c.id WHERE c.type = 'credit'`)).map(r => [r.id, r]))
  const grupos = new Map((await q('SELECT id, name FROM reservas_funcoes')).map(r => [r.id, r.name]))
  const todas = (await q(`SELECT l.id, l.description, l.amount, l.date, l.date_cartao, l.data_compra,
                                 l.installment_num AS n, l.installment_total AS t, l.serie_id, l.parent_tx_id,
                                 COALESCE(l.reconciled, false) AS reconciled, l.fatura_month_year AS fmy,
                                 l.grupo_gerencial AS g, l.account_id
                            FROM lancamentos l JOIN contas c ON c.id = l.account_id AND c.type = 'credit'
                           WHERE l.type = 'expense' AND COALESCE(l.installment_total, 0) > 1
                             AND COALESCE(l.is_espelho, false) = false`))
    .map(r => ({ ...r, date: ymd(r.date), date_cartao: ymd(r.date_cartao), data_compra: ymd(r.data_compra),
                 n: Number(r.n) || 1, t: Number(r.t) || 0, amount: Number(r.amount) }))
  const porId = new Map(todas.map(r => [r.id, r]))
  const chaveSerie = (r) => r.serie_id || porId.get(r.parent_tx_id)?.serie_id || r.parent_tx_id || r.id
  const series = new Map()
  for (const r of todas) { const k = chaveSerie(r); if (!series.has(k)) series.set(k, []); series.get(k).push(r) }

  const abertaDe = new Map()
  for (const [id, c] of cartoes) {
    abertaDe.set(id, faturaAbertaDoCartao({ cardId: id, date: hojeSP, closingDay: c.closing_day, faturasFechadas: fechadas })?.efetiva || null)
  }
  const noEscopo = (r) => r.n >= 2 && !r.reconciled && r.fmy && abertaDe.get(r.account_id) && r.fmy >= abertaDe.get(r.account_id)
  // Mês financeiro (dia FSD ao FSD-1), rotulado pelo mês em que termina (15/11–14/12 → 12/2026).
  const mesFin = (d) => {
    const [y, m, dia] = d.split('-').map(Number)
    const x = new Date(Date.UTC(y, m - 1 + (dia >= FSD ? 1 : 0), 1))
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`
  }

  const mudancas = []
  const revisao = []
  const semCompra = []
  for (const [k, s] of series) {
    const escopo = s.filter(noEscopo)
    if (!escopo.length) continue
    const fechamento = (r) => cartoes.get(r.account_id)?.closing_day || 14
    const inferidas = s.filter(r => r.date_cartao)
      .map(r => dataCompraDaParcela({ dateCartao: r.date_cartao, num: r.n, fatura: r.fmy, closingDay: fechamento(r) }))
      .filter(Boolean)
    const gravadas = s.map(r => r.data_compra).filter(Boolean)
    const todasDatas = [...inferidas, ...gravadas].sort()
    const desc = s.find(r => r.n === 1)?.description || escopo[0].description
    if (!todasDatas.length) { semCompra.push({ serie: k, descricao: desc, parcelas: escopo.length }); continue }
    const spread = dias(todasDatas[todasDatas.length - 1], todasDatas[0])
    if (spread > TOLERANCIA_DIAS) {
      revisao.push({ serie: k, descricao: desc, cartao: cartoes.get(escopo[0].account_id)?.name,
                     datas: [...new Set(todasDatas)], parcelas: escopo.length, spread })
      continue
    }
    const p1 = s.find(r => r.n === 1 && r.date_cartao)
    let compra = p1?.date_cartao
    if (!compra) {
      const freq = new Map()
      for (const d of inferidas.length ? inferidas : gravadas) freq.set(d, (freq.get(d) || 0) + 1)
      compra = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    }
    for (const r of escopo) {
      const novo = dataRegistroParcela(compra, r.n)
      if (!novo) continue
      if (novo === r.date && compra === r.data_compra) continue
      mudancas.push({
        id: r.id, serie: k, descricao: r.description, n: r.n, t: r.t, amount: r.amount, fmy: r.fmy,
        cartao: cartoes.get(r.account_id)?.name, grupo: grupos.get(r.g) || r.g || '(sem grupo)',
        date_antes: r.date, date_novo: novo, data_compra_antes: r.data_compra, data_compra_nova: compra,
        mudaDia: novo !== r.date, mudaMes: mesFin(novo) !== mesFin(r.date),
      })
    }
  }
  const escopoIds = todas.filter(noEscopo).map(r => r.id)
  return { mudancas, revisao, semCompra, escopoIds, abertaDe, cartoes, FSD }
}

async function relatorio({ mudancas, revisao, semCompra, escopoIds, abertaDe, cartoes }) {
  console.log(`\n[${amb.sigla}] ${amb.database_name} · hoje ${br(hojeSP)} · lote ${LOTE}`)
  console.log('Fatura aberta por cartão:', [...abertaDe].map(([id, f]) => `${cartoes.get(id)?.name}: ${f || '—'}`).join(' · '))
  console.log(`Parcelas no escopo: ${escopoIds.length} · mudam: ${mudancas.length} (dia: ${mudancas.filter(m => m.mudaDia).length}, mês financeiro: ${mudancas.filter(m => m.mudaMes).length}, só data_compra: ${mudancas.filter(m => !m.mudaDia).length})`)
  const tab = (chave) => {
    const t = {}
    for (const m of mudancas) { const k = chave(m); t[k] ||= { mudam: 0, mudaDia: 0, mudaMes: 0 }; t[k].mudam++; if (m.mudaDia) t[k].mudaDia++; if (m.mudaMes) t[k].mudaMes++ }
    return Object.fromEntries(Object.entries(t).sort())
  }
  console.log('\nPor grupo:'); console.table(tab(m => m.grupo))
  console.log('Por cartão e fatura:'); console.table(tab(m => `${m.cartao} ${m.fmy}`))
  console.log(`Séries para revisão manual (datas da compra divergem > ${TOLERANCIA_DIAS} dias): ${revisao.length}`)
  for (const r of revisao) console.log(`  - ${r.descricao} · ${r.cartao} · ${r.parcelas} parcela(s) no escopo · datas ${r.datas.map(br).join(', ')}`)
  console.log(`Séries sem data da compra (não mudam): ${semCompra.length}`)
  for (const r of semCompra) console.log(`  - ${r.descricao} · ${r.parcelas} parcela(s)`)
  const ex = [...mudancas.filter(m => m.mudaMes), ...mudancas.filter(m => m.mudaDia && !m.mudaMes)]
  const vistos = new Set(); const exemplos = []
  for (const m of ex) { if (vistos.has(m.grupo) && exemplos.length < 4) continue; vistos.add(m.grupo); exemplos.push(m); if (exemplos.length >= 5) break }
  for (const m of ex) { if (exemplos.length >= 5) break; if (!exemplos.includes(m)) exemplos.push(m) }
  console.log('\nExemplos:')
  for (const m of exemplos) console.log(`  - ${m.descricao} · ${m.grupo} · parcela ${m.n}/${m.t} · fatura ${m.fmy.slice(5)}/${m.fmy.slice(0, 4)} · R$ ${m.amount.toFixed(2)} · compra ${br(m.data_compra_nova)} · ${br(m.date_antes)} → ${br(m.date_novo)}${m.mudaMes ? ' (muda o mês financeiro)' : ''}`)
}

try {
  await db.query('BEGIN')
  const papel = papelDoBanco(amb.database_name)
  const [pode] = await q("SELECT 1 FROM pg_roles WHERE rolname = $1 AND pg_has_role(current_user, oid, 'SET')", [papel])
  if (pode) await db.query(`SET LOCAL ROLE "${papel}"`)
  const [col] = await q("SELECT 1 FROM information_schema.columns WHERE table_name = 'lancamentos' AND column_name = 'data_compra'")
  if (!col) throw new Error('A coluna lancamentos.data_compra não existe neste ambiente (migração 2026-11-12_data_compra).')

  if (reverter) {
    const hist = await q(`SELECT entidade_id, campo, valor_anterior #>> '{}' AS de, valor_novo #>> '{}' AS para
                            FROM historico_alteracoes WHERE lote_id = $1 AND entidade = 'lancamento'`, [LOTE])
    const por = new Map()
    for (const h of hist) { por.set(h.entidade_id, { ...(por.get(h.entidade_id) || {}), [h.campo]: h }) }
    let n = 0
    for (const [id, c] of por) {
      const sets = []; const p = [id]
      if (c.date) { p.push(c.date.de); sets.push(`date = $${p.length}`) }
      if (c.dataCompra) { p.push(c.dataCompra.de); sets.push(`data_compra = $${p.length}`) }
      n += (await db.query(`UPDATE lancamentos SET ${sets.join(', ')} WHERE id = $1`, p)).rowCount
    }
    await db.query('DELETE FROM historico_alteracoes WHERE lote_id = $1', [LOTE])
    console.log(`Reversão: ${n} parcela(s) voltam ao valor anterior do lote.`)
  } else {
    const alvo = await calcular()
    await relatorio(alvo)
    const { mudancas, escopoIds } = alvo
    if (arquivoAntes) {
      writeFileSync(arquivoAntes, JSON.stringify({ ambiente: amb.sigla, lote: LOTE, gerado_em: new Date().toISOString(),
        linhas: mudancas.map(m => ({ id: m.id, date: m.date_antes, data_compra: m.data_compra_antes, date_novo: m.date_novo, data_compra_nova: m.data_compra_nova })) }, null, 1))
      console.log(`\n"Antes" gravado em ${arquivoAntes} (${mudancas.length} linhas).`)
    }
    const antes = await retrato(escopoIds)

    for (const m of mudancas) {
      const r = await db.query('UPDATE lancamentos SET date = $2, data_compra = $3 WHERE id = $1 AND date IS NOT DISTINCT FROM $4 AND data_compra IS NOT DISTINCT FROM $5',
        [m.id, m.date_novo, m.data_compra_nova, m.date_antes, m.data_compra_antes])
      if (r.rowCount !== 1) throw new Error(`Parcela ${m.id} mudou durante o lote — nada foi gravado.`)
      const campos = [['date', m.date_antes, m.date_novo], ['dataCompra', m.data_compra_antes, m.data_compra_nova]].filter(([, de, para]) => de !== para)
      for (const [campo, de, para] of campos) {
        await db.query(`INSERT INTO historico_alteracoes (entidade, entidade_id, serie_key, lote_id, escopo, campo, valor_anterior, valor_novo, motivo, autor)
                        VALUES ('lancamento', $1, $2, $3, 'parcela', $4, to_jsonb($5::text), to_jsonb($6::text), $7, 'sistema')`,
          [m.id, `serie|${m.serie}`, LOTE, campo, de, para, MOTIVO])
      }
    }

    const depois = await retrato(escopoIds)
    const conf = Object.keys(antes).map(k => [k, igual(antes[k], depois[k]), antes[k].length])
    console.log('\nConferência antes × depois (o que não pode mudar):')
    for (const [k, ok, n] of conf) console.log(`  ${ok ? '✔' : '✖'} ${k} (${n} linhas)`)
    if (conf.some(([, ok]) => !ok)) throw new Error('Algo que não pode mudar mudou — ROLLBACK.')
    const deNovo = await calcular()
    console.log(`  ${deNovo.mudancas.length === 0 ? '✔' : '✖'} rodar de novo: ${deNovo.mudancas.length} mudança(s)`)
    if (deNovo.mudancas.length) throw new Error('O lote não é idempotente — ROLLBACK.')
    const [{ n: nHist }] = await q('SELECT COUNT(*)::int AS n FROM historico_alteracoes WHERE lote_id = $1', [LOTE])
    console.log(`  histórico do lote: ${nHist} linha(s)`)
  }

  if (aplicar) { await db.query('COMMIT'); console.log('\n✔ COMMIT — aplicado.') }
  else { await db.query('ROLLBACK'); console.log('\nDRY-RUN — ROLLBACK, nada gravado. Use --aplicar para gravar.') }
} catch (err) {
  try { await db.query('ROLLBACK') } catch { /* ignore */ }
  console.error(`\n✖ ${err.message}`)
  process.exitCode = 1
} finally {
  await db.end()
}
