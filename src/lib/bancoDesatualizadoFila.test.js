// Banco do ambiente sem a migração: o /api/sync responde 409 (api/_db.js ErroBancoDesatualizado). O app
// trata como RECUSA — a alteração fica marcada com o motivo e o indicador NUNCA diz "Tudo
// sincronizado" (antes: 200, colunas descartadas, "Tudo sincronizado" e a alteração sumia ao recarregar).
import { describe, it, expect } from 'vitest'
import { tipoDeFalha, motivoDaRecusa, enviarFilaIsolando } from './filaOffline'
import { textoIndicador } from './offlineUi'

const MSG = 'O banco deste ambiente ainda não tem a atualização necessária para gravar isto (envelopes.tipo_orcamento). Nada foi gravado — avise o suporte para atualizar o banco.'
const erro409 = () => Object.assign(new Error(`POST /api/sync → 409: ${MSG}`), { status: 409, codigo: 'banco_desatualizado', dados: { error: MSG, codigo: 'banco_desatualizado' } })

describe('recusa por banco desatualizado', () => {
  it('409 é recusa (não rede nem servidor): mostra o motivo do servidor', () => {
    expect(tipoDeFalha(erro409())).toBe('recusa')
    expect(motivoDaRecusa(erro409())).toBe(MSG)
  })

  it('o envelope recusado fica com erro; os outros seguem; o indicador mostra o erro, não "Tudo sincronizado"', async () => {
    const env = { id: 'e1', secao: 'envelopes' }
    const cat = { id: 'c1', secao: 'categorias' }
    const enviar = async (lote) => { if (lote.includes(env)) throw erro409(); return lote }
    const { enviadas, falhas } = await enviarFilaIsolando([env, cat], enviar)
    expect(enviadas).toEqual([cat])
    expect(falhas.map(f => f.entrada)).toEqual([env])
    expect(textoIndicador({ online: true, pendentes: 0, erros: falhas.length })).toBe('1 alteração com erro — ver detalhes')
    expect(textoIndicador({ online: true, pendentes: 0, erros: 0 })).toBe('Tudo sincronizado')
  })
})
