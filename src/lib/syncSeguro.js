// Regras do sync que impedem um navegador de sobrescrever o Neon com dados que não vieram dele.
// Funções PURAS (sem React, sem rede), testadas em syncSeguro.test.js.
//
// Origem: em 15/10/2026 um navegador sem cache teve o /api/load falhando, ficou com o defaultData
// em modo "Local" e, quando o ping voltou, o full-sync empurrou tudo: a linha `configuracoes`
// voltou aos valores padrão. Hoje o app só envia depois de um load que deu certo, e só os itens
// alterados, pela fila de pendências (src/lib/filaOffline.js). Daqui saem:
//   • acaoNaReconexao / tentarReconectar: quem nunca carregou recarrega antes de enviar;
//   • idsApagados: ids que sumiram entre dois estados (restauração de backup);
//   • textoConfirmacaoExclusao: a pergunta da exclusão em massa recusada pelo servidor.

// Ids que existiam no estado de referência e não existem mais.
export function idsApagados(prevItems, currItems, chave = 'id') {
  const atuais = new Set((currItems || []).map(i => i?.[chave]))
  return (prevItems || []).map(i => i?.[chave]).filter(id => id != null && !atuais.has(id))
}

// O que fazer quando o ping volta. Quem já carregou do banco nesta sessão envia o pendente (a fila).
// Quem nunca carregou recarrega ANTES de enviar qualquer coisa.
export function acaoNaReconexao({ carregouDoBanco }) {
  return carregouDoBanco ? 'enviar-pendentes' : 'recarregar'
}

// Uma tentativa do retry (a cada 30 s no modo Local, ao voltar a internet e ao voltar a ficar
// visível). `ping` e `carregar` são o pingDb e o loadFromDb (injetados para teste). Devolve:
//   { acao: 'aguardar' }                 — servidor ainda fora; continua Local
//   { acao: 'enviar-pendentes' }         — já carregou nesta sessão; volta a enviar a fila
//   { acao: 'recarregado', result }      — nunca carregou; `result` do load para aplicar ANTES de
//                                          qualquer envio (status 'error' = continua Local)
export async function tentarReconectar({ carregouDoBanco, ping, carregar }) {
  if (!(await ping())) return { acao: 'aguardar' }
  if (acaoNaReconexao({ carregouDoBanco }) === 'enviar-pendentes') return { acao: 'enviar-pendentes' }
  return { acao: 'recarregado', result: await carregar() }
}

// Pergunta da exclusão em massa (409 de api/_syncTrava.js) com o nome que aparece na tela, nunca o
// nome técnico da tabela: "Isso vai apagar 120 de 400 lançamentos. Confirma?"
export const NOMES_NA_TELA = {
  lancamentos: 'lançamentos', agendamentos: 'agendamentos', categorias: 'categorias', orcamento: 'itens do orçamento',
  regras_classificacao: 'regras de classificação', gerencial_rules: 'regras gerenciais', reservas_funcoes: 'grupos gerenciais',
  reservas: 'contas a pagar', envelopes: 'envelopes', grupos_conta: 'grupos de contas', perfis: 'perfis',
  card_imports: 'importações de fatura', reserve_functions: 'funções de reserva', favorecido_alias: 'apelidos de favorecido',
  contas: 'contas', cartoes: 'cartões', favorecidos: 'favorecidos',
}

export function textoConfirmacaoExclusao({ tabela, apagar, total }) {
  return `Isso vai apagar ${apagar} de ${total} ${NOMES_NA_TELA[tabela] || 'registros'}. Confirma?`
}
