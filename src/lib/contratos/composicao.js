// COMPOSIÇÃO DO BOLETO DO CONDOMÍNIO — funções puras.
// Um pagamento = UM lançamento (P2); a conta fica em `composicao`. Itens do PROPRIETÁRIO (fundo de
// reserva, obras…) viram crédito a abater no aluguel; os do inquilino são a despesa real.
import { parseValorBR } from '../valorBR.js'
import { r2 } from './parcelas.js'

export const RESP = { INQUILINO: 'inquilino', PROPRIETARIO: 'proprietario' }

export const normalizarTexto = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim()

// ── Texto colado do app do condomínio ──────────────────────────────────────────────────────────
// Uma linha por item, valor no FIM: "Fundo de Reserva 79,10", "Taxa ... R$ 1.234,56", "(-) 10,00".
// Linha sem valor é o começo da descrição do item seguinte (descrição quebrada). Sinal só quando
// grudado no número ("-50,00") ou entre parênteses, antes do valor ou no começo da linha
// ("(-) Desconto 50,00"): "Mudança - 162,10" é positivo. Valores
// com 4 casas no meio da descrição ("8,9600") não são o valor do item. "Total …" vira o total.
const VALOR_NO_FIM = /(\(\s*[+-]\s*\)\s*|[+-](?=\d))?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(\s*\(\s*-\s*\))?\s*$/
const LIMPA_FIM = /[\s.:;|=\-–—]*(?:R\$)?[\s.:;|=\-–—]*$/
const SINAL_NO_INICIO = /^\(\s*([+-])\s*\)\s*/

export function parsearTextoBoleto(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.replace(/\t/g, ' ').trim()).filter(Boolean)
  const itens = []
  const ignoradas = []
  let total = null
  let pendente = ''
  for (const linha of linhas) {
    const m = VALOR_NO_FIM.exec(linha)
    if (!m) { pendente = pendente ? `${pendente} ${linha}` : linha; continue }
    let desc = `${pendente} ${linha.slice(0, m.index)}`.replace(LIMPA_FIM, '').replace(/\s+/g, ' ').trim()
    pendente = ''
    const inicio = SINAL_NO_INICIO.exec(desc)
    if (inicio) desc = desc.slice(inicio[0].length).trim()
    const negativo = /-/.test(m[1] || '') || /-/.test(m[3] || '') || inicio?.[1] === '-'
    const valor = r2((negativo ? -1 : 1) * parseValorBR(m[2]))
    if (/^(valor )?total\b/.test(normalizarTexto(desc))) { total = valor; continue }
    itens.push({ desc: desc || 'Item sem descrição', valor })
  }
  if (pendente) ignoradas.push(pendente)
  return { itens, total, ignoradas }
}

// ── Padrão estável para "Lembrar para os próximos" ────────────────────────────────────────────────
// O texto lido do boleto traz datas, quantidades e sinais que mudam todo mês ("Espaço Gourmet
// (20/09/2026- Espaço Gourmet Sex Sab Dom - 1) (+)"). A regra grava só o NOME do item ("Espaço
// Gourmet"), que casa ("começa com") no boleto seguinte: sem parênteses, o que vem depois de ":",
// datas, números e sinais. Sem nada que sobre, fica o texto original sem os sinais.
export function padraoDaRegra(desc) {
  const original = String(desc || '')
  let s = original.replace(/\([^)]*\)/g, ' ').replace(/\(.*$/, ' ')
  s = s.split(':')[0]
  s = s.replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, ' ')
  s = s.replace(/\d+(?:[.,]\d+)*/g, ' ')
  s = s.replace(/[+\-–—=*;,./|]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  if (s) return s
  return original.replace(/[()+\-–—]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Regras: quem paga cada item ────────────────────────────────────────────────────────────────
// Do contrato antes das globais; "começa com" antes de "contém"; padrão mais longo desempata.
export function regraDoItem(desc, regras, contratoId) {
  const d = normalizarTexto(desc)
  if (!d) return null
  const casa = (r) => {
    const p = normalizarTexto(r.padrao)
    return p && (r.tipo_match === 'comeca_com' ? d.startsWith(p) : d.includes(p))
  }
  const peso = (r) => (r.contrato_id && r.contrato_id === contratoId ? 2000 : 0) + (r.tipo_match === 'comeca_com' ? 1000 : 0) + normalizarTexto(r.padrao).length
  return (regras || []).filter(r => (!r.contrato_id || r.contrato_id === contratoId) && casa(r)).sort((a, b) => peso(b) - peso(a))[0] || null
}

// Responsável de cada item pela regra que casou. Item que o usuário já marcou à mão fica como está.
export function classificarItens(itens, regras, contratoId) {
  return (itens || []).map(i => {
    if (i.manual && i.responsavel) return i
    const r = regraDoItem(i.desc, regras, contratoId)
    return { ...i, responsavel: r ? r.responsavel : null, regra_id: r?.id || null, regra: r ? `${r.tipo_match === 'comeca_com' ? 'começa com' : 'contém'} "${r.padrao}"${r.contrato_id ? ' (contrato)' : ''}` : null }
  })
}

export function resumoItens(itens, valorPago = null) {
  const soma = (f) => r2((itens || []).filter(f).reduce((a, i) => a + (Number(i.valor) || 0), 0))
  const total = soma(() => true)
  return {
    total,
    inquilino: soma(i => i.responsavel === RESP.INQUILINO),
    proprietario: soma(i => i.responsavel === RESP.PROPRIETARIO),
    semDono: (itens || []).filter(i => !i.responsavel).length,
    diferenca: valorPago == null ? 0 : r2(Number(valorPago) - total),
  }
}

export const itemDiferenca = (diferenca) =>
  ({ desc: 'Diferença/arredondamento', valor: r2(diferenca), responsavel: RESP.INQUILINO, manual: true })

// Composição gravada no lançamento do condomínio. Item "Só neste boleto" (so_neste_boleto) gera
// crédito normalmente, mas não se repete na estimativa dos próximos.
export function composicaoCondominio(itens, { estimada = false } = {}) {
  const limpos = (itens || []).map(({ desc, valor, responsavel, regra, so_neste_boleto: unico }) =>
    ({ desc, valor: r2(valor), responsavel, ...(regra ? { regra } : {}), ...(unico ? { so_neste_boleto: true } : {}) }))
  const res = resumoItens(limpos)
  return { tipo: 'condominio', itens: limpos, total: res.total, proprietario: res.proprietario, inquilino: res.inquilino, ...(estimada ? { estimada: true } : {}) }
}

// Divide um item entre inquilino e proprietário: `valorProprietario` vai para o dono (mesmo texto,
// marcado à mão) e o resto fica com o inquilino. → [itemInquilino, itemProprietario] (sem o de 0).
export function dividirItem(item, valorProprietario) {
  const total = r2(item.valor)
  const dono = r2(Math.min(Math.max(Number(valorProprietario) || 0, 0), total))
  const meu = r2(total - dono)
  return [
    ...(meu ? [{ ...item, valor: meu, responsavel: RESP.INQUILINO, manual: true }] : []),
    ...(dono ? [{ ...item, valor: dono, responsavel: RESP.PROPRIETARIO, manual: true }] : []),
  ]
}

// Pagamento sem a composição informada (pulou o passo ou auto-registro): os itens do proprietário
// repetem a última composição conhecida e a diferença fica com o inquilino — "estimada, revisar".
// Item marcado "Só neste boleto" não se repete.
export function composicaoEstimada(valorPago, ultima) {
  const dono = (ultima?.itens || []).filter(i => i.responsavel === RESP.PROPRIETARIO && !i.so_neste_boleto)
  const somaDono = r2(dono.reduce((a, i) => a + Number(i.valor), 0))
  const usar = somaDono <= Number(valorPago) ? dono : []
  const resto = r2(Number(valorPago) - (usar.length ? somaDono : 0))
  return composicaoCondominio([
    { desc: 'Demais itens (estimado)', valor: resto, responsavel: RESP.INQUILINO },
    ...usar.map(i => ({ desc: i.desc, valor: i.valor, responsavel: RESP.PROPRIETARIO })),
  ], { estimada: true })
}

// Itens do proprietário → dados do crédito (contrato_creditos). `parcela.id` pode ser o id da
// parcela gerada ou "serie@data" (pagamento de série vinculada: a série é a parcela de origem).
export function creditoDaComposicao(composicao, { contratoId, tx, parcela }) {
  const itens = (composicao?.itens || []).filter(i => i.responsavel === RESP.PROPRIETARIO && Number(i.valor) > 0)
  const valor = r2(itens.reduce((a, i) => a + Number(i.valor), 0))
  if (!(valor > 0)) return null
  const dia = String(tx.date || '').slice(8, 10)
  const mes = String(tx.date || '').slice(5, 7)
  return {
    contrato_id: contratoId, origem_lancamento_id: tx.id, origem_agendamento_id: parcela?.id || null,
    itens: itens.map(i => ({ desc: i.desc, valor: r2(i.valor) })), descricao: `Condomínio ${dia}/${mes}`,
    valor, data_origem: tx.date, status: 'aberto',
  }
}
