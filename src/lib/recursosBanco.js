// O que o banco do ambiente suporta (migrações aplicadas), lido no /api/load (api/_db.js
// recursosDoBanco). Funcionalidade nova que depende de coluna/status novos é recusada ANTES de mudar
// a tela: sem isso, o sync descartava a coluna e o app dizia "Tudo sincronizado".
// recursos null (servidor antigo ou ainda carregando) não bloqueia: o servidor recusa por conta própria.

export const MSG_ENVELOPE_DIARIO = 'Não foi possível salvar: o banco deste ambiente ainda não tem a atualização do envelope diário. Nada foi alterado — avise o suporte para atualizar o banco.'
export const MSG_CREDITO_PREVISTO = 'Não foi possível salvar: o banco deste ambiente ainda não tem a atualização da composição antes do pagamento (crédito previsto). Nada foi alterado — avise o suporte para atualizar o banco.'

export const MSG_ENCARGOS = 'Não foi possível salvar: o banco deste ambiente ainda não tem a atualização de encargos e descontos na parcela. Nada foi alterado — avise o suporte para atualizar o banco.'

// Efetivação de provisão: sem a coluna agendamentos.efetivacoes a efetivação continua funcionando, só
// não guarda o vínculo (e não pode ser desfeita). Aviso na modal Efetivar Provisão.
export const MSG_EFETIVACAO_SEM_VINCULO = 'O banco deste ambiente ainda não guarda o vínculo da efetivação: esta efetivação não poderá ser desfeita pelo botão. Avise o suporte para atualizar o banco.'

export const faltaRecurso = (recursos, chave) => !!recursos && recursos[chave] === false
