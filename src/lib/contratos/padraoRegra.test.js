// "Lembrar para os próximos": a regra grava o NOME do item, sem datas, quantidades, parênteses e
// sinais — o texto inteiro do boleto ("Espaço Gourmet (20/09/2026- ... - 1) (+)") não casaria no mês
// seguinte. Exemplos tirados de um boleto real (04/11/2026).
import { describe, it, expect } from 'vitest'
import { padraoDaRegra, regraDoItem } from './composicao.js'

describe('padraoDaRegra', () => {
  it('tira datas, parênteses, sinais e quantidades; fica o nome do item', () => {
    expect(padraoDaRegra('Espaço Gourmet (20/09/2026- Espaço Gourmet Sex Sab Dom - 1) (+)')).toBe('Espaço Gourmet')
    expect(padraoDaRegra('Churrasqueira (18/10/2026- Churrasqueira Sex Sab Dom - 10) (+)')).toBe('Churrasqueira')
    expect(padraoDaRegra('Taxa de Condomínio (+)')).toBe('Taxa de Condomínio')
    expect(padraoDaRegra('Fundo Trabalhista (+)')).toBe('Fundo Trabalhista')
    expect(padraoDaRegra('Desconto Excedente Agua (Estorno) (-)')).toBe('Desconto Excedente Agua')
    expect(padraoDaRegra('Água M³: 573,4400(Out) -552,7500(Set)= 20,6900 (+)')).toBe('Água M³')
    expect(padraoDaRegra('(+) Mudança 12/2026 - 3')).toBe('Mudança')
    expect(padraoDaRegra('Fundo de Reserva')).toBe('Fundo de Reserva')
    expect(padraoDaRegra('(+)')).toBe('')
  })

  it('a regra gravada com o padrão casa no boleto do mês seguinte (datas e quantidades diferentes)', () => {
    const regras = [
      { id: 'r1', contrato_id: 'c1', padrao: padraoDaRegra('Espaço Gourmet (20/09/2026- Espaço Gourmet Sex Sab Dom - 1) (+)'), tipo_match: 'comeca_com', responsavel: 'inquilino' },
      { id: 'r2', contrato_id: 'c1', padrao: padraoDaRegra('Churrasqueira (18/10/2026- Churrasqueira Sex Sab Dom - 10) (+)'), tipo_match: 'comeca_com', responsavel: 'inquilino' },
    ]
    expect(regraDoItem('Espaço Gourmet (14/11/2026- Espaço Gourmet Sex Sab Dom - 3) (+)', regras, 'c1')?.id).toBe('r1')
    expect(regraDoItem('Churrasqueira (02/11/2026- Churrasqueira Sex Sab Dom - 2) (+)', regras, 'c1')?.id).toBe('r2')
    // O texto inteiro (como era gravado) não casava:
    const antiga = [{ id: 'x', contrato_id: 'c1', padrao: 'Espaço Gourmet (20/09/2026- Espaço Gourmet Sex Sab Dom - 1) (+)', tipo_match: 'comeca_com', responsavel: 'inquilino' }]
    expect(regraDoItem('Espaço Gourmet (14/11/2026- Espaço Gourmet Sex Sab Dom - 3) (+)', antiga, 'c1')).toBeNull()
  })
})
