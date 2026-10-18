import { descSimilarity } from '../conciliacaoMatch'
import { normalizar, indiceCategorias } from './comum'

// PRÉVIA da importação (antes de gravar). Para cada linha lida:
//   - erros (data/valor/descrição) → fica de fora, listada com o número da linha e o motivo;
//   - possível duplicado → desmarcada por padrão:
//       OFX: mesmo FITID já importado NESTA conta, ou repetido no próprio arquivo (exato);
//       planilha/CSV: mesma conta, mesma data e mesmo valor (com o sinal) e descrição parecida
//       (descSimilarity ≥ LIMIAR_DESCRICAO) — contra os lançamentos da conta E dentro do arquivo;
//   - categoria: rótulo/nome da lista → a categoria; senão o de-para salvo; senão a escolha feita
//     agora na prévia; senão "pendente" (grava sem categoria, a classificar). Vazia → sem categoria.
// Totais (entradas, saídas, resultado, quantidade, período) só das linhas marcadas.

export const LIMIAR_DESCRICAO = 0.6
export const SEM_CATEGORIA = '__sem__'
// Escolha "criar categoria nova": '__nova__:<nome>' (criada na hora de gravar).
export const PREFIXO_NOVA = '__nova__:'

export function montarPrevia({ formato, linhas = [], contaId, transacoes = [], categorias = [], depara = {}, escolhas = {}, selecao = {} }) {
  const idx = indiceCategorias(categorias)
  const existe = new Set(categorias.map(c => c.id))
  const daConta = transacoes.filter(t => t.accountId === contaId && (t.type === 'income' || t.type === 'expense'))
  const fitidsConta = new Set(daConta.map(t => t.fitid).filter(Boolean))
  const assinado = (t) => (t.type === 'expense' ? -1 : 1) * Math.abs(Number(t.amount) || 0)

  const itens = []
  const vistos = [] // válidas anteriores do arquivo (duplicado interno)
  const fitidsArquivo = new Map()
  for (const l of linhas) {
    const item = { ...l, tipo: l.valor < 0 ? 'expense' : 'income', valorAbs: Math.abs(l.valor || 0), duplicado: null }
    if (!l.erros?.length) {
      if (formato === 'ofx') {
        if (l.fitid && fitidsConta.has(l.fitid)) item.duplicado = 'Mesmo FITID já importado nesta conta'
        else if (l.fitid && fitidsArquivo.has(l.fitid)) item.duplicado = `FITID repetido no arquivo (transação ${fitidsArquivo.get(l.fitid)})`
        if (l.fitid && !fitidsArquivo.has(l.fitid)) fitidsArquivo.set(l.fitid, l.linha)
      } else {
        const igual = (d, v, desc) => d === l.data && Math.abs(v - l.valor) < 0.005 && descSimilarity(desc, l.descricao) >= LIMIAR_DESCRICAO
        const noBanco = daConta.find(t => igual(t.date, assinado(t), t.description))
        const noArquivo = vistos.find(v => igual(v.data, v.valor, v.descricao))
        if (noBanco) item.duplicado = `Parecido com lançamento já existente em ${noBanco.date.split('-').reverse().join('/')}: "${noBanco.description}"`
        else if (noArquivo) item.duplicado = `Parecido com a linha ${noArquivo.linha} do arquivo`
      }
      vistos.push(l)
    }
    // categoria
    const texto = String(l.categoria || '').trim()
    const chave = normalizar(texto)
    if (!chave) Object.assign(item, { categoriaId: null, categoriaStatus: 'sem' })
    else if (idx.has(chave)) Object.assign(item, { categoriaId: idx.get(chave), categoriaStatus: 'ok' })
    else if (depara[chave] && existe.has(depara[chave])) Object.assign(item, { categoriaId: depara[chave], categoriaStatus: 'depara' })
    else if (escolhas[chave]?.startsWith(PREFIXO_NOVA)) {
      Object.assign(item, { categoriaId: null, categoriaStatus: 'nova', novaCategoria: escolhas[chave].slice(PREFIXO_NOVA.length) })
    } else if (escolhas[chave]) {
      const id = escolhas[chave] === SEM_CATEGORIA ? null : escolhas[chave]
      Object.assign(item, { categoriaId: id, categoriaStatus: 'escolhida' })
    } else Object.assign(item, { categoriaId: null, categoriaStatus: 'pendente' })
    item.chaveCategoria = chave
    const chaveSel = String(l.linha)
    item.selecionado = !l.erros?.length && (chaveSel in selecao ? !!selecao[chaveSel] : !item.duplicado)
    itens.push(item)
  }

  const marcados = itens.filter(i => i.selecionado)
  const entradas = marcados.filter(i => i.tipo === 'income').reduce((s, i) => s + i.valorAbs, 0)
  const saidas = marcados.filter(i => i.tipo === 'expense').reduce((s, i) => s + i.valorAbs, 0)
  const datas = marcados.map(i => i.data).sort()
  // Categorias do arquivo sem correspondência (para escolher/criar), com quantas linhas usam.
  const pendentes = new Map()
  for (const i of itens) {
    if (i.erros?.length || !['pendente', 'escolhida', 'nova'].includes(i.categoriaStatus)) continue
    const p = pendentes.get(i.chaveCategoria) || { chave: i.chaveCategoria, texto: String(i.categoria).trim(), linhas: 0, escolha: escolhas[i.chaveCategoria] || null }
    p.linhas++
    pendentes.set(i.chaveCategoria, p)
  }
  const r2 = (n) => Math.round(n * 100) / 100
  return {
    itens,
    validas: itens.filter(i => !i.erros?.length),
    comErro: itens.filter(i => i.erros?.length),
    duplicados: itens.filter(i => i.duplicado),
    categoriasPendentes: [...pendentes.values()],
    totais: {
      qtd: marcados.length, entradas: r2(entradas), saidas: r2(saidas), resultado: r2(entradas - saidas),
      de: datas[0] || null, ate: datas.at(-1) || null,
    },
  }
}

// Itens marcados → objetos para o addTransaction (o app aplica saldo e regras de sempre).
// `idsNovas`: chave da categoria → id da categoria criada agora ("criar nova").
export function lancamentosParaGravar(previa, { contaId, tipoConta, grupoGerencialId, importacaoId, origem, novoId, idsNovas = {} }) {
  return previa.itens.filter(i => i.selecionado).map(i => ({
    id: novoId(),
    type: i.tipo,
    accountId: contaId,
    accountType: tipoConta || null,
    amount: i.valorAbs,
    date: i.data,
    description: i.descricao,
    categoryId: i.categoriaId || (i.categoriaStatus === 'nova' ? idsNovas[i.chaveCategoria] || null : null),
    payee: i.favorecido || null,
    grupoGerencial: grupoGerencialId || null,
    origin: origem,
    importacaoId,
    fitid: i.fitid || null,
  }))
}
