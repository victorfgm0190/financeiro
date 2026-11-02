// Assistente IA — CONSULTA PROPOSITIVA de movimentos 🟢 (consultar_movimentos). PURO.
// "O que já paguei ao João?", "quanto falta pagar ao João?", "quanto gastei em Combustível?",
// "o que está vencido da academia?". A IA só devolve o FILTRO (assunto, status, favorecido,
// categoria, descrição, conta, período); TODO número sai daqui, com as funções das telas:
//   • PAGOS        → lançamentos do perfil (profileReportTransactions) com a classificação do Painel
//                    (criarClassificadores: sem sombras de reserva, sem resgates, sem investimento
//                    automático, sem transferências). Categoria de despesa = despesasPorCategoria
//                    (o mesmo número do bloco "Maiores despesas" do Painel).
//   • EM ABERTO    → ocorrenciasPendentes(buildScheduleGroups(...)) — as mesmas ocorrências da Agenda
//                    e da tela de Agendamentos (data e valor efetivos). Sem provisões, resgates,
//                    aplicações e transferências.
//   • VENCIDOS     → em aberto com data < hoje.
// Somente leitura. Os botões de refinamento só trocam o filtro e recalculam aqui (sem a IA).
import { normalizarTermo } from './texto.js'
import { palavras, semelhanca } from './consultaAgendamento.js'
import { despesasPorCategoria } from '../despesasPorCategoria.js'
import { isInvestAutoOrigin } from '../origins.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const ddmm = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '')
const ddmmaaaa = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '')
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export const ASSUNTOS = ['agendamento', 'lancamento', 'favorecido', 'categoria']
export const STATUS_CONSULTA = ['pago', 'em_aberto', 'vencido', 'todos']
export const TIPOS_CONSULTA = ['despesa', 'receita', 'todos']
export const PERIODOS_CONSULTA = ['mes_atual', 'mes_passado', 'ultimos_3_meses', 'este_ano', 'intervalo', 'historico', 'pendentes']
export const ROTULO_PERIODO = {
  mes_atual: 'Este mês', mes_passado: 'Mês passado', ultimos_3_meses: 'Últimos 3 meses', este_ano: 'Este ano',
  intervalo: 'Período escolhido', historico: 'Todo o histórico', pendentes: 'Todas as pendentes',
}
// "Em aberto" sem período: todas as pendentes — vencidas + as que vêm. Recorrente sem fim não tem
// última: vai até 12 meses à frente (a Agenda também recorta por período).
export const MESES_A_FRENTE = 12
export const MAX_ITENS = 5
export const MAX_RELACIONADOS = 3
export const MAX_BOTOES = 4

const somaMeses = (ymd, n) => {
  const [y, m] = ymd.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n + 1, 0))
  return d.toISOString().slice(0, 10)
}
const ultimoDia = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

// ─── Período ────────────────────────────────────────────────────────────────────────────────────
// → { ini, fim, rotulo }. `mesPainel(filtro)` ('current' | 'prev' | '3m') devolve { start, end } do
// MÊS FINANCEIRO (periodoDoFiltro + getFinancialPeriod, como o Painel); sem ele, mês civil.
export function intervaloDoPeriodo(periodo, { hoje, de = null, ate = null, mesPainel = null } = {}) {
  const civil = (f) => {
    const [y, m] = hoje.split('-').map(Number)
    if (f === 'current') return { start: `${hoje.slice(0, 7)}-01`, end: ultimoDia(y, m) }
    if (f === 'prev') { const p = m === 1 ? [y - 1, 12] : [y, m - 1]; return { start: `${p[0]}-${String(p[1]).padStart(2, '0')}-01`, end: ultimoDia(p[0], p[1]) } }
    const p = m <= 2 ? [y - 1, m + 10] : [y, m - 2]
    return { start: `${p[0]}-${String(p[1]).padStart(2, '0')}-01`, end: ultimoDia(y, m) }
  }
  const mes = mesPainel || civil
  const faixa = (ini, fim, rot) => ({ ini, fim, rotulo: `${rot} (${ddmm(ini)} a ${ddmm(fim)})` })
  switch (periodo) {
    case 'mes_passado': { const p = mes('prev'); return faixa(p.start, p.end, 'Mês passado') }
    case 'ultimos_3_meses': { const p = mes('3m'); return faixa(p.start, p.end, 'Últimos 3 meses') }
    case 'este_ano': return faixa(`${hoje.slice(0, 4)}-01-01`, `${hoje.slice(0, 4)}-12-31`, 'Este ano')
    case 'intervalo':
      if (de && ate && de <= ate) return { ini: de, fim: ate, rotulo: `De ${ddmmaaaa(de)} a ${ddmmaaaa(ate)}` }
      return intervaloDoPeriodo('mes_atual', { hoje, mesPainel })
    case 'historico': return { ini: '0000-01-01', fim: hoje, rotulo: 'Todo o histórico' }
    case 'pendentes': return { ini: '0000-01-01', fim: somaMeses(hoje, MESES_A_FRENTE), rotulo: `Todas as pendentes (recorrentes até ${ddmmaaaa(somaMeses(hoje, MESES_A_FRENTE))})` }
    case 'mes_atual':
    default: { const p = mes('current'); return faixa(p.start, p.end, 'Este mês') }
  }
}

// ─── Filtro inicial (a partir dos parâmetros validados da IA) ──────────────────────────────────
// Padrões seguros: pago sem período = mês atual (histórico se a pergunta pediu); em aberto sem
// período = todas as pendentes; vencido = tudo antes de hoje.
export function filtroInicial(p = {}) {
  const status = STATUS_CONSULTA.includes(p.status) ? p.status : 'pago'
  const temDatas = !!(p.de && p.ate && p.de <= p.ate)
  let periodo = PERIODOS_CONSULTA.includes(p.periodo) ? p.periodo : null
  if (temDatas) periodo = 'intervalo'
  if (!periodo) periodo = status === 'pago' ? (p.historico_completo ? 'historico' : 'mes_atual') : status === 'todos' ? 'mes_atual' : 'pendentes'
  return {
    assunto: ASSUNTOS.includes(p.assunto) ? p.assunto : (p.categoria_id || p.categoria ? 'categoria' : p.favorecido ? 'favorecido' : 'lancamento'),
    status, tipo: TIPOS_CONSULTA.includes(p.tipo) ? p.tipo : 'despesa',
    favorecido: p.favorecido || null, categoriaId: p.categoria_id || null, categoriaTermo: p.categoria || null,
    descricao: p.descricao || null, contaId: p.conta_id || null,
    periodo, de: temDatas ? p.de : null, ate: temDatas ? p.ate : null,
  }
}

// ─── Resolver nomes (favorecido, categoria) — sem escolher sozinho na dúvida ───────────────────
// → { valor, opcoes, sugestoes }: valor = o nome certo; opcoes = vários que contêm o termo (perguntar);
// sugestoes = parecidos por erro de digitação/voz (perguntar "você quis dizer"). Nenhum → tudo vazio.
export function resolverNome(termo, nomes) {
  const alvo = normalizarTermo(termo)
  if (!alvo) return { valor: null, opcoes: [], sugestoes: [] }
  const unicos = [...new Map((nomes || []).filter(Boolean).map(n => [normalizarTermo(n), n])).values()]
  const exato = unicos.find(n => normalizarTermo(n) === alvo)
  if (exato) return { valor: exato, opcoes: [], sugestoes: [] }
  const q = palavras(termo)
  if (!q.length) return { valor: null, opcoes: [], sugestoes: [] }
  // Contém TODAS as palavras do termo (palavra inteira ou começo dela).
  const contem = unicos.filter(n => { const w = palavras(n); return q.every(t => w.some(x => x === t || (t.length >= 3 && x.startsWith(t)))) })
  if (contem.length === 1) return { valor: contem[0], opcoes: [], sugestoes: [] }
  if (contem.length > 1) return { valor: null, opcoes: contem.sort((a, b) => a.localeCompare(b)), sugestoes: [] }
  // Parecidos: todas as palavras do termo com semelhança (letra trocada, voz).
  const parecidos = unicos
    .map(n => { const w = palavras(n); return { n, s: q.reduce((acc, t) => acc + Math.max(0, ...w.map(x => semelhanca(t, x))), 0) / q.length } })
    .filter(x => x.s >= 0.7).sort((a, b) => b.s - a.s).map(x => x.n)
  return { valor: null, opcoes: [], sugestoes: parecidos.slice(0, MAX_BOTOES) }
}

// ─── Relação de um item com o filtro (favorecido/categoria/descrição/conta) ─────────────────────
// Favorecido: o NOME resolvido, igual (não "contém"). Categoria: o id. Descrição: TODAS as palavras
// do termo (uma palavra solta coincidente não basta). Conta: origem ou destino.
export function casaComFiltro(item, f) {
  if (f.favorecido && normalizarTermo(item.payee) !== normalizarTermo(f.favorecido)) return false
  if (f.categoriaId && item.categoryId !== f.categoriaId) return false
  if (f.contaId && item.accountId !== f.contaId && item.toAccountId !== f.contaId) return false
  if (f.descricao) {
    const q = palavras(f.descricao)
    const w = palavras(item.description)
    if (!q.length || !q.every(t => w.some(x => x === t || (t.length >= 3 && x.startsWith(t))))) return false
  }
  return true
}
export const temRelacao = (f) => !!(f.favorecido || f.categoriaId || f.descricao)

// ─── PAGOS: lançamentos do perfil, classificação do Painel ─────────────────────────────────────
// cls = criarClassificadores(...) + { isResgateReservaSombra }. Pagos = até hoje (o que ainda vai
// cair — parcela futura do cartão — não foi pago). Categoria de despesa sem descrição/favorecido/
// conta = o número do Painel (despesasPorCategoria, modo do usuário).
export function pagosDoFiltro(transactions, f, { ini, fim }, cls, { hoje, modo = 'cheio' } = {}) {
  if (f.assunto === 'categoria' && f.categoriaId && f.tipo === 'despesa' && !f.favorecido && !f.descricao && !f.contaId) {
    const r = despesasPorCategoria(transactions, { start: ini, end: fim }, cls, modo)
    const c = r.categorias.find(x => x.categoryId === f.categoriaId)
    const itens = [...(c?.despesas || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return { itens, total: c ? c.valor : 0, painel: true }
  }
  const lado = (t) => (f.tipo === 'receita' ? cls.isIncomeTx(t) : f.tipo === 'despesa' ? cls.isExpenseTx(t) : cls.isIncomeTx(t) || cls.isExpenseTx(t))
  const ate = hoje && hoje < fim ? hoje : fim
  const itens = (transactions || [])
    .filter(t => t.date >= ini && t.date <= ate && !isInvestAutoOrigin(t) && lado(t) && casaComFiltro(t, f))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return { itens, total: r2(itens.reduce((s, t) => s + (Number(t.amount) || 0), 0)), painel: false }
}

// ─── EM ABERTO / VENCIDOS: ocorrências pendentes da Agenda ─────────────────────────────────────
// itens = ocorrenciasPendentes(rows, getNextOccurrences, { ini, fim, hoje, accounts }).
const GRUPOS_TIPO = { despesa: ['despesa'], receita: ['receita'], todos: ['despesa', 'receita'] }
export function abertosDoFiltro(itens, f, { hoje, soVencidos = false } = {}) {
  const grupos = GRUPOS_TIPO[f.tipo] || GRUPOS_TIPO.despesa
  const lista = (itens || [])
    .filter(i => grupos.includes(i.grupo) && !i.schedule?.isProvisao && casaComFiltro(i.schedule || {}, f))
    .filter(i => !soVencidos || i.data < hoje)
    .sort((a, b) => a.data.localeCompare(b.data))
  const vencidos = lista.filter(i => i.data < hoje)
  return {
    itens: lista, total: r2(lista.reduce((s, i) => s + i.amount, 0)),
    vencidos: vencidos.length, totalVencido: r2(vencidos.reduce((s, i) => s + i.amount, 0)),
    proximo: lista.find(i => i.data >= hoje) || null,
  }
}

// ─── Textos (montados aqui; a IA não redige números) ───────────────────────────────────────────
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmt = (v) => moeda.format(Number(v) || 0).replace(/\s/g, ' ')
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`

export function rotuloDoAlvo(f, nomeCategoria = (id) => id) {
  const partes = []
  if (f.favorecido) partes.push(`${f.status === 'pago' ? (f.tipo === 'receita' ? 'de' : 'a') : 'com'} ${f.favorecido}`)
  if (f.categoriaId) partes.push(`em ${nomeCategoria(f.categoriaId)}`)
  if (f.descricao) partes.push(`“${f.descricao}”`)
  return partes.join(' ')
}

// Frase da resposta principal.
export function textoPrincipal(f, res, { nomeCategoria = (id) => id, nomeConta = (id) => id } = {}) {
  const alvo = rotuloDoAlvo(f, nomeCategoria) || (f.tipo === 'receita' ? '(todas as receitas)' : f.tipo === 'todos' ? '(tudo)' : '(todas as despesas)')
  const conta = f.contaId ? ` na conta ${nomeConta(f.contaId)}` : ''
  const per = res.periodo.rotulo
  if (f.status === 'pago') {
    const verbo = f.tipo === 'receita' ? 'Recebido' : f.assunto === 'categoria' ? 'Gasto' : 'Pago'
    if (!res.pagos.itens.length) return `Nada ${verbo.toLowerCase()} ${alvo}${conta} — ${per}.`
    return `${verbo} ${alvo}${conta}: ${fmt(res.pagos.total)} em ${plural(res.pagos.itens.length, 'lançamento', 'lançamentos')} — ${per}.`
  }
  if (f.status === 'todos') {
    return `${alvo}${conta} — ${per}: pago ${fmt(res.pagos.total)} (${res.pagos.itens.length}) e em aberto ${fmt(res.abertos.total)} (${res.abertos.itens.length}).`
  }
  const a = res.abertos
  const nome = f.status === 'vencido' ? 'vencido' : 'em aberto'
  if (!a.itens.length) return `Nada ${nome} ${alvo}${conta}${f.status === 'vencido' ? '' : ` — ${per}`}.`
  const prox = f.status !== 'vencido' && a.proximo ? ` Próximo vencimento: ${ddmmaaaa(a.proximo.data)} (${fmt(a.proximo.amount)}).` : ''
  const venc = f.status !== 'vencido' && a.vencidos ? ` ${plural(a.vencidos, 'vencido', 'vencidos')} (${fmt(a.totalVencido)}).` : ''
  return `${f.status === 'vencido' ? 'Vencido' : 'Em aberto'} ${alvo}${conta}: ${fmt(a.total)} em ${plural(a.itens.length, 'ocorrência', 'ocorrências')}${f.status === 'vencido' ? '' : ` — ${per}`}.${venc}${prox}`
}

// "Também encontrei": o lado oposto ao perguntado, pela MESMA relação (favorecido/categoria/
// descrição). Sem relação clara → null (só a resposta principal).
//   pago → em aberto + vencidos (todas as pendentes); em aberto/vencido → pagos dos últimos 12 meses.
export function textoComplemento(f, comp) {
  if (!comp) return null
  if (comp.tipo === 'abertos') {
    const a = comp.dados
    if (!a.itens.length) return null
    const venc = a.vencidos ? `, ${plural(a.vencidos, 'vencido', 'vencidos')} (${fmt(a.totalVencido)})` : ''
    const prox = a.proximo ? `; próximo vencimento ${ddmmaaaa(a.proximo.data)}` : ''
    return `Em aberto: ${fmt(a.total)} em ${plural(a.itens.length, 'ocorrência', 'ocorrências')}${venc}${prox}.`
  }
  const p = comp.dados
  if (!p.itens.length) return null
  const ult = p.itens[0]
  return `Já ${f.tipo === 'receita' ? 'recebido' : 'pago'} nos últimos 12 meses: ${fmt(p.total)} em ${plural(p.itens.length, 'lançamento', 'lançamentos')}; último em ${ddmmaaaa(ult.date)} (${fmt(ult.amount)}).`
}

// ─── Refinamentos (no máximo 4 botões, só os que fazem sentido) ────────────────────────────────
// Cada botão = { id, rotulo, mudanca } — a mudança só troca O filtro escolhido; `datas: true` abre a
// escolha de intervalo.
const PERIODOS_PAGO = ['mes_atual', 'mes_passado', 'ultimos_3_meses', 'este_ano']
export function refinamentos(f) {
  const out = []
  const periodo = (p) => ({ id: `periodo:${p}`, rotulo: ROTULO_PERIODO[p], mudanca: { periodo: p, de: null, ate: null } })
  const datas = { id: 'datas', rotulo: 'Escolher datas', datas: true }
  if (f.status === 'pago') {
    const outros = PERIODOS_PAGO.filter(p => p !== f.periodo)
    out.push(...outros.slice(0, temRelacao(f) ? 2 : 3).map(periodo))
    if (temRelacao(f)) out.push({ id: 'status:em_aberto', rotulo: 'Só em aberto', mudanca: { status: 'em_aberto', periodo: 'pendentes', de: null, ate: null } })
    out.push(datas)
  } else if (f.status === 'em_aberto') {
    out.push({ id: 'status:vencido', rotulo: 'Só vencidos', mudanca: { status: 'vencido' } })
    out.push(f.periodo === 'mes_atual' ? periodo('pendentes') : { ...periodo('mes_atual'), rotulo: 'Só este mês' })
    if (temRelacao(f)) out.push({ id: 'status:pago', rotulo: 'Só pagos', mudanca: { status: 'pago', periodo: 'mes_atual', de: null, ate: null } })
    out.push(datas)
  } else if (f.status === 'vencido') {
    out.push({ id: 'status:em_aberto', rotulo: 'Todos em aberto', mudanca: { status: 'em_aberto', periodo: 'pendentes', de: null, ate: null } })
    if (temRelacao(f)) out.push({ id: 'status:pago', rotulo: 'Só pagos', mudanca: { status: 'pago', periodo: 'mes_atual', de: null, ate: null } })
  } else {
    out.push({ id: 'status:pago', rotulo: 'Só pagos', mudanca: { status: 'pago' } })
    out.push({ id: 'status:em_aberto', rotulo: 'Só em aberto', mudanca: { status: 'em_aberto', periodo: 'pendentes' } })
    out.push(...PERIODOS_PAGO.filter(p => p !== f.periodo).slice(0, 1).map(periodo))
    out.push(datas)
  }
  return out.slice(0, MAX_BOTOES)
}

// Aplica uma mudança (botão ou continuação) mantendo o resto do contexto.
export function aplicarMudanca(f, mudanca) {
  const novo = { ...f, ...mudanca }
  if (mudanca.status === 'vencido') { novo.periodo = 'pendentes'; novo.de = null; novo.ate = null }
  // Pago não tem "pendentes": volta para o mês atual.
  if (novo.status === 'pago' && novo.periodo === 'pendentes') novo.periodo = 'mes_atual'
  if (novo.periodo !== 'intervalo') { novo.de = null; novo.ate = null }
  return novo
}

// ─── Continuação em texto/voz ("e no mês passado?", "e em aberto?", "e do Pedro?") ─────────────
// → mudança (só o que foi citado) | null quando não é continuação (vai para a IA como pedido novo).
const DATA_BR = String.raw`(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?`
const isoDe = (d, m, a, hoje) => {
  const ano = a ? (a.length === 2 ? `20${a}` : a) : hoje.slice(0, 4)
  return `${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
export function continuacaoDoTexto(texto, hoje) {
  const t = normalizarTermo(texto).replace(/[?!.]+$/g, '').trim()
  if (!t || t.split(' ').length > 9) return null
  const m = {}
  const intervalo = t.match(new RegExp(String.raw`\b(?:de|entre)\s+${DATA_BR}\s+(?:a|ate|e)\s+${DATA_BR}`))
  if (intervalo) {
    const de = isoDe(intervalo[1], intervalo[2], intervalo[3], hoje)
    const ate = isoDe(intervalo[4], intervalo[5], intervalo[6], hoje)
    if (de <= ate) Object.assign(m, { periodo: 'intervalo', de, ate })
  }
  if (!m.periodo) {
    if (/\bmes (passado|anterior)\b/.test(t)) m.periodo = 'mes_passado'
    else if (/\b(este|esse|neste|nesse|deste|desse) mes\b|\bmes atual\b/.test(t)) m.periodo = 'mes_atual'
    else if (/\b(ultimos|nos ultimos) (3|tres) meses\b|\b(3|tres) meses\b/.test(t)) m.periodo = 'ultimos_3_meses'
    else if (/\b(este|esse|neste|nesse|deste|desse) ano\b|\bno ano\b/.test(t)) m.periodo = 'este_ano'
    else if (/\b(tudo|todo o historico|desde sempre|historico)\b/.test(t)) m.periodo = 'historico'
    else {
      const mes = t.match(new RegExp(String.raw`\b(?:em|de|no mes de)\s+(${MESES.join('|')})(?:\s+de\s+(\d{4}))?\b`))
      if (mes) {
        const n = MESES.indexOf(mes[1]) + 1
        let ano = Number(mes[2] || hoje.slice(0, 4))
        if (!mes[2] && `${ano}-${String(n).padStart(2, '0')}` > hoje.slice(0, 7)) ano -= 1
        const mm = String(n).padStart(2, '0')
        Object.assign(m, { periodo: 'intervalo', de: `${ano}-${mm}-01`, ate: ultimoDia(ano, n) })
      }
    }
  }
  if (/\b(em aberto|a pagar|a receber|pendentes?|falta)\b/.test(t)) m.status = 'em_aberto'
  else if (/\b(vencid\w*|atrasad\w*)\b/.test(t)) m.status = 'vencido'
  else if (/\b(pagos?|pagas?|paguei|ja pago|recebidos?)\b/.test(t)) m.status = 'pago'
  // Troca de alvo: "e do Pedro?", "e com a Maria?", "e pro Pedro?" — só sem outro filtro citado.
  if (!Object.keys(m).length) {
    const alvo = t.match(/^e\s+(?:d[oa]s?|com\s+[oa]|com|pr[oa]s?|para\s+[oa]|ao|a)\s+(.+)$/)
    if (alvo && palavras(alvo[1]).length) m.favorecido = alvo[1]
  }
  if (!Object.keys(m).length) return null
  // Só é continuação se começa com "e"/"agora"/"só" ou é curto (≤ 5 palavras): senão é pedido novo.
  if (!/^(e|agora|so|somente|apenas|mas|entao)\b/.test(t) && t.split(' ').length > 5) return null
  return m
}
