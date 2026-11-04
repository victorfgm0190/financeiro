// O que o banco do ambiente suporta (migrações aplicadas), lido no /api/load (api/_db.js
// recursosDoBanco). Funcionalidade nova que depende de coluna/status novos é recusada ANTES de mudar
// a tela: sem isso, o sync descartava a coluna e o app dizia "Tudo sincronizado".
// recursos null (servidor antigo ou ainda carregando) não bloqueia: o servidor recusa por conta própria.

export const MSG_ENVELOPE_DIARIO = 'Não foi possível salvar: o banco deste ambiente ainda não tem a atualização do envelope diário. Nada foi alterado — avise o suporte para atualizar o banco.'
export const MSG_CREDITO_PREVISTO = 'Não foi possível salvar: o banco deste ambiente ainda não tem a atualização da composição antes do pagamento (crédito previsto). Nada foi alterado — avise o suporte para atualizar o banco.'

export const faltaRecurso = (recursos, chave) => !!recursos && recursos[chave] === false
