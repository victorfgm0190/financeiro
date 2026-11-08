// Help de campo — conteúdo migrado de src/lib/helpCampos.js (texto do ícone ⓘ).
// `pendente`: falta relacaoComTela e o roteiro do formulário — completar na Etapa 6 (help:check).
const p = (titulo, paraQueServe) => ({ titulo, paraQueServe, relacaoComTela: '', obrigatorio: false, pendente: true })

export const campos = {
  'reserva.conta': p('Conta da reserva', 'Conta de reserva onde fica o dinheiro desta função.'),
  'reserva.saldoInicial': p('Saldo inicial', 'Saldo da função antes do primeiro período registrado.'),
  'reserva.despesaAnual': p('Despesa anual', 'Valor previsto da despesa no ano, usado para planejar os depósitos.'),
  'reserva.depositoMensal': p('Depósito mensal', 'Valor que se pretende guardar por mês para esta função.'),
  'reserva.mesVencimento': p('Mês de vencimento', 'Mês em que a despesa costuma vencer.'),
  'reserva.categoria': p('Categoria', 'Categoria da despesa coberta pela função. Os depósitos aparecem nela nos relatórios.'),
}

export const formularios = {}
