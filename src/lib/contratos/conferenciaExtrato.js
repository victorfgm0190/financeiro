// CONFERÊNCIA DO EXTRATO DA ADMINISTRADORA (contrato a receber por administradora) — funções puras.
// O Finup projeta sozinho cada competência (aluguel, taxa de adm., tarifas, taxas únicas, saldo e
// repasse); o extrato só AJUSTA: cada item lido fica ao lado do projetado, com a diferença, e ao
// confirmar a competência fica "Conferida" (composição real gravada, repasse = líquido do extrato).
import { TIPOS_ITEM_REPASSE, dedutivelPadrao, somaItens } from './composicaoRepasse.js'
import { addMeses, diaNoMes, fmtYm } from './datas.js'

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const ZERO = 0.005

export const TIPOS_EXTRATO = ['aluguel', 'taxa_adm', 'taxa_unica', 'tarifa', 'despesa', 'benfeitoria', 'ajuste']
export const ROTULOS_TIPO_EXTRATO = {
  aluguel: 'Aluguel', taxa_adm: 'Taxa de administração', taxa_unica: 'Taxa única (intermediação…)', tarifa: 'Tarifa / banco',
  despesa: 'Despesa do proprietário', benfeitoria: 'Benfeitoria', ajuste: 'Outro ajuste',
}
const NATUREZAS = ['iptu', 'condominio', 'consumo', 'manutencao', 'outra']

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Tipo sugerido pela descrição (quando a leitura não traz um válido).
export function sugerirTipoExtrato(descricao) {
  const d = semAcento(descricao)
  if (/intermedia|corretagem|taxa de (contrato|locacao)|1o aluguel|primeiro aluguel/.test(d)) return { tipo: 'taxa_unica' }
  if (/administra|tx\.? ?adm|taxa adm/.test(d)) return { tipo: 'taxa_adm' }
  if (/aluguel|locacao|locativo/.test(d)) return { tipo: 'aluguel' }
  if (/tarifa|banc|\bted\b|\bdoc\b|\bpix\b|boleto/.test(d)) return { tipo: 'tarifa' }
  if (/iptu/.test(d)) return { tipo: 'despesa', natureza: 'iptu' }
  if (/condom/.test(d)) return { tipo: 'despesa', natureza: 'condominio' }
  if (/sanepar|sabesp|agua|luz|energia|copel|cemig|enel|light|gas|compagas|comgas/.test(d)) return { tipo: 'despesa', natureza: 'consumo' }
  if (/benfeit|reparo|reforma|conserto|manuten/.test(d)) return { tipo: 'benfeitoria' }
  return { tipo: 'ajuste' }
}

// Leitura (IA ou digitada) → linhas da tela: [{ id, descricao, valor (com sinal: + a favor do
// proprietário, − descontado), tipo, natureza, taxa_id }].
//   leitura.itens: [{ descricao, valor (positivo), natureza: 'credito'|'debito', tipo?, natureza_despesa? }]
export function linhasDaLeitura(leitura, contrato) {
  const unicas = taxasUnicasDo(contrato)
  return (Array.isArray(leitura?.itens) ? leitura.itens : []).map((i, n) => {
    const sug = sugerirTipoExtrato(i.descricao)
    const tipo = TIPOS_EXTRATO.includes(i.tipo) ? i.tipo : sug.tipo
    const valor = r2(Math.abs(Number(i.valor) || 0)) * (i.natureza === 'credito' ? 1 : -1)
    return {
      id: `x${n}`, descricao: String(i.descricao || '').trim() || ROTULOS_TIPO_EXTRATO[tipo], valor: r2(valor), tipo,
      natureza: tipo === 'despesa' ? (NATUREZAS.includes(i.natureza_despesa) ? i.natureza_despesa : sug.natureza || 'outra') : null,
      taxa_id: tipo === 'taxa_unica' && unicas.length === 1 ? unicas[0].id : null,
    }
  })
}

export const taxasUnicasDo = (contrato) => (contrato?.itens_repasse || []).filter(t => t.tipo_repasse === 'taxa_unica' && t.ativo !== false)

// Itens projetados da competência → linhas da tela (digitar o extrato a partir do projetado).
export function linhasDoProjetado(itens) {
  return (itens || []).map((i, n) => ({
    id: `p${n}`, descricao: i.descricao || TIPOS_ITEM_REPASSE[i.tipo], valor: r2(i.valor), tipo: i.tipo,
    natureza: i.tipo === 'despesa' ? i.natureza || 'outra' : null, taxa_id: i.tipo === 'taxa_unica' ? i.taxa_id || String(i.chave || '').split(':')[1] || null : null,
  }))
}

// Chave da comparação: taxa única por taxa do contrato; os demais por tipo.
const chaveDe = (tipo, taxaId) => (tipo === 'taxa_unica' ? `taxa_unica:${taxaId || '?'}` : tipo)
const taxaIdDoItem = (i) => i.taxa_id || (i.tipo === 'taxa_unica' ? String(i.chave || '').split(':')[1] || null : null)

// Lido × projetado por chave: [{ chave, tipo, rotulo, lido, projetado, diferenca }] (diferenca = lido − projetado).
export function compararComProjetado(linhas, itensProjetados, contrato = null) {
  const mapa = new Map()
  const nomeTaxa = (id) => taxasUnicasDo(contrato).find(t => t.id === id)?.descricao
  const pegar = (tipo, taxaId) => {
    const k = chaveDe(tipo, taxaId)
    if (!mapa.has(k)) {
      mapa.set(k, {
        chave: k, tipo, lido: 0, projetado: 0,
        rotulo: tipo === 'taxa_unica' ? (nomeTaxa(taxaId) || 'Taxa única (sem ligação)') : ROTULOS_TIPO_EXTRATO[tipo],
      })
    }
    return mapa.get(k)
  }
  for (const i of itensProjetados || []) { const x = pegar(i.tipo, taxaIdDoItem(i)); x.projetado = r2(x.projetado + Number(i.valor)) }
  for (const l of linhas || []) { const x = pegar(l.tipo, l.taxa_id); x.lido = r2(x.lido + Number(l.valor)) }
  return [...mapa.values()].map(x => ({ ...x, diferenca: r2(x.lido - x.projetado) }))
}

// Saldo anterior do extrato × saldo do Finup antes da competência. → null (bate ou não informado)
// ou { extrato, finup, diferenca } (diferenca = extrato − finup: o ajuste que faz o Finup chegar nele).
export function conferirSaldoAnterior(saldoExtrato, saldoFinup) {
  if (saldoExtrato == null || saldoExtrato === '' || !Number.isFinite(Number(saldoExtrato)) || saldoFinup == null) return null
  const diferenca = r2(Number(saldoExtrato) - Number(saldoFinup))
  return Math.abs(diferenca) > ZERO ? { extrato: r2(saldoExtrato), finup: r2(saldoFinup), diferenca } : null
}

// Linha de ajuste que acerta o saldo anterior com o do extrato.
export const linhaAjusteSaldo = (diferenca) => ({
  id: `aj${Date.now().toString(36)}`, descricao: 'Ajuste do saldo anterior (extrato da administradora)', valor: r2(diferenca), tipo: 'ajuste', natureza: null, taxa_id: null,
})

// Avisos da taxa única: o extrato traz mais do que falta descontar (não bloqueia).
//   saldos: saldoTaxasUnicas(contrato, …, competencia) → { [id]: { total, descontado, falta } }
export function avisosTaxasUnicas(linhas, saldos, contrato) {
  const out = []
  for (const t of taxasUnicasDo(contrato)) {
    const lido = r2(-(linhas || []).filter(l => l.tipo === 'taxa_unica' && l.taxa_id === t.id).reduce((a, l) => a + Number(l.valor), 0))
    const falta = saldos?.[t.id]?.falta
    if (falta != null && lido > falta + ZERO) {
      out.push(`${t.descricao}: o extrato desconta ${brl(lido)}, mas faltavam ${brl(falta)} (total ${brl(saldos[t.id].total)}). Dá para confirmar assim mesmo.`)
    }
  }
  if ((linhas || []).some(l => l.tipo === 'taxa_unica' && !l.taxa_id) && taxasUnicasDo(contrato).length) {
    out.push('Há item de taxa única sem ligação com a taxa do contrato: ele não abate o saldo a descontar.')
  }
  return out
}
const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Linhas → itens da composição a gravar (formato contrato_competencias) e o registro da conferência.
//   linhaProjetada: a competência de competenciasDoRepasse (saldo_anterior do Finup, itens projetados).
//   cab: { periodo, saldo_anterior, total, repasse } lidos do extrato (null = não informado).
export function montarConferencia(contrato, linhaProjetada, linhas, cab = {}, { origem = 'manual', hoje } = {}) {
  const usadas = new Map()
  const unica = (base) => { const n = (usadas.get(base) || 0) + 1; usadas.set(base, n); return n === 1 ? base : `${base}:${n}` }
  const tarifa = (contrato?.itens_repasse || []).find(t => t.tipo_repasse === 'tarifa_fixa' && t.ativo !== false)
  const catTaxa = (id) => (contrato?.itens_repasse || []).find(t => t.id === id)?.categoria_id || contrato?.categoria_taxa_adm_id || null
  const itens = (linhas || []).filter(l => Math.abs(Number(l.valor)) > ZERO).map((l, n) => {
    const base = { tipo: l.tipo, descricao: String(l.descricao || '').trim() || ROTULOS_TIPO_EXTRATO[l.tipo], valor: r2(l.valor), dedutivel_ir: dedutivelPadrao(l.tipo, l.natureza) }
    if (l.tipo === 'aluguel') return { ...base, chave: unica('aluguel'), origem: 'auto', informado: false, valor_calculado: null, categoria_id: contrato?.categoria_id || null }
    if (l.tipo === 'taxa_adm') return { ...base, chave: unica('adm'), origem: 'auto', informado: false, valor_calculado: null, categoria_id: contrato?.categoria_taxa_adm_id || null }
    if (l.tipo === 'tarifa') return { ...base, chave: unica(`tarifa:${tarifa?.id || 'extrato'}`), origem: 'auto', informado: false, valor_calculado: null, categoria_id: catTaxa(tarifa?.id) }
    if (l.tipo === 'taxa_unica') {
      return {
        ...base, chave: unica(`taxa_unica:${l.taxa_id || 'extrato'}`), origem: 'auto', informado: false, valor_calculado: null,
        categoria_id: catTaxa(l.taxa_id), ...(l.taxa_id ? { taxa_id: l.taxa_id } : {}),
      }
    }
    return {
      ...base, chave: `m:x${n}${Date.now().toString(36)}`, origem: 'manual', categoria_id: contrato?.categoria_taxa_adm_id || null,
      ...(l.tipo === 'despesa' ? { natureza: l.natureza || 'outra' } : {}),
      ...(l.tipo === 'benfeitoria' ? { somar_ao_bem: false } : {}),
    }
  })
  const finup = linhaProjetada?.saldo_anterior ?? null
  const saldo = r2((Number(finup) || 0) + somaItens(itens))
  const repasseInformado = cab.repasse != null && cab.repasse !== '' && Number.isFinite(Number(cab.repasse))
  const repasse = repasseInformado ? r2(cab.repasse) : (saldo > ZERO ? saldo : 0)
  return {
    itens,
    resumo: { saldo_anterior: finup, resultado: somaItens(itens), saldo, repasse },
    conferencia: {
      conferido_em: hoje, origem: origem === 'ia' ? 'ia' : 'manual', periodo: cab.periodo || null,
      saldo_anterior_extrato: num(cab.saldo_anterior), saldo_anterior_finup: finup == null ? null : r2(finup),
      total_extrato: num(cab.total), repasse,
    },
  }
}
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : r2(v))

// LEMBRETE: a partir do dia 5 do mês do repasse, a competência que ele paga ainda não conferida.
// → { competencia, texto } da competência mais recente já "vencida" para conferir, ou null.
//   linhas: competenciasDoRepasse do contrato.
export const DIA_LEMBRETE_EXTRATO = 5
export function extratoPendente(contrato, linhas, hoje) {
  const meses = Number.isFinite(Number(contrato?.repasse_meses_depois)) ? Number(contrato.repasse_meses_depois) : 1
  const devidas = (linhas || []).filter(l => !l.foraDoSaldo && diaNoMes(addMeses(l.competencia, meses), DIA_LEMBRETE_EXTRATO) <= hoje)
  const l = devidas.at(-1)
  if (!l || l.linha?.conferencia) return null
  return { competencia: l.competencia, texto: `Extrato de ${fmtYm(l.competencia)} da ${contrato.favorecido || 'administradora'} ainda não conferido` }
}

// Lembrete para o agendamento do repasse da competência (sem varrer o contrato): já passou do dia 5 do
// mês do repasse → o texto; senão null. Quem chama já sabe que não foi conferida.
export function lembreteDaParcela(contrato, competencia, hoje) {
  if (!contrato || !competencia) return null
  const meses = Number.isFinite(Number(contrato.repasse_meses_depois)) ? Number(contrato.repasse_meses_depois) : 1
  if (diaNoMes(addMeses(competencia, meses), DIA_LEMBRETE_EXTRATO) > hoje) return null
  return `Extrato de ${fmtYm(competencia)} da ${contrato.favorecido || 'administradora'} ainda não conferido`
}

// Líquido do extrato × itens conferidos: o repasse informado no extrato deve ser o saldo (saldo
// anterior do Finup + itens). → null (bate, ou extrato sem líquido) ou { extrato, calculado, diferenca }
// (diferenca = extrato − calculado: o ajuste que faz os itens chegarem no líquido). Sem repasse no
// extrato (0) e saldo ≤ 0 também bate (não há repasse).
export function conferirRepasse(repasseExtrato, saldoCalculado) {
  if (repasseExtrato == null || repasseExtrato === '' || !Number.isFinite(Number(repasseExtrato))) return null
  const extrato = r2(repasseExtrato)
  const calculado = r2(saldoCalculado)
  if (extrato <= ZERO && calculado <= ZERO) return null
  const diferenca = r2(extrato - calculado)
  return Math.abs(diferenca) > ZERO ? { extrato, calculado, diferenca } : null
}

export const linhaAjusteRepasse = (diferenca) => ({
  id: `ar${Date.now().toString(36)}`, descricao: 'Ajuste do repasse (líquido do extrato)', valor: r2(diferenca), tipo: 'ajuste', natureza: null, taxa_id: null,
})
