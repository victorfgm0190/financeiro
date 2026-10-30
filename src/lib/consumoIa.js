// CONSUMO DE IA (Clientes Finup → aba "Consumo de IA"): soma o ia_uso de cada ambiente e estima o
// custo pelo PREÇO VIGENTE na data de cada chamada (ia_precos, no central — nada de preço no código).
// tokens_entrada é o TOTAL de entrada; a parte de cache (leitura/criação) tem preço próprio, e o
// resto paga o preço de entrada. Grupo com tokens de um tipo sem preço cadastrado → custo null
// (a tela mostra só os tokens e "cadastre o preço"). PURO: roda no app e nos testes.

const r6 = (n) => Math.round(n * 1e6) / 1e6
const num = (v) => (v == null || v === '' ? null : Number(v))

export const ROTULO_FERRAMENTA = {
  registrar_lancamento: 'Lançamento', lote: 'Lote', criar_agendamento: 'Agendamento', baixar_agendamento: 'Baixa',
  consultar_saldo: 'Saldo', consultar_saldo_principal: 'Saldo principal', buscar_lancamentos: 'Busca',
  consultar_vencimentos: 'Vencimentos', consultar_fatura: 'Fatura', consultar_gastos_categoria: 'Gastos por categoria',
  perguntar: 'Pergunta', abrir_tela: 'Abrir tela',
}
export const rotuloFerramenta = (f) => ROTULO_FERRAMENTA[f] || f || '—'

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// Períodos do filtro ('AAAA-MM-DD' de hoje) → { inicio, fim }.
export function periodoDoFiltro(tipo, hoje) {
  const [a, m] = hoje.split('-').map(Number)
  if (tipo === 'anterior') return { inicio: iso(new Date(a, m - 2, 1)), fim: iso(new Date(a, m - 1, 0)) }
  return { inicio: iso(new Date(a, m - 1, 1)), fim: iso(new Date(a, m, 0)) }
}

// Preço do modelo vigente no dia: a linha de maior vigência ≤ dia.
export function precoVigente(precos, modelo, dia) {
  let melhor = null
  for (const p of precos || []) {
    if (p.modelo !== modelo || String(p.vigencia).slice(0, 10) > dia) continue
    if (!melhor || String(p.vigencia) > String(melhor.vigencia)) melhor = p
  }
  return melhor
}

// Custo em US$ de um grupo de chamadas, ou null se faltar o preço de algum tipo de token usado.
export function custoDoGrupo(g, preco) {
  if (!preco) return null
  const leitura = Number(g.leitura) || 0
  const criacao = Number(g.criacao) || 0
  const partes = [
    [Math.max(0, (Number(g.entrada) || 0) - leitura - criacao), num(preco.entrada)],
    [Number(g.saida) || 0, num(preco.saida)],
    [leitura, num(preco.cache_leitura)],
    [criacao, num(preco.cache_criacao)],
  ]
  if (partes.some(([t, p]) => t > 0 && p == null)) return null
  return r6(partes.reduce((s, [t, p]) => s + (t > 0 ? t * p / 1e6 : 0), 0))
}

const vazio = () => ({ chamadas: 0, entrada: 0, saida: 0, leitura: 0, criacao: 0, imagens: 0, cortadas: 0, duracaoSoma: 0, duracaoN: 0, custo: 0, semPreco: 0 })
function somar(alvo, g, custo) {
  for (const k of ['chamadas', 'entrada', 'saida', 'leitura', 'criacao', 'imagens', 'cortadas', 'duracaoSoma', 'duracaoN']) alvo[k] += Number(g[k]) || 0
  if (custo == null) alvo.semPreco += Number(g.chamadas) || 0
  else alvo.custo = r6(alvo.custo + custo)
}
// Acabamento: médias e custo null quando NENHUMA chamada tem preço.
function fechar(a) {
  const comPreco = a.chamadas - a.semPreco
  return {
    ...a,
    custo: comPreco > 0 ? a.custo : null,
    custoMedio: comPreco > 0 ? r6(a.custo / comPreco) : null,
    duracaoMedia: a.duracaoN ? Math.round(a.duracaoSoma / a.duracaoN) : null,
  }
}

// grupos: [{ ambiente, dia, ferramenta, modelo, chamadas, entrada, leitura, criacao, saida, imagens,
// duracaoSoma, duracaoN, cortadas }] → { totais, porCliente, porDia, porFerramenta, modelosSemPreco }.
export function consolidarConsumo(grupos, precos) {
  const totais = vazio()
  const mapas = { porCliente: new Map(), porDia: new Map(), porFerramenta: new Map() }
  const semPreco = new Set()
  for (const g of grupos || []) {
    const custo = custoDoGrupo(g, precoVigente(precos, g.modelo, g.dia))
    if (custo == null) semPreco.add(g.modelo || '(sem modelo)')
    somar(totais, g, custo)
    for (const [mapa, chave] of [[mapas.porCliente, g.ambiente], [mapas.porDia, g.dia], [mapas.porFerramenta, g.ferramenta]]) {
      if (!mapa.has(chave)) mapa.set(chave, vazio())
      somar(mapa.get(chave), g, custo)
    }
  }
  const lista = (m, ordem) => [...m.entries()].map(([chave, a]) => ({ chave, ...fechar(a) })).sort(ordem)
  return {
    totais: fechar(totais),
    porCliente: lista(mapas.porCliente, (a, b) => b.chamadas - a.chamadas),
    porDia: lista(mapas.porDia, (a, b) => a.chave.localeCompare(b.chave)),
    porFerramenta: lista(mapas.porFerramenta, (a, b) => b.chamadas - a.chamadas),
    modelosSemPreco: [...semPreco].sort(),
  }
}

// Preço digitado (vírgula decimal) → número ≥ 0 ou null (vazio). Inválido → undefined.
export function precoDigitado(v) {
  const t = String(v ?? '').trim().replace(/\s/g, '')
  if (!t) return null
  // Com vírgula, ela é a decimal ("1.250,50"); sem vírgula, o ponto é ("0.80").
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
