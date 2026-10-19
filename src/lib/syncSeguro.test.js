import { describe, it, expect, vi } from 'vitest'
import { idsApagados, acaoNaReconexao, tentarReconectar, textoConfirmacaoExclusao } from './syncSeguro.js'

describe('apagados', () => {
  it('ids que estavam no estado anterior e sumiram', () => {
    expect(idsApagados([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }])).toEqual(['a'])
    expect(idsApagados(undefined, [{ id: 'b' }])).toEqual([])
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

describe('pergunta da exclusão em massa', () => {
  it('usa o nome da tela, não o da tabela', () => {
    expect(textoConfirmacaoExclusao({ tabela: 'lancamentos', apagar: 120, total: 400 })).toBe('Isso vai apagar 120 de 400 lançamentos. Confirma?')
    expect(textoConfirmacaoExclusao({ tabela: 'agendamentos', apagar: 6, total: 20 })).toBe('Isso vai apagar 6 de 20 agendamentos. Confirma?')
    expect(textoConfirmacaoExclusao({ tabela: 'tabela_nova', apagar: 5, total: 10 })).toBe('Isso vai apagar 5 de 10 registros. Confirma?')
  })
})
