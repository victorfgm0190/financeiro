// Grupo "contas": telas accounts, accounts:extrato, credit, credit:extrato, patrimonio.
// Central de Ajuda: explicação e exemplo de CADA item já existente de AJUDA_TELAS destas telas.

export const detalhes = {
  accounts: {
    errosComuns: [
      'Conta criada "some" da lista: ela foi salva sem perfil e o filtro do topo está num perfil. Escolha "Tudo" no topo, edite a conta e defina o perfil.',
      'Saldo da conta diferente do banco: confira o Saldo Inicial no cadastro (lápis) e use "Recalcular" para refazer o saldo pelos lançamentos.',
      'Conta não entra no Saldo Principal: edite a conta e ligue "Somar no Saldo Principal" (selo FC).',
    ],
    itens: {
      saldo: {
        detalhe: 'Soma o saldo de hoje de todas as contas que aparecem na tela, respeitando o perfil escolhido no topo. Quando há lançamentos já feitos com data à frente, aparece também o Saldo Futuro, que já conta com eles.',
        exemplo: 'Exemplo: conta corrente com R$ 2.000,00 e poupança com R$ 500,00 dão Saldo Atual de R$ 2.500,00.',
      },
      pl: {
        detalhe: 'É o retrato do que você tem: soma contas, investimentos e bens e tira as dívidas e o que está em aberto no cartão. Clique no card para ver item por item de onde vem o número.',
        exemplo: 'Exemplo: R$ 10.000,00 em contas mais um carro de R$ 40.000,00, menos R$ 15.000,00 de financiamento, dão R$ 35.000,00.',
      },
      'sem-grupo': {
        detalhe: 'Conta sem grupo não some: ela vai para a seção "Sem Grupo", no fim da página. Este aviso mostra quantas estão lá e leva você direto até elas.',
        exemplo: 'Exemplo: "2 sem grupo ↓" — clique, veja as duas contas e arraste cada uma para o grupo certo.',
      },
      grupos: {
        detalhe: 'Abre a lista de grupos para criar, renomear ou mudar a ordem deles. Grupos do tipo patrimonial servem para bens, dívidas e empréstimos e alimentam a tela Patrimônio.',
        exemplo: 'Exemplo: crie os grupos "Bancos", "Investimentos" e "Veículos" e coloque "Bancos" em primeiro.',
      },
      nova: {
        detalhe: 'Abre o cadastro de conta. Ali você escolhe o tipo (conta corrente, poupança, cartão, dinheiro, bem, dívida…), o nome, o perfil dono e o grupo. Cartão de crédito também é cadastrado por aqui.',
        exemplo: 'Exemplo: tipo "Conta Corrente", nome "Conta do dia a dia", perfil da pessoa física, grupo "Bancos".',
      },
      grupo: {
        detalhe: 'Cada grupo tem um cabeçalho com o nome e o total das contas dele. Clicar recolhe ou abre o grupo, para a tela ficar mais limpa.',
        exemplo: 'Exemplo: recolha o grupo "Investimentos" para ver só as contas do dia a dia.',
        porLinha: true,
      },
      card: {
        detalhe: 'Cada conta aparece num cartão colorido com o saldo de hoje e o saldo futuro. Clique nele para abrir o extrato da conta. Para mudar de grupo, arraste o cartão até o outro grupo.',
        exemplo: 'Exemplo: clique no cartão da conta corrente para ver os lançamentos do mês.',
        porLinha: true,
      },
      selos: {
        detalhe: 'As etiquetas abaixo do nome resumem a conta: o perfil dono (ou "Sem vínculo"), o apelido, FC (soma no Saldo Principal), INV (investimento), CC (Conta central) e Inativa. "Sem vínculo" quer dizer que a conta não tem perfil: só aparece no filtro "Tudo" e fica fora dos totais dos perfis.',
        exemplo: 'Exemplo: uma conta com os selos "FC" e "CC" soma no Saldo Principal e é a conta que paga as faturas do perfil.',
        porLinha: true,
      },
      rendimento: {
        detalhe: 'Você informa o saldo novo que o banco mostra e o app lança a diferença como receita de rendimento. Só aparece quando a conta tem uma categoria de rendimento no cadastro.',
        exemplo: 'Exemplo: a aplicação tinha R$ 1.000,00 e o banco mostra R$ 1.008,50; o app lança R$ 8,50 de rendimento.',
        porLinha: true,
      },
      editar: {
        detalhe: 'Abre o mesmo formulário do cadastro, já preenchido. Dá para trocar nome, apelido, perfil, grupo, saldo inicial e as opções da conta.',
        exemplo: 'Exemplo: a conta está "Sem vínculo"; clique no lápis e escolha o perfil em "Vínculo (CPF / CNPJ)".',
        porLinha: true,
      },
      inativar: {
        detalhe: 'Conta inativa continua com todo o histórico, mas deixa de aparecer na escolha de conta dos lançamentos. Útil para conta encerrada. Clique no olho de novo para reativar.',
        exemplo: 'Exemplo: você encerrou uma conta antiga; inative-a para ela não aparecer mais ao lançar.',
        porLinha: true,
      },
      excluir: {
        detalhe: 'Apaga a conta de vez. O app pede confirmação antes. Se a conta tem histórico, prefira inativar.',
        exemplo: 'Exemplo: você criou uma conta de teste por engano; exclua-a pela lixeira.',
        porLinha: true,
      },
      ordem: {
        detalhe: 'As setas sobem ou descem a conta uma posição dentro do grupo. A ordem vale para esta tela.',
        exemplo: 'Exemplo: suba a conta que você mais usa para o topo do grupo "Bancos".',
        porLinha: true,
      },
      recalcular: {
        detalhe: 'Refaz o saldo da conta somando, desde o saldo inicial, todos os lançamentos dela. Use quando o saldo parecer errado.',
        exemplo: 'Exemplo: depois de corrigir vários lançamentos antigos, clique em Recalcular para o saldo ficar certo.',
        porLinha: true,
      },
      favorita: {
        detalhe: 'A conta favorita ganha uma estrela e já vem escolhida primeiro em Lançamentos. Cada perfil tem uma favorita: marcar outra tira a estrela da anterior do mesmo perfil.',
        exemplo: 'Exemplo: marque como favorita a conta onde cai o seu salário, que é a que você mais usa.',
        porLinha: true,
      },
      'atualizar-valor': {
        detalhe: 'Aparece no cartão das contas do tipo Bem / Ativo, no lugar do "Recalcular". O bem não tem lançamentos para recalcular: você mesmo informa o valor de hoje, e o anterior fica guardado.',
        exemplo: 'Exemplo: o imóvel foi avaliado em R$ 280.000,00; clique em Atualizar Valor e informe o novo número.',
        porLinha: true,
      },
    },
  },

  'accounts:extrato': {
    errosComuns: [
      'Lançamento não aparece: confira o mês no seletor e limpe os filtros (X).',
      'Saldo Futuro diferente do Saldo Atual: há lançamentos com data à frente; eles só contam no Saldo Atual quando a data chegar.',
    ],
    itens: {
      voltar: {
        detalhe: 'Fecha o extrato e volta para a lista de contas, no mesmo lugar onde você estava.',
        exemplo: 'Exemplo: terminou de conferir o mês? Clique em Voltar para escolher outra conta.',
      },
      mes: {
        detalhe: 'O extrato mostra um mês por vez. As setas levam para o mês anterior ou o seguinte, e o saldo de cada linha acompanha.',
        exemplo: 'Exemplo: clique na seta da esquerda para ver os lançamentos do mês passado.',
      },
      'resumo-fatura': {
        detalhe: 'Aparece em contas gerenciais. Mostra, para cada fatura do cartão, quanto entrou e quanto saiu nesta conta, para você ver se a fatura está coberta.',
        exemplo: 'Exemplo: a fatura de março recebeu R$ 800,00 e gastou R$ 750,00; sobram R$ 50,00 nela.',
      },
      selecionar: {
        detalhe: 'Liga caixinhas em cada linha para você marcar vários lançamentos. Depois, a barra de baixo deixa alterar, conciliar ou excluir todos de uma vez.',
        exemplo: 'Exemplo: marque cinco lançamentos de mercado e troque a categoria de todos juntos.',
      },
      reconciliar: {
        detalhe: 'Abre a lista do período ao lado do que o banco mostra, para você ir marcando como conferido o que bate. Só no computador.',
        exemplo: 'Exemplo: com o extrato do banco aberto, marque cada lançamento igual como conferido.',
      },
      'conciliar-gerenciais': {
        detalhe: 'Marca como conferidos, de uma só vez, os lançamentos pendentes do período que envolvem uma conta gerencial. Poupa o trabalho de marcar um por um.',
        exemplo: 'Exemplo: no fim do mês, clique para conferir todas as transferências de controle de uma vez.',
      },
      excel: {
        detalhe: 'Baixa uma planilha com o extrato do mês, do jeito que está filtrado na tela.',
        exemplo: 'Exemplo: filtre só as saídas e clique em Excel para mandar a lista ao contador.',
      },
      novo: {
        detalhe: 'Abre o formulário de lançamento já com esta conta escolhida. Serve para receita, despesa ou transferência.',
        exemplo: 'Exemplo: lance uma despesa de R$ 120,00 de farmácia direto nesta conta.',
      },
      saldos: {
        detalhe: 'Os quadros do topo mostram o Saldo Atual, o Saldo Futuro (quando há lançamentos com data à frente) e quanto entrou e saiu no mês.',
        exemplo: 'Exemplo: Entradas R$ 5.000,00 e Saídas R$ 3.200,00 mostram que sobraram R$ 1.800,00 no mês.',
      },
      filtros: {
        detalhe: 'Cada coluna tem um campo de busca. Digite parte da data, do histórico, do favorecido ou da conta; em Entrada e Saída, digite um valor.',
        exemplo: 'Exemplo: digite "luz" no histórico para achar a conta de energia do mês.',
      },
      'filtro-conciliacao': {
        detalhe: 'Troca entre ver todos os lançamentos, só os já conferidos com o banco ou só os que ainda faltam conferir.',
        exemplo: 'Exemplo: escolha "Pendentes" para ver o que ainda falta bater com o banco.',
      },
      limpar: {
        detalhe: 'Apaga de uma vez tudo o que foi digitado nos filtros e volta a mostrar a lista completa.',
        exemplo: 'Exemplo: depois de buscar "luz", clique no X para ver tudo de novo.',
      },
      'acoes-linha': {
        detalhe: 'Ao passar o mouse sobre um lançamento aparecem botões para editar, duplicar, estornar ou excluir. Duplicar é útil para gastos parecidos.',
        exemplo: 'Exemplo: duplique a compra de padaria de ontem e só troque a data e o valor.',
        porLinha: true,
      },
      conciliado: {
        detalhe: 'O círculo da coluna R diz se o lançamento já foi conferido com o banco. Clique para marcar ou desmarcar.',
        exemplo: 'Exemplo: o banco mostra o débito de R$ 89,90; clique no círculo da mesma linha para marcar como conferido.',
      },
      'barra-selecao': {
        detalhe: 'Aparece embaixo quando o modo Selecionar está ligado e há lançamentos marcados. Ela mostra quantos estão marcados e os botões para alterar, conciliar, desconciliar ou excluir.',
        exemplo: 'Exemplo: com 3 lançamentos marcados, clique em Conciliar para conferir os três juntos.',
      },
    },
  },

  credit: {
    errosComuns: [
      'Compra caiu na fatura errada: confira o dia de fechamento no cadastro do cartão (lápis).',
      '"Novo Lançamento" bloqueado: a fatura está fechada. Clique em "Abrir Fatura" se precisar lançar nela.',
      'Não aparece nenhum cartão: cadastre o cartão em Contas → Nova Conta, tipo "Cartão de Crédito".',
    ],
    itens: {
      cartao: {
        detalhe: 'Se você tem mais de um cartão, escolha aqui qual quer ver. A tela inteira (fatura, totais e lista) passa a ser desse cartão.',
        exemplo: 'Exemplo: troque do cartão pessoal para o cartão da empresa.',
      },
      'editar-cartao': {
        detalhe: 'Abre o cadastro do cartão: limite, dias de fechamento e vencimento, finais e a conta que paga a fatura. É o mesmo cadastro da tela Contas.',
        exemplo: 'Exemplo: o banco mudou o vencimento para o dia 15; abra o lápis e troque o Dia de Vencimento.',
      },
      fatura: {
        detalhe: 'Mostra o mês da fatura que está na tela. As setas levam para a fatura anterior ou a próxima, inclusive faturas futuras com parcelas.',
        exemplo: 'Exemplo: clique na seta da direita para ver quanto das parcelas já cai na fatura do mês que vem.',
      },
      extrato: {
        detalhe: 'Abre o extrato gerencial do cartão: todas as movimentações de um período, com o grupo gerencial e o saldo corrido. Só no computador.',
        exemplo: 'Exemplo: veja tudo o que passou pelo cartão de janeiro a março numa lista só.',
      },
      relatorio: {
        detalhe: 'Mostra a fatura organizada para conferir e exportar, com os totais por categoria.',
        exemplo: 'Exemplo: abra o relatório para ver quanto da fatura foi de restaurante.',
      },
      'fatura-selecionada': {
        detalhe: 'O total das compras da fatura que está na tela e quantos lançamentos ela tem. Se há despesas agendadas para entrar nela, o card mostra os "previstos" e o total com eles.',
        exemplo: 'Exemplo: R$ 1.200,00 em 18 lançamentos, + R$ 100,00 previstos = R$ 1.300,00 total.',
      },
      pagamento: {
        detalhe: 'Mostra quanto ainda falta pagar ou quanto já foi pago, e se a fatura está paga, parcialmente paga ou não paga.',
        exemplo: 'Exemplo: fatura de R$ 1.300,00 com R$ 1.000,00 pagos aparece como "Parcialmente paga".',
      },
      fechar: {
        detalhe: 'Fechar a fatura trava a fatura para ninguém lançar nela sem querer depois de conferida. Se precisar ajustar algo, clique em "Abrir Fatura".',
        exemplo: 'Exemplo: conferiu a fatura com a do banco? Feche-a para não mexer mais.',
      },
      novo: {
        detalhe: 'Abre o formulário já com este cartão escolhido, para lançar uma compra ou um estorno. Fica bloqueado quando a fatura está fechada.',
        exemplo: 'Exemplo: lance uma compra de R$ 300,00 em 3 vezes; as parcelas vão para as próximas faturas.',
      },
      pagar: {
        detalhe: 'Registra o pagamento da fatura, saindo da conta pagadora do cartão. Já vem com o total e a data do vencimento; você pode mudar o valor para pagar só uma parte.',
        exemplo: 'Exemplo: pague R$ 1.300,00 da conta corrente no dia do vencimento.',
      },
      atualizar: {
        detalhe: 'Refaz o total da fatura e acerta o valor da conta a pagar dela nos agendamentos. Use depois de mudar várias compras.',
        exemplo: 'Exemplo: você corrigiu o valor de duas compras; clique em Atualizar para a conta a pagar acompanhar.',
      },
      revisar: {
        detalhe: 'Mostra os ajustes automáticos que o app faria nesta fatura (transferências de controle e resgates) antes de aplicar, para você conferir.',
        exemplo: 'Exemplo: antes de fechar o mês, revise e veja se falta algum resgate de reserva.',
      },
      selecionar: {
        detalhe: 'Liga caixinhas em cada compra para marcar várias e alterar ou conciliar todas de uma vez.',
        exemplo: 'Exemplo: marque todas as compras de combustível e troque a categoria de uma vez.',
      },
      reconciliar: {
        detalhe: 'Abre a lista da fatura para você marcar como conferido o que bate com a fatura do banco. Só no computador.',
        exemplo: 'Exemplo: com a fatura do banco ao lado, marque cada compra igual como conferida.',
      },
      'acoes-linha': {
        detalhe: 'Botões no fim de cada compra: editar, duplicar ou excluir.',
        exemplo: 'Exemplo: a compra foi lançada com valor errado; clique em editar e corrija.',
        porLinha: true,
      },
      conciliado: {
        detalhe: 'O círculo da coluna R diz se a compra já foi conferida com a fatura do banco. Clique para marcar ou desmarcar.',
        exemplo: 'Exemplo: a compra de R$ 59,90 está na fatura do banco; clique no círculo dela.',
      },
      previstos: {
        detalhe: 'São despesas agendadas para cair neste cartão que ainda não viraram compra. Elas entram no total previsto da fatura. Clique para ver a lista.',
        exemplo: 'Exemplo: a assinatura de streaming de R$ 39,90 agendada no cartão aparece aqui até ser lançada.',
      },
      limite: {
        detalhe: 'Quanto do limite ainda está livre: o limite do cartão menos tudo o que está em aberto, incluindo parcelas futuras.',
        exemplo: 'Exemplo: limite de R$ 5.000,00 com R$ 1.800,00 em aberto deixa R$ 3.200,00 disponíveis.',
      },
      'divida-total': {
        detalhe: 'Tudo o que você deve neste cartão, somando a fatura atual e as parcelas das próximas. Embaixo aparecem os dias de fechamento e de vencimento.',
        exemplo: 'Exemplo: fatura de R$ 1.000,00 e mais R$ 800,00 de parcelas futuras dão R$ 1.800,00 de dívida.',
      },
    },
  },

  'credit:extrato': {
    errosComuns: [
      'Lista vazia: confira se as datas De e Até cobrem o período que você quer ver.',
    ],
    itens: {
      cartao: {
        detalhe: 'Escolha de qual cartão você quer o extrato. A lista e o saldo mudam na hora.',
        exemplo: 'Exemplo: escolha o cartão da empresa para ver só as movimentações dele.',
      },
      de: {
        detalhe: 'Primeiro dia do período do extrato. Lançamentos antes desta data ficam de fora.',
        exemplo: 'Exemplo: 01/01 para começar no início do ano.',
      },
      ate: {
        detalhe: 'Último dia do período do extrato. Lançamentos depois desta data ficam de fora.',
        exemplo: 'Exemplo: 31/03 para ver o primeiro trimestre inteiro.',
      },
      ger: {
        detalhe: 'Mostra o grupo gerencial de cada lançamento, ou seja, de qual controle o gasto saiu.',
        exemplo: 'Exemplo: um gasto de viagem marcado com o grupo da reserva "Viagem".',
      },
      conciliado: {
        detalhe: 'O círculo da coluna R mostra se o lançamento já foi conferido. Clique para marcar ou desmarcar.',
        exemplo: 'Exemplo: clique no círculo do pagamento da fatura depois de ver que ele saiu do banco.',
      },
      saldo: {
        detalhe: 'O saldo do cartão depois de cada linha. "D" quer dizer que você está devendo; "C" quer dizer que há crédito a seu favor.',
        exemplo: 'Exemplo: "R$ 450,00 D" depois de uma compra; "R$ 0,00" depois do pagamento da fatura.',
      },
    },
  },

  patrimonio: {
    errosComuns: [
      'Bem não aparece: ele é cadastrado em Contas → Nova Conta, tipo "Bem / Ativo" (ou numa conta de um grupo patrimonial).',
      'Gráfico de evolução "reto": atualize o valor dos bens de tempos em tempos para o histórico mostrar a variação.',
    ],
    itens: {
      kpis: {
        detalhe: 'Cada card soma uma parte do patrimônio: bens (imóveis, veículos), investimentos, saldo das contas, dívidas e o que está em aberto no cartão. Clique em qualquer um para ver a lista do que entra nele.',
        exemplo: 'Exemplo: clique em "Bens" e veja que ele soma um apartamento e um carro.',
      },
      pl: {
        detalhe: 'É o resultado final: bens + investimentos + contas, menos dívidas, empréstimos e cartão. Clique para ver a conta completa.',
        exemplo: 'Exemplo: R$ 300.000,00 em bens e contas menos R$ 120.000,00 de dívidas dão R$ 180.000,00.',
      },
      evolucao: {
        detalhe: 'Gráfico com o patrimônio líquido dos últimos 6 meses. Os meses passados usam o histórico de valores dos bens; sem atualizações, a linha fica quase reta.',
        exemplo: 'Exemplo: ao atualizar o valor do carro todo mês, o gráfico mostra a desvalorização dele.',
      },
      bem: {
        detalhe: 'Clicar no nome abre a ficha do bem, com nota fiscal, entrada, financiamento e parcelas.',
        exemplo: 'Exemplo: clique no nome do carro para ver quantas parcelas do financiamento faltam.',
        porLinha: true,
      },
      historico: {
        detalhe: 'Mostra ou esconde a lista de valores que o bem já teve, com data e observação.',
        exemplo: 'Exemplo: veja que o imóvel valia R$ 250.000,00 no ano passado e R$ 270.000,00 hoje.',
        porLinha: true,
      },
      detalhar: {
        detalhe: 'Abre a ficha completa do bem, onde você registra a entrada, monta o financiamento e paga as parcelas.',
        exemplo: 'Exemplo: comprou um carro com entrada e 48 parcelas? Registre tudo na ficha dele.',
        porLinha: true,
      },
      'atualizar-valor': {
        detalhe: 'Você informa quanto o bem vale hoje e, se quiser, uma observação. O valor antigo não se perde: vai para o histórico.',
        exemplo: 'Exemplo: a tabela de preços diz que o carro vale R$ 42.000,00; atualize com a observação "tabela de março".',
        porLinha: true,
      },
      divida: {
        detalhe: 'Mostra o saldo devedor de cada dívida. Quando é financiamento, clique para consultar as parcelas pagas e as que faltam.',
        exemplo: 'Exemplo: clique no financiamento do imóvel para ver o saldo devedor e a próxima parcela.',
        porLinha: true,
      },
      resumo: {
        detalhe: 'A conta do patrimônio linha por linha, do total de bens até o patrimônio líquido. Clique numa linha para ver o que forma aquele valor.',
        exemplo: 'Exemplo: clique na linha "Dívidas" para ver cada dívida e quanto falta de cada uma.',
      },
    },
  },
}

// Itens que faltavam no inventário (botões/cards reais). Marcados com data-guia no componente.
export const novosItens = {
  accounts: [
    {
      chave: 'atualizar-valor', rotulo: 'Atualizar Valor', depoisDe: 'recalcular',
      texto: 'Em contas de bem, informa quanto o bem vale hoje; o valor antigo vai para o histórico.',
      detalhe: 'Aparece no cartão das contas do tipo Bem / Ativo, no lugar do "Recalcular". O bem não tem lançamentos para recalcular: você mesmo informa o valor de hoje, e o anterior fica guardado.',
      exemplo: 'Exemplo: o imóvel foi avaliado em R$ 280.000,00; clique em Atualizar Valor e informe o novo número.',
      modulo: 'pode:contas:editar',
    },
  ],
  credit: [
    {
      chave: 'limite', rotulo: 'Limite Disponível', depoisDe: 'fatura-selecionada',
      texto: 'Quanto do limite do cartão ainda está livre.',
      detalhe: 'É o limite do cartão menos tudo o que está em aberto, incluindo parcelas de faturas futuras.',
      exemplo: 'Exemplo: limite de R$ 5.000,00 com R$ 1.800,00 em aberto deixa R$ 3.200,00 disponíveis.',
    },
    {
      chave: 'divida-total', rotulo: 'Dívida Total', depoisDe: 'limite',
      texto: 'Tudo o que você deve no cartão, com os dias de fechamento e vencimento.',
      detalhe: 'Soma a fatura atual e as parcelas que ainda vão cair nas próximas. Embaixo aparecem o dia em que a fatura fecha e o dia em que vence.',
      exemplo: 'Exemplo: fatura de R$ 1.000,00 e mais R$ 800,00 de parcelas futuras dão R$ 1.800,00 de dívida.',
    },
  ],
}

// Tarefas "Faça comigo".
export const tarefas = [
  {
    id: 'accounts.conta-corrente',
    tela: 'accounts',
    hash: null,
    titulo: 'Criar uma conta corrente',
    descricao: 'Cadastre a sua conta do banco ligada a um perfil e a um grupo.',
    requer: ['pode:contas:incluir'],
    passos: [
      { alvo: 'accounts.nova', texto: 'Clique em "Nova Conta".', espera: 'clique' },
      { alvo: 'conta-form.tipo-checking', texto: 'Escolha "Conta Corrente".', espera: 'clique' },
      { alvo: 'conta-form.nome', texto: 'Dê um nome fácil de reconhecer, por exemplo "Conta do dia a dia".', espera: 'preencher' },
      { alvo: 'conta-form.grupo', texto: 'Escolha o grupo onde a conta vai aparecer (por exemplo "Bancos"). Se não quiser agora, ela fica em "Sem Grupo".', espera: 'nenhuma' },
      { alvo: 'conta-form.vinculo', texto: 'Escolha o perfil (CPF ou CNPJ) dono da conta. Sem perfil, ela fica "Sem vínculo" e fora dos totais.', espera: 'nenhuma' },
      { alvo: 'conta-form.saldo-inicial', texto: 'Informe o saldo que a conta tem hoje no banco. Daqui em diante, o saldo é calculado pelos lançamentos.', espera: 'nenhuma' },
      { alvo: 'conta-form.fc', texto: 'Ligue "Somar no Saldo Principal" se é dinheiro do dia a dia.', espera: 'nenhuma' },
      { alvo: 'conta-form.salvar', texto: 'Confira e clique em "Criar Conta".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'accounts', filtro: (a) => a.type === 'checking' },
    final: 'Pronto! A conta aparece no grupo escolhido e já pode ser usada nos lançamentos.',
  },
  {
    id: 'accounts.conta-reserva',
    tela: 'accounts',
    hash: null,
    titulo: 'Criar uma conta de reserva',
    descricao: 'Separe dinheiro guardado para um objetivo numa conta marcada como Reserva.',
    requer: ['pode:contas:incluir'],
    passos: [
      { alvo: 'accounts.nova', texto: 'Clique em "Nova Conta".', espera: 'clique' },
      { alvo: 'conta-form.tipo-savings', texto: 'Escolha o tipo da conta onde o dinheiro fica guardado, por exemplo "Poupança".', espera: 'clique' },
      { alvo: 'conta-form.nome', texto: 'Dê um nome que lembre o objetivo, por exemplo "Reserva de emergência".', espera: 'preencher' },
      { alvo: 'conta-form.vinculo', texto: 'Confira o perfil (CPF ou CNPJ) dono da reserva.', espera: 'nenhuma' },
      { alvo: 'conta-form.vinculo-tipo-reserva', texto: 'Em "Finalidade da conta", clique em "Reserva".', espera: 'clique' },
      { alvo: 'conta-form.reserva', texto: '"Geral" serve para qualquer gasto; "Específica" liga a reserva a uma categoria (por exemplo, Viagem).', espera: 'nenhuma' },
      { alvo: 'conta-form.salvar', texto: 'Clique em "Criar Conta".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'accounts', filtro: (a) => a.vinculoTipo === 'reserva' || a.isReserva === true },
    final: 'Pronto! A conta aparece em Reservas, e os resgates dela voltam para a conta central do perfil.',
  },
  {
    id: 'accounts.favorita',
    tela: 'accounts',
    hash: null,
    titulo: 'Marcar a conta favorita',
    descricao: 'Deixe a conta que você mais usa sempre escolhida primeiro nos lançamentos.',
    requer: ['pode:contas:editar'],
    passos: [
      { alvo: 'accounts.card', texto: 'Ache o cartão da conta que você mais usa.', espera: 'nenhuma' },
      { alvo: 'accounts.favorita', texto: 'Clique em "Definir como favorita" no cartão dessa conta.', espera: 'clique' },
      { alvo: 'accounts.card', texto: 'A conta ganhou a estrela ★. Cada perfil tem uma favorita: se outra conta do mesmo perfil era a favorita, ela perdeu a estrela.', espera: 'nenhuma' },
      { alvo: 'accounts.editar', texto: 'Também dá para marcar pelo lápis, na opção "Conta favorita ★" do cadastro.', espera: 'nenhuma' },
    ],
    novoItem: null,
    final: 'Pronto! Em Lançamentos, essa conta aparece primeiro e já vem escolhida.',
  },
  {
    id: 'accounts.sem-vinculo',
    tela: 'accounts',
    hash: null,
    titulo: 'Entender o "Sem vínculo"',
    descricao: 'Veja o que é uma conta sem perfil e como ligá-la ao CPF ou CNPJ certo.',
    requer: ['pode:contas:editar'],
    passos: [
      { alvo: 'accounts.selos', texto: 'O primeiro selo mostra o perfil dono da conta. "Sem vínculo" quer dizer que a conta não tem perfil.', espera: 'nenhuma' },
      { alvo: 'accounts.selos', texto: 'Conta sem vínculo só aparece com o filtro "Tudo" no topo, não entra no Saldo Principal nem nos totais e relatórios dos perfis, e não pode ser Conta central.', espera: 'nenhuma' },
      { alvo: 'accounts.editar', texto: 'Para resolver, clique no lápis da conta.', espera: 'clique' },
      { alvo: 'conta-form.vinculo', texto: 'Em "Vínculo (CPF / CNPJ)", escolha o perfil dono da conta. O aviso amarelo some quando há um perfil.', espera: 'nenhuma' },
      { alvo: 'conta-form.salvar', texto: 'Clique em "Salvar".', espera: 'clique' },
    ],
    novoItem: null,
    final: 'Pronto! A conta agora aparece no filtro do perfil e entra nos totais dele.',
  },
  {
    // O cartão é cadastrado em Contas (a tela Cartão de Crédito só mostra os já cadastrados).
    id: 'accounts.cadastrar-cartao',
    tela: 'accounts',
    hash: null,
    titulo: 'Cadastrar um cartão de crédito',
    descricao: 'Cadastre o cartão com limite e os dias de fechamento e vencimento, para cada compra cair na fatura certa.',
    requer: ['pode:contas:incluir', 'pagina:credit'],
    passos: [
      { alvo: 'accounts.nova', texto: 'O cartão é cadastrado aqui em Contas. Clique em "Nova Conta".', espera: 'clique' },
      { alvo: 'conta-form.tipo-credit', texto: 'Escolha "Cartão de Crédito".', espera: 'clique' },
      { alvo: 'conta-form.nome', texto: 'Dê um nome ao cartão, por exemplo "Cartão pessoal".', espera: 'preencher' },
      { alvo: 'conta-form.vinculo', texto: 'Confira o perfil (CPF ou CNPJ) dono do cartão.', espera: 'nenhuma' },
      { alvo: 'conta-form.limite', texto: 'Informe o limite do cartão, por exemplo 5.000,00.', espera: 'nenhuma' },
      { alvo: 'conta-form.fechamento', texto: 'Informe o dia em que a fatura fecha. Compras depois desse dia vão para a fatura seguinte.', espera: 'preencher' },
      { alvo: 'conta-form.vencimento', texto: 'Informe o dia em que a fatura vence.', espera: 'preencher' },
      { alvo: 'conta-form.finais', texto: 'Opcional: os 4 últimos números de cada cartão (titular e adicionais). Mais abaixo, em "Conta Pagadora", escolha de qual conta sai o pagamento.', espera: 'nenhuma' },
      { alvo: 'conta-form.salvar', texto: 'Clique em "Criar Conta".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'accounts', filtro: (a) => a.type === 'credit' },
    final: 'Pronto! O cartão aparece na tela Cartão de Crédito, com as faturas mês a mês.',
  },
  {
    id: 'credit.navegar-faturas',
    tela: 'credit',
    hash: null,
    titulo: 'Navegar entre as faturas',
    descricao: 'Veja a fatura atual, as anteriores e as próximas, com o total e o que falta pagar.',
    requer: ['pagina:credit'],
    passos: [
      { alvo: 'credit.cartao', texto: 'Se você tem mais de um cartão, escolha aqui qual quer ver.', espera: 'nenhuma' },
      { alvo: 'credit.fatura', texto: 'Clique numa das setas para ir para a fatura anterior ou a próxima.', espera: 'clique' },
      { alvo: 'credit.fatura-selecionada', texto: 'Aqui está o total da fatura escolhida e quantas compras ela tem.', espera: 'nenhuma' },
      { alvo: 'credit.pagamento', texto: 'Aqui você vê quanto falta pagar e se a fatura está paga.', espera: 'nenhuma' },
      { alvo: 'credit.divida-total', texto: 'Embaixo da Dívida Total aparecem os dias de fechamento e de vencimento do cartão.', espera: 'nenhuma' },
    ],
    novoItem: null,
    final: 'Pronto! Use as setas sempre que quiser ver parcelas de faturas futuras ou conferir faturas passadas.',
  },
  {
    // Bens são contas: o cadastro é feito em Contas (a tela Patrimônio só mostra os já cadastrados).
    id: 'accounts.primeiro-bem',
    tela: 'accounts',
    hash: null,
    titulo: 'Cadastrar o primeiro bem',
    descricao: 'Registre um imóvel, veículo ou outro bem para ele entrar no seu Patrimônio.',
    requer: ['pode:contas:incluir', 'pagina:patrimonio'],
    passos: [
      { alvo: 'accounts.nova', texto: 'Bens são cadastrados aqui em Contas. Clique em "Nova Conta".', espera: 'clique' },
      { alvo: 'conta-form.tipo-asset', texto: 'Escolha "Bem / Ativo".', espera: 'clique' },
      { alvo: 'conta-form.nome', texto: 'Dê um nome ao bem, por exemplo "Carro" ou "Apartamento".', espera: 'preencher' },
      { alvo: 'conta-form.grupo', texto: 'Se quiser, escolha um grupo (por exemplo "Veículos" ou "Imóveis").', espera: 'nenhuma' },
      { alvo: 'conta-form.vinculo', texto: 'Confira o perfil (CPF ou CNPJ) dono do bem.', espera: 'nenhuma' },
      { alvo: 'conta-form.valor-atual', texto: 'Informe quanto o bem vale hoje.', espera: 'preencher' },
      { alvo: 'conta-form.valor-aquisicao', texto: 'Opcional: quanto você pagou e, ao lado, a data da compra.', espera: 'nenhuma' },
      { alvo: 'conta-form.salvar', texto: 'Clique em "Criar Conta".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'accounts', filtro: (a) => a.type === 'asset' },
    final: 'Pronto! O bem aparece em Patrimônio, no card Bens. Lá você atualiza o valor e registra financiamento.',
  },
]
