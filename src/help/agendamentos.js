// Help de campo — AGENDAMENTOS (formulário de agendamento e registro da ocorrência).
// Campo: { titulo, paraQueServe, relacaoComTela, oQueAconteceAoSalvar?, obrigatorio, quandoUsar?, atencao?, exemplo? }
// paraQueServe = texto curto do ícone ⓘ; relacaoComTela = como o campo mexe nos outros e no resultado.

export const campos = {
  'agendamento.transactionType': {
    titulo: 'Movimentação',
    paraQueServe: 'Define se o agendamento é uma receita, uma despesa ou uma transferência.',
    relacaoComTela: 'Muda os campos do formulário: transferência pede conta de destino e não tem categoria; receita e despesa pedem categoria e favorecido.',
    obrigatorio: true,
  },
  'agendamento.description': {
    titulo: 'Descrição',
    paraQueServe: 'Nome do lançamento recorrente, usado em todas as ocorrências.',
    relacaoComTela: 'É o texto que aparece na lista de agendamentos, nos avisos e em cada lançamento gravado a partir dele.',
    obrigatorio: true,
    exemplo: 'Conta de luz, Aluguel do apartamento, Mensalidade da escola.',
  },
  'agendamento.account': {
    titulo: 'Conta',
    paraQueServe: 'Conta debitada ou creditada a cada ocorrência deste agendamento.',
    relacaoComTela: 'O saldo previsto desta conta no Fluxo Futuro passa a contar cada ocorrência. Numa transferência, é a conta de onde o dinheiro sai.',
    obrigatorio: true,
  },
  'agendamento.toAccount': {
    titulo: 'Conta de destino',
    paraQueServe: 'Conta que recebe a transferência a cada ocorrência.',
    relacaoComTela: 'Só aparece em transferências. O valor sai da conta de origem e entra nesta; o total do patrimônio não muda.',
    obrigatorio: true,
  },
  'agendamento.amount': {
    titulo: 'Valor',
    paraQueServe: 'Valor padrão de cada ocorrência. Uma ocorrência pode ter valor próprio na prévia.',
    relacaoComTela: 'É o valor usado no Fluxo Futuro e sugerido ao registrar. Com parcelamento por ocorrência, é o total que será dividido nas parcelas.',
    obrigatorio: true,
    atencao: 'Mudar o valor aqui não altera ocorrências que já foram registradas.',
  },
  'agendamento.category': {
    titulo: 'Categoria',
    paraQueServe: 'Classifica o valor para relatórios e orçamento.',
    relacaoComTela: 'Cada lançamento gravado herda esta categoria; ela define onde o valor aparece nos relatórios e no Orçado × Realizado.',
    obrigatorio: false,
  },
  'agendamento.payee': {
    titulo: 'Favorecido',
    paraQueServe: 'Pessoa ou empresa que recebe ou paga o valor.',
    relacaoComTela: 'Vai para cada lançamento gravado e ajuda a reconhecer o pagamento na importação do extrato.',
    obrigatorio: false,
  },
  'agendamento.frequency': {
    titulo: 'Frequência',
    paraQueServe: 'Intervalo entre uma ocorrência e a próxima.',
    relacaoComTela: 'Junto com a data de início, calcula as datas de todas as ocorrências. "Única" vira um lançamento só.',
    obrigatorio: true,
  },
  'agendamento.startDate': {
    titulo: 'Data de início',
    paraQueServe: 'Data da primeira ocorrência. As seguintes são calculadas pela frequência.',
    relacaoComTela: 'Define o dia do mês das próximas ocorrências e a partir de quando o valor entra no Fluxo Futuro.',
    obrigatorio: true,
  },
  'agendamento.nextOccurrence': {
    titulo: 'Data de vencimento atual',
    paraQueServe: 'Data da próxima ocorrência pendente. Ao alterar, o sistema pergunta se vale também para as próximas.',
    relacaoComTela: 'Muda só a próxima ocorrência ou ela e as seguintes, conforme a resposta. As já registradas não mudam.',
    obrigatorio: false,
  },
  'agendamento.occurrence': {
    titulo: 'Até quando',
    paraQueServe: 'Sem fim repete sempre; com número de ocorrências ou data final, a série encerra ali.',
    relacaoComTela: 'Define quantas ocorrências aparecem no Fluxo Futuro e quando o agendamento passa a "Concluído".',
    obrigatorio: true,
  },
  'agendamento.installments': {
    titulo: 'Número de ocorrências',
    paraQueServe: 'Total de ocorrências antes de o agendamento se encerrar.',
    relacaoComTela: 'Aparece como "x/N" em cada ocorrência; a última encerra o agendamento.',
    obrigatorio: false,
    exemplo: '12 para um ano de mensalidades.',
  },
  'agendamento.parcelasPorOcorrencia': {
    titulo: 'Parcelamento',
    paraQueServe: 'Divide o total de cada ocorrência em parcelas mensais. O limite são os meses do período, para as parcelas não cruzarem com as da ocorrência seguinte.',
    relacaoComTela: 'O valor informado vira o total da ocorrência e é repartido em parcelas mensais no Fluxo Futuro.',
    obrigatorio: false,
    quandoUsar: 'Seguro anual pago em 12 vezes, IPTU parcelado.',
  },
  'agendamento.remindDaysBefore': {
    titulo: 'Lembrar com antecedência',
    paraQueServe: 'Quantos dias antes do vencimento o aviso aparece no painel.',
    relacaoComTela: 'Só muda quando o aviso aparece em Alertas e no Início; o vencimento continua o mesmo.',
    obrigatorio: false,
  },
  'agendamento.autoRegister': {
    titulo: 'Registrar automático',
    paraQueServe: 'Grava o lançamento sozinho na data, sem pedir confirmação.',
    relacaoComTela: 'Na data, a ocorrência vira lançamento com o valor e a conta do agendamento e o saldo da conta é atualizado.',
    obrigatorio: false,
    atencao: 'Use só para valores que não mudam, como débitos automáticos fixos.',
  },
  'agendamento.sincronizarAgenda': {
    titulo: 'Sincronizar com a agenda do celular',
    paraQueServe: 'Envia as ocorrências para a agenda assinada no celular.',
    relacaoComTela: 'Só afeta a agenda do celular; valores e saldos do app não mudam.',
    obrigatorio: false,
  },
  'agendamento.gerencial': {
    titulo: 'Classificação gerencial',
    paraQueServe: 'Define como o dinheiro se move ao efetivar: débito direto, reserva, resgate de conta específica ou só registro.',
    relacaoComTela: 'Ao registrar, decide se o valor sai da conta principal, de uma reserva ou de outra conta, e em que grupo aparece no controle gerencial.',
    obrigatorio: false,
  },
  'agendamento.funcaoReserva': {
    titulo: 'Função de reserva',
    paraQueServe: 'Objetivo de reserva a que este valor pertence.',
    relacaoComTela: 'Ao registrar, o valor entra nas entradas ou saídas desta função em Reservas.',
    obrigatorio: false,
  },
  'agendamento.rateio': {
    titulo: 'Rateio',
    paraQueServe: 'Divide o valor de cada ocorrência entre várias categorias.',
    relacaoComTela: 'Cada lançamento gravado leva a divisão; os relatórios mostram cada parte na sua categoria.',
    obrigatorio: false,
  },
  'agendamento.dataBase': {
    titulo: 'Data-base (competência)',
    paraQueServe: 'Mês da parcela no contrato, usado como chave da baixa. Definido pelo contrato.',
    relacaoComTela: 'Liga a ocorrência à competência do contrato; não muda a data de vencimento.',
    obrigatorio: false,
  },
  'agendamento.dataVencimento': {
    titulo: 'Data de vencimento',
    paraQueServe: 'Dia em que esta parcela vence. Muda só esta parcela.',
    relacaoComTela: 'Move só esta ocorrência no Fluxo Futuro; as outras parcelas do contrato continuam no dia de sempre.',
    obrigatorio: false,
  },
  'registrarAgendamento.valor': {
    titulo: 'Valor (registrar)',
    paraQueServe: 'Quanto foi pago ou recebido de fato nesta ocorrência.',
    relacaoComTela: 'Vira o valor do lançamento e muda o saldo da conta. Diferente do previsto: o agendamento fica como está, só esta ocorrência registra o valor real.',
    obrigatorio: true,
  },
  'registrarAgendamento.data': {
    titulo: 'Data (registrar)',
    paraQueServe: 'Dia em que o dinheiro saiu ou entrou na conta.',
    relacaoComTela: 'É a data do lançamento no extrato; o vencimento da ocorrência continua o mesmo.',
    obrigatorio: true,
  },
  'registrarAgendamento.conta': {
    titulo: 'Conta (registrar)',
    paraQueServe: 'Conta em que o pagamento ou recebimento aconteceu.',
    relacaoComTela: 'O saldo desta conta é que muda; pode ser outra conta só nesta ocorrência.',
    obrigatorio: true,
  },
}

export const formularios = {
  agendamento: {
    objetivo: 'Cadastrar um pagamento ou recebimento que se repete (ou acontece uma vez no futuro) para ele aparecer no Fluxo Futuro e nos avisos.',
    preRequisitos: [
      { id: 'conta', texto: 'Uma conta cadastrada para pagar ou receber.' },
      { id: 'categoria', texto: 'Categorias de receita ou despesa (recomendado).' },
    ],
    ordemCampos: [
      'agendamento.transactionType', 'agendamento.description', 'agendamento.account', 'agendamento.toAccount', 'agendamento.amount',
      'agendamento.category', 'agendamento.payee', 'agendamento.frequency', 'agendamento.startDate', 'agendamento.occurrence',
      'agendamento.installments', 'agendamento.parcelasPorOcorrencia', 'agendamento.remindDaysBefore', 'agendamento.autoRegister',
      'agendamento.sincronizarAgenda', 'agendamento.gerencial',
    ],
    resumoAoSalvar: 'As ocorrências entram no Fluxo Futuro e nos avisos de vencimento. Nada é lançado na conta até você registrar (ou até a data, se "Registrar automático" estiver ligado).',
  },
  registrarAgendamento: {
    objetivo: 'Registrar que esta ocorrência foi paga ou recebida.',
    preRequisitos: [],
    ordemCampos: ['registrarAgendamento.valor', 'registrarAgendamento.data', 'registrarAgendamento.conta'],
    resumoAoSalvar: 'Cria o lançamento na conta (o saldo muda) e marca a ocorrência como paga; a próxima ocorrência passa a ser a pendente.',
  },
}
