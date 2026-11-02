// PERGUNTAS FREQUENTES da Central de Ajuda — dúvidas de quem está começando, com resposta curta e o
// link para a seção da ajuda (#ajuda/<tela>/<chave>). Linguagem simples, exemplos fictícios, igual
// para todos os clientes. `tela`: id de AJUDA_TELAS; `chave` (opcional): o item dentro da tela.
// `mostrar(ctx)` (opcional): só com o módulo/tela ativo (mesmo contexto da ajuda).

export const PERGUNTAS_FREQUENTES = [
  {
    id: 'lancamento-x-agendamento',
    pergunta: 'Qual a diferença entre lançamento e agendamento?',
    resposta: 'Lançamento é o que já aconteceu (o dinheiro já entrou ou saiu). Agendamento é o que vai acontecer: uma conta a pagar ou a receber. Na data, você confirma o agendamento e ele vira um lançamento.',
    tela: 'schedule',
  },
  {
    id: 'saldo-principal',
    pergunta: 'O que é o Saldo Principal?',
    resposta: 'É o dinheiro disponível do dia a dia: a soma das contas marcadas com "Somar no Saldo Principal". No Painel, clique nele para ver como o valor foi calculado.',
    tela: 'dashboard',
  },
  {
    id: 'conta-sumiu',
    pergunta: 'Criei uma conta e ela não aparece. Por quê?',
    resposta: 'Provavelmente ela está "Sem vínculo" (sem perfil) e há um perfil selecionado no topo. Escolha "Tudo" no topo para vê-la, ou edite a conta e escolha o perfil dela. Conta sem grupo fica na seção "Sem Grupo", no fim da página de Contas.',
    tela: 'accounts',
  },
  {
    id: 'perfil',
    pergunta: 'Para que serve o perfil (CPF/CNPJ)?',
    resposta: 'O perfil é a pessoa ou a empresa dona do dinheiro. Com cada conta ligada a um perfil, você vê os números de cada um separados, ou de todos juntos no filtro "Tudo".',
    tela: 'settings:perfis',
  },
  {
    id: 'fatura-cartao',
    pergunta: 'Como funciona a fatura do cartão?',
    resposta: 'Cada compra cai na fatura pelo dia de fechamento do cartão: comprou antes do fechamento, entra na fatura que vence neste mês; depois, na do mês seguinte. Na tela Cartão de Crédito você vê cada fatura e registra o pagamento. Ele aparece como “Pagamento de cartão” e não conta como despesa, porque as compras já contaram quando entraram no cartão.',
    tela: 'credit',
  },
  {
    id: 'compra-parcelada',
    pergunta: 'Como lanço uma compra parcelada?',
    resposta: 'No cartão: faça o lançamento da compra e informe o número de parcelas — o Finup coloca cada parcela na fatura certa. Fora do cartão (boleto, carnê): crie um agendamento parcelado.',
    tela: 'transactions',
    mostrar: (c) => c.podeVer('transactions'),
  },
  {
    id: 'provisao',
    pergunta: 'O que é uma provisão?',
    resposta: 'É um gasto previsto que ainda não tem data ou valor exatos, como IPVA, material escolar ou um conserto. Ele aparece no Fluxo de Caixa para você se preparar, e vira despesa quando acontecer.',
    tela: 'schedule',
    chave: 'lancar-provisao',
  },
  {
    id: 'recorrente',
    pergunta: 'Como cadastro uma conta que se repete todo mês?',
    resposta: 'Crie um agendamento com a frequência "Mensal". Exemplo: aluguel de R$ 1.500,00 todo dia 10. Ele aparece no Fluxo de Caixa de todos os meses até a data final que você escolher.',
    tela: 'schedule',
    chave: 'novo',
  },
  {
    id: 'desfazer-importacao',
    pergunta: 'Importei um arquivo errado. Como desfaço?',
    resposta: 'Em Importar lançamentos, cada importação aparece na lista com o botão para desfazer. Na Importação de fatura do cartão, use "Estornar" no histórico de importações.',
    tela: 'importar-lancamentos',
    mostrar: (c) => c.podeVer('importar-lancamentos') || c.podeVer('import'),
  },
  {
    id: 'fluxo-de-caixa',
    pergunta: 'Para que serve o Fluxo de Caixa?',
    resposta: 'Ele mostra como o seu saldo vai ficar nos próximos dias e meses, somando o que já aconteceu com o que está agendado. Se o saldo ficar negativo em alguma data, dá tempo de se planejar.',
    tela: 'cashflow',
  },
  {
    id: 'conta-central',
    pergunta: 'O que é a Conta central?',
    resposta: 'É a conta principal de cada perfil, usada nos pagamentos automáticos, como a fatura do cartão. Cada perfil tem a sua. Defina em Contas, editando a conta.',
    tela: 'accounts',
  },
  {
    id: 'conta-favorita',
    pergunta: 'O que é a Conta favorita?',
    resposta: 'É a conta que já vem escolhida quando você faz um lançamento, para economizar cliques. Pode haver uma por perfil.',
    tela: 'accounts',
  },
  {
    id: 'importar-fatura',
    pergunta: 'Como trago a fatura do cartão do site do banco?',
    resposta: 'Baixe o arquivo da fatura no site do banco (Excel, CSV ou OFX) e use "Importar Fatura". O Finup mostra o que é novo, o que já está lançado e o que precisa da sua decisão antes de gravar.',
    tela: 'import',
    mostrar: (c) => c.podeVer('import'),
  },
  {
    id: 'dividir-categorias',
    pergunta: 'Uma compra teve coisas de categorias diferentes. Como separo?',
    resposta: 'No lançamento, use "Dividir em categorias" e informe quanto foi de cada uma. Exemplo: R$ 250,00 no posto, sendo R$ 200,00 de combustível e R$ 50,00 de conveniência.',
    tela: 'transactions',
    mostrar: (c) => c.podeVer('transactions'),
  },
  {
    id: 'assistente',
    pergunta: 'O Assistente grava as coisas sozinho?',
    resposta: 'Não. Ele só prepara a prévia — você confere, muda o que quiser e salva. E ele nunca exclui nada.',
    tela: 'assistente',
    mostrar: (c) => c.iaAtiva,
  },
  {
    id: 'reservas',
    pergunta: 'Como separo dinheiro para um objetivo?',
    resposta: 'Use as Reservas: crie um objetivo (por exemplo, viagem ou emergência) e acompanhe quanto já guardou e quanto saiu dele.',
    tela: 'reservas',
    mostrar: (c) => c.podeVer('reservas'),
  },
  {
    id: 'mes-financeiro',
    pergunta: 'Meu mês começa no dia do salário. Dá para ajustar?',
    resposta: 'Sim. Em Configurações › Geral › Período financeiro, escolha o dia em que o seu mês começa. Os totais do mês passam a seguir esse período.',
    tela: 'settings:periodo',
  },
  {
    id: 'guias',
    pergunta: 'Os tours estão atrapalhando. Como desligo?',
    resposta: 'Em Configurações › Geral › Guias das telas, desligue "Guias do sistema". Esta Central de Ajuda continua disponível no menu, e de cada seção você pode iniciar o tour quando quiser.',
    tela: 'settings:guias',
  },
]

export const perguntasVisiveis = (ctx) => PERGUNTAS_FREQUENTES.filter(p => !p.mostrar || p.mostrar(ctx))
