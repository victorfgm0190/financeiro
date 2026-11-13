// SUGESTÕES DO ASSISTENTE NA IMPORTAR FATURA (Etapa 6c) — partes PURAS da rota api/ia-importacao.js:
// prompt, ferramenta (saída forçada, strict), catálogo com ÍNDICES LOCAIS (nenhum id interno sai do
// Finup), limpeza das descrições, pré-filtro de favorecidos e a volta dos índices para ids.
//
// O que sai para a IA (LGPD, dados mínimos): descrição, valor, data, parcela e tipo de cada linha;
// descrição, valor, data, parcela e origem dos candidatos; NOMES de categorias, grupos (só com o
// controle gerencial ligado) e até 5 favorecidos parecidos por linha. Nunca: ids, conta, cartão,
// perfil, titular, CPF/CNPJ, e-mail, saldo. Números longos (terminal, final de cartão) e o que tem
// cara de CPF/CNPJ são tirados das descrições.
import { descSimilarity } from '../src/lib/conciliacaoMatch.js'

export const MODELO_SUGESTAO = 'claude-haiku-5-5'
export const FERRAMENTA_SUGESTAO = 'sugerir'
export const MAX_ITENS = 40
export const MAX_FAVORECIDOS_POR_LINHA = 5
export const PRAZO_MS = 10_000

export const INSTRUCOES_SUGESTAO = `Você ajuda a revisar a fatura de cartão de crédito de um usuário do Finup, um app brasileiro de controle financeiro.
Recebe itens da fatura e responde SEMPRE chamando a ferramenta "sugerir", com um elemento por item recebido.
1. Item "pergunta": a linha da fatura e de 1 a 3 lançamentos que já estão no Finup (candidatos).
   Sugira decisao "mesmo" (e o índice do candidato) quando a linha é aquele lançamento, ou "novo" quando é outra compra.
   Compare loja, valor, data e parcela; descrições do banco e do usuário costumam ser escritas de jeitos diferentes.
   Na dúvida, confianca "baixa".
2. Item "novo": sugira a categoria (o índice de UMA categoria da lista, do mesmo tipo da linha: despesa ou receita),
   o grupo (o índice de um grupo, só se a lista de grupos vier) e o favorecido (o índice de um dos favorecidos listados
   na própria linha, ou nenhum). Em "novo", decisao e candidato ficam vazios.
Nunca invente categoria, grupo, favorecido ou candidato fora das listas recebidas. Sem boa razão, deixe o campo vazio.
"motivo": uma frase curta em português, até 80 caracteres, sem repetir o valor.`

const anulavel = (schema) => ({ anyOf: [schema, { type: 'null' }] })
export const DEFINICAO_SUGESTAO = {
  name: FERRAMENTA_SUGESTAO,
  description: 'Devolve uma sugestão para cada item da fatura recebido.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['itens'],
    properties: {
      itens: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['item', 'decisao', 'candidato', 'categoria', 'grupo', 'favorecido', 'confianca', 'motivo'],
          properties: {
            item: { type: 'string', description: 'Índice do item recebido (ex.: "L1").' },
            decisao: anulavel({ type: 'string', enum: ['mesmo', 'novo'] }),
            candidato: anulavel({ type: 'string', description: 'Índice do candidato (a, b, c) quando decisao = "mesmo".' }),
            categoria: anulavel({ type: 'string', description: 'Índice da categoria (ex.: "c12").' }),
            grupo: anulavel({ type: 'string', description: 'Índice do grupo (ex.: "g2").' }),
            favorecido: anulavel({ type: 'integer', description: 'Posição do favorecido na lista da linha (0 = primeiro).' }),
            confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
            motivo: { type: 'string' },
          },
        },
      },
    },
  },
}

// Descrição sem números longos (terminal, final de cartão, CPF/CNPJ) — o resto como o banco escreveu.
export function limparDescricao(s) {
  return String(s || '')
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, ' ')            // CPF
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, ' ')     // CNPJ
    .replace(/\d{4,}/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 120)
}

// Até `n` nomes de favorecidos mais parecidos com a descrição (similaridade ≥ 0,4).
export function prefiltrarFavorecidos(descricao, nomes, n = MAX_FAVORECIDOS_POR_LINHA) {
  const d = limparDescricao(descricao)
  if (!d) return []
  return (nomes || [])
    .map(nome => ({ nome, s: descSimilarity(d, nome) }))
    .filter(x => x.s >= 0.4)
    .sort((a, b) => b.s - a.s || a.nome.localeCompare(b.nome))
    .slice(0, n)
    .map(x => x.nome)
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const data = (d) => (d ? String(d).slice(0, 10) : null)
const LETRAS = ['a', 'b', 'c']

// Pedido do app ({ itens, perfilId }) + cadastros do banco → { mensagem (o JSON que vai para a IA),
// mapas (índice → id, só no servidor) }. Itens além de MAX_ITENS são ignorados.
//   item do app: { linhaId, tipo: 'pergunta'|'novo', despesa, descricao, valor, data, parcela,
//                  candidatos?: [{ id, descricao, valor, data, parcela, origem }] }
//   categorias: [{ id, name, type, category_group, perfil_ids }]; grupos: [{ id, name }] | null
export function montarPedido({ itens, perfilId = null, fatura = null }, { categorias = [], grupos = null, favorecidos = [] }) {
  const doPerfil = (c) => !perfilId || !Array.isArray(c.perfil_ids) || !c.perfil_ids.length || c.perfil_ids.includes(perfilId)
  const cats = categorias.filter(c => (c.type === 'expense' || c.type === 'income') && doPerfil(c))
    .sort((a, b) => String(a.category_group || '').localeCompare(String(b.category_group || '')) || String(a.name).localeCompare(String(b.name)))
  const mapas = { linhas: {}, candidatos: {}, categorias: {}, grupos: {}, favorecidos: {}, tipoCategoria: {} }
  const categoriasMsg = cats.map((c, i) => {
    const k = `c${i + 1}`
    mapas.categorias[k] = c.id
    mapas.tipoCategoria[k] = c.type
    return { i: k, nome: c.category_group ? `${c.category_group} › ${c.name}` : c.name, tipo: c.type === 'income' ? 'receita' : 'despesa' }
  })
  const gruposMsg = grupos ? grupos.map((g, i) => { const k = `g${i + 1}`; mapas.grupos[k] = g.id; return { i: k, nome: g.name } }) : null
  const nomesFav = favorecidos.map(f => f.name || f).filter(Boolean)
  const itensMsg = (itens || []).slice(0, MAX_ITENS).map((it, i) => {
    const k = `L${i + 1}`
    mapas.linhas[k] = { linhaId: it.linhaId, tipo: it.tipo, despesa: it.despesa !== false }
    const base = {
      item: k, tipo: it.tipo === 'pergunta' ? 'pergunta' : 'novo', despesa: it.despesa !== false,
      fatura_linha: { descricao: limparDescricao(it.descricao), valor: r2(it.valor), data: data(it.data), parcela: it.parcela || null },
    }
    if (base.tipo === 'pergunta') {
      mapas.candidatos[k] = {}
      base.candidatos = (it.candidatos || []).slice(0, 3).map((c, j) => {
        mapas.candidatos[k][LETRAS[j]] = c.id
        return { i: LETRAS[j], descricao: limparDescricao(c.descricao), valor: r2(c.valor), data: data(c.data), parcela: c.parcela || null, origem: c.origem || null }
      })
    } else {
      const lista = prefiltrarFavorecidos(it.descricao, nomesFav)
      mapas.favorecidos[k] = lista
      base.favorecidos = lista
    }
    return base
  })
  const mensagem = { fatura, categorias: categoriasMsg, ...(gruposMsg ? { grupos: gruposMsg } : {}), itens: itensMsg }
  return { mensagem, mapas }
}

// Resposta da ferramenta → { sugestoes: [formato de src/lib/sugestaoAssistente.js], descartados: [{ item, motivo }] }.
// Confere índice por índice; o que não existe nas listas enviadas é descartado (a tela valida de novo).
export function interpretarResposta(input, mapas) {
  const sugestoes = []
  const descartados = []
  const vistos = new Set()
  for (const x of Array.isArray(input?.itens) ? input.itens : []) {
    const linha = mapas.linhas[x?.item]
    if (!linha) { descartados.push({ item: x?.item, motivo: 'item desconhecido' }); continue }
    if (vistos.has(x.item)) { descartados.push({ item: x.item, motivo: 'item repetido' }); continue }
    vistos.add(x.item)
    const s = { linhaId: linha.linhaId, decisao: null, candidatoId: null, categoriaId: null, grupoId: null, favorecido: null,
      confianca: x.confianca, motivo: String(x.motivo || '').trim().slice(0, 140) }
    if (linha.tipo === 'pergunta') {
      if (x.decisao === 'mesmo') {
        const id = mapas.candidatos[x.item]?.[x.candidato]
        if (!id) { descartados.push({ item: x.item, motivo: 'candidato fora da lista' }); continue }
        s.decisao = 'mesmo'; s.candidatoId = id
      } else if (x.decisao === 'novo') s.decisao = 'novo'
      else { descartados.push({ item: x.item, motivo: 'pergunta sem decisão' }); continue }
    } else {
      if (x.categoria != null) {
        const id = mapas.categorias[x.categoria]
        const tipoOk = mapas.tipoCategoria[x.categoria] === (linha.despesa ? 'expense' : 'income')
        if (id && tipoOk) s.categoriaId = id
        else descartados.push({ item: x.item, motivo: id ? 'categoria de outro tipo' : 'categoria fora da lista' })
      }
      if (x.grupo != null) {
        const id = mapas.grupos[x.grupo]
        if (id) s.grupoId = id
        else descartados.push({ item: x.item, motivo: 'grupo fora da lista' })
      }
      if (x.favorecido != null) {
        const nome = mapas.favorecidos[x.item]?.[x.favorecido]
        if (nome) s.favorecido = nome
        else descartados.push({ item: x.item, motivo: 'favorecido fora da lista' })
      }
      if (!s.categoriaId && !s.grupoId && !s.favorecido) continue
    }
    sugestoes.push(s)
  }
  return { sugestoes, descartados }
}
