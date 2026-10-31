// "Nº do contrato" só aparece com tipo de documento que costuma tê-lo, já preenchido ou pedido.
import { describe, it, expect } from 'vitest'
import { tipoDocumentoComContrato, mostrarNumeroContrato } from './tiposDocumento'

// Cadastro de um cliente qualquer (nomes/siglas variados, nada fixo do app).
const TIPOS = [
  { id: 't1', sigla: 'BOL', nome: 'Boleto bancário' },
  { id: 't2', sigla: 'FT', nome: 'Fatura de consumo' },
  { id: 't3', sigla: 'CN', nome: 'Carnê' },
  { id: 't4', sigla: 'NF', nome: 'Nota fiscal' },
  { id: 't5', sigla: 'CC', nome: 'Fatura de Cartão', sistema: true },
  { id: 't6', sigla: 'REC', nome: 'Recibo' },
  { id: 't7', sigla: 'COB', nome: 'Cobrança mensal' },
]

describe('tipoDocumentoComContrato', () => {
  it('boleto, fatura, carnê e cobrança, pelo nome do cadastro do cliente', () => {
    expect(['t1', 't2', 't3', 't7'].map(id => tipoDocumentoComContrato(id, TIPOS))).toEqual([true, true, true, true])
  })
  it('nota, recibo, fatura de CARTÃO, sem tipo e tipo que sumiu do cadastro → não', () => {
    expect(['t4', 't6', 't5', '', 'x'].map(id => tipoDocumentoComContrato(id, TIPOS))).toEqual([false, false, false, false, false])
  })
})

describe('mostrarNumeroContrato', () => {
  it('despesa comum sem tipo (gasolina) → escondido', () => {
    expect(mostrarNumeroContrato({ tipoDocumentoId: '', numeroContrato: '', tipos: TIPOS })).toBe(false)
    expect(mostrarNumeroContrato({ tipoDocumentoId: 't4', numeroContrato: '  ', tipos: TIPOS })).toBe(false)
  })
  it('tipo de boleto/fatura/carnê, já preenchido (Assistente/edição) ou pedido → aparece', () => {
    expect(mostrarNumeroContrato({ tipoDocumentoId: 't3', numeroContrato: '', tipos: TIPOS })).toBe(true)
    expect(mostrarNumeroContrato({ tipoDocumentoId: '', numeroContrato: '778', tipos: TIPOS })).toBe(true)
    expect(mostrarNumeroContrato({ tipoDocumentoId: '', numeroContrato: '', tipos: TIPOS, pedido: true })).toBe(true)
  })
})
