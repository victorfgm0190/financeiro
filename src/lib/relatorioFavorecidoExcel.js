import { categoriaParaExportar } from './rateio.js'

// Relatório por Favorecido em Excel (layout em lib/exportExcel). Por favorecido: linha de grupo
// (fora das somas), os lançamentos e o subtotal por fórmula; TOTAL e cartões por fórmula sobre o
// detalhe — os subtotais nunca entram em dobro.
const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

// grupos: [{ payee, pago, recebido, txs }] já filtrados e na ordem da tela.
export function specRelatorioFavorecido(grupos, { accounts = [], categories = [], from, to, filtros = [], rateios = null }) {
  const nomeConta = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '' }
  const nomeCat = (id) => categories.find(c => c.id === id)?.name || ''
  const linhas = []
  for (const g of grupos) {
    linhas.push({ favorecido: g.payee, _estilo: 'grupo' })
    for (const tx of [...g.txs].sort((a, b) => b.date.localeCompare(a.date))) {
      linhas.push({
        favorecido: g.payee, data: tx.date, descricao: tx.description || '', conta: nomeConta(tx.accountId),
        categoria: rateios?.get(tx.id)?.length ? categoriaParaExportar(tx, rateios.get(tx.id), categories) : nomeCat(tx.categoryId), tipo: tx.type === 'income' ? 'Receita' : 'Despesa',
        pago: tx.type === 'expense' ? tx.amount : null, recebido: tx.type === 'income' ? tx.amount : null,
      })
    }
    linhas.push({ favorecido: `Subtotal ${g.payee}`, _estilo: 'subtotal', _subtotal: true })
  }
  const maior = grupos.reduce((m, g) => (!m || g.pago + g.recebido > m.pago + m.recebido ? g : m), null)
  return {
    titulo: 'Movimentação por Favorecido', nome: 'Por Favorecido',
    filtros: [`Período: ${fmtData(from)} a ${fmtData(to)}`, ...filtros],
    resumo: [
      { rotulo: 'Total geral', partes: [{ sinal: 1, soma: 'pago' }, { sinal: 1, soma: 'recebido' }] },
      { rotulo: 'Quantidade de favorecidos', valor: grupos.length, numero: true },
      { rotulo: maior ? `Maior favorecido: ${maior.payee}` : 'Maior favorecido', valor: maior ? Math.round((maior.pago + maior.recebido) * 100) / 100 : 0 },
    ],
    colunas: [
      { chave: 'favorecido', titulo: 'Favorecido' }, { chave: 'data', titulo: 'Data', tipo: 'data' },
      { chave: 'descricao', titulo: 'Descrição' }, { chave: 'conta', titulo: 'Conta' }, { chave: 'categoria', titulo: 'Categoria' },
      { chave: 'tipo', titulo: 'Tipo', tipo: 'selo', selo: (v) => (v === 'Receita' ? 'verde' : 'vermelho') },
      { chave: 'pago', titulo: 'Pago (R$)', tipo: 'moeda', cor: () => 'despesa' },
      { chave: 'recebido', titulo: 'Recebido (R$)', tipo: 'moeda', cor: () => 'receita' },
    ],
    linhas,
    totais: { rotulo: (n) => `${n} ${n === 1 ? 'lançamento' : 'lançamentos'}`, somar: ['pago', 'recebido'] },
    nomeArquivo: { relatorio: 'Movimentacao-por-Favorecido', periodo: `${from}_${to}` },
  }
}
