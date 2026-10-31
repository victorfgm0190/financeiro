// Assistente IA — o que o PEDIDO disse e o formulário tem campo para isso (grupo gerencial, conta da
// devolução do grupo 1, reserva/função, tipo de documento, observação, fatura, repetir, centro de
// custo) → patch do `initial` do TransactionForm/ScheduleForm + as chaves que ganham o selo
// "confira". O backend já validou contra o cadastro (acoes.js extrasDoPedido); aqui confere de novo
// com o estado do app e com a conta FINAL (a escolhida na prévia vale). PURO, sem nomes fixos.
//
// Padrões (o que o pedido NÃO citou) seguem os do formulário: despesa de cartão com o controle
// gerencial ligado e sem grupo citado → o grupo padrão da categoria (como ao escolher a categoria
// à mão); sem ele, D. Grupo ligado a conta de reserva → o formulário liga a reserva e trava o grupo.
import { grupoDaContaReserva, contaReservaDoGrupoGerencial } from '../reservaGerencialForm.js'

const MES_ISO = /^\d{4}-\d{2}$/
const ehContaReserva = (a) => !!a && (a.isReserva || a.vinculoTipo === 'reserva')

// → { initial, citados }. ctx: { accounts, categories, gerencialGroups, reserveFunctions,
// tiposDocumento, gerencialLigado }. `agendamento`: ScheduleForm (sem reserva avulsa, observação,
// fatura e repetir — o agendamento tem a própria frequência).
export function camposDoPedido(p = {}, contaId, ctx = {}, { agendamento = false } = {}) {
  const { accounts = [], categories = [], gerencialGroups = [], reserveFunctions = [], tiposDocumento = [], gerencialLigado = true } = ctx
  const initial = {}
  const citados = []
  const conta = accounts.find(a => a.id === contaId)
  const despesa = p.tipo === 'despesa'
  const cartaoGerencial = despesa && conta?.type === 'credit' && gerencialLigado
  const grupoExiste = (id) => !!id && gerencialGroups.some(g => g.id === id)
  const ctxReserva = { gerencialGroups, accounts }

  const reserva = despesa && ehContaReserva(accounts.find(a => a.id === p.reserva_conta_id)) ? p.reserva_conta_id : null
  const funcao = p.reserva_funcao_id ? reserveFunctions.find(f => f.id === p.reserva_funcao_id) || null : null

  if (cartaoGerencial) {
    // Reserva citada com grupo próprio → o grupo é o dela (o formulário trava); senão o grupo citado;
    // senão o padrão da categoria.
    const grupoCitado = grupoExiste(p.grupo_gerencial_id) ? p.grupo_gerencial_id : null
    const grupoDaReserva = reserva ? grupoDaContaReserva(reserva, gerencialGroups) : null
    const padraoCategoria = categories.find(c => c.id === p.categoria_id)?.defaultGerencialGroup
    const grupo = grupoDaReserva || grupoCitado || (grupoExiste(padraoCategoria) ? padraoCategoria : null)
    if (grupo) {
      initial.grupoGerencial = grupo
      if (grupoDaReserva || grupoCitado) citados.push('grupoGerencial')
    }
    const g = gerencialGroups.find(x => x.id === grupo)
    if (!agendamento && g?.number === 1 && accounts.some(a => a.id === p.conta_devolucao_id && a.type === 'checking' && a.active !== false)) {
      initial.gerencialContaId = p.conta_devolucao_id
      citados.push('gerencialContaId')
    }
    const contaDoGrupo = contaReservaDoGrupoGerencial(grupo, ctxReserva) || (typeof g?.number === 'number' && g.number !== 1 ? g.defaultAccountId : null)
    if (funcao && contaDoGrupo && funcao.accountId === contaDoGrupo) {
      initial.reservaFuncaoId = funcao.id
      citados.push('reservaFuncaoId')
    }
    if (!agendamento && reserva && !grupoDaReserva) {
      // Reserva sem grupo próprio no cartão: resgate avulso, como no formulário.
      initial.reservaContaId = reserva
      citados.push('reservaAccountId')
      if (funcao?.accountId === reserva) { initial.reservaFuncaoId = funcao.id; citados.push('reservaFuncaoId') }
    } else if (grupoDaReserva) citados.push('reservaAccountId')
    if (!agendamento && MES_ISO.test(String(p.fatura || ''))) {
      initial.faturaMonthYear = p.fatura
      citados.push('faturaMonthYear')
    }
  } else if (!agendamento && reserva && conta?.type !== 'credit') {
    // Despesa de conta: "Será pago com reserva" com a conta citada (e a função, se for dela).
    initial.reservaContaId = reserva
    citados.push('reservaAccountId')
    if (funcao?.accountId === reserva) { initial.reservaFuncaoId = funcao.id; citados.push('reservaFuncaoId') }
  }

  if (p.tipo_documento_id && tiposDocumento.some(t => t.id === p.tipo_documento_id && t.ativo !== false)) {
    initial.tipoDocumentoId = p.tipo_documento_id
    citados.push('tipoDocumentoId')
  }
  if (p.centro_custo_id) citados.push('costCenter')
  if (!agendamento && p.observacoes) {
    initial.notes = p.observacoes
    citados.push('notes')
  }
  if (!agendamento && p.repetir) {
    initial.repeatFrequency = p.repetir
    citados.push('repeat')
  }
  return { initial, citados: [...new Set(citados)] }
}

export const ROTULO_CITADO = {
  grupoGerencial: 'classificação gerencial', gerencialContaId: 'conta destino da devolução', reservaAccountId: 'reserva',
  reservaFuncaoId: 'função de reserva', tipoDocumentoId: 'tipo de documento', costCenter: 'centro de custo', notes: 'observações',
  faturaMonthYear: 'fatura de referência', repeat: 'repetir',
}
