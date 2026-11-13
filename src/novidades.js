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
