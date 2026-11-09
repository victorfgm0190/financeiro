// Help de campo — LANÇAMENTOS: formulário de lançamento (rápido do celular e completo) —
// src/components/Transactions/TransactionForm.jsx, data-help-form="lancamento".
// Campo: { titulo, paraQueServe, relacaoComTela, oQueAconteceAoSalvar?, obrigatorio, quandoUsar?, atencao?, exemplo? }
// Nada específico de um cliente.

export const campos = {
  // ── Básico ────────────────────────────────────────────────────────────────────────────────────
  'lancamento.tipo': {
    titulo: 'Tipo',
    paraQueServe: 'Define se o valor entra (receita), sai (despesa) ou passa de uma conta para outra (transferência).',
    relacaoComTela: 'Transferência troca categoria e favorecido por conta de destino; transferência para cartão vira pagamento de fatura e não conta como despesa (as compras já contaram).',
    obrigatorio: true,
  },
  'lancamento.conta': {
    titulo: 'Conta',
    paraQueServe: 'Conta onde o valor entra ou sai (na transferência, a conta de origem).',
    relacaoComTela: 'O saldo dela é recalculado ao salvar. Cartão de crédito mostra a fatura de referência, a data do banco e o parcelamento; as categorias oferecidas são as do perfil da conta.',
    obrigatorio: true,
  },
  'lancamento.contaDestino': {
    titulo: 'Conta destino',
    paraQueServe: 'Conta que recebe o valor da transferência.',
    relacaoComTela: 'Cartão mostra a fatura que está sendo paga; reserva mostra a categoria e a função de reserva; conta de aplicação ou bem permite categoria. Contas de perfis diferentes pedem a categoria de cada perfil.',
    obrigatorio: true,
  },
  'lancamento.valor': {
    titulo: 'Valor',
    paraQueServe: 'Quanto entrou, saiu ou foi transferido, em reais.',
    relacaoComTela: 'Na compra parcelada no cartão é o total: ele é dividido pelas parcelas (a última absorve os centavos). Com rateio, as linhas precisam fechar este valor.',
    obrigatorio: true,
    exemplo: '89,90',
  },
  'lancamento.data': {
    titulo: 'Data',
    paraQueServe: 'Dia do lançamento (competência).',
    relacaoComTela: 'Ordena o extrato e define o mês dos relatórios. No cartão, junto com o fechamento, define a fatura automática.',
    obrigatorio: true,
  },
  'lancamento.dataBanco': {
    titulo: 'Data no banco',
    paraQueServe: 'Data original do extrato do cartão, quando diferente da data do lançamento.',
    relacaoComTela: 'Fica em branco nos lançamentos manuais; preencha só para corrigir quando o banco enviou a data errada. Não muda a fatura escolhida.',
    obrigatorio: false,
  },
  'lancamento.descricao': {
    titulo: 'Descrição',
    paraQueServe: 'Texto que identifica o lançamento no extrato.',
    relacaoComTela: 'Ao digitar, o app sugere categoria e favorecido de lançamentos parecidos e das regras de classificação.',
    obrigatorio: false,
    exemplo: 'Supermercado',
  },
  'lancamento.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Classifica a receita ou despesa nos relatórios e no orçamento.',
    relacaoComTela: '"Dividir em categorias" troca a categoria única por um rateio. Categoria de outro perfil é avisada. Em despesa, a categoria pode sugerir a reserva específica ligada a ela.',
    obrigatorio: false,
  },
  'lancamento.favorecido': {
    titulo: 'Favorecido',
    paraQueServe: 'Quem recebeu ou pagou o valor.',
    relacaoComTela: 'Sugere nomes já usados. "Renomear em todos" troca o nome em todos os lançamentos, agendamentos e regras (com prévia).',
    obrigatorio: false,
  },
  'lancamento.centroCusto': {
    titulo: 'Centro de custo',
    paraQueServe: 'Separa os valores por área ou finalidade nos relatórios.',
    relacaoComTela: 'Filtro e agrupamento extra nos relatórios. Não muda saldos nem categorias.',
    obrigatorio: false,
  },
  'lancamento.tipoDocumento': {
    titulo: 'Tipo de documento',
    paraQueServe: 'Documento que comprova o lançamento (boleto, nota, recibo…).',
    relacaoComTela: 'Obrigatório quando o ambiente exige (Configurações). Alguns tipos mostram o campo "Nº do contrato".',
    obrigatorio: false,
  },
  'lancamento.numeroContrato': {
    titulo: 'Número do contrato',
    paraQueServe: 'Número do contrato ligado a este lançamento, usado para localizá-lo depois.',
    relacaoComTela: 'Aparece pelo tipo de documento ou pelo botão "+ Nº do contrato". Só registro e busca.',
    obrigatorio: false,
  },
  'lancamento.observacoes': {
    titulo: 'Observações',
    paraQueServe: 'Anotações livres sobre o lançamento.',
    relacaoComTela: 'Só registro. Não muda valores nem relatórios.',
    obrigatorio: false,
  },

  // ── Cartão ────────────────────────────────────────────────────────────────────────────────────
  'lancamento.faturaReferencia': {
    titulo: 'Fatura de referência',
    paraQueServe: 'Fatura do cartão em que esta compra é cobrada.',
    relacaoComTela: '"(automático)" calcula pela data e pelo fechamento do cartão (fatura fechada → a próxima aberta). Escolher uma fatura grava ela no lançamento; fatura fechada é avisada.',
    obrigatorio: false,
  },
  'lancamento.faturaPagamento': {
    titulo: 'Fatura paga',
    paraQueServe: 'Na transferência para o cartão, a fatura que este pagamento quita.',
    relacaoComTela: 'Vinculada, abate a dívida da fatura e conta como pagamento real; mostra quanto falta ou foi pago a mais. Sem vínculo, é uma transferência comum.',
    obrigatorio: false,
  },
  'lancamento.parcelado': {
    titulo: 'Parcelado',
    paraQueServe: 'Marque para dividir a compra no cartão em parcelas.',
    relacaoComTela: 'Ligado, o Valor passa a ser o total e aparece o número de parcelas. Ao salvar, cada parcela vai para a fatura do seu mês.',
    obrigatorio: false,
  },
  'lancamento.parcelas': {
    titulo: 'Número de parcelas',
    paraQueServe: 'Em quantas vezes a compra foi parcelada (2 a 48).',
    relacaoComTela: 'Mostra o valor de cada parcela; a última absorve a diferença de centavos.',
    obrigatorio: false,
  },
  'lancamento.parcelaSerie': {
    titulo: 'Parcela N de M',
    paraQueServe: 'Mostra (e permite corrigir) a posição desta parcela na compra parcelada.',
    relacaoComTela: 'Lista as outras parcelas da série e oferece gerar as que faltam. "↩ à vista" tira o parcelamento deste lançamento.',
    obrigatorio: false,
  },

  // ── Reserva e gerencial ───────────────────────────────────────────────────────────────────────
  'lancamento.usarReserva': {
    titulo: 'Será pago com reserva',
    paraQueServe: 'Indica que esta despesa vai ser coberta por uma conta de reserva.',
    relacaoComTela: 'Ligado, pede a conta de reserva (e a função). A despesa registra o vínculo; depois é agendado o resgate da reserva para a conta principal.',
    obrigatorio: false,
  },
  'lancamento.contaReserva': {
    titulo: 'Conta de reserva',
    paraQueServe: 'Conta de reserva que vai pagar esta despesa por meio de um resgate.',
    relacaoComTela: 'A reserva específica da categoria aparece com ★. Pode definir a classificação gerencial e mostra as funções desta conta.',
    obrigatorio: false,
  },
  'lancamento.funcaoReserva': {
    titulo: 'Função de reserva',
    paraQueServe: 'Objetivo de reserva a que este valor pertence. Entra nas entradas ou saídas dessa função.',
    relacaoComTela: 'No depósito ou resgate de reserva, define a função movimentada; na despesa paga com reserva, de qual função sai o resgate. Com a classificação definida pela reserva e mais de uma função, é obrigatória.',
    obrigatorio: false,
  },
  'lancamento.categoriaReserva': {
    titulo: 'Categoria do depósito / resgate',
    paraQueServe: 'Categoria da despesa (no depósito em reserva) ou da receita (no resgate).',
    relacaoComTela: 'Sem escolha, usa a categoria padrão da reserva (ou Reservas Gerais). Na reserva livre sem função única, é obrigatória.',
    obrigatorio: false,
  },
  'lancamento.categoriaAplicacao': {
    titulo: 'Categoria do aporte',
    paraQueServe: 'Categoria opcional da transferência para uma conta de aplicação.',
    relacaoComTela: 'Com categoria, o aporte aparece nos relatórios como saída; em branco, é uma transferência comum (fora dos relatórios).',
    obrigatorio: false,
  },
  'lancamento.categoriasPerfis': {
    titulo: 'Categorias de cada perfil',
    paraQueServe: 'Na transferência entre contas de perfis diferentes (CPF e CNPJ), a categoria em cada lado.',
    relacaoComTela: 'Para cada perfil a transferência vira saída ou entrada na categoria escolhida, e aparece nos relatórios daquele perfil.',
    obrigatorio: false,
  },
  'lancamento.classificacaoGerencial': {
    titulo: 'Classificação gerencial',
    paraQueServe: 'Define como o dinheiro se move no controle gerencial ao gravar este lançamento.',
    relacaoComTela: 'D = despesa normal. Grupo 1 cria a transferência para a subconta gerencial do cartão e o agendamento de devolução; os outros grupos agendam o resgate automático da conta padrão do grupo. Paga com reserva, fica definida pela reserva.',
    obrigatorio: false,
  },
  'lancamento.gerencialContaDestino': {
    titulo: 'Conta de origem do gerencial',
    paraQueServe: 'No grupo 1, a conta corrente de onde sai a transferência para a subconta gerencial.',
    relacaoComTela: 'A escolha fica lembrada neste aparelho. A prévia mostra a fatura e a data do agendamento de devolução.',
    obrigatorio: true,
  },

  // ── Repetir ───────────────────────────────────────────────────────────────────────────────────
  'lancamento.repetir': {
    titulo: 'Repetir este lançamento',
    paraQueServe: 'Cria um agendamento com estes dados, a partir deste lançamento.',
    relacaoComTela: 'Ligado, mostra frequência, até quando e lembrete. Este lançamento conta como a ocorrência da data dele.',
    obrigatorio: false,
  },
  'lancamento.repetirFrequencia': {
    titulo: 'Frequência',
    paraQueServe: 'De quanto em quanto tempo o lançamento se repete.',
    relacaoComTela: 'Define as datas do agendamento criado; "uma vez" não pergunta até quando.',
    obrigatorio: false,
  },
  'lancamento.repetirAte': {
    titulo: 'Até quando',
    paraQueServe: 'Se a repetição é contínua, por um número de vezes ou até uma data.',
    relacaoComTela: 'Vira o fim do agendamento criado em Agendamentos.',
    obrigatorio: false,
  },
  'lancamento.repetirLembrete': {
    titulo: 'Lembrete',
    paraQueServe: 'Avisa alguns dias antes de cada ocorrência do agendamento criado.',
    relacaoComTela: 'Ligado, mostra quantos dias antes (padrão 3).',
    obrigatorio: false,
  },
}

export const formularios = {}
