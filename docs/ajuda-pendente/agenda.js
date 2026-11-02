// Grupo "agenda": Agendamentos, Fluxo de Caixa, Painel, Início (celular), Mais (celular),
// Maiores despesas (celular), Alertas e Integridade.

// Central de Ajuda: explicação e exemplo de CADA item já existente de AJUDA_TELAS destas telas.
export const detalhes = {
  schedule: {
    errosComuns: [
      'O agendamento não aparece na lista: confira o Período e o status (A pagar / Provisões / Pagos) — pode estar fora do intervalo escolhido.',
      'Pagou e o saldo não mudou: o pagamento só entra na conta depois de clicar em "Pagar" e confirmar. Só criar o agendamento não mexe no saldo.',
      'Conta paga em dobro: se o lançamento já foi feito à mão, use "Vincular a um lançamento" na janela de pagamento em vez de registrar outro.',
    ],
    itens: {
      visao: {
        detalhe: 'A Lista mostra os agendamentos um embaixo do outro, separados por data. O Calendário mostra o mês inteiro, com as contas em cada dia. Os filtros valem nas duas visões.',
        exemplo: 'Exemplo: use o Calendário para ver de relance quais dias do mês concentram mais contas a pagar.',
      },
      exportar: {
        detalhe: 'Gera uma planilha do Excel com exatamente o que está na tela: mesma aba, mesmo período e mesmos filtros. Bom para conferir ou mandar para outra pessoa.',
        exemplo: 'Exemplo: filtre "Saídas" em "Este mês" e exporte para ter a lista das contas a pagar do mês numa planilha.',
      },
      'executar-gerenciais': {
        detalhe: 'Quando há provisões do controle gerencial esperando, o Finup mostra quantas são. O botão faz de uma vez as transferências de controle entre as contas, sem você precisar fazer uma por uma. Você confere a lista antes de confirmar.',
        exemplo: 'Exemplo: o botão mostra "Executar Gerenciais (3)": clique, confira as três transferências e confirme.',
      },
      'lancar-provisao': {
        detalhe: 'Provisão é uma despesa que vai acontecer, mas cujo valor ou data você ainda não sabe com certeza. Você lança uma estimativa e ela já entra no Fluxo de Caixa. Quando a conta chegar, use "Efetivar Provisão" para informar o valor e a data reais.',
        exemplo: 'Exemplo: conserto do carro previsto para março, uns R$ 800,00 — lance como provisão e efetive quando souber o valor certo.',
      },
      novo: {
        detalhe: 'Abre o formulário para cadastrar uma conta a pagar (Despesa), a receber (Receita) ou uma transferência entre suas contas. Você escolhe se acontece uma vez só, se repete (todo mês, toda semana…) ou se é parcelada.',
        exemplo: 'Exemplo: aluguel de R$ 1.500,00 todo dia 10, sem data para acabar.',
      },
      abas: {
        detalhe: 'Cada aba junta um tipo de agendamento. "Agendamentos" são as contas normais; "Cartão de Crédito" são as faturas; "Gerencial" são os movimentos do controle gerencial; "Contas Anuais" são as despesas pagas com dinheiro guardado em reserva. O número em cada aba é quantos estão pendentes.',
        exemplo: 'Exemplo: para ver quando vence a próxima fatura do cartão, abra a aba "Cartão de Crédito".',
      },
      status: {
        detalhe: '"A pagar" mostra o que ainda vai acontecer ou está atrasado. "Provisões" mostra só as despesas estimadas. "Pagos" mostra o que já foi confirmado, com a data e o valor pagos.',
        exemplo: 'Exemplo: escolha "Pagos" e o período "Mês passado" para conferir tudo o que foi pago no mês anterior.',
      },
      periodo: {
        detalhe: 'Define de que datas a lista mostra os agendamentos. Contas atrasadas aparecem no topo, em destaque, para não serem esquecidas.',
        exemplo: 'Exemplo: escolha "Próximos 30 dias" para ver tudo o que vence até o mês que vem.',
      },
      filtros: {
        detalhe: 'Abre um painel com filtros extras. Dá para combinar vários: por exemplo, uma faixa de datas e uma categoria. Para voltar a ver tudo, limpe os filtros.',
        exemplo: 'Exemplo: digite "luz" na descrição para achar só a conta de energia.',
      },
      'conta-reserva': {
        detalhe: 'Aparece na aba Contas Anuais. Cada botão é uma conta de reserva; ao escolher uma, a lista mostra só as despesas que serão pagas com o dinheiro dela.',
        exemplo: 'Exemplo: escolha a reserva "Impostos do ano" para ver só o IPVA e o IPTU que sairão dela.',
      },
      tipo: {
        detalhe: 'Mostra só um tipo de movimento: Entradas (dinheiro que vai entrar), Saídas (dinheiro que vai sair) ou Transferências (entre as suas contas). O número ao lado é quantos há de cada tipo.',
        exemplo: 'Exemplo: clique em "Entradas" para ver só os recebimentos previstos, como salário e aluguéis a receber.',
      },
      selecionar: {
        detalhe: 'Liga as caixinhas de seleção nas linhas. Marque vários agendamentos e use a barra que aparece para pagar, pular ou alterar todos juntos.',
        exemplo: 'Exemplo: no fim do mês, selecione as cinco contas já pagas e confirme o pagamento de todas de uma vez.',
      },
      pagar: {
        detalhe: 'Abre a janela de pagamento da próxima ocorrência. Ali você confere a conta, o valor e a data do pagamento. Ao confirmar, vira um lançamento de verdade e o saldo da conta muda.',
        exemplo: 'Exemplo: a conta de internet de R$ 120,00 venceu hoje; clique no botão verde, confira e confirme.',
        porLinha: true,
      },
      editar: {
        detalhe: 'Abre o agendamento para mudar valor, data, categoria, conta e outros dados. Em agendamento que se repete, o Finup pergunta se a mudança vale só para uma ocorrência ou também para as próximas.',
        exemplo: 'Exemplo: o condomínio subiu de R$ 600,00 para R$ 650,00 — edite e diga que vale para as próximas.',
        porLinha: true,
      },
    },
  },

  cashflow: {
    errosComuns: [
      'O saldo projetado parece errado: confira se todas as caixinhas estão marcadas — um evento desmarcado fica fora da conta.',
      'Uma conta não entra no fluxo: na consulta "FC Principal" só entram as contas marcadas com "Somar no Saldo Principal". Crie uma consulta própria para incluir outras.',
    ],
    itens: {
      prazo: {
        detalhe: 'Define até que dia o Finup projeta o saldo. Quanto maior o prazo, mais agendamentos entram na conta.',
        exemplo: 'Exemplo: escolha 90 dias para ver se o dinheiro chega até as férias.',
      },
      filtros: {
        detalhe: 'No celular, as consultas e as opções (envelopes, reservas e provisórios) ficam guardadas neste botão para a tela não ficar apertada.',
        exemplo: 'Exemplo: toque no botão de filtros e ligue "Ocultar reservas" para ver só o que mexe no dia a dia.',
      },
      'editar-consulta': {
        detalhe: 'Abre a consulta que está na tela para trocar as contas ou as opções dela. A consulta "FC Principal" não é editável: ela segue as contas marcadas para o Saldo Principal.',
        exemplo: 'Exemplo: inclua a poupança na consulta "Família" para ela entrar na projeção.',
      },
      'nova-consulta': {
        detalhe: 'Cria uma visão do fluxo com as contas que você escolher. Ela fica salva e aparece junto das outras consultas.',
        exemplo: 'Exemplo: crie a consulta "Empresa" só com as contas do CNPJ.',
      },
      consultas: {
        detalhe: 'Cada consulta é um jeito salvo de olhar o fluxo, com o seu conjunto de contas. Clique numa para trocar; a escolhida fica destacada.',
        exemplo: 'Exemplo: troque de "FC Principal" para "Empresa" para ver só o caixa da empresa.',
      },
      'saldo-inicial': {
        detalhe: 'É de onde a projeção parte: o saldo atual de cada conta da consulta, somado. Cada conta usa o seu último dia com movimento.',
        exemplo: 'Exemplo: se a conta corrente tem R$ 2.000,00 e a poupança R$ 500,00, o saldo inicial é R$ 2.500,00.',
      },
      resumo: {
        detalhe: '"Projetado" é quanto deve sobrar no último dia do prazo. "Mínimo" é o ponto mais baixo que o saldo atinge no caminho, com a data — é ele que avisa se vai faltar dinheiro antes.',
        exemplo: 'Exemplo: Projetado R$ 3.000,00, mas Mínimo de R$ -200,00 no dia 5: vai faltar dinheiro antes do salário cair.',
      },
      grafico: {
        detalhe: 'Desenha o saldo dia a dia no prazo escolhido. Descidas são saídas; subidas são entradas. Passe o mouse ou o dedo para ver o valor de cada dia.',
        exemplo: 'Exemplo: uma queda grande todo dia 10 costuma ser o aluguel e o cartão.',
      },
      'marcar-todos': {
        detalhe: 'Marca ou desmarca de uma vez todos os eventos visíveis. Útil para voltar ao normal depois de simular.',
        exemplo: 'Exemplo: depois de desmarcar algumas contas para testar, clique em "Marcar todos" para incluir tudo de novo.',
      },
      'incluir-envelopes': {
        detalhe: 'Envelopes são limites de gasto do mês (mercado, lazer…). Ligado, o fluxo desconta o que ainda falta gastar deles, deixando a projeção mais realista.',
        exemplo: 'Exemplo: envelope de mercado de R$ 1.000,00 com R$ 400,00 já gastos — o fluxo desconta os R$ 600,00 que faltam.',
      },
      'ocultar-reservas': {
        detalhe: 'Esconde da lista os depósitos e resgates de reserva, que são dinheiro mudando de lugar entre as suas contas. A lista fica mais limpa.',
        exemplo: 'Exemplo: ligue para ver só as contas e recebimentos de verdade, sem as transferências para a reserva.',
      },
      provisorio: {
        detalhe: 'Cria uma entrada ou saída só para testar "e se…". Ela entra na projeção, mas não vira lançamento nem agendamento. Depois você pode apagar ou efetivar.',
        exemplo: 'Exemplo: e se eu comprar uma geladeira de R$ 3.000,00 no dia 20? Adicione um provisório e veja o saldo.',
      },
      caixinha: {
        detalhe: 'Cada linha tem uma caixinha. Desmarcada, aquele evento sai da conta e o saldo é recalculado na hora. Nada é apagado: é só simulação.',
        exemplo: 'Exemplo: desmarque o bônus que talvez não venha e veja se o mês fecha mesmo assim.',
      },
      status: {
        detalhe: 'Diz se o próximo vencimento de um agendamento já está certo ("Confirmado") ou ainda pode mudar ("A confirmar"). Clique no selo para trocar.',
        exemplo: 'Exemplo: o cliente avisou que paga no dia 15 — marque o recebimento como "Confirmado".',
      },
      acoes: {
        detalhe: '"Mudar data" simula o evento em outro dia, sem alterar o agendamento. "Efetivar" transforma um provisório em agendamento ou lançamento de verdade.',
        exemplo: 'Exemplo: e se o aluguel for pago dia 15 em vez de dia 10? Use "Mudar data" e veja o efeito no saldo.',
      },
    },
  },

  dashboard: {
    errosComuns: [
      'Os números parecem pequenos: confira o filtro de perfil no topo — com uma pessoa ou empresa escolhida, só as contas dela entram.',
    ],
    itens: {
      'ver-alertas': {
        detalhe: 'Quando uma fatura de cartão está perto de vencer, aparece um aviso no alto do Painel. O link leva para a tela de Alertas, com os detalhes.',
        exemplo: 'Exemplo: "Fatura vence em 2 dias" — clique em "Ver alertas" para ver qual cartão e o valor.',
      },
      'saldo-principal': {
        detalhe: 'Soma o saldo das contas marcadas com "Somar no Saldo Principal" — o dinheiro que você usa no dia a dia. Clicando, você vê conta por conta como o valor foi formado.',
        exemplo: 'Exemplo: conta corrente R$ 1.800,00 + carteira R$ 200,00 = Saldo Principal de R$ 2.000,00.',
      },
      'cards-mes': {
        detalhe: 'Mostram o que entrou e o que saiu no mês financeiro atual e comparam com o mês anterior. Clicando num card, você vê os lançamentos que formam o total.',
        exemplo: 'Exemplo: Despesas do mês R$ 4.200,00, 10% a menos que no mês passado.',
      },
      projecao: {
        detalhe: 'Parte do saldo de hoje e soma o que ainda está agendado até o fim do mês. Mostra como o mês deve terminar se tudo acontecer como previsto.',
        exemplo: 'Exemplo: saldo hoje R$ 2.000,00, ainda entram R$ 3.000,00 e saem R$ 2.500,00 — o mês deve fechar com R$ 2.500,00.',
      },
      envelopes: {
        detalhe: 'Mostra cada envelope (limite de gasto) do mês e quanto já foi usado dele. Só aparece quando há envelopes cadastrados.',
        exemplo: 'Exemplo: envelope "Lazer" de R$ 500,00 com R$ 350,00 usados — 70% do limite.',
      },
      'uso-receita': {
        detalhe: 'Compara o que já saiu com o que entrou no mês. A barra muda de cor quando os gastos se aproximam ou passam da receita.',
        exemplo: 'Exemplo: entrou R$ 5.000,00 e já saiu R$ 4.600,00 — 92% usado, a barra fica em alerta.',
      },
      'grafico-6-meses': {
        detalhe: 'Coloca lado a lado o que entrou e o que saiu em cada um dos últimos 6 meses. Ajuda a ver se os gastos estão subindo.',
        exemplo: 'Exemplo: as despesas de dezembro passaram as receitas — vale ver por quê.',
      },
      'proximos-vencimentos': {
        detalhe: 'Lista as contas a pagar e a receber dos próximos 7 dias e as que já estão atrasadas, para nada passar.',
        exemplo: 'Exemplo: "Escola — vence amanhã — R$ 900,00".',
      },
      'maiores-despesas': {
        detalhe: 'Gráfico de pizza com as categorias em que mais saiu dinheiro no período. Clicando numa fatia, você vê os lançamentos daquela categoria.',
        exemplo: 'Exemplo: a fatia "Alimentação" é a maior: clique para ver mercado, padaria e restaurantes.',
      },
      'filtros-despesas': {
        detalhe: 'O período escolhe o mês (atual, anterior ou os últimos 3). "Cheio" mostra o gasto total; "Líquido" desconta o que foi pago com dinheiro de reserva na mesma categoria.',
        exemplo: 'Exemplo: R$ 2.000,00 de viagem pagos com a reserva "Férias" aparecem no Cheio, mas não no Líquido.',
      },
      'ranking-categorias': {
        detalhe: 'As mesmas despesas do gráfico, em lista ordenada da maior para a menor, com o valor e a parte do total de cada categoria.',
        exemplo: 'Exemplo: 1º Moradia R$ 1.800,00; 2º Alimentação R$ 1.200,00; 3º Transporte R$ 600,00.',
      },
      'top-favorecidos': {
        detalhe: 'Mostra de quem você mais recebeu e com quem mais gastou no mês. Clicando num nome, você vê os lançamentos dele.',
        exemplo: 'Exemplo: o supermercado do bairro aparece em 1º lugar nos gastos, com R$ 900,00.',
      },
      contas: {
        detalhe: 'Lista cada conta com o saldo atual e cada cartão com a dívida, além da data do último movimento. Conta parada há mais de 30 dias ganha um aviso.',
        exemplo: 'Exemplo: "Poupança — R$ 5.000,00 — último movimento há 45 dias" com aviso: será que falta lançar o rendimento?',
      },
    },
  },

  inicio: {
    itens: {
      ocultar: {
        detalhe: 'Troca os valores por asteriscos em todo o Finup. Toque de novo para mostrar.',
        exemplo: 'Exemplo: vai abrir o Finup no ônibus? Toque no olho antes para esconder os valores.',
      },
      perfis: {
        detalhe: 'Cada perfil é uma pessoa ou empresa. Escolhendo um, todos os números da tela passam a ser só dele. "Tudo" junta todos.',
        exemplo: 'Exemplo: escolha o perfil da empresa para ver só o caixa do CNPJ.',
      },
      buscar: {
        detalhe: 'Abre uma busca única: digite parte do nome, valor ou descrição e o Finup procura em lançamentos, contas e agendamentos.',
        exemplo: 'Exemplo: digite "farmácia" para achar as compras na farmácia.',
      },
      resumo: {
        detalhe: 'Mostra o Saldo Principal, o que entrou e saiu no mês e a previsão de como o mês termina. Tocando, você vê a conta por trás do valor.',
        exemplo: 'Exemplo: Saldo principal R$ 2.000,00, previsão de fechar o mês com R$ 1.500,00.',
      },
      'ver-tudo': {
        detalhe: 'Cada card do Início é um resumo. "Ver tudo" abre a tela completa daquele assunto.',
        exemplo: 'Exemplo: no card de Agendamentos, toque em "Ver tudo" para abrir a lista completa de contas a pagar.',
      },
      personalizar: {
        detalhe: 'Liga ou desliga cada card e muda a ordem deles. A escolha fica salva para o seu usuário.',
        exemplo: 'Exemplo: suba o card de Agendamentos para o topo e desligue o de Reservas, se não usa.',
      },
    },
  },

  mais: {
    itens: {
      telas: {
        detalhe: 'Cada quadro abre uma tela do Finup. Só aparecem as telas que o seu acesso permite usar.',
        exemplo: 'Exemplo: toque em "Fluxo de Caixa" para ver a projeção do saldo.',
      },
      configuracoes: {
        detalhe: 'Reúne os ajustes: perfis, categorias, regras de classificação, guias das telas e outros. Algumas opções só aparecem para quem administra.',
        exemplo: 'Exemplo: abra Configurações para criar uma categoria nova, como "Pet".',
      },
      tema: {
        detalhe: 'Muda as cores do Finup. "Automático" segue o modo claro ou escuro do celular.',
        exemplo: 'Exemplo: escolha "Escuro" para usar à noite sem cansar a vista.',
      },
      sessao: {
        detalhe: 'Mostra o nome do usuário que está usando o Finup neste aparelho. O botão sai da conta.',
        exemplo: 'Exemplo: usou o celular de outra pessoa? Toque em "Sair" antes de devolver.',
      },
    },
  },

  despesas: {
    itens: {
      periodo: {
        detalhe: 'Escolhe de qual intervalo vêm as despesas: o mês financeiro atual, o anterior ou os últimos meses juntos.',
        exemplo: 'Exemplo: escolha "Mês anterior" para comparar com o que está gastando agora.',
      },
      'visao-modo': {
        detalhe: 'Pizza mostra as fatias de cada categoria; Ranking mostra a lista em ordem. "Cheio" é o gasto total; "Líquido" desconta o que foi pago com dinheiro de reserva.',
        exemplo: 'Exemplo: escolha Ranking + Líquido para ver quanto cada categoria pesou no dinheiro do dia a dia.',
      },
      'ver-todas': {
        detalhe: 'Por padrão aparecem só as maiores categorias. "Ver todas" abre a lista completa; "Mostrar menos" recolhe de novo.',
        exemplo: 'Exemplo: toque em "Ver todas (14)" para achar uma categoria pequena, como "Assinaturas".',
      },
    },
  },

  alerts: {
    errosComuns: [
      'Não chega aviso no celular ou computador: clique em "Ativar Notificações" e aceite a permissão do navegador.',
    ],
    itens: {
      abas: {
        detalhe: '"Vencimentos" lista o que está para vencer. "Integridade" mostra a conferência automática dos dados (faturas, parcelas e subcontas).',
        exemplo: 'Exemplo: abra "Integridade" para ver se alguma fatura ficou com valor diferente do esperado.',
      },
      notificacoes: {
        detalhe: 'Pede ao navegador permissão para mostrar avisos. Com ela, o Finup avisa no dia em que uma conta vence, mesmo com outra tela aberta.',
        exemplo: 'Exemplo: clique, aceite a permissão, e no dia do boleto da escola aparece um aviso na tela.',
      },
      duplicados: {
        detalhe: 'O Finup registra sozinho algumas contas na data, mas para quando já existe um lançamento muito parecido, para não lançar em dobro. O botão leva a Agendamentos, onde você decide se é o mesmo ou não.',
        exemplo: 'Exemplo: a mensalidade da academia já foi lançada à mão; em Agendamentos, ligue a ocorrência a esse lançamento.',
      },
      'alertas-vencimento': {
        detalhe: 'Lista as contas a pagar e as faturas que vencem hoje ou nos próximos dias, conforme a antecedência definida em cada agendamento.',
        exemplo: 'Exemplo: "Conta de luz — vence em 3 dias — R$ 180,00".',
      },
      dispensar: {
        detalhe: 'Tira o alerta da lista. Não paga nem apaga a conta: só diz que você já viu e cuidou dele.',
        exemplo: 'Exemplo: já agendou o pagamento no banco? Dispense o alerta para limpar a lista.',
        porLinha: true,
      },
      'calendario-cartoes': {
        detalhe: 'Mostra cada cartão com a data do próximo vencimento, quantos dias faltam e o valor da fatura.',
        exemplo: 'Exemplo: "Cartão final 1234 — vence dia 15 — faltam 6 dias — R$ 2.300,00".',
      },
    },
  },

  'alerts:integridade': {
    errosComuns: [
      'Corrigiu e a pendência voltou: algum dado ainda não bate. Abra o lançamento ou a fatura indicada e confira antes de corrigir de novo.',
    ],
    itens: {
      varrer: {
        detalhe: 'Refaz a conferência de todos os dados agora. Use depois de corrigir algo à mão, para ver se a pendência sumiu.',
        exemplo: 'Exemplo: você ajustou uma parcela no cartão; clique em "Varrer agora" para conferir de novo.',
      },
      status: {
        detalhe: '"Pendentes" são as que precisam de atenção. "Ignoradas" são as que você disse que estão certas. "Resolvidas" são as que já foram corrigidas.',
        exemplo: 'Exemplo: abra "Ignoradas" para rever uma pendência que você ignorou por engano.',
      },
      'corrigir-todas': {
        detalhe: 'Aplica, de uma vez, as correções que o Finup sabe fazer sozinho, e depois confere tudo de novo. As que precisam da sua decisão continuam na lista.',
        exemplo: 'Exemplo: "Corrigir todas (5)" ajusta as cinco pendências automáticas numa só ação.',
      },
      corrigir: {
        detalhe: 'Mostra o que será mudado para resolver aquela pendência. Nada é gravado antes de você confirmar.',
        exemplo: 'Exemplo: a correção propõe mover uma parcela para a fatura certa; confira e confirme.',
        porLinha: true,
      },
      'abrir-lancamento': {
        detalhe: 'Abre o lançamento ou a fatura do cartão ligados à pendência, para você ver os dados com calma.',
        exemplo: 'Exemplo: a pendência fala de uma compra parcelada; clique em "Abrir lançamento" para ver as parcelas.',
        porLinha: true,
      },
      ignorar: {
        detalhe: '"Ignorar" tira da lista uma pendência que você sabe que está certa. "Reabrir" traz de volta uma que foi ignorada.',
        exemplo: 'Exemplo: a diferença na fatura é de um acordo com o banco que você conhece; ignore a pendência.',
        porLinha: true,
      },
    },
  },
}

// Itens que FALTAM no inventário da tela (botões reais que o usuário vê e não estão em AJUDA_TELAS).
// Já marcados com data-guia no componente (src/components/Schedule/SchedulePanel.jsx, linha da lista).
export const novosItens = {
  schedule: [
    {
      chave: 'efetivar-provisao', rotulo: 'Efetivar Provisão',
      texto: 'Informa o valor e a data reais de uma provisão quando a conta chega.',
      detalhe: 'Aparece na linha de uma provisão ainda não efetivada. Você informa quanto e quando foi de verdade; a provisão vira uma despesa normal, pronta para ser paga. Em provisão que se repete, a próxima ocorrência continua como estimativa.',
      exemplo: 'Exemplo: a provisão do conserto era R$ 800,00, mas a nota veio de R$ 750,00 no dia 12 — efetive com esses valores.',
      depoisDe: 'pagar', modulo: 'pode:agendamentos:editar', porLinha: true,
    },
    {
      chave: 'pular', rotulo: 'Pular',
      texto: 'Pula esta ocorrência sem lançar nada e passa para a próxima.',
      detalhe: 'Use quando uma conta que se repete não vai acontecer naquele mês. Nada é lançado e o agendamento avança para a próxima data. Em agendamento único, pular cancela o agendamento (o Finup pergunta antes).',
      exemplo: 'Exemplo: a escola não cobra mensalidade em janeiro — pule a ocorrência de janeiro.',
      depoisDe: 'efetivar-provisao', modulo: 'pode:agendamentos:editar', porLinha: true,
    },
    {
      chave: 'estornar', rotulo: 'Estornar',
      texto: 'Cancela esta ocorrência, sem lançar nada. Pede confirmação.',
      detalhe: 'Tira a ocorrência da lista sem gerar lançamento, como se ela não fosse acontecer. A ação não pode ser desfeita, por isso o Finup mostra os dados e pede confirmação.',
      exemplo: 'Exemplo: a cobrança de R$ 50,00 foi cancelada pela loja — estorne a ocorrência.',
      depoisDe: 'pular', modulo: 'pode:agendamentos:editar', porLinha: true,
    },
    {
      chave: 'excluir', rotulo: 'Excluir (lixeira na linha)',
      texto: 'Apaga o agendamento inteiro, com todas as próximas ocorrências.',
      detalhe: 'Remove o agendamento da lista e do Fluxo de Caixa. O que já foi pago continua lançado nas contas. Pede confirmação antes.',
      exemplo: 'Exemplo: cancelou a assinatura de streaming? Exclua o agendamento para ele sumir dos próximos meses.',
      depoisDe: 'editar', modulo: 'pode:agendamentos:excluir', porLinha: true,
    },
  ],
}

// Tarefas "Faça comigo".
// Observação: os botões "+ Novo Agendamento" e "Lançar Provisão" só aparecem no computador (no
// celular a criação é por outro caminho) e só na aba "Agendamentos".
export const tarefas = [
  {
    id: 'schedule.conta-pagar',
    tela: 'schedule',
    hash: null,
    titulo: 'Criar uma conta a pagar',
    descricao: 'Cadastre uma despesa que vai vencer, para ela aparecer na lista e no Fluxo de Caixa.',
    requer: ['pagina:schedule', 'pode:agendamentos:incluir'],
    passos: [
      { alvo: 'schedule.novo', texto: 'Clique em "+ Novo Agendamento".', espera: 'clique' },
      { alvo: 'agendamento-form.tipo', texto: 'Deixe em "Despesa": é dinheiro que vai sair.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.descricao', texto: 'Escreva o nome da conta. Exemplo: "Conta de luz".', espera: 'preencher' },
      { alvo: 'agendamento-form.conta', texto: 'Escolha a conta de onde o dinheiro vai sair.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.valor', texto: 'Digite o valor. Exemplo: 180,00.', espera: 'preencher' },
      { alvo: 'agendamento-form.frequencia', texto: 'Escolha "Única" se for pagar uma vez só.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.data', texto: 'Coloque a data de vencimento.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.salvar', texto: 'Confira e clique em "Criar Agendamento".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'schedules', filtro: (s) => s.transactionType === 'expense' && !s.isProvisao },
    final: 'Pronto! A conta aparece em "A pagar" e já entra no Fluxo de Caixa. Na data, é só clicar em "Pagar".',
  },
  {
    id: 'schedule.conta-receber',
    tela: 'schedule',
    hash: null,
    titulo: 'Criar uma conta a receber',
    descricao: 'Cadastre um dinheiro que você vai receber, como um pagamento de cliente.',
    requer: ['pagina:schedule', 'pode:agendamentos:incluir'],
    passos: [
      { alvo: 'schedule.novo', texto: 'Clique em "+ Novo Agendamento".', espera: 'clique' },
      { alvo: 'agendamento-form.tipo', texto: 'Clique em "Receita": é dinheiro que vai entrar.', espera: 'clique' },
      { alvo: 'agendamento-form.descricao', texto: 'Escreva o que vai receber. Exemplo: "Serviço de pintura".', espera: 'preencher' },
      { alvo: 'agendamento-form.conta', texto: 'Escolha a conta onde o dinheiro vai cair.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.valor', texto: 'Digite o valor. Exemplo: 2.500,00.', espera: 'preencher' },
      { alvo: 'agendamento-form.data', texto: 'Coloque a data em que espera receber.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.salvar', texto: 'Confira e clique em "Criar Agendamento".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'schedules', filtro: (s) => s.transactionType === 'income' },
    final: 'Pronto! O recebimento aparece na lista (filtro "Entradas") e soma no saldo previsto.',
  },
  {
    id: 'schedule.recorrente-mensal',
    tela: 'schedule',
    hash: null,
    titulo: 'Criar uma conta que se repete todo mês',
    descricao: 'Cadastre uma vez só uma conta fixa, como aluguel ou mensalidade, e ela se repete sozinha.',
    requer: ['pagina:schedule', 'pode:agendamentos:incluir'],
    passos: [
      { alvo: 'schedule.novo', texto: 'Clique em "+ Novo Agendamento".', espera: 'clique' },
      { alvo: 'agendamento-form.descricao', texto: 'Escreva o nome. Exemplo: "Aluguel".', espera: 'preencher' },
      { alvo: 'agendamento-form.valor', texto: 'Digite o valor de cada mês. Exemplo: 1.500,00.', espera: 'preencher' },
      { alvo: 'agendamento-form.frequencia', texto: 'Escolha "Mensal".', espera: 'nenhuma' },
      { alvo: 'agendamento-form.data', texto: 'Coloque a data do primeiro vencimento. Os próximos caem no mesmo dia dos meses seguintes.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.ate-quando', texto: 'Deixe "Sem fim" para repetir até você parar, ou "Até a data" para uma data final.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.salvar', texto: 'Confira a prévia das próximas datas e clique em "Criar Agendamento".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'schedules', filtro: (s) => s.frequency === 'monthly' && s.occurrenceType !== 'installment' && !s.isProvisao },
    final: 'Pronto! A conta vai aparecer todo mês. Para mudar o valor depois, use o lápis e diga se vale para as próximas.',
  },
  {
    id: 'schedule.parcelada',
    tela: 'schedule',
    hash: null,
    titulo: 'Criar uma conta parcelada',
    descricao: 'Cadastre algo pago em várias parcelas, com o número certo de vezes.',
    requer: ['pagina:schedule', 'pode:agendamentos:incluir'],
    passos: [
      { alvo: 'schedule.novo', texto: 'Clique em "+ Novo Agendamento".', espera: 'clique' },
      { alvo: 'agendamento-form.descricao', texto: 'Escreva o nome. Exemplo: "Curso de inglês".', espera: 'preencher' },
      { alvo: 'agendamento-form.valor', texto: 'Digite o valor de UMA parcela. Exemplo: 300,00.', espera: 'preencher' },
      { alvo: 'agendamento-form.frequencia', texto: 'Escolha "Mensal" (uma parcela por mês).', espera: 'nenhuma' },
      { alvo: 'agendamento-form.data', texto: 'Coloque a data da primeira parcela.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.ate-quando', texto: 'Clique em "Número de vezes" e digite quantas parcelas são. Exemplo: 10.', espera: 'clique' },
      { alvo: 'agendamento-form.salvar', texto: 'Confira as parcelas na prévia e clique em "Criar Agendamento".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'schedules', filtro: (s) => s.occurrenceType === 'installment' && !s.isProvisao },
    final: 'Pronto! Cada parcela aparece com o número dela (1/10, 2/10…) e o agendamento termina sozinho na última.',
  },
  {
    id: 'schedule.transferencia',
    tela: 'schedule',
    hash: null,
    titulo: 'Agendar uma transferência entre contas',
    descricao: 'Programe uma passagem de dinheiro entre duas contas suas, como guardar na poupança.',
    requer: ['pagina:schedule', 'pode:agendamentos:incluir'],
    passos: [
      { alvo: 'schedule.novo', texto: 'Clique em "+ Novo Agendamento".', espera: 'clique' },
      { alvo: 'agendamento-form.tipo', texto: 'Clique em "Transferência".', espera: 'clique' },
      { alvo: 'agendamento-form.descricao', texto: 'Escreva o motivo. Exemplo: "Guardar na poupança".', espera: 'preencher' },
      { alvo: 'agendamento-form.conta', texto: 'Em "Conta Origem", escolha a conta de onde o dinheiro sai.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.valor', texto: 'Digite o valor. Exemplo: 500,00.', espera: 'preencher' },
      { alvo: 'agendamento-form.conta-destino', texto: 'Escolha a conta que vai receber o dinheiro.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.frequencia', texto: 'Escolha "Única" ou "Mensal", se for todo mês.', espera: 'nenhuma' },
      { alvo: 'agendamento-form.salvar', texto: 'Confira e clique em "Criar Agendamento".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'schedules', filtro: (s) => s.transactionType === 'transfer' },
    final: 'Pronto! A transferência aparece no filtro "Transferências". Ela não muda o seu total: o dinheiro só troca de conta.',
  },
  {
    id: 'schedule.provisao',
    tela: 'schedule',
    hash: null,
    titulo: 'Lançar uma provisão',
    descricao: 'Reserve no planejamento uma despesa que ainda não tem valor ou data certos.',
    requer: ['pagina:schedule', 'pode:agendamentos:incluir'],
    passos: [
      { alvo: 'schedule.lancar-provisao', texto: 'Clique em "Lançar Provisão".', espera: 'clique' },
      { alvo: 'provisao-form.descricao', texto: 'Escreva o que é. Exemplo: "Conserto do carro".', espera: 'preencher' },
      { alvo: 'provisao-form.valor', texto: 'Digite um valor estimado. Exemplo: 800,00.', espera: 'preencher' },
      { alvo: 'provisao-form.data', texto: 'Coloque a data provável.', espera: 'nenhuma' },
      { alvo: 'provisao-form.frequencia', texto: '"Única" se acontece uma vez; escolha outra se for se repetir.', espera: 'nenhuma' },
      { alvo: 'provisao-form.conta', texto: 'Confira a conta de onde o dinheiro vai sair (vem a conta central do perfil).', espera: 'nenhuma' },
      { alvo: 'provisao-form.reserva', texto: 'Se vai pagar com dinheiro guardado numa reserva, marque aqui e escolha a função.', espera: 'nenhuma' },
      { alvo: 'provisao-form.salvar', texto: 'Clique em "Lançar Provisão".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'schedules', filtro: (s) => !!s.isProvisao },
    final: 'Pronto! A provisão aparece em "Provisões" e já pesa no Fluxo de Caixa. Quando souber o valor real, use "Efetivar Provisão".',
  },
  {
    id: 'schedule.pagar-ocorrencia',
    tela: 'schedule',
    hash: null,
    titulo: 'Dar baixa (pagar) numa conta',
    descricao: 'Confirme que uma conta agendada foi paga ou recebida, para ela virar lançamento.',
    requer: ['pagina:schedule', 'pode:agendamentos:editar'],
    passos: [
      { alvo: 'schedule.status', texto: 'Confira que "A pagar" está escolhido.', espera: 'nenhuma' },
      { alvo: 'schedule.pagar', texto: 'Na linha da conta, clique no botão verde "Pagar".', espera: 'clique' },
      { alvo: 'baixa-form.abas', texto: 'A aba já vem certa: Pagamento, Recebimento ou Transferência.', espera: 'nenhuma' },
      { alvo: 'baixa-form.conta', texto: 'Confira a conta de onde o dinheiro saiu (ou onde entrou).', espera: 'nenhuma' },
      { alvo: 'baixa-form.valor', texto: 'Confira o valor. Se pagou com juros ou desconto, digite o valor de verdade.', espera: 'nenhuma' },
      { alvo: 'baixa-form.data', texto: 'Confira a data em que pagou.', espera: 'nenhuma' },
      { alvo: 'baixa-form.confirmar', texto: 'Clique em "Confirmar".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'transactions', filtro: (t) => !!t.scheduleId },
    final: 'Pronto! O pagamento virou um lançamento, o saldo da conta foi atualizado e o agendamento passou para a próxima data.',
  },
  {
    id: 'schedule.filtro-tipo',
    tela: 'schedule',
    hash: null,
    titulo: 'Filtrar entradas, saídas e transferências',
    descricao: 'Veja só o que vai entrar, só o que vai sair ou só as transferências.',
    requer: ['pagina:schedule'],
    passos: [
      { alvo: 'schedule.periodo', texto: 'Primeiro, escolha o período que quer ver. Exemplo: "Este mês".', espera: 'nenhuma' },
      { alvo: 'schedule.tipo', texto: 'Clique em "Saídas" para ver só as contas a pagar.', espera: 'clique' },
      { alvo: 'schedule.tipo', texto: 'Agora clique em "Entradas" para ver só o que vai receber. O número ao lado de cada opção é a quantidade.', espera: 'clique' },
      { alvo: 'schedule.tipo', texto: 'Para ver tudo de novo, clique em "Todos".', espera: 'clique' },
    ],
    novoItem: null,
    final: 'Pronto! O filtro também vale para "Exportar Excel" e para o Calendário.',
  },
  {
    id: 'cashflow.ler-fluxo',
    tela: 'cashflow',
    hash: null,
    titulo: 'Ler o fluxo de caixa futuro',
    descricao: 'Entenda como o seu saldo vai ficar nos próximos dias e se vai faltar dinheiro.',
    requer: ['pagina:cashflow'],
    passos: [
      { alvo: 'cashflow.prazo', texto: 'Escolha até quando quer enxergar. Exemplo: 30 dias.', espera: 'clique' },
      { alvo: 'cashflow.saldo-inicial', texto: 'Este é o ponto de partida: quanto há hoje nas contas.', espera: 'nenhuma' },
      { alvo: 'cashflow.resumo', texto: '"Projetado" é como termina o prazo; "Mínimo" é o ponto mais baixo no caminho. Se o Mínimo ficar negativo, vai faltar dinheiro naquele dia.', espera: 'nenhuma' },
      { alvo: 'cashflow.grafico', texto: 'O gráfico mostra o saldo dia a dia. As descidas são as contas a pagar.', espera: 'nenhuma' },
      { alvo: 'cashflow.caixinha', texto: 'Na lista abaixo, cada linha é um evento: data, descrição, entrada ou saída, e o saldo depois dele.', espera: 'nenhuma' },
    ],
    novoItem: null,
    final: 'Pronto! Volte aqui sempre que for decidir um gasto grande: o Mínimo mostra se há folga.',
  },
  {
    id: 'cashflow.filtrar-movimentacoes',
    tela: 'cashflow',
    hash: null,
    titulo: 'Filtrar e simular movimentações',
    descricao: 'Esconda reservas, inclua envelopes e tire eventos da conta para simular, sem mudar nada de verdade.',
    requer: ['pagina:cashflow'],
    passos: [
      { alvo: 'cashflow.ocultar-reservas', texto: 'Ligue "Ocultar reservas" para tirar da lista o dinheiro que só muda de lugar entre as suas contas.', espera: 'clique' },
      { alvo: 'cashflow.incluir-envelopes', texto: 'Ligue "Incluir envelopes" para descontar o que ainda falta gastar nos envelopes do mês.', espera: 'clique' },
      { alvo: 'cashflow.caixinha', texto: 'Desmarque a caixinha de um evento para ver o saldo sem ele. Exemplo: um recebimento que talvez atrase.', espera: 'nenhuma' },
      { alvo: 'cashflow.resumo', texto: 'Veja como o Projetado e o Mínimo mudaram.', espera: 'nenhuma' },
      { alvo: 'cashflow.marcar-todos', texto: 'Para voltar ao normal, clique em "Marcar todos".', espera: 'clique' },
    ],
    novoItem: null,
    final: 'Pronto! Tudo isso é simulação: nenhum lançamento ou agendamento foi mudado.',
  },
]

// Checklist: "já criou uma provisão". Provisão = agendamento com isProvisao (ProvisaoForm grava
// is_provisao = true). Continua true depois de efetivada, então o item não "desmarca" sozinho.
export const provisaoFeita = (dados) => (dados?.schedules || []).some((s) => !!s.isProvisao)
