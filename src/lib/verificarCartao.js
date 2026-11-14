// VERIFICAR E CORRIGIR (tela Cartão de Crédito) — o que está diferente no cartão, por seção. Puro:
// só LÊ o estado; quem aplica é o modal (components/CreditCard/VerificarCorrigirModal), com as ações
// normais do app e as funções do motor (só chamadas). Substitui "Atualizar", "Revisar Movimentos
// Automáticos" e "Reconciliar Gerenciais" (docs/botoes-cartao-diagnostico.md).
//   a) lançamentos de cartão sem o tipo da conta         (não gerencial)
//   b) gastos do grupo G sem etapa A + o que o motor mudaria nas etapas/agendamentos da fatura
//   c) "fantasmas" na conta Ger. e detalhamento por função que não soma o resgate/devolução
//   d) lançamentos em fatura errada / duplicatas, em qualquer fatura do cartão   (não gerencial)
//   e) saldo gravado da conta Ger. × as transferências (o que o Reconciliar regravava sem mostrar)
//   f) agendamentos geridos pendentes que o recálculo REMOVERIA (fatura sem gasto)
//   g) faturas antigas sem pagamento, anteriores à última fatura paga               (não gerencial)
// O item (b) do motor (computeRevisaoFatura) é assíncrono e vem do AppContext — o modal o junta aqui.
import { lancamentosSemTipoDeConta } from './tipoDaConta.js'
import { lancamentosDaFatura, faturaAtualDoCartao, faturaDoLancamento, pagoDaFatura, situacaoDaFatura } from './faturaCartao.js'
import { faturaEstaFechada } from './faturasFechadas.js'
import { executarRegras, REGRAS_COMPETENCIA } from './integridade/regras.js'
import { ehParcela2aN, fechamentoDaFatura, situacaoDaEtapaA } from './etapaACiclo.js'
import { planejarCorrecoesCompetencia } from './revisaoCompetencia.js'
import { isAutomacaoOrigin } from './origins.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const SECOES = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
export const SECOES_NAO_GERENCIAIS = new Set(['a', 'd', 'g'])
export const TITULO_SECAO = {
  a: 'Lançamentos de cartão sem tipo de conta',
  b: 'Etapas A e agendamentos da fatura',
  c: 'Lançamentos "fantasma" e detalhamento por função',
  d: 'Lançamentos em fatura errada ou duplicados',
  e: 'Saldo da conta Ger.',
  f: 'Agendamentos que seriam removidos (fatura sem gasto)',
  g: 'Faturas antigas sem pagamento',
}
const GERIDOS = new Set(['gerencial_devolucao', 'resgate_reserva', 'pagamento_fatura'])
export const ymParaRef = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '')

// Conta Ger. do cartão (subconta do grupo G): "Ger. <apelido>".
export function contaGerDoCartao(accounts, card) {
  const apelido = card?.apelido || card?.name?.slice(0, 6) || 'CC'
  return (accounts || []).find(a => a.name === `Ger. ${apelido}`) || null
}

// Etapa A de um gasto: a automática (tx_gerA_) ou a do "Executar Gerenciais" (tx_ger_), ligadas
// ao gasto por sourceExpenseId.
const ehEtapaA = (t) => t?.type === 'transfer' && t.sourceExpenseId && /^tx_ger(A)?_/.test(String(t.id))

// Regra do ciclo (parcela 2..N): lib/etapaACiclo — a mesma do motor de integridade.
export { ehParcela2aN, fechamentoDaFatura, situacaoDaEtapaA }

// Etapa A devida (para aplicar): à vista / parcela 1 sempre (nasce na compra); 2..N quando a fatura
// já entrou no ciclo (passada ou do mês). Fatura fechada pelo usuário: nada.
export function etapaADevida(card, fatura, hoje, faturasFechadas = {}, settings = {}, tx = null) {
  if (!card || !fatura || !hoje || faturaEstaFechada(faturasFechadas, card.id, fatura)) return false
  if (tx && !ehParcela2aN(tx)) return true
  return situacaoDaEtapaA(card, fatura, hoje, settings) !== 'futura'
}

// (b) Gastos do grupo G da fatura SEM etapa A — por qualquer motivo, inclusive sem o tipo da conta
// (que o motor não enxerga). Não depende de accountType: o cartão é a conta do lançamento. Separa:
//   faltando   → ERRO: à vista / parcela 1 sem etapa A, ou parcela 2..N de fatura de ciclo passado;
//   doMes      → parcela 2..N cuja fatura entrou no ciclo atual (o "Executar Gerenciais" do mês);
//   aguardando → parcela 2..N de fatura que ainda não entrou no ciclo (informativo).
// Sem `hoje`, tudo o que falta é "faltando" (uso direto em testes antigos).
export function gastosGSemEtapaA({ transactions = [], gerencialGroups = [], card, fatura, hoje = null, faturasFechadas = {}, settings = {} }) {
  const grupoG = gerencialGroups.find(g => g.number === 1)
  const soma = (l) => r2(l.reduce((s, t) => s + (Number(t.amount) || 0), 0))
  const vazio = { itens: [], faltando: [], doMes: [], aguardando: [], totalG: 0, totalEtapas: 0, diferenca: 0, valorDoMes: 0, valorAguardando: 0 }
  if (!grupoG || !card || !fatura || (hoje && faturaEstaFechada(faturasFechadas, card.id, fatura))) return vazio
  const etapaDe = new Map()
  for (const t of transactions) if (ehEtapaA(t)) etapaDe.set(t.sourceExpenseId, t)
  const gastos = transactions.filter(t => t.accountId === card.id && t.type === 'expense' && t.grupoGerencial === grupoG.id
    && !isAutomacaoOrigin(t) && faturaDoLancamento(t, card) === fatura)
  const semEtapa = gastos.filter(t => !etapaDe.has(t.id))
  const situacao = hoje ? situacaoDaEtapaA(card, fatura, hoje, settings) : 'passada'
  const faltando = semEtapa.filter(t => !ehParcela2aN(t) || situacao === 'passada')
  const doMes = situacao === 'mes' ? semEtapa.filter(ehParcela2aN) : []
  const aguardando = situacao === 'futura' ? semEtapa.filter(ehParcela2aN) : []
  const totalG = soma(gastos)
  const totalEtapas = r2(gastos.filter(t => etapaDe.has(t.id)).reduce((s, t) => s + (Number(etapaDe.get(t.id).amount) || 0), 0))
  return {
    ...vazio, faltando, doMes, aguardando, itens: [...faltando, ...doMes], totalG, totalEtapas,
    diferenca: soma(faltando), valorDoMes: soma(doMes), valorAguardando: soma(aguardando),
  }
}

// (c) Fantasmas: entradas na conta Ger. do cartão sem fatura e com id que o motor não reconhece.
export function fantasmasDaGer({ transactions = [], accounts = [], card }) {
  const ger = contaGerDoCartao(accounts, card)
  if (!ger) return []
  return transactions.filter(tx => tx.toAccountId === ger.id && !tx.faturaRef && !/^tx_ger(A)?_/.test(String(tx.id)))
}

// (c) Resgate/devolução da fatura cujo detalhamento por função não soma o valor.
export function detalhamentoDivergente({ schedules = [], scheduleReservaFuncoes = [], card, fatura }) {
  const soma = (id) => r2(scheduleReservaFuncoes.filter(l => l.scheduleId === id).reduce((s, l) => s + (Number(l.valor) || 0), 0))
  const qtd = (id) => scheduleReservaFuncoes.filter(l => l.scheduleId === id).length
  return schedules
    .filter(s => s.cardId === card?.id && s.faturaMesAno === fatura && (s.tipo === 'resgate_reserva' || s.tipo === 'gerencial_devolucao'))
    .filter(s => Math.abs(r2(s.amount) - soma(s.id)) > 0.01 || (s.tipo === 'gerencial_devolucao' && qtd(s.id) === 0))
    .map(s => ({ id: s.id, tipo: s.tipo, descricao: s.description, valor: r2(s.amount), soma: soma(s.id), fatura }))
}

// (d) Competência fora do lugar (o mesmo plano do antigo Revisar, seção 4): em QUALQUER fatura.
export function planoDeCompetencia({ transactions = [], accounts = [], schedules = [], gerencialGroups = [], card }) {
  if (!card) return []
  const ger = contaGerDoCartao(accounts, card)
  const div = executarRegras({ transactions, accounts, schedules, gerencialGroups }, { desde: null, regras: REGRAS_COMPETENCIA })
    .filter(d => d.conta_id === card.id || (ger && d.conta_id === ger.id))
  if (!div.length) return []
  return planejarCorrecoesCompetencia({ divergencias: div, transactions, card }).itens
    .filter(it => ['excluir_duplicata', 'mover', 'excluir_reserva'].includes(it.tipo))
}

// (e) Contas Ger. com saldo gravado diferente das transferências (o passo B do reconciliarGerencial,
// só que mostrado antes). Grupo G = number 1, ou nome "Ger. ".
export function saldosGerDivergentes({ accounts = [], transactions = [], gerencialGroups = [] }) {
  const grupoG = gerencialGroups.find(g => g.number === 1)
  const gers = accounts.filter(a => (grupoG && a.grupoGerencial === grupoG.id) || /^Ger\. /.test(a.name || ''))
  return gers.map(a => {
    let ent = 0, sai = 0
    for (const t of transactions) {
      if (t.type !== 'transfer') continue
      if (t.toAccountId === a.id) ent += Number(t.amount) || 0
      if (t.accountId === a.id) sai += Number(t.amount) || 0
    }
    const real = r2(ent - sai)
    return { id: a.id, nome: a.name, gravado: r2(a.balance), real, diferenca: r2(real - (Number(a.balance) || 0)) }
  }).filter(x => Math.abs(x.diferenca) > 0.005)
}

// (f) Agendamentos geridos PENDENTES (nada registrado nem pulado) de faturas do cartão sem gasto: o
// recálculo os removeria. Fatura de ciclo passado o motor preserva — `hoje` corta essas. Fatura com
// compra AGENDADA (previstoDe(fatura) > 0 — agendamentosPrevistosDaFatura, a regra dos previstos da
// tela) NÃO é "sem gasto": o motor monta o resgate dela com os previstos e o mantém.
export function agendamentosSemGasto({ schedules = [], transactions = [], card, hoje, previstoDe = () => 0 }) {
  if (!card) return []
  const comGasto = new Set(transactions
    .filter(t => t.accountId === card.id && t.type === 'expense' && !isAutomacaoOrigin(t))
    .map(t => faturaDoLancamento(t, card)))
  const aberta = faturaAtualDoCartao(card, hoje)
  return schedules
    .filter(s => s.cardId === card.id && GERIDOS.has(s.tipo) && s.faturaMesAno && s.faturaMesAno >= aberta
      && !(s.registered || []).length && !(s.skipped || []).length && !comGasto.has(s.faturaMesAno)
      && !(previstoDe(s.faturaMesAno) > 0))
    .map(s => ({ id: s.id, tipo: s.tipo, descricao: s.description, valor: r2(s.amount), fatura: s.faturaMesAno }))
}

// (g) Faturas FECHADAS (antes da aberta) sem pagamento e anteriores à última fatura paga, ainda não
// marcadas como fechadas: restos de antes de as faturas serem acompanhadas. Ação: Fechar fatura.
export function faturasAntigasSemPagamento({ transactions = [], schedules = [], card, hoje, faturasFechadas = {} }) {
  if (!card) return []
  const aberta = faturaAtualDoCartao(card, hoje)
  const chaves = [...new Set(transactions.filter(t => t.accountId === card.id && (t.type === 'expense' || t.type === 'income'))
    .map(t => faturaDoLancamento(t, card)))].filter(k => k && k < aberta).sort()
  const sit = chaves.map(key => {
    const f = lancamentosDaFatura(transactions, card, key)
    const pago = pagoDaFatura(transactions, schedules, card, key, f)
    return { key, f, pago, s: situacaoDaFatura({ total: f.total, pago }) }
  })
  let ultimaPaga = -1
  sit.forEach((x, i) => { if (x.s.paga) ultimaPaga = i })
  return sit.slice(0, Math.max(0, ultimaPaga))
    .filter(x => !x.s.paga && !x.s.semValor && !faturaEstaFechada(faturasFechadas, card.id, x.key))
    .map(x => ({ fatura: x.key, total: x.f.total, pago: x.pago, lancamentos: x.f.lancamentos }))
}

// Tudo o que é síncrono, por seção. `faturas` = as faturas em verificação (a da tela ou todas).
export function verificarCartao({ transactions = [], accounts = [], schedules = [], scheduleReservaFuncoes = [], gerencialGroups = [],
  faturasFechadas = {}, card, faturas = [], hoje, gerencialLigado = true, previstoDe = () => 0, settings = {} }) {
  const naFatura = (t) => faturas.includes(faturaDoLancamento(t, card))
  const out = {
    a: lancamentosSemTipoDeConta(transactions, accounts, card?.id).filter(naFatura),
    d: planoDeCompetencia({ transactions, accounts, schedules, gerencialGroups, card }),
    g: faturasAntigasSemPagamento({ transactions, schedules, card, hoje, faturasFechadas }),
  }
  if (gerencialLigado) {
    const porFatura = faturas.map(f => ({ fatura: f, ...gastosGSemEtapaA({ transactions, gerencialGroups, card, fatura: f, hoje, faturasFechadas, settings }) }))
    out.b = {
      semEtapa: porFatura.filter(x => x.itens.length),
      // ERRO (faltando) × tarefa do mês (doMes) em R$.
      diferenca: r2(porFatura.reduce((s, x) => s + x.diferenca, 0)),
      valorDoMes: r2(porFatura.reduce((s, x) => s + x.valorDoMes, 0)),
      // Informativo (sem caixa): parcelas de faturas que ainda não abriram, aguardando a vez da etapa A.
      aguardando: { qtd: porFatura.reduce((s, x) => s + x.aguardando.length, 0), valor: r2(porFatura.reduce((s, x) => s + x.valorAguardando, 0)) },
    }
    out.c = {
      fantasmas: fantasmasDaGer({ transactions, accounts, card }),
      detalhamento: faturas.flatMap(f => detalhamentoDivergente({ schedules, scheduleReservaFuncoes, card, fatura: f })),
    }
    out.e = saldosGerDivergentes({ accounts, transactions, gerencialGroups })
    out.f = agendamentosSemGasto({ schedules, transactions, card, hoje, previstoDe })
  }
  return out
}

// Pendências por seção (para o aviso e os títulos). `revisao` = prévia do motor por fatura (b).
export function contarPendencias(v, revisao = []) {
  const n = {
    a: v.a?.length || 0,
    b: (v.b?.semEtapa || []).reduce((s, x) => s + x.itens.length, 0) + revisao.reduce((s, r) => s + (r.acoes?.length || 0), 0),
    c: (v.c?.fantasmas?.length || 0) + (v.c?.detalhamento?.length || 0),
    d: v.d?.length || 0,
    e: v.e?.length || 0,
    f: v.f?.length || 0,
    g: v.g?.length || 0,
  }
  return { ...n, total: Object.values(n).reduce((s, x) => s + x, 0) }
}

// AVISO ao abrir a fatura. Dois tons:
//   erro → lançamento sem tipo de conta, etapa A faltando (à vista / parcela 1, ou parcela de ciclo
//          passado) e as divergências das regras do motor de integridade para esta fatura — inclusive
//          GER_ETAPA_A_FALTANDO e GER_FECHAMENTO_FATURA, que usam a MESMA regra do ciclo (lib/etapaACiclo);
//   mes  → parcelas 2..N do cartão cuja fatura entrou no ciclo atual ("Executar Gerenciais" do mês).
// Contagem: cada LANÇAMENTO conta uma vez (sem tipo de conta e/ou etapa A faltando), mais uma por
// divergência de fatura (fechamento, saldo, resgate, competência). Gerencial desligado: só o não gerencial.
// → { erro: { total, secao, semEtapa, semTipo, regras } | null, mes: { qtd, valor, fatura, ids } | null } | null
const REGRAS_AVISO_GERENCIAL = ['GER_ETAPA_A_FALTANDO', 'GER_ETAPA_A_VALOR', 'GER_FECHAMENTO_FATURA', 'NUM_RESGATE_FALTANDO', 'NUM_RESGATE_VALOR', 'GER_SALDO_SUBCONTA']
const SECAO_DA_REGRA = { GER_ETAPA_A_FALTANDO: 'b', GER_ETAPA_A_VALOR: 'b', GER_FECHAMENTO_FATURA: 'b', NUM_RESGATE_FALTANDO: 'b', NUM_RESGATE_VALOR: 'b', GER_SALDO_SUBCONTA: 'e' }
// Pendências do motor de integridade para a fatura (a mesma conta do menu Alertas, só desta fatura).
export function pendenciasDaFatura({ transactions = [], accounts = [], schedules = [], gerencialGroups = [], faturasFechadas = {}, card, fatura, hoje, gerencialLigado = true, settings = {} }) {
  const ger = contaGerDoCartao(accounts, card)
  const regras = [...REGRAS_COMPETENCIA, ...(gerencialLigado ? REGRAS_AVISO_GERENCIAL : [])]
  return executarRegras({ transactions, accounts, schedules, gerencialGroups, faturasFechadas, settings }, { hoje, desde: fatura, regras })
    .filter(d => d.fatura_ref === ymParaRef(fatura) && (d.conta_id === card.id || (ger && d.conta_id === ger.id)))
}
const quase = (a, b) => Math.abs(r2(a) - r2(b)) <= 0.005
export function soPorFaltaDeEtapaA(d) {
  const e = d?.encontrado || {}
  if (d?.regra === 'GER_FECHAMENTO_FATURA') {
    if (!(e.soma_sem_etapa_a > 0) || !quase(e.diferenca_g_etapa_a, e.soma_sem_etapa_a)) return false
    // A devolução acompanha as etapas A que existem (o motor a refaz quando a etapa nasce) ou já inclui os gastos.
    const ag = e.soma_aguardando || 0
    return e.devolucao != null && (quase(r2(e.soma_etapas_a + ag), e.devolucao) || quase(r2(e.soma_etapas_a + e.soma_sem_etapa_a + ag), e.devolucao))
  }
  if (d?.regra === 'GER_SALDO_SUBCONTA') return e.sem_etapa_a > 0 && quase(r2(e.diferenca + e.sem_etapa_a), 0)
  return false
}
export function avisoDaFatura({ transactions = [], accounts = [], schedules = [], gerencialGroups = [], faturasFechadas = {}, card, fatura, hoje, gerencialLigado = true, settings = {} }) {
  if (!card || !fatura) return null
  const semTipo = lancamentosSemTipoDeConta(transactions, accounts, card.id).filter(t => faturaDoLancamento(t, card) === fatura)
  const div = pendenciasDaFatura({ transactions, accounts, schedules, gerencialGroups, faturasFechadas, card, fatura, hoje, gerencialLigado, settings })
  const semEtapa = gerencialLigado ? gastosGSemEtapaA({ transactions, gerencialGroups, card, fatura, hoje, faturasFechadas, settings }) : null
  // Cada lançamento conta UMA vez: sem tipo de conta, etapa A faltando (nossa conta e a regra do motor).
  // Parcela "do mês" (fatura no ciclo atual, ainda sem etapa A) é a tarefa do mês: vai para a faixa
  // neutra, não para a de erro — no motor ela é a mesma GER_ETAPA_A_FALTANDO.
  const doMes = new Set((semEtapa?.doMes || []).map(t => t.id))
  const porLancamento = new Set([
    ...semTipo.map(t => t.id), ...(semEtapa?.faltando || []).map(t => t.id),
    ...div.filter(d => d.regra === 'GER_ETAPA_A_FALTANDO' && !doMes.has(d.origem_id)).map(d => d.origem_id),
  ])
  // Fechamento da fatura e saldo da Ger. que só diferem por causa desses mesmos lançamentos sem etapa A
  // não contam de novo (é o mesmo lançamento visto pelo total da fatura / pelo saldo da subconta).
  const porFatura = div.filter(d => d.regra !== 'GER_ETAPA_A_FALTANDO' && !soPorFaltaDeEtapaA(d))
  const totalErro = porLancamento.size + porFatura.length
  const erro = totalErro ? {
    total: totalErro,
    secao: semTipo.length ? 'a' : (semEtapa?.faltando.length || div.some(d => d.regra === 'GER_ETAPA_A_FALTANDO')) ? 'b' : (SECAO_DA_REGRA[porFatura[0]?.regra] || 'd'),
    semEtapa: semEtapa?.diferenca || 0, semTipo: semTipo.length, regras: div.map(d => d.regra),
  } : null
  // Tarefa do mês: a fatura do cartão que entrou no ciclo atual (vale qualquer que seja a fatura na tela).
  let mes = null
  if (gerencialLigado) {
    const faturas = [...new Set(transactions.filter(t => t.accountId === card.id && t.type === 'expense').map(t => faturaDoLancamento(t, card)))].filter(Boolean)
    for (const f of faturas) {
      if (situacaoDaEtapaA(card, f, hoje, settings) !== 'mes') continue
      const r = gastosGSemEtapaA({ transactions, gerencialGroups, card, fatura: f, hoje, faturasFechadas, settings })
      if (r.doMes.length) mes = { qtd: r.doMes.length, valor: r.valorDoMes, fatura: f, ids: r.doMes.map(t => t.id) }
    }
  }
  return erro || mes ? { erro, mes } : null
}
