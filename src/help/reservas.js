// Help de campo — RESERVAS: cadastro de função de reserva (src/components/Reservas/ReservasPanel.jsx,
// data-help-form="reserva"). Nada específico de um cliente.

export const campos = {
  'reserva.nome': {
    titulo: 'Nome da função',
    paraQueServe: 'Objetivo da reserva: a despesa para a qual o dinheiro é guardado.',
    relacaoComTela: 'É o nome escolhido em "Função de reserva" nos lançamentos e agendamentos de depósito e resgate.',
    obrigatorio: true,
    exemplo: 'IPTU',
  },
  'reserva.conta': {
    titulo: 'Conta da reserva',
    paraQueServe: 'Conta de reserva onde fica o dinheiro desta função.',
    relacaoComTela: 'Os depósitos e resgates nesta conta podem ser atribuídos à função; os valores calculados abaixo usam os lançamentos dela.',
    obrigatorio: false,
  },
  'reserva.saldoInicial': {
    titulo: 'Saldo inicial',
    paraQueServe: 'Saldo da função antes do primeiro período registrado.',
    relacaoComTela: 'Somado às entradas e saídas da função, dá o saldo dela em Reservas. Aceita negativo.',
    obrigatorio: false,
  },
  'reserva.despesaAnual': {
    titulo: 'Despesa anual',
    paraQueServe: 'Valor previsto da despesa no ano, usado para planejar os depósitos.',
    relacaoComTela: 'Com dados suficientes, o app sugere o valor a partir dos lançamentos e agendamentos ("Usar valor calculado"). Distribuído pelo mês de vencimento.',
    obrigatorio: false,
  },
  'reserva.depositoMensal': {
    titulo: 'Depósito mensal',
    paraQueServe: 'Valor que se pretende guardar por mês para esta função.',
    relacaoComTela: 'Entra no planejamento da reserva. O app sugere um valor a partir dos depósitos já feitos e agendados.',
    obrigatorio: false,
  },
  'reserva.mesVencimento': {
    titulo: 'Mês de vencimento',
    paraQueServe: 'Mês em que a despesa costuma vencer.',
    relacaoComTela: 'Sem mês, a despesa anual é dividida em 12 parcelas mensais. O app sugere o mês de maior saída.',
    obrigatorio: false,
  },
  'reserva.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Categoria da despesa coberta pela função. Os depósitos aparecem nela nos relatórios.',
    relacaoComTela: 'As sombras de reserva (depósitos e resgates) herdam esta categoria no Resultado por Categoria.',
    obrigatorio: false,
  },
  'reserva.contarComoDespesa': {
    titulo: 'Contar como despesa',
    paraQueServe: 'Decide se os depósitos e resgates desta função entram como despesa nos totais.',
    relacaoComTela: 'Marcado: entram nos totais de despesa do Dashboard e dos Relatórios. Desmarcado: são ignorados (ex.: poupança).',
    obrigatorio: false,
  },
}

export const formularios = {}
