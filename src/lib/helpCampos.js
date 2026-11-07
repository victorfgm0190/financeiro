// ── Help de campo (camada leve de ajuda) ─────────────────────────────────────────────────────────
// Textos do ícone ⓘ ao lado do rótulo dos campos (src/components/shared/HelpCampo.jsx), por tela e
// campo. Padrão: 1–2 frases curtas sobre a FUNÇÃO do campo, sem exemplos (como os placeholders).
// Nada específico de um cliente. O help de TELA (src/lib/ajudaTelas.js) e a jornada guiada são outras
// camadas e não usam este arquivo.

export const HELP_CAMPOS = {
  conta: {
    tipo: 'Define como a conta se comporta: corrente, cartão, investimento, bem ou dívida. Muda os campos e os cálculos disponíveis.',
    apelido: 'Nome curto usado no extrato gerencial e nos selos da conta. Até 8 caracteres.',
    vinculo: 'Perfil (CPF ou CNPJ) dono da conta. Define em que perfil a conta e seus lançamentos aparecem.',
    grupo: 'Agrupa contas para organizar a lista e somar saldos em conjunto.',
    saldoInicial: 'Saldo da conta antes do primeiro lançamento registrado. O saldo atual é calculado a partir dele.',
    tipoReserva: 'Geral guarda dinheiro sem destino fixo; específica fica ligada a uma categoria de despesa.',
    categoriaReserva: 'Categoria da despesa que esta reserva cobre. Os depósitos aparecem nela nos relatórios.',
    categoriaInvestimento: 'Categoria usada para registrar as aplicações e os resgates desta conta.',
    categoriaRendimento: 'Categoria da receita criada pelo botão Lançar Rendimento desta conta.',
    rendimentoPor: 'Indica se o rendimento é informado para esta conta sozinha ou para o grupo de contas inteiro.',
  },
  cartao: {
    limite: 'Valor total de crédito do cartão. O disponível é calculado descontando as compras em aberto.',
    fechamento: 'Dia em que a fatura fecha. Compras depois dele entram na fatura seguinte.',
    vencimento: 'Dia em que a fatura vence e o pagamento é agendado.',
    finais: 'Últimos dígitos do cartão, usados para reconhecer as compras na importação da fatura.',
    spread: 'Acréscimo sobre a cotação usado nas compras em dólar enquanto não há faturas conferidas.',
    contaPagadora: 'Conta de onde sai o pagamento da fatura.',
  },
  lancamento: {
    tipo: 'Define se o valor entra, sai ou passa de uma conta para outra.',
    dataBanco: 'Data em que o banco registrou o lançamento, quando diferente da data de competência.',
    faturaReferencia: 'Fatura do cartão em que esta compra é cobrada.',
    centroCusto: 'Separa os valores por área ou finalidade nos relatórios.',
    numeroContrato: 'Número do contrato ligado a este lançamento, usado para localizá-lo depois.',
    contaReserva: 'Conta de reserva que vai pagar esta despesa por meio de um resgate.',
    funcaoReserva: 'Objetivo de reserva a que este valor pertence. Entra nas entradas ou saídas dessa função.',
    classificacaoGerencial: 'Define como o dinheiro se move no controle gerencial ao gravar este lançamento.',
  },
  agendamento: {
    transactionType: 'Define se o agendamento é uma receita, uma despesa ou uma transferência.',
    description: 'Nome do lançamento recorrente, usado em todas as ocorrências.',
    account: 'Conta debitada ou creditada a cada ocorrência deste agendamento.',
    toAccount: 'Conta que recebe a transferência a cada ocorrência.',
    amount: 'Valor padrão de cada ocorrência. Uma ocorrência pode ter valor próprio na prévia.',
    category: 'Classifica o valor para relatórios e orçamento.',
    payee: 'Pessoa ou empresa que recebe ou paga o valor.',
    frequency: 'Intervalo entre uma ocorrência e a próxima.',
    startDate: 'Data da primeira ocorrência. As seguintes são calculadas pela frequência.',
    nextOccurrence: 'Data da próxima ocorrência pendente. Ao alterar, o sistema pergunta se vale também para as próximas.',
    occurrence: 'Sem fim repete sempre; com número de ocorrências ou data final, a série encerra ali.',
    parcelasPorOcorrencia: 'Divide o total de cada ocorrência em parcelas mensais. O limite são os meses do período, para as parcelas não cruzarem com as da ocorrência seguinte.',
    installments: 'Total de ocorrências antes de o agendamento se encerrar.',
    remindDaysBefore: 'Quantos dias antes do vencimento o aviso aparece no painel.',
    autoRegister: 'Grava o lançamento sozinho na data, sem pedir confirmação.',
    sincronizarAgenda: 'Envia as ocorrências para a agenda assinada no celular.',
    gerencial: 'Define como o dinheiro se move ao efetivar: débito direto, reserva, resgate de conta específica ou só registro.',
    dataBase: 'Mês da parcela no contrato, usado como chave da baixa. Definido pelo contrato.',
    dataVencimento: 'Dia em que esta parcela vence. Muda só esta parcela.',
  },
  categoria: {
    grupo: 'Agrupa categorias nos relatórios e no orçamento. Escolha um grupo existente ou digite um novo.',
    tipo: 'Define se a categoria aparece em despesas, em receitas ou nas duas.',
    perfis: 'Perfis em que a categoria pode ser usada. Sem seleção, vale para todos.',
  },
  favorecido: {
    novoNome: 'Nome que fica para todos os favorecidos selecionados. Os lançamentos e agendamentos passam a usá-lo.',
  },
  perfil: {
    tipo: 'Pessoa física ou jurídica. Define se o documento é CPF ou CNPJ.',
    documento: 'Documento do titular, mostrado ao vincular contas a este perfil.',
    cor: 'Cor que identifica o perfil nos selos e listas.',
  },
  contrato: {
    modalidade: 'Define se o contrato gera receita ou despesa e os campos usados nele.',
    avisoPrevio: 'Dias de antecedência exigidos para encerrar ou não renovar o contrato.',
    renovacao: 'Indica se o contrato se renova sozinho ao fim da vigência.',
    contaPagamento: 'Conta usada nas parcelas geradas pelo contrato.',
    valorPrincipal: 'Valor de cada parcela antes de descontos, encargos e reajustes.',
    periodicidade: 'Intervalo entre as parcelas do contrato.',
    diaVencimento: 'Dia do mês em que cada parcela vence.',
    tipoDocumento: 'Tipo de documento que acompanha as parcelas, usado em filtros e relatórios.',
    desconto: 'Valor abatido das parcelas, por mês ou só nas primeiras cobradas.',
    mesesSemCobranca: 'Meses em que o contrato não gera parcela.',
    indiceReajuste: 'Índice que corrige o valor no aniversário do contrato.',
    mesBase: 'Mês em que o reajuste é aplicado a cada ano.',
  },
  reserva: {
    conta: 'Conta de reserva onde fica o dinheiro desta função.',
    saldoInicial: 'Saldo da função antes do primeiro período registrado.',
    despesaAnual: 'Valor previsto da despesa no ano, usado para planejar os depósitos.',
    depositoMensal: 'Valor que se pretende guardar por mês para esta função.',
    mesVencimento: 'Mês em que a despesa costuma vencer.',
    categoria: 'Categoria da despesa coberta pela função. Os depósitos aparecem nela nos relatórios.',
  },
}

// 'tela.campo' → texto (ou '' se não existir).
export function textoHelpCampo(chave) {
  const [tela, campo] = String(chave || '').split('.')
  return HELP_CAMPOS[tela]?.[campo] || ''
}
