// Help de campo — formulários de operação que faltavam (Etapa 3, bloco 5a): Agendamentos (efetivar
// provisão, registrar em lote, seleção, ocorrência, executar gerenciais), Reservas, Envelopes,
// Orçamento, Cartão de Crédito (pagar fatura), Contas (rendimento, seleção), Dívidas, Fluxo de Caixa
// (consulta salva) e Início no celular. Nada específico de um cliente.

export const campos = {
  // ── Agendamentos ──────────────────────────────────────────────────────────────────────────
  'efetivarProvisao.valor': {
    titulo: 'Valor real',
    paraQueServe: 'Quanto a despesa prevista realmente custou.',
    relacaoComTela: 'Vira o valor do agendamento da despesa criado na efetivação (e do resgate, se houver reserva).',
    obrigatorio: true,
  },
  'efetivarProvisao.data': {
    titulo: 'Data real',
    paraQueServe: 'Quando a despesa vence ou foi paga de fato.',
    relacaoComTela: 'É a data do agendamento criado. Diferente do previsto, pode perguntar se a mudança vale para as próximas ocorrências.',
    obrigatorio: true,
  },
  'efetivarProvisao.aplicarProximas': {
    titulo: 'A mudança de data vale para as próximas?',
    paraQueServe: 'Diz se as próximas ocorrências da provisão acompanham a nova data.',
    relacaoComTela: 'Não: as próximas seguem a data original. Sim: a série passa a contar da nova data. As datas resultantes aparecem em cada opção.',
    obrigatorio: true,
  },
  'registrarLote.data': {
    titulo: 'Data de registro',
    paraQueServe: 'Data aplicada a todos os itens cuja data não foi trocada um a um.',
    relacaoComTela: 'Cada item abre no próprio vencimento; mudar aqui atualiza só os que você não mexeu.',
    obrigatorio: true,
  },
  'registrarLote.valorItem': {
    titulo: 'Valor do item',
    paraQueServe: 'Valor com que cada agendamento será registrado.',
    relacaoComTela: 'Vem com o valor previsto. O total e o resumo por conta são recalculados na hora.',
    obrigatorio: true,
  },
  'registrarLote.dataItem': {
    titulo: 'Data do item',
    paraQueServe: 'Data do lançamento deste agendamento.',
    relacaoComTela: 'Trocada aqui, ela deixa de seguir a data de registro geral.',
    obrigatorio: true,
  },
  'registrarLote.contaDestino': {
    titulo: 'Conta destino do item',
    paraQueServe: 'Conta que recebe esta transferência, para agendamento gravado sem destino.',
    relacaoComTela: 'Vale só para este lançamento; o agendamento continua como está.',
    obrigatorio: true,
  },
  'registrarLote.deFato': {
    titulo: 'Valor transferido de fato',
    paraQueServe: 'Quanto realmente foi transferido entre a conta e a reserva.',
    relacaoComTela: 'Diferente do líquido calculado, gera uma transferência a mais, sem função, que fica como saldo a distribuir da reserva.',
    obrigatorio: false,
  },
  'agendamentoLote.selecionar': {
    titulo: 'Selecionar agendamentos',
    paraQueServe: 'Marca os agendamentos para uma ação em lote.',
    relacaoComTela: 'Com itens marcados, a barra acima permite registrar, excluir, sincronizar com a agenda ou definir o tipo de documento de todos.',
    obrigatorio: false,
  },
  'agendamentoLote.tipoDocumento': {
    titulo: 'Definir tipo de documento',
    paraQueServe: 'Tipo de documento aplicado a todos os selecionados.',
    relacaoComTela: 'Só grava ao clicar em Aplicar. "Remover tipo" limpa o campo.',
    obrigatorio: false,
  },
  'agendamentoLote.motivo': {
    titulo: 'Motivo',
    paraQueServe: 'Por que o tipo de documento está mudando.',
    relacaoComTela: 'Fica no histórico de alterações de cada agendamento.',
    obrigatorio: false,
  },
  'ocorrencia.pular': {
    titulo: 'Pular esta ocorrência',
    paraQueServe: 'Faz esta ocorrência não acontecer.',
    relacaoComTela: 'Ela some do Fluxo Futuro e dos avisos; as outras não mudam. Se já houve pagamento no mês, a tela avisa antes.',
    obrigatorio: false,
  },
  'ocorrencia.data': {
    titulo: 'Nova data',
    paraQueServe: 'Data só desta ocorrência.',
    relacaoComTela: 'Vira uma exceção: a série continua com as datas dela.',
    obrigatorio: false,
  },
  'ocorrencia.valor': {
    titulo: 'Valor',
    paraQueServe: 'Valor só desta ocorrência.',
    relacaoComTela: 'Vira uma exceção: as outras ocorrências mantêm o valor da série.',
    obrigatorio: false,
  },
  'executarGerenciais.fatura': {
    titulo: 'Fatura',
    paraQueServe: 'Filtra as provisões gerenciais por fatura.',
    relacaoComTela: 'Só muda a lista; nada é executado sem Confirmar.',
    obrigatorio: false,
  },
  'executarGerenciais.cartao': {
    titulo: 'Cartão',
    paraQueServe: 'Filtra as provisões gerenciais por cartão.',
    relacaoComTela: 'Só muda a lista; nada é executado sem Confirmar.',
    obrigatorio: false,
  },
  'executarGerenciais.mostrarExecutadas': {
    titulo: 'Mostrar já executadas',
    paraQueServe: 'Inclui na lista as parcelas que já tiveram a transferência gerencial.',
    relacaoComTela: 'Só para consulta: as já executadas não são executadas de novo.',
    obrigatorio: false,
  },
  'executarGerenciais.selecionar': {
    titulo: 'Parcelas a executar',
    paraQueServe: 'Marca as parcelas que terão a transferência gerencial agora.',
    relacaoComTela: 'Confirmar cria uma transferência da conta principal para a subconta gerencial de cada marcada, na data mostrada.',
    obrigatorio: false,
  },

  // ── Reservas ──────────────────────────────────────────────────────────────────────────────
  'reservaResumo.saldoReal': {
    titulo: 'Saldo real da conta',
    paraQueServe: 'Saldo da conta de reserva como está no banco.',
    relacaoComTela: 'Comparado com a soma das funções: a diferença aparece como "a distribuir".',
    obrigatorio: false,
  },
  'reservaResumo.distribuir': {
    titulo: 'Distribuir',
    paraQueServe: 'Parte do saldo a distribuir que vai para esta função.',
    relacaoComTela: 'Ao confirmar, grava um ajuste na função. A soma não pode passar do valor a distribuir.',
    obrigatorio: false,
  },
  'reservaSaldoInicial.data': {
    titulo: 'Data de referência',
    paraQueServe: 'A partir de quando o novo saldo inicial vale.',
    relacaoComTela: 'Abre um novo período: o saldo da função passa a contar desta data, e os ajustes anteriores ficam fora do total.',
    obrigatorio: true,
  },
  'reservaSaldoInicial.valor': {
    titulo: 'Saldo inicial',
    paraQueServe: 'Saldo da função na data de referência.',
    relacaoComTela: 'É a base do saldo da função no novo período. Aceita negativo.',
    obrigatorio: true,
  },
  'ajusteReserva.data': {
    titulo: 'Data do ajuste',
    paraQueServe: 'Quando o ajuste vale.',
    relacaoComTela: 'Fora do período ativo, o ajuste fica na lista mas não entra no total.',
    obrigatorio: true,
  },
  'ajusteReserva.valor': {
    titulo: 'Valor do ajuste',
    paraQueServe: 'Quanto somar (positivo) ou tirar (negativo) do saldo da função.',
    relacaoComTela: 'Entra no saldo: saldo inicial + entradas − saídas + ajustes.',
    obrigatorio: true,
  },
  'ajusteReserva.observacao': {
    titulo: 'Observação',
    paraQueServe: 'Motivo do ajuste.',
    relacaoComTela: 'Aparece na lista de ajustes.',
    obrigatorio: false,
  },
  'reservaHistorico.periodo': {
    titulo: 'Período fechado',
    paraQueServe: 'Escolhe qual virada de saldo ver no histórico.',
    relacaoComTela: 'Só muda a tabela mostrada.',
    obrigatorio: false,
  },
  'viradaDecisao.tipo': {
    titulo: 'O que fazer com a diferença',
    paraQueServe: 'Destino da diferença que o rendimento não explica.',
    relacaoComTela: 'Lançar como ajuste: vai para a função escolhida. Deixar a distribuir: fica pendente na conta. A virada só continua depois de escolher.',
    obrigatorio: true,
  },
  'viradaDecisao.funcao': {
    titulo: 'Função',
    paraQueServe: 'Função que recebe a diferença como ajuste.',
    relacaoComTela: 'O saldo dela muda pelo valor da diferença.',
    obrigatorio: true,
  },
  'viradaDecisao.observacao': {
    titulo: 'Observação',
    paraQueServe: 'Motivo do ajuste lançado na virada.',
    relacaoComTela: 'Fica no ajuste da função.',
    obrigatorio: false,
  },

  // ── Envelopes e Orçamento ─────────────────────────────────────────────────────────────────
  'envelope.nome': {
    titulo: 'Nome do envelope',
    paraQueServe: 'Nome do envelope de gastos.',
    relacaoComTela: 'Aparece na tela de Envelopes e no Fluxo de Caixa (restante do envelope).',
    obrigatorio: true,
  },
  'envelope.tipo': {
    titulo: 'Tipo de orçamento',
    paraQueServe: 'Mensal (limite fixo no mês) ou diário (valor por dia que conta).',
    relacaoComTela: 'Mensal pede limite e dia de vencimento; diário pede valor por dia, dias que contam e feriados.',
    obrigatorio: true,
  },
  'envelope.valorDia': {
    titulo: 'Valor por dia',
    paraQueServe: 'Quanto pode gastar em cada dia que conta.',
    relacaoComTela: 'Orçamento do ciclo = dias que contam × este valor. A prévia mostra a conta.',
    obrigatorio: true,
  },
  'envelope.dias': {
    titulo: 'Dias que contam',
    paraQueServe: 'Quais dias da semana entram no orçamento diário.',
    relacaoComTela: 'Muda o número de dias do ciclo e, com isso, o orçamento.',
    obrigatorio: true,
  },
  'envelope.descontarFeriados': {
    titulo: 'Descontar feriados',
    paraQueServe: 'Tira os feriados ligados dos dias que contam.',
    relacaoComTela: 'Usa o cadastro de Configurações › Feriados.',
    obrigatorio: false,
  },
  'envelope.limite': {
    titulo: 'Limite mensal',
    paraQueServe: 'Quanto pode ser gasto no mês com as categorias do envelope.',
    relacaoComTela: 'Os gastos das categorias vinculadas são descontados dele; o restante aparece no Fluxo de Caixa.',
    obrigatorio: true,
  },
  'envelope.diaVencimento': {
    titulo: 'Dia de vencimento',
    paraQueServe: 'Dia em que o ciclo do envelope fecha.',
    relacaoComTela: 'O restante do envelope é projetado até este dia.',
    obrigatorio: true,
  },
  'envelope.conta': {
    titulo: 'Conta vinculada',
    paraQueServe: 'Conta de onde sai o dinheiro do envelope.',
    relacaoComTela: 'Define o perfil das categorias oferecidas logo abaixo.',
    obrigatorio: false,
  },
  'envelope.categorias': {
    titulo: 'Categorias vinculadas',
    paraQueServe: 'Categorias de despesa que consomem o envelope.',
    relacaoComTela: 'Todo gasto nelas é descontado do envelope.',
    obrigatorio: false,
  },
  'orcamento.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Categoria de despesa orçada.',
    relacaoComTela: 'A barra do orçamento compara os gastos dela no mês com o valor orçado.',
    obrigatorio: true,
  },
  'orcamento.valor': {
    titulo: 'Valor orçado',
    paraQueServe: 'Quanto pretende gastar no mês nesta categoria.',
    relacaoComTela: 'Base da barra e do "Restante" do orçamento.',
    obrigatorio: true,
  },

  // ── Cartão de Crédito e Contas ────────────────────────────────────────────────────────────
  'pagamentoFatura.conta': {
    titulo: 'Conta de débito',
    paraQueServe: 'Conta de onde sai o pagamento da fatura.',
    relacaoComTela: 'O saldo dela diminui pelo valor pago; a fatura do cartão é abatida.',
    obrigatorio: true,
  },
  'pagamentoFatura.valor': {
    titulo: 'Valor do pagamento',
    paraQueServe: 'Quanto foi pago da fatura.',
    relacaoComTela: 'Vem com o total da fatura; pode ser parcial.',
    obrigatorio: true,
  },
  'pagamentoFatura.data': {
    titulo: 'Data do pagamento',
    paraQueServe: 'Quando o pagamento saiu da conta.',
    relacaoComTela: 'Data do lançamento do pagamento na conta de débito.',
    obrigatorio: true,
  },
  'lancamentoLote.selecionar': {
    titulo: 'Selecionar lançamentos',
    paraQueServe: 'Marca os lançamentos para uma ação em lote.',
    relacaoComTela: 'Com itens marcados, a barra acima permite editar, reconciliar ou excluir todos de uma vez.',
    obrigatorio: false,
  },
  'rendimento.novoSaldo': {
    titulo: 'Novo saldo',
    paraQueServe: 'Saldo atual da aplicação, como está no banco.',
    relacaoComTela: 'O rendimento a lançar é a diferença para o saldo futuro calculado. Precisa ser maior que ele.',
    obrigatorio: true,
  },
  'rendimento.data': {
    titulo: 'Data',
    paraQueServe: 'Data do lançamento do rendimento.',
    relacaoComTela: 'O rendimento entra como receita nesta data, na categoria de rendimento da conta.',
    obrigatorio: true,
  },

  // ── Dívidas ───────────────────────────────────────────────────────────────────────────────
  'planoDivida.valorTotal': {
    titulo: 'Valor total',
    paraQueServe: 'Total a pagar (ou a receber) no empréstimo, com juros.',
    relacaoComTela: 'Mudar recalcula o valor da parcela.',
    obrigatorio: true,
  },
  'planoDivida.favorecido': {
    titulo: 'Favorecido',
    paraQueServe: 'Credor (no empréstimo recebido) ou quem recebeu (no concedido).',
    relacaoComTela: 'Vai para os agendamentos das parcelas.',
    obrigatorio: false,
  },
  'planoDivida.parcelas': {
    titulo: 'Parcelas',
    paraQueServe: 'Em quantas parcelas o empréstimo é pago.',
    relacaoComTela: 'Total ÷ parcelas = valor da parcela. O resumo mostra as primeiras datas.',
    obrigatorio: true,
  },
  'planoDivida.diaVencimento': {
    titulo: 'Dia de vencimento',
    paraQueServe: 'Dia do mês em que cada parcela vence.',
    relacaoComTela: 'Recalcula as datas das parcelas.',
    obrigatorio: true,
  },
  'planoDivida.valorParcela': {
    titulo: 'Valor da parcela',
    paraQueServe: 'Valor de cada parcela.',
    relacaoComTela: 'Vem calculado pelo total e pelo número de parcelas; pode ser ajustado.',
    obrigatorio: true,
  },
  'planoDivida.primeiraParcela': {
    titulo: 'Primeira parcela em',
    paraQueServe: 'Data da primeira parcela.',
    relacaoComTela: 'As seguintes vencem nos meses seguintes, no dia de vencimento.',
    obrigatorio: true,
  },
  'planoDivida.conta': {
    titulo: 'Conta dos pagamentos',
    paraQueServe: 'Conta de onde saem (ou entram) as parcelas.',
    relacaoComTela: 'É a conta dos agendamentos das parcelas.',
    obrigatorio: true,
  },
  'planoDivida.categoriaJuros': {
    titulo: 'Categoria de juros',
    paraQueServe: 'Categoria da parte de juros de cada parcela.',
    relacaoComTela: 'Ao registrar uma parcela, os juros vão para esta categoria e o principal amortiza a dívida.',
    obrigatorio: false,
  },
  'pagamentoDivida.principal': {
    titulo: 'Principal (amortização)',
    paraQueServe: 'Parte deste pagamento que reduz a dívida.',
    relacaoComTela: 'O restante do valor pago é lançado como juros.',
    obrigatorio: true,
  },

  // ── Fluxo de Caixa: consulta salva ───────────────────────────────────────────────────────
  'consultaFluxo.nome': {
    titulo: 'Nome da consulta',
    paraQueServe: 'Nome para reconhecer a consulta no seletor.',
    relacaoComTela: 'Aparece em "Trocar consulta" no Fluxo de Caixa Futuro.',
    obrigatorio: true,
  },
  'consultaFluxo.perfis': {
    titulo: 'Perfis',
    paraQueServe: 'Perfis cujas contas entram na consulta.',
    relacaoComTela: 'Limita as contas oferecidas logo abaixo.',
    obrigatorio: false,
  },
  'consultaFluxo.modo': {
    titulo: 'Como escolher as contas',
    paraQueServe: 'Por conta, por grupo de contas ou as principais (FC).',
    relacaoComTela: 'Muda a lista de escolha logo abaixo. Principais usa as contas marcadas como Somar no Saldo Principal.',
    obrigatorio: true,
  },
  'consultaFluxo.contas': {
    titulo: 'Contas da consulta',
    paraQueServe: 'Contas (ou grupos) que entram no fluxo.',
    relacaoComTela: 'A soma dos saldos delas é o saldo inicial da consulta, mostrado no rodapé da lista.',
    obrigatorio: true,
  },
  'consultaFluxo.opcoes': {
    titulo: 'O que entra no fluxo',
    paraQueServe: 'Agendamentos, lançamentos futuros, envelopes e o que ocultar.',
    relacaoComTela: 'Cada opção marcada soma (ou oculta) esses itens na projeção da consulta.',
    obrigatorio: false,
  },
  'consultaFluxo.horizonte': {
    titulo: 'Horizonte padrão',
    paraQueServe: 'Quantos dias à frente a consulta abre.',
    relacaoComTela: 'Pode ser trocado na tela sem mudar o padrão.',
    obrigatorio: false,
  },
  'consultaFluxo.padrao': {
    titulo: 'Abrir por padrão',
    paraQueServe: 'Faz esta consulta abrir ao entrar no Fluxo de Caixa Futuro.',
    relacaoComTela: 'As outras continuam no seletor "Trocar consulta".',
    obrigatorio: false,
  },

  // ── Início no celular ────────────────────────────────────────────────────────────────────
  'inicioCards.ativo': {
    titulo: 'Mostrar o card',
    paraQueServe: 'Liga ou desliga cada card do Início.',
    relacaoComTela: 'As setas mudam a ordem. Só grava em Salvar.',
    obrigatorio: false,
  },
}

export const formularios = {}
