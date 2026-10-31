// Cenário 7 (pendências 31/10), parte de cálculo: grupo gerencial por linha do rateio.
import { describe, it, expect } from 'vitest'
import { partesPorGrupo, linhasDoLancamento } from './rateio'
import { totaisGerenciais } from './gerencialTotais'
import { rowToRateio } from './db'

const GRUPOS = [{ id: 'G', number: 1, name: 'Gerencial' }, { id: 'D', number: 'D', name: 'Despesa' }, { id: 'G2', number: 2, name: 'Grupo 2' }]
const mc = { id: 'mc', type: 'expense', amount: 200, categoryId: 'confra', grupoGerencial: 'G' }

describe('grupo gerencial por linha do rateio', () => {
  it('linha com grupo próprio soma no grupo dela; sem grupo, no do lançamento', () => {
    const linhas = [{ categoriaId: 'confra', valor: 120 }, { categoriaId: 'merc', valor: 80, grupoGerencial: 'D' }]
    expect(Object.fromEntries(partesPorGrupo(mc, linhas))).toEqual({ G: 120, D: 80 })
    const t = totaisGerenciais({ txs: [mc, { id: 'x', type: 'expense', amount: 50, grupoGerencial: 'G2' }], gerencialGroups: GRUPOS, rateios: new Map([['mc', linhas]]) })
    expect(t.items.map(i => [i.g.id, i.total])).toEqual([['G', 120], ['G2', 50], ['D', 80]])
  })

  it('sem rateio ou sem grupo nas linhas: igual ao de antes (lançamento inteiro no grupo dele)', () => {
    const semGrupo = [{ categoriaId: 'confra', valor: 120 }, { categoriaId: 'merc', valor: 80 }]
    expect(Object.fromEntries(partesPorGrupo(mc, null))).toEqual({ G: 200 })
    expect(Object.fromEntries(partesPorGrupo(mc, semGrupo))).toEqual({ G: 200 })
    const antes = totaisGerenciais({ txs: [mc], gerencialGroups: GRUPOS })
    const depois = totaisGerenciais({ txs: [mc], gerencialGroups: GRUPOS, rateios: new Map([['mc', semGrupo]]) })
    expect(depois).toEqual(antes)
  })

  it('a linha guarda o grupo (banco ↔ app) e linhasDoLancamento o preserva', () => {
    expect(rowToRateio({ id: 'r1', lancamento_id: 'mc', categoria_id: 'merc', valor: '80', descricao: null, grupo_gerencial: 'D' }).grupoGerencial).toBe('D')
    expect(rowToRateio({ id: 'r1', lancamento_id: 'mc', categoria_id: 'merc', valor: '80' }).grupoGerencial).toBeNull()
    expect(linhasDoLancamento(mc, [{ categoriaId: 'merc', valor: 80, grupoGerencial: 'D' }])[0].grupoGerencial).toBe('D')
  })
})
