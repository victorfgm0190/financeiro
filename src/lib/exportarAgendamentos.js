// Exportação da lista de Agendamentos (layout no utilitário central lib/exportExcel). Recebe as
// linhas JÁ filtradas pela tela (buildScheduleGroups sobre a lista visível, as linhas da aba Pagos e
// as faturas da aba Cartão) e devolve exatamente o que está na tela, na mesma ordem. O filtro de
// tipo (lib/agendamentosTipo) define título, nome do arquivo, colunas e resumo.
import { occEfetiva } from './fluxoCaixa.js'
import { occCampos } from './camposSerie.js'
import { tipoDoItem, itemEhPagamentoCartao, TITULO_RELATORIO_TIPO, ARQUIVO_TIPO } from './agendamentosTipo.js'
import { ROTULO_PAGAMENTO_CARTAO } from './rotuloMovimento.js'
import { categoriaParaExportar } from './rateio.js'

const nomeConta = (accounts, id) => {
  const a = (accounts || []).find(x => x.id === id)
  return a ? (a.apelido || a.name) : ''
}
const nomeCategoria = (categories, id) => (categories || []).find(c => c.id === id)?.name || ''
const ROTULO_TIPO = { entradas: 'Entrada', saidas: 'Saída', transferencias: 'Transferência' }

// Status no vocabulário do relatório: entrada Recebido/A receber, saída Pago/A pagar, Vencido.
const statusDe = (tipo, situacao) => {
  if (situacao === 'vencido') return 'Vencido'
  if (situacao === 'feito') return tipo === 'entradas' ? 'Recebido' : tipo === 'saidas' ? 'Pago' : 'Realizado'
  return tipo === 'entradas' ? 'A receber' : tipo === 'saidas' ? 'A pagar' : 'Pendente'
}

// Mesma ordem da tabela: com data (em atraso → 7 dias → 30 dias → futuros, todos por data) e depois
// os concluídos (início mais recente primeiro).
export function ordenarComoTabela(rows) {
  const comData = rows.filter(r => r.displayDate).sort((a, b) => a.displayDate.localeCompare(b.displayDate))
  const concluidos = rows.filter(r => !r.nextDate).sort((a, b) => (b.schedule.startDate || '').localeCompare(a.schedule.startDate || ''))
  return [...comData, ...concluidos]
}

// Linhas da lista (A pagar / Provisões / Resgates): uma por linha da tabela (próxima ocorrência).
export function linhasDosAgendamentos(rows, { accounts, categories, hoje, rateios = null }) {
  return ordenarComoTabela(rows).map(r => {
    const s = r.schedule
    const occ = r.nextDate ? occCampos(s, r.nextDate) : s
    const tipo = tipoDoItem(s)
    const conta = s.transactionType === 'transfer'
      ? `${nomeConta(accounts, s.accountId) || '?'} → ${nomeConta(accounts, s.toAccountId) || '?'}`
      : nomeConta(accounts, occ.accountId || s.accountId)
    const vencimento = r.nextDate
      ? r.displayDate
      : ((s.registered || []).length ? s.registered[s.registered.length - 1] : s.startDate)
    const situacao = !r.nextDate ? 'feito' : (r.displayDate && r.displayDate < hoje) ? 'vencido' : 'pendente'
    return {
      vencimento: vencimento || null,
      favorecido: s.payee || '',
      descricao: occ.description || s.description || '',
      categoria: rateios?.get(s.id)?.length
        ? categoriaParaExportar({ type: s.transactionType, amount: r.nextDate ? occEfetiva(s, r.nextDate).amount : s.amount, categoryId: occ.categoryId }, rateios.get(s.id), categories)
        : nomeCategoria(categories, occ.categoryId),
      valor: Number(r.nextDate ? occEfetiva(s, r.nextDate).amount : s.amount) || 0,
      conta,
      status: statusDe(tipo, situacao),
      tipo: itemEhPagamentoCartao(s, accounts) ? ROTULO_PAGAMENTO_CARTAO : ROTULO_TIPO[tipo],
    }
  })
}

// Linhas da aba Pagos (já filtradas e na ordem da tela).
export function linhasDosPagos(linhas, { accounts, categories, rateios = null }) {
  return (linhas || []).map(l => {
    const tipo = tipoDoItem(l)
    return {
      vencimento: l.vencimento || l.dataPagamento || null,
      favorecido: l.payee || '',
      descricao: l.description || '',
      categoria: l.txId && rateios?.get(l.txId)?.length
        ? categoriaParaExportar({ type: l.transactionType, amount: l.amount, categoryId: l.categoryId }, rateios.get(l.txId), categories)
        : nomeCategoria(categories, l.categoryId),
      valor: Number(l.amount) || 0,
      conta: nomeConta(accounts, l.accountId),
      status: statusDe(tipo, 'feito'),
      tipo: itemEhPagamentoCartao(l, accounts) ? ROTULO_PAGAMENTO_CARTAO : ROTULO_TIPO[tipo],
    }
  })
}

// Faturas do contas a pagar (aba Cartão), pelo vencimento — sempre saída.
export function linhasDasFaturas(payables, { accounts, hoje }) {
  return [...(payables || [])].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).map(p => ({
    vencimento: p.dueDate || null,
    favorecido: '',
    descricao: p.description || '',
    categoria: '',
    valor: Number(p.amount) || 0,
    conta: nomeConta(accounts, p.cartaoId),
    status: statusDe('saidas', p.status === 'paid' ? 'feito' : (p.dueDate && p.dueDate < hoje ? 'vencido' : 'pendente')),
    tipo: 'Saída',
  }))
}

const corDoValor = (l) => (l.tipo === 'Entrada' ? 'receita' : l.tipo === 'Saída' ? 'despesa' : null)

// Colunas conforme o tipo: Tipo (selo) só em "Todos".
export function colunasAgendamentos(tipo) {
  return [
    { chave: 'vencimento', titulo: 'Vencimento', tipo: 'data' },
    { chave: 'favorecido', titulo: 'Cliente/Favorecido' },
    { chave: 'descricao', titulo: 'Descrição' },
    { chave: 'categoria', titulo: 'Categoria' },
    ...(tipo === 'todos' ? [{ chave: 'tipo', titulo: 'Tipo', tipo: 'selo', selo: (v) => (v === 'Entrada' ? 'verde' : v === 'Saída' ? 'vermelho' : 'cinza') }] : []),
    { chave: 'valor', titulo: 'Valor (R$)', tipo: 'moeda', cor: corDoValor },
    { chave: 'conta', titulo: 'Conta' },
    { chave: 'status', titulo: 'Status', tipo: 'status' },
  ]
}

const st = (valor) => [{ coluna: 'status', valor }]
export function resumoAgendamentos(tipo) {
  if (tipo === 'entradas') {
    return [
      { rotulo: 'Total previsto', soma: 'valor' },
      { rotulo: 'Recebido', soma: 'valor', onde: st('Recebido'), cor: 'verde' },
      { rotulo: 'A receber', soma: 'valor', onde: st('A receber'), cor: 'ambar' },
      { rotulo: 'Vencido', soma: 'valor', onde: st('Vencido'), cor: 'vermelho' },
    ]
  }
  if (tipo === 'saidas') {
    return [
      { rotulo: 'Total previsto', soma: 'valor' },
      { rotulo: 'Pago', soma: 'valor', onde: st('Pago'), cor: 'verde' },
      { rotulo: 'A pagar', soma: 'valor', onde: st('A pagar'), cor: 'ambar' },
      { rotulo: 'Vencido', soma: 'valor', onde: st('Vencido'), cor: 'vermelho' },
    ]
  }
  if (tipo === 'transferencias') {
    return [
      { rotulo: 'Total previsto', soma: 'valor' },
      { rotulo: 'Realizado', soma: 'valor', onde: st('Realizado'), cor: 'verde' },
      { rotulo: 'Pendente', soma: 'valor', onde: st('Pendente'), cor: 'ambar' },
      { rotulo: 'Vencido', soma: 'valor', onde: st('Vencido'), cor: 'vermelho' },
    ]
  }
  // Todos: transferências entram na lista, mas não no saldo.
  const entrada = [{ coluna: 'tipo', valor: 'Entrada' }]
  const saida = [{ coluna: 'tipo', valor: 'Saída' }]
  return [
    { rotulo: 'Total a receber', soma: 'valor', onde: entrada, cor: 'verde' },
    { rotulo: 'Total a pagar', soma: 'valor', onde: saida, cor: 'vermelho' },
    { rotulo: 'Saldo previsto', partes: [{ sinal: 1, soma: 'valor', onde: entrada }, { sinal: -1, soma: 'valor', onde: saida }] },
  ]
}

// Período para o nome do arquivo: mês "AAAA-MM", intervalo "AAAAMMDD-AAAAMMDD" ou o nome do período.
const compacta = (d) => String(d || '').replace(/-/g, '')
export function periodoDoArquivo(periodo, { de = '', ate = '', hoje }) {
  if (periodo === 'custom' && (de || ate)) return `${compacta(de) || 'inicio'}-${compacta(ate) || 'fim'}`
  if (periodo === 'mes') return hoje.slice(0, 7)
  if (periodo === 'next30') return `${compacta(hoje)}-30dias`
  if (periodo === 'ult30') return `30dias-${compacta(hoje)}`
  if (periodo === 'futuros') return `a-partir-de-${compacta(hoje)}`
  return 'tudo'
}

// Spec para exportarExcel.
export function specAgendamentos(linhas, { tipo = 'todos', filtros = [], periodo = 'tudo' } = {}) {
  return {
    titulo: TITULO_RELATORIO_TIPO[tipo] || TITULO_RELATORIO_TIPO.todos,
    nome: 'Agendamentos',
    filtros,
    resumo: resumoAgendamentos(tipo),
    colunas: colunasAgendamentos(tipo),
    linhas,
    totais: { somar: ['valor'] },
    nomeArquivo: { relatorio: `Agendamentos_${ARQUIVO_TIPO[tipo] || ARQUIVO_TIPO.todos}`, periodo },
  }
}
