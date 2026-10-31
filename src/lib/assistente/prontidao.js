// Assistente IA — "prontidão": depois de identificar uma DESPESA, qual a próxima ação mais provável
// (Só despesa / Despesa + agendamento / Só agendamento) e qual recorrência sugerir. PURO e testável;
// palavras-chave em prontidaoConfig.js. Imports com .js (o backend também usa).
//
// Regras, na ordem (a primeira que se aplica decide):
//   a) parcela "3/10", "3 de 10" → Despesa + agendamento Parcelado com as parcelas restantes e o fim
//      (a parcela de compra JÁ lançada no cartão é tratada antes, pela prévia — lib/matchLancamento);
//   b) nº de contrato → Despesa + agendamento Mensal; o mesmo contrato no histórico = confirmação forte
//      (reaproveita favorecido, categoria e conta);
//   c) tributo/encargo anual (IPVA, IPTU, licenciamento, seguro, anuidade) → Anual;
//   d) boleto/fatura de serviço → Mensal (conta de consumo/fixa reforça);
//   e) nota fiscal, cupom, recibo → Só despesa;
//   f) histórico: o mesmo favorecido nos 2 meses anteriores seguidos → Despesa + agendamento Mensal;
//   g) sem indícios → nada destacado.
// Boleto/fatura com vencimento futuro e sem sinal de pagamento → "Só agendamento" (destacado).
import { normalizarTermo } from './texto.js'
import {
  ROTULOS_CONTRATO, PALAVRAS_PARCELA, CONTAS_FIXAS, TRIBUTOS_ANUAIS, NATUREZAS, PEDIDO_AGENDAR, MESES_SEGUIDOS_PARA_MENSAL,
} from './prontidaoConfig.js'

export const ACAO = { SO_DESPESA: 'so_despesa', DESPESA_AGENDAMENTO: 'despesa_agendamento', SO_AGENDAMENTO: 'so_agendamento' }
const norm = (s) => normalizarTermo(s)
const contem = (texto, lista) => {
  const t = ` ${norm(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `
  return lista.find(p => t.includes(` ${p} `)) || null
}

// Parcela citada de algo que já existe: { numero, total } ou null.
export function parcelaAtualDoTexto(texto) {
  const t = norm(texto)
  const pal = PALAVRAS_PARCELA.join('|')
  let m = t.match(new RegExp(`\\b(?:${pal})\\.?\\s*(\\d{1,3})\\s*(?:/|de)\\s*(\\d{1,3})\\b`))
    || t.match(new RegExp(`\\b(\\d{1,3})\\s*(?:a|ª|o|º)?\\s*(?:${pal})\\s*de\\s*(\\d{1,3})\\b`))
  if (!m) return null
  const numero = Number(m[1]), total = Number(m[2])
  return numero >= 1 && total > 1 && numero <= total ? { numero, total } : null
}

// Número de contrato depois de um rótulo ("Contrato nº 12345", "nº do contrato: AB-778/2026").
export function numeroContratoDoTexto(texto) {
  const t = norm(texto)
  const rotulos = [...ROTULOS_CONTRATO].sort((a, b) => b.length - a.length)
  for (const r of rotulos) {
    let ini = 0
    while ((ini = t.indexOf(r, ini)) >= 0) {
      const resto = t.slice(ini + r.length).replace(/^[\s.:#º°o-]*/, '')
      const m = resto.match(/^([a-z0-9][a-z0-9./-]{2,30})/i)
      if (m && /\d/.test(m[1])) return m[1].replace(/[./-]+$/, '').toUpperCase()
      ini += r.length
    }
  }
  return null
}

// Natureza do documento: a do modelo, a do tipo do cadastro (sigla/nome) ou a do texto.
export function naturezaDoDocumento({ natureza, tipoDocumento, texto } = {}) {
  if (natureza && NATUREZAS[natureza]) return natureza
  const doc = tipoDocumento ? `${tipoDocumento.sigla || ''} ${tipoDocumento.nome || ''}` : ''
  for (const fonte of [doc, texto]) {
    if (!fonte) continue
    for (const [nat, palavras] of Object.entries(NATUREZAS)) if (contem(fonte, palavras)) return nat
  }
  return null
}

// Pedido explícito de agendar no texto ("e agende", "todo mês").
export const pediuAgendar = (texto) => !!contem(texto, PEDIDO_AGENDAR)

const somarMeses = (iso, n) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  const ultimo = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}
const mesDe = (iso) => String(iso || '').slice(0, 7)
const digitos = (s) => String(s || '').replace(/[^0-9a-z]/gi, '').toUpperCase()

// Lançamento ou agendamento anterior com o mesmo nº de contrato (na observação, descrição ou favorecido).
export function contratoNoHistorico(numero, { transactions = [], schedules = [] } = {}) {
  const alvo = digitos(numero)
  if (alvo.length < 3) return null
  const tem = (x) => digitos(`${x.notes || ''} ${x.description || ''} ${x.payee || ''}`).includes(alvo)
  const tx = [...transactions].filter(t => t.type === 'expense' && tem(t)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
  const schedule = schedules.find(tem) || null
  if (!tx && !schedule) return null
  const base = tx || schedule
  return { tx: tx || null, schedule, payee: base.payee || null, categoryId: base.categoryId || null, accountId: base.accountId || null }
}

// O mesmo favorecido (ou descrição) nos N meses ANTERIORES seguidos ao de `hoje`.
export function recorrenteNoHistorico({ favorecido, descricao }, transactions = [], hoje, meses = MESES_SEGUIDOS_PARA_MENSAL) {
  const chave = norm(favorecido || descricao)
  if (!chave) return false
  const alvos = Array.from({ length: meses }, (_, i) => mesDe(somarMeses(`${mesDe(hoje)}-01`, -(i + 1))))
  const vistos = new Set(transactions
    .filter(t => t.type === 'expense' && norm(t.payee || t.description) === chave)
    .map(t => mesDe(t.date)))
  return alvos.every(m => vistos.has(m))
}

// → { acaoSugerida, recorrenciaSugerida, parcelasRestantes, fimSugerido, motivo, numeroContrato,
//     reaproveitar, natureza, regra }. acaoSugerida null = nada destacado.
export function sugerirAcaoDespesa({
  natureza: natModelo = null, tipoDocumento = null, descricao = '', favorecido = '', categoriaNome = '', texto = '',
  numeroContrato = null, parcelaAtual = null, vencimento = null, pago = null, hoje,
  historico = { transactions: [], schedules: [] },
} = {}) {
  const tudo = [texto, descricao, favorecido, categoriaNome].filter(Boolean).join(' \n ')
  const natureza = naturezaDoDocumento({ natureza: natModelo, tipoDocumento, texto: tudo })
  const contrato = numeroContrato || numeroContratoDoTexto(tudo)
  const parcela = parcelaAtual?.numero && parcelaAtual?.total ? parcelaAtual : parcelaAtualDoTexto(tudo)
  const contaAPagar = (natureza === 'boleto' || natureza === 'fatura') && pago !== true && !!vencimento && vencimento > hoje
  const acaoAgendar = contaAPagar ? ACAO.SO_AGENDAMENTO : ACAO.DESPESA_AGENDAMENTO
  const base = { natureza, numeroContrato: contrato || null, parcelasRestantes: null, fimSugerido: null, reaproveitar: null }

  // a) parcela
  if (parcela && parcela.numero < parcela.total) {
    const restantes = parcela.total - parcela.numero
    return {
      ...base, regra: 'parcela', acaoSugerida: acaoAgendar, recorrenciaSugerida: 'installment', parcelasRestantes: restantes,
      fimSugerido: somarMeses(vencimento || hoje, restantes),
      motivo: `Parcela ${parcela.numero} de ${parcela.total} — faltam ${restantes}`,
    }
  }
  // b) contrato
  if (contrato) {
    const anterior = contratoNoHistorico(contrato, historico)
    const doc = natureza === 'boleto' ? 'Boleto' : natureza === 'fatura' ? 'Fatura' : 'Documento'
    return {
      ...base, regra: anterior ? 'contrato_conhecido' : 'contrato', acaoSugerida: acaoAgendar, recorrenciaSugerida: 'monthly',
      reaproveitar: anterior ? { payee: anterior.payee, categoryId: anterior.categoryId, accountId: anterior.accountId } : null,
      motivo: anterior
        ? `${doc} com o contrato nº ${contrato} — o mesmo de um lançamento anterior, costuma ser mensal`
        : `${doc} com o contrato nº ${contrato} — costuma ser mensal`,
      pergunta: `Esse ${doc.toLowerCase()} tem o contrato nº ${contrato} — parece cobrança mensal. Deseja lançar a despesa e criar o agendamento mensal?`,
    }
  }
  // c) tributos/encargos anuais
  const tributo = contem(tudo, TRIBUTOS_ANUAIS)
  if (tributo) {
    return { ...base, regra: 'anual', acaoSugerida: acaoAgendar, recorrenciaSugerida: 'annual', motivo: `${tributo.toUpperCase()} costuma ser anual` }
  }
  // d) boleto/fatura de serviço
  if (natureza === 'boleto' || natureza === 'fatura') {
    const fixa = contem(tudo, CONTAS_FIXAS)
    return {
      ...base, regra: 'conta_mensal', acaoSugerida: acaoAgendar, recorrenciaSugerida: 'monthly',
      motivo: fixa ? `Conta de ${fixa} — costuma ser mensal` : `${natureza === 'boleto' ? 'Boleto' : 'Fatura'} de serviço — costuma ser mensal`,
    }
  }
  // e) compra pontual
  if (natureza === 'nota_fiscal' || natureza === 'cupom' || natureza === 'recibo') {
    const nome = { nota_fiscal: 'Nota fiscal', cupom: 'Cupom fiscal', recibo: 'Recibo' }[natureza]
    return { ...base, regra: 'pontual', acaoSugerida: ACAO.SO_DESPESA, recorrenciaSugerida: null, motivo: `${nome} de compra — costuma ser pontual` }
  }
  // f) histórico
  if (recorrenteNoHistorico({ favorecido, descricao }, historico.transactions, hoje)) {
    return { ...base, regra: 'historico', acaoSugerida: ACAO.DESPESA_AGENDAMENTO, recorrenciaSugerida: 'monthly', motivo: `${favorecido || descricao} aparece nos últimos meses — parece mensal` }
  }
  // g) sem indícios
  return { ...base, regra: null, acaoSugerida: null, recorrenciaSugerida: null, motivo: null }
}

// 1ª ocorrência do agendamento criado junto com a despesa: a despesa de hoje é a ocorrência deste
// período, então o agendamento começa na PRÓXIMA. `dia` (informado ou o do vencimento) manda no dia.
export function primeiraOcorrencia({ data, dia = null, recorrencia = 'monthly' }) {
  const [y, m, d] = String(data).slice(0, 10).split('-').map(Number)
  const passo = { weekly: 0, biweekly: 0, monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12, installment: 1 }[recorrencia] ?? 1
  if (!passo) {
    const dt = new Date(Date.UTC(y, m - 1, d + (recorrencia === 'weekly' ? 7 : 14)))
    return dt.toISOString().slice(0, 10)
  }
  const base = `${y}-${String(m).padStart(2, '0')}-${String(Number(dia) || d).padStart(2, '0')}`
  return somarMeses(base, passo)
}

// Data final → nº de ocorrências a partir da 1ª (inclusive). null sem data final.
export function vezesAte({ inicio, ate, recorrencia = 'monthly' }) {
  if (!inicio || !ate || ate < inicio) return null
  const passo = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12, installment: 1 }[recorrencia]
  if (!passo) return null
  let n = 0
  for (let d = inicio; d <= ate; d = somarMeses(d, passo)) n++
  return n
}

// Repetição do "Despesa + agendamento" na prévia → campos do TransactionForm (Repetir este lançamento):
// a despesa é a ocorrência deste período (no dia informado/vencimento, se houver) e o agendamento
// segue a partir da próxima. Parcelado: a parcela atual + as restantes. Data final → nº de vezes.
export function repeticaoDaPrevia({ data, recorrencia, dia = null, ate = null, vezes = null, parcelasRestantes = null }) {
  if (!recorrencia || !data) return null
  const freq = recorrencia === 'installment' ? 'monthly' : recorrencia
  const [y, m, d] = String(data).slice(0, 10).split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const inicio = dia ? `${y}-${String(m).padStart(2, '0')}-${String(Math.min(Number(dia), ultimo)).padStart(2, '0')}` : `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  let n = null
  if (recorrencia === 'installment' && parcelasRestantes) n = parcelasRestantes + 1
  else if (vezes) n = vezes
  else if (ate) n = vezesAte({ inicio, ate, recorrencia: freq })
  return {
    repeatFrequency: freq, repeatStartDate: inicio,
    repeatOccurrenceType: n && n > 1 ? 'installment' : 'continuous',
    ...(n && n > 1 ? { repeatInstallments: n } : {}),
    primeira: primeiraOcorrencia({ data: inicio, recorrencia: freq }),
  }
}

// Categorias mais prováveis para completar um rateio: as de despesa mais usadas nos últimos 90 dias,
// fora as que já estão nas linhas.
export function categoriasProvaveis(transactions = [], { hoje, excluir = [], n = 4 } = {}) {
  const limite = somarMeses(hoje, -3)
  const fora = new Set(excluir)
  const cont = new Map()
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.categoryId || fora.has(t.categoryId) || String(t.date) < limite) continue
    cont.set(t.categoryId, (cont.get(t.categoryId) || 0) + 1)
  }
  return [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id)
}
