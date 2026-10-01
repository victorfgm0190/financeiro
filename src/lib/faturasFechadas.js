// Fatura fechada/aberta — critério ÚNICO, usado pelo botão "Fechar Fatura" (AppContext) e pelo
// Motor de Integridade. Persistido em configuracoes.faturas_fechadas (JSONB, linha id = 1), que o app
// lê como settings.faturasFechadas = { '<cardId>_<YYYY-MM>': true }. Reabrir remove a chave.
//
// Import com .js: este módulo também é carregado pelo Node ESM das funções da Vercel.

export const chaveFaturaFechada = (cardId, faturaMonthYear) => `${cardId}_${faturaMonthYear}`

export const faturaEstaFechada = (faturasFechadas, cardId, faturaMonthYear) =>
  !!(cardId && faturaMonthYear && faturasFechadas?.[chaveFaturaFechada(cardId, faturaMonthYear)] === true)
