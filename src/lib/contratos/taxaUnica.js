// TAXA ÚNICA da administradora (ex.: intermediação) — funções puras.
// Forma de desconto (guardada só como valores_parcelas; a forma é deduzida deles):
//   uma_vez  → [total]                       (padrão: tudo na competência da 1ª parcela)
//   iguais   → total ÷ N, centavos na última (2.200 em 3 = 733,33 + 733,33 + 733,34)
//   valores  → os valores informados          (ex.: 470; 865; 865)
// SALDO A DESCONTAR: o Finup projeta sozinho e o extrato só ajusta. Em cada competência conferida
// (ou fechada) vale o que foi descontado de verdade; nas demais, o que falta é projetado pela forma
// escolhida até zerar — o acumulado previsto até a competência menos o já descontado.
//   Ex.: 2.200 "de uma vez"; extrato de 02 traz 470 → 03 projeta 1.730; 03 traz 865 → 04 projeta 865.
import { mesesEntre } from './datas.js'

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const ZERO = 0.005

export const FORMAS_TAXA_UNICA = {
  uma_vez: 'De uma vez',
  iguais: 'Em N parcelas iguais',
  valores: 'Valores informados',
}

// total em n parcelas mensais iguais; os centavos que sobram vão na última.
export function parcelasIguais(total, n) {
  const t = r2(total)
  const q = Math.floor(Number(n) || 0)
  if (!(t > 0) || !(q >= 1)) return []
  const base = Math.floor((t / q) * 100) / 100
  const out = Array.from({ length: q }, () => base)
  out[q - 1] = r2(t - base * (q - 1))
  return out
}

const iguaisA = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(r2(x) - r2(b[i])) < ZERO)

// { forma, n } da taxa pelos valores gravados (vazio também = de uma vez).
export function formaDaTaxa(item) {
  const v = Array.isArray(item?.valores_parcelas) ? item.valores_parcelas.map(r2) : []
  const total = r2(item?.valor ?? item?.valor_previsto)
  if (!v.length || (v.length === 1 && Math.abs(v[0] - total) < ZERO)) return { forma: 'uma_vez', n: 1 }
  if (v.length > 1 && iguaisA(v, parcelasIguais(total, v.length))) return { forma: 'iguais', n: v.length }
  return { forma: 'valores', n: v.length }
}

// Valores das parcelas pela forma.
export function valoresDaForma(total, forma, { n = 1, valores = null } = {}) {
  if (forma === 'iguais') return parcelasIguais(total, n)
  if (forma === 'valores') return (valores || []).map(r2).filter(x => x > 0)
  return r2(total) > 0 ? [r2(total)] : []
}

// Plano da taxa (valores por k a partir da 1ª competência) e o total.
function planoDaTaxa(item) {
  const v = Array.isArray(item?.valores_parcelas) && item.valores_parcelas.length ? item.valores_parcelas.map(r2) : null
  const total = r2(item?.valor ?? item?.valor_previsto) || (v ? r2(v.reduce((a, x) => a + x, 0)) : 0)
  return { plano: v || (total > 0 ? [total] : []), total }
}
const acumulado = (plano, k) => r2(plano.slice(0, Math.min(k + 1, plano.length)).reduce((a, x) => a + x, 0))

// Valor (positivo) que a competência gravada já descontou da taxa: itens taxa_unica ligados a ela
// (taxa_id, ou a chave automática taxa_unica:<id>).
export function descontadoNaLinha(linha, id) {
  return r2(-(linha?.itens || [])
    .filter(i => i.tipo === 'taxa_unica' && (i.taxa_id === id || i.chave === `taxa_unica:${id}` || String(i.chave || '').startsWith(`taxa_unica:${id}:`)))
    .reduce((a, i) => a + (Number(i.valor) || 0), 0))
}

// Competência com a composição congelada: conferida pelo extrato ou fechada.
export const linhaCongelada = (linha) => !!linha && (linha.status === 'fechada' || !!linha.conferencia)

// Projeção das taxas únicas do contrato, competência a competência.
//   competencias: [{ competencia, cobrada, linha }] em ordem (cobrada = tem aluguel no mês).
// → { [taxaId]: { [competencia]: { valor, k, n, real, falta } } } — `valor` positivo (o que sai);
//   real = veio da composição gravada (conferida/fechada); falta = o que restava ANTES da competência.
export function projetarTaxasUnicas(contrato, competencias) {
  const out = {}
  for (const it of contrato?.itens_repasse || []) {
    if (it.tipo_repasse !== 'taxa_unica' || it.ativo === false || !it.vigencia_inicio) continue
    const { plano, total } = planoDaTaxa(it)
    if (!(total > 0)) continue
    const porComp = {}
    let descontado = 0
    for (const c of competencias || []) {
      const k = mesesEntre(it.vigencia_inicio, c.competencia)
      if (k < 0) continue
      const falta = r2(total - descontado)
      if (linhaCongelada(c.linha)) {
        const real = descontadoNaLinha(c.linha, it.id)
        if (real > ZERO) porComp[c.competencia] = { valor: real, k, n: plano.length, real: true, falta }
        descontado = r2(descontado + real)
        continue
      }
      if (!c.cobrada || falta <= ZERO) continue
      // Informado à mão numa competência aberta: vale o informado.
      const salvo = (c.linha?.itens || []).find(i => i.origem === 'auto' && i.chave === `taxa_unica:${it.id}` && i.informado)
      const valor = salvo ? r2(-Number(salvo.valor)) : r2(Math.min(falta, Math.max(0, acumulado(plano, k) - descontado)))
      if (valor > ZERO) porComp[c.competencia] = { valor, k, n: plano.length, real: false, falta }
      descontado = r2(descontado + valor)
    }
    out[it.id] = porComp
  }
  return out
}

// Saldo a descontar de cada taxa única ANTES de `competencia` (só o que já foi descontado de verdade
// ou projetado nas anteriores): { [taxaId]: { total, descontado, falta } }.
export function saldoTaxasUnicas(contrato, competencias, competencia) {
  const proj = projetarTaxasUnicas(contrato, competencias)
  const out = {}
  for (const it of contrato?.itens_repasse || []) {
    if (!proj[it.id]) continue
    const { total } = planoDaTaxa(it)
    const antes = Object.entries(proj[it.id]).filter(([c]) => c < competencia).reduce((a, [, p]) => a + p.valor, 0)
    out[it.id] = { total, descontado: r2(antes), falta: r2(Math.max(0, total - antes)) }
  }
  return out
}

// Descrição do item na competência: "Intermediação 2/3" no plano; fora dele, "(saldo a descontar)".
export function descricaoTaxaUnica(item, p) {
  const { plano } = planoDaTaxa(item)
  if (plano.length > 1 && p.k < plano.length && Math.abs(plano[p.k] - p.valor) < ZERO) return `${item.descricao} ${p.k + 1}/${plano.length}`
  if (plano.length === 1 && p.k === 0) return item.descricao
  return `${item.descricao} (saldo a descontar)`
}
