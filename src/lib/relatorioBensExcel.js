// Relatório "Bens e investimentos — saídas por mês" em Excel (layout em lib/exportExcel).
const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '')
const rotuloMes = (mes) => { const [a, m] = mes.split('-'); return `${m}/${a}` }

export function specRelatorioBens(linhas, { de, ate, filtros = [], totais }) {
  return {
    titulo: 'Bens e investimentos — saídas por mês', nome: 'Bens e investimentos',
    filtros: [`Período: ${fmtData(de)} a ${fmtData(ate)}`, ...filtros],
    resumo: [
      { rotulo: 'Saiu de caixa', valor: totais.total, cor: 'vermelho' },
      { rotulo: 'Pago por terceiros', valor: totais.terceiros },
      { rotulo: 'Devoluções', valor: totais.devolucoes, cor: 'verde' },
    ],
    colunas: [
      { chave: 'bem', titulo: 'Bem' }, { chave: 'mes', titulo: 'Mês' },
      { chave: 'principal', titulo: 'Principal (R$)', tipo: 'moeda' },
      { chave: 'juros', titulo: 'Juros (R$)', tipo: 'moeda' },
      { chave: 'total', titulo: 'Total de saídas (R$)', tipo: 'moeda', cor: () => 'despesa' },
      { chave: 'terceiros', titulo: 'Pago por terceiros (R$)', tipo: 'moeda' },
      { chave: 'devolucoes', titulo: 'Devoluções (R$)', tipo: 'moeda', cor: () => 'receita' },
    ],
    linhas: linhas.map(l => ({ ...l, mes: rotuloMes(l.mes) })),
    totais: {
      rotulo: (n) => `${n} ${n === 1 ? 'linha' : 'linhas'}`,
      somar: ['principal', 'juros', 'total', 'terceiros', 'devolucoes'],
    },
    nomeArquivo: { relatorio: 'BensInvestimentos', periodo: `${de}_${ate}` },
  }
}
