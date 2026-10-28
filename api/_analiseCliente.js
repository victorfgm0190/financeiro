import { criarClassificadores } from '../src/lib/receitasDespesas.js'
import { isInvestAutoOrigin } from '../src/lib/origins.js'

// ANÁLISE DO CLIENTE (admin da plataforma): visão gerencial AGREGADA do banco de um cliente.
// Regra de privacidade: só SUM/COUNT/GROUP BY. Nenhuma consulta devolve lançamento individual,
// descrição ou observação — a descrição só entra num booleano dentro do GROUP BY (resgate de
// reserva), e não sai do banco.
//
// Receita/despesa = a MESMA regra do Painel do cliente (criarClassificadores, visão "Tudo"): as
// consultas agrupam pelos campos que a regra usa e ela roda sobre os grupos. Transferência entre
// contas, entre perfis e pagamento de fatura são type 'transfer'/'credit_payment' e não entram;
// do 'transfer' só vêm os depósitos em reserva que a função marca como despesa.

export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export const SIGLA_RE = /^[a-z0-9]{1,30}$/

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Mês financeiro 'AAAA-MM' → { inicio, fim } 'AAAA-MM-DD'. Mesma regra do getFinancialPeriod:
// 'calendar' = mês do calendário; 'custom' = do dia de início até a véspera dele no mês seguinte
// (dia 15 → "2026-10" = 15/10 a 14/11).
export function periodoDoMes(mes, startDay, mode) {
  const [a, m] = mes.split('-').map(Number)
  if ((mode || 'custom') === 'calendar') return { inicio: iso(new Date(a, m - 1, 1)), fim: iso(new Date(a, m, 0)) }
  const dia = Number(startDay) || 1
  return { inicio: iso(new Date(a, m - 1, dia)), fim: iso(new Date(a, m, dia - 1)) }
}

// Mês financeiro que contém `hoje` ('AAAA-MM-DD').
export function mesFinanceiroAtual(hoje, startDay, mode) {
  const [a, m, d] = hoje.split('-').map(Number)
  const dia = Number(startDay) || 1
  const ref = (mode || 'custom') === 'calendar' || d >= dia ? new Date(a, m - 1, 1) : new Date(a, m - 2, 1)
  return `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}`
}

export const SQL_CONFIG = 'SELECT financial_month_start_day, financial_month_mode FROM configuracoes WHERE id = 1'
export const SQL_FUNCOES = 'SELECT id, exibir_como_despesa, category_id FROM reserve_functions'
export const SQL_CONTAS_RESERVA = 'SELECT id FROM contas WHERE is_reserva IS TRUE'
// Contas bancárias ativas (corrente e poupança). updated_at via to_jsonb: banco sem a coluna → null.
export const SQL_CONTAS = `
  SELECT c.name, c.apelido, c.bank, c.balance, to_jsonb(c)->>'updated_at' AS atualizado_em,
         p.name AS perfil, p.type AS perfil_tipo
    FROM contas c LEFT JOIN perfis p ON p.id = c.profile_id
   WHERE c.type IN ('checking', 'savings') AND c.active IS NOT FALSE
   ORDER BY c.balance DESC NULLS LAST, c.name`
// Data de referência quando a conta não tem updated_at: o último lançamento criado.
export const SQL_ULTIMO_LANCAMENTO = 'SELECT MAX(created_at) AS em FROM lancamentos'
export const SQL_CATEGORIAS = 'SELECT id, name, icon FROM categorias'
// Totais do período agrupados pelos campos da regra do Painel ($1..$2 = período, datas TEXT).
export const SQL_GRUPOS = `
  SELECT type, reserva_auto, reserva_funcao_id, category_id, account_id, to_account_id, origin,
         NULLIF(TRIM(payee), '') AS payee,
         (id LIKE 'tx\\_rsg\\_%' OR COALESCE(description, '') LIKE 'Resgate Reserva:%') AS resgate,
         SUM(amount) AS total, COUNT(*)::int AS n
    FROM lancamentos
   WHERE date >= $1 AND date <= $2
     AND (type IN ('income', 'expense') OR (type = 'transfer' AND reserva_funcao_id IS NOT NULL))
   GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9`

const r2 = (n) => Math.round(n * 100) / 100
const pct = (v, total) => (total > 0 ? Math.round((v / total) * 10000) / 100 : 0)

// Grupo do SQL → objeto no formato que os classificadores do Painel esperam.
const grupoComoTx = (g) => ({
  id: g.resgate ? 'tx_rsg_' : '',
  description: '',
  type: g.type,
  reservaAuto: g.reserva_auto === true,
  reservaFuncaoId: g.reserva_funcao_id || null,
  categoryId: g.category_id || null,
  accountId: g.account_id || null,
  toAccountId: g.to_account_id || null,
  origin: g.origin || null,
})

function ranking(mapa, total, limite) {
  return [...mapa.entries()]
    .map(([nome, v]) => ({ nome, total: r2(v), pct: pct(v, total) }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
    .slice(0, limite)
}

// Monta a análise a partir das linhas agregadas.
export function montarAnalise({ grupos, funcoes, contasReserva, contas, categorias, ultimoLancamento }) {
  const { isIncomeTx, isExpenseTx } = criarClassificadores(
    (funcoes || []).map(f => ({ id: f.id, exibirComoDespesa: !!f.exibir_como_despesa, categoryId: f.category_id || null })),
    (contasReserva || []).map(c => ({ id: c.id, isReserva: true })),
  )
  let receita = 0, despesa = 0
  const favReceita = new Map(), favDespesa = new Map(), porCategoria = new Map()
  const semFavorecido = { receita: 0, despesa: 0 }
  const somar = (m, k, v) => m.set(k, (m.get(k) || 0) + v)
  for (const g of grupos || []) {
    const tx = grupoComoTx(g)
    if (isInvestAutoOrigin(tx)) continue
    const v = Number(g.total) || 0
    if (isIncomeTx(tx)) {
      receita += v
      if (g.payee) somar(favReceita, g.payee, v); else semFavorecido.receita += v
    } else if (isExpenseTx(tx)) {
      despesa += v
      if (g.payee) somar(favDespesa, g.payee, v); else semFavorecido.despesa += v
      somar(porCategoria, tx.categoryId || '', v)
    }
  }
  const catById = new Map((categorias || []).map(c => [c.id, c]))
  const listaContas = (contas || []).map(c => ({
    nome: c.apelido || c.name,
    banco: c.bank || null,
    perfil: c.perfil || null,
    perfilTipo: c.perfil ? (c.perfil_tipo === 'pj' ? 'CNPJ' : 'CPF') : null,
    saldo: r2(Number(c.balance) || 0),
    atualizadoEm: c.atualizado_em || null,
  }))
  return {
    receita: r2(receita),
    despesa: r2(despesa),
    resultado: r2(receita - despesa),
    contas: listaContas,
    totalContas: r2(listaContas.reduce((s, c) => s + c.saldo, 0)),
    // Sem updated_at na conta, o "saldo registrado em" usa esta data.
    saldoReferencia: ultimoLancamento || null,
    favorecidosReceita: ranking(favReceita, receita, 5),
    favorecidosDespesa: ranking(favDespesa, despesa, 10),
    semFavorecido: { receita: r2(semFavorecido.receita), despesa: r2(semFavorecido.despesa) },
    categorias: [...porCategoria.entries()]
      .map(([id, v]) => {
        const c = catById.get(id)
        return { nome: c?.name || 'Sem categoria', icone: c?.icon || null, total: r2(v), pct: pct(v, despesa) }
      })
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome)),
  }
}

// Roda as consultas (q = query no banco do cliente) e monta a análise do mês.
export async function analisarBanco(q, { mes, hoje }) {
  const [cfg] = await q(SQL_CONFIG)
  const startDay = cfg?.financial_month_start_day || 1
  const mode = cfg?.financial_month_mode || 'custom'
  const mesFinal = mes || mesFinanceiroAtual(hoje, startDay, mode)
  const periodo = periodoDoMes(mesFinal, startDay, mode)
  const [grupos, funcoes, contasReserva, contas, categorias, [ult]] = await Promise.all([
    q(SQL_GRUPOS, [periodo.inicio, periodo.fim]),
    q(SQL_FUNCOES),
    q(SQL_CONTAS_RESERVA),
    q(SQL_CONTAS),
    q(SQL_CATEGORIAS),
    q(SQL_ULTIMO_LANCAMENTO),
  ])
  return {
    mes: mesFinal,
    periodo,
    inicioMes: { dia: startDay, modo: mode },
    ...montarAnalise({ grupos, funcoes, contasReserva, contas, categorias, ultimoLancamento: ult?.em || null }),
  }
}
