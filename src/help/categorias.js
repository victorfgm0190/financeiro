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
}

export const formularios = {}
