// "Agenda no celular": eventos do feed .ics a partir dos dados JÁ carregados no app — as MESMAS
// ocorrências e valores da Visão Calendário (lib/agendaCalendario, status "A pagar"). Sem React.
//
// Feed = visão "Tudo" do dono (o /api/load já trouxe só os perfis permitidos para ele):
//   • agendamentos PENDENTES (a próxima e as seguintes), sem os zerados;
//   • faturas em aberto do contas_a_pagar, menos as que já têm o agendamento pagamento_fatura da
//     mesma fatura (a mesma fatura nunca aparece duas vezes);
//   • despesa + fatura → "Finup Despesas"; receita → "Finup Receitas"; transferências, aplicações e
//     resgates ficam fora.
// Janela: hoje − 30 dias até hoje + 12 meses.
import { buildScheduleGroups } from './agendamentosGrupos.js'
import { filtrarPorStatusPeriodo } from './agendamentosFiltro.js'
import { occEfetiva } from './fluxoCaixa.js'
import { occCampos } from './camposSerie.js'
import { ocorrenciasPendentes, ocorrenciasFaturas, faturasSemAgendamento, chaveFatura, ladoDoGrupo } from './agendaCalendario.js'
import { gerarIcs, hashIcs, TIPOS_FEED } from './agendaIcs.js'

const pad = (n) => String(n).padStart(2, '0')
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const valorBr = (v) => brl.format(Number(v) || 0).replace(/[\u00a0\u202f]/g, ' ')
const dataBr = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export function janelaDoFeed(hoje) {
  const [y, m, d] = hoje.split('-').map(Number)
  const ini = isoLocal(new Date(y, m - 1, d - 30))
  // +12 meses no mesmo dia (31/01 → 31/01; 29/02 → 28/02 do ano seguinte, sem pular de mês).
  const ultimo = new Date(y + 1, m, 0).getDate()
  const fim = `${y + 1}-${pad(m)}-${pad(Math.min(d, ultimo))}`
  return { ini, fim }
}

// UID estável: ocorrência = agendamento + data ORIGINAL (mudar o dia move o mesmo evento); fatura =
// cartão + mês, igual para o card do contas_a_pagar e para o agendamento pagamento_fatura.
const limpo = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, '_')
export function uidFatura(chave) {
  const [card, ym] = chave.split('|')
  return `fat-${limpo(card)}-${ym.replace('-', '')}@finup.app.br`
}
export const uidOcorrencia = (scheduleId, dataOriginal) => `ag-${limpo(scheduleId)}-${dataOriginal.replace(/-/g, '')}@finup.app.br`

// Zerado = valor base e valor EFETIVO da próxima iguais a zero (mesma regra da tela).
function zerado(s, getNextOccurrences) {
  if (Number(s.amount) !== 0) return false
  const next = getNextOccurrences(s, 1)[0]
  return !next || Number(occEfetiva(s, next).amount) === 0
}

const nomeConta = (accounts, id) => {
  const a = id && accounts.find(x => x.id === id)
  return a ? (a.apelido || a.name || '') : ''
}

// Itens (do agendaCalendario) do feed: { despesa: [...], receita: [...] }.
export function itensDoFeed({ schedules = [], payables = [], accounts = [], getNextOccurrences, hoje, podeVer = true }) {
  const vazio = { despesa: [], receita: [] }
  if (!podeVer) return vazio
  const { ini, fim } = janelaDoFeed(hoje)
  // Só os marcados para a agenda do celular (sincronizar_agenda). A fatura de um agendamento
  // pagamento_fatura desmarcado também não volta pelo contas_a_pagar (agFatura usa todos).
  const base = schedules.filter(s => s.sincronizarAgenda !== false && !zerado(s, getNextOccurrences))
  const pendentes = filtrarPorStatusPeriodo(base, { status: 'apagar', periodo: 'futuros' }, getNextOccurrences, hoje)
  const rows = buildScheduleGroups(pendentes, getNextOccurrences, { agruparSeries: false })
  const itens = ocorrenciasPendentes(rows, getNextOccurrences, { ini, fim, hoje, accounts })

  const agFatura = schedules.filter(s => s.tipo === 'pagamento_fatura' && s.transactionType === 'transfer')
  const faturas = faturasSemAgendamento(
    payables.filter(p => p.origin === 'invoice' && Number(p.amount) !== 0 && p.status !== 'paid'),
    agFatura,
  )
  itens.push(...ocorrenciasFaturas(faturas, { ini, fim, hoje }))

  for (const it of itens) {
    const lado = ladoDoGrupo(it.grupo)
    if (lado === 'saida') vazio.despesa.push(it)
    else if (lado === 'entrada') vazio.receita.push(it)
  }
  return vazio
}

// Item → evento do .ics.
export function eventoDoItem(it, { accounts = [], categories = [], mostrarValores = true, linkFinup = '' }) {
  let uid, descricao, conta, categoria = '', favorecido = ''
  if (it.fatura) {
    const p = it.fatura
    const chave = chaveFatura(p)
    uid = chave ? uidFatura(chave) : `cap-${limpo(p.id)}@finup.app.br`
    conta = nomeConta(accounts, p.cartaoId)
    descricao = p.description || `Fatura ${conta}`.trim()
  } else {
    const s = it.schedule
    const c = it.original ? occCampos(s, it.original) : s
    const chave = s.tipo === 'pagamento_fatura' ? chaveFatura(s) : null
    uid = chave ? uidFatura(chave) : uidOcorrencia(s.id, it.original || it.data)
    conta = nomeConta(accounts, c.accountId || s.accountId)
    categoria = categories.find(x => x.id === c.categoryId)?.name || ''
    favorecido = s.payee || ''
    descricao = c.description || s.description || '(agendamento)'
  }
  const titulo = `${it.atrasado ? '⚠ ' : ''}${descricao}${mostrarValores ? ` — ${valorBr(it.amount)}` : ''}`
  const linhas = [
    conta && `Conta: ${conta}`,
    categoria && `Categoria: ${categoria}`,
    favorecido && `Favorecido: ${favorecido}`,
    it.atrasado && `Atrasado (venceu em ${dataBr(it.data)})`,
    linkFinup && `Abrir no Finup: ${linkFinup}`,
  ].filter(Boolean)
  return { uid, data: it.data, titulo, descricao: linhas.join('\n'), url: linkFinup || undefined }
}

// Os .ics do feed: { despesa: { conteudo, hash }, receita: {...} } só dos `tipos` escolhidos.
export function gerarFeed({ tipos = TIPOS_FEED, mostrarValores = true, linkFinup = '', agora = new Date(), ...dados }) {
  const itens = itensDoFeed(dados)
  const out = {}
  for (const tipo of TIPOS_FEED) {
    if (!tipos.includes(tipo)) continue
    const eventos = itens[tipo].map(it => eventoDoItem(it, { accounts: dados.accounts, categories: dados.categories, mostrarValores, linkFinup }))
    const conteudo = gerarIcs({ tipo, eventos, agora })
    out[tipo] = { conteudo, hash: hashIcs(conteudo) }
  }
  return out
}
