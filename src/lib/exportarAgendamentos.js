// Exportação da lista de Agendamentos para Excel (SheetJS, mesmo padrão das Reservas). Recebe as
// linhas JÁ filtradas pela tela (buildScheduleGroups sobre a lista visível, as linhas da aba Pagos e
// as faturas da aba Cartão) e devolve exatamente o que está na tela, na mesma ordem.
import * as XLSX from 'xlsx'
import { occEfetiva } from './fluxoCaixa.js'
import { occCampos } from './camposSerie.js'
import { rotuloParcela } from './numeroParcela.js'
import { resolverTipoDocumento } from './tiposDocumento.js'

const nomeConta = (accounts, id) => {
  const a = (accounts || []).find(x => x.id === id)
  return a ? (a.apelido || a.name) : ''
}
const nomeCategoria = (categories, id) => (categories || []).find(c => c.id === id)?.name || ''
const nomeGrupo = (grupos, id) => {
  const g = (grupos || []).find(x => x.id === id)
  if (!g) return ''
  return g.alias ? `${g.alias} - ${g.name}` : (g.name || '')
}

// Mesma ordem da tabela: com data (em atraso → 7 dias → 30 dias → futuros, todos por data) e depois
// os concluídos (início mais recente primeiro).
export function ordenarComoTabela(rows) {
  const comData = rows.filter(r => r.displayDate).sort((a, b) => a.displayDate.localeCompare(b.displayDate))
  const concluidos = rows.filter(r => !r.nextDate).sort((a, b) => (b.schedule.startDate || '').localeCompare(a.schedule.startDate || ''))
  return [...comData, ...concluidos]
}

// Linhas da lista (A pagar / Provisões / Resgates): uma por linha da tabela (próxima ocorrência).
export function linhasDosAgendamentos(rows, { accounts, categories, gerencialGroups, tiposDocumento, hoje }) {
  return ordenarComoTabela(rows).map(r => {
    const s = r.schedule
    const occ = r.nextDate ? occCampos(s, r.nextDate) : s
    const valor = Number(r.nextDate ? occEfetiva(s, r.nextDate).amount : s.amount) || 0
    const conta = s.transactionType === 'transfer'
      ? `${nomeConta(accounts, s.accountId) || '?'} → ${nomeConta(accounts, s.toAccountId) || '?'}`
      : nomeConta(accounts, occ.accountId || s.accountId)
    const isInstallment = s.occurrenceType === 'installment'
    const nFeitas = (s.registered || []).length + (s.skipped || []).length
    const parcela = isInstallment
      ? (r.nextDate ? rotuloParcela(s, r.nextDate) : (s.frequency || 'once') !== 'once' ? `${nFeitas}/${s.installments}` : null)
      : null
    const vencimento = r.nextDate
      ? r.displayDate
      : ((s.registered || []).length ? s.registered[s.registered.length - 1] : s.startDate)
    const status = !r.nextDate ? 'Concluído'
      : (r.displayDate && r.displayDate < hoje) ? 'Em atraso'
        : s.isProvisao && !s.provisaoEfetivada ? 'Provisão'
          : 'A pagar'
    return {
      vencimento: vencimento || null,
      descricao: occ.description || s.description || '',
      favorecido: s.payee || '',
      conta,
      categoria: nomeCategoria(categories, occ.categoryId),
      centroCusto: occ.costCenter || '',
      grupoGerencial: nomeGrupo(gerencialGroups, occ.grupoGerencial),
      tipoDocumento: resolverTipoDocumento(s, tiposDocumento)?.sigla || '',
      parcela: parcela || '',
      valor,
      status,
    }
  })
}

// Linhas da aba Pagos (já filtradas e na ordem da tela).
export function linhasDosPagos(linhas, { accounts, categories, gerencialGroups, tiposDocumento }) {
  return (linhas || []).map(l => ({
    vencimento: l.vencimento || l.dataPagamento || null,
    descricao: l.description || '',
    favorecido: l.payee || '',
    conta: nomeConta(accounts, l.accountId),
    categoria: nomeCategoria(categories, l.categoryId),
    centroCusto: l.schedule?.costCenter || '',
    grupoGerencial: nomeGrupo(gerencialGroups, l.schedule?.grupoGerencial),
    tipoDocumento: resolverTipoDocumento(l, tiposDocumento)?.sigla || '',
    parcela: l.avulso ? 'avulso' : l.parcela ? (l.total ? `${l.parcela}/${l.total}` : `${l.parcela}`) : '',
    valor: Number(l.amount) || 0,
    status: l.semLancamento ? 'Baixado sem lançamento' : `Pago${l.dataPagamento ? ` em ${l.dataPagamento.split('-').reverse().join('/')}` : ''}`,
  }))
}

// Faturas do contas a pagar (aba Cartão), pelo vencimento.
export function linhasDasFaturas(payables, { accounts, gerencialGroups }) {
  return [...(payables || [])].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).map(p => ({
    vencimento: p.dueDate || null,
    descricao: p.description || '',
    favorecido: '',
    conta: nomeConta(accounts, p.cartaoId),
    categoria: '',
    centroCusto: '',
    grupoGerencial: nomeGrupo(gerencialGroups, p.grupoGerencial),
    tipoDocumento: 'CC',
    parcela: '',
    valor: Number(p.amount) || 0,
    status: p.status === 'paid' ? 'Pago' : 'A pagar',
  }))
}

const COLUNAS = [
  ['vencimento', 'Vencimento'], ['descricao', 'Descrição'], ['favorecido', 'Favorecido'], ['conta', 'Conta'],
  ['categoria', 'Categoria'], ['centroCusto', 'Centro de custo'], ['grupoGerencial', 'Grupo gerencial'],
  ['tipoDocumento', 'Tipo de documento'], ['parcela', 'Parcela'], ['valor', 'Valor'], ['status', 'Status'],
]

// Grupo gerencial só com o controle gerencial ligado.
export const colunasExportacao = ({ gerencial }) => COLUNAS.filter(([k]) => gerencial || k !== 'grupoGerencial')

const serialExcel = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000
}

// Planilha: data como data (dd/mm/aaaa) e valor como número em R$ com 2 casas.
export function planilhaAgendamentos(linhas, { gerencial }) {
  const cols = colunasExportacao({ gerencial })
  const ws = XLSX.utils.aoa_to_sheet([cols.map(([, h]) => h), ...linhas.map(l => cols.map(([k]) => l[k] ?? ''))])
  const iData = cols.findIndex(([k]) => k === 'vencimento')
  const iValor = cols.findIndex(([k]) => k === 'valor')
  linhas.forEach((l, i) => {
    const r = i + 1
    const serial = l.vencimento ? serialExcel(l.vencimento) : null
    const cData = XLSX.utils.encode_cell({ r, c: iData })
    ws[cData] = serial != null ? { t: 'n', v: serial, z: 'dd/mm/yyyy' } : { t: 's', v: '' }
    ws[XLSX.utils.encode_cell({ r, c: iValor })] = { t: 'n', v: Number(l.valor) || 0, z: '"R$" #,##0.00;-"R$" #,##0.00' }
  })
  ws['!cols'] = cols.map(([k]) => ({ wch: { descricao: 40, favorecido: 25, conta: 22, categoria: 22, vencimento: 12, valor: 14 }[k] || 16 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Agendamentos')
  return wb
}

export const nomeArquivoAgendamentos = (data = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `agendamentos-${data.getFullYear()}${p(data.getMonth() + 1)}${p(data.getDate())}.xlsx`
}

export function exportarAgendamentosExcel(linhas, { gerencial, data = new Date() } = {}) {
  XLSX.writeFile(planilhaAgendamentos(linhas, { gerencial }), nomeArquivoAgendamentos(data))
}
