import { describe, it, expect } from 'vitest'
import { validarAcao } from './acoes'
import { classificarContas } from './contas'
import { initialDaSugestao } from '../assistente'

const ROWS = [{ id: 'cc', name: 'Conta Principal', apelido: 'Conta', type: 'checking', is_main: true, profile_id: 'P', active: true }]
const montar = (textoPedido) => {
  const contas = classificarContas(ROWS, 'P')
  return {
    contas, textoPedido, apelidos: [], perfilAtivo: 'P', temImagem: false,
    idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: new Map([['cat_seg', { tipo: 'expense' }]]), favorecidos: new Map(), centros: new Map() },
  }
}
const base = { tipo: 'despesa', conta_id: 'cc', categoria_id: 'cat_seg', descricao: 'Seguro', valor: 2800, vencimento: '2027-03-25', confianca: {} }
const FRASE = 'seguro de 2800 todo ano dia 25/03 em 12x'
const validar = (input, texto = FRASE) => validarAcao('criar_agendamento', { ...base, ...input }, montar(texto), '2026-11-07')

describe('Assistente: recorrência parcelada', () => {
  it('"seguro de 2800 todo ano dia 25/03 em 12x" vira Anual + 12 parcelas, não 12 anos', () => {
    const r = validar({ recorrencia: 'annual', parcelas_por_ocorrencia: 12 })
    expect(r).toMatchObject({ recorrencia: 'annual', parcelas_por_ocorrencia: 12, parcelas: null, valor: 2800 })
    const ini = initialDaSugestao('criar_agendamento', r)
    expect(ini).toMatchObject({ frequency: 'annual', occurrenceType: 'continuous', parcelasPorOcorrencia: 12, startDate: '2027-03-25' })
  })
  it('modelo que manda "parcelas: 12" na mesma frase é corrigido pelo texto', () => {
    expect(validar({ recorrencia: 'annual', parcelas: 12 })).toMatchObject({ parcelas_por_ocorrencia: 12, parcelas: null })
  })
  it('"por 12 anos" continua sendo Nº de ocorrências', () => {
    const r = validar({ recorrencia: 'annual', parcelas: 12 }, 'seguro de 2800 todo ano por 12 anos')
    expect(r.parcelas).toBe(12)
    expect(r.parcelas_por_ocorrencia).toBeUndefined()
  })
  it('acima do limite do período: não aplica e avisa', () => {
    const r = validar({ recorrencia: 'annual', parcelas_por_ocorrencia: 18 }, 'seguro de 2800 todo ano em 18x')
    expect(r.parcelas_por_ocorrencia).toBeUndefined()
    expect(r.aviso_parcelas_ocorrencia).toMatch('no máximo 12 parcelas')
    expect(validar({ recorrencia: 'quarterly', parcelas_por_ocorrencia: 4 }).aviso_parcelas_ocorrencia).toMatch('no máximo 3 parcelas')
  })
  it('Única aceita qualquer N; Mensal e Transferência não parcelam', () => {
    expect(validar({ recorrencia: 'once', parcelas_por_ocorrencia: 24 }).parcelas_por_ocorrencia).toBe(24)
    expect(validar({ recorrencia: 'monthly', parcelas_por_ocorrencia: 12 }).parcelas_por_ocorrencia).toBeUndefined()
    expect(validar({ recorrencia: 'annual', tipo: 'transferencia', parcelas_por_ocorrencia: 12 }).parcelas_por_ocorrencia).toBeUndefined()
  })
})
