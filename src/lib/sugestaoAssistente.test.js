// Formato da sugestão do Assistente para a Importar Fatura (Etapa 6c; nesta etapa nada chama a IA). Dados fictícios.
import { describe, it, expect } from 'vitest'
import { validarSugestao } from './sugestaoAssistente.js'

describe('sugestão do Assistente (formato da Etapa 6c)', () => {
  const ok = { linhaId: 'l1', decisao: 'mesmo', candidatoId: 't1', confianca: 'alta', motivo: 'Mesma loja e mesmo valor.' }
  it('aceita só candidato da lista e categoria do perfil', () => {
    expect(validarSugestao(ok, { linhaId: 'l1', candidatosIds: ['t1'] })).toMatchObject({ decisao: 'mesmo', candidatoId: 't1' })
    expect(validarSugestao(ok, { linhaId: 'l1', candidatosIds: ['t2'] })).toBeNull()
    expect(validarSugestao(ok, { linhaId: 'l2', candidatosIds: ['t1'] })).toBeNull()
    const cat = { linhaId: 'l1', decisao: null, categoriaId: 'c1', confianca: 'media', motivo: 'Como nas outras faturas.' }
    expect(validarSugestao(cat, { linhaId: 'l1', categoriasIds: ['c1'] })).toMatchObject({ categoriaId: 'c1' })
    expect(validarSugestao(cat, { linhaId: 'l1', categoriasIds: ['c2'] })).toBeNull()
    expect(validarSugestao({ ...ok, confianca: 'total' }, { linhaId: 'l1', candidatosIds: ['t1'] })).toBeNull()
    expect(validarSugestao({ ...ok, motivo: '' }, { linhaId: 'l1', candidatosIds: ['t1'] })).toBeNull()
    expect(validarSugestao(null, { linhaId: 'l1' })).toBeNull()
  })
  it('motivo limitado a 140 caracteres', () => {
    expect(validarSugestao({ ...ok, motivo: 'x'.repeat(300) }, { linhaId: 'l1', candidatosIds: ['t1'] }).motivo).toHaveLength(140)
  })
})
