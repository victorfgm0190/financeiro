// Parsers → registros (src/lib/importers/registro.js) e registros → a linha que cada tela consome.
//
// Itaú e Dindin seguem a interface SEM mudar o comportamento: o registro guarda em `raw` a linha
// do parser de sempre, e a tela continua usando essa linha (paraLinhaCartao só é usado pelas
// origens novas — OFX e planilha genérica —, que não tinham linha própria).

import { registro } from './registro.js'
import { lerOfx, pareceOfx } from '../importacaoPadrao/ofx.js'

export { pareceOfx }

// Linhas do parser do Itaú (CSV/XLS) ou do Dindin (cartão) → registros.
export function deLinhasDoCartao(linhas) {
  return (linhas || []).map(l => registro({
    date: l.date, description: l.description, payee: l.payee, amount: l.amount, type: l.type, raw: l,
  }))
}

// Linhas do Dindin conta corrente → registros (as contas de origem/destino ficam em raw).
export function deLinhasDaConta(linhas) {
  return (linhas || []).filter(l => l.type !== 'transfer').map(l => registro({
    date: l.date, description: l.description, amount: l.amount, type: l.type, raw: l,
  }))
}

// Cartão: no OFX as compras vêm negativas; os créditos positivos são estornos — menos o
// pagamento da fatura anterior, que não é lançamento desta fatura (mesma regra do Itaú/Dindin).
const PAGAMENTO_DA_FATURA = /pagamento\s+(efetuado|recebido)|pgto\s*fatura|pagamento\s+de\s+fatura|^pagamento$/i

// Texto OFX → { banco, conta, registros, erros }. tipo 'cartao' | 'conta'.
export function deOfx(texto, { tipo = 'conta' } = {}) {
  const { banco, conta, linhas, erros } = lerOfx(texto)
  const registros = []
  for (const l of linhas) {
    if (l.erros.length) continue
    if (tipo === 'cartao' && l.valor > 0 && PAGAMENTO_DA_FATURA.test(l.descricao)) continue
    registros.push(registro({
      date: l.data, description: l.descricao, amount: l.valor,
      type: l.valor < 0 ? 'expense' : 'income',
      raw: { fitid: l.fitid, linha: l.linha },
    }))
  }
  return { banco, conta, registros, erros }
}

const estornoCatOf = (categories) => (categories || []).find(c => (c.name || '').toLowerCase().includes('estorno'))?.id || ''

// Registros → linha da revisão do Importar Fatura (cartão). Mesmo shape do parser do Itaú:
// crédito = estorno (receita), pré-classificado na categoria "estorno" quando existir.
export function paraLinhaCartao(registros, categories = []) {
  const estornoCategoryId = estornoCatOf(categories)
  return (registros || []).map((r, i) => {
    const estorno = r.type === 'income'
    return {
      _id: i, date: r.date, description: r.description, movimentacao: '', amount: r.amount,
      isDeposit: estorno, type: estorno ? 'income' : 'expense',
      selected: true, _isDuplicate: false,
      categoryId: estorno ? estornoCategoryId : '', payee: r.payee || '', grupoGerencial: '',
      fitid: r.raw?.fitid || null,
    }
  })
}

// Registros → linha da aba Conta Corrente (shape do parseDindinCC). Todas as linhas são da mesma
// conta do arquivo (`nomeConta`): a tela pede para mapeá-la a uma conta do Finup.
export function paraLinhaConta(registros, nomeConta) {
  return (registros || []).map((r, i) => ({
    _id: i, date: r.date, description: r.description, amount: r.amount, type: r.type,
    fromAccount: r.type === 'expense' ? nomeConta : '', toAccount: r.type === 'income' ? nomeConta : '',
    selected: true, _isDuplicate: false, fitid: r.raw?.fitid || null,
  }))
}
