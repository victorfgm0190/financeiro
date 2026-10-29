// LIGAÇÕES 5/8 — segunda rodada (29/10), depois de scripts/ligar-baixas-5-8.mjs:
//   1. `ligacoes`: liga a ocorrência ao lançamento que a pagou (registered_meta[data] =
//      { tipo: 'pago', lancamento_id, import_id: null }, como metaBaixaGerada). Com
//      `desdePulada: true` a ocorrência hoje está PULADA (skipped): sai de skipped e entra em
//      registered (paga). Com `descricaoLancamento`, preenche a descrição do lançamento — só se
//      ela estiver vazia.
//      `valor` é o valor do LANÇAMENTO (conferido); pode diferir do previsto do agendamento (ex.:
//      uma transferência que cobriu duas contas) — a prévia mostra os dois.
//   2. `trocaConta`: troca a conta de origem (account_id) de agendamentos PENDENTES (sem nenhuma
//      ocorrência registrada) — só a conta.
// NÃO altera valores, datas nem saldos; next_occurrence fica como está (as datas mexidas são
// passadas). Cada linha é conferida antes de gravar; a que não bater é PULADA (com o motivo) e o
// resto segue. Tudo numa transação só, no banco `banco` do arquivo de dados. Rode com o app
// FECHADO em todos os aparelhos (o app aberto pode regravar o agendamento por cima).
//
// Dados reais (ids, valores) ficam FORA do git: docs/privado/ajustes-5-8b.json
// { banco,
//   ligacoes: [{ rotulo, agendamento, data, lancamento, valor, contaLancamento, desdePulada,
//                descricaoLancamento?, nome }],
//   trocaConta: [{ rotulo, agendamento, de, para }] }
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/ajustar-baixas-5-8b.mjs            ← só PRÉVIA (SELECT)
//   node --env-file=.env.local scripts/ajustar-baixas-5-8b.mjs --aplicar  ← grava
//   ... [--dados outro.json]
import fs from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { comoDonoDoBanco } from '../api/_usuarioBanco.js'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/ajustar-baixas-5-8b.mjs')
  process.exit(1)
}
const arqDados = args.includes('--dados') ? args[args.indexOf('--dados') + 1] : 'docs/privado/ajustes-5-8b.json'
const DADOS = JSON.parse(fs.readFileSync(arqDados, 'utf8'))
const BANCO = DADOS.banco
const LIGACOES = DADOS.ligacoes || []
const TROCAS = DADOS.trocaConta || []

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const iso = (v) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10))
const datas = (arr) => (arr || []).map(iso)

async function lerEstado(q) {
  const schedIds = [...new Set([...LIGACOES.map(l => l.agendamento), ...TROCAS.map(t => t.agendamento)])]
  const txIds = LIGACOES.map(l => l.lancamento)
  const ags = new Map((await q(`SELECT id, description, account_id, amount, start_date, registered, skipped, registered_meta, next_occurrence
                                  FROM agendamentos WHERE id = ANY($1)`, [schedIds])).map(r => [r.id, r]))
  const txs = new Map((await q(`SELECT id, date, description, type, account_id, to_account_id, amount, schedule_id
                                  FROM lancamentos WHERE id = ANY($1)`, [txIds])).map(r => [r.id, r]))
  // Lançamentos já apontados por QUALQUER agendamento (registered_meta[*].lancamento_id).
  const usados = new Map((await q(`SELECT a.id, a.description, m.key AS data, m.value->>'lancamento_id' AS tx
                                     FROM agendamentos a, jsonb_each(COALESCE(a.registered_meta, '{}'::jsonb)) m
                                    WHERE m.value->>'lancamento_id' = ANY($1)`, [txIds])).map(r => [r.tx, r]))
  return { ags, txs, usados }
}

function mostrar(titulo, { ags, txs }, contas) {
  const nome = (id) => contas.get(id) || id || '—'
  console.log(`\n── ${titulo}: ocorrências`)
  for (const l of LIGACOES) {
    const s = ags.get(l.agendamento)
    const tx = txs.get(l.lancamento)
    const sit = !s ? 'AGENDAMENTO NÃO ENCONTRADO'
      : datas(s.registered).includes(l.data) ? 'paga' : datas(s.skipped).includes(l.data) ? 'pulada' : 'pendente'
    const meta = s?.registered_meta?.[l.data]
    const previsto = s ? Number(s.registered_meta?.[l.data]?.valor_previsto ?? s.amount) : null
    const difere = tx && previsto != null && Math.abs(Number(tx.amount) - previsto) > 0.005
    console.log(`   ${l.rotulo.padEnd(3)} ${l.data} ${String(l.nome).padEnd(36).slice(0, 36)} · ${sit}`
      + `${previsto != null ? ` · previsto R$ ${brl(previsto)}${difere ? ' (≠ lançamento)' : ''}` : ''} · meta ${meta ? JSON.stringify(meta) : '—'}`
      + ` · lanç. ${tx ? `${iso(tx.date)} ${nome(tx.account_id)}${tx.to_account_id ? ' → ' + nome(tx.to_account_id) : ''} R$ ${brl(tx.amount)} "${tx.description ?? ''}"` : 'NÃO ENCONTRADO'}`)
  }
  console.log(`\n── ${titulo}: conta de origem dos agendamentos pendentes`)
  for (const t of TROCAS) {
    const s = ags.get(t.agendamento)
    console.log(`   ${t.rotulo.padEnd(3)} ${s ? `${s.description} · ${iso(s.start_date)} · R$ ${brl(s.amount)} · conta ${nome(s.account_id)} · registradas ${datas(s.registered).length}` : `${t.agendamento}: NÃO ENCONTRADO`}`)
  }
}

// Motivo para PULAR a ligação (null = pode ligar). `jaNoLote` = lançamentos já usados nesta rodada.
function motivoLigacao(l, { ags, txs, usados }, jaNoLote) {
  const s = ags.get(l.agendamento)
  const tx = txs.get(l.lancamento)
  if (!s) return 'agendamento não existe'
  if (!tx) return 'lançamento não existe'
  const pulada = datas(s.skipped).includes(l.data)
  const paga = datas(s.registered).includes(l.data)
  const meta = s.registered_meta?.[l.data]
  if (meta?.lancamento_id === l.lancamento) return 'já ligada a este lançamento'
  if (meta?.lancamento_id) return `ocorrência já ligada a outro lançamento (${meta.lancamento_id})`
  if (l.desdePulada && !pulada) return `ocorrência ${l.data} não está pulada (${paga ? 'paga' : 'pendente'})`
  if (l.desdePulada && paga) return `ocorrência ${l.data} está pulada E paga ao mesmo tempo`
  if (!l.desdePulada && !paga) return `ocorrência ${l.data} não está baixada (registered)`
  if (Math.abs(Number(tx.amount) - l.valor) > 0.005) return `valor do lançamento difere (${brl(tx.amount)} ≠ ${brl(l.valor)})`
  if (tx.account_id !== l.contaLancamento) return `conta do lançamento mudou (${tx.account_id})`
  if (tx.schedule_id && tx.schedule_id !== l.agendamento) return `lançamento é de outro agendamento (schedule_id ${tx.schedule_id})`
  const u = usados.get(l.lancamento)
  if (u) return `lançamento já ligado a ${u.description} ${u.data}`
  if (jaNoLote.has(l.lancamento)) return 'lançamento repetido no lote'
  if (l.descricaoLancamento && (tx.description || '').trim() && tx.description !== l.descricaoLancamento) {
    return `lançamento já tem descrição ("${tx.description}")`
  }
  return null
}

function motivoTroca(t, { ags }) {
  const s = ags.get(t.agendamento)
  if (!s) return 'agendamento não existe'
  if (s.account_id === t.para) return 'já está na conta nova'
  if (s.account_id !== t.de) return `conta atual não é a esperada (${s.account_id})`
  if (datas(s.registered).length) return 'não está pendente (tem ocorrência registrada)'
  return null
}

const db = new pg.Client(configTlsVerificado(urlDoDatabase(BANCO)))
await db.connect()
try {
  const q0 = async (sql, p = []) => (await db.query(sql, p)).rows
  const contas = new Map((await q0('SELECT id, COALESCE(apelido, name) AS nome FROM contas')).map(r => [r.id, r.nome]))
  console.log(`${aplicar ? 'APLICANDO' : 'PRÉVIA (nada é gravado)'} · banco ${BANCO} · ${LIGACOES.length} ligação(ões) · ${TROCAS.length} troca(s) de conta`)

  const antes = await lerEstado(q0)
  mostrar('ANTES', antes, contas)

  const planoLig = [], planoTroca = [], pulos = []
  const jaNoLote = new Set()
  for (const l of LIGACOES) {
    const m = motivoLigacao(l, antes, jaNoLote)
    if (m) pulos.push([l.rotulo, `${l.data} ${l.nome}`, m])
    else { planoLig.push(l); jaNoLote.add(l.lancamento) }
  }
  for (const t of TROCAS) {
    const m = motivoTroca(t, antes)
    if (m) pulos.push([t.rotulo, antes.ags.get(t.agendamento)?.description || t.agendamento, m])
    else planoTroca.push(t)
  }

  if (aplicar) {
    await comoDonoDoBanco(db, BANCO, async (q) => {
      // 1. Ligações (e pulada → paga). Ocorrências do MESMO agendamento são gravadas em sequência,
      //    cada uma relendo registered/skipped; a guarda do WHERE detecta mudança concorrente.
      for (const l of planoLig) {
        const [s] = await q('SELECT registered, skipped FROM agendamentos WHERE id = $1', [l.agendamento])
        const registered = [...new Set([...datas(s.registered), l.data])].sort()
        const skipped = datas(s.skipped).filter(d => d !== l.data)
        const r = await q(`UPDATE agendamentos
                              SET registered = $4::jsonb, skipped = $5::jsonb,
                                  registered_meta = COALESCE(registered_meta, '{}'::jsonb)
                                    || jsonb_build_object($2::text, COALESCE(registered_meta -> $2::text, '{}'::jsonb)
                                         || jsonb_build_object('tipo', 'pago', 'lancamento_id', $3::text, 'import_id', NULL))
                            WHERE id = $1 AND COALESCE(registered, '[]'::jsonb) = COALESCE($6::jsonb, '[]'::jsonb)
                              AND COALESCE(skipped, '[]'::jsonb) = COALESCE($7::jsonb, '[]'::jsonb)
                              AND (registered_meta -> $2::text ->> 'lancamento_id') IS NULL
                          RETURNING id`,
          [l.agendamento, l.data, l.lancamento, JSON.stringify(registered), JSON.stringify(skipped),
            JSON.stringify(s.registered ?? []), JSON.stringify(s.skipped ?? [])])
        if (r.length !== 1) throw new Error(`${l.rotulo}: o agendamento mudou durante a gravação — nada foi gravado`)
        if (l.descricaoLancamento) {
          await q(`UPDATE lancamentos SET description = $2 WHERE id = $1 AND COALESCE(TRIM(description), '') = ''`,
            [l.lancamento, l.descricaoLancamento])
        }
      }
      // 2. Troca da conta de origem (só account_id) dos pendentes.
      for (const t of planoTroca) {
        const r = await q(`UPDATE agendamentos SET account_id = $3
                            WHERE id = $1 AND account_id = $2 AND COALESCE(registered, '[]'::jsonb) = '[]'::jsonb
                          RETURNING id`, [t.agendamento, t.de, t.para])
        if (r.length !== 1) throw new Error(`${t.rotulo}: o agendamento mudou durante a gravação — nada foi gravado`)
      }
    })
    mostrar('DEPOIS', await lerEstado(q0), contas)
  }

  console.log(`\n══ RELATÓRIO ${aplicar ? '' : '(prévia — rode com --aplicar para gravar)'}`)
  console.log(`   ${aplicar ? 'Ligadas' : 'A ligar'}: ${planoLig.length} — ${planoLig.map(l => l.rotulo + (l.desdePulada ? ' (pulada → paga)' : '') + (l.descricaoLancamento ? ' (+ descrição)' : '')).join(', ') || '—'}`)
  console.log(`   ${aplicar ? 'Contas trocadas' : 'Contas a trocar'}: ${planoTroca.length} — ${planoTroca.map(t => `${t.rotulo} ${contas.get(t.de)} → ${contas.get(t.para)}`).join(', ') || '—'}`)
  console.log(`   Puladas: ${pulos.length}`)
  for (const [rot, desc, m] of pulos) console.log(`     ${rot} ${desc}: ${m}`)
} finally {
  await db.end()
}
