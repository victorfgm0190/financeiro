import { describe, it, expect } from 'vitest'
import { agruparPorDia, HORIZONTES_MOBILE, marcadoresLinhaMobile } from './fluxoMobile'
import { STATUS_CONFIRMACAO } from './fluxoStatus'

describe('agruparPorDia', () => {
  it('agrupa linhas consecutivas do mesmo dia, mantendo a ordem', () => {
    const rows = [
      { _key: 'a', date: '2026-10-13' },
      { _key: 'b', date: '2026-10-13' },
      { _key: 'c', date: '2026-10-20' },
    ]
    expect(agruparPorDia(rows)).toEqual([
      { date: '2026-10-13', rows: [rows[0], rows[1]] },
      { date: '2026-10-20', rows: [rows[2]] },
    ])
  })

  it('lista vazia ou ausente → []', () => {
    expect(agruparPorDia([])).toEqual([])
    expect(agruparPorDia(undefined)).toEqual([])
  })
})

describe('HORIZONTES_MOBILE', () => {
  it('Mês | 3 meses | 12 meses em dias', () => {
    expect(HORIZONTES_MOBILE.map(h => h.dias)).toEqual([30, 90, 365])
  })
})

describe('marcadoresLinhaMobile', () => {
  const TIPOS = [
    { id: 't_pix', sigla: 'PIX', nome: 'Pix', cor: '#10b981' },
    { id: 't_cc', sigla: 'CC', nome: 'Fatura de Cartão', cor: '#8b5cf6', sistema: true },
  ]
  const semanal = { frequency: 'weekly', startDate: '2026-10-13', registered: [], skipped: [] }
  const ctx = {
    agPorId: new Map([
      ['sch_pix', { id: 'sch_pix', tipoDocumentoId: 't_pix', confirmado: true, ...semanal }],
      ['sch_cc', { id: 'sch_cc', tipo: 'pagamento_fatura', confirmado: false, ...semanal }],
      ['sch_nada', { id: 'sch_nada', confirmado: false, ...semanal }],
    ]),
    txPorId: new Map(),
    contaPorId: new Map(),
  }
  const linha = (id, d = '2026-10-13') => ({ _key: `${id}_${d}`, _scheduleId: id, _origDate: d, real: false })
  const m = (r) => marcadoresLinhaMobile(r, ctx, TIPOS)

  it('tipo PIX gravado → badge PIX', () => {
    expect(m(linha('sch_pix')).doc).toMatchObject({ sigla: 'PIX', nome: 'Pix' })
  })
  it('envelope e resgate (fallback ENV/RES) → sem badge', () => {
    expect(m({ _key: 'env_1_2026-11-14', _envelope: true }).doc).toBeNull()
    expect(m({ _key: 'sch_p_resg_2026-10-20', _scheduleId: 'sch_p' }).doc).toBeNull()
  })
  it('fatura de cartão → CC', () => {
    expect(m(linha('sch_cc')).doc?.sigla).toBe('CC')
  })
  it('sem tipo → nada', () => {
    expect(m(linha('sch_nada')).doc).toBeNull()
    expect(m({ _key: 'prov_1', _provisorio: { id: 1 } })).toEqual({ doc: null, status: null })
  })
  it('Confirmado → confirmado; A confirmar → a_confirmar; sem status → null', () => {
    expect(m(linha('sch_pix')).status).toBe(STATUS_CONFIRMACAO.CONFIRMADO)
    expect(m(linha('sch_pix', '2026-10-20')).status).toBe(STATUS_CONFIRMACAO.A_CONFIRMAR)
    expect(m(linha('sch_nada')).status).toBe(STATUS_CONFIRMACAO.A_CONFIRMAR)
    expect(m({ _key: 'env_1_2026-11-14', _envelope: true }).status).toBeNull()
  })
})
