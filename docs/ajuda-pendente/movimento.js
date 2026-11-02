// Grupo "movimento": Lançamentos, Fatura do cartão, Importar Fatura (+ Conciliação), Importar
// lançamentos, Reservas (abas), Envelopes e Orçamento.

// ── Central de Ajuda: explicação e exemplo de cada item já existente ─────────────────────────────
export const detalhes = {
  transactions: {
    errosComuns: [
      'Não acho o botão "Novo" no celular: no celular, use o botão "+" do rodapé ou abra a conta e toque no "+" dela.',
      'A compra no cartão caiu na fatura do mês seguinte: é o dia de fechamento do cartão. Compras depois do fechamento vão para a próxima fatura.',
    ],
    itens: {
      novo: {
        detalhe: 'Abre o formulário de lançamento. Se você tiver mais de uma conta, o Finup pergunta primeiro "Qual conta?". Depois é só escolher se é Receita, Despesa ou Transferência e preencher valor, data e categoria.',
        exemplo: 'Exemplo: registrar a conta de luz de R$ 180,00 paga hoje pela conta corrente.',
      },
      conta: {
        detalhe: 'Cada cartão mostra uma conta com o saldo de hoje. O saldo é a soma de tudo o que entrou e saiu dela. Clique para ver o extrato com todos os lançamentos da conta.',
        exemplo: 'Exemplo: clicar na conta corrente para conferir as compras da semana.',
        porLinha: true,
      },
      'novo-cartao': {
        detalhe: 'O "+" ao lado do nome do cartão já abre o lançamento com esse cartão escolhido. Ali você também pode marcar a compra como parcelada.',
        exemplo: 'Exemplo: uma compra de R$ 600,00 em 3 vezes no cartão.',
        porLinha: true,
      },
      fatura: {
        detalhe: 'Abaixo de cada cartão aparecem as faturas, mês a mês, com o total e a quantidade de compras. Clique numa fatura para ver e conferir as compras dela.',
        exemplo: 'Exemplo: abrir a fatura de março para conferir se o total bate com o do banco.',
        porLinha: true,
      },
    },
  },

  'transactions:fatura': {
    errosComuns: [
      'Apaguei uma compra que foi devolvida: em vez de excluir, use "Estornar". Assim a compra original fica no histórico e a devolução abate a fatura.',
      'O botão "Reconciliar" não aparece: ele só aparece no computador e quando a fatura tem compras.',
    ],
    itens: {
      voltar: {
        detalhe: 'Fecha a fatura e volta para a lista de contas e cartões. Nada do que você fez é perdido.',
        exemplo: 'Exemplo: depois de conferir a fatura de abril, voltar para ver a de maio.',
      },
      reconciliar: {
        detalhe: 'Mostra só as compras ainda não conferidas. Você marca várias de uma vez como conferidas com a fatura do banco, ou escolhe algumas para alterar juntas.',
        exemplo: 'Exemplo: marcar de uma vez as 20 compras que já bateram com o aplicativo do banco.',
      },
      novo: {
        detalhe: 'Abre um lançamento novo já neste cartão, como despesa. Use para compras que ainda não estão na fatura.',
        exemplo: 'Exemplo: lançar um lanche de R$ 35,00 que você esqueceu de registrar.',
      },
      resumo: {
        detalhe: 'O total da fatura e quantas compras ela tem. Os filtros não mudam esse total: ele é sempre da fatura inteira.',
        exemplo: 'Exemplo: fatura de R$ 2.450,00 com 38 lançamentos.',
      },
      filtros: {
        detalhe: 'Ajudam a achar compras pela data, pelo texto do histórico, pelo favorecido, pela categoria ou pelo valor. Só escondem linhas da lista; o total da fatura continua o mesmo.',
        exemplo: 'Exemplo: filtrar a categoria "Mercado" para ver quanto foi gasto com mercado nesta fatura.',
      },
      conciliados: {
        detalhe: 'Soma das compras visíveis que já foram conferidas e das que ainda faltam conferir. Quando "Pendentes" chega a zero, a fatura está toda conferida.',
        exemplo: 'Exemplo: Conciliados R$ 2.000,00 e Pendentes R$ 450,00 — faltam R$ 450,00 para conferir.',
      },
      estornar: {
        detalhe: 'Registra a devolução de uma compra (um crédito no cartão) ligada à compra original. A compra continua lá, e a devolução diminui a fatura.',
        exemplo: 'Exemplo: a loja devolveu os R$ 120,00 de um produto trocado.',
        porLinha: true,
      },
      editar: {
        detalhe: 'Abre a compra para ver todos os dados. Se o seu acesso permitir, você pode mudar categoria, descrição, valor e outros campos e salvar.',
        exemplo: 'Exemplo: trocar a categoria de uma compra de "Outros" para "Farmácia".',
        porLinha: true,
      },
      duplicar: {
        detalhe: 'Cria uma cópia da compra com a data que você escolher. O formulário abre preenchido e só grava quando você salvar. Em compra parcelada, copia só a parcela clicada.',
        exemplo: 'Exemplo: repetir a mensalidade da academia de R$ 99,00 no mês seguinte.',
        porLinha: true,
      },
      excluir: {
        detalhe: 'Apaga a compra de vez. Se ela tiver um resgate de reserva ligado, o Finup avisa e apaga os dois juntos.',
        exemplo: 'Exemplo: apagar uma compra lançada duas vezes por engano.',
        porLinha: true,
      },
      reconciliado: {
        detalhe: 'O "R" mostra se a compra já foi conferida com a fatura do banco. Clique para marcar ou desmarcar. Não muda nenhum valor.',
        exemplo: 'Exemplo: marcar o "R" na compra de R$ 89,90 depois de ver que ela está na fatura do banco.',
        porLinha: true,
      },
    },
  },

  import: {
    errosComuns: [
      'O botão "Conciliar Fatura" está apagado: escolha antes o Cartão e o Mês de Referência.',
      'O total do arquivo não bate com o do Finup: abra "Conferência da fatura" — ela mostra de onde vem a diferença (compras faltando, sobrando ou com valor diferente).',
      'Algumas linhas não foram gravadas: itens que "precisam da sua decisão" ficam de fora até você escolher o que fazer com eles.',
    ],
    itens: {
      cartao: {
        detalhe: 'O cartão de crédito dono da fatura. As compras novas serão gravadas nele.',
        exemplo: 'Exemplo: escolher o "Cartão Azul" antes de trazer a fatura dele.',
      },
      mes: {
        detalhe: 'O mês da fatura. Ao importar, o Finup tenta ler o mês do próprio arquivo e preenche sozinho. Para conciliar, é você quem escolhe o mês antes.',
        exemplo: 'Exemplo: fatura com vencimento em maio → Mês de Referência 05/2025.',
      },
      arquivo: {
        detalhe: 'Clique, arraste ou cole o arquivo baixado do site ou do aplicativo do banco (Excel, CSV ou OFX). Se o banco usa um formato diferente, você diz uma vez em qual coluna está a data, a descrição e o valor, e o Finup guarda esse modelo.',
        exemplo: 'Exemplo: arrastar o arquivo "fatura-maio.csv" para a área de carregar arquivo.',
      },
      conciliar: {
        detalhe: 'Abre o modo de conciliação: compara o arquivo do banco com a fatura que já existe no Finup e separa o que só está no arquivo, o que só está no Finup e o que já bate. Escolha o cartão e o mês antes.',
        exemplo: 'Exemplo: a fatura no Finup soma R$ 1.900,00 e a do banco R$ 2.000,00 — a conciliação mostra quais compras explicam os R$ 100,00.',
      },
      'conciliacao-confirmar': {
        detalhe: 'Aparece só no modo Conciliar Fatura. Grava de uma vez tudo o que você marcou: importa as compras que faltavam e exclui as que sobravam. Depois volta para a tela normal.',
        exemplo: 'Exemplo: confirmar a importação de 2 compras que faltavam e a exclusão de 1 compra lançada em dobro.',
      },
      resumo: {
        detalhe: 'Mostra, logo depois de carregar o arquivo, o total do arquivo, quanto dele já está no Finup, quanto será importado e quantos itens pedem a sua decisão. Esses números batem com as abas e com o botão Confirmar.',
        exemplo: 'Exemplo: arquivo com 40 compras — 30 já no Finup, 8 novas e 2 para você decidir.',
      },
      conferencia: {
        detalhe: 'Explica a diferença entre o total do arquivo e o total da fatura no Finup. Ela abre sozinha quando sobra um valor sem explicação, para você não gravar uma fatura que não bate.',
        exemplo: 'Exemplo: a conferência mostra uma diferença de R$ 15,90 por causa de uma tarifa que ainda não está no Finup.',
      },
      abas: {
        detalhe: 'Separa as linhas do arquivo em grupos: as novas, as que já estão no Finup e as que precisam de decisão (por exemplo, parecidas com algo já lançado). Clique numa aba para ver só aquele grupo.',
        exemplo: 'Exemplo: abrir a aba das que precisam de decisão e dizer se uma compra parecida é a mesma ou é outra.',
      },
      regras: {
        detalhe: 'Abre a lista de regras de classificação. Cada regra diz: quando a descrição tiver tal palavra, use tal categoria e tal grupo. Elas são usadas pelo "Classificar Auto".',
        exemplo: 'Exemplo: criar a regra "POSTO" → categoria Combustível.',
      },
      'classificar-auto': {
        detalhe: 'Preenche categoria e grupo das linhas sozinho, usando as suas regras e o que você já classificou em compras parecidas. Depois você só confere.',
        exemplo: 'Exemplo: todas as compras com "SUPERMERCADO" na descrição recebem a categoria Mercado.',
      },
      'preencher-lote': {
        detalhe: 'Escolha uma categoria e um grupo e aplique nas linhas que você marcar, de uma vez, sem preencher linha por linha.',
        exemplo: 'Exemplo: colocar a categoria "Viagem" em todas as 12 compras feitas durante as férias.',
      },
      'cat-ger': {
        detalhe: 'Para cada categoria que aparece no arquivo, troca o grupo gerencial de todas as linhas dela de uma vez.',
        exemplo: 'Exemplo: todas as linhas da categoria "Restaurante" passam para o mesmo grupo gerencial.',
      },
      cancelar: {
        detalhe: 'Descarta o arquivo carregado e volta para o início. Nada é gravado.',
        exemplo: 'Exemplo: você carregou a fatura do cartão errado — clique em Cancelar e carregue de novo.',
      },
      confirmar: {
        detalhe: 'Mostra uma última prévia e, ao confirmar, grava só as linhas novas e marca como conferidas as que já estavam no Finup. O número no botão é a quantidade que será gravada.',
        exemplo: 'Exemplo: "Confirmar (8)" grava as 8 compras novas da fatura.',
      },
      historico: {
        detalhe: 'A lista das importações já feitas, com data, arquivo e quantidade. Clique numa delas para reabrir e corrigir, ou use "Estornar" para desfazer a importação inteira.',
        exemplo: 'Exemplo: desfazer a importação de ontem porque o arquivo era de outro cartão.',
      },
    },
  },

  'importar-lancamentos': {
    errosComuns: [
      'Queria importar a fatura do cartão aqui: cartão de crédito é no "Importar Fatura". Esta tela é para conta corrente, poupança e dinheiro.',
      'Algumas linhas aparecem "com erro": elas ficam de fora. Corrija a data ou o valor no arquivo e envie de novo.',
      'Importei na conta errada: use "Desfazer importação" em Últimas importações e importe de novo na conta certa.',
    ],
    itens: {
      conta: {
        detalhe: 'A conta onde os lançamentos do arquivo vão entrar. Escolha antes de enviar o arquivo; trocar a conta descarta o arquivo lido.',
        exemplo: 'Exemplo: escolher a "Conta Corrente" para trazer o extrato do mês.',
      },
      'gerar-excel': {
        detalhe: 'Baixa uma planilha modelo desta conta, com as colunas certas e listas das suas categorias e favorecidos. Você preenche e envia de volta.',
        exemplo: 'Exemplo: baixar o modelo, digitar os gastos em dinheiro da semana e enviar.',
      },
      arquivo: {
        detalhe: 'Escolha a planilha preenchida (.xlsx), um CSV com as mesmas colunas ou o extrato OFX baixado do banco. O Finup lê o arquivo e mostra a prévia antes de gravar.',
        exemplo: 'Exemplo: enviar o arquivo "extrato-junho.ofx" baixado do site do banco.',
      },
      previa: {
        detalhe: 'Antes de gravar, mostra quantas linhas estão certas, quantas têm erro, quantas parecem já existir na conta e quantas serão importadas, com o total de entradas e saídas.',
        exemplo: 'Exemplo: 25 válidas, 1 com erro, 2 possíveis duplicados, 23 a importar.',
      },
      'marcar-todas': {
        detalhe: 'A caixinha do título marca ou desmarca todas as linhas de uma vez. Só as linhas marcadas são importadas; desmarque as que não quer trazer.',
        exemplo: 'Exemplo: desmarcar tudo e marcar só as 3 linhas que faltam na conta.',
      },
      importar: {
        detalhe: 'Grava os lançamentos marcados na conta escolhida. O saldo da conta é atualizado e a importação entra em "Últimas importações".',
        exemplo: 'Exemplo: "Importar 23 lançamentos em Conta Corrente".',
      },
      cancelar: {
        detalhe: 'Descarta o arquivo lido e a prévia. Nada é gravado.',
        exemplo: 'Exemplo: você enviou o extrato do mês errado — cancele e envie o certo.',
      },
      ultimas: {
        detalhe: 'Lista as importações feitas, com conta, data, formato, quantidade e totais. Cada uma pode ser desfeita depois.',
        exemplo: 'Exemplo: ver que a importação de ontem trouxe 23 lançamentos com R$ 4.200,00 de saídas.',
      },
      recarregar: {
        detalhe: 'Busca de novo a lista de importações, por exemplo depois de importar em outro aparelho.',
        exemplo: 'Exemplo: tocar em recarregar para ver uma importação feita no celular.',
      },
      desfazer: {
        detalhe: 'Apaga só os lançamentos daquela importação, e o saldo da conta volta ao que era. Não dá para refazer: seria preciso importar o arquivo de novo.',
        exemplo: 'Exemplo: desfazer a importação feita na conta errada.',
        porLinha: true,
      },
    },
  },

  reservas: {
    errosComuns: [
      'Minha conta não aparece aqui: no cadastro da conta, ative "É conta de reserva".',
    ],
    itens: {
      abas: {
        detalhe: 'A tela de Reservas tem cinco partes: Contas Reserva (o saldo de cada conta), Resumo (cada objetivo), Fluxo Futuro (os próximos 12 meses), Razão Diário (dia a dia) e Histórico (períodos fechados).',
        exemplo: 'Exemplo: abrir a aba Resumo para ver quanto já há guardado para o IPVA.',
      },
      totais: {
        detalhe: 'Total Reservado é a soma do saldo das contas reserva. Depósitos e Resgates mostram quanto entrou e quanto saiu delas no mês.',
        exemplo: 'Exemplo: R$ 8.000,00 reservados, R$ 1.000,00 depositados e R$ 300,00 resgatados no mês.',
      },
      conta: {
        detalhe: 'Um cartão para cada conta marcada como reserva, com o saldo de hoje e o que entrou e saiu dela no mês.',
        exemplo: 'Exemplo: a "Poupança Reserva" com R$ 5.000,00 e R$ 500,00 depositados no mês.',
        porLinha: true,
      },
      extrato: {
        detalhe: 'Abre a lista dos depósitos e resgates dessa conta reserva, para ver de onde veio e para onde foi cada valor.',
        exemplo: 'Exemplo: ver o resgate de R$ 300,00 usado para pagar o conserto do carro.',
        porLinha: true,
      },
    },
  },

  'reservas:resumo': {
    errosComuns: [
      'Fiz a virada de saldo por engano: logo depois, use "Desfazer Virada".',
      'A soma das funções não bate com o saldo do banco: digite o saldo do banco em "Saldo Real" e use "Distribuir" para repartir a diferença.',
    ],
    itens: {
      total: {
        detalhe: 'A soma do saldo atualizado de todas as funções (objetivos) de reserva.',
        exemplo: 'Exemplo: IPVA R$ 1.200,00 + Férias R$ 3.000,00 = Total reservado R$ 4.200,00.',
      },
      exportar: {
        detalhe: 'Gera uma planilha Excel com o resumo de todas as funções, com saldo inicial, entradas, saídas e saldo.',
        exemplo: 'Exemplo: exportar o resumo para mostrar ao contador.',
      },
      'desfazer-virada': {
        detalhe: 'Aparece logo depois de uma virada de saldo. Desfaz a última virada e volta os saldos iniciais como estavam.',
        exemplo: 'Exemplo: você virou o saldo com a data errada — desfaça e vire de novo.',
      },
      'virar-saldo': {
        detalhe: 'Fecha o período: o saldo de hoje de cada função passa a ser o saldo inicial do próximo período, e o período fechado vai para o Histórico.',
        exemplo: 'Exemplo: virar o saldo no fim do ano para começar o ano novo com os saldos atualizados.',
      },
      'nova-funcao': {
        detalhe: 'Cria uma função de reserva, que é um objetivo para o dinheiro guardado. Você dá um nome, escolhe a conta reserva, quanto vai gastar no ano e em que mês vence.',
        exemplo: 'Exemplo: função "IPVA", na Poupança Reserva, R$ 1.800,00 por ano, vencendo em março.',
      },
      'saldo-real': {
        detalhe: 'Digite o saldo que o banco mostra para a conta reserva. O Finup compara com a soma das funções e mostra quanto falta (ou sobra) distribuir.',
        exemplo: 'Exemplo: o banco mostra R$ 5.050,00 e as funções somam R$ 5.000,00 — sobram R$ 50,00 de rendimento.',
      },
      'exibir-despesa': {
        detalhe: 'Liga ou desliga se os depósitos e resgates dessa função contam como despesa no Painel e nos Relatórios.',
        exemplo: 'Exemplo: deixar ligado para o "IPVA" (é um gasto futuro) e desligado para "Poupança".',
        porLinha: true,
      },
      'entradas-saidas': {
        detalhe: 'Clique no valor das entradas ou das saídas para ver a lista de lançamentos que formam esse número.',
        exemplo: 'Exemplo: clicar em Saídas de R$ 800,00 e ver que foi o pagamento do seguro.',
        porLinha: true,
      },
      ajuste: {
        detalhe: 'Mostra os ajustes feitos na função. O "+" grava um ajuste novo, para corrigir o saldo sem criar lançamento.',
        exemplo: 'Exemplo: ajustar +R$ 20,00 de rendimento que entrou na função "Férias".',
        porLinha: true,
      },
      distribuir: {
        detalhe: 'Reparte entre as funções a diferença entre o saldo do banco e a soma das funções. É só uma divisão no controle: não move dinheiro entre contas.',
        exemplo: 'Exemplo: dividir R$ 50,00 de rendimento entre as funções da Poupança Reserva.',
      },
      'mov-futuros': {
        detalhe: 'Os depósitos e resgates já agendados para essa função, com data e valor.',
        exemplo: 'Exemplo: ver os 12 depósitos mensais de R$ 150,00 agendados para o "IPVA".',
        porLinha: true,
      },
      editar: {
        detalhe: 'Abre a função para mudar nome, conta, valores e mês de vencimento. Para funções já usadas, o Finup sugere valores calculados dos lançamentos.',
        exemplo: 'Exemplo: aumentar a Despesa Anual do "Seguro" de R$ 1.500,00 para R$ 1.700,00.',
        porLinha: true,
      },
      excluir: {
        detalhe: 'Apaga a função de reserva depois de pedir confirmação. Não dá para desfazer.',
        exemplo: 'Exemplo: apagar a função "Reforma" depois que a obra terminou.',
        porLinha: true,
      },
    },
  },

  'reservas:fluxo': {
    itens: {
      total: {
        detalhe: 'A soma do saldo de hoje das funções, com um aviso das funções que vão ficar negativas em algum mês.',
        exemplo: 'Exemplo: Total investido R$ 6.000,00 — 1 função fica negativa em agosto.',
      },
      exportar: {
        detalhe: 'Gera uma planilha Excel com a projeção de cada função, mês a mês.',
        exemplo: 'Exemplo: exportar o fluxo para planejar os depósitos do semestre.',
      },
      meses: {
        detalhe: 'No celular, a tabela não cabe inteira: use as setas para avançar ou voltar os meses mostrados.',
        exemplo: 'Exemplo: tocar na seta da direita para ver de julho a setembro.',
      },
      tabela: {
        detalhe: 'Para cada função, os depósitos, os resgates e o saldo previsto em cada um dos próximos 12 meses. Clique num valor para ver os agendamentos que o formam.',
        exemplo: 'Exemplo: a função "IPVA" sobe R$ 150,00 por mês e cai R$ 1.800,00 em março.',
      },
    },
  },

  'reservas:historico': {
    itens: {
      periodo: {
        detalhe: 'Cada "Virar Saldo" fecha um período. Escolha aqui qual período fechado você quer ver.',
        exemplo: 'Exemplo: escolher o período que terminou em 31/12 para ver como cada função fechou o ano.',
      },
      tabela: {
        detalhe: 'Para cada função: saldo inicial, entradas, saídas, ajustes e saldo final daquele período.',
        exemplo: 'Exemplo: "Férias" começou com R$ 1.000,00, recebeu R$ 1.800,00, gastou R$ 2.500,00 e fechou com R$ 300,00.',
      },
    },
  },

  'reservas:razao': {
    itens: {
      atualizar: {
        detalhe: 'Busca de novo os registros do razão, para ver movimentos feitos há pouco.',
        exemplo: 'Exemplo: atualizar depois de registrar um depósito na reserva.',
      },
      exportar: {
        detalhe: 'Gera uma planilha Excel com as linhas que estão na tela, respeitando o mês e as funções escolhidas.',
        exemplo: 'Exemplo: exportar só o mês de maio da função "Férias".',
      },
      mes: {
        detalhe: 'Mostra só os registros do mês escolhido na tabela e no gráfico.',
        exemplo: 'Exemplo: escolher junho para conferir os depósitos daquele mês.',
      },
      funcoes: {
        detalhe: 'Clique nos nomes das funções para ver só elas. Clique de novo para tirar do filtro.',
        exemplo: 'Exemplo: deixar só "IPVA" e "Seguro" marcados para comparar as duas.',
      },
      grafico: {
        detalhe: 'Uma linha por função mostrando como o saldo mudou ao longo dos dias.',
        exemplo: 'Exemplo: ver a linha do "IPVA" subir todo mês e cair em março.',
      },
      tabela: {
        detalhe: 'Uma linha por função por dia, com entradas, saídas, ajustes e saldos. Clique no título de uma coluna para ordenar por ela.',
        exemplo: 'Exemplo: ordenar pela coluna Saídas para achar o maior resgate do ano.',
      },
      'ver-periodo': {
        detalhe: 'Leva para a aba Histórico já mostrando o período fechado ao qual aquela linha pertence.',
        exemplo: 'Exemplo: de uma linha de dezembro, abrir o período fechado em 31/12.',
        porLinha: true,
      },
    },
  },

  envelopes: {
    errosComuns: [
      'Um gasto não entrou no envelope: confira se a categoria do lançamento está entre as "Categorias Vinculadas" do envelope.',
      'Os valores parecem do mês errado: use as setas da Competência para escolher o mês.',
    ],
    itens: {
      novo: {
        detalhe: 'Cria um envelope: um limite de gasto mensal para um assunto. Você dá um nome, o limite, o dia de vencimento e marca as categorias que contam nele.',
        exemplo: 'Exemplo: envelope "Mercado" com limite de R$ 1.200,00 por mês e as categorias Mercado e Padaria.',
      },
      competencia: {
        detalhe: 'O mês que está sendo mostrado. Use as setas para ver os envelopes de meses anteriores ou do próximo.',
        exemplo: 'Exemplo: voltar para o mês passado para ver se o envelope "Lazer" estourou.',
      },
      totais: {
        detalhe: 'Somando todos os envelopes do mês: o limite total, quanto já foi gasto e quanto ainda dá para gastar (ou quanto estourou).',
        exemplo: 'Exemplo: limite R$ 2.000,00, já gasto R$ 1.400,00, ainda posso gastar R$ 600,00.',
      },
      envelope: {
        detalhe: 'A barra mostra quanto do limite já foi usado. A cor muda quando está perto do limite e quando passa dele. Toque para ver os lançamentos que entraram no envelope.',
        exemplo: 'Exemplo: o envelope "Combustível" com R$ 380,00 de R$ 400,00 fica amarelo.',
        porLinha: true,
      },
      opcoes: {
        detalhe: 'O botão "⋯" do envelope abre as opções para editar (nome, limite, categorias) ou excluir o envelope.',
        exemplo: 'Exemplo: aumentar o limite do "Mercado" para R$ 1.400,00.',
        porLinha: true,
      },
    },
  },

  budget: {
    errosComuns: [
      'A categoria não aparece na lista do Novo Orçamento: cada categoria só pode ter um orçamento. Edite o que já existe.',
      'Os gastos não batem com o mês do calendário: o Orçamento segue o mês financeiro definido em Configurações.',
    ],
    itens: {
      resumo: {
        detalhe: 'Somando todas as categorias com orçamento: quanto foi planejado, quanto já foi gasto e quanto ainda sobra no mês.',
        exemplo: 'Exemplo: orçado R$ 3.000,00, gasto R$ 2.100,00, saldo R$ 900,00.',
      },
      'modo-valor': {
        detalhe: 'Só aparece quando o módulo de Contratos está ligado. "Despesa real" conta o valor do contrato no mês dele; "Valor pago" conta o que saiu da conta.',
        exemplo: 'Exemplo: um contrato pago em 3 vezes pode contar pelo valor do mês ou pelo pagamento feito.',
      },
      novo: {
        detalhe: 'Abre um formulário simples: escolha a categoria de despesa e o valor que você pretende gastar com ela por mês.',
        exemplo: 'Exemplo: orçar R$ 600,00 por mês para "Restaurantes".',
      },
      categoria: {
        detalhe: 'Cada cartão mostra a categoria, o valor planejado e o valor gasto, com uma barra. A barra fica amarela perto do limite e vermelha quando estoura.',
        exemplo: 'Exemplo: "Restaurantes" com R$ 650,00 gastos de R$ 600,00 aparece em vermelho.',
        porLinha: true,
      },
      editar: {
        detalhe: 'Abre o orçamento para trocar a categoria ou o valor planejado.',
        exemplo: 'Exemplo: subir o orçamento de "Mercado" de R$ 1.000,00 para R$ 1.100,00.',
        porLinha: true,
      },
      excluir: {
        detalhe: 'Remove o orçamento dessa categoria. Os lançamentos não são apagados.',
        exemplo: 'Exemplo: tirar o orçamento de "Presentes" depois do fim do ano.',
        porLinha: true,
      },
    },
  },
}

// ── Itens que faltavam no inventário ─────────────────────────────────────────────────────────────
export const novosItens = {
  reservas: [
    {
      chave: 'aba-resumo', rotulo: 'Aba Resumo', depoisDe: 'abas',
      texto: 'Abre o Resumo: cada objetivo de reserva, com saldo, entradas e saídas.',
      detalhe: 'É na aba Resumo que você cria, edita e acompanha as funções de reserva (os objetivos). As outras abas mostram o futuro, o dia a dia e o histórico.',
      exemplo: 'Exemplo: abrir o Resumo para criar a função "Viagem de férias".',
    },
  ],
  // Subtela nova: modo "Conciliar Fatura" do Importar Fatura.
  'import:conciliacao': [
    {
      chave: 'cabecalho', rotulo: 'Conciliação de Fatura',
      texto: 'Mostra o cartão, o mês e o arquivo que estão sendo comparados.',
      detalhe: 'Confira aqui se o cartão e o mês são os certos antes de decidir qualquer coisa. Se não forem, saia e escolha de novo.',
      exemplo: 'Exemplo: "Cartão Azul · 05/2025 · fatura-maio.csv".',
    },
    {
      chave: 'sair', rotulo: 'Sair',
      texto: 'Sai da conciliação sem gravar nada.',
      detalhe: 'Volta para a tela normal do Importar Fatura. Nenhuma das escolhas feitas aqui é gravada.',
      exemplo: 'Exemplo: você escolheu o mês errado — clique em Sair e comece de novo.',
    },
    {
      chave: 'totais', rotulo: 'Totais e Diferença',
      texto: 'Total do arquivo, total no Finup depois das suas escolhas e a diferença entre eles.',
      detalhe: 'A cada escolha (importar, ignorar, manter, excluir) o total do Finup é recalculado. O objetivo é a Diferença chegar a zero, quando aparece o sinal de certo.',
      exemplo: 'Exemplo: arquivo R$ 2.000,00, Finup R$ 1.950,00 → diferença de R$ 50,00 ainda a explicar.',
    },
    {
      chave: 'fatura-encerrada', rotulo: 'Fatura encerrada',
      texto: 'Marque quando o fechamento já passou: parcelas que faltam vão para a fatura seguinte.',
      detalhe: 'Só aparece quando há parcelas no Finup que não estão no arquivo. Com a fatura já fechada, essas parcelas são levadas para o mês seguinte ao confirmar. Em fatura ainda aberta, nada é mudado.',
      exemplo: 'Exemplo: a parcela 3/10 de uma compra não veio nesta fatura — ela passa para a fatura do mês seguinte.',
    },
    {
      chave: 'acoes', rotulo: 'Resumo e Confirmar Conciliação',
      texto: 'Quantos itens já batem, quantos serão importados e excluídos, e o botão para gravar.',
      detalhe: 'O botão "Confirmar Conciliação" grava de uma vez tudo o que você marcou e volta para a tela normal. Ele fica apagado enquanto não houver nada para importar, excluir ou mover.',
      exemplo: 'Exemplo: "35 conciliados · 2 a importar · 1 a excluir" → Confirmar Conciliação.',
    },
    {
      chave: 'cancelar', rotulo: 'Cancelar',
      texto: 'Desiste da conciliação sem gravar nada.',
      detalhe: 'Igual ao Sair: descarta as escolhas e volta para a tela normal.',
      exemplo: 'Exemplo: cancelar para baixar de novo o arquivo completo da fatura.',
    },
    {
      chave: 'so-arquivo', rotulo: 'Só no arquivo — falta no Finup',
      texto: 'Compras que estão no arquivo do banco e não foram achadas no Finup.',
      detalhe: 'Para cada uma, você pode ajustar categoria e grupo e escolher se importa ou ignora. Clique na linha para ver o histórico daquele fornecedor.',
      exemplo: 'Exemplo: uma assinatura de R$ 29,90 que você não lançou aparece aqui.',
    },
    {
      chave: 'importar-ignorar', rotulo: 'Importar / Ignorar', porLinha: true,
      texto: 'Escolha se a compra entra no Finup ou fica de fora.',
      detalhe: '"Importar" grava a compra na fatura ao confirmar. "Ignorar" deixa de fora — use quando ela já está no Finup com outro valor ou outra data.',
      exemplo: 'Exemplo: ignorar uma compra que você lançou com a data do recibo, diferente da do banco.',
    },
    {
      chave: 'so-sistema', rotulo: 'Só no Finup — não está no arquivo',
      texto: 'Lançamentos da fatura no Finup que não aparecem no arquivo do banco.',
      detalhe: 'Pode ser algo lançado em dobro, no cartão errado, ou uma compra que só vai entrar na próxima fatura. Decida linha por linha.',
      exemplo: 'Exemplo: uma compra de R$ 45,00 lançada duas vezes aparece aqui.',
    },
    {
      chave: 'manter-excluir', rotulo: 'Manter / Excluir', porLinha: true,
      texto: 'Mantenha o lançamento ou marque para excluir ao confirmar.',
      detalhe: '"Manter" não muda nada. "Excluir" apaga o lançamento quando você confirmar. Lançamentos que ainda podem chegar numa fatura aberta só podem ser mantidos.',
      exemplo: 'Exemplo: excluir a cópia repetida de uma compra.',
    },
    {
      chave: 'conciliados', rotulo: 'Conciliados',
      texto: 'Compras que estão nos dois lados e já batem. Não precisam de ação.',
      detalhe: 'Ao confirmar, essas compras são marcadas como conferidas. Clique numa linha para ver o histórico do fornecedor.',
      exemplo: 'Exemplo: as 35 compras que já estavam certas no Finup.',
    },
    {
      chave: 'editar', rotulo: 'Editar (lápis)', porLinha: true,
      texto: 'Abre o lançamento do Finup para corrigir algum dado.',
      detalhe: 'Use quando a compra bate, mas algum dado está errado no Finup, como a categoria ou a descrição.',
      exemplo: 'Exemplo: corrigir a categoria de uma compra conciliada de "Outros" para "Farmácia".',
    },
  ],
}

// Título/descrição da subtela nova (não existe em AJUDA_TELAS).
export const novasTelas = {
  'import:conciliacao': {
    titulo: 'Conciliar Fatura',
    descricao: 'Compare o arquivo da fatura do banco com a fatura que já está no Finup e decida o que importar, excluir ou manter até a diferença zerar.',
    dicas: [],
  },
}

// ── Tarefas "Faça comigo" ────────────────────────────────────────────────────────────────────────
export const tarefas = [
  {
    id: 'transactions.despesa',
    tela: 'transactions',
    hash: null,
    titulo: 'Registrar uma despesa',
    descricao: 'Lance um gasto que já aconteceu e veja o saldo da conta mudar.',
    requer: ['pode:lancamentos:incluir', 'pagina:transactions'],
    passos: [
      { alvo: 'transactions.novo', texto: 'Clique em "Novo". Se o Finup perguntar "Qual conta?", toque na conta de onde o dinheiro saiu.', espera: 'clique' },
      { alvo: 'lancamento-form.tipo', texto: 'Escolha "Despesa": é dinheiro que saiu.', espera: 'clique' },
      { alvo: 'lancamento-form.valor', texto: 'Digite o valor gasto. Exemplo: 180,00.', espera: 'preencher' },
      { alvo: 'lancamento-form.data', texto: 'Confira a data em que o gasto aconteceu.', espera: 'nenhuma' },
      { alvo: 'lancamento-form.categoria', texto: 'Escolha a categoria, por exemplo "Energia".', espera: 'preencher' },
      { alvo: 'lancamento-form.favorecido', texto: 'Se quiser, diga para quem foi o pagamento.', espera: 'nenhuma' },
      { alvo: 'lancamento-form.salvar', texto: 'Confira tudo e clique em Registrar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'transactions', filtro: (t) => t.type === 'expense' },
    final: 'Pronto! A despesa já desconta do saldo da conta e aparece no extrato.',
  },
  {
    id: 'transactions.receita',
    tela: 'transactions',
    hash: null,
    titulo: 'Registrar uma receita',
    descricao: 'Lance um dinheiro que entrou, como um salário ou uma venda.',
    requer: ['pode:lancamentos:incluir', 'pagina:transactions'],
    passos: [
      { alvo: 'transactions.novo', texto: 'Clique em "Novo". Se o Finup perguntar "Qual conta?", toque na conta onde o dinheiro entrou.', espera: 'clique' },
      { alvo: 'lancamento-form.tipo', texto: 'Escolha "Receita": é dinheiro que entrou.', espera: 'clique' },
      { alvo: 'lancamento-form.valor', texto: 'Digite o valor recebido. Exemplo: 3.500,00.', espera: 'preencher' },
      { alvo: 'lancamento-form.data', texto: 'Confira a data em que o dinheiro entrou.', espera: 'nenhuma' },
      { alvo: 'lancamento-form.categoria', texto: 'Escolha a categoria, por exemplo "Salário".', espera: 'preencher' },
      { alvo: 'lancamento-form.descricao', texto: 'Se quiser, escreva uma descrição curta.', espera: 'nenhuma' },
      { alvo: 'lancamento-form.salvar', texto: 'Confira e clique em Registrar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'transactions', filtro: (t) => t.type === 'income' },
    final: 'Pronto! A receita já soma no saldo da conta.',
  },
  {
    id: 'transactions.transferencia',
    tela: 'transactions',
    hash: null,
    titulo: 'Fazer uma transferência entre contas',
    descricao: 'Registre dinheiro passando de uma conta sua para outra, sem virar despesa.',
    requer: ['pode:lancamentos:incluir', 'pagina:transactions'],
    passos: [
      { alvo: 'transactions.novo', texto: 'Clique em "Novo". Se o Finup perguntar "Qual conta?", toque na conta de onde o dinheiro sai.', espera: 'clique' },
      { alvo: 'lancamento-form.tipo', texto: 'Escolha "Transferência".', espera: 'clique' },
      { alvo: 'lancamento-form.conta', texto: 'Confira a conta de origem: de onde o dinheiro sai.', espera: 'nenhuma' },
      { alvo: 'lancamento-form.conta-destino', texto: 'Escolha a conta de destino: para onde o dinheiro vai.', espera: 'preencher' },
      { alvo: 'lancamento-form.valor', texto: 'Digite o valor transferido. Exemplo: 500,00.', espera: 'preencher' },
      { alvo: 'lancamento-form.data', texto: 'Confira a data da transferência.', espera: 'nenhuma' },
      { alvo: 'lancamento-form.salvar', texto: 'Clique em Registrar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'transactions', filtro: (t) => t.type === 'transfer' },
    final: 'Pronto! Uma conta diminuiu e a outra aumentou no mesmo valor. Transferência não conta como gasto.',
  },
  {
    id: 'transactions.rateio',
    tela: 'transactions',
    hash: null,
    titulo: 'Dividir um lançamento em categorias',
    descricao: 'Separe um único pagamento em várias categorias, como uma compra de mercado com itens de farmácia.',
    requer: ['pode:lancamentos:incluir', 'pagina:transactions'],
    passos: [
      { alvo: 'transactions.novo', texto: 'Clique em "Novo" e, se for perguntado, escolha a conta.', espera: 'clique' },
      { alvo: 'lancamento-form.valor', texto: 'Digite o valor total pago. Exemplo: 300,00.', espera: 'preencher' },
      { alvo: 'lancamento-form.dividir', texto: 'Clique em "Dividir em categorias".', espera: 'clique' },
      { alvo: 'rateio-form.categoria', texto: 'Escolha a categoria da primeira parte, por exemplo "Mercado".', espera: 'preencher' },
      { alvo: 'rateio-form.valor', texto: 'Digite quanto dessa compra foi dessa categoria. Exemplo: 250,00.', espera: 'preencher' },
      { alvo: 'rateio-form.adicionar', texto: 'Clique em "+ Categoria" para a próxima parte e preencha categoria e valor (use "Usar restante" para o que falta).', espera: 'clique' },
      { alvo: 'rateio-form.restante', texto: 'O "Restante a distribuir" precisa chegar a zero.', espera: 'nenhuma' },
      { alvo: 'rateio-form.gravar', texto: 'Clique em Gravar para voltar ao lançamento.', espera: 'clique' },
      { alvo: 'lancamento-form.salvar', texto: 'Confira e clique em Registrar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'transactions', filtro: (t) => t.type !== 'transfer' },
    final: 'Pronto! O lançamento conta em cada categoria pela sua parte nos relatórios e no orçamento.',
  },
  {
    id: 'transactions.parcelada-cartao',
    tela: 'transactions',
    hash: null,
    titulo: 'Lançar uma compra parcelada no cartão',
    descricao: 'Registre uma compra em várias vezes e o Finup coloca cada parcela na fatura certa.',
    requer: ['pode:lancamentos:incluir', 'pagina:transactions'],
    passos: [
      { alvo: 'transactions.novo-cartao', texto: 'Clique no "+" ao lado do cartão de crédito. (Ainda não tem cartão? Cadastre um em Contas primeiro.)', espera: 'clique' },
      { alvo: 'lancamento-form.valor', texto: 'Digite o valor TOTAL da compra. Exemplo: 600,00.', espera: 'preencher' },
      { alvo: 'lancamento-form.data', texto: 'Confira a data da compra.', espera: 'nenhuma' },
      { alvo: 'lancamento-form.categoria', texto: 'Escolha a categoria, por exemplo "Eletrônicos".', espera: 'preencher' },
      { alvo: 'lancamento-form.parcelado', texto: 'Ligue a chave "Parcelado".', espera: 'clique' },
      { alvo: 'lancamento-form.parcelas', texto: 'Digite em quantas vezes. O Finup mostra o valor de cada parcela.', espera: 'preencher' },
      { alvo: 'lancamento-form.fatura', texto: 'A fatura é escolhida sozinha pelo dia de fechamento. Só mude se precisar.', espera: 'nenhuma' },
      { alvo: 'lancamento-form.salvar', texto: 'Clique em Registrar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'transactions', filtro: (t) => Number(t.installmentTotal) > 1 && Number(t.installmentNum) === 1 },
    final: 'Pronto! Cada parcela foi para a fatura do seu mês. Veja em Lançamentos, abaixo do cartão.',
  },
  {
    id: 'transactions.conferir-fatura',
    tela: 'transactions',
    hash: null,
    titulo: 'Conferir uma fatura do cartão',
    descricao: 'Abra uma fatura e marque as compras que batem com a fatura do banco.',
    requer: ['pagina:transactions', 'pode:lancamentos:editar'],
    passos: [
      { alvo: 'transactions.fatura', texto: 'Clique numa fatura, abaixo do cartão.', espera: 'clique' },
      { alvo: 'transactions:fatura.resumo', texto: 'Compare o total com o total da fatura no aplicativo do banco.', espera: 'nenhuma' },
      { alvo: 'transactions:fatura.reconciliado', texto: 'Achou a compra na fatura do banco? Clique no "R" para marcar como conferida.', espera: 'clique' },
      { alvo: 'transactions:fatura.conciliados', texto: 'Aqui você vê quanto já foi conferido e quanto ainda falta.', espera: 'nenhuma' },
      { alvo: 'transactions:fatura.reconciliar', texto: 'Para marcar várias de uma vez, use "Reconciliar" (no computador).', espera: 'nenhuma' },
    ],
    novoItem: null,
    final: 'Pronto! Quando "Pendentes" chegar a zero, a fatura está toda conferida.',
  },
  {
    id: 'import.fatura',
    tela: 'import',
    hash: null,
    titulo: 'Importar uma fatura do cartão',
    descricao: 'Traga o arquivo da fatura do banco, revise e grave só o que falta.',
    requer: ['pode:importar:incluir', 'pagina:import'],
    passos: [
      { alvo: 'import.cartao', texto: 'Escolha o cartão de crédito da fatura.', espera: 'preencher' },
      { alvo: 'import.arquivo', texto: 'Clique aqui (ou arraste) e escolha o arquivo da fatura baixado do banco: Excel, CSV ou OFX.', espera: 'clique' },
      { alvo: 'import.resumo', texto: 'Veja o resumo: total do arquivo, o que já está no Finup e o que será importado.', espera: 'nenhuma' },
      { alvo: 'import.abas', texto: 'Use as abas para revisar as novas e decidir as que pedem a sua decisão.', espera: 'nenhuma' },
      { alvo: 'import.classificar-auto', texto: 'Se quiser, clique em "Classificar Auto" para preencher as categorias sozinho.', espera: 'nenhuma' },
      { alvo: 'import.confirmar', texto: 'Tudo certo? Clique em Confirmar.', espera: 'clique' },
      { alvo: 'importacao-previa.acoes', texto: 'Confira a prévia final e clique em "Confirmar importação" (ou "Concluir").', espera: 'salvar' },
    ],
    novoItem: { colecao: 'cardImports' },
    final: 'Pronto! As compras novas estão na fatura e a importação aparece no Histórico de Importações.',
  },
  {
    id: 'import.conciliar',
    tela: 'import',
    hash: null,
    titulo: 'Conciliar uma fatura já lançada',
    descricao: 'Compare o arquivo do banco com a fatura que você já lançou e zere a diferença.',
    requer: ['pode:importar:incluir', 'pagina:import'],
    passos: [
      { alvo: 'import.cartao', texto: 'Escolha o cartão.', espera: 'preencher' },
      { alvo: 'import.mes', texto: 'Escolha o mês da fatura.', espera: 'preencher' },
      { alvo: 'import.conciliar', texto: 'Clique em "Conciliar Fatura" e escolha o arquivo do banco.', espera: 'clique' },
      { alvo: 'import:conciliacao.totais', texto: 'Aqui está a diferença entre o arquivo e o Finup. A meta é chegar a zero.', espera: 'nenhuma' },
      { alvo: 'import:conciliacao.so-arquivo', texto: 'Compras que faltam no Finup: escolha Importar ou Ignorar em cada uma.', espera: 'nenhuma' },
      { alvo: 'import:conciliacao.so-sistema', texto: 'Lançamentos que não estão no arquivo: escolha Manter ou Excluir.', espera: 'nenhuma' },
      { alvo: 'import.conciliacao-confirmar', texto: 'Clique em "Confirmar Conciliação" para gravar.', espera: 'clique' },
    ],
    novoItem: null,
    final: 'Pronto! A fatura no Finup agora bate com a do banco.',
  },
  {
    id: 'importar-lancamentos.arquivo',
    tela: 'importar-lancamentos',
    hash: null,
    titulo: 'Importar um extrato ou planilha',
    descricao: 'Traga os lançamentos de uma conta a partir de um arquivo, revise e grave.',
    requer: ['pode:lancamentos:incluir', 'pagina:importar-lancamentos'],
    passos: [
      { alvo: 'importar-lancamentos.conta', texto: 'Escolha a conta que vai receber os lançamentos.', espera: 'preencher' },
      { alvo: 'importar-lancamentos.gerar-excel', texto: 'Não tem o extrato OFX do banco? Baixe aqui uma planilha modelo para preencher.', espera: 'nenhuma' },
      { alvo: 'importar-lancamentos.arquivo', texto: 'Clique e escolha o arquivo: a planilha preenchida, um CSV ou o extrato OFX.', espera: 'clique' },
      { alvo: 'importar-lancamentos.previa', texto: 'Confira a prévia: quantas linhas estão certas, com erro ou parecem repetidas.', espera: 'nenhuma' },
      { alvo: 'importar-lancamentos.marcar-todas', texto: 'Só as linhas marcadas entram. Desmarque o que não quiser trazer.', espera: 'nenhuma' },
      { alvo: 'importar-lancamentos.importar', texto: 'Clique em Importar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'transactions', filtro: (t) => t.origin === 'importacao_padrao' },
    final: 'Pronto! Os lançamentos estão na conta. Se algo saiu errado, use "Desfazer importação" em Últimas importações.',
  },
  {
    id: 'reservas.primeira-funcao',
    tela: 'reservas',
    hash: null,
    titulo: 'Criar o primeiro objetivo de reserva',
    descricao: 'Crie uma função de reserva para guardar dinheiro para um gasto futuro, como IPVA ou férias.',
    requer: ['pode:reservas:incluir', 'pagina:reservas'],
    passos: [
      { alvo: 'reservas.aba-resumo', texto: 'Abra a aba "Resumo".', espera: 'clique' },
      { alvo: 'reservas:resumo.nova-funcao', texto: 'Clique em "Nova Função".', espera: 'clique' },
      { alvo: 'reserva-form.nome', texto: 'Dê um nome ao objetivo. Exemplo: IPVA.', espera: 'preencher' },
      { alvo: 'reserva-form.conta', texto: 'Escolha a conta onde esse dinheiro fica guardado (de preferência uma conta marcada como reserva).', espera: 'preencher' },
      { alvo: 'reserva-form.despesa-anual', texto: 'Quanto você vai gastar com isso no ano. Exemplo: 1.800,00.', espera: 'preencher' },
      { alvo: 'reserva-form.deposito-mensal', texto: 'Quanto pretende guardar por mês. Exemplo: 150,00.', espera: 'preencher' },
      { alvo: 'reserva-form.mes-vencimento', texto: 'Em que mês a despesa vence.', espera: 'preencher' },
      { alvo: 'reserva-form.salvar', texto: 'Clique em Criar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'reserveFunctions' },
    final: 'Pronto! O objetivo aparece no Resumo, e o Fluxo Futuro mostra como ele vai evoluir.',
  },
  {
    id: 'budget.primeiro',
    tela: 'budget',
    hash: null,
    titulo: 'Criar o primeiro orçamento',
    descricao: 'Defina quanto quer gastar por mês numa categoria e acompanhe.',
    requer: ['pode:orcamento:incluir', 'pagina:budget'],
    passos: [
      { alvo: 'budget.novo', texto: 'Clique em "Novo Orçamento".', espera: 'clique' },
      { alvo: 'orcamento-form.categoria', texto: 'Escolha a categoria de despesa. Exemplo: Restaurantes.', espera: 'preencher' },
      { alvo: 'orcamento-form.valor', texto: 'Digite quanto pretende gastar por mês. Exemplo: 600,00.', espera: 'preencher' },
      { alvo: 'orcamento-form.salvar', texto: 'Clique em Criar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'budgets' },
    final: 'Pronto! A barra mostra quanto você já gastou dessa categoria no mês.',
  },
  {
    id: 'envelopes.primeiro',
    tela: 'envelopes',
    hash: null,
    titulo: 'Criar o primeiro envelope',
    descricao: 'Separe um limite de gasto mensal para um assunto, como mercado ou lazer.',
    requer: ['pode:envelopes:incluir', 'pagina:envelopes'],
    passos: [
      { alvo: 'envelopes.novo', texto: 'Clique em "Novo Envelope".', espera: 'clique' },
      { alvo: 'envelope-form.nome', texto: 'Dê um nome. Exemplo: Mercado.', espera: 'preencher' },
      { alvo: 'envelope-form.limite', texto: 'Digite o limite do mês. Exemplo: 1.200,00.', espera: 'preencher' },
      { alvo: 'envelope-form.dia', texto: 'O dia em que o mês do envelope vence (de 1 a 28).', espera: 'nenhuma' },
      { alvo: 'envelope-form.conta', texto: 'Se quiser, ligue a uma conta: o que falta gastar aparece no saldo previsto dela.', espera: 'nenhuma' },
      { alvo: 'envelope-form.categorias', texto: 'Marque as categorias que contam neste envelope. Exemplo: Mercado e Padaria.', espera: 'preencher' },
      { alvo: 'envelope-form.salvar', texto: 'Clique em Salvar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'envelopes' },
    final: 'Pronto! Todo gasto nessas categorias passa a encher a barra do envelope.',
  },
]
