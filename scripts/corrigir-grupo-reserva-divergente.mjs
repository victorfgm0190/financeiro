// CARTÃO — despesa com grupo gerencial e função de reserva DIVERGENTES (30/10): o grupo aponta
// para uma conta de reserva e a função é de OUTRA conta. Corrige só a coluna grupo_gerencial
// para o grupo da conta da função (a função fica). Valores, datas, faturas, saldos e agendamentos
// não são tocados.
//
// A prévia mostra: as outras parcelas da mesma compra e o grupo delas; cada lançamento antes e
// depois; o resgate de cada fatura afetada (agendamento existente, executado ou não, e as
// transferências de resgate já feitas, comparadas com a soma das despesas por grupo); os saldos
// das contas de reserva envolvidas ("saldo real − Σ funções" = a distribuir) antes e depois; e
// quantas despesas de cartão estão salvas com reserva + grupo D. Rode com o app FECHADO.
//
// Dados reais (ids) ficam FORA do git: docs/privado/corrigir-grupo-reserva-divergente.json
// { banco, linhas: [{ rotulo, lancamento, nome, grupoAntes, grupoDepois, funcao }] }
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/corrigir-grupo-reserva-divergente.mjs            ← só PRÉVIA
//   node --env-file=.env.local scripts/corrigir-grupo-reserva-divergente.mjs --aplicar  ← grava
//   ... [--dados outro.json]
import fs from 'node:fs'
import process from 'node:process'
import pg from 'pg'
import { urlDoDatabase, configTlsVerificado } from '../api/_conexao.js'
import { comoDonoDoBanco } from '../api/_usuarioBanco.js'
import { saldosDasFuncoesNaData } from '../src/lib/rendimentoReserva.js'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/corrigir-grupo-reserva-divergente.mjs')
  process.exit(1)
}
const arqDados = args.includes('--dados') ? args[args.indexOf('--dados') + 1] : 'docs/privado/corrigir-grupo-reserva-divergente.json'
const DADOS = JSON.parse(fs.readFileSync(arqDados, 'utf8'))
const BANCO = DADOS.banco
const LINHAS = DADOS.linhas || []

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n) => Math.round(n * 100) / 100
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const iso = (d) => d.toLocaleDateString('sv-SE')
const rotFatura = (f) => `${f.slice(5, 7)}/${f.slice(0, 4)}`

// Mesma regra de cicloFinanceiroAtual (AppContext): início do ciclo financeiro corrente.
function inicioDoCiclo(cfg) {
  const ref = new Date(`${hoje}T12:00:00`)
  if ((cfg?.financial_month_mode || 'custom') === 'calendar') return iso(new Date(ref.getFullYear(), ref.getMonth(), 1))
  const dia = Number(cfg?.financial_month_start_day) || 1
  return iso(ref.getDate() >= dia ? new Date(ref.getFullYear(), ref.getMonth(), dia) : new Date(ref.getFullYear(), ref.getMonth() - 1, dia))
}
// Vencimento da fatura (YYYY-MM) com o dia do cartão, limitado ao último dia do mês.
function vencimento(fatura, dueDay) {
  const [y, m] = fatura.split('-').map(Number)
  const ult = new Date(y, m, 0).getDate()
  return `${fatura}-${String(Math.min(Number(dueDay) || 10, ult)).padStart(2, '0')}`
}

const db = new pg.Client(configTlsVerificado(urlDoDatabase(BANCO)))
await db.connect()
try {
  const q = async (sql, p = []) => (await db.query(sql, p)).rows
  console.log(`${aplicar ? 'APLICANDO' : 'PRÉVIA (nada é gravado)'} · banco ${BANCO} · ${LINHAS.length} lançamento(s)`)

  const grupos = new Map((await q('SELECT id, number, name, default_account_id FROM reservas_funcoes')).map(g => [g.id, g]))
  const fns = new Map((await q('SELECT id, name, account_id FROM reserve_functions')).map(f => [f.id, f]))
  const contas = new Map((await q('SELECT id, name, apelido, type, due_day, balance::float AS balance FROM contas')).map(c => [c.id, c]))
  const [cfg] = await q('SELECT * FROM configuracoes LIMIT 1')
  const nomeGrupo = (id) => { const g = grupos.get(id); return g ? `${g.number} · ${g.name}` : String(id) }
  const nomeConta = (id) => contas.get(id)?.apelido || contas.get(id)?.name || String(id)
  const txs = new Map((await q(`SELECT id, type, account_id, description, to_char(date::date, 'YYYY-MM-DD') AS date, amount::float AS amount,
                                       grupo_gerencial, reserva_funcao_id, reserva_conta_id, fatura_month_year, installment_key, serie_id
                                  FROM lancamentos WHERE id = ANY($1)`, [LINHAS.map(l => l.lancamento)])).map(t => [t.id, t]))

  // ── 1. Conferência e antes/depois
  const plano = [], pulos = []
  for (const l of LINHAS) {
    const t = txs.get(l.lancamento), fn = fns.get(l.funcao), gD = grupos.get(l.grupoDepois)
    const motivo = !t ? 'lançamento não existe'
      : t.type !== 'expense' || contas.get(t.account_id)?.type !== 'credit' ? 'não é despesa de cartão'
      : t.grupo_gerencial === l.grupoDepois ? 'já está no grupo certo'
      : t.grupo_gerencial !== l.grupoAntes ? `grupo mudou (${nomeGrupo(t.grupo_gerencial)})`
      : t.reserva_funcao_id !== l.funcao ? 'função mudou'
      : !fn || !gD || fn.account_id !== gD.default_account_id ? 'a função não é da conta do grupo novo'
      : null
    if (motivo) pulos.push([l, motivo]); else plano.push({ ...l, t })
  }
  console.log('\n── Lançamentos (só o grupo muda; a função fica)')
  for (const { rotulo, t, grupoDepois, funcao } of plano) {
    console.log(`   ${rotulo} ${t.date} ${t.description.padEnd(16)} R$ ${brl(t.amount).padStart(8)} · ${nomeConta(t.account_id)} · fatura ${rotFatura(t.fatura_month_year)}`)
    console.log(`        antes : grupo ${nomeGrupo(t.grupo_gerencial).padEnd(18)} função ${fns.get(funcao)?.name} (${nomeConta(fns.get(funcao)?.account_id)})  → resgate sairia de ${nomeConta(grupos.get(t.grupo_gerencial)?.default_account_id)}`)
    console.log(`        depois: grupo ${nomeGrupo(grupoDepois).padEnd(18)} função ${fns.get(funcao)?.name} (${nomeConta(fns.get(funcao)?.account_id)})  → resgate sairia de ${nomeConta(grupos.get(grupoDepois)?.default_account_id)}`)
  }

  // ── 2. As outras parcelas da mesma compra (installment_key: cartão|descrição|n/total|centavos|base)
  console.log('\n── Outras parcelas da mesma compra')
  const series = new Map()
  for (const { t } of plano) {
    const p = String(t.installment_key || '').split('|')
    if (p.length < 5) continue
    series.set(`${p[0]}|${p[1]}|${p[2].split('/')[1]}|${p[3]}|${p[4]}`, p)
  }
  for (const p of series.values()) {
    const total = Number(p[2].split('/')[1])
    const irmas = await q(`SELECT id, description, to_char(date::date, 'YYYY-MM-DD') AS date, amount::float AS amount, grupo_gerencial, reserva_funcao_id, fatura_month_year, installment_key
                             FROM lancamentos WHERE account_id = $1 AND installment_key LIKE $2 ORDER BY installment_key`,
      [p[0], `${p[0]}|${p[1]}|%/${total}|${p[3]}|${p[4]}`])
    console.log(`   compra "${p[1]}" em ${total}x de R$ ${brl(Number(p[3]) / 100)} (base ${p[4]}):`)
    for (let n = 1; n <= total; n++) {
      const i = irmas.find(x => x.installment_key.split('|')[2] === `${n}/${total}`)
      console.log(i
        ? `     ${n}/${total}  ${i.date}  fatura ${rotFatura(i.fatura_month_year)}  grupo ${nomeGrupo(i.grupo_gerencial).padEnd(18)} função ${fns.get(i.reserva_funcao_id)?.name || '—'}`
        : `     ${n}/${total}  NÃO EXISTE no banco`)
    }
  }

  // ── 3. Resgate de cada fatura afetada
  console.log('\n── Resgate das faturas afetadas')
  const inicio = inicioDoCiclo(cfg)
  const faturas = [...new Set(plano.map(({ t }) => `${t.account_id}|${t.fatura_month_year}`))]
  for (const chave of faturas) {
    const [cartao, fatura] = chave.split('|')
    const venc = vencimento(fatura, contas.get(cartao)?.due_day)
    const passado = venc < inicio
    const daFatura = plano.filter(({ t }) => t.account_id === cartao && t.fatura_month_year === fatura)
    console.log(`   ${nomeConta(cartao)} · fatura ${rotFatura(fatura)} · vence ${venc} · ${passado ? `ciclo PASSADO (ciclo atual começa ${inicio})` : 'ciclo atual/futuro'}`)
    const ags = await q(`SELECT id, account_id, amount::float AS amount, registered, skipped FROM agendamentos
                          WHERE tipo = 'resgate_reserva' AND card_id = $1 AND fatura_mes_ano = $2`, [cartao, fatura])
    if (!ags.length) console.log('     agendamentos resgate_reserva desta fatura: nenhum')
    for (const a of ags) {
      const feito = (a.registered || []).length || (a.skipped || []).length
      console.log(`     agendamento ${nomeConta(a.account_id)} R$ ${brl(a.amount)} — ${feito ? 'executado' : 'pendente'}`)
    }
    // Soma das despesas do cartão nesta fatura por conta-origem do grupo, hoje e depois da correção.
    const desp = await q(`SELECT id, amount::float AS amount, grupo_gerencial FROM lancamentos
                           WHERE type = 'expense' AND account_id = $1 AND fatura_month_year = $2`, [cartao, fatura])
    const somaPorOrigem = (mudar) => {
      const m = new Map()
      for (const d of desp) {
        const gid = mudar.get(d.id) || d.grupo_gerencial
        const g = grupos.get(gid)
        if (!g || typeof g.number !== 'number' || g.number === 1 || !g.default_account_id) continue
        m.set(g.default_account_id, r2((m.get(g.default_account_id) || 0) + d.amount))
      }
      return m
    }
    const hojeM = somaPorOrigem(new Map())
    const depoisM = somaPorOrigem(new Map(daFatura.map(({ t, grupoDepois }) => [t.id, grupoDepois])))
    const origens = [...new Set([...hojeM.keys(), ...depoisM.keys(), ...daFatura.flatMap(({ grupoAntes, grupoDepois }) => [grupos.get(grupoAntes)?.default_account_id, grupos.get(grupoDepois)?.default_account_id])])]
    const apelido = contas.get(cartao)?.apelido || contas.get(cartao)?.name || ''
    for (const o of origens) {
      const trf = await q(`SELECT description, to_char(date::date, 'YYYY-MM-DD') AS date, amount::float AS amount FROM lancamentos
                            WHERE type = 'transfer' AND account_id = $1 AND description ILIKE $2 AND description ILIKE $3`,
        [o, `%Fatura ${rotFatura(fatura)}%`, `%${apelido}%`])
      const pago = r2(trf.reduce((s, x) => s + x.amount, 0))
      console.log(`     ${nomeConta(o).padEnd(14)} despesas da fatura: hoje R$ ${brl(hojeM.get(o) || 0).padStart(9)} · depois R$ ${brl(depoisM.get(o) || 0).padStart(9)} · resgates já transferidos R$ ${brl(pago).padStart(9)} (${trf.length} transf.)`)
    }
  }

  // ── 4. Saldos das contas de reserva envolvidas
  const reservas = [...new Set(plano.flatMap(({ grupoAntes, grupoDepois }) => [grupos.get(grupoAntes)?.default_account_id, grupos.get(grupoDepois)?.default_account_id]).filter(Boolean))]
  const saldos = async (mudar) => {
    const functions = (await q('SELECT id, account_id, saldo_inicial::float AS si FROM reserve_functions')).map(f => ({ id: f.id, accountId: f.account_id, saldoInicial: f.si }))
    const periods = await q(`SELECT function_id, to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio, saldo_inicial::float AS saldo_inicial FROM reserve_periods`)
    const adjustments = await q(`SELECT function_id, to_char(data, 'YYYY-MM-DD') AS data, valor::float AS valor FROM reserve_adjustments`)
    const transactions = (await q(`SELECT id, type, account_id, to_account_id, amount::float AS amount, to_char(date::date, 'YYYY-MM-DD') AS date, reserva_funcao_id, grupo_gerencial
                                     FROM lancamentos WHERE reserva_funcao_id IS NOT NULL`))
      .map(t => ({ id: t.id, type: t.type, accountId: t.account_id, toAccountId: t.to_account_id, amount: t.amount, date: t.date, reservaFuncaoId: t.reserva_funcao_id, grupoGerencial: mudar.get(t.id) || t.grupo_gerencial }))
    const out = {}
    for (const c of reservas) {
      const [k] = await q('SELECT balance::float AS b FROM contas WHERE id = $1', [c])
      const soma = r2(saldosDasFuncoesNaData({ functions, periods, adjustments, transactions, contaId: c, date: hoje }).reduce((s, f) => s + f.saldo, 0))
      out[c] = { real: k?.b ?? 0, funcoes: soma, aDistribuir: r2((k?.b ?? 0) - soma) }
    }
    return out
  }
  const antes = await saldos(new Map())
  if (aplicar) {
    await comoDonoDoBanco(db, BANCO, async (qq) => {
      for (const { t, grupoAntes, grupoDepois, funcao, rotulo } of plano) {
        const r = await qq(`UPDATE lancamentos SET grupo_gerencial = $2
                             WHERE id = $1 AND grupo_gerencial = $3 AND reserva_funcao_id = $4 AND type = 'expense' RETURNING id`, [t.id, grupoDepois, grupoAntes, funcao])
        if (r.length !== 1) throw new Error(`${rotulo}: o lançamento mudou durante a gravação — nada foi gravado`)
      }
    })
  }
  const depois = await saldos(aplicar ? new Map() : new Map(plano.map(({ t, grupoDepois }) => [t.id, grupoDepois])))
  console.log(`\n── Contas de reserva (hoje: saldo real − Σ funções = a distribuir)${aplicar ? '' : ' — depois = simulado'}`)
  for (const c of reservas) {
    console.log(`   ${nomeConta(c).padEnd(14)} real ${brl(antes[c].real).padStart(10)} | antes: Σ funções ${brl(antes[c].funcoes).padStart(10)} → a distribuir ${brl(antes[c].aDistribuir).padStart(9)}`
      + ` | depois: real ${brl(depois[c].real).padStart(10)} Σ funções ${brl(depois[c].funcoes).padStart(10)} → a distribuir ${brl(depois[c].aDistribuir).padStart(9)}`)
  }

  // ── 5. Despesas de cartão com reserva + grupo D (o formulário novo não grava mais assim)
  const [grD] = await q(`SELECT
      count(*) FILTER (WHERE g.number = '"D"'::jsonb) AS d,
      count(*) FILTER (WHERE l.grupo_gerencial IS NULL) AS sem_grupo
    FROM lancamentos l JOIN contas c ON c.id = l.account_id AND c.type = 'credit'
    LEFT JOIN reservas_funcoes g ON g.id = l.grupo_gerencial
    WHERE l.type = 'expense' AND (l.reserva_conta_id IS NOT NULL OR l.reserva_funcao_id IS NOT NULL)`)
  console.log(`\n── Despesas de cartão com reserva e grupo D: ${grD.d} · com reserva e sem grupo: ${grD.sem_grupo}`)

  console.log(`\n══ RELATÓRIO ${aplicar ? '' : '(prévia — rode com --aplicar para gravar)'}`)
  console.log(`   ${aplicar ? 'Corrigidos' : 'A corrigir'}: ${plano.length}`)
  console.log(`   Pulados: ${pulos.length}`)
  for (const [l, m] of pulos) console.log(`     ${l.rotulo} ${l.nome}: ${m}`)
} finally {
  await db.end()
}
