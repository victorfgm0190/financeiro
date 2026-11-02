// Grupo `config`: Configurações (todas as seções), Contratos, Relatórios e Clientes Finup.
// Central de Ajuda: explicação e exemplo de CADA item já existente de AJUDA_TELAS destas telas.
export const detalhes = {
  settings: {
    errosComuns: [
      'Não acho uma seção: ela fica dentro de uma aba. Escolha a aba no alto (Geral, Cadastros, Regras…) e depois a seção no menu ao lado.',
      'Aparece "Somente leitura": o seu nível de acesso só permite ver. Peça a um administrador para mudar a sua permissão.',
    ],
    itens: {
      caminho: { detalhe: 'É a linha logo abaixo do título. Ela mostra em qual aba e em qual seção você está, para não se perder entre tantos ajustes.', exemplo: 'Exemplo: "Configurações › Cadastros › Categorias" quer dizer que você está editando as categorias.' },
      'aba-geral': { detalhe: 'Reúne os ajustes básicos do ambiente: quando o mês financeiro começa, o nome que sai nos relatórios, as regras de estorno e IOF do cartão, os perfis (CPF/CNPJ) e a agenda no celular.', exemplo: 'Exemplo: abra Geral › Perfis para cadastrar a sua empresa.' },
      'aba-cadastros': { detalhe: 'São as listas usadas nos formulários do dia a dia. O que você cadastra aqui aparece para escolher ao lançar, agendar ou importar.', exemplo: 'Exemplo: crie a categoria "Academia" em Cadastros › Categorias para usá-la nos lançamentos.' },
      'aba-regras': { detalhe: 'Regras fazem o Finup preencher campos sozinho quando a descrição do lançamento tem um certo texto. Economizam tempo na importação.', exemplo: 'Exemplo: tudo que tiver "POSTO" na descrição vai para a categoria Combustível.' },
      'aba-dados': { detalhe: 'Tudo o que mexe nos dados como um todo: cópia de segurança (backup), ferramentas de manutenção e a limpeza dos dados guardados no aparelho.', exemplo: 'Exemplo: baixe um backup em Dados › Backup antes de uma grande mudança.' },
      'aba-usuarios': { detalhe: 'Só administradores veem esta aba. Nela você cadastra quem pode entrar, define o nível de acesso e quais perfis cada pessoa enxerga.', exemplo: 'Exemplo: cadastre o contador com nível Consulta, para ele só ver os números.' },
      'aba-perigo': { detalhe: 'Fica separada e em vermelho porque as ações dela apagam dados de vez. Use só quando tiver certeza e um backup feito.', exemplo: 'Exemplo: apagar todos os dados para recomeçar um ambiente de teste do zero.' },
      secoes: { detalhe: 'Cada aba tem várias seções. No computador o menu fica à esquerda; no celular, logo acima do conteúdo. A seção aberta fica destacada.', exemplo: 'Exemplo: na aba Cadastros, clique em "Grupos de contas" para organizar as suas contas.' },
    },
  },
  'settings:agenda-celular': {
    errosComuns: [
      'A agenda do celular não mostra um agendamento: confira se ele está marcado para sincronizar com a agenda (no próprio agendamento ou em lote na lista).',
      'Os compromissos demoram a mudar: o aplicativo de agenda do celular atualiza a assinatura de tempos em tempos, não na hora.',
    ],
    itens: {
      mostrar: { detalhe: 'Escolha o que vai para a agenda: só as contas a pagar, só as a receber, ou as duas. Com "Ambos", cada uma vira um calendário separado.', exemplo: 'Exemplo: escolha "Despesas" para lembrar só do que você tem que pagar.' },
      valores: { detalhe: 'Define se o valor aparece junto do nome do compromisso. Desligue se outras pessoas costumam ver a tela do seu celular.', exemplo: 'Exemplo: com "Sim" aparece "Aluguel — R$ 1.500,00"; com "Não", só "Aluguel".' },
      criar: { detalhe: 'Cria o seu link pessoal de agenda. Só precisa fazer uma vez; depois aparecem os botões para adicionar ao celular.', exemplo: 'Exemplo: clique em "Criar minha agenda" e, em seguida, em "Adicionar ao iPhone".' },
      iphone: { detalhe: 'Abre a agenda do iPhone pedindo para assinar o calendário do Finup. Confirme no celular e os vencimentos passam a aparecer lá.', exemplo: 'Exemplo: abra esta tela no próprio iPhone, toque no botão e confirme "Assinar".' },
      google: { detalhe: 'Abre o Google Agenda com o calendário do Finup pronto para adicionar. Depois ele aparece também no celular Android ligado à mesma conta.', exemplo: 'Exemplo: clique no botão, confirme "Adicionar" e veja as contas a pagar no calendário.' },
      copiar: { detalhe: 'Copia o endereço do calendário para você colar em outro aplicativo de agenda que aceite assinatura por link.', exemplo: 'Exemplo: copie o link e cole na opção "Adicionar calendário por URL" do seu aplicativo.' },
      'novo-link': { detalhe: 'Cria um endereço novo e desliga o antigo. Use se o link foi parar com alguém que não devia. Depois, adicione a agenda de novo nos aparelhos.', exemplo: 'Exemplo: você mandou o link por engano para um grupo; gere um novo e assine de novo no seu celular.' },
    },
  },
  'settings:apelidos-ia': {
    itens: {
      recarregar: { detalhe: 'Busca de novo a lista no servidor, para ver apelidos que o Assistente aprendeu há pouco.', exemplo: 'Exemplo: você acabou de corrigir uma sugestão no Assistente; clique em Recarregar para ver o apelido novo.' },
      termo: { detalhe: 'É a palavra ou expressão do seu jeito de falar. Dá para corrigir o texto direto no campo; ao sair dele, a mudança é gravada.', exemplo: 'Exemplo: o termo "mercadinho" pode apontar para a categoria Supermercado.' },
      destino: { detalhe: 'Mostra para onde o termo leva: uma categoria, uma conta ou um favorecido. É o que o Assistente vai escolher quando ouvir aquele termo.', exemplo: 'Exemplo: "conta da empresa" vai para a conta corrente do perfil da empresa.' },
      excluir: { detalhe: 'Apaga o apelido. O Assistente volta a adivinhar sozinho na próxima vez e pode aprender de novo se você corrigir.', exemplo: 'Exemplo: apague o apelido "farmácia → Saúde" se agora quiser separar em outra categoria.' },
    },
  },
  'settings:atalhos': {
    errosComuns: [
      'O atalho não funciona: atalhos valem só no computador e não funcionam enquanto você digita dentro de um campo.',
      'Combinação recusada: ela já é usada por outra ação ou é reservada. Escolha outra, sempre com Alt ou Ctrl.',
    ],
    itens: {
      'restaurar-todos': { detalhe: 'Desfaz todas as suas personalizações de uma vez e volta cada ação para a combinação de fábrica.', exemplo: 'Exemplo: você mudou vários atalhos e se confundiu; clique aqui para começar do padrão.' },
      gravar: { detalhe: 'Clique no botão do atalho e aperte a nova combinação no teclado. Ela fica gravada para você em qualquer computador. Esc cancela sem mudar.', exemplo: 'Exemplo: clique no atalho de "Novo lançamento" e aperte Alt+N.' },
      desativar: { detalhe: 'Tira o atalho daquela ação. Útil quando a combinação atrapalha outro programa que você usa.', exemplo: 'Exemplo: desative um atalho que conflita com o do seu navegador.' },
      restaurar: { detalhe: 'Volta só aquela ação para a combinação padrão, sem mexer nas outras.', exemplo: 'Exemplo: restaure o atalho de "Buscar" e mantenha os demais como você deixou.' },
      fixos: { detalhe: 'Lista combinações que valem sempre e não podem ser mudadas, como a que mostra a ajuda de atalhos.', exemplo: 'Exemplo: Shift+? abre a lista de atalhos da tela em que você está.' },
    },
  },
  'settings:backup': {
    errosComuns: [
      'Restaurou o arquivo errado: a restauração troca tudo. Por isso, sempre exporte um backup atual antes de importar outro.',
    ],
    itens: {
      contagem: { detalhe: 'Mostra quantas contas, lançamentos e agendamentos existem agora. Serve para conferir se o backup tem o tamanho esperado.', exemplo: 'Exemplo: antes de restaurar, anote que há 12 contas e 3.400 lançamentos para comparar depois.' },
      exportar: { detalhe: 'Baixa um arquivo com todos os dados do ambiente. Guarde num lugar seguro: ele é a sua cópia de segurança.', exemplo: 'Exemplo: exporte um backup no fim de cada mês e guarde na sua pasta de documentos.' },
      importar: { detalhe: 'Troca todos os dados atuais pelos do arquivo escolhido. Não junta: o que não estiver no arquivo deixa de existir.', exemplo: 'Exemplo: restaurar a cópia de ontem depois de apagar algo importante sem querer.' },
    },
  },
  'settings:categorias': {
    errosComuns: [
      'Não consigo criar a categoria: o campo Grupo é obrigatório. Escolha um grupo da lista ou digite um nome novo.',
      'As setas de ordem sumiram: o filtro está num perfil. Volte para "Todos os perfis" para reordenar.',
    ],
    itens: {
      padrao: { detalhe: 'Volta a ordem de grupos e categorias para a padrão (grupos na ordem do sistema e categorias em ordem alfabética). Nada é apagado.', exemplo: 'Exemplo: depois de arrastar muita coisa, clique em Padrão para reorganizar tudo.' },
      'novo-grupo': { detalhe: 'Cria um grupo vazio para juntar categorias parecidas. Depois você move categorias para ele.', exemplo: 'Exemplo: crie o grupo "Casa" para juntar Aluguel, Luz e Água.' },
      'filtro-perfil': { detalhe: 'Mostra só as categorias liberadas para um perfil (pessoa ou empresa). Categorias sem perfil valem para todos e sempre aparecem.', exemplo: 'Exemplo: escolha o perfil da empresa para ver só as categorias usadas por ela.' },
      'grupo-editar': { detalhe: 'O lápis renomeia o grupo e as categorias dele acompanham. A lixeira só funciona com o grupo vazio.', exemplo: 'Exemplo: renomeie o grupo "Transporte" para "Carro e transporte".' },
      ordem: { detalhe: 'Arraste pelo ⠿ ou use as setas para mudar a posição. A ordem daqui é a mesma dos seletores de categoria em todo o Finup.', exemplo: 'Exemplo: suba "Supermercado" para o topo, já que é a que você mais usa.' },
      'cat-grupo': { detalhe: 'Troca o grupo de uma categoria. Os lançamentos continuam na mesma categoria; só muda onde ela aparece nos relatórios.', exemplo: 'Exemplo: mova "Farmácia" do grupo "Outros" para o grupo "Saúde".' },
      'cat-gerencial': { detalhe: 'Define o grupo gerencial que já vem preenchido quando você lança nesta categoria. Você ainda pode trocar no lançamento.', exemplo: 'Exemplo: a categoria "Viagem" já vem com o grupo gerencial da reserva de viagens.' },
      'cat-investimento': { detalhe: 'Ao escolher uma conta aqui, cada despesa de cartão nesta categoria gera também um aporte nessa conta de investimento.', exemplo: 'Exemplo: compras na categoria "Previdência" no cartão viram aporte na conta de previdência.' },
      'cat-espelho': { detalhe: 'Ligado, cada lançamento nesta categoria cria uma cópia na conta vinculada. Serve para controlar, por exemplo, quanto alguém lhe deve.', exemplo: 'Exemplo: a categoria "Empréstimo a terceiros" espelha cada valor na conta "A receber de terceiros".' },
      'cat-excluir': { detalhe: 'Apaga a categoria. Antes, confira se ela não está em uso; se estiver, prefira mover os lançamentos para outra categoria.', exemplo: 'Exemplo: exclua uma categoria criada por engano e ainda sem lançamentos.' },
      'nova-categoria': { detalhe: 'Preencha o nome, o grupo, se é despesa, receita ou ambos, um emoji e, se quiser, os perfis que podem usar. Clique em Adicionar.', exemplo: 'Exemplo: "Pet shop", grupo "Casa", Despesa, emoji 🐶, para todos os perfis.' },
    },
  },
  'settings:centros-custo': {
    itens: {
      lista: { detalhe: 'Mostra todos os centros de custo já criados. Eles aparecem como opção nos lançamentos e agendamentos.', exemplo: 'Exemplo: "Obra", "Filial Centro" e "Viagem de férias".' },
      novo: { detalhe: 'Digite um nome curto e clique em Adicionar. O centro de custo é um rótulo extra, que não substitui a categoria.', exemplo: 'Exemplo: crie "Reforma 2026" para somar tudo o que for gasto na reforma, de várias categorias.' },
    },
  },
  'settings:classificacao': {
    itens: {
      excluir: { detalhe: 'Apaga a regra. Os lançamentos já classificados por ela não mudam; ela só deixa de agir nos próximos.', exemplo: 'Exemplo: apague a regra "PADARIA → Lazer" que foi criada com a categoria errada.' },
      nova: { detalhe: 'Digite um pedaço de texto que aparece na descrição e escolha a categoria. Toda descrição que contiver esse texto recebe a categoria sozinha.', exemplo: 'Exemplo: "FARMA" → Saúde; assim "FARMACIA CENTRAL" já entra em Saúde.' },
    },
  },
  'settings:controle-gerencial': {
    errosComuns: [
      'Não consigo desligar: ainda há saldo nas subcontas gerenciais ou agendamentos pendentes. O Finup lista o que falta resolver.',
    ],
    itens: {
      chave: { detalhe: 'Liga ou desliga o controle gerencial para todo o ambiente. Desligado, as telas e campos gerenciais somem, mas o histórico fica guardado.', exemplo: 'Exemplo: ligue para separar os gastos do cartão por objetivo, como casa, viagem e trabalho.' },
      'novo-grupo': { detalhe: 'Cria um grupo para separar os gastos do cartão. Informe o nome, um apelido curto (até 4 letras) e a conta de onde sai o resgate.', exemplo: 'Exemplo: grupo "Viagens", apelido "VIA", com resgate na conta reserva de viagens.' },
      editar: { detalhe: 'Muda nome, apelido ou conta de resgate do grupo. Os lançamentos que já usam o grupo continuam ligados a ele.', exemplo: 'Exemplo: troque a conta de resgate do grupo "Casa" para a nova conta reserva.' },
      excluir: { detalhe: 'Remove o grupo. Grupos fixos do sistema não podem ser removidos.', exemplo: 'Exemplo: exclua o grupo "Festa 2025" depois que tudo dele foi resolvido.' },
    },
  },
  'settings:dados-aparelho': {
    itens: {
      apagar: { detalhe: 'Encerra a sessão e limpa o que ficou guardado neste navegador ou celular. Os seus dados na nuvem continuam intactos e voltam quando você entrar de novo.', exemplo: 'Exemplo: usou o Finup no computador de um hotel; ao terminar, clique aqui antes de sair.' },
    },
  },
  'settings:depara-importacao': {
    itens: {
      recarregar: { detalhe: 'Busca a lista de novo, incluindo de-paras criados há pouco durante uma importação.', exemplo: 'Exemplo: você acabou de importar uma planilha; recarregue para ver os de-paras novos.' },
      novo: { detalhe: 'Digite o nome da categoria exatamente como vem no arquivo e escolha a categoria do Finup que deve recebê-la.', exemplo: 'Exemplo: "Alimentação/Mercado" do arquivo vira "Supermercado" no Finup.' },
      categoria: { detalhe: 'Troca a categoria de destino de um de-para já salvo. Vale para as próximas importações.', exemplo: 'Exemplo: mude "Lazer/Bar" de "Lazer" para "Restaurantes".' },
      excluir: { detalhe: 'Apaga o de-para. Na próxima importação, o Finup volta a perguntar qual categoria usar.', exemplo: 'Exemplo: apague um de-para que ligou duas categorias erradas.' },
    },
  },
  'settings:estornos': {
    itens: {
      estorno: { detalhe: 'Ligado, todo estorno encontrado na importação da fatura (dinheiro devolvido que não é pagamento) já entra com uma categoria definida.', exemplo: 'Exemplo: a loja devolveu R$ 80,00 de uma compra cancelada e o estorno já entra classificado.' },
      'estorno-categoria': { detalhe: 'A categoria que os estornos do cartão recebem quando a opção acima está ligada.', exemplo: 'Exemplo: escolha a categoria "Estornos e devoluções".' },
      iof: { detalhe: 'A porcentagem de IOF usada para estimar compras em moeda estrangeira lançadas pelo Assistente. Grava quando você sai do campo.', exemplo: 'Exemplo: com 3,5%, uma compra que deu R$ 100,00 estima R$ 3,50 de IOF.' },
    },
  },
  'settings:favorecidos': {
    errosComuns: [
      'O mesmo favorecido aparece com nomes diferentes: marque os nomes repetidos e use Mesclar para deixar um só.',
    ],
    itens: {
      sincronizar: { detalhe: 'Procura nomes usados em lançamentos, agendamentos e regras que ainda não estão no cadastro e os inclui.', exemplo: 'Exemplo: depois de importar um extrato, sincronize para ver os nomes novos na lista.' },
      busca: { detalhe: 'Digite parte do nome para filtrar a lista e achar rápido o favorecido.', exemplo: 'Exemplo: digite "padaria" para ver todas as padarias cadastradas.' },
      selecionar: { detalhe: 'Marque a caixinha dos nomes que são a mesma pessoa ou empresa. Com dois ou mais marcados, o botão Mesclar fica disponível.', exemplo: 'Exemplo: marque "Mercado Bom Preço" e "MERCADO BOM PRECO LTDA".' },
      mesclar: { detalhe: 'Junta os nomes marcados em um só. Você escolhe o nome final e vê quantos registros mudam antes de confirmar.', exemplo: 'Exemplo: os dois nomes acima viram só "Mercado Bom Preço".' },
      renomear: { detalhe: 'Troca o nome em todos os lugares onde ele aparece: lançamentos, agendamentos e regras.', exemplo: 'Exemplo: renomeie "Dr. Silva" para "Clínica Silva".' },
    },
  },
  'settings:grupo-gerencial': {
    itens: {
      ordem: { detalhe: 'As regras são testadas de cima para baixo e vale a primeira que combinar. Use as setas para mudar a prioridade.', exemplo: 'Exemplo: suba a regra "UBER parcelado" para ela valer antes da regra geral "UBER".' },
      excluir: { detalhe: 'Apaga a regra. Na próxima importação da fatura ela deixa de ser usada.', exemplo: 'Exemplo: exclua a regra de um grupo gerencial que você não usa mais.' },
      nova: { detalhe: 'Informe a palavra-chave da descrição, se vale para compra parcelada, à vista ou qualquer uma, um valor mínimo e máximo (opcionais) e o grupo gerencial.', exemplo: 'Exemplo: "HOTEL", qualquer forma, acima de R$ 300,00 → grupo "Viagens".' },
    },
  },
  'settings:grupos-contas': {
    itens: {
      padrao: { detalhe: 'Volta os grupos de contas para a ordem padrão. Nada é apagado.', exemplo: 'Exemplo: clique em Padrão se a ordem ficou confusa depois de muitas mudanças.' },
      ordem: { detalhe: 'Arraste pelo ⠿ ou use as setas. A ordem daqui é a mesma da tela Contas e dos seletores de conta.', exemplo: 'Exemplo: deixe o grupo do banco que você mais usa em primeiro.' },
      inibir: { detalhe: 'Esconde o grupo do aplicativo sem apagar nada. O olho de novo traz o grupo de volta.', exemplo: 'Exemplo: inibir o grupo de um banco que você deixou de usar, mantendo o histórico.' },
      editar: { detalhe: 'Muda o nome do grupo e a conta âncora. A conta âncora é a que recebe o ajuste quando você acerta o saldo do grupo todo em Manutenção.', exemplo: 'Exemplo: renomeie para "Banco A" e escolha a conta corrente como âncora.' },
      excluir: { detalhe: 'Remove o grupo. As contas dele não são apagadas: passam para a seção "Sem Grupo".', exemplo: 'Exemplo: exclua um grupo vazio criado por engano.' },
      novo: { detalhe: 'Escolha o tipo: Financeiro (contas de dinheiro) ou Patrimonial (bens, investimentos e dívidas). Digite o nome e clique em +.', exemplo: 'Exemplo: tipo Patrimonial, nome "Imóveis", para cadastrar casa e terreno.' },
    },
  },
  'settings:guias': {
    itens: {
      interruptor: { detalhe: 'É a chave geral dos guias. Desligada, nenhum tour abre sozinho, o "?" some dos títulos e o checklist de primeiros passos não aparece. Religando, tudo volta como estava.', exemplo: 'Exemplo: desligue os guias para mostrar o Finup numa reunião sem nenhuma janela de ajuda abrindo.' },
      reativar: { detalhe: 'Faz o guia voltar a abrir sozinho em todas as telas, inclusive nas que você tinha marcado "Não mostrar mais".', exemplo: 'Exemplo: depois de um tempo sem usar o Finup, reative para relembrar cada tela.' },
      desativar: { detalhe: 'Para de abrir o guia sozinho em qualquer tela. O botão "?" ao lado do título continua funcionando quando você quiser.', exemplo: 'Exemplo: você já conhece o Finup e prefere abrir a ajuda só pelo "?".' },
      lista: { detalhe: 'Mostra cada tela e se o tour dela abre sozinho. Use o botão da linha para ligar ou desligar o tour de uma tela só.', exemplo: 'Exemplo: deixe o tour ligado só em Contratos, que você ainda está aprendendo.' },
    },
  },
  'settings:identidade': {
    itens: {
      nome: { detalhe: 'O nome do dono do sistema, mostrado no rodapé do menu lateral e no cabeçalho das planilhas exportadas.', exemplo: 'Exemplo: "Família Souza" ou "Padaria Pão Quente".' },
      frase: { detalhe: 'Uma linha opcional que sai embaixo do nome nos relatórios em Excel. Deixe em branco se não quiser.', exemplo: 'Exemplo: "Controle financeiro pessoal e da empresa".' },
      salvar: { detalhe: 'Grava o nome e a frase. Os próximos relatórios exportados já saem com eles.', exemplo: 'Exemplo: preencha o nome, clique em Salvar e exporte um relatório para conferir o cabeçalho.' },
    },
  },
  'settings:importacao': {
    errosComuns: [
      'Linha em amarelo não importa: ela está sem conta. Escolha a conta da linha antes de confirmar.',
    ],
    itens: {
      recarregar: { detalhe: 'Busca de novo as linhas que ainda esperam revisão.', exemplo: 'Exemplo: outra pessoa revisou parte das linhas; recarregue para ver como ficou.' },
      abas: { detalhe: 'Separa a importação de extratos de conta corrente da importação de cartões, porque cada arquivo tem colunas diferentes.', exemplo: 'Exemplo: escolha "Cartões" antes de enviar a planilha das faturas antigas.' },
      arquivo: { detalhe: 'Envia a planilha exportada do outro aplicativo. As linhas ficam pendentes para você revisar antes de virarem lançamentos.', exemplo: 'Exemplo: envie o arquivo .xlsx com o histórico do ano passado.' },
      contagem: { detalhe: 'Mostra quantas linhas ainda faltam revisar, quantas já viraram lançamento e quantas você descartou.', exemplo: 'Exemplo: "120 pendentes, 300 confirmados, 8 ignorados".' },
      confirmar: { detalhe: 'Transforma as linhas marcadas em lançamentos de verdade nas contas indicadas.', exemplo: 'Exemplo: marque as 50 linhas de janeiro e clique em Confirmar importação.' },
      ignorar: { detalhe: 'Descarta as linhas marcadas sem criar lançamentos. Útil para linhas repetidas ou que não interessam.', exemplo: 'Exemplo: ignore as linhas de transferências que já estão lançadas.' },
      limpar: { detalhe: 'Remove todas as linhas pendentes de uma vez. O que já foi confirmado continua como está.', exemplo: 'Exemplo: enviou o arquivo errado; limpe as pendências e envie o certo.' },
    },
  },
  'settings:manutencao': {
    errosComuns: [
      'O ajuste por grupo não aparece para o grupo: falta definir a conta âncora em Cadastros › Grupos de contas.',
    ],
    itens: {
      rateio: { detalhe: 'Procura pagamentos de agendamentos divididos em categorias que ficaram sem a divisão no lançamento.', exemplo: 'Exemplo: o condomínio era dividido entre "Taxa" e "Fundo de reserva", mas o pagamento ficou numa categoria só.' },
      'rateio-procurar': { detalhe: 'Faz a busca e mostra a lista. Você confere cada caso e decide aplicar a divisão.', exemplo: 'Exemplo: clique em Procurar, confira os 3 lançamentos achados e aplique.' },
      'recalcular-saldos': { detalhe: 'Refaz o saldo de todas as contas somando o saldo inicial e todos os lançamentos. Use se algum saldo parecer errado.', exemplo: 'Exemplo: o saldo de uma conta não bate com a soma do extrato; recalcule.' },
      'corrigir-gerencial': { detalhe: 'Arruma transferências e agendamentos gerenciais de compras parceladas que ficaram fora do lugar.', exemplo: 'Exemplo: uma compra parcelada mudou de grupo e as transferências antigas ficaram para trás.' },
      'recalcular-faturas': { detalhe: 'Refaz as contas a pagar das faturas de cada cartão a partir das compras lançadas.', exemplo: 'Exemplo: o valor agendado da fatura não bate com o total das compras; recalcule.' },
      'ajuste-grupo': { detalhe: 'Informe o grupo de contas, a data e o saldo real do banco. O Finup mostra a diferença e lança o ajuste na conta âncora.', exemplo: 'Exemplo: o banco mostra R$ 5.000,00 e o Finup R$ 4.950,00; o ajuste lança R$ 50,00.' },
      desfazer: { detalhe: 'Desfaz o último ajuste de saldo feito aqui, voltando o saldo ao que era.', exemplo: 'Exemplo: digitou o saldo errado no ajuste; clique para desfazer e faça de novo.' },
    },
  },
  'settings:perfis': {
    errosComuns: [
      'Conta aparece como "Sem vínculo": ela não tem perfil. Edite a conta na tela Contas e escolha o perfil.',
      'Excluí um perfil e as contas sumiram dos totais: elas ficaram sem perfil. Ligue as contas a outro perfil.',
    ],
    itens: {
      novo: { detalhe: 'Abre o formulário para cadastrar uma pessoa (CPF) ou empresa (CNPJ). Cada perfil tem o próprio saldo, relatórios e categorias.', exemplo: 'Exemplo: um perfil para você (Pessoa Física) e outro para a sua loja (Pessoa Jurídica).' },
      ordem: { detalhe: 'Muda a posição do perfil nos seletores e nos botões de filtro do topo da tela.', exemplo: 'Exemplo: suba o perfil da empresa se é o que você mais consulta.' },
      editar: { detalhe: 'Abre o formulário com os dados do perfil para trocar nome, documento, cor ou tipo.', exemplo: 'Exemplo: corrija o CNPJ digitado errado.' },
      excluir: { detalhe: 'Apaga o perfil depois de confirmar. As contas dele continuam existindo, mas ficam "Sem vínculo".', exemplo: 'Exemplo: exclua um perfil de teste que não tem contas.' },
      principal: { detalhe: 'Dentro do formulário: o perfil marcado como principal já vem escolhido no filtro quando você abre o Finup.', exemplo: 'Exemplo: marque o seu perfil pessoal como principal para abrir sempre nele.' },
    },
  },
  'settings:periodo': {
    itens: {
      modo: { detalhe: '"Mês corrido" usa o mês do calendário. "Mês personalizado" começa num dia que você escolhe, bom para quem recebe salário no meio do mês.', exemplo: 'Exemplo: quem recebe no dia 5 usa mês personalizado começando no dia 5.' },
      'dia-inicio': { detalhe: 'O dia em que o seu mês financeiro começa (de 1 a 28). Só vale no modo "Mês personalizado".', exemplo: 'Exemplo: dia 15 faz o mês ir de 15/05 a 14/06, chamado de "Maio".' },
      salvar: { detalhe: 'Grava o modo e o dia. O Painel e os relatórios passam a agrupar receitas e despesas pelo novo período.', exemplo: 'Exemplo: mude para o dia 10, clique em Salvar e veja o Painel com o novo mês.' },
    },
  },
  'settings:tipos-documento': {
    itens: {
      novo: { detalhe: 'Cadastra um tipo com nome, sigla curta (que aparece na coluna "Doc."), natureza e cor.', exemplo: 'Exemplo: nome "Nota fiscal", sigla "NF", cor verde.' },
      ordem: { detalhe: 'Arraste pelo ⠿ ou use as setas para mudar a ordem em que os tipos aparecem nos formulários.', exemplo: 'Exemplo: deixe "Boleto" em primeiro, já que é o mais usado.' },
      ativo: { detalhe: 'Tipo inativo some das opções dos formulários, mas continua aparecendo nos registros antigos que o usam.', exemplo: 'Exemplo: inative "Cheque" se você não usa mais cheques.' },
      editar: { detalhe: 'Muda nome, sigla, natureza ou cor. Os registros que já usam o tipo mostram a mudança.', exemplo: 'Exemplo: troque a cor de "Fatura" para destacar melhor na lista.' },
      excluir: { detalhe: 'Apaga o tipo. Se ele já estiver em algum agendamento ou lançamento, o Finup só o inativa, para não perder a informação.', exemplo: 'Exemplo: exclua um tipo criado por engano e nunca usado.' },
    },
  },
  'settings:usuarios': {
    errosComuns: [
      'A pessoa não consegue entrar: confira se o usuário está Ativo e se não ficou bloqueado por senhas erradas.',
      'Mudei o nível e nada aconteceu: a mudança vale a partir do próximo login da pessoa.',
    ],
    itens: {
      recarregar: { detalhe: 'Busca a lista de usuários de novo, com a situação atualizada de cada um.', exemplo: 'Exemplo: a pessoa acabou de criar a senha; recarregue para ver a situação nova.' },
      novo: { detalhe: 'Cadastra quem vai usar o sistema: nome, usuário para entrar, e-mail, senha, nível de acesso e os perfis que a pessoa pode ver.', exemplo: 'Exemplo: cadastre a secretária como Operador, vendo só o perfil da empresa.' },
      link: { detalhe: 'Manda um e-mail com um link para a própria pessoa criar a senha. Assim você não precisa saber a senha dela.', exemplo: 'Exemplo: cadastre o usuário e clique no envelope para ele receber o convite por e-mail.' },
      senha: { detalhe: 'Define uma senha nova na hora, sem precisar da antiga. Passe a senha à pessoa por um meio seguro.', exemplo: 'Exemplo: a pessoa esqueceu a senha e está sem acesso ao e-mail.' },
      editar: { detalhe: 'Muda nome, e-mail, nível de acesso e perfis permitidos da pessoa.', exemplo: 'Exemplo: passe alguém de Consulta para Operador para que possa lançar.' },
      ativar: { detalhe: 'Desativado, o usuário não entra mais, mas o histórico dele fica guardado. Dá para ativar de novo depois.', exemplo: 'Exemplo: desative o acesso de quem saiu da empresa.' },
      desbloquear: { detalhe: 'Depois de várias senhas erradas o acesso fica travado por 15 minutos. Este botão libera na hora.', exemplo: 'Exemplo: a pessoa errou a senha cinco vezes e precisa entrar agora.' },
    },
  },
  'settings:zona-perigo': {
    itens: {
      apagar: { detalhe: 'Apaga contas, lançamentos e agendamentos do ambiente inteiro, depois de pedir confirmação. Não tem como desfazer sem um backup.', exemplo: 'Exemplo: zerar um ambiente de teste, depois de exportar um backup em Dados › Backup.' },
    },
  },

  contratos: {
    errosComuns: [
      'O contrato não aparece na lista: confira os filtros de Perfil, Tipo e Status (o padrão mostra só os ativos).',
      'O botão "Avançar" não passa: falta algum campo obrigatório da etapa; a mensagem em vermelho diz qual.',
    ],
    itens: {
      abas: { detalhe: 'A aba Contratos mostra a lista; a aba Regras de itens do boleto diz quem paga cada item cobrado no boleto.', exemplo: 'Exemplo: abra "Regras de itens do boleto" para dizer que o fundo de obras é do proprietário.' },
      perfil: { detalhe: 'Mostra só os contratos de uma pessoa ou empresa, ou de todos.', exemplo: 'Exemplo: escolha o perfil da empresa para ver só o aluguel da loja.' },
      tipo: { detalhe: 'Separa os contratos em que você paga (é o inquilino ou contratante) dos que você recebe (é o proprietário ou prestador).', exemplo: 'Exemplo: escolha "A receber" para ver os imóveis que você aluga para outras pessoas.' },
      status: { detalhe: 'Filtra pela situação do contrato. O padrão mostra só os ativos; escolha "Todos" para ver também os encerrados.', exemplo: 'Exemplo: escolha "Encerrado" para consultar um aluguel antigo.' },
      novo: { detalhe: 'Abre o cadastro em etapas: dados, valores, reajuste, imóvel e prévia. No fim, o Finup gera as parcelas como agendamentos.', exemplo: 'Exemplo: aluguel de R$ 1.500,00 todo dia 10, reajuste pelo IPCA no aniversário.' },
      lista: { detalhe: 'Cada linha mostra o valor atual, a vigência, o próximo vencimento e o próximo reajuste. Clique para abrir a ficha completa.', exemplo: 'Exemplo: clique em "Apto 302" para ver as parcelas pagas e as que faltam.' },
    },
  },
  'contratos:regras': {
    itens: {
      escopo: { detalhe: 'Regras globais valem para todos os contratos. Escolha um contrato para ver ou criar regras só dele.', exemplo: 'Exemplo: escolha o contrato da sala comercial para uma regra que só vale lá.' },
      nova: { detalhe: 'Informe o texto do item como aparece no boleto, se ele "começa com" ou "contém" esse texto, e quem paga: inquilino ou proprietário.', exemplo: 'Exemplo: "FUNDO DE OBRAS", contém, responsável Proprietário.' },
      lista: { detalhe: 'Mostra as regras cadastradas no escopo escolhido. Use o lápis para mudar e a lixeira para excluir.', exemplo: 'Exemplo: edite a regra "TAXA EXTRA" para passar a ser do inquilino.' },
      testar: { detalhe: 'Cole o texto do boleto e veja como cada item seria classificado antes de lançar. Nada é gravado.', exemplo: 'Exemplo: cole as linhas do boleto do condomínio e confira quem paga cada uma.' },
    },
  },

  reports: {
    errosComuns: [
      'Não vejo o Relatório de Fatura: ele só aparece quando há pelo menos um cartão de crédito cadastrado.',
    ],
    itens: {
      demonstrativo: { detalhe: 'Abre o relatório de receitas e despesas por grupo e categoria, com filtros de período, contas e categorias e exportação para planilha.', exemplo: 'Exemplo: veja quanto foi gasto em cada categoria nos últimos 3 meses.' },
      favorecido: { detalhe: 'Abre o relatório com quanto foi pago e recebido de cada pessoa ou empresa, com os lançamentos de cada uma.', exemplo: 'Exemplo: descubra quanto você pagou à escola no ano.' },
      'fluxo-conta': { detalhe: 'Abre o extrato com saldo acumulado de uma conta, de um grupo ou das contas principais, podendo somar o que ainda está agendado.', exemplo: 'Exemplo: veja como o saldo da conta da empresa fica até o fim do mês.' },
      fatura: { detalhe: 'Abre a análise das faturas do cartão, com os gastos por grupo e categoria.', exemplo: 'Exemplo: compare a fatura deste mês com a do mês passado.' },
      medias: { detalhe: 'Mostra a média mensal de receitas, despesas e saldo dos últimos 6 meses. Ajuda a saber quanto você costuma gastar.', exemplo: 'Exemplo: média de despesas de R$ 4.200,00 por mês.' },
      evolucao: { detalhe: 'Gráfico de barras com o que entrou e o que saiu em cada um dos últimos 6 meses.', exemplo: 'Exemplo: perceber que as despesas sobem todo fim de ano.' },
      'despesas-categoria': { detalhe: 'Gráfico de pizza com a participação de cada categoria nas despesas do mês escolhido.', exemplo: 'Exemplo: ver que Moradia é a maior fatia do mês.' },
      'modo-valor': { detalhe: 'Só para quem usa Contratos. "Despesa real" desconta os créditos que são do proprietário; "Valor pago" mostra o que saiu da conta de fato.', exemplo: 'Exemplo: o boleto foi R$ 1.800,00, mas R$ 200,00 eram do proprietário; a despesa real é R$ 1.600,00.' },
      mes: { detalhe: 'Escolhe o mês usado na pizza e no ranking de despesas.', exemplo: 'Exemplo: escolha o mês anterior para comparar com o atual.' },
      ranking: { detalhe: 'Lista as 10 categorias com mais gasto no mês, com o valor e a porcentagem de cada uma.', exemplo: 'Exemplo: Supermercado em 1º lugar, com 22% das despesas.' },
    },
  },
  'reports:demonstrativo': {
    errosComuns: [
      'Mudei o filtro e o relatório não mudou: clique em Atualizar para aplicar.',
      'Os botões de exportar não aparecem: monte o relatório primeiro clicando em Atualizar.',
    ],
    itens: {
      voltar: { detalhe: 'Fecha o Demonstrativo e volta para a lista de relatórios.', exemplo: 'Exemplo: depois de exportar, volte para abrir o Relatório por Favorecido.' },
      'entre-perfis': { detalhe: 'Normalmente, dinheiro passado entre perfis seus não conta como receita nem despesa. Ligue para que conte.', exemplo: 'Exemplo: ver o pró-labore que a empresa pagou para você como despesa da empresa.' },
      'ocultar-reserva': { detalhe: 'Tira do relatório os depósitos e resgates das contas reserva, para ver só o dia a dia.', exemplo: 'Exemplo: esconda o depósito mensal de R$ 500,00 na reserva de emergência.' },
      'ocultar-patrimonio': { detalhe: 'Tira do relatório compras e vendas de bens e aplicações em investimento, que não são gasto do dia a dia.', exemplo: 'Exemplo: esconda a compra de um carro para não distorcer as despesas do mês.' },
      'exibir-lancamentos': { detalhe: 'Mostra cada lançamento embaixo da sua categoria, além dos totais. Bom para conferir de onde vem um valor.', exemplo: 'Exemplo: ver cada compra que formou o total de "Restaurantes".' },
      periodo: { detalhe: 'Botões rápidos que preenchem as datas com os últimos meses.', exemplo: 'Exemplo: clique em "3 meses" para ver o trimestre.' },
      datas: { detalhe: 'Escolha a data inicial e a final exatas, quando os atalhos não servem.', exemplo: 'Exemplo: de 01/01 a 30/06 para ver o primeiro semestre.' },
      categorias: { detalhe: 'Marque só as categorias que interessam. Sem nada marcado, todas entram.', exemplo: 'Exemplo: marque só "Saúde" e "Farmácia" para somar os gastos médicos.' },
      contas: { detalhe: 'Marque só as contas que entram no relatório. Sem nada marcado, todas entram.', exemplo: 'Exemplo: marque só as contas da empresa.' },
      atualizar: { detalhe: 'Monta o relatório com os filtros escolhidos. Ele fica destacado quando há mudança ainda não aplicada.', exemplo: 'Exemplo: escolha o período e clique em Atualizar.' },
      'exportar-csv': { detalhe: 'Baixa um arquivo simples, sem formatação, que abre em qualquer planilha.', exemplo: 'Exemplo: exporte em CSV para colar os números em outra planilha sua.' },
      'exportar-excel': { detalhe: 'Gera a planilha formatada, com cabeçalho do ambiente e os filtros usados, pronta para imprimir ou enviar.', exemplo: 'Exemplo: exporte em Excel para mandar o resumo do mês ao seu contador.' },
      tabela: { detalhe: 'O relatório em si: receitas e despesas por grupo e categoria, com o total de cada uma e o resultado do período.', exemplo: 'Exemplo: Receitas R$ 8.000,00, Despesas R$ 6.500,00, resultado R$ 1.500,00.' },
    },
  },
  'reports:favorecido': {
    itens: {
      voltar: { detalhe: 'Fecha este relatório e volta para a lista de relatórios.', exemplo: 'Exemplo: volte para abrir o Demonstrativo Financeiro.' },
      periodo: { detalhe: 'Botões rápidos que preenchem as datas com os últimos meses.', exemplo: 'Exemplo: clique em "12 meses" para ver o último ano.' },
      datas: { detalhe: 'Escolha a data inicial e a final exatas do relatório.', exemplo: 'Exemplo: de 01/01 a 31/12 para fechar o ano.' },
      contas: { detalhe: 'Marque só as contas que entram. Sem nada marcado, todas entram.', exemplo: 'Exemplo: marque só o cartão de crédito para ver onde você mais compra.' },
      atualizar: { detalhe: 'Monta o relatório com os filtros escolhidos.', exemplo: 'Exemplo: mude o período e clique em Atualizar.' },
      'csv-sintetico': { detalhe: 'Baixa uma linha por favorecido, só com os totais pago, recebido e saldo.', exemplo: 'Exemplo: uma lista curta com quanto foi pago a cada fornecedor.' },
      'csv-analitico': { detalhe: 'Baixa os totais e, embaixo de cada favorecido, cada lançamento que formou o total.', exemplo: 'Exemplo: conferir cada pagamento feito ao eletricista no ano.' },
      excel: { detalhe: 'Gera a planilha formatada, pronta para imprimir ou enviar.', exemplo: 'Exemplo: mande ao contador a lista do que foi pago a prestadores de serviço.' },
      busca: { detalhe: 'Digite parte do nome para filtrar a tabela.', exemplo: 'Exemplo: digite "posto" para ver todos os postos de combustível.' },
      tabela: { detalhe: 'Total pago, recebido e saldo de cada favorecido. Clique numa linha para ver os lançamentos dele.', exemplo: 'Exemplo: clique em "Escola Aprender" para ver as 12 mensalidades.' },
    },
  },
  'reports:fluxo-conta': {
    errosComuns: [
      'O saldo inicial parece errado: ele é o saldo do dia anterior à data inicial. Confira se há lançamentos faltando antes do período.',
    ],
    itens: {
      voltar: { detalhe: 'Fecha este relatório e volta para a lista de relatórios.', exemplo: 'Exemplo: volte para abrir outro relatório.' },
      visao: { detalhe: '"Por Conta" deixa escolher contas avulsas; "Por Grupo" usa um grupo de contas; "Contas Principais" usa as que somam no Saldo Principal.', exemplo: 'Exemplo: escolha "Contas Principais" para ver o dinheiro do dia a dia.' },
      provisorio: { detalhe: 'Adiciona uma entrada ou saída só para simular. Ela não vira lançamento nem agendamento.', exemplo: 'Exemplo: simule uma despesa de R$ 2.000,00 no dia 20 para ver se o saldo aguenta.' },
      selecao: { detalhe: 'Escolha as contas ou o grupo de contas que entram, conforme a visão escolhida.', exemplo: 'Exemplo: marque a conta corrente e a poupança.' },
      datas: { detalhe: 'O período do relatório. O saldo começa no dia anterior à data inicial.', exemplo: 'Exemplo: de hoje até o fim do próximo mês.' },
      'incluir-agendamentos': { detalhe: 'Ligado, soma também as contas a pagar e a receber que ainda vão acontecer, não só o que já foi lançado.', exemplo: 'Exemplo: ligue para ver o salário e o aluguel do próximo mês no saldo.' },
      'ocultar-reserva': { detalhe: 'Tira da lista os depósitos e resgates de reserva.', exemplo: 'Exemplo: esconda as transferências para a reserva de emergência.' },
      'ocultar-patrimonio': { detalhe: 'Tira da lista compras e vendas de bens e investimentos.', exemplo: 'Exemplo: esconda a aplicação mensal no investimento.' },
      resumo: { detalhe: 'Mostra o total que entra, o que sai e o saldo esperado no fim do período.', exemplo: 'Exemplo: Entradas R$ 6.000,00, Saídas R$ 5.200,00, Saldo projetado R$ 2.300,00.' },
      exportar: { detalhe: 'Gera a planilha com todas as movimentações e o saldo após cada uma.', exemplo: 'Exemplo: exporte o fluxo do mês para planejar com a família.' },
      caixinha: { detalhe: 'Desmarque uma linha para ver o saldo sem ela. É só simulação: nada muda de verdade.', exemplo: 'Exemplo: desmarque a viagem planejada para ver quanto sobra sem ela.' },
      data: { detalhe: 'Clique na data de um agendamento para testar outro dia e ver o efeito no saldo. Não altera o agendamento.', exemplo: 'Exemplo: mude o IPVA do dia 5 para o dia 25 e veja se o saldo fica positivo.' },
    },
  },

  clientes: {
    errosComuns: [
      'Não consigo excluir um cliente: cancele o cliente primeiro; só então a exclusão fica disponível.',
    ],
    itens: {
      abas: { detalhe: 'A aba Clientes cuida dos cadastros e pedidos; a aba Consumo de IA mostra quanto cada cliente usou o Assistente.', exemplo: 'Exemplo: abra "Consumo de IA" no fim do mês para conferir os custos.' },
      'filtro-status': { detalhe: 'Botões com cada situação (pedido, ativo, suspenso, cancelado…) e a quantidade de clientes em cada uma. Clique para filtrar.', exemplo: 'Exemplo: clique em "Pedido" para ver quem pediu acesso pelo site e ainda espera aprovação.' },
      recarregar: { detalhe: 'Busca a lista de clientes de novo no servidor.', exemplo: 'Exemplo: um pedido acabou de chegar pelo site; recarregue para vê-lo.' },
      novo: { detalhe: 'Cadastra um cliente direto, sem esperar o pedido pelo site. Depois ele segue o mesmo caminho de aprovação.', exemplo: 'Exemplo: cadastre a "Loja Modelo" que fechou contrato por telefone.' },
      lista: { detalhe: 'Clique num cliente para ver os dados e as ações: aprovar, reenviar convite, mensagem de boas-vindas, editar ou excluir. O ícone de gráfico abre a Análise do Cliente.', exemplo: 'Exemplo: abra um cliente com situação "Pedido" e clique em Aprovar.' },
    },
  },
  'clientes:consumo': {
    errosComuns: [
      'Custo aparece como parcial: falta o preço de algum modelo usado. Cadastre o preço na tabela Preços.',
    ],
    itens: {
      periodo: { detalhe: 'Escolha este mês, o mês anterior ou um intervalo de datas para somar o consumo.', exemplo: 'Exemplo: escolha "Mês anterior" para fechar a conta do mês que passou.' },
      cliente: { detalhe: 'Mostra a soma de todos os clientes ou só de um.', exemplo: 'Exemplo: escolha um cliente para ver se ele está usando muito o Assistente.' },
      recarregar: { detalhe: 'Lê de novo o consumo registrado de cada cliente.', exemplo: 'Exemplo: recarregue depois de alguns minutos para ver as chamadas mais recentes.' },
      totais: { detalhe: 'Mostra o número de chamadas, os tokens (pedaços de texto processados), as imagens, o custo estimado em dólar e em reais e o tempo médio de resposta.', exemplo: 'Exemplo: 1.200 chamadas no mês, custo estimado de US$ 4,80.' },
      precos: { detalhe: 'A tabela com o preço de cada modelo por milhão de tokens e a data em que o preço passou a valer. O cálculo usa o preço válido em cada dia.', exemplo: 'Exemplo: cadastre o preço novo de um modelo a partir do dia em que ele mudou.' },
    },
  },
}

// Nenhum item novo: os inventários destas telas já cobrem os botões visíveis.
export const novosItens = {}

// Tarefas "Faça comigo".
export const tarefas = [
  {
    id: 'settings.perfil-cpf',
    tela: 'settings',
    hash: '#config/geral/perfis',
    titulo: 'Criar um perfil de pessoa física (CPF)',
    descricao: 'Cadastre você (ou outra pessoa) como perfil, para separar as contas e os números dela.',
    requer: ['pode:configuracoes:incluir'],
    passos: [
      { alvo: 'settings:perfis.novo', texto: 'Clique em "Novo Perfil".', espera: 'clique' },
      { alvo: 'perfil-form.tipo', texto: 'Escolha "Pessoa Física": é o perfil de uma pessoa, com CPF.', espera: 'clique' },
      { alvo: 'perfil-form.nome', texto: 'Digite o nome da pessoa. Ele aparece nos filtros e nos relatórios.', espera: 'preencher' },
      { alvo: 'perfil-form.documento', texto: 'Digite o CPF, se quiser. É opcional e serve só para identificar.', espera: 'nenhuma' },
      { alvo: 'perfil-form.cor', texto: 'Escolha uma cor: ela ajuda a reconhecer o perfil nas telas.', espera: 'nenhuma' },
      { alvo: 'perfil-form.principal', texto: 'Ligue "Perfil principal" se este deve vir escolhido ao abrir o Finup.', espera: 'nenhuma' },
      { alvo: 'perfil-form.salvar', texto: 'Confira e clique em "Adicionar".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'profiles', filtro: (p) => p.type === 'pf' },
    final: 'Pronto! O perfil aparece no filtro do topo. Agora, ao cadastrar uma conta, escolha este perfil.',
  },
  {
    id: 'settings.perfil-cnpj',
    tela: 'settings',
    hash: '#config/geral/perfis',
    titulo: 'Criar um perfil de empresa (CNPJ)',
    descricao: 'Cadastre a sua empresa como perfil, para ver o dinheiro dela separado do pessoal.',
    requer: ['pode:configuracoes:incluir'],
    passos: [
      { alvo: 'settings:perfis.novo', texto: 'Clique em "Novo Perfil".', espera: 'clique' },
      { alvo: 'perfil-form.tipo', texto: 'Escolha "Pessoa Jurídica": é o perfil de uma empresa, com CNPJ.', espera: 'clique' },
      { alvo: 'perfil-form.nome', texto: 'Digite o nome ou a razão social da empresa.', espera: 'preencher' },
      { alvo: 'perfil-form.documento', texto: 'Digite o CNPJ, se quiser. É opcional.', espera: 'nenhuma' },
      { alvo: 'perfil-form.cor', texto: 'Escolha uma cor diferente da do seu perfil pessoal, para não confundir.', espera: 'nenhuma' },
      { alvo: 'perfil-form.salvar', texto: 'Confira e clique em "Adicionar".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'profiles', filtro: (p) => p.type === 'pj' },
    final: 'Pronto! Use o filtro do topo para ver só a empresa, ou "Tudo" para ver tudo junto.',
  },
  {
    id: 'settings.categoria',
    tela: 'settings',
    hash: '#config/cadastros/categorias',
    titulo: 'Criar uma categoria',
    descricao: 'Crie uma categoria nova para classificar receitas ou despesas do seu jeito.',
    requer: ['pode:cadastros:incluir'],
    passos: [
      { alvo: 'settings:categorias.nova-categoria', texto: 'A nova categoria é criada nesta linha, abaixo da lista.', espera: 'nenhuma' },
      { alvo: 'categoria-form.nome', texto: 'Digite o nome da categoria. Exemplo: "Pet shop".', espera: 'preencher' },
      { alvo: 'categoria-form.grupo', texto: 'Escolha um grupo da lista ou digite um nome novo para criá-lo junto. O grupo é obrigatório.', espera: 'preencher' },
      { alvo: 'categoria-form.tipo', texto: 'Escolha Despesa, Receita ou Ambos.', espera: 'nenhuma' },
      { alvo: 'categoria-form.emoji', texto: 'Se quiser, troque o emoji que aparece ao lado do nome.', espera: 'nenhuma' },
      { alvo: 'categoria-form.salvar', texto: 'Clique em "Adicionar".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'categories' },
    final: 'Pronto! A categoria já aparece para escolher nos lançamentos e agendamentos.',
  },
  {
    id: 'settings.grupo-contas',
    tela: 'settings',
    hash: '#config/cadastros/grupos-contas',
    titulo: 'Criar um grupo de contas',
    descricao: 'Organize as suas contas em grupos, por exemplo por banco ou por tipo de bem.',
    requer: ['pode:cadastros:incluir'],
    passos: [
      { alvo: 'settings:grupos-contas.novo', texto: 'O novo grupo é criado nesta linha, no fim da lista.', espera: 'nenhuma' },
      { alvo: 'grupo-form.tipo', texto: 'Escolha Financeiro (contas de dinheiro) ou Patrimonial (bens, investimentos e dívidas).', espera: 'nenhuma' },
      { alvo: 'grupo-form.nome', texto: 'Digite o nome do grupo. Exemplo: "Banco A" ou "Imóveis".', espera: 'preencher' },
      { alvo: 'grupo-form.salvar', texto: 'Clique no "+" para criar.', espera: 'salvar' },
    ],
    novoItem: { colecao: 'accountGroups' },
    final: 'Pronto! Agora edite as suas contas na tela Contas e escolha este grupo para elas.',
  },
  {
    id: 'settings.agenda-celular',
    tela: 'settings',
    hash: '#config/geral/agenda-celular',
    titulo: 'Ver as contas na agenda do celular',
    descricao: 'Crie o seu link de agenda para ver os vencimentos no calendário do celular.',
    requer: ['pode:agendamentos:ver'],
    passos: [
      { alvo: 'settings.caminho', texto: 'Você está em Configurações › Geral › Agenda no celular.', espera: 'nenhuma' },
      { alvo: 'settings:agenda-celular.mostrar', texto: 'Escolha o que vai para a agenda: Despesas, Receitas ou Ambos.', espera: 'clique' },
      { alvo: 'settings:agenda-celular.valores', texto: 'Escolha se o valor aparece junto do nome. "Não" é mais discreto.', espera: 'clique' },
      { alvo: 'settings:agenda-celular.criar', texto: 'Clique em "Criar minha agenda".', espera: 'clique' },
    ],
    novoItem: null,
    final: 'Pronto! Agora use "Adicionar ao iPhone" ou "Adicionar ao Google Agenda" (de preferência abrindo esta tela no próprio celular) e confirme a assinatura.',
  },
  {
    id: 'settings.atalhos',
    tela: 'settings',
    hash: '#config/cadastros/atalhos',
    titulo: 'Personalizar um atalho de teclado',
    descricao: 'Troque a combinação de teclas de uma ação. Vale só no computador.',
    requer: ['pode:cadastros:ver'],
    passos: [
      { alvo: 'settings:atalhos.gravar', texto: 'Clique no botão do atalho que quer mudar.', espera: 'clique' },
      { alvo: 'settings:atalhos.gravar', texto: 'Agora aperte a nova combinação, sempre com Alt ou Ctrl. Esc cancela.', espera: 'nenhuma' },
      { alvo: 'settings:atalhos.restaurar', texto: 'Se não gostar, este botão volta o atalho para o padrão.', espera: 'nenhuma' },
      { alvo: 'settings:atalhos.desativar', texto: 'Este deixa a ação sem atalho nenhum.', espera: 'nenhuma' },
      { alvo: 'settings:atalhos.fixos', texto: 'Aqui ficam os atalhos que não mudam. Dica: Shift+? mostra os atalhos de qualquer tela.', espera: 'nenhuma' },
    ],
    novoItem: null,
    final: 'Pronto! O atalho novo já vale e fica salvo para você.',
  },
  {
    id: 'settings.periodo',
    tela: 'settings',
    hash: '#config/geral/periodo',
    titulo: 'Ajustar o mês financeiro',
    descricao: 'Faça o mês do Finup começar no dia em que você recebe, para os totais fazerem sentido.',
    requer: ['pode:configuracoes:editar'],
    passos: [
      { alvo: 'settings:periodo.modo', texto: 'Escolha "Mês personalizado" se o seu mês não começa no dia 1.', espera: 'clique' },
      { alvo: 'settings:periodo.dia-inicio', texto: 'Digite o dia em que o mês começa (de 1 a 28). Exemplo: o dia do salário.', espera: 'preencher' },
      { alvo: 'settings:periodo.salvar', texto: 'Clique em "Salvar".', espera: 'clique' },
      { alvo: 'settings.caminho', texto: 'O Painel e os relatórios passam a usar este período.', espera: 'nenhuma' },
    ],
    novoItem: null,
    final: 'Pronto! Abra o Painel para ver o mês financeiro novo.',
  },
  {
    id: 'contratos.primeiro-contrato',
    tela: 'contratos',
    hash: null,
    titulo: 'Cadastrar o primeiro contrato',
    descricao: 'Cadastre um aluguel ou serviço e deixe o Finup gerar as parcelas sozinho.',
    requer: ['contratos', 'pode:contratos:incluir'],
    passos: [
      { alvo: 'contratos.novo', texto: 'Clique em "Novo contrato".', espera: 'clique' },
      { alvo: 'contrato-form.tipo', texto: '"A pagar" se você é o inquilino; "A receber" se você é o proprietário.', espera: 'nenhuma' },
      { alvo: 'contrato-form.perfil', texto: 'Escolha o perfil (pessoa ou empresa) dono do contrato.', espera: 'nenhuma' },
      { alvo: 'contrato-form.objeto', texto: 'Descreva o contrato. Exemplo: "Apto 302 — Ed. Sol".', espera: 'preencher' },
      { alvo: 'contrato-form.avancar', texto: 'Confira o favorecido e o início da vigência e clique em "Avançar".', espera: 'clique' },
      { alvo: 'contrato-form.conta', texto: 'Escolha a conta de onde sai (ou entra) o dinheiro.', espera: 'preencher' },
      { alvo: 'contrato-form.valor', texto: 'Digite o valor do aluguel. Exemplo: 1.500,00.', espera: 'preencher' },
      { alvo: 'contrato-form.dia-vencimento', texto: 'Digite o dia de vencimento. Exemplo: 10.', espera: 'preencher' },
      { alvo: 'contrato-form.etapas', texto: 'Clique em "Avançar" até a Prévia (reajuste e imóvel podem ficar no padrão), confira as parcelas e clique em "Confirmar".', espera: 'salvar' },
    ],
    novoItem: { colecao: 'contratos' },
    final: 'Pronto! O contrato está na lista e as parcelas viraram agendamentos. Se o Finup achar agendamentos parecidos, ele pergunta se quer ligá-los ao contrato.',
  },
  {
    id: 'reports.exportar',
    tela: 'reports',
    hash: null,
    titulo: 'Abrir um relatório e exportar para Excel',
    descricao: 'Monte o Demonstrativo Financeiro do período e baixe a planilha.',
    requer: ['pode:relatorios:ver'],
    passos: [
      { alvo: 'reports.demonstrativo', texto: 'Clique em "Demonstrativo Financeiro".', espera: 'clique' },
      { alvo: 'reports:demonstrativo.periodo', texto: 'Escolha um período rápido, como os últimos 3 meses.', espera: 'clique' },
      { alvo: 'reports:demonstrativo.contas', texto: 'Se quiser, escolha só algumas contas. Sem nada marcado, todas entram.', espera: 'nenhuma' },
      { alvo: 'reports:demonstrativo.atualizar', texto: 'Clique em "Atualizar" para montar o relatório.', espera: 'clique' },
      { alvo: 'reports:demonstrativo.tabela', texto: 'Aqui estão as receitas e despesas por categoria, com os totais.', espera: 'nenhuma' },
      { alvo: 'reports:demonstrativo.exportar-excel', texto: 'Clique em "Exportar Excel" para baixar a planilha.', espera: 'clique' },
    ],
    novoItem: null,
    final: 'Pronto! A planilha foi baixada, com o nome do ambiente e os filtros usados no cabeçalho.',
  },
]

// Texto do tour GERAL de Configurações (apresenta as abas).
export const tourGeralSettings = {
  texto: 'Aqui ficam os ajustes do Finup. Os assuntos estão separados em abas no alto; dentro de cada aba, escolha a seção no menu ao lado. Cada seção tem o próprio guia no botão "?".',
  abas: {
    'aba-geral': 'Geral: mês financeiro, nome do ambiente, estorno e IOF do cartão, perfis (CPF/CNPJ), agenda no celular e guias.',
    'aba-cadastros': 'Cadastros: as listas dos formulários — categorias, centros de custo, grupos de contas, favorecidos, tipos de documento e atalhos.',
    'aba-regras': 'Regras: textos que fazem o Finup preencher categoria e grupo gerencial sozinho.',
    'aba-dados': 'Dados: backup, manutenção e limpeza dos dados deste aparelho.',
    'aba-usuarios': 'Usuários: quem pode entrar e o que cada pessoa pode fazer (só administradores).',
    'aba-perigo': 'Zona de perigo: apaga todos os dados, sem volta. Faça um backup antes.',
  },
}
