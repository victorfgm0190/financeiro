// Help de campo — conteúdo migrado de src/lib/helpCampos.js (texto do ícone ⓘ).
// `pendente`: falta relacaoComTela e o roteiro do formulário — completar na Etapa 6 (help:check).
const p = (titulo, paraQueServe) => ({ titulo, paraQueServe, relacaoComTela: '', obrigatorio: false, pendente: true })

export const campos = {
  'conta.tipo': p('Tipo de conta', 'Define como a conta se comporta: corrente, cartão, investimento, bem ou dívida. Muda os campos e os cálculos disponíveis.'),
  'conta.apelido': p('Apelido', 'Nome curto usado no extrato gerencial e nos selos da conta. Até 8 caracteres.'),
  'conta.vinculo': p('Vínculo (perfil)', 'Perfil (CPF ou CNPJ) dono da conta. Define em que perfil a conta e seus lançamentos aparecem.'),
  'conta.grupo': p('Grupo', 'Agrupa contas para organizar a lista e somar saldos em conjunto.'),
  'conta.saldoInicial': p('Saldo inicial', 'Saldo da conta antes do primeiro lançamento registrado. O saldo atual é calculado a partir dele.'),
  'conta.tipoReserva': p('Tipo de reserva', 'Geral guarda dinheiro sem destino fixo; específica fica ligada a uma categoria de despesa.'),
  'conta.categoriaReserva': p('Categoria da reserva', 'Categoria da despesa que esta reserva cobre. Os depósitos aparecem nela nos relatórios.'),
  'conta.categoriaInvestimento': p('Categoria do investimento', 'Categoria usada para registrar as aplicações e os resgates desta conta.'),
  'conta.categoriaRendimento': p('Categoria do rendimento', 'Categoria da receita criada pelo botão Lançar Rendimento desta conta.'),
  'conta.rendimentoPor': p('Rendimento por', 'Indica se o rendimento é informado para esta conta sozinha ou para o grupo de contas inteiro.'),
  'cartao.limite': p('Limite', 'Valor total de crédito do cartão. O disponível é calculado descontando as compras em aberto.'),
  'cartao.fechamento': p('Dia de fechamento', 'Dia em que a fatura fecha. Compras depois dele entram na fatura seguinte.'),
  'cartao.vencimento': p('Dia de vencimento', 'Dia em que a fatura vence e o pagamento é agendado.'),
  'cartao.finais': p('Finais do cartão', 'Últimos dígitos do cartão, usados para reconhecer as compras na importação da fatura.'),
  'cartao.spread': p('Spread', 'Acréscimo sobre a cotação usado nas compras em dólar enquanto não há faturas conferidas.'),
  'cartao.contaPagadora': p('Conta pagadora', 'Conta de onde sai o pagamento da fatura.'),
}

export const formularios = {}
