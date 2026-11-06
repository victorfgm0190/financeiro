import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { isResgateReservaSombra } from '../shared/utils'
import { criarClassificadores } from '../../lib/receitasDespesas'
import { periodoDoFiltro } from '../../lib/despesasPorCategoria'
import { useModoDespesas } from '../../hooks/useDespesasPorCategoria'
import { buildScheduleGroups } from '../../lib/agendamentosGrupos'
import { ocorrenciasPendentes } from '../../lib/agendaCalendario'
import {
  intervaloDoPeriodo, resolverNome, casaComFiltro, temRelacao, pagosDoFiltro, abertosDoFiltro,
} from '../../lib/assistente/consultaMovimentos'

// Dados e cálculos da consulta propositiva (ConsultaMovimentos.jsx): os do PERFIL ATIVO, com as
// funções das telas. Separado do componente para o teste chamar direto.
export const somaDias = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// Dados do perfil + cálculos (as mesmas funções das telas). Exportado para o teste comparar.
export function useDadosConsulta() {
  const {
    profileReportTransactions, profileSchedules, getNextOccurrences, profileAccounts, accounts, categories, payees,
    reserveFunctions, getFinancialPeriod,
  } = useApp()
  const [modo] = useModoDespesas()
  const cls = useMemo(() => ({ ...criarClassificadores(reserveFunctions, profileAccounts, profileReportTransactions), isResgateReservaSombra }), [reserveFunctions, profileAccounts, profileReportTransactions])
  const rows = useMemo(() => buildScheduleGroups(profileSchedules || [], getNextOccurrences), [profileSchedules, getNextOccurrences])
  const nomesFavorecidos = useMemo(() => [...new Set([
    ...(payees || []), ...(profileSchedules || []).map(s => s.payee), ...(profileReportTransactions || []).map(t => t.payee),
  ].filter(Boolean))], [payees, profileSchedules, profileReportTransactions])
  // Um objeto estável (memo): os cálculos e o contexto só mudam quando os dados mudam.
  return useMemo(() => ({
    transactions: profileReportTransactions || [], schedules: profileSchedules || [], rows, getNextOccurrences,
    accounts: accounts || [], categories: categories || [], nomesFavorecidos, cls, modo,
    mesPainel: getFinancialPeriod ? (f) => periodoDoFiltro(f, getFinancialPeriod) : null,
  }), [profileReportTransactions, profileSchedules, rows, getNextOccurrences, accounts, categories, nomesFavorecidos, cls, modo, getFinancialPeriod])
}

// Filtro → { periodo, pagos, abertos, complemento } com os dados das telas.
export function calcularConsulta(f, d, hoje) {
  const periodo = intervaloDoPeriodo(f.periodo, { hoje, de: f.de, ate: f.ate, mesPainel: d.mesPainel })
  const pendentes = (ini, fim) => ocorrenciasPendentes(d.rows, d.getNextOccurrences, { ini, fim, hoje, accounts: d.accounts })
  const pagosDe = (p) => pagosDoFiltro(d.transactions, f, p, d.cls, { hoje, modo: d.modo })
  const abertosDe = (p, soVencidos) => abertosDoFiltro(pendentes(p.ini, soVencidos ? somaDias(hoje, -1) : p.fim), f, { hoje, soVencidos })
  const out = { periodo, pagos: null, abertos: null, complemento: null }
  if (f.status === 'pago' || f.status === 'todos') out.pagos = pagosDe(periodo)
  if (f.status !== 'pago') out.abertos = abertosDe(f.status === 'vencido' ? { ini: '0000-01-01' } : periodo, f.status === 'vencido')
  if (temRelacao(f) && f.status !== 'todos') {
    out.complemento = f.status === 'pago'
      ? { tipo: 'abertos', dados: abertosDe(intervaloDoPeriodo('pendentes', { hoje }), false) }
      : { tipo: 'pagos', dados: pagosDe({ ini: somaDias(hoje, -365), fim: hoje }) }
  }
  return out
}

// Resolve favorecido/categoria do filtro. → { f (resolvido) } | { pergunta: { texto, opcoes, campo } }
// | { naoAchou: termo }. Nunca escolhe sozinho entre vários.
export function resolverFiltro(f, d) {
  const nomeCat = (c) => c.name
  let novo = { ...f }
  if (novo.categoriaTermo && !novo.categoriaId) {
    const r = resolverNome(novo.categoriaTermo, d.categories.map(nomeCat))
    const porNome = (n) => d.categories.find(c => c.name === n)?.id
    if (r.valor) novo = { ...novo, categoriaId: porNome(r.valor), categoriaTermo: null, assunto: novo.favorecido ? novo.assunto : 'categoria' }
    else if (r.opcoes.length || r.sugestoes.length) {
      return { pergunta: { campo: 'categoria', texto: `Qual categoria${r.sugestoes.length ? ` você quis dizer com “${novo.categoriaTermo}”` : ''}?`, opcoes: (r.opcoes.length ? r.opcoes : r.sugestoes).map(n => ({ rotulo: n, mudanca: { categoriaId: porNome(n), categoriaTermo: null } })) } }
    } else return { naoAchou: novo.categoriaTermo, campo: 'categoria' }
  }
  if (novo.favorecido) {
    const r = resolverNome(novo.favorecido, d.nomesFavorecidos)
    if (r.valor) return { f: { ...novo, favorecido: r.valor } }
    if (r.opcoes.length) {
      return { pergunta: { campo: 'favorecido', texto: `Achei ${r.opcoes.length} favorecidos com “${novo.favorecido}”. Qual deles?`, opcoes: r.opcoes.map(n => ({ rotulo: n, mudanca: { favorecido: n } })) } }
    }
    // Não é favorecido: pode ser uma categoria ("quanto paguei de luz") ou uma descrição ("da academia").
    const cat = resolverNome(novo.favorecido, d.categories.map(nomeCat))
    if (cat.valor) return { f: { ...novo, categoriaId: d.categories.find(c => c.name === cat.valor)?.id, favorecido: null, assunto: 'categoria' } }
    const comoDescricao = { ...novo, descricao: novo.favorecido, favorecido: null }
    const temDescricao = d.transactions.some(t => casaComFiltro(t, { descricao: comoDescricao.descricao })) || d.schedules.some(s => casaComFiltro(s, { descricao: comoDescricao.descricao }))
    if (temDescricao) return { f: { ...comoDescricao, assunto: 'lancamento' } }
    if (r.sugestoes.length) {
      return { pergunta: { campo: 'favorecido', texto: `Não achei “${novo.favorecido}”. Você quis dizer:`, opcoes: r.sugestoes.map(n => ({ rotulo: n, mudanca: { favorecido: n } })) } }
    }
    return { naoAchou: novo.favorecido, campo: 'favorecido' }
  }
  return { f: novo }
}

