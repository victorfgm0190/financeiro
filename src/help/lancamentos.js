// Help de campo — conteúdo migrado de src/lib/helpCampos.js (texto do ícone ⓘ).
// `pendente`: falta relacaoComTela e o roteiro do formulário — completar na Etapa 6 (help:check).
const p = (titulo, paraQueServe) => ({ titulo, paraQueServe, relacaoComTela: '', obrigatorio: false, pendente: true })

export const campos = {
  'lancamento.tipo': p('Tipo', 'Define se o valor entra, sai ou passa de uma conta para outra.'),
  'lancamento.dataBanco': p('Data no banco', 'Data em que o banco registrou o lançamento, quando diferente da data de competência.'),
  'lancamento.faturaReferencia': p('Fatura de referência', 'Fatura do cartão em que esta compra é cobrada.'),
  'lancamento.centroCusto': p('Centro de custo', 'Separa os valores por área ou finalidade nos relatórios.'),
  'lancamento.numeroContrato': p('Número do contrato', 'Número do contrato ligado a este lançamento, usado para localizá-lo depois.'),
  'lancamento.contaReserva': p('Conta de reserva', 'Conta de reserva que vai pagar esta despesa por meio de um resgate.'),
  'lancamento.funcaoReserva': p('Função de reserva', 'Objetivo de reserva a que este valor pertence. Entra nas entradas ou saídas dessa função.'),
  'lancamento.classificacaoGerencial': p('Classificação gerencial', 'Define como o dinheiro se move no controle gerencial ao gravar este lançamento.'),
}

export const formularios = {}
