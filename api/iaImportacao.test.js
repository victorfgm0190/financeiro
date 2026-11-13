// Sugestões do Assistente na Importar Fatura (Etapa 6c): a rota com a IA SIMULADA (nenhum teste chama a
// IA de verdade). Liberação no central a cada chamada, opção do cliente, permissão, limite, falha da
// IA, uma chamada só, dados mínimos (LGPD) e a volta dos índices. Dados fictícios.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { criarHandler } from './ia-importacao.js'
import { montarPedido, interpretarResposta, limparDescricao, prefiltrarFavorecidos, DEFINICAO_SUGESTAO, MAX_ITENS } from './_iaImportacao.js'

const ADMIN = { id: 'u1', username: 'admin', nivel: 'admin', permissoes: {}, modulos: {} }
const CONSULTA = { id: 'u2', username: 'consulta', nivel: 'consulta', permissoes: {}, modulos: {} }

const CATEGORIAS = [
  { id: 'cat_mercado', name: 'Mercado', type: 'expense', category_group: 'Alimentação', perfil_ids: null },
  { id: 'cat_assin', name: 'Assinaturas', type: 'expense', category_group: 'Lazer', perfil_ids: null },
  { id: 'cat_estorno', name: 'Estornos', type: 'income', category_group: null, perfil_ids: null },
  { id: 'cat_outro_perfil', name: 'Escritório', type: 'expense', category_group: 'Empresa', perfil_ids: ['prf_empresa'] },
]
const ITENS = [
  { linhaId: 'l1', tipo: 'pergunta', despesa: true, descricao: 'MERCADO DO BAIRRO 4541', valor: 87.3, data: '2026-11-03', parcela: null,
    candidatos: [{ id: 'tx_a', descricao: 'Mercado', valor: 87.3, data: '2026-11-03', parcela: null, origem: 'Lançado por você' },
      { id: 'tx_b', descricao: 'Feira', valor: 87.3, data: '2026-11-09', parcela: null, origem: 'Lançado por você' }] },
  { linhaId: 'l2', tipo: 'novo', despesa: true, descricao: 'STREAMING EXEMPLO 123.456.789-09', valor: 44.9, data: '2026-11-05', parcela: null },
  { linhaId: 'l3', tipo: 'novo', despesa: false, descricao: 'ESTORNO LOJA ALFA', valor: 12, data: '2026-11-07', parcela: null },
]

function montar({ modulos = { ia_sugestoes_importacao: true }, opcao = true, gerencial = true, resposta, erroIa = null, limite = null } = {}) {
  const chamadas = { ia: [], uso: [] }
  const respostaIa = resposta || {
    model: 'claude-haiku-5-5', stop_reason: 'tool_use', usage: { input_tokens: 900, output_tokens: 120 },
    content: [{ type: 'tool_use', name: 'sugerir', input: { itens: [
      { item: 'L1', decisao: 'mesmo', candidato: 'a', categoria: null, grupo: null, favorecido: null, confianca: 'alta', motivo: 'Mesma loja, valor e data.' },
      { item: 'L2', decisao: null, candidato: null, categoria: 'c3', grupo: 'g1', favorecido: 0, confianca: 'media', motivo: 'Assinatura mensal.' },
      { item: 'L3', decisao: null, candidato: null, categoria: 'c2', grupo: null, favorecido: null, confianca: 'baixa', motivo: 'Despesa num estorno.' },
    ] } }],
  }
  const deps = {
    autenticar: (req) => !!req.user,
    central: vi.fn(async () => [{ modulos }]),
    q: vi.fn(async (sql) => {
      if (/FROM configuracoes/.test(sql)) return [{ ia_sugestoes_importacao: opcao, controle_gerencial: gerencial }]
      if (/FROM categorias/.test(sql)) return CATEGORIAS
      if (/FROM reservas_funcoes/.test(sql)) return [{ id: 'grp_lazer', name: 'Lazer' }, { id: 'grp_D', name: 'Despesa' }]
      if (/FROM favorecidos/.test(sql)) return [{ name: 'Streaming Exemplo' }, { name: 'Loja Alfa' }, { name: 'Fulano de Tal' }]
      return []
    }),
    ia: () => ({ messages: { create: async (params) => { chamadas.ia.push(params); if (erroIa) throw erroIa; return respostaIa } } }),
    temChave: () => true,
    registrarUso: async (d) => { chamadas.uso.push(d) },
    usoDoDia: async () => (limite ? { total: limite, imagem: 0 } : { total: 0, imagem: 0 }),
    limites: async () => ({ diario: 100, imagem: 30 }),
    prepararIa: async () => {},
  }
  return { handler: criarHandler(deps), deps, chamadas }
}

function chamar(handler, { method = 'POST', user = ADMIN, body = { itens: ITENS, perfilId: 'prf_pessoal', fatura: '2026-11' } } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v },
      status(c) { this.statusCode = c; return this },
      json(j) { resolve({ status: this.statusCode, json: j }); return this },
      end() { resolve({ status: this.statusCode, json: null }); return this },
    }
    handler({ method, user, ambiente: { id: 'amb_teste', sigla: 'teste' }, body }, res)
  })
}

describe('liberação (central) e opção do cliente', () => {
  it('GET: sem liberação → nada liberado (a opção não aparece)', async () => {
    const { handler } = montar({ modulos: {} })
    expect((await chamar(handler, { method: 'GET' })).json).toEqual({ liberado: false, ligado: false })
  })
  it('GET: liberado + opção ligada', async () => {
    const { handler } = montar()
    expect((await chamar(handler, { method: 'GET' })).json).toEqual({ liberado: true, ligado: true })
  })
  it('sem liberação: recusa SEM chamar a IA', async () => {
    const { handler, chamadas } = montar({ modulos: {} })
    const r = await chamar(handler)
    expect(r).toMatchObject({ status: 403, json: { indisponivel: true, motivo: 'nao_liberado' } })
    expect(chamadas.ia).toHaveLength(0)
  })
  it('liberado + opção desligada: recusa sem chamar a IA', async () => {
    const { handler, chamadas } = montar({ opcao: false })
    expect((await chamar(handler)).json).toMatchObject({ motivo: 'desligado' })
    expect(chamadas.ia).toHaveLength(0)
  })
  it('liberado + ligada: chama a IA uma vez e devolve as sugestões com ids', async () => {
    const { handler, chamadas } = montar()
    const r = await chamar(handler)
    expect(r.status).toBe(200)
    expect(chamadas.ia).toHaveLength(1)
    expect(r.json.sugestoes).toEqual([
      expect.objectContaining({ linhaId: 'l1', decisao: 'mesmo', candidatoId: 'tx_a', confianca: 'alta' }),
      expect.objectContaining({ linhaId: 'l2', categoriaId: 'cat_assin', grupoId: 'grp_lazer', favorecido: 'Streaming Exemplo' }),
    ])
    expect(chamadas.uso).toEqual([expect.objectContaining({ ferramenta: 'sugestao_importacao', modelo: 'claude-haiku-5-5', ambiente: 'teste' })])
  })
  it('tirar a liberação com a opção ligada: a chamada seguinte já recusa (lida no central a cada chamada)', async () => {
    const m = montar()
    expect((await chamar(m.handler)).status).toBe(200)
    m.deps.central.mockImplementation(async () => [{ modulos: {} }])
    const r = await chamar(m.handler)
    expect(r.json).toMatchObject({ indisponivel: true, motivo: 'nao_liberado' })
    expect(m.chamadas.ia).toHaveLength(1)
    expect(m.deps.central).toHaveBeenCalledTimes(2)
  })
})

describe('permissão, limite, falha e itens', () => {
  it('sem permissão de importar: recusa sem chamar a IA', async () => {
    const { handler, chamadas } = montar()
    expect((await chamar(handler, { user: CONSULTA })).json).toMatchObject({ motivo: 'sem_permissao' })
    expect(chamadas.ia).toHaveLength(0)
  })
  it('limite diário atingido: recusa sem chamar a IA', async () => {
    const { handler, chamadas } = montar({ limite: 100 })
    expect((await chamar(handler)).json).toMatchObject({ motivo: 'limite' })
    expect(chamadas.ia).toHaveLength(0)
  })
  it('IA fora do ar / prazo: "indisponível", nada registrado', async () => {
    const { handler, chamadas } = montar({ erroIa: Object.assign(new Error('timeout'), { name: 'APIConnectionTimeoutError' }) })
    expect((await chamar(handler))).toMatchObject({ status: 503, json: { indisponivel: true, motivo: 'ia' } })
    expect(chamadas.uso).toHaveLength(0)
  })
  it('sem itens: não chama a IA', async () => {
    const { handler, chamadas } = montar()
    expect((await chamar(handler, { body: { itens: [] } })).json).toMatchObject({ sugestoes: [], semItens: true })
    expect(chamadas.ia).toHaveLength(0)
  })
  it('no máximo 40 itens por chamada', async () => {
    const { handler, chamadas } = montar()
    const muitos = Array.from({ length: 55 }, (_, i) => ({ linhaId: `x${i}`, tipo: 'novo', despesa: true, descricao: `LOJA ${i}`, valor: 10, data: '2026-11-01' }))
    await chamar(handler, { body: { itens: muitos } })
    expect(JSON.parse(chamadas.ia[0].messages[0].content).itens).toHaveLength(MAX_ITENS)
  })
  it('chamada: Haiku 5.5, sem raciocínio, esforço low, saída forçada pela ferramenta strict, prompt em cache', async () => {
    const { handler, chamadas } = montar()
    await chamar(handler)
    const p = chamadas.ia[0]
    expect(p).toMatchObject({ model: 'claude-haiku-5-5', thinking: { type: 'disabled' }, output_config: { effort: 'low' }, tool_choice: { type: 'tool', name: 'sugerir' } })
    expect(p.tools[0]).toBe(DEFINICAO_SUGESTAO)
    expect(DEFINICAO_SUGESTAO.strict).toBe(true)
    expect(p.system[0].cache_control).toEqual({ type: 'ephemeral' })
  })
})

describe('dados mínimos (LGPD)', () => {
  it('o JSON enviado não tem ids, conta, cartão, perfil, CPF nem números longos; até 5 favorecidos por linha', async () => {
    const { handler, chamadas } = montar()
    await chamar(handler)
    const enviado = chamadas.ia[0].messages[0].content
    for (const proibido of ['tx_a', 'tx_b', 'l1', 'l2', 'cat_', 'grp_', 'prf_', '4541', '123.456.789-09', '12345678909', 'amb_teste']) expect(enviado).not.toContain(proibido)
    const msg = JSON.parse(enviado)
    expect(msg.itens.find(i => i.item === 'L2').favorecidos.length).toBeLessThanOrEqual(5)
    expect(msg.itens.find(i => i.item === 'L2').favorecidos).not.toContain('Fulano de Tal')
    // Categoria de outro perfil não vai para a IA.
    expect(msg.categorias.map(c => c.nome)).not.toContain('Empresa › Escritório')
  })
  it('controle gerencial desligado: lista de grupos não vai, grupo sugerido é descartado', async () => {
    const { handler, chamadas } = montar({ gerencial: false })
    const r = await chamar(handler)
    expect(JSON.parse(chamadas.ia[0].messages[0].content).grupos).toBeUndefined()
    expect(r.json.sugestoes.find(s => s.linhaId === 'l2').grupoId).toBeNull()
  })
  it('limpeza da descrição e pré-filtro de favorecidos', () => {
    expect(limparDescricao('LOJA X 4541 CPF 123.456.789-09')).toBe('LOJA X CPF')
    expect(prefiltrarFavorecidos('STREAMING EXEMPLO', ['Streaming Exemplo', 'Outra Coisa', 'Fulano de Tal'])).toEqual(['Streaming Exemplo'])
    // Favorecido de 1 ou 2 letras (ou sem palavra em comum) nunca entra — achado da chamada real no teste1.
    expect(prefiltrarFavorecidos('POSTO DE COMBUSTIVEL EXEMPLO', ['s', 'xy', 'Posto', 'Mercado'])).toEqual(['Posto'])
    expect(prefiltrarFavorecidos('ESTORNO LOJA ALFA', ['s'])).toEqual([])
  })
})

describe('interpretação da resposta', () => {
  const { mapas } = montarPedido({ itens: ITENS, perfilId: 'prf_pessoal' }, { categorias: CATEGORIAS, grupos: [{ id: 'grp_lazer', name: 'Lazer' }], favorecidos: [{ name: 'Streaming Exemplo' }] })
  it('categorias vão ordenadas pelo grupo, com índices locais', () => {
    expect(montarPedido({ itens: ITENS, perfilId: 'prf_pessoal' }, { categorias: CATEGORIAS }).mensagem.categorias.map(c => [c.i, c.nome, c.tipo]))
      .toEqual([['c1', 'Estornos', 'receita'], ['c2', 'Alimentação › Mercado', 'despesa'], ['c3', 'Lazer › Assinaturas', 'despesa']])
  })
  it('descarta candidato fora da lista, categoria de outro tipo, índices inventados e itens repetidos', () => {
    const { sugestoes, descartados } = interpretarResposta({ itens: [
      { item: 'L1', decisao: 'mesmo', candidato: 'z', confianca: 'alta', motivo: 'x' },
      { item: 'L3', categoria: 'c3', confianca: 'baixa', motivo: 'despesa num estorno' },
      { item: 'L9', decisao: 'novo', confianca: 'alta', motivo: 'x' },
      { item: 'L2', categoria: 'c3', confianca: 'alta', motivo: 'ok' },
      { item: 'L2', categoria: 'c1', confianca: 'alta', motivo: 'repetido' },
    ] }, mapas)
    expect(sugestoes.map(s => [s.linhaId, s.categoriaId])).toEqual([['l2', 'cat_assin']])
    expect(descartados.map(d => d.motivo)).toEqual(['candidato fora da lista', 'categoria de outro tipo', 'item desconhecido', 'item repetido'])
  })
})

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}))
