// Relatório de rendimentos de aluguel em Excel (layout padrão em lib/exportExcel): uma aba "Resumo"
// (um contrato por linha, com a conferência do informe) e uma aba por contrato (mês a mês, total e
// deduções por tipo).
import { COLUNAS_DEDUTIVEIS, TIPOS_DEDUCAO, REFERENCIAS_RENDIMENTO, AVISO_CONTADOR } from './rendimentos.js'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const rotuloRef = (ref) => REFERENCIAS_RENDIMENTO.find(r => r.value === ref)?.label || ref

const COLS_MES = [
  { chave: 'mes', titulo: 'Mês' },
  { chave: 'bruto', titulo: 'Aluguel bruto', tipo: 'moeda', cor: () => 'receita' },
  ...COLUNAS_DEDUTIVEIS.map(c => ({ chave: `d_${c.chave}`, titulo: `Ded. ${c.titulo}`, tipo: 'moeda' })),
  { chave: 'totalDedutiveis', titulo: 'Total dedutível', tipo: 'moeda' },
  { chave: 'base', titulo: 'Base tributável', tipo: 'moeda' },
  { chave: 'naoDedutiveis', titulo: 'Não dedutíveis', tipo: 'moeda' },
  { chave: 'repasse', titulo: 'Repasse recebido', tipo: 'moeda', cor: () => 'receita' },
  { chave: 'saldoFim', titulo: 'Saldo adm. fim do mês', tipo: 'moeda', cor: (l) => (l.saldoFim < 0 ? 'despesa' : null) },
  { chave: 'obs', titulo: 'Obs.' },
]

const linhaMes = (m, mes) => ({
  mes, bruto: m.bruto, ...Object.fromEntries(COLUNAS_DEDUTIVEIS.map(c => [`d_${c.chave}`, m.dedutiveis[c.chave]])),
  totalDedutiveis: m.totalDedutiveis, base: m.base, naoDedutiveis: m.naoDedutiveis, repasse: m.repasse, saldoFim: m.saldoFim,
  obs: m.repassePrevisto > 0.004 ? `Repasse previsto (sem registro): ${brl(m.repassePrevisto)}` : '',
})

function textoConferencia(conf) {
  if (!conf) return null
  const p = (rot, x) => (x.informado == null ? `${rot}: não informado` : `${rot}: informado ${brl(x.informado)}, calculado ${brl(x.calculado)}, diferença ${brl(x.diferenca)}`)
  return `Informe da administradora — ${p('rendimentos', conf.rendimentos)}; ${p('deduções dedutíveis', conf.deducoes)}`
}

function abaDoContrato(item, { ano, referencia }) {
  const { rotulo, rel, conferencia } = item
  const linhas = rel.meses.map(m => linhaMes(m, rotuloMes(m.mes)))
  linhas.push({ ...linhaMes(rel.totais, `TOTAL ${ano}`), obs: '', _estilo: 'total' })
  const tipos = Object.entries(rel.porTipo || {}).filter(([, v]) => v.dedutivel || v.naoDedutivel)
  if (tipos.length) {
    linhas.push({ mes: 'Deduções por tipo', _estilo: 'grupo' })
    for (const [k, v] of tipos) linhas.push({ mes: TIPOS_DEDUCAO[k] || k, totalDedutiveis: v.dedutivel, naoDedutiveis: v.naoDedutivel, _estilo: 'subtotal' })
  }
  return {
    nome: rotulo, titulo: `Aluguéis — Rendimentos e Repasses ${ano} — ${rotulo}`,
    filtros: [`Ano: ${ano}`, `Mês de referência: ${rotuloRef(referencia)}`, 'Repasse recebido: mês em que caiu na conta',
      ...(rel.saldoInicioAno != null ? [`Saldo com a administradora no início do ano: ${brl(rel.saldoInicioAno)}`] : []),
      textoConferencia(conferencia), AVISO_CONTADOR].filter(Boolean),
    resumo: [
      { rotulo: 'Aluguel bruto', valor: rel.totais.bruto, cor: 'verde' },
      { rotulo: 'Deduções dedutíveis', valor: rel.totais.totalDedutiveis },
      { rotulo: 'Base tributável', valor: rel.totais.base },
      { rotulo: 'Repasses recebidos', valor: rel.totais.repasse, cor: 'verde' },
    ],
    colunas: COLS_MES,
    linhas,
    totais: false,
  }
}

//   itens: [{ rotulo, rel, conferencia }] (um por contrato); total: somarRelatorios (ou o único).
export function specRendimentos(itens, { ano, referencia, total, perfil = '' }) {
  const resumo = {
    nome: 'Resumo', titulo: `Aluguéis — Rendimentos e Repasses ${ano} — resumo`,
    filtros: [`Ano: ${ano}`, `Mês de referência: ${rotuloRef(referencia)}`, perfil ? `Perfil: ${perfil}` : null, AVISO_CONTADOR].filter(Boolean),
    resumo: [
      { rotulo: 'Aluguel bruto', valor: total.totais.bruto, cor: 'verde' },
      { rotulo: 'Deduções dedutíveis', valor: total.totais.totalDedutiveis },
      { rotulo: 'Base tributável', valor: total.totais.base },
      { rotulo: 'Repasses recebidos', valor: total.totais.repasse, cor: 'verde' },
    ],
    colunas: [
      { chave: 'contrato', titulo: 'Contrato' },
      { chave: 'bruto', titulo: 'Aluguel bruto', tipo: 'moeda', cor: () => 'receita' },
      { chave: 'totalDedutiveis', titulo: 'Deduções dedutíveis', tipo: 'moeda' },
      { chave: 'base', titulo: 'Base tributável', tipo: 'moeda' },
      { chave: 'naoDedutiveis', titulo: 'Não dedutíveis', tipo: 'moeda' },
      { chave: 'repasse', titulo: 'Repasses recebidos', tipo: 'moeda', cor: () => 'receita' },
      { chave: 'saldoFim', titulo: 'Saldo adm. no fim do ano', tipo: 'moeda' },
      { chave: 'infRend', titulo: 'Informe: rendimentos', tipo: 'moeda' },
      { chave: 'difRend', titulo: 'Diferença rendimentos', tipo: 'moeda', cor: (l) => (Math.abs(l.difRend || 0) > 0.004 ? 'despesa' : null) },
      { chave: 'infDed', titulo: 'Informe: deduções', tipo: 'moeda' },
      { chave: 'difDed', titulo: 'Diferença deduções', tipo: 'moeda', cor: (l) => (Math.abs(l.difDed || 0) > 0.004 ? 'despesa' : null) },
    ],
    linhas: itens.map(({ rotulo, rel, conferencia }) => ({
      contrato: rotulo, bruto: rel.totais.bruto, totalDedutiveis: rel.totais.totalDedutiveis, base: rel.totais.base,
      naoDedutiveis: rel.totais.naoDedutiveis, repasse: rel.totais.repasse, saldoFim: rel.totais.saldoFim,
      infRend: conferencia?.rendimentos.informado, difRend: conferencia?.rendimentos.diferenca,
      infDed: conferencia?.deducoes.informado, difDed: conferencia?.deducoes.diferenca,
    })),
    totais: {
      rotulo: (n) => `${n} ${n === 1 ? 'contrato' : 'contratos'}`,
      somar: ['bruto', 'totalDedutiveis', 'base', 'naoDedutiveis', 'repasse'],
    },
  }
  return {
    titulo: `Aluguéis — Rendimentos e Repasses ${ano}`,
    abas: [resumo, ...itens.map(i => abaDoContrato(i, { ano, referencia }))],
    nomeArquivo: { relatorio: 'Alugueis-Rendimentos-e-Repasses', periodo: String(ano) },
  }
}
