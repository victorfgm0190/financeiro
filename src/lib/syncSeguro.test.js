import { describe, it, expect, vi } from 'vitest'
import {
  assinaturasDe, linhasNovasOuAlteradas, registrarConfirmadas, idsApagados,
  assinaturasDaConfiguracao, camposAlterados, acaoNaReconexao, tentarReconectar, reaplicarPendencias,
} from './syncSeguro.js'

describe('linhas novas ou alteradas em relação ao confirmado', () => {
  const conf = assinaturasDe([{ id: 'a', v: 1 }, { id: 'b', v: 2 }])

  it('só vão as linhas novas ou diferentes; as iguais ao banco ficam de fora', () => {
    const { linhas, assinaturas } = linhasNovasOuAlteradas(conf, [{ id: 'a', v: 1 }, { id: 'b', v: 3 }, { id: 'c', v: 4 }])
    expect(linhas.map(l => l.id)).toEqual(['b', 'c'])
    expect(assinaturas.map(([id]) => id)).toEqual(['b', 'c'])
  })

  it('o confirmado só avança quando o servidor responde (registrarConfirmadas)', () => {
    const c = new Map(conf)
    const { assinaturas } = linhasNovasOuAlteradas(c, [{ id: 'b', v: 9 }])
    expect(linhasNovasOuAlteradas(c, [{ id: 'b', v: 9 }]).linhas).toHaveLength(1)
    registrarConfirmadas(c, assinaturas, ['a'])
    expect(linhasNovasOuAlteradas(c, [{ id: 'b', v: 9 }]).linhas).toHaveLength(0)
    expect(c.has('a')).toBe(false)
  })

  it('apagados = ids que estavam no estado anterior e sumiram', () => {
    expect(idsApagados([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }])).toEqual(['a'])
    expect(idsApagados(undefined, [{ id: 'b' }])).toEqual([])
  })
})

describe('camposAlterados (configurações)', () => {
  it('só as chaves que mudaram em relação ao último estado confirmado', () => {
    const conf = assinaturasDaConfiguracao({ financial_month_start_day: 15, faturas_fechadas: { x: true }, currency: 'BRL' })
    expect(camposAlterados(conf, { financial_month_start_day: 15, faturas_fechadas: {}, currency: 'BRL' })).toEqual(['faturas_fechadas'])
    expect(camposAlterados(conf, { financial_month_start_day: 15, faturas_fechadas: { x: true }, currency: 'BRL' })).toEqual([])
  })

  it('sem confirmado (banco vazio), todas as chaves contam como alteradas', () => {
    expect(camposAlterados({}, { a: 1, b: null })).toEqual(['a', 'b'])
  })
})

describe('reconexão', () => {
  it('quem já carregou envia o pendente; quem nunca carregou recarrega antes', () => {
    expect(acaoNaReconexao({ carregouDoBanco: true })).toBe('enviar-pendentes')
    expect(acaoNaReconexao({ carregouDoBanco: false })).toBe('recarregar')
  })

  it('ping fora: continua Local e não carrega', async () => {
    const carregar = vi.fn()
    expect(await tentarReconectar({ carregouDoBanco: false, ping: async () => false, carregar })).toEqual({ acao: 'aguardar' })
    expect(carregar).not.toHaveBeenCalled()
  })

  it('ping volta sem load anterior: carrega do banco antes de qualquer envio', async () => {
    const carregar = vi.fn(async () => ({ status: 'connected', data: {} }))
    const r = await tentarReconectar({ carregouDoBanco: false, ping: async () => true, carregar })
    expect(r.acao).toBe('recarregado')
    expect(carregar).toHaveBeenCalledOnce()
  })

  it('ping volta com load anterior: não recarrega', async () => {
    const carregar = vi.fn()
    expect((await tentarReconectar({ carregouDoBanco: true, ping: async () => true, carregar })).acao).toBe('enviar-pendentes')
    expect(carregar).not.toHaveBeenCalled()
  })
})

describe('reaplicarPendencias', () => {
  const base = {
    schedules: [{ id: 'x', v: 1 }, { id: 'y', v: 1 }, { id: 'w', v: 1 }],
    payees: ['Ana', 'Bia'],
    settings: { financialMonthStartDay: 15, faturasFechadas: { f: true }, categoryGroups: ['Casa'] },
    costCenters: ['cc1'],
  }

  it('o banco vale; só o que mudou no Local é reaplicado, item por item', () => {
    const local = {
      ...base,
      schedules: [{ id: 'x', v: 1 }, { id: 'y', v: 2 }, { id: 'z', v: 1 }], // y alterado, z criado, w apagado
      payees: ['Ana', 'Caio'],
      settings: { ...base.settings, categoryGroups: ['Casa', 'Lazer'] },
    }
    const banco = {
      schedules: [{ id: 'x', v: 9 }, { id: 'y', v: 1 }, { id: 'w', v: 1 }, { id: 'k', v: 1 }], // x mudou em outro aparelho
      payees: ['Ana', 'Bia', 'Duda'],
      settings: { financialMonthStartDay: 15, faturasFechadas: { f: true, g: true }, categoryGroups: ['Casa'] },
      costCenters: ['cc1'],
    }
    const { dados, houvePendencias } = reaplicarPendencias(base, local, banco)
    expect(houvePendencias).toBe(true)
    expect(dados.schedules).toEqual([{ id: 'x', v: 9 }, { id: 'y', v: 2 }, { id: 'k', v: 1 }, { id: 'z', v: 1 }])
    expect(dados.payees).toEqual(['Ana', 'Duda', 'Caio'])
    // faturasFechadas do banco (g) preservada; só categoryGroups veio do Local
    expect(dados.settings).toEqual({ financialMonthStartDay: 15, faturasFechadas: { f: true, g: true }, categoryGroups: ['Casa', 'Lazer'] })
  })

  it('sem nada mexido no Local, devolve o banco intacto', () => {
    const banco = { schedules: [{ id: 'x', v: 9 }], payees: ['Z'], settings: { financialMonthStartDay: 15 }, costCenters: ['cc9'] }
    const { dados, houvePendencias } = reaplicarPendencias(base, { ...base }, banco)
    expect(houvePendencias).toBe(false)
    expect(dados).toEqual(banco)
  })
})
