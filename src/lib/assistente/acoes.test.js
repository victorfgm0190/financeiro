import { describe, it, expect } from 'vitest'
import { ACOES, NUCLEO, NIVEIS, DESTINOS, acaoPorId, acoesDoPedido, definicaoFerramenta, dominiosDoTexto, validarAcao } from './acoes'
import { MODULOS } from '../permissoes'
import { intervaloVencimento, filtrarVencimentos, totaisVencimentos, gastoDaCategoria } from './consultas'
import { normalizarTermo } from './texto'

const MODULOS_IDS = new Set(MODULOS.map(m => m.id))
const ACOES_PERM = new Set(['ver', 'incluir', 'editar', 'excluir'])

describe('registro central — regras fixas', () => {
  it('ids únicos, nível conhecido, toda ação tem permissão válida', () => {
    expect(new Set(ACOES.map(a => a.id)).size).toBe(ACOES.length)
    for (const a of ACOES) {
      expect(NIVEIS).toContain(a.nivel)
      expect(Array.isArray(a.permissao) && MODULOS_IDS.has(a.permissao[0]) && ACOES_PERM.has(a.permissao[1]), a.id).toBe(true)
    }
  })
  it('nenhum id ou descrição fala em excluir/apagar/deletar (o Assistente NUNCA exclui)', () => {
    const proibido = /exclu|apag|delet|remov/i
    for (const a of ACOES) {
      expect(a.id).not.toMatch(proibido)
      const desc = a.ferramenta?.description || ''
      // A única menção permitida é a recusa explícita do perguntar/abrir_tela? Não: nem isso.
      expect(desc, a.id).not.toMatch(proibido)
    }
    for (const id of Object.keys(DESTINOS)) expect(id).not.toMatch(proibido)
  })
  it('🔴 críticas não têm ferramenta própria: só existem como destino do abrir_tela', () => {
    for (const a of ACOES.filter(x => x.nivel === 'critica')) {
      expect(a.ferramenta, a.id).toBeUndefined()
      expect(a.tela?.page, a.id).toBeTruthy()
      expect(DESTINOS[a.id]?.critica).toBe(true)
    }
  })
  it('toda ação não crítica tem ferramenta e validar', () => {
    for (const a of ACOES.filter(x => x.nivel !== 'critica')) {
      expect(a.ferramenta?.input_schema?.type, a.id).toBe('object')
      expect(typeof a.validar, a.id).toBe('function')
    }
  })
  it('estorno e pagar fatura são 🔴', () => {
    expect(acaoPorId('estornar').nivel).toBe('critica')
    expect(acaoPorId('pagar_fatura').nivel).toBe('critica')
  })
})

describe('carregamento por contexto', () => {
  const todos = () => true
  const ids = (texto, podeFn = todos) => acoesDoPedido(texto, podeFn).map(a => a.id)
  it('núcleo sempre, na ordem fixa', () => {
    expect(ids('lance despesa de 100 reais de combustível')).toEqual(NUCLEO)
  })
  it('domínio pelas palavras do pedido', () => {
    expect(ids('Baixar o agendamento do Carlos no valor próximo de R$200')).toEqual([...NUCLEO, 'baixar_agendamento', 'consultar_vencimentos'])
    expect(ids('o que vence essa semana?')).toContain('consultar_vencimentos')
    expect(ids('quanto está a fatura do Nubank?')).toContain('consultar_fatura')
    expect(ids('quanto gastei de mercado esse mês?')).toContain('consultar_gastos_categoria')
    expect(ids('qual meu saldo principal?')).toContain('consultar_saldo_principal')
    expect(dominiosDoTexto('acha um lançamento de 87 reais')).toEqual([])
  })
  it('só o que o usuário pode usar', () => {
    const semAgenda = (m) => m !== 'agendamentos'
    const r = ids('o que vence essa semana? crie contas a pagar', semAgenda)
    expect(r).not.toContain('criar_agendamento')
    expect(r).not.toContain('consultar_vencimentos')
  })
  it('abrir_tela recebe o enum dos destinos permitidos', () => {
    const def = definicaoFerramenta(acaoPorId('abrir_tela'), (m) => m !== 'contratos')
    expect(def.input_schema.properties.destino.enum).toContain('estornar')
    expect(def.input_schema.properties.destino.enum).not.toContain('contratos')
    expect(def.name).toBe('abrir_tela')
  })
  it('mesmo pedido → mesmas ferramentas na mesma ordem (cache por grupo)', () => {
    const a = acoesDoPedido('fatura do nubank', todos).map(x => definicaoFerramenta(x, todos))
    const b = acoesDoPedido('quanto deu a fatura?', todos).map(x => definicaoFerramenta(x, todos))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('validar das consultas', () => {
  const ctx = {
    idx: {
      contas: new Map([['nubank', { type: 'credit' }], ['itau', { type: 'checking' }]]),
      categorias: new Map([['mercado', { tipo: 'expense' }], ['salario', { tipo: 'income' }]]),
      favorecidos: new Map(), centros: new Map(),
    },
    apelidos: [],
  }
  it('fatura só aceita cartão', () => {
    expect(validarAcao('consultar_fatura', { cartao_id: 'nubank', mes: '2026-10' }, ctx)).toEqual({ cartao_id: 'nubank', mes: '2026-10' })
    expect(validarAcao('consultar_fatura', { cartao_id: 'itau', mes: 'out' }, ctx)).toEqual({ cartao_id: null, mes: null })
  })
  it('gastos: categoria de receita vira null; período padrão = mês atual', () => {
    expect(validarAcao('consultar_gastos_categoria', { categoria_id: 'mercado' }, ctx)).toEqual({ categoria_id: 'mercado', periodo: 'current' })
    expect(validarAcao('consultar_gastos_categoria', { categoria_id: 'salario', periodo: 'prev' }, ctx)).toEqual({ categoria_id: null, periodo: 'prev' })
  })
  it('busca e vencimentos', () => {
    expect(validarAcao('buscar_lancamentos', { valor: 87, texto: '' }, ctx)).toMatchObject({ valor: 87, texto: null, modo_valor: 'exato' })
    expect(validarAcao('consultar_vencimentos', { periodo: 'xx' }, ctx)).toEqual({ periodo: 'proximos_7', tipo: 'todos' })
  })
  it('abrir_tela: destino desconhecido cai em Lançamentos', () => {
    expect(validarAcao('abrir_tela', { destino: 'apagar_tudo', filtro: 'posto' }, ctx)).toMatchObject({ destino: 'tela_lancamentos', filtro: 'posto' })
  })
})

describe('consultas (puras)', () => {
  it('semana = segunda a domingo', () => {
    expect(intervaloVencimento('semana', '2026-10-29')).toMatchObject({ ini: '2026-10-26', fim: '2026-11-01' })
    expect(intervaloVencimento('semana', '2026-11-01')).toMatchObject({ ini: '2026-10-26', fim: '2026-11-01' })
    expect(intervaloVencimento('mes', '2026-02-10')).toMatchObject({ ini: '2026-02-01', fim: '2026-02-28' })
    expect(intervaloVencimento('atrasados', '2026-10-29')).toMatchObject({ fim: '2026-10-28' })
  })
  it('pagar/receber e totais', () => {
    const itens = [{ data: '2026-10-30', amount: 250, grupo: 'receita' }, { data: '2026-10-30', amount: 1800, grupo: 'despesa' }, { data: '2026-10-29', amount: 50, grupo: 'transferencia' }]
    expect(filtrarVencimentos(itens, 'pagar').map(i => i.amount)).toEqual([1800])
    expect(filtrarVencimentos(itens, 'todos').map(i => i.amount)).toEqual([50, 1800, 250])
    expect(totaisVencimentos(itens)).toEqual({ pagar: 1800, receber: 250 })
  })
  it('gasto de categoria sem lançamento = 0', () => {
    expect(gastoDaCategoria({ categorias: [{ categoryId: 'a', valor: 10, pct: 50 }] }, 'b')).toMatchObject({ valor: 0 })
  })
  it('texto normalizado', () => {
    expect(normalizarTermo('  Combustível  ')).toBe('combustivel')
  })
})
