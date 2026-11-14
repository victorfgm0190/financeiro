// NOVIDADES DO FINUP — o "O que mudou nesta versão" (janela depois de atualizar, aviso de atualização
// e Ajuda → Novidades). A MAIS NOVA PRIMEIRO.
//
// REGRA: todo commit que muda algo VISÍVEL acrescenta (ou completa) uma entrada aqui, em linguagem
// simples, sem jargão e sem nada específico de um cliente. O relatório da entrega mostra o texto para
// revisão antes do "libera no vm".
//
// Campos:
//   id          'AAAA.MM.DD' ou 'AAAA.MM.DD-n' (n = 2, 3… para mais de uma versão no mesmo dia) — único
//   data        'AAAA-MM-DD'
//   titulo      uma linha
//   itens       1 ou mais frases curtas (as 3 primeiras aparecem no aviso de atualização)
//   publico     'todos' | 'admin' (só administradores veem)
//   recurso     (opcional) id de recurso contratado (src/lib/recursosCliente.js): só aparece para o
//               ambiente com o recurso liberado; tem "já vi" próprio (aparece se for liberado depois)
//   obrigatoria true quando a versão anterior não pode mais gravar (ex.: o banco mudou): o aviso de
//               atualização não oferece "Mais tarde". `motivo` explica, em linguagem simples.
// O build publica esta lista em /versao.json (vite.config.js): a versão aberta compara com a nova.
export const NOVIDADES = [
  {
    id: '2026.11.14-4',
    data: '2026-11-14',
    titulo: 'Cartão: parcelas cobradas no mês certo, na tela e nos Alertas',
    publico: 'admin',
    obrigatoria: false,
    itens: [
      'As parcelas de compras antigas passam a ser cobradas para a reserva gerencial quando a fatura delas entra no seu mês financeiro (pelo dia de início do mês que você configurou), e não antes.',
      'Na tela do cartão, essas parcelas aparecem numa faixa à parte, "prontas para a etapa A", com o botão "Executar agora". A faixa de atenção fica só para o que está realmente faltando.',
      'O menu Alertas segue a mesma regra: parcela que ainda não chegou ao seu mês não vira alerta, e alertas antigos desse tipo são encerrados na próxima verificação. Um mesmo lançamento não é contado duas vezes na faixa da fatura.',
    ],
  },
  {
    id: '2026.11.14-3',
    data: '2026-11-14',
    titulo: 'Relatórios com nomes novos e em seções; fatura importada vale o valor do banco',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Na importação da fatura do cartão, quando uma compra do arquivo é reconhecida como uma parcela já lançada com centavos de diferença, a parcela passa a ter o valor que o banco cobrou. A prévia mostra "valor ajustado: de → para" e quantas foram ajustadas. O resgate da reserva daquela parcela acompanha o novo valor, e a mudança fica no histórico. Reimportar a fatura corrige as que já estavam gravadas.',
      'Ao abrir o Extrato da Fatura ou o Relatório da Fatura pelo menu (ou ao trocar de cartão), e ao entrar na tela do cartão, o Finup mostra a fatura que ainda falta pagar; se não houver, a fatura aberta. No seletor, as faturas aparecem como "a pagar", "aberta" e "futura".',
      'O menu Relatórios agora é dividido em seções — Resultado, Contas e Caixa, Cartão de Crédito, Reservas, Patrimônio e Aluguéis — e os relatórios ganharam nomes mais claros: Resultado por Categoria, Movimentação por Favorecido, Extrato e Fluxo de Caixa por Conta, Patrimônio — Pagamentos por Mês, Aluguéis — Rendimentos e Repasses. As médias viraram "Média Mensal (últimos 6 meses)" e a pizza e o ranking ficaram juntos em "Despesas do Mês por Categoria".',
      'O extrato do Fluxo Futuro das Reservas passa a se chamar "Fluxo de Caixa da Reserva", igual ao do menu. Na tela do cartão, o botão virou "Relatório Gerencial da Fatura", e a aba de movimentos por data agora se chama "Movimentos do Cartão por Data", mostra só o perfil escolhido e exporta para Excel e CSV.',
      'Novas exportações: o extrato de qualquer conta (não só das gerenciais) sai em Excel e CSV, com o saldo acumulado. Os CSVs seguem o mesmo padrão em todos os relatórios (ponto e vírgula, vírgula nos centavos) e têm o mesmo nome do Excel. Se algo der errado, aparece uma mensagem.',
      'Para quem não usa o controle gerencial, somem a aba "Gerencial" de Agendamentos, o botão "Conciliar Gerenciais" e o selo "Gerencial" do extrato da conta. No Relatório da Fatura, os gastos por categoria passam a dividir os lançamentos rateados entre as categorias.',
      'Na tela do cartão, um só botão, Verificar e corrigir, mostra o que está diferente e só corrige o que você confirmar.',
    ],
  },
  {
    id: '2026.11.14-2',
    data: '2026-11-14',
    titulo: 'Cartão: Extrato da Fatura e Relatório separados; novos relatórios no menu',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Na tela do cartão, o botão "Extrato da Fatura" mostra a fatura como o banco mostra: data, descrição, parcela e valor, com os estornos e o mesmo total da Fatura Selecionada. O pagamento da fatura anterior e as compras ainda só agendadas aparecem à parte, fora do total. Dá para passar de uma fatura para outra e baixar em Excel ou CSV.',
      'O botão "Relatório Gerencial" abre na fatura que está na tela e mostra todos os lançamentos, com um card por grupo (valor e %), "Sem grupo" e Estornos. Clique num card para ver só aquele grupo. O antigo Extrato Gerencial agora é a aba "Extrato gerencial por data" dentro dele. Sem o controle gerencial, o botão se chama "Relatório da Fatura" e mostra o total e as categorias.',
      'A exportação do relatório da fatura foi refeita: o Excel traz a fatura inteira, com o grupo de cada lançamento, e uma aba de resumo; também dá para baixar em CSV. Se algo der errado ao exportar, aparece uma mensagem.',
      'Cartão sem compras lançadas e com compra agendada: a fatura não aparece mais como "Quitada totalmente" ao mesmo tempo que "Falta pagar". As compras agendadas contam no valor a pagar desta fatura e na situação dela; a Dívida Total mostra só o que já foi lançado, com os agendados indicados à parte.',
      'No menu Relatórios: novos cards "Extrato da Fatura", "Relatório Gerencial da Fatura" e "Fluxo de Caixa da Reserva" (entradas, saídas e saldo de cada função de reserva no período, com a opção "Todas as funções"). Os valores são os mesmos de Reservas › Fluxo Futuro.',
    ],
  },
  {
    id: '2026.11.14',
    data: '2026-11-14',
    titulo: 'Extrato da reserva no Fluxo Futuro',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Em Reservas › Fluxo Futuro, toque no nome de uma função (ex.: IPVA) para ver o extrato dela: o saldo inicial, cada entrada e saída em ordem de data, com o saldo depois de cada uma, e um resumo no fim de cada mês.',
      'Toque em "TOTAL GERAL" para ver o extrato de todas as funções juntas, com o nome da função em cada linha.',
      'O extrato junta o que já aconteceu e o que está agendado; o que ainda vai acontecer aparece marcado como "Previsto". Se o saldo ficar negativo, a linha fica destacada e o topo avisa a data.',
      'Dá para escolher o período (ou usar "Este mês", "Próximos 3 meses" e "Próximos 12 meses") e baixar em Excel. O saldo de cada fim de mês é o mesmo da tabela do Fluxo Futuro.',
      'Para a lista não ficar cheia de rendimentos do dia a dia, a opção "Agrupar rendimentos" (ligada no começo) junta os rendimentos seguidos numa linha só, como "Rendimentos de 16/10 a 29/10". Se houver um depósito ou resgate no meio, eles ficam em linhas separadas, antes e depois dele. No extrato de todas as funções, cada função tem a sua linha. Desligue a opção para ver dia a dia; os saldos e os totais não mudam, e o Excel sai do jeito que está na tela.',
    ],
  },
  {
    id: '2026.11.13-4',
    data: '2026-11-13',
    titulo: "Nova marca-d'água do Finup",
    publico: 'todos',
    obrigatoria: false,
    itens: [
      "A marca-d'água do topo da tela, do Início no celular e da tela de entrada ganhou um novo símbolo: uma coroa com cruz dentro de um círculo. Na tela de entrada, onde ela é maior, o círculo traz também doze estrelas. A frase continua a mesma.",
      'No topo da tela do computador, a frase fica ao lado do símbolo, numa linha só e com letra maior, para dar para ler. Em telas mais estreitas aparece só o símbolo.',
      'As cores dela foram ajustadas a cada tema: continua discreta, sem atrapalhar a leitura. No tema escuro do computador ela ficou mais visível, como no claro.',
    ],
  },
  {
    id: '2026.11.13-3',
    data: '2026-11-13',
    titulo: 'Tema escuro mais suave no computador',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'No computador, o tema escuro ficou mais confortável para a vista: fundo cinza-escuro em vez de preto, cartões um tom acima, bordas discretas e letras um pouco menos brilhantes.',
      'As cores de receita, despesa, reserva e avisos continuam as mesmas, só um pouco mais suaves.',
      'Com o Finup instalado no computador, a barra de título também acompanha o novo fundo no tema escuro.',
      'O tema claro e o tema escuro do celular não mudaram.',
    ],
  },
  {
    id: '2026.11.13-2',
    data: '2026-11-13',
    titulo: 'Parcelas marcadas como pagas sem lançamento',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Nova revisão em Agendamentos › “Baixas sem lançamento”: lista cada parcela marcada como paga sem nenhum lançamento, mostra o lançamento que parece ser o pagamento e deixa vincular, desfazer a baixa ou manter assim (pago fora do Finup).',
      'Na lista de Agendamentos, um sinal de alerta ao lado do “2/5” avisa quando a série tem parcela paga sem lançamento.',
      'Em “Ver ocorrências registradas”, “Pago em” mostra só a data de um pagamento de verdade. A parcela sem lançamento aparece em destaque, com “Vincular lançamento” e “Desfazer baixa”. O rodapé mostra o previsto da série inteira, o total pago e as baixas sem lançamento.',
      'Ao excluir um lançamento que pagou uma parcela de agendamento, o Finup pergunta se a parcela volta a ficar a pagar (padrão) ou continua paga sem lançamento.',
      'Ao editar um agendamento, a próxima data não pode cair antes de uma parcela já paga, e a Data de Início não pode passar de uma parcela paga com lançamento. Se a Data de Início passar de uma parcela marcada como paga sem lançamento, o Finup pergunta se quer desfazer essa baixa.',
      'Empurrar a próxima data para frente agora pergunta se as parcelas que ficam para trás viram puladas (padrão) ou se a alteração é desfeita: nenhuma parcela some sem registro.',
      'O histórico de alterações do agendamento passa a registrar também a Data de Início, a frequência, o número de parcelas e as baixas desfeitas e as parcelas puladas.',
    ],
  },
  {
    id: '2026.11.13',
    data: '2026-11-13',
    titulo: 'Agendamento com Contas Anuais: o resgate é agendado junto',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Num agendamento de despesa em conta corrente com classificação que gera resgate (como Contas Anuais), o novo campo “Resgatar de” diz de qual função da reserva sai o dinheiro. Com uma opção só, ela já vem escolhida, e “+ Nova função” cria uma ali mesmo.',
      'Ao salvar, o Finup agenda também o resgate de cada ocorrência, com a mesma data e o mesmo valor: ele já aparece no Fluxo de Caixa e na reserva como previsto.',
      'Pular, mudar data ou valor e excluir a despesa valem para o resgate. O resgate fica agendado na mesma data; pague-o (ou vincule a um resgate já feito) quando fizer a transferência. Pagar ou estornar a despesa não mexe no resgate. O que já foi pago não muda.',
      'Se já houver uma provisão aberta da mesma função no mesmo mês, o formulário avisa, para a despesa não contar duas vezes.',
      'A lista “Resgatar de” vem em ordem alfabética e aceita digitar para filtrar.',
      'Na lista de Agendamentos, o resgate mostra “Acompanha: <despesa>” (toque para abrir a despesa) e vem antes da despesa no mesmo dia, também no Fluxo de Caixa, no extrato e na reserva.',
      'No próprio resgate dá para mudar a data de uma ocorrência, excluir (só uma ou o resgate inteiro) e vincular a um resgate que você já fez. Mudar a data, pular ou excluir a despesa continua valendo para o resgate.',
      'Pagou a despesa por um valor diferente do resgate? O Finup pergunta: com o resgate já feito, oferece um resgate complementar (pagou mais) ou devolver a diferença para a reserva (pagou menos); com o resgate ainda pendente, oferece ajustar o valor só dessa ocorrência.',
      'Fechar um agendamento, lançamento ou transferência com algo não salvo (X, Esc, tocar fora ou Cancelar) agora pergunta “Descartar as alterações?”.',
    ],
  },
  {
    id: '2026.11.12-6',
    data: '2026-11-12',
    titulo: 'Atualizar o Finup sem perder o que está fazendo',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Se sair uma versão nova enquanto você está no meio de uma importação, de uma conciliação ou de um formulário ainda não salvo, o aviso diz o que seria perdido e deixa para atualizar depois.',
      'Quando você terminar (Confirmar ou Cancelar), o aviso volta: “Pronto! Agora você pode atualizar o Finup.” Depois de atualizar, você volta para a mesma tela.',
      'Fechar ou recarregar a página com algo não salvo agora pede confirmação.',
    ],
  },
  {
    id: '2026.11.12-5',
    data: '2026-11-12',
    titulo: 'Importar Fatura: sugestões do Assistente',
    publico: 'todos',
    obrigatoria: false,
    // Recurso contratado: só aparece para o ambiente com o recurso liberado (src/lib/novidades.js).
    recurso: 'ia_sugestoes_importacao',
    itens: [
      'Ligado em Configurações › Geral › Assistente, o Assistente sugere a resposta dos cartões “É este?” e a categoria, o grupo e o favorecido das compras novas que as suas regras não classificaram.',
      'Cada sugestão tem Aceitar e Ignorar. Nos Novos, “Aceitar N sugestões” leva só as de confiança alta e média; as de confiança baixa ficam para você conferir uma a uma.',
      'Nada é gravado sem o Confirmar.',
    ],
  },
  {
    id: '2026.11.12-4',
    data: '2026-11-12',
    titulo: 'Importar Fatura: a categoria só vira regra quando você confirma',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Na Importar Fatura, a categoria escolhida só vira regra para as próximas faturas quando a importação é confirmada; cancelar não ensina nada.',
    ],
  },
  {
    id: '2026.11.12-3',
    data: '2026-11-12',
    titulo: 'Importar Fatura: conferência mais simples',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'No topo, três números: quantos são novos, quantos já estão no Finup (os conciliados antes e os juntados agora) e quantos pedem a sua decisão.',
      'Cada dúvida aparece num cartão “É este?”, com a linha da fatura e o lançamento do Finup lado a lado e as diferenças destacadas. Embaixo de cada botão, o que vai acontecer.',
      'Cobrança de assinatura com valor diferente do agendado (por exemplo, reajuste) agora é reconhecida e vira pergunta: confirmando, o agendamento é baixado pelo valor do cartão.',
      'O resto fica recolhido em blocos: Novos, Juntados agora (ficam conciliados), Já conciliados antes, Não entram e Aguardando o banco.',
      'Estornos de centavos e compras de valor parecido do mesmo dia são juntados sempre com a loja certa.',
      'No computador, dá para responder pelo teclado: Alt+S (sim), Alt+O (não, é outro), Alt+. e Alt+, (próxima e anterior). As teclas podem ser trocadas em Configurações › Atalhos.',
    ],
  },
  {
    id: '2026.11.12-2',
    data: '2026-11-12',
    titulo: 'Parcelas do cartão na data da compra',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Compras parceladas no cartão lançadas ou importadas a partir de agora: cada parcela fica no mesmo dia da compra, nos meses seguintes (compra em 12/11 em 3x → 12/11, 12/12 e 12/01). Se o mês não tiver esse dia, vai para o último dia do mês.',
      'O lançamento parcelado mostra a data da compra original, por exemplo “Parcela 2 de 3 · compra em 12/11”.',
      'As parcelas que já existiam continuam com a data que têm.',
    ],
  },
  {
    id: '2026.11.12',
    data: '2026-11-12',
    titulo: 'Importar Fatura: menos perguntas e só as que fazem sentido',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'O Finup só pergunta “é este?” quando o valor é o mesmo. Compra com valor diferente entra como nova.',
      'Parcela já prevista no Finup com poucos centavos de diferença é ajustada sozinha para o valor da fatura, e a diferença aparece na conferência.',
      'Compra igual lançada em outra fatura ainda não conciliada vira pergunta: se for a mesma, ela passa para a fatura certa.',
      'Compra em dólar ou IOF estimados mostram “estimado × real”; confirmando, fica o valor real.',
      'Na Conciliar Fatura, só dá para excluir compra à vista, não conciliada, de fatura já fechada. Parcelas previstas de fatura aberta nunca são excluídas, mesmo em arquivo sem cabeçalho.',
      'Lançamentos já conciliados só são listados como diferentes quando o valor ou a data do cartão mudam; o nome que você escreveu não conta.',
    ],
  },
  {
    id: '2026.11.11-3',
    data: '2026-11-11',
    titulo: 'Atualizações avisadas e “O que mudou”',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Quando houver uma versão nova, o Finup pergunta se você quer atualizar agora ou mais tarde. Nada atualiza sozinho no meio do uso.',
      'Antes de atualizar, o Finup envia todas as suas alterações. Sem internet, ele espera e explica.',
      'Depois de atualizar, esta janela mostra o que mudou. O histórico completo fica em Ajuda → Novidades.',
    ],
  },
  {
    id: '2026.11.11-2',
    data: '2026-11-11',
    titulo: 'Use o Finup como aplicativo no computador',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'No Microsoft Edge e no Google Chrome, o Finup pode ser instalado no computador: abre na própria janela, com ícone na barra de tarefas, e abre mais rápido.',
      'Em navegadores que não instalam o Finup, um aviso explica o que fica limitado e indica o Edge ou o Chrome.',
      'Configurações → Geral → Usar como aplicativo mostra a situação deste computador.',
    ],
  },
  {
    id: '2026.11.11',
    data: '2026-11-11',
    titulo: 'Importar Fatura mais inteligente',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Ao importar de novo a mesma fatura, as compras já conciliadas são reconhecidas e não são duplicadas nem alteradas.',
      'O Finup só pergunta quando há dúvida de verdade (por exemplo, centavos diferentes ou mais de uma compra parecida).',
      'Parcelas com o número grudado no nome da loja passam a ser reconhecidas.',
    ],
  },
  {
    id: '2026.11.10-2',
    data: '2026-11-10',
    titulo: 'Backup completo e backup ao sair',
    publico: 'admin',
    obrigatoria: false,
    itens: [
      'O backup agora leva todos os dados do ambiente, e a restauração confere tudo antes de gravar: ou volta tudo, ou nada muda.',
      'No computador, o Finup pode fazer um backup ao sair, numa pasta que você escolhe em Configurações → Backup.',
    ],
  },
  {
    id: '2026.11.10',
    data: '2026-11-10',
    titulo: 'Transferências entre perfis',
    publico: 'todos',
    obrigatoria: false,
    itens: [
      'Cada lado da transferência entre perfis tem a sua categoria: uma no perfil de origem e outra no perfil de destino.',
      'Transferência nova precisa da conta destino, e a lista de destino mostra também as contas dos outros perfis.',
    ],
  },
]
