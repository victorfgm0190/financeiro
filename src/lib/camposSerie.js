// REGRA ÚNICA de edição de séries/parcelas. Funções puras — quem chama aplica (updateSchedule /
// updateTransaction) e registra o histórico.
//
// Campos da SÉRIE (favorecido, tipo de documento): mudou em qualquer parcela → vale para TODAS as
// pendentes da série, sem perguntar.
// Campos da PARCELA (valor, data, categoria — inclusive as da transferência entre perfis —,
// descrição, conta, centro de custo, grupo gerencial):
// se a série tem outras pendentes depois desta, o usuário escolhe "Só esta parcela" ou "Esta e
// as próximas pendentes". Data em "esta e as próximas" desloca as próximas pelo mesmo nº de dias.
//
// REGRA DE OURO: nada aqui altera parcela já efetivada (ocorrência registrada, agendamento com
// baixa, lançamento de fatura fechada/paga) nem lançamento já gerado. Só PENDENTES.
//
// Critério de série = o que já existe: agendamento recorrente (ocorrências de UM registro),
// serie_id / parentTxId + installmentNum nos lançamentos parcelados, e a conta da dívida nas
// parcelas de financiamento (cada financiamento tem a sua). Agendamentos do motor da fatura
// (pagamento_fatura / resgate_reserva / gerencial_devolucao) ficam FORA da regra.

import { somarDias, diasEntre } from './fluxoConsultas.js'
import { faturaEstaFechada } from './faturasFechadas.js'

export const CAMPOS_SERIE = ['payee', 'tipoDocumentoId']
export const CAMPOS_PARCELA = ['amount', 'date', 'categoryId', 'categoriaCnpjId', 'categoriaCpfId', 'description', 'accountId', 'costCenter', 'grupoGerencial']
export const CAMPOS_EDITAVEIS = [...CAMPOS_PARCELA, ...CAMPOS_SERIE]

export const ROTULO_CAMPO = {
  amount: 'Valor', date: 'Data', categoryId: 'Categoria', categoriaCnpjId: 'Categoria no CNPJ',
  categoriaCpfId: 'Categoria no CPF', description: 'Descrição', accountId: 'Conta',
  costCenter: 'Centro de custo', grupoGerencial: 'Grupo gerencial', payee: 'Favorecido',
  tipoDocumentoId: 'Tipo de documento',
}

export const ESCOPO = { PARCELA: 'parcela', PROXIMAS: 'proximas', SERIE: 'serie' }
export const ehCampoSerie = (c) => CAMPOS_SERIE.includes(c)
export const ehCampoParcela = (c) => CAMPOS_PARCELA.includes(c)

// '' / undefined → null; valor em 2 casas. Comparação sem falso "mudou" por tipo.
export function normalizarCampo(campo, v) {
  if (v === undefined || v === '' || v === null) return null
  if (campo === 'amount') {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
  }
  return typeof v === 'string' ? v : v
}

// Mudanças de `depois` em relação a `antes`, só nos campos editáveis presentes em `depois`.
// → [{ campo, de, para }]
export function diffCampos(antes, depois, campos = CAMPOS_EDITAVEIS) {
  const out = []
  for (const campo of campos) {
    if (!depois || !(campo in depois)) continue
    const de = normalizarCampo(campo, antes?.[campo])
    const para = normalizarCampo(campo, depois[campo])
    if (de !== para) out.push({ campo, de, para })
  }
  return out
}

export const mudancasDaSerie = (mud) => (mud || []).filter(m => ehCampoSerie(m.campo))
export const mudancasDaParcela = (mud) => (mud || []).filter(m => ehCampoParcela(m.campo))

// Perguntar só quando mudou campo da PARCELA e há pendentes DEPOIS desta (senão "esta e as
// próximas" é igual a "só esta").
export function precisaEscolherEscopo(mudancas, nProximasPendentes) {
  return nProximasPendentes > 0 && mudancasDaParcela(mudancas).length > 0
}

// ── Caminho A/B/C: UM agendamento com ocorrências calculadas ─────────────────────────────────

// Campos efetivos de UMA ocorrência: os do agendamento + o override daquela data (que agora pode
// ter qualquer campo da parcela, não só data/valor). date/amount seguem a mesma regra do occEfetiva.
export function occCampos(schedule, dataOriginal) {
  const s = schedule || {}
  const ov = s.overrides?.[dataOriginal]
  const o = ov && typeof ov === 'object' ? ov : {}
  const pick = (k) => (o[k] !== undefined ? o[k] : s[k])
  return {
    date: o.date || dataOriginal,
    amount: o.amount != null ? Number(o.amount) : s.amount,
    categoryId: pick('categoryId'),
    categoriaCnpjId: pick('categoriaCnpjId'),
    categoriaCpfId: pick('categoriaCpfId'),
    description: pick('description'),
    accountId: pick('accountId'),
    costCenter: pick('costCenter'),
    grupoGerencial: pick('grupoGerencial'),
  }
}

const semCampo = (obj, campo) => {
  if (!obj || !(campo in obj)) return obj
  const { [campo]: _x, ...resto } = obj // eslint-disable-line no-unused-vars
  return resto
}
const limparOverrides = (overrides) => {
  const out = {}
  for (const [k, v] of Object.entries(overrides || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && /^\d{4}-\d{2}-\d{2}$/.test(k) && Object.keys(v).length === 0) continue
    out[k] = v
  }
  return out
}

// Plano de edição de um agendamento recorrente a partir da ocorrência `occDate` (data ORIGINAL).
//   pendentes: datas originais das ocorrências pendentes (em ordem), incluindo occDate.
//   proximasDoNovo(scheduleNovo): ocorrências pendentes do agendamento já alterado (para re-chavear
//     os overrides quando a data da série inteira desloca).
// → { schedule, afetadas: [datas originais], escopo }
export function planoAgendamento(schedule, { occDate, mudancas, escopo, pendentes = [], proximasDoNovo = null }) {
  let s = { ...schedule, overrides: { ...(schedule.overrides || {}) } }
  const afetadas = new Set()
  const serie = mudancasDaSerie(mudancas)
  const parcela = mudancasDaParcela(mudancas)

  // Campos da série: no próprio agendamento → todas as pendentes. As já registradas viraram
  // lançamentos e não são tocadas.
  for (const m of serie) s[m.campo] = m.para
  if (serie.length) pendentes.forEach(d => afetadas.add(d))

  if (parcela.length && escopo === ESCOPO.PARCELA) {
    // Só esta: override só com os campos que mudaram (corrige o override que gravava `amount`
    // mesmo quando só a data mudava e congelava o valor).
    let ov = { ...(s.overrides[occDate] || {}) }
    for (const m of parcela) {
      if (m.campo === 'date') {
        if (m.para && m.para !== occDate) ov.date = m.para
        else ov = semCampo(ov, 'date')
      } else if (normalizarCampo(m.campo, s[m.campo]) === m.para) {
        ov = semCampo(ov, m.campo) // voltou ao valor da série: o override some
      } else {
        ov[m.campo] = m.para
      }
    }
    s.overrides[occDate] = ov
    afetadas.add(occDate)
  } else if (parcela.length) {
    // Esta e as próximas: muda o agendamento base. Pendentes ANTERIORES à editada congelam o valor
    // antigo via override; as seguintes perdem override daquele campo (o novo valor vale para elas).
    const anteriores = pendentes.filter(d => d < occDate)
    const daquiPraFrente = pendentes.filter(d => d >= occDate)
    for (const m of parcela.filter(x => x.campo !== 'date')) {
      for (const d of anteriores) {
        const ov = s.overrides[d] || {}
        if (!(m.campo in ov)) s.overrides[d] = { ...ov, [m.campo]: schedule[m.campo] ?? null }
      }
      for (const d of daquiPraFrente) if (s.overrides[d]) s.overrides[d] = semCampo(s.overrides[d], m.campo)
      s[m.campo] = m.para
    }
    const mData = parcela.find(x => x.campo === 'date')
    if (mData && mData.de && mData.para) {
      const delta = diasEntre(mData.de, mData.para)
      if (delta !== 0) {
        if (anteriores.length === 0 && typeof proximasDoNovo === 'function') {
          // Editada = 1ª pendente: re-ancora a série e re-chaveia os overrides seguintes por posição.
          const antigos = s.overrides
          // A editada cai exatamente na data escolhida (mesmo se já tinha exceção de data); as
          // seguintes seguem a série a partir dela; exceções próprias delas deslocam pelo mesmo delta.
          const novaAncora = mData.para
          s = { ...s, nextOccurrence: novaAncora, overrides: {} }
          const novas = proximasDoNovo(s)
          for (const [k, v] of Object.entries(antigos)) if (!daquiPraFrente.includes(k)) s.overrides[k] = v
          daquiPraFrente.forEach((d, i) => {
            const ov = antigos[d]
            const alvo = novas[i]
            if (!alvo) return
            if (d === occDate) {
              const resto = semCampo(ov || {}, 'date')
              if (Object.keys(resto).length) s.overrides[alvo] = resto
              return
            }
            if (!ov) return
            s.overrides[alvo] = ov.date ? { ...ov, date: somarDias(ov.date, delta) } : ov
          })
        } else {
          // Há pendentes antes: desloca, por override, cada pendente daqui pra frente.
          for (const d of daquiPraFrente) {
            const ov = s.overrides[d] || {}
            s.overrides[d] = { ...ov, date: somarDias(ov.date || d, delta) }
          }
        }
      }
    }
    daquiPraFrente.forEach(d => afetadas.add(d))
  }
  s.overrides = limparOverrides(s.overrides)
  return {
    schedule: s,
    afetadas: [...afetadas].sort(),
    escopo: parcela.length ? escopo : ESCOPO.SERIE,
  }
}

// ── Caminhos D/E (lançamentos parcelados) e F (parcelas de financiamento) ─────────────────────

// Troca o "N/M" da parcela editada pelo da irmã na descrição propagada ("Diarista 02/05" →
// "Diarista 03/05"). Sem o token, a descrição vai igual (parcelas manuais têm a mesma descrição).
export function descricaoParaIrma(descNova, numEditada, total, numIrma) {
  if (!descNova || !numEditada || !total || !numIrma) return descNova
  const re = new RegExp(`(?<!\\d)(0*)${numEditada}/(0*)${total}(?!\\d)`)
  const m = descNova.match(re)
  if (!m) return descNova
  const largura = (m[1] + String(numEditada)).length
  return descNova.replace(re, `${String(numIrma).padStart(largura, '0')}/${m[2]}${total}`)
}

// Plano para séries de REGISTROS separados. `item` é o registro editado; `irmas`, os demais da
// mesma série (qualquer estado); `ehPendente(x)`, se ainda pode mudar; `ordem(x)`, a posição.
// → [{ id, changes, escopo, mudancas }] — o próprio item primeiro.
export function planoRegistros(item, { mudancas, escopo, irmas = [], ehPendente = () => true, ordem, numParcela = null, total = null }) {
  const serie = mudancasDaSerie(mudancas)
  const parcela = mudancasDaParcela(mudancas)
  const out = [{
    id: item.id,
    changes: Object.fromEntries(mudancas.map(m => [m.campo, m.para])),
    escopo: parcela.length ? escopo : ESCOPO.SERIE,
    mudancas,
  }]
  const posItem = ordem(item)
  for (const x of irmas) {
    if (x.id === item.id || !ehPendente(x)) continue
    const mud = []
    for (const m of serie) {
      const de = normalizarCampo(m.campo, x[m.campo])
      if (de !== m.para) mud.push({ campo: m.campo, de, para: m.para })
    }
    if (escopo === ESCOPO.PROXIMAS && ordem(x) > posItem) {
      for (const m of parcela) {
        let para = m.para
        if (m.campo === 'date') {
          if (!m.de || !m.para || !x.date) continue
          para = somarDias(x.date, diasEntre(m.de, m.para))
        } else if (m.campo === 'description') {
          para = descricaoParaIrma(m.para, numParcela, total, x.installmentNum ?? null)
        }
        const de = normalizarCampo(m.campo, x[m.campo])
        if (de !== normalizarCampo(m.campo, para)) mud.push({ campo: m.campo, de, para })
      }
    }
    if (!mud.length) continue
    out.push({
      id: x.id,
      changes: Object.fromEntries(mud.map(m => [m.campo, m.para])),
      escopo: mud.some(m => ehCampoParcela(m.campo)) ? ESCOPO.PROXIMAS : ESCOPO.SERIE,
      mudancas: mud,
    })
  }
  return out
}

// Irmãs de um lançamento parcelado: mesma conta e total, ligadas por serie_id (ou, sem ele, pela
// raiz parentTxId da compra parcelada manual).
export function irmasLancamento(tx, transactions) {
  if (!tx || !tx.installmentTotal) return []
  const raiz = tx.parentTxId || tx.id
  return (transactions || []).filter(t => {
    if (t.id === tx.id || t.accountId !== tx.accountId) return false
    if (t.installmentTotal !== tx.installmentTotal || t.installmentNum == null) return false
    if (tx.serieId) return t.serieId === tx.serieId
    return t.parentTxId === raiz || t.id === raiz || (t.parentTxId && t.parentTxId === tx.parentTxId)
  })
}

// Parcela de cartão ainda pendente: fatura não fechada e sem pagamento registrado.
export function parcelaCartaoPendente(t, { faturasFechadas = {}, schedules = [] } = {}) {
  if (!t?.faturaMonthYear) return true
  if (faturaEstaFechada(faturasFechadas, t.accountId, t.faturaMonthYear)) return false
  const ym = t.faturaMonthYear.replace('-', '')
  const pag = (schedules || []).find(s => s.id === `fsch_${t.accountId}_${ym}_pagamento_fatura`)
  return !(pag && (pag.registered || []).length > 0)
}

// Agendamentos do motor da fatura: fora da regra de série (o motor recalcula e sobrescreve).
export function agendamentoDoMotor(s) {
  return !!s && (['pagamento_fatura', 'resgate_reserva', 'gerencial_devolucao'].includes(s.tipo)
    || String(s.id || '').startsWith('fsch_')
    || (!s.tipo && String(s.overrides?._gerencialKey || '').endsWith('_payment')))
}

// Série de parcelas de financiamento: cada financiamento tem a sua conta de dívida (destino das
// transferências) — é o elo que o app já tem para agrupar as parcelas.
export function chaveSerieFinanciamento(s) {
  if (!s || s.tipoComponente !== 'financiamento' || !s.financingInstallmentId) return null
  return `financiamento|${s.toAccountId || ''}`
}
export function irmasFinanciamento(s, schedules) {
  const k = chaveSerieFinanciamento(s)
  if (!k) return []
  return (schedules || []).filter(x => x.id !== s.id && chaveSerieFinanciamento(x) === k)
}
// Parcela de financiamento pendente = ainda não baixada.
export const agendamentoUnicoPendente = (s) => (s?.registered || []).length === 0

// Chave da série para o histórico (serie_key).
export function serieKeyDe({ agendamento = null, lancamento = null } = {}) {
  if (agendamento) return chaveSerieFinanciamento(agendamento) || `agendamento|${agendamento.id}`
  if (lancamento) {
    if (lancamento.serieId) return `serie|${lancamento.serieId}`
    if (lancamento.installmentTotal) return `parcelado|${lancamento.parentTxId || lancamento.id}`
    return null
  }
  return null
}

export function mensagemAplicada(nPendentes) {
  return `Alteração aplicada a ${nPendentes} parcela${nPendentes !== 1 ? 's' : ''} pendente${nPendentes !== 1 ? 's' : ''}. Histórico registrado.`
}

// O agendamento "visto" por UMA ocorrência: os campos da parcela com o override daquela data
// aplicado (conta, categoria, descrição, centro de custo, grupo). Quem gera o lançamento da
// ocorrência usa isto no lugar do agendamento — a regra de saldo continua a mesma, só a origem
// dos campos muda. Conta trocada → accountType da conta nova.
export function comCamposDaOcorrencia(schedule, dataOriginal, accounts = []) {
  if (!schedule) return schedule
  const oc = occCampos(schedule, dataOriginal)
  const out = {
    ...schedule,
    categoryId: oc.categoryId, categoriaCnpjId: oc.categoriaCnpjId, categoriaCpfId: oc.categoriaCpfId,
    description: oc.description, accountId: oc.accountId,
    costCenter: oc.costCenter, grupoGerencial: oc.grupoGerencial,
  }
  if (oc.accountId !== schedule.accountId) {
    const acc = (accounts || []).find(a => a.id === oc.accountId)
    out.accountType = acc?.type || schedule.accountType || null
  }
  return out
}
