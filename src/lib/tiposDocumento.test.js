import { describe, it, expect } from 'vitest'
import {
  resolverTipoDocumento, chaveFiltroTipo, filtrarPorTipoDocumento, opcoesTipoDocumento,
  naturezaDoMovimento, tipoDocumentoObrigatorio, ehSintetico, normalizarSigla, moverTipo, soltarTipo,
  SEM_TIPO, itemDaLinhaFluxo,
} from './tiposDocumento'

const TIPOS = [
  { id: 't_fat', nome: 'Fatura', sigla: 'FAT', natureza: 'ambos', cor: '#111', ordem: 1, ativo: true, sistema: false },
  { id: 't_cc', nome: 'Fatura de Cartão', sigla: 'CC', natureza: 'pagar', cor: '#8b5cf6', ordem: 2, ativo: true, sistema: true },
  { id: 't_bol', nome: 'Boleto', sigla: 'BOL', natureza: 'pagar', cor: '#f59e0b', ordem: 3, ativo: true, sistema: false },
  { id: 't_nf', nome: 'Nota Fiscal', sigla: 'NF', natureza: 'ambos', cor: '#0ea5e9', ordem: 4, ativo: true, sistema: false },
  { id: 't_rec', nome: 'Recibo', sigla: 'REC', natureza: 'receber', cor: '#14b8a6', ordem: 5, ativo: true, sistema: false },
  { id: 't_old', nome: 'Antigo', sigla: 'ANT', natureza: 'pagar', cor: null, ordem: 6, ativo: false, sistema: false },
]

describe('resolverTipoDocumento', () => {
  it('tipo gravado vence qualquer fallback (inclusive o de fatura de cartão)', () => {
    expect(resolverTipoDocumento({ tipoDocumentoId: 't_bol' }, TIPOS)).toMatchObject({ sigla: 'BOL', fallback: false })
    expect(resolverTipoDocumento({ tipoDocumentoId: 't_nf', tipo: 'pagamento_fatura' }, TIPOS)).toMatchObject({ sigla: 'NF', fallback: false })
    expect(resolverTipoDocumento({ tipo_documento_id: 't_bol', _envelope: true }, TIPOS).sigla).toBe('BOL')
  })
  it('fatura de cartão sem tipo → CC do cadastro (fallback, não gravado)', () => {
    expect(resolverTipoDocumento({ tipo: 'pagamento_fatura' }, TIPOS)).toMatchObject({ id: 't_cc', sigla: 'CC', fallback: true })
    expect(resolverTipoDocumento({ type: 'credit_payment' }, TIPOS).sigla).toBe('CC')
    expect(resolverTipoDocumento({ overrides: { _gerencialKey: 'acc_cc_2026-10_payment' } }, TIPOS).sigla).toBe('CC') // legado
    expect(resolverTipoDocumento({ _faturaCartao: true }, []).sigla).toBe('CC') // cadastro vazio
  })
  it('envelope → ENV; resgate de reserva → RES; resto → null', () => {
    expect(resolverTipoDocumento({ _envelope: true }, TIPOS).sigla).toBe('ENV')
    expect(resolverTipoDocumento({ tipo: 'resgate_reserva' }, TIPOS).sigla).toBe('RES')
    expect(resolverTipoDocumento({ _key: 'sch_1_resg_2026-10-20' }, TIPOS).sigla).toBe('RES')
    expect(resolverTipoDocumento({ transactionType: 'expense' }, TIPOS)).toBeNull()
  })
  it('id gravado de tipo que não existe mais não vira "sem tipo"', () => {
    expect(resolverTipoDocumento({ tipoDocumentoId: 'sumiu' }, TIPOS).sigla).toBe('?')
  })
})

describe('filtro por tipo', () => {
  const itens = [
    { id: 'a', tipoDocumentoId: 't_bol' },
    { id: 'b', tipo: 'pagamento_fatura' },          // CC por fallback
    { id: 'c', tipoDocumentoId: 't_cc' },           // CC gravado
    { id: 'd' },                                     // sem tipo
    { id: 'e', tipo: 'resgate_reserva' },
  ]
  it('"Sem tipo" pega só quem não resolve nada', () => {
    expect(filtrarPorTipoDocumento(itens, new Set([SEM_TIPO]), TIPOS).map(i => i.id)).toEqual(['d'])
  })
  it('Fatura de Cartão filtra gravado e fallback juntos', () => {
    expect(filtrarPorTipoDocumento(itens, new Set(['t_cc']), TIPOS).map(i => i.id)).toEqual(['b', 'c'])
    expect(chaveFiltroTipo({ tipo: 'pagamento_fatura' }, [])).toBe('CC')
  })
  it('vários tipos + vazio = sem filtro', () => {
    expect(filtrarPorTipoDocumento(itens, new Set(['t_bol', 'RES']), TIPOS).map(i => i.id)).toEqual(['a', 'e'])
    expect(filtrarPorTipoDocumento(itens, new Set(), TIPOS)).toHaveLength(5)
  })
})

describe('formulário', () => {
  it('despesa → pagar/ambos; receita → receber/ambos; transferência → todos; inativo some', () => {
    expect(opcoesTipoDocumento(TIPOS, naturezaDoMovimento('expense')).map(t => t.sigla)).toEqual(['FAT', 'CC', 'BOL', 'NF'])
    expect(opcoesTipoDocumento(TIPOS, naturezaDoMovimento('income')).map(t => t.sigla)).toEqual(['FAT', 'NF', 'REC'])
    expect(opcoesTipoDocumento(TIPOS, naturezaDoMovimento('transfer')).map(t => t.sigla)).toEqual(['FAT', 'CC', 'BOL', 'NF', 'REC'])
  })
  it('valor já gravado aparece mesmo inativo/de outra natureza', () => {
    expect(opcoesTipoDocumento(TIPOS, 'receber', 't_old').map(t => t.sigla)).toContain('ANT')
    expect(opcoesTipoDocumento(TIPOS, 'receber', 't_bol').map(t => t.sigla)).toContain('BOL')
  })
  it('obrigatório só na criação de despesa/receita', () => {
    expect(tipoDocumentoObrigatorio({ criando: true, tipoMov: 'expense' })).toBe(true)
    expect(tipoDocumentoObrigatorio({ criando: true, tipoMov: 'income' })).toBe(true)
    expect(tipoDocumentoObrigatorio({ criando: true, tipoMov: 'transfer' })).toBe(false)
    expect(tipoDocumentoObrigatorio({ criando: false, tipoMov: 'expense' })).toBe(false)
  })
  it('sigla em maiúsculas, sem espaço, até 4', () => {
    expect(normalizarSigla(' gu ia x')).toBe('GUIA')
  })
})

describe('sintéticos e ordenação', () => {
  it('envelopes e resgates previstos não são selecionáveis', () => {
    expect(ehSintetico({ id: 'sch:sch_1@2026-10-20' })).toBe(true)
    expect(ehSintetico({ id: 'env_1', _envelope: true })).toBe(true)
    expect(ehSintetico({ id: 'sch_1760000000000' })).toBe(false)
  })
  it('setas e arrastar', () => {
    expect(moverTipo(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(moverTipo(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c'])
    expect(soltarTipo(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(soltarTipo(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })
})

describe('itemDaLinhaFluxo (coluna Doc. do Fluxo)', () => {
  const ctx = {
    agPorId: new Map([['sch_luz', { id: 'sch_luz', tipoDocumentoId: 't_bol' }], ['sch_cc', { id: 'sch_cc', tipo: 'pagamento_fatura' }]]),
    txPorId: new Map([['tx_pg', { id: 'tx_pg', type: 'transfer', toAccountId: 'acc_cc' }], ['tx_nf', { id: 'tx_nf', type: 'expense', tipoDocumentoId: 't_nf' }]]),
    contaPorId: new Map([['acc_cc', { id: 'acc_cc', type: 'credit' }]]),
  }
  const sigla = (r) => resolverTipoDocumento(itemDaLinhaFluxo(r, ctx), TIPOS)?.sigla ?? null
  it('agendamento, fatura, envelope, resgate, lançamento e provisório', () => {
    expect(sigla({ _key: 'sch_luz_2026-10-20', _scheduleId: 'sch_luz' })).toBe('BOL')
    expect(sigla({ _key: 'sch_cc_2026-10-20', _scheduleId: 'sch_cc' })).toBe('CC')
    expect(sigla({ _key: 'env_1_2026-11-14', _envelope: true })).toBe('ENV')
    expect(sigla({ _key: 'sch_p_resg_2026-10-20', _scheduleId: 'sch_p' })).toBe('RES')
    expect(sigla({ _key: 'tx_pg', real: true })).toBe('CC')
    expect(sigla({ _key: 'tx_nf', _lancamento: true })).toBe('NF')
    expect(sigla({ _key: 'prov_1', _provisorio: { id: 1 } })).toBeNull()
  })
})
