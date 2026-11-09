// Help de campo — CATEGORIAS (Configurações › Categorias): novo grupo e nova categoria —
// src/components/Settings/SettingsPanel.jsx, data-help-form="categoriaGrupo" e "categoria".
// Nada específico de um cliente.

export const campos = {
  'categoria.novoGrupo': {
    titulo: 'Novo grupo',
    paraQueServe: 'Nome de um grupo de categorias a criar.',
    relacaoComTela: 'O grupo passa a aparecer na lista e na sugestão do campo Grupo da nova categoria. Grupo sem categoria fica vazio na lista.',
    obrigatorio: false,
    exemplo: 'Moradia',
  },
  'categoria.nome': {
    titulo: 'Nome da categoria',
    paraQueServe: 'Nome que aparece nos lançamentos, agendamentos, relatórios e orçamento.',
    relacaoComTela: 'Sem nome, o Adicionar não cria a categoria.',
    obrigatorio: true,
    exemplo: 'Aluguel',
  },
  'categoria.grupo': {
    titulo: 'Grupo',
    paraQueServe: 'Agrupa categorias nos relatórios e no orçamento. Escolha um grupo existente ou digite um novo.',
    relacaoComTela: 'Obrigatório: um nome novo cria o grupo junto com a categoria. Os seletores de categoria mostram as categorias separadas por grupo.',
    obrigatorio: true,
  },
  'categoria.tipo': {
    titulo: 'Tipo',
    paraQueServe: 'Define se a categoria aparece em despesas, em receitas ou nas duas.',
    relacaoComTela: 'Os formulários só oferecem a categoria no tipo de movimento compatível (Ambos aparece nos dois).',
    obrigatorio: true,
  },
  'categoria.emoji': {
    titulo: 'Emoji',
    paraQueServe: 'Ícone curto mostrado antes do nome da categoria.',
    relacaoComTela: 'Só aparência, nas listas e seletores de categoria.',
    obrigatorio: false,
    exemplo: '🏠',
  },
  'categoria.perfis': {
    titulo: 'Perfis',
    paraQueServe: 'Perfis em que a categoria pode ser usada. Sem seleção, vale para todos.',
    relacaoComTela: 'Os seletores de categoria de um lançamento mostram só as categorias do perfil da conta; usar uma de outro perfil gera aviso.',
    obrigatorio: false,
  },

  // ── Lista de categorias (controles de cada linha, sem rótulo: ⓘ na legenda acima da lista) ──────
  'categoriaLista.filtroPerfil': {
    titulo: 'Mostrar categorias de',
    paraQueServe: 'Filtra a lista para as categorias de um perfil.',
    relacaoComTela: 'Só muda a exibição. Para reordenar grupos e categorias, volte para "Todos os perfis".',
    obrigatorio: false,
  },
  'categoriaLista.perfis': {
    titulo: 'Perfis da categoria',
    paraQueServe: 'Perfis em que a categoria aparece nas listas de escolha. Nenhum marcado vale para todos.',
    relacaoComTela: 'Grava na hora. Os seletores de categoria de um lançamento mostram só as do perfil da conta.',
    obrigatorio: false,
  },
  'categoriaLista.grupo': {
    titulo: 'Grupo da categoria',
    paraQueServe: 'Move a categoria para outro grupo.',
    relacaoComTela: 'Grava na hora e só muda o agrupamento nos relatórios, no orçamento e nos seletores. Nenhum lançamento ou saldo é alterado.',
    obrigatorio: false,
  },
  'categoriaLista.grupoGerencial': {
    titulo: 'Grupo gerencial padrão',
    paraQueServe: 'Grupo gerencial sugerido ao lançar ou importar nesta categoria.',
    relacaoComTela: 'Pré-seleciona a classificação gerencial do lançamento. Uma regra de classificação por descrição tem prioridade. Não muda lançamentos já gravados.',
    obrigatorio: false,
  },
  'categoriaLista.investimento': {
    titulo: 'Conta de investimento',
    paraQueServe: 'Conta de aplicação que recebe um aporte automático a cada despesa nesta categoria.',
    relacaoComTela: 'Ao salvar a despesa, o app cria a entrada "[aporte auto]" na conta escolhida, no valor da parte desta categoria. Só para categorias de despesa.',
    obrigatorio: false,
  },
  'categoriaLista.espelho': {
    titulo: 'Espelho',
    paraQueServe: 'Liga o lançamento espelho: cada movimento nesta categoria gera o oposto numa conta vinculada.',
    relacaoComTela: 'Ligado, mostra a conta do espelho. Despesa vira receita "Empréstimo" na conta; receita vira despesa "Recebimento empréstimo". Sem conta, nada é gerado.',
    obrigatorio: false,
  },
  'categoriaLista.contaEspelho': {
    titulo: 'Conta do espelho',
    paraQueServe: 'Conta onde o lançamento espelho é criado, normalmente uma conta de empréstimos a terceiros.',
    relacaoComTela: 'Só aparece com o Espelho ligado. Vale para os próximos lançamentos; os já gravados não mudam.',
    obrigatorio: false,
  },
  'categoriaLista.renomearGrupo': {
    titulo: 'Renomear grupo',
    paraQueServe: 'Novo nome do grupo de categorias.',
    relacaoComTela: 'Enter grava e Esc cancela. Todas as categorias do grupo passam a mostrar o nome novo.',
    obrigatorio: true,
  },
}

export const formularios = {}
