import { describe, it, expect } from 'vitest'
import { NOVIDADES } from '../novidades.js'
import { chaveVersao, maisNovaPrimeiro, versaoMaisNova, novidadesNaoVistas, novidadesDaVersaoNova, linhasDoAviso, obrigatoriaEntre, DIAS_SEM_REGISTRO } from './novidades.js'
import { ID_NOVIDADE } from '../../api/boas-vindas.js'

const n = (id, extra = {}) => ({ id, data: `${id.slice(0, 4)}-${id.slice(5, 7)}-${id.slice(8, 10)}`, titulo: id, publico: 'todos', obrigatoria: false, itens: [`item ${id}`], ...extra })
const lista = [n('2026.11.11-3'), n('2026.11.11-2'), n('2026.11.11'), n('2026.11.10-2', { publico: 'admin' }), n('2026.11.10'), n('2026.09.01')]
const agora = new Date('2026-11-11T15:00:00')

describe('versões das novidades', () => {
  it('ordem: dia e, no mesmo dia, -2, -3… (-10 depois de -9)', () => {
    expect(chaveVersao('2026.11.11')).toBeLessThan(chaveVersao('2026.11.11-2'))
    expect(chaveVersao('2026.11.11-9')).toBeLessThan(chaveVersao('2026.11.11-10'))
    expect(chaveVersao('2026.11.10-5')).toBeLessThan(chaveVersao('2026.11.11'))
    expect(chaveVersao('x')).toBe(-1)
    expect(versaoMaisNova([n('2026.11.10'), n('2026.11.11-2'), n('2026.11.11')])).toBe('2026.11.11-2')
  })
})

describe('o que a pessoa ainda não viu', () => {
  it('depois da última vista; itens de administrador só para administrador', () => {
    expect(novidadesNaoVistas(lista, '2026.11.10', { agora }).map(x => x.id)).toEqual(['2026.11.11-3', '2026.11.11-2', '2026.11.11'])
    expect(novidadesNaoVistas(lista, '2026.11.10', { agora, admin: true }).map(x => x.id)).toEqual(['2026.11.11-3', '2026.11.11-2', '2026.11.11', '2026.11.10-2'])
    expect(novidadesNaoVistas(lista, '2026.11.11-3', { agora })).toEqual([])
  })
  it('sem nada guardado: só as dos últimos 30 dias (não o histórico inteiro)', () => {
    expect(DIAS_SEM_REGISTRO).toBe(30)
    const ids = novidadesNaoVistas(lista, null, { agora }).map(x => x.id)
    expect(ids).toContain('2026.11.10')
    expect(ids).not.toContain('2026.09.01')
  })
})

describe('aviso de atualização', () => {
  it('novidades da versão nova = as mais novas que a aberta', () => {
    const abertas = lista.slice(2)
    expect(novidadesDaVersaoNova(abertas, lista).map(x => x.id)).toEqual(['2026.11.11-3', '2026.11.11-2'])
    expect(novidadesDaVersaoNova(lista, lista)).toEqual([])
  })
  it('até 3 linhas, respeitando o público', () => {
    const novas = [n('2026.11.12', { itens: ['a', 'b'] }), n('2026.11.11-9', { publico: 'admin', itens: ['só admin'] }), n('2026.11.11-8', { itens: ['c', 'd'] })]
    expect(linhasDoAviso(novas)).toEqual(['a', 'b', 'c'])
    expect(linhasDoAviso(novas, { admin: true })).toEqual(['a', 'b', 'só admin'])
  })
  it('obrigatória se qualquer versão no caminho for, com o motivo dela', () => {
    expect(obrigatoriaEntre([n('2026.11.12'), n('2026.11.11-9', { obrigatoria: true, motivo: 'O banco mudou.' })])).toEqual({ obrigatoria: true, motivo: 'O banco mudou.' })
    expect(obrigatoriaEntre([n('2026.11.12')])).toEqual({ obrigatoria: false, motivo: null })
    expect(obrigatoriaEntre([n('2026.11.12', { obrigatoria: true })]).motivo).toBeTruthy()
  })
})

describe('src/novidades.js (o arquivo de verdade)', () => {
  it('ids únicos, válidos (os mesmos que a API aceita), data igual à do id, mais nova primeiro', () => {
    const ids = NOVIDADES.map(x => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const x of NOVIDADES) {
      expect(ID_NOVIDADE.test(x.id), x.id).toBe(true)
      expect(x.data, x.id).toBe(x.id.slice(0, 10).replace(/\./g, '-'))
    }
    expect(maisNovaPrimeiro(NOVIDADES).map(x => x.id)).toEqual(ids)
  })
  it('cada versão: título, itens em linguagem simples, público e obrigatória definidos', () => {
    for (const x of NOVIDADES) {
      expect(x.titulo, x.id).toBeTruthy()
      expect(x.itens.length, x.id).toBeGreaterThan(0)
      expect(['todos', 'admin'], x.id).toContain(x.publico)
      expect(typeof x.obrigatoria, x.id).toBe('boolean')
      if (x.obrigatoria) expect(x.motivo, x.id).toBeTruthy()
      for (const i of x.itens) expect(i, x.id).not.toMatch(/\b(PWA|service worker|commit|deploy|FITID|IndexedDB|API)\b/i)
    }
  })
  it('começa com as entregas desta semana', () => {
    const titulos = NOVIDADES.map(x => x.titulo).join(' | ')
    for (const t of ['Transferências entre perfis', 'Backup completo e backup ao sair', 'Importar Fatura mais inteligente', 'Use o Finup como aplicativo no computador']) expect(titulos).toContain(t)
  })
})

describe('novidades de recurso contratado', () => {
  const n = (id, extra = {}) => ({ id, data: '2026-11-12', titulo: id, publico: 'todos', itens: ['x'], ...extra })
  const LISTA = [n('2026.11.12-5', { recurso: 'ia_sugestoes_importacao' }), n('2026.11.12-4'), n('2026.11.11')]
  it('sem o campo vale para todos; com o campo, só com o recurso liberado', async () => {
    const { paraRecursos, semRecurso } = await import('./novidades.js')
    expect(paraRecursos(LISTA, {}).map(x => x.id)).toEqual(['2026.11.12-4', '2026.11.11'])
    expect(paraRecursos(LISTA, { ia_sugestoes_importacao: true }).map(x => x.id)).toEqual(['2026.11.12-5', '2026.11.12-4', '2026.11.11'])
    expect(semRecurso(LISTA).map(x => x.id)).toEqual(['2026.11.12-4', '2026.11.11'])
  })
  it('a marca "última vista" não engole a de recurso; ela tem "já vi" próprio', async () => {
    const { novidadesNaoVistas, novidadesDeRecursoNaoVistas } = await import('./novidades.js')
    expect(novidadesNaoVistas(LISTA, '2026.11.11').map(x => x.id)).toEqual(['2026.11.12-4'])
    expect(novidadesDeRecursoNaoVistas(LISTA, [], { ia_sugestoes_importacao: true }).map(x => x.id)).toEqual(['2026.11.12-5'])
    expect(novidadesDeRecursoNaoVistas(LISTA, ['2026.11.12-5'], { ia_sugestoes_importacao: true })).toEqual([])
    expect(novidadesDeRecursoNaoVistas(LISTA, [], {})).toEqual([])
  })
  it('o arquivo de verdade: a 2026.11.12-4 é só a parte geral; a do Assistente tem id próprio e o recurso', async () => {
    const { NOVIDADES } = await import('../novidades.js')
    const geral = NOVIDADES.find(x => x.id === '2026.11.12-4')
    expect(geral.recurso).toBeUndefined()
    expect(geral.itens).toEqual(['Na Importar Fatura, a categoria escolhida só vira regra para as próximas faturas quando a importação é confirmada; cancelar não ensina nada.'])
    const assist = NOVIDADES.find(x => x.recurso === 'ia_sugestoes_importacao')
    expect(assist.id).not.toBe('2026.11.12-4')
    expect(assist.itens.join(' ')).toMatch(/Configurações › Geral › Assistente.*Aceitar N sugestões/s)
  })
})
