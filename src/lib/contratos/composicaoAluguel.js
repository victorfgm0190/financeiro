// COMPOSIÇÃO DA PARCELA PRINCIPAL (aluguel) PELO RECIBO — funções puras.
// O recibo da imobiliária (digitado, colado ou lido da foto/PDF) traz débitos (+) e créditos (−).
// Cada item é reconhecido contra o ESPERADO da parcela (valor contratual, bonificação e encargos
// recorrentes — gerarPlanoParcelas): casou → mesmo tipo (e o encargo_id); valor diferente do
// recorrente vale só nesta parcela (a tela pergunta se segue nas próximas). Desconto que parece um
// crédito a abater (mesmo valor e/ou descrição) é oferecido para LIGAR ao crédito; sem crédito, vira
// crédito manual já abatido ou item único, à escolha. Item novo = item único ("Tornar recorrente").
// O recibo SUBSTITUI os itens previstos da parcela (nada de bonificação/encargo/crédito somado de novo).
import { normalizarTexto, padraoDaRegra } from './composicao.js'
import { creditoAAbater } from './creditos.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const igual = (a, b) => Math.abs(r2(a) - r2(b)) < 0.005

export const TIPOS_ITEM_ALUGUEL = {
  base: 'Valor contratual', bonificacao: 'Bonificação', encargo: 'Encargo recorrente', desconto: 'Desconto recorrente',
  unico: 'Item único (só este mês)', credito: 'Crédito do proprietário', ajuste: 'Diferença',
}

// Linhas que não são itens: totais, subtotais, saldo, pagamento.
const NAO_ITEM = /^(sub ?total|total|valor (total|pago|liquido|a pagar)|pagamento efetuado|pago em|saldo|liquido)\b/
export const ehLinhaDeTotal = (desc) => NAO_ITEM.test(normalizarTexto(desc))

const nome = (desc) => normalizarTexto(padraoDaRegra(desc))
const palavras = (t) => t.split(/[^a-z0-9]+/).filter(p => p.length >= 4)
function nomeParecido(a, b) {
  const x = nome(a)
  const y = nome(b)
  if (!x || !y) return false
  if (x.startsWith(y) || y.startsWith(x)) return true
  const py = new Set(palavras(y))
  return palavras(x).some(p => py.has(p))
}
const ehBase = (desc) => /\baluguel\b|\blocacao\b|\bcontratual\b/.test(normalizarTexto(desc))
const ehBonificacao = (desc) => /\bbonific|\bdesconto (de )?pontualidade|\babono\b/.test(normalizarTexto(desc))

// Esperado da parcela, sem créditos: os itens base/bonificação/encargo/desconto da composição.
export const esperadoDaComposicao = (composicao) => (composicao?.itens || [])
  .filter(i => ['base', 'bonificacao', 'encargo', 'desconto'].includes(i.tipo))

// Créditos que podem ser ligados: a abater (aberto/previsto) do contrato, e os já compensados NESTE
// lançamento (reabrir a composição de um recibo já informado).
export const creditosLigaveis = (creditos, contratoId, txId = null) => (creditos || [])
  .filter(c => c.contrato_id === contratoId && (creditoAAbater(c) || (txId && c.status === 'compensado' && c.compensado_em_lancamento_id === txId)))

function sugerirCredito(item, livres) {
  const v = Math.abs(item.valor)
  const porValor = livres.filter(c => igual(c.valor, v))
  const porNome = (lista) => lista.find(c => [c.descricao, ...(c.itens || []).map(i => i.desc)].some(d => d && nomeParecido(item.desc, d)))
  return porNome(porValor) || porValor[0] || porNome(livres) || null
}

// lidos: [{ desc, valor (com sinal) }]; esperados: esperadoDaComposicao(...); creditos: creditosLigaveis
// → [{ desc, valor, tipo, encargo_id?, esperado?, difere?, credito_id?, sugestao? ('ligar'|'manual'|'unico') }]
export function classificarRecibo(lidos, { esperados = [], creditos = [] } = {}) {
  const usados = new Set()
  const creditosUsados = new Set()
  const out = []
  for (const l of lidos || []) {
    const valor = r2(l.valor)
    if (!valor || ehLinhaDeTotal(l.desc)) continue
    const livres = esperados.map((e, i) => ({ e, i })).filter(({ e, i }) => !usados.has(i) && Math.sign(e.valor) === Math.sign(valor))
    const casa = livres.find(({ e }) => (e.tipo === 'base' ? ehBase(l.desc) : e.tipo === 'bonificacao' ? ehBonificacao(l.desc) : nomeParecido(l.desc, e.desc)))
      || livres.find(({ e }) => igual(e.valor, valor))
    if (casa) {
      usados.add(casa.i)
      out.push({
        desc: l.desc, valor, tipo: casa.e.tipo, encargo_id: casa.e.encargo_id ?? null, esperado: r2(casa.e.valor),
        difere: !igual(casa.e.valor, valor),
      })
      continue
    }
    if (valor < 0) {
      const c = sugerirCredito({ desc: l.desc, valor }, creditos.filter(x => !creditosUsados.has(x.id)))
      if (c) {
        creditosUsados.add(c.id)
        out.push({ desc: l.desc, valor, tipo: 'credito', credito_id: c.id, sugestao: 'ligar' })
        continue
      }
    }
    out.push({ desc: l.desc, valor, tipo: 'unico', sugestao: 'unico' })
  }
  return out
}

// Itens do recibo → composição da parcela (substitui a prevista). meta: { numero, total_parcelas,
// ciclo, base } da composição anterior; recibo: { referencia, vencimento, data_pagamento, valor_pago }.
export function composicaoDoRecibo(itens, { meta = {}, recibo = null } = {}) {
  const lista = (itens || []).map(i => ({
    tipo: i.tipo, desc: i.desc, valor: r2(i.valor),
    ...(i.encargo_id ? { encargo_id: i.encargo_id } : {}),
    ...(i.credito_id ? { credito_id: i.credito_id } : {}),
    ...(i.previsto ? { previsto: true } : {}),
  }))
  const total = r2(lista.reduce((a, i) => a + i.valor, 0))
  const { numero = null, total_parcelas = null, ciclo, base } = meta || {}
  return {
    tipo: 'aluguel', itens: lista, total, informada: true, numero, total_parcelas,
    ...(ciclo != null ? { ciclo } : {}), ...(base != null ? { base } : {}),
    ...(recibo ? { recibo } : {}),
  }
}

// Validação antes de gravar: soma = alvo (total do recibo / valor pago), crédito ligado uma vez só.
export function validarRecibo(itens, alvo) {
  if (!itens?.length) return 'Informe os itens do recibo.'
  const ids = itens.filter(i => i.tipo === 'credito' && i.credito_id).map(i => i.credito_id)
  if (new Set(ids).size !== ids.length) return 'O mesmo crédito foi ligado a dois itens. Cada crédito só pode ser abatido uma vez.'
  const soma = r2(itens.reduce((a, i) => a + (Number(i.valor) || 0), 0))
  if (alvo != null && !igual(soma, alvo)) return `A soma dos itens (${soma.toFixed(2).replace('.', ',')}) precisa ser igual ao total (${r2(alvo).toFixed(2).replace('.', ',')}).`
  return null
}

// Recibo de aluguel lido (servidor) → { referencia, vencimento, data_pagamento, valor_pago, total, itens }.
// Débito = +, crédito = − (o sinal vem da coluna); total/subtotal/"PAGAMENTO EFETUADO" ficam de fora.
export function normalizarLeituraRecibo(l) {
  const itens = (Array.isArray(l?.itens) ? l.itens : [])
    .map(i => {
      const v = Math.abs(Number(i?.valor))
      const credito = String(i?.natureza || i?.tipo || '').toLowerCase().startsWith('c')
      return { desc: String(i?.desc ?? i?.descricao ?? '').trim() || 'Item sem descrição', valor: r2(credito ? -v : v) }
    })
    .filter(i => Number.isFinite(i.valor) && i.valor !== 0 && !ehLinhaDeTotal(i.desc))
  const num = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? r2(x) : null)
  const data = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? x : null)
  return {
    referencia: typeof l?.referencia === 'string' ? l.referencia.trim().slice(0, 40) || null : null,
    vencimento: data(l?.vencimento), data_pagamento: data(l?.data_pagamento),
    valor_pago: num(l?.valor_pago), total: num(l?.total) ?? num(l?.valor_pago), itens,
  }
}
