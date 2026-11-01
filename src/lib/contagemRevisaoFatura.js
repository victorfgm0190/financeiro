// Importar Fatura → Cartão de Crédito → etapa 2 "Revisar lançamentos": a CONTAGEM ÚNICA da tela e
// os agrupamentos só de apresentação (abas, conferência da fatura, estornos de centavos).
//
// Antes, cada pedaço da tela contava de um jeito e os números não batiam entre si:
//   • "N já existem" (barra de resumo) = só `_isDuplicate` — deixava de fora as parcelas "No banco ↻"
//     (colisão de parcela, que vira UPDATE);
//   • "N já existem" (resumo da revisão) = `_isDuplicate` + colisões + já lançados, menos os "com
//     valor diferente" → 149 × 154;
//   • "Pendentes (N)" (filtro) = tudo que não estava conciliado: novos + possíveis duplicatas +
//     desmarcadas + colisões com diferença + avisos "Também em" — não eram os N "serão importados"
//     (linhasAImportar) → 12 × 16.
// Agora cada linha cai em UMA situação, e cartões, abas e o botão Confirmar leem daqui:
//   total = importar + conciliados + decisão + desmarcados.
// NADA aqui decide o casamento nem o que é gravado: `importar` é exatamente linhasAImportar (o que
// a confirmação insere — o teste confere). PURO.
import { valorComSinal } from './revisaoImportacao.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const SITUACAO = {
  IMPORTAR: 'importar',     // a confirmação INSERE (linhasAImportar)
  CONCILIADO: 'conciliado', // já no Finup: "Já existe", já lançado, "No banco ✓/↻", "É o mesmo"
  DECISAO: 'decisao',       // fica de fora até o usuário escolher
  DESMARCADO: 'desmarcado', // desmarcada, sem correspondência no Finup: não será importada
}

// Pede escolha do usuário e, sem ela, NÃO é gravada:
//   • "Para escolher" / "Parecido — é este?" (candidatos do cartão, sem escolha);
//   • possível duplicata ainda desmarcada (nem "importar mesmo assim", nem "é o mesmo").
export function precisaDecisao(r) {
  if (r._jaLancadoOpcoes && !r._jaLancadoEscolha) return true
  return r._dupLevel === 'possivel' && !r.selected && !r._mesmoConfirmado && !r._collisionTx
}

export function situacaoLinha(r) {
  if (r.selected && !r._isDuplicate && !r._collisionTx) return SITUACAO.IMPORTAR
  if (r._isDuplicate || r._collisionTx) return SITUACAO.CONCILIADO
  if (precisaDecisao(r)) return SITUACAO.DECISAO
  return SITUACAO.DESMARCADO
}

// A contagem da tela. Valores com o sinal da fatura (estorno negativo), como o "Total do arquivo".
export function contarRevisaoFatura(rows) {
  const linhas = rows || []
  const zero = () => ({ qtd: 0, valor: 0 })
  const c = { total: linhas.length, arquivo: zero(), importar: zero(), conciliados: zero(), decisao: zero(), desmarcados: zero() }
  const chave = { importar: 'importar', conciliado: 'conciliados', decisao: 'decisao', desmarcado: 'desmarcados' }
  for (const r of linhas) {
    const v = valorComSinal(r)
    const k = chave[situacaoLinha(r)]
    c[k].qtd++
    c[k].valor += v
    c.arquivo.qtd++
    c.arquivo.valor += v
  }
  for (const k of ['arquivo', 'importar', 'conciliados', 'decisao', 'desmarcados']) c[k].valor = r2(c[k].valor)
  return c
}

// ── Abas ─────────────────────────────────────────────────────────────────────────────────────────
export const ABAS_REVISAO = [
  { id: 'importar', rotulo: 'Para importar', conta: (c) => c.importar.qtd },
  { id: 'decisao', rotulo: 'Precisam de decisão', conta: (c) => c.decisao.qtd },
  { id: 'conciliados', rotulo: 'Já conciliados', conta: (c) => c.conciliados.qtd },
  { id: 'todos', rotulo: 'Todos', conta: (c) => c.total },
]

export const abaInicial = (contagem) => (contagem.decisao.qtd > 0 ? 'decisao' : 'importar')

// Linhas de cada aba. "Para importar" mostra as marcadas e, separadas no fim, as desmarcadas (para
// poder marcar de novo); a contagem da aba é só a das marcadas. → { linhas, desmarcadas }
export function linhasDaAba(rows, aba) {
  const linhas = rows || []
  const de = (s) => linhas.filter(r => situacaoLinha(r) === s)
  if (aba === 'importar') return { linhas: de(SITUACAO.IMPORTAR), desmarcadas: de(SITUACAO.DESMARCADO) }
  if (aba === 'decisao') return { linhas: de(SITUACAO.DECISAO), desmarcadas: [] }
  if (aba === 'conciliados') return { linhas: de(SITUACAO.CONCILIADO), desmarcadas: [] }
  return { linhas, desmarcadas: [] }
}

// ── Estornos de centavos ─────────────────────────────────────────────────────────────────────────
export const LIMITE_CENTAVOS = 1

const ehEstornoCentavos = (r) => (r.type || 'expense') === 'income' && Math.abs(Number(r.amount) || 0) < LIMITE_CENTAVOS

// Estornos/créditos de valor absoluto < R$ 1,00 com a MESMA categoria viram um item de grupo
// (2 ou mais), na posição do primeiro. → [{ tipo: 'linha', row } | { tipo: 'grupo', chave, rows, total }]
export function agruparEstornosCentavos(rows) {
  const porCat = new Map()
  for (const r of rows || []) {
    if (!ehEstornoCentavos(r)) continue
    const k = r.categoryId || ''
    if (!porCat.has(k)) porCat.set(k, [])
    porCat.get(k).push(r)
  }
  const grupos = new Map()
  for (const [k, lista] of porCat) if (lista.length >= 2) grupos.set(k, lista)
  const out = []
  const emitidos = new Set()
  for (const r of rows || []) {
    const k = r.categoryId || ''
    if (ehEstornoCentavos(r) && grupos.has(k)) {
      if (emitidos.has(k)) continue
      emitidos.add(k)
      const lista = grupos.get(k)
      out.push({ tipo: 'grupo', chave: `centavos:${k}`, rows: lista, total: r2(lista.reduce((s, x) => s + valorComSinal(x), 0)) })
      continue
    }
    out.push({ tipo: 'linha', row: r })
  }
  return out
}

// ── Conferência da fatura ────────────────────────────────────────────────────────────────────────
// Grupos por motivo, a partir de projetarTotalFatura (lib/revisaoImportacao). Cada item já traz o
// seu efeito na diferença (arquivo − Finup); a soma dos subtotais é a diferença explicada.
const MOTIVOS = [
  { tipo: 'so_no_banco', titulo: 'Gravado no Finup, ainda não veio no arquivo' },
  { tipo: 'aguardando_banco', titulo: 'Parcelas previstas aguardando lançamento do banco' },
  { tipo: 'valor_diferente', titulo: 'Diferença de centavos entre Finup e arquivo', tituloValor: 'Diferença de valor entre Finup e arquivo' },
  { tipo: 'linha_fora', titulo: 'Linhas desmarcadas, não serão importadas' },
  { tipo: 'outra_fatura', titulo: 'Linhas que vão para outra fatura' },
]

export function conferenciaDaFatura(projecao, tolerancia = 0.01) {
  if (!projecao) return null
  const itens = projecao.itens || []
  const grupos = []
  for (const m of MOTIVOS) {
    const lista = itens.filter(i => i.tipo === m.tipo)
    if (!lista.length) continue
    // Diferença de valor ≥ R$ 1,00 não é "de centavos": o título diz o que é.
    const titulo = m.tituloValor && lista.some(i => Math.abs(i.valor) >= 1) ? m.tituloValor : m.titulo
    grupos.push({ tipo: m.tipo, titulo, itens: lista, qtd: lista.length, subtotal: r2(lista.reduce((s, i) => s + i.valor, 0)) })
  }
  const outros = itens.filter(i => !MOTIVOS.some(m => m.tipo === i.tipo))
  if (outros.length) grupos.push({ tipo: 'outros', titulo: 'Outros', itens: outros, qtd: outros.length, subtotal: r2(outros.reduce((s, i) => s + i.valor, 0)) })
  const diferenca = r2(projecao.arquivo - projecao.projetado)
  const explicada = r2(grupos.reduce((s, g) => s + g.subtotal, 0))
  const semExplicacao = r2(diferenca - explicada)
  return {
    diferenca, explicada, semExplicacao, grupos,
    qtdItens: itens.length,
    totalmenteExplicada: Math.abs(semExplicacao) <= tolerancia,
    semDiferenca: Math.abs(diferenca) <= tolerancia && itens.length === 0,
  }
}

// Painel aberto/fechado lembrado por ambiente e usuário (localStorage, try/catch).
const chavePainel = (sessao) => `finup_conferencia_fatura_aberta_${String(sessao?.ambSigla || 'vm').toLowerCase()}_${sessao?.id || 'anon'}`
export function lerConferenciaAberta(sessao, storage = globalThis.localStorage) {
  try {
    const v = storage?.getItem(chavePainel(sessao))
    return v === '1' ? true : v === '0' ? false : null
  } catch { return null }
}
export function lembrarConferenciaAberta(sessao, aberta, storage = globalThis.localStorage) {
  try { storage?.setItem(chavePainel(sessao), aberta ? '1' : '0') } catch { /* sem storage: não lembra */ }
}

// ── Descrição ────────────────────────────────────────────────────────────────────────────────────
// Extratos de cartão costumam trazer o estabelecimento e, depois de vários espaços, a cidade/sufixo
// ("PADARIA X        SAO PAULO"). Só separa nesse caso (2+ espaços seguidos); o resto fica inteiro.
export function separarSufixo(descricao) {
  const s = String(descricao || '')
  const m = s.match(/^(.*?\S)\s{2,}(\S.*)$/)
  if (!m) return { principal: s.trim(), sufixo: '' }
  return { principal: m[1].trim(), sufixo: m[2].replace(/\s{2,}/g, ' ').trim() }
}

// "AAAA-MM" → "MM/AAAA"
export const rotuloFatura = (my) => (my ? my.split('-').reverse().join('/') : '—')
