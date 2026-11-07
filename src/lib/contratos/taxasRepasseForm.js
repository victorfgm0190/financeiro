// Formulário das taxas da administradora (tarifa fixa e taxa única) no cadastro do contrato a receber
// por administradora: o formulário guarda texto (valores no padrão BR); aqui a conversão e a validação.
import { parseValorBR, valorBRFormatado } from '../valorBR.js'
import { conferirTaxaUnica, dedutivelPadrao } from './composicaoRepasse.js'

const YM = /^\d{4}-(0[1-9]|1[0-2])$/
const num = (v) => { const n = parseValorBR(v); return Number.isFinite(n) ? n : null }
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

export const TIPOS_TAXA = { tarifa_fixa: 'Tarifa / taxa fixa (todo mês)', taxa_unica: 'Taxa única em parcelas' }

export const novaTaxaForm = (tipo = 'tarifa_fixa', vigencia_inicio = '') => ({
  id: null, tipo_repasse: tipo, descricao: '', valor: '', vigencia_inicio, vigencia_fim: '', parcelas: '',
  categoria_id: '', dedutivel_ir: dedutivelPadrao(tipo === 'taxa_unica' ? 'taxa_unica' : 'tarifa'),
})

// Taxa do contrato (contrato.itens_repasse) → linha do formulário.
export const taxaParaForm = (t) => ({
  id: t.id || null, tipo_repasse: t.tipo_repasse, descricao: t.descricao || '', valor: valorBRFormatado(t.valor),
  vigencia_inicio: t.vigencia_inicio || '', vigencia_fim: t.vigencia_fim || '',
  parcelas: (t.valores_parcelas || []).map(valorBRFormatado).join('; '),
  categoria_id: t.categoria_id || '', dedutivel_ir: t.dedutivel_ir ?? dedutivelPadrao(t.tipo_repasse === 'taxa_unica' ? 'taxa_unica' : 'tarifa'),
})

// "470,00; 865,00; 865,00" → [470, 865, 865] (null se algum valor for inválido).
export function parcelasDoTexto(txt) {
  const partes = String(txt || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean)
  const valores = partes.map(num)
  return valores.some(v => !(v > 0)) ? null : valores.map(r2)
}

// Linha do formulário → taxa (o formato de contrato.itens_repasse). Linha vazia → null.
export function formParaTaxa(l, i = 0) {
  if (!String(l.descricao || '').trim() && !String(l.valor || '').trim()) return null
  const unica = l.tipo_repasse === 'taxa_unica'
  return {
    id: l.id || `nova-${i}`, tipo_repasse: l.tipo_repasse, descricao: String(l.descricao || '').trim(), valor: r2(num(l.valor)),
    valores_parcelas: unica ? parcelasDoTexto(l.parcelas) || [] : null,
    vigencia_inicio: l.vigencia_inicio || null, vigencia_fim: unica ? null : l.vigencia_fim || null,
    categoria_id: l.categoria_id || null, dedutivel_ir: !!l.dedutivel_ir, ativo: true,
  }
}

// Erro que impede gravar (texto) ou ''. A soma das parcelas diferente do total é só AVISO (avisoTaxa).
export function erroTaxa(l) {
  const nome = String(l.descricao || '').trim() || 'sem descrição'
  if (!String(l.descricao || '').trim()) return 'Taxa da administradora sem descrição.'
  if (!(num(l.valor) > 0)) return `Taxa "${nome}": informe o valor${l.tipo_repasse === 'taxa_unica' ? ' total' : ''}.`
  if (!YM.test(String(l.vigencia_inicio || ''))) return `Taxa "${nome}": informe a competência ${l.tipo_repasse === 'taxa_unica' ? 'da 1ª parcela' : 'inicial'}.`
  if (l.tipo_repasse === 'tarifa_fixa' && l.vigencia_fim && (!YM.test(l.vigencia_fim) || l.vigencia_fim < l.vigencia_inicio)) return `Taxa "${nome}": competência final inválida.`
  if (l.tipo_repasse === 'taxa_unica') {
    const v = parcelasDoTexto(l.parcelas)
    if (!v || !v.length) return `Taxa "${nome}": informe o valor de cada parcela (ex.: 470,00; 865,00; 865,00).`
    if (v.length > 120) return `Taxa "${nome}": no máximo 120 parcelas.`
  }
  return ''
}

export function avisoTaxa(l) {
  if (l.tipo_repasse !== 'taxa_unica') return ''
  const v = parcelasDoTexto(l.parcelas)
  if (!v?.length) return ''
  const c = conferirTaxaUnica({ valor: num(l.valor), valores_parcelas: v })
  return c ? `A soma das parcelas (${valorBRFormatado(c.soma)}) não bate com o total (${valorBRFormatado(c.total)}).` : ''
}

// Taxa → item da API (contrato_itens com tipo_repasse).
export const taxaParaItem = (t) => ({
  descricao: t.descricao, grupo: 'outro', responsavel: 'proprietario', valor_previsto: t.valor, categoria_id: t.categoria_id || null,
  ativo: t.ativo !== false, tipo_repasse: t.tipo_repasse, valores_parcelas: t.valores_parcelas, vigencia_inicio: t.vigencia_inicio,
  vigencia_fim: t.vigencia_fim, dedutivel_ir: !!t.dedutivel_ir,
})

// Chave para comparar listas de taxas (o aditivo só vê mudança se algo mudou de verdade).
export const chaveTaxas = (lista) => JSON.stringify((lista || []).map(t => [t.tipo_repasse, t.descricao, r2(t.valor), (t.valores_parcelas || []).map(r2),
  t.vigencia_inicio || null, t.vigencia_fim || null, t.categoria_id || null, !!t.dedutivel_ir]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
