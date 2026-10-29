// LIGAÇÕES 5/8 (29/10) — liga ocorrências JÁ BAIXADAS (registered) sem lançamento ao lançamento que
// as pagou, conforme a prévia aprovada (docs/privado/previa-ligacoes-5-8-v2.md): o lote e as
// duvidosas aprovadas, listados no arquivo de dados (abaixo).
//
// A ligação é só registered_meta[data] = { tipo: 'pago', lancamento_id, import_id: null }
// (metaBaixaGerada, src/lib/scheduleBaixa.js) — o que já houver no meta da data é mantido.
// NÃO altera lançamentos, valores, datas, contas nem saldos; registered e next_occurrence ficam
// como estão. Única exceção pedida: os agendamentos "Uma vez" da diarista (`diarista.agendamentos`)
// passam de `contaDe` para `contaPara`, com considerar_fluxo_principal = true e o favorecido
// informado, ANTES da ligação.
//
// Cada linha é conferida antes de gravar; a que não bater é PULADA (com o motivo) e o resto segue.
// Tudo numa transação só, no banco `banco` do arquivo de dados. Rode com o app FECHADO em todos os
// aparelhos (o app aberto pode regravar o agendamento por cima).
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/ligar-baixas-5-8.mjs            ← só PRÉVIA (SELECT)
//   node --env-file=.env.local scripts/ligar-baixas-5-8.mjs --aplicar  ← grava
//   ... [--dados outro.json]
import fs from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { comoDonoDoBanco } from '../api/_usuarioBanco.js'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/ligar-baixas-5-8.mjs')
  process.exit(1)
}
// Dados reais (ids, valores, descrições) ficam FORA do git: docs/privado/ligacoes-5-8.json
// { banco, diarista: { agendamentos: [id, id], contaDe, contaPara, favorecido },
//   ligacoes: [[rótulo, agendamento, data da ocorrência, lançamento, valor do lançamento, descrição], …] }
const arqDados = args.includes('--dados') ? args[args.indexOf('--dados') + 1] : 'docs/privado/ligacoes-5-8.json'
const DADOS = JSON.parse(fs.readFileSync(arqDados, 'utf8'))
const BANCO = DADOS.banco
const { agendamentos: DIARISTA_IDS, contaDe: CONTA_DE, contaPara: CONTA_PARA, favorecido: FAVORECIDO } = DADOS.diarista
const LIGACOES = DADOS.ligacoes

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const iso = (v) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10))
const regs = (s) => (s.registered || []).map(iso)

async function lerEstado(q) {
  const schedIds = [...new Set(LIGACOES.map(l => l[1]))]
  const txIds = LIGACOES.map(l => l[3])
  const ags = new Map((await q(`SELECT id, description, transaction_type, account_id, account_type, payee, considerar_fluxo_principal,
                                       amount, registered, registered_meta, next_occurrence
                                  FROM agendamentos WHERE id = ANY($1)`, [schedIds])).map(r => [r.id, r]))
  const txs = new Map((await q(`SELECT id, date, description, type, account_id, to_account_id, amount, schedule_id
                                  FROM lancamentos WHERE id = ANY($1)`, [txIds])).map(r => [r.id, r]))
  // Lançamentos já apontados por QUALQUER agendamento (registered_meta[*].lancamento_id).
  const usados = new Map((await q(`SELECT a.id, a.description, m.key AS data, m.value->>'lancamento_id' AS tx
                                     FROM agendamentos a, jsonb_each(COALESCE(a.registered_meta, '{}'::jsonb)) m
                                    WHERE m.value->>'lancamento_id' = ANY($1)`, [txIds])).map(r => [r.tx, r]))
  return { ags, txs, usados }
}

function mostrarDiarista(titulo, ags, contas) {
  console.log(`\n── ${titulo}: agendamentos "Uma vez" DIARISTA`)
  for (const id of DIARISTA_IDS) {
    const s = ags.get(id)
    if (!s) { console.log(`   ${id}: NÃO ENCONTRADO`); continue }
    console.log(`   ${id} · ${s.description} · ${regs(s).join(',')} · R$ ${brl(s.amount)} · conta ${contas.get(s.account_id) || s.account_id} (${s.account_type || '—'})`
      + ` · considerar_fluxo_principal ${s.considerar_fluxo_principal} · favorecido ${s.payee ?? 'null'}`)
  }
}

function mostrarLigacoes(titulo, { ags, txs }, contas) {
  console.log(`\n── ${titulo}: ocorrência → registered_meta[data]`)
  for (const [rot, sid, data, txId, , desc] of LIGACOES) {
    const s = ags.get(sid)
    const tx = txs.get(txId)
    const meta = s?.registered_meta?.[data]
    console.log(`   ${rot.padEnd(3)} ${data} ${desc.padEnd(36).slice(0, 36)} · baixada ${s && regs(s).includes(data) ? 'sim' : 'NÃO'}`
      + ` · meta ${meta ? JSON.stringify(meta) : '—'}`
      + ` · lanç. ${tx ? `${iso(tx.date)} ${contas.get(tx.account_id) || tx.account_id} R$ ${brl(tx.amount)}` : 'NÃO ENCONTRADO'}`)
  }
}

// Motivo para PULAR a linha (null = pode ligar). `jaNoLote` = lançamentos já ligados nesta rodada.
function motivoPular([, sid, data, txId, valor], { ags, txs, usados }, jaNoLote) {
  const s = ags.get(sid)
  const tx = txs.get(txId)
  if (!s) return 'agendamento não existe'
  if (!tx) return 'lançamento não existe'
  if (!regs(s).includes(data)) return `ocorrência ${data} não está baixada (registered)`
  const meta = s.registered_meta?.[data]
  if (meta?.lancamento_id === txId) return 'já ligada a este lançamento'
  if (meta?.lancamento_id) return `ocorrência já ligada a outro lançamento (${meta.lancamento_id})`
  if (Math.abs(Number(tx.amount) - valor) > 0.005) return `valor do lançamento mudou (${brl(tx.amount)} ≠ ${brl(valor)})`
  if (tx.schedule_id && tx.schedule_id !== sid) return `lançamento é de outro agendamento (schedule_id ${tx.schedule_id})`
  const u = usados.get(txId)
  if (u) return `lançamento já ligado a ${u.description} ${u.data}`
  if (jaNoLote.has(txId)) return 'lançamento repetido no lote'
  return null
}

const db = new pg.Client(configTlsVerificado(urlDoDatabase(BANCO)))
await db.connect()
try {
  const q0 = async (sql, p = []) => (await db.query(sql, p)).rows
  const contas = new Map((await q0('SELECT id, COALESCE(apelido, name) AS nome FROM contas')).map(r => [r.id, r.nome]))
  console.log(`${aplicar ? 'APLICANDO' : 'PRÉVIA (nada é gravado)'} · banco ${BANCO} · ${LIGACOES.length} ligações`)

  const antes = await lerEstado(q0)
  mostrarDiarista('ANTES', antes.ags, contas)
  mostrarLigacoes('ANTES', antes, contas)

  // Plano (mesmas regras na prévia e na gravação).
  const plano = []
  const pulos = []
  const jaNoLote = new Set()
  for (const l of LIGACOES) {
    const m = motivoPular(l, antes, jaNoLote)
    if (m) pulos.push([l, m])
    else { plano.push(l); jaNoLote.add(l[3]) }
  }
  const diaristaAjustar = DIARISTA_IDS.filter(id => {
    const s = antes.ags.get(id)
    return s && !(s.account_id === CONTA_PARA && s.considerar_fluxo_principal === true && s.payee === FAVORECIDO)
  })
  for (const id of DIARISTA_IDS) {
    const s = antes.ags.get(id)
    if (s && s.account_id !== CONTA_DE && s.account_id !== CONTA_PARA) {
      console.error(`\n✖ ${id} está na conta ${contas.get(s.account_id) || s.account_id} (esperado ${contas.get(CONTA_DE)} ou ${contas.get(CONTA_PARA)}). Nada foi feito.`)
      process.exit(1)
    }
  }

  if (aplicar) {
    await comoDonoDoBanco(db, BANCO, async (q) => {
      // 1. Agendamentos "Uma vez" da diarista: conta → contaPara, no fluxo principal, favorecido.
      for (const id of diaristaAjustar) {
        await q(`UPDATE agendamentos SET account_id = $2, account_type = 'checking', considerar_fluxo_principal = true, payee = $4
                  WHERE id = $1 AND account_id IN ($3, $2)`, [id, CONTA_PARA, CONTA_DE, FAVORECIDO])
      }
      // 2. Ligações: só registered_meta[data] (mantém o que já houver no meta da data).
      for (const [rot, sid, data, txId] of plano) {
        const r = await q(`UPDATE agendamentos
                              SET registered_meta = COALESCE(registered_meta, '{}'::jsonb)
                                    || jsonb_build_object($2::text, COALESCE(registered_meta -> $2::text, '{}'::jsonb)
                                         || jsonb_build_object('tipo', 'pago', 'lancamento_id', $3::text, 'import_id', NULL))
                            WHERE id = $1 AND COALESCE(registered, '[]'::jsonb) @> to_jsonb($2::text)
                              AND (registered_meta -> $2::text ->> 'lancamento_id') IS NULL
                          RETURNING id`, [sid, data, txId])
        if (r.length !== 1) throw new Error(`${rot}: o agendamento mudou durante a gravação — nada foi gravado`)
      }
    })
    const depois = await lerEstado(q0)
    mostrarDiarista('DEPOIS', depois.ags, contas)
    mostrarLigacoes('DEPOIS', depois, contas)
  }

  console.log(`\n══ RELATÓRIO ${aplicar ? '' : '(prévia — rode com --aplicar para gravar)'}`)
  console.log(`   DIARISTA "Uma vez" ${aplicar ? 'ajustados' : 'a ajustar'} (conta/fluxo/favorecido): ${diaristaAjustar.length} de ${DIARISTA_IDS.length}`)
  console.log(`   ${aplicar ? 'Ligadas' : 'A ligar'}: ${plano.length} — ${plano.map(l => l[0]).join(', ') || '—'}`)
  console.log(`   Puladas: ${pulos.length}`)
  for (const [l, m] of pulos) console.log(`     ${l[0]} ${l[2]} ${l[5]}: ${m}`)
} finally {
  await db.end()
}
