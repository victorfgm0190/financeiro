// Help de campo — CONTAS: cadastro/edição de conta (corrente, poupança, dinheiro, gerencial, bem,
// dívida) e de cartão de crédito (src/components/Accounts/AccountForm.jsx, data-help-form="conta").
// Campo: { titulo, paraQueServe, relacaoComTela, oQueAconteceAoSalvar?, obrigatorio, quandoUsar?, atencao?, exemplo? }
// Nada específico de um cliente.

export const campos = {
  // ── Identificação ─────────────────────────────────────────────────────────────────────────────
  'conta.tipo': {
    titulo: 'Tipo de conta',
    paraQueServe: 'Define como a conta se comporta: corrente, poupança, cartão, dinheiro, gerencial, bem ou dívida. Muda os campos e os cálculos disponíveis.',
    relacaoComTela: 'Cartão mostra limite, fechamento, vencimento e conta pagadora; Bem e Dívida trocam o saldo inicial por valor atual e aquisição; Conta Corrente pode ser a Conta central; Poupança e Bem podem ser marcados como investimento.',
    obrigatorio: true,
  },
  'conta.nome': {
    titulo: 'Nome da conta',
    paraQueServe: 'Nome que aparece nas listas, nos seletores de conta e nos relatórios.',
    relacaoComTela: 'Junto com o apelido, identifica a subconta gerencial ligada a um cartão. Em subconta criada pelo controle gerencial o nome fica travado.',
    obrigatorio: true,
    exemplo: 'Conta Corrente Banco Exemplo',
  },
  'conta.apelido': {
    titulo: 'Apelido',
    paraQueServe: 'Nome curto usado no extrato gerencial e nos selos da conta. Até 8 caracteres.',
    relacaoComTela: 'Num cartão, é por ele que o controle gerencial encontra a subconta do cartão: mudar o apelido pede confirmação, porque a subconta antiga deixa de ser achada.',
    obrigatorio: false,
    exemplo: 'BCOEX',
  },
  'conta.banco': {
    titulo: 'Banco / instituição',
    paraQueServe: 'Nome do banco ou da instituição da conta, só para identificação.',
    relacaoComTela: 'Aparece no card da conta. Não muda saldos nem cálculos.',
    obrigatorio: false,
    exemplo: 'Banco Exemplo',
  },
  'conta.grupo': {
    titulo: 'Grupo',
    paraQueServe: 'Agrupa contas para organizar a lista e somar saldos em conjunto.',
    relacaoComTela: 'A lista de Contas mostra o grupo com o total das contas dele. Em "Rendimento por: Grupo", o saldo de referência é a soma das contas deste grupo.',
    obrigatorio: false,
  },
  'conta.vinculo': {
    titulo: 'Vínculo (perfil)',
    paraQueServe: 'Perfil (CPF ou CNPJ) dono da conta. Define em que perfil a conta e seus lançamentos aparecem.',
    relacaoComTela: 'Sem vínculo, a conta só aparece no filtro "Tudo", fica fora do Saldo Principal e dos totais dos perfis e não pode ser Conta central. As categorias oferecidas nos campos abaixo são as deste perfil.',
    obrigatorio: false,
    atencao: 'Conta sem perfil fica "perdida" nos relatórios por perfil.',
  },

  // ── Saldos ────────────────────────────────────────────────────────────────────────────────────
  'conta.saldoInicial': {
    titulo: 'Saldo inicial',
    paraQueServe: 'Saldo da conta antes do primeiro lançamento registrado. O saldo atual é calculado a partir dele.',
    relacaoComTela: 'Saldo atual = saldo inicial + entradas − saídas dos lançamentos. Na edição, mudar o saldo inicial e usar "Recalcular" refaz o saldo atual com o valor novo.',
    obrigatorio: false,
    exemplo: '1.500,00',
  },
  'conta.valorAtual': {
    titulo: 'Valor atual / saldo devedor',
    paraQueServe: 'No bem, quanto ele vale hoje; na dívida, quanto falta pagar.',
    relacaoComTela: 'Entra no Patrimônio (bem soma, dívida subtrai). Em dívida de financiamento o saldo devedor é calculado pelo financiamento e não é editado aqui.',
    obrigatorio: false,
  },
  'conta.valorAquisicao': {
    titulo: 'Valor de aquisição',
    paraQueServe: 'Quanto o bem custou (ou o valor original da dívida).',
    relacaoComTela: 'Serve de referência para comparar com o valor atual (valorização ou desvalorização). Não mexe no saldo.',
    obrigatorio: false,
  },
  'conta.dataAquisicao': {
    titulo: 'Data de aquisição',
    paraQueServe: 'Quando o bem foi comprado (ou a dívida contraída).',
    relacaoComTela: 'Só registro, junto com o valor de aquisição. Não muda saldos.',
    obrigatorio: false,
  },

  // ── Cartão de crédito ─────────────────────────────────────────────────────────────────────────
  'cartao.limite': {
    titulo: 'Limite',
    paraQueServe: 'Valor total de crédito do cartão. O disponível é calculado descontando as compras em aberto.',
    relacaoComTela: 'O card do cartão mostra o limite usado e o disponível a partir deste valor.',
    obrigatorio: false,
  },
  'cartao.fechamento': {
    titulo: 'Dia de fechamento',
    paraQueServe: 'Dia em que a fatura fecha. Compras depois dele entram na fatura seguinte.',
    relacaoComTela: 'Define a fatura de cada compra (fatura de referência) e o período de cada fatura. Sem ele, a fatura usa um dia padrão até ser preenchido.',
    obrigatorio: true,
  },
  'cartao.vencimento': {
    titulo: 'Dia de vencimento',
    paraQueServe: 'Dia em que a fatura vence e o pagamento é agendado.',
    relacaoComTela: 'É a data do agendamento de pagamento da fatura, que sai da conta pagadora.',
    obrigatorio: true,
  },
  'cartao.finais': {
    titulo: 'Finais do cartão',
    paraQueServe: 'Últimos dígitos do cartão, usados para reconhecer as compras na importação da fatura.',
    relacaoComTela: 'O Assistente e a importação usam os finais para saber de qual cartão é a compra ("final 4541"). Use 4 dígitos por final, separados por vírgula (titular e adicionais).',
    obrigatorio: false,
    exemplo: '4541, 1234',
  },
  'cartao.spread': {
    titulo: 'Spread do dólar',
    paraQueServe: 'Acréscimo sobre a cotação usado nas compras em dólar enquanto não há faturas conferidas.',
    relacaoComTela: 'Compra em dólar: R$ = US$ × PTAX × (1 + spread). Com 3 compras em dólar já conferidas pela fatura, vale a média delas; vazio = 2,5%.',
    obrigatorio: false,
  },
  'cartao.iofSeparado': {
    titulo: 'IOF em linha separada',
    paraQueServe: 'Marque se a fatura deste cartão traz o IOF das compras em dólar numa linha à parte.',
    relacaoComTela: 'Compra em dólar lançada pelo Assistente ganha o IOF como lançamento separado; desmarcado, o IOF fica somado na própria compra.',
    obrigatorio: false,
  },
  'cartao.contaPagadora': {
    titulo: 'Conta pagadora',
    paraQueServe: 'Conta de onde sai o pagamento da fatura.',
    relacaoComTela: 'O agendamento de pagamento da fatura debita esta conta. Em branco, usa a conta principal padrão.',
    obrigatorio: false,
  },

  // ── Exibição e cálculos ───────────────────────────────────────────────────────────────────────
  'conta.destacar': {
    titulo: 'Destacar em Lançamentos',
    paraQueServe: 'Coloca a conta no grupo do topo da lista e da escolha de conta em Lançamentos.',
    relacaoComTela: 'Só muda a ordem de exibição. Não mexe em saldos.',
    obrigatorio: false,
  },
  'conta.favorita': {
    titulo: 'Conta favorita ★',
    paraQueServe: 'Conta marcada com ★ e listada primeiro em Lançamentos.',
    relacaoComTela: 'Uma por perfil: ao salvar, a favorita anterior do mesmo perfil deixa de ser favorita (o aviso mostra qual).',
    obrigatorio: false,
  },
  'conta.esconderCelular': {
    titulo: 'Esconder no celular',
    paraQueServe: 'Tira a conta das listas e seletores no celular.',
    relacaoComTela: 'Continua aparecendo no computador e nos saldos e totais. Só disponível no computador.',
    obrigatorio: false,
  },
  'conta.somarSaldoPrincipal': {
    titulo: 'Somar no Saldo Principal (FC)',
    paraQueServe: 'Inclui a conta no Saldo Principal, no Fluxo de Caixa e nos relatórios por padrão.',
    relacaoComTela: 'O selo FC aparece no card. Desligada, a conta continua com saldo próprio, mas fica fora do "Como chegamos aqui" e do Fluxo de Caixa.',
    obrigatorio: false,
  },
  'conta.compensarResgate': {
    titulo: 'Compensar resgate e aplicação',
    paraQueServe: 'No extrato, resgate e aplicação na mesma data viram um único valor líquido.',
    relacaoComTela: 'Só muda a apresentação do extrato desta conta. Os lançamentos continuam separados.',
    obrigatorio: false,
  },
  'conta.central': {
    titulo: 'Conta central (CC)',
    paraQueServe: 'Conta que paga as faturas, movimenta o gerencial do cartão e recebe os resgates de reserva.',
    relacaoComTela: 'Uma por perfil e só para Conta Corrente com vínculo. Ao salvar, a Conta central anterior do mesmo perfil é substituída (o aviso mostra qual).',
    obrigatorio: false,
  },

  // ── Finalidade, reserva e investimento ────────────────────────────────────────────────────────
  'conta.finalidade': {
    titulo: 'Finalidade da conta',
    paraQueServe: 'Uso comum, Reserva (dinheiro guardado para um fim) ou Patrimônio (aplicações).',
    relacaoComTela: 'Reserva mostra o tipo de reserva e a conta aparece em Reservas; Patrimônio pede a categoria e faz as transferências para a conta virarem despesa (e os resgates, receita) nela.',
    obrigatorio: true,
  },
  'conta.tipoReserva': {
    titulo: 'Tipo de reserva',
    paraQueServe: 'Geral guarda dinheiro sem destino fixo; específica fica ligada a uma categoria de despesa.',
    relacaoComTela: 'Específica mostra a "Categoria vinculada"; geral usa a categoria Reservas Gerais nos lançamentos de reserva.',
    obrigatorio: false,
  },
  'conta.categoriaReserva': {
    titulo: 'Categoria da reserva',
    paraQueServe: 'Categoria da despesa que esta reserva cobre. Os depósitos aparecem nela nos relatórios.',
    relacaoComTela: 'Só para reserva específica. As categorias oferecidas são as do perfil da conta.',
    obrigatorio: false,
  },
  'conta.categoriaPatrimonio': {
    titulo: 'Categoria do patrimônio',
    paraQueServe: 'Categoria em que entram as transferências para esta conta (como despesa) e os resgates (como receita).',
    relacaoComTela: 'Obrigatória com a finalidade Patrimônio: sem ela, a conta não é salva. O saldo da conta soma no KPI de Investimentos.',
    obrigatorio: true,
  },
  'conta.investimento': {
    titulo: 'É investimento?',
    paraQueServe: 'Conta que acumula patrimônio com liquidez condicional (consórcio, imóvel na planta, previdência).',
    relacaoComTela: 'Ligado, pede a categoria do investimento: as transferências para a conta viram despesa e os resgates, receita, nessa categoria.',
    obrigatorio: false,
  },
  'conta.categoriaInvestimento': {
    titulo: 'Categoria do investimento',
    paraQueServe: 'Categoria usada para registrar as aplicações e os resgates desta conta.',
    relacaoComTela: 'Obrigatória quando "É investimento?" está ligado: sem ela, a conta não é salva.',
    obrigatorio: true,
  },
  'conta.categoriaRendimento': {
    titulo: 'Categoria do rendimento',
    paraQueServe: 'Categoria da receita criada pelo botão Lançar Rendimento desta conta.',
    relacaoComTela: 'Sem categoria, o botão Lançar Rendimento do card fica desativado. Com ela, aparece "Rendimento por".',
    obrigatorio: false,
  },
  'conta.rendimentoPor': {
    titulo: 'Rendimento por',
    paraQueServe: 'Indica se o rendimento é informado para esta conta sozinha ou para o grupo de contas inteiro.',
    relacaoComTela: 'Conta: o saldo de referência é o desta conta. Grupo: é a soma das contas do grupo (sem grupo, volta para o desta conta). A receita é lançada sempre nesta conta.',
    obrigatorio: false,
  },
}

export const formularios = {}
