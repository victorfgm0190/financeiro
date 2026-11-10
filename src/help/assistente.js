// Help de campo — cartões de prévia do Assistente (Etapa 3, bloco 5b): agendamento, baixa, contrato,
// despesa, lote, compra em dólar, já na fatura, escolher conta e consultas. A caixa de mensagem e os
// anexos ficam fora. Texto curto. Nada específico de um cliente.

const c = (titulo, paraQueServe, relacaoComTela, obrigatorio = false) => ({ titulo, paraQueServe, relacaoComTela, obrigatorio })

export const campos = {
  'previaAgendamento.ativo': c('Agendamento', 'Grava também um agendamento para as próximas vezes.', 'Desmarcado, só a despesa é gravada em "Confirmar tudo".'),
  'previaAgendamento.recorrencia': c('Recorrência', 'De quanto em quanto tempo o agendamento repete.', 'Muda a data da primeira ocorrência mostrada ao lado.', true),
  'previaAgendamento.ateQuando': c('Até quando', 'Sem fim, até uma data ou por um número de vezes.', 'Define quantas ocorrências o agendamento terá.', true),
  'previaBaixa.marcar': c('Dar baixa no agendamento', 'Usa este lançamento como o pagamento da ocorrência.', 'Desmarcado, o lançamento fica avulso e a ocorrência continua pendente.'),
  'previaBaixa.qual': c('Qual agendamento', 'Escolhe a ocorrência que recebe a baixa.', 'Só aparece quando há mais de um agendamento parecido.', true),
  'previaContrato.marcar': c('Vincular ao contrato', 'Liga o lançamento ao contrato com o número lido no documento.', 'Desmarcado, o lançamento é gravado sem contrato.'),
  'previaDespesa.marcar': c('Despesa', 'Grava a despesa junto com o agendamento.', 'Desmarcada, só o agendamento é gravado.'),
  'previaLote.selecionar': c('Marcar o item', 'Inclui o item na gravação em lote.', 'Itens desmarcados não são gravados.'),
  'previaLote.conta': c('Conta do item', 'Conta em que o item será lançado.', 'Troca só a conta deste item.', true),
  'compraDolar.categoriaIof': c('Categoria do IOF', 'Categoria do lançamento separado do IOF.', 'O IOF é recalculado sobre o valor em reais que for salvo.'),
  'jaNaFatura.qual': c('Qual lançamento', 'Escolhe o lançamento da fatura que corresponde a este.', 'Confirmar usa o escolhido; nada novo é criado.', true),
  'escolherConta.outra': c('Outra conta', 'Escolhe uma conta fora das sugeridas.', 'A prévia passa a usar a conta escolhida.', true),
  'consultaAssistente.detalhe': c('Detalhe', 'Outra palavra da descrição ou o favorecido.', 'O Assistente procura de novo com o detalhe.'),
  'consultaAssistente.outroNome': c('Outro nome', 'Outro jeito de escrever o favorecido ou a categoria.', 'O Assistente refaz a consulta com o novo nome.'),
  'consultaAssistente.de': c('De', 'Primeiro dia da consulta.', 'Clique em "Aplicar" para refazer a consulta.', true),
  'consultaAssistente.ate': c('Até', 'Último dia da consulta.', 'Clique em "Aplicar" para refazer a consulta.', true),
  'consultaAssistente.conta': c('Conta', 'Conta cujo saldo é mostrado.', 'Os saldos abaixo mudam na hora.', true),
  'consultaAssistente.cartao': c('Cartão', 'Cartão cuja fatura é mostrada.', 'A situação da fatura abaixo muda na hora.', true),
  'consultaAssistente.resposta': c('Outra resposta', 'Responde ao Assistente com suas palavras.', 'Use quando nenhuma opção dos botões servir.'),
}

export const formularios = {}
