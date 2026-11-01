// Fila: alteração RECUSADA pelo servidor (validação, permissão, regra do banco) não é reenviada para
// sempre — é separada das outras, marcada com o motivo em português, e o resto segue. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { enviarFila, enviarFilaIsolando, tipoDeFalha, motivoDaRecusa } from './filaOffline.js'
import { textoIndicador } from './offlineUi.js'

afterEach(() => vi.unstubAllGlobals())

const ent = (id, extra = {}) => ({ chave: `lancamentos:${id}`, tipo: 'secao', tabela: 'lancamentos', id, op: 'gravar', item: { id, description: `Item ${id}` }, versao: `v-${id}`, ...extra })
const erro = (status, dados = {}) => Object.assign(new Error(`erro ${status}`), { status, dados })

describe('tipo da falha', () => {
  it('rede / sessão → tenta depois; banco ou validação → recusa; 5xx sem motivo → servidor', () => {
    expect(tipoDeFalha(new TypeError('Failed to fetch'))).toBe('rede')
    expect(tipoDeFalha(erro(401))).toBe('rede')
    expect(tipoDeFalha(erro(400, { error: 'Tabela não permitida no sync' }))).toBe('recusa')
    expect(tipoDeFalha(erro(403))).toBe('recusa')
    expect(tipoDeFalha(erro(500, { codigoBanco: '23502' }))).toBe('recusa')
    expect(tipoDeFalha(erro(500))).toBe('servidor')
  })
})

describe('motivo em português', () => {
  it.each([
    [erro(500, { codigoBanco: '23505' }), /já existe um registro igual/],
    [erro(500, { codigoBanco: '23503' }), /depende de outro item que não existe mais/],
    [erro(500, { codigoBanco: '23502', coluna: 'account_id' }), /campo obrigatório \(account_id\)/],
    [erro(500, { codigoBanco: '22P02' }), /formato inválido/],
    [erro(500, { codigoBanco: '42703' }), /banco deste ambiente está desatualizado/],
    [erro(403), /nível de acesso não permite/],
    [erro(400, { error: 'Tabela não permitida no sync' }), /Tabela não permitida/],
    [erro(500), /servidor não conseguiu gravar \(erro 500\)/],
  ])('%#', (e, re) => expect(motivoDaRecusa(e)).toMatch(re))
})

describe('envio separando o que foi recusado', () => {
  // Servidor falso: recusa qualquer lote que contenha um id "ruim".
  const servidor = (ruins, tipo = () => erro(500, { codigoBanco: '23502' })) => vi.fn(async (lista) => {
    const ruim = lista.find(e => ruins.includes(e.id))
    if (ruim) throw Object.assign(tipo(), { enviadas: [], lote: lista })
    return lista
  })

  it('um item ruim num lote de 3: os outros 2 são enviados e só ele fica com erro', async () => {
    const enviar = servidor(['B'])
    const { enviadas, falhas } = await enviarFilaIsolando([ent('A'), ent('B'), ent('C')], enviar)
    expect(enviadas.map(e => e.id).sort()).toEqual(['A', 'C'])
    expect(falhas.map(f => f.entrada.id)).toEqual(['B'])
    expect(motivoDaRecusa(falhas[0].err)).toMatch(/campo obrigatório/)
  })

  it('o que vem depois do lote recusado também é enviado', async () => {
    const enviar = vi.fn(async (lista) => {
      if (lista.some(e => e.id === 'B') && lista.length > 1) throw Object.assign(erro(400, { error: 'inválido' }), { enviadas: [lista[0]], lote: lista.slice(1, 3) })
      if (lista.some(e => e.id === 'B')) throw Object.assign(erro(400, { error: 'inválido' }), { enviadas: [], lote: lista })
      return lista
    })
    const { enviadas, falhas } = await enviarFilaIsolando([ent('A'), ent('B'), ent('C'), ent('D')], enviar)
    expect(enviadas.map(e => e.id).sort()).toEqual(['A', 'C', 'D'])
    expect(falhas.map(f => f.entrada.id)).toEqual(['B'])
  })

  it('sem internet: interrompe como antes (o app tenta de novo depois), sem marcar erro', async () => {
    const enviar = vi.fn(async () => { throw Object.assign(new TypeError('Failed to fetch'), { enviadas: [] }) })
    await expect(enviarFilaIsolando([ent('A')], enviar)).rejects.toMatchObject({ enviadas: [], falhas: [] })
  })

  it('enviarFila diz qual lote estava indo quando o servidor recusou', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, json: async () => ({ error: 'null value', codigoBanco: '23502', coluna: 'date' }) }))
    let e
    try { await enviarFila([ent('A'), ent('B')]) } catch (err) { e = err }
    expect(e.lote.map(x => x.id)).toEqual(['A', 'B'])
    expect(motivoDaRecusa(e)).toMatch(/campo obrigatório \(date\)/)
  })
})

describe('indicador da barra lateral', () => {
  it('"1 alteração com erro — ver detalhes" tem prioridade', () => {
    expect(textoIndicador({ online: true, pendentes: 3, erros: 1 })).toBe('1 alteração com erro — ver detalhes')
    expect(textoIndicador({ online: true, pendentes: 3, erros: 2 })).toBe('2 alterações com erro — ver detalhes')
    expect(textoIndicador({ online: true, pendentes: 1 })).toBe('1 alteração aguardando envio')
  })
})
