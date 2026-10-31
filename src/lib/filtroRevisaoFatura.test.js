import { describe, it, expect } from 'vitest'
import { linhaConciliada, contarRevisao, filtrarRevisao, filtroAoAbrir, lerFiltroLembrado, lembrarFiltro } from './filtroRevisaoFatura'

// Linhas como a revisão as marca (lib/revisaoImportacao.js, lib/casamentoFatura.js).
const tx = { id: 't1', amount: 10 }
const LINHAS = [
  { _id: 'novo', amount: 50 },
  { _id: 'possivel', amount: 20, _dupLevel: 'possivel', _dupTx: tx },
  { _id: 'existe', amount: 30, _dupLevel: 'certeza', _isDuplicate: true, _dbTx: tx },
  { _id: 'banco_ok', amount: 40, _collisionTx: tx, _dbTx: tx },
  { _id: 'banco_muda', amount: 15, _collisionTx: { ...tx, id: 't2' }, _dbTx: tx },
  { _id: 'ja', amount: 12, _jaLancado: { tx, origem: 'regra_nova' } },
  { _id: 'escolher', amount: 8, _jaLancadoOpcoes: [tx] },
  { _id: 'existe_outra', amount: 9, _dupLevel: 'certeza', _tambemEm: [{ tx, fatura: '2026-09' }] },
]
const opcoes = { mudancas: (r) => (r._collisionTx?.id === 't2' ? ['description'] : []) }
const soma = (rows) => rows.reduce((s, r) => s + r.amount, 0)

describe('Importar Fatura — filtro Pendentes / Conciliados / Todos', () => {
  it('situação de cada linha', () => {
    const conc = LINHAS.filter(r => linhaConciliada(r, opcoes)).map(r => r._id)
    expect(conc).toEqual(['existe', 'banco_ok', 'ja'])
  })
  it('abre só com os pendentes e com os contadores certos', () => {
    expect(contarRevisao(LINHAS, opcoes)).toEqual({ pendentes: 5, conciliados: 3, todos: 8 })
    expect(filtroAoAbrir(5, 'conciliados')).toBe('pendentes')
    expect(filtrarRevisao(LINHAS, 'pendentes', opcoes).map(r => r._id)).toEqual(['novo', 'possivel', 'banco_muda', 'escolher', 'existe_outra'])
  })
  it('confirmar o casamento move a linha para Conciliados', () => {
    const escolhida = LINHAS.map(r => (r._id === 'possivel' ? { ...r, _dupLevel: null, _collisionTx: tx, _mesmoConfirmado: true } : r))
    expect(filtrarRevisao(escolhida, 'conciliados', opcoes).map(r => r._id)).toContain('possivel')
    expect(contarRevisao(escolhida, opcoes)).toMatchObject({ pendentes: 4, conciliados: 4 })
    // "Para escolher" → escolhido um lançamento: a revisão troca por _jaLancado.
    const ja = LINHAS.map(r => (r._id === 'escolher' ? { ...r, _jaLancadoOpcoes: undefined, _jaLancado: { tx } } : r))
    expect(linhaConciliada(ja.find(r => r._id === 'escolher'), opcoes)).toBe(true)
  })
  it('os filtros só recortam: pendentes + conciliados = todos (totais iguais nos três)', () => {
    const p = filtrarRevisao(LINHAS, 'pendentes', opcoes)
    const c = filtrarRevisao(LINHAS, 'conciliados', opcoes)
    expect(soma(p) + soma(c)).toBe(soma(filtrarRevisao(LINHAS, 'todos', opcoes)))
    expect(filtrarRevisao(LINHAS, 'todos', opcoes)).toBe(LINHAS)
  })
  it('fatura toda conciliada: zero pendentes; abre no filtro lembrado', () => {
    const tudo = LINHAS.filter(r => linhaConciliada(r, opcoes))
    expect(contarRevisao(tudo, opcoes).pendentes).toBe(0)
    expect(filtroAoAbrir(0, 'conciliados')).toBe('conciliados')
    expect(filtroAoAbrir(0, null)).toBe('pendentes')
    expect(filtroAoAbrir(0, 'lixo')).toBe('pendentes')
  })
  it('lembra por ambiente e usuário; storage com erro não quebra', () => {
    const mem = new Map()
    const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
    lembrarFiltro({ id: 'u1', ambSigla: 'vm' }, 'todos', storage)
    expect(lerFiltroLembrado({ id: 'u1', ambSigla: 'vm' }, storage)).toBe('todos')
    expect(lerFiltroLembrado({ id: 'u2', ambSigla: 'vm' }, storage)).toBeNull()
    const quebrado = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
    expect(lerFiltroLembrado({ id: 'u1' }, quebrado)).toBeNull()
    expect(() => lembrarFiltro({ id: 'u1' }, 'todos', quebrado)).not.toThrow()
  })
})
