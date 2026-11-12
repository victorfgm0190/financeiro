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
//   obrigatoria true quando a versão anterior não pode mais gravar (ex.: o banco mudou): o aviso de
//               atualização não oferece "Mais tarde". `motivo` explica, em linguagem simples.
// O build publica esta lista em /versao.json (vite.config.js): a versão aberta compara com a nova.
export const NOVIDADES = [
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
