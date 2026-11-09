// Help de campo — FAVORECIDOS: mesclar nomes (Configurações › Favorecidos) e renomear favorecido
// (src/components/Settings/FavorecidosPanel.jsx e src/components/shared/RenomearFavorecidoModal.jsx).
// Nada específico de um cliente.

export const campos = {
  'favorecido.novoNome': {
    titulo: 'Novo nome',
    paraQueServe: 'Nome que fica para todos os favorecidos selecionados. Os lançamentos e agendamentos passam a usá-lo.',
    relacaoComTela: 'A prévia mostra quantos lançamentos, agendamentos e regras passam a ter este favorecido. A descrição dos lançamentos não muda.',
    obrigatorio: true,
  },
  'favorecido.aliasImportacao': {
    titulo: 'Usar nas próximas importações',
    paraQueServe: 'Guarda os nomes antigos como apelidos do novo nome.',
    relacaoComTela: 'Nas importações seguintes, um favorecido com um dos nomes antigos já entra com o nome novo.',
    obrigatorio: false,
  },
  'favorecido.aplicarEm': {
    titulo: 'Aplicar em',
    paraQueServe: 'Escolhe quais registros mudam: só o nome exato ou todos que começam com a mesma base.',
    relacaoComTela: '"Começam com" pega também as variações com sufixo de parcela (ex.: "Loja 2/10"). A prévia abaixo é refeita na hora.',
    obrigatorio: false,
  },
  'favorecido.previa': {
    titulo: 'Prévia',
    paraQueServe: 'Lista os lançamentos, agendamentos e regras que vão mudar, cada um com sua marcação.',
    relacaoComTela: 'Só os marcados recebem o novo nome. Desmarque o que não deve mudar.',
    obrigatorio: false,
  },

  // ── Lista de favorecidos (Configurações › Favorecidos) ─────────────────────────────────────────
  'favorecido.busca': {
    titulo: 'Buscar favorecido',
    paraQueServe: 'Filtra a lista pelo nome do favorecido.',
    relacaoComTela: 'Só muda a exibição. A lista mostra os primeiros nomes; use a busca para chegar aos demais.',
    obrigatorio: false,
  },
  'favorecido.selecionar': {
    titulo: 'Selecionar favorecidos',
    paraQueServe: 'Marque dois ou mais nomes para juntá-los num só.',
    relacaoComTela: 'Com 2 ou mais marcados, aparece "Mesclar" com o novo nome e a prévia. "Renomear" na linha muda só aquele nome.',
    obrigatorio: false,
  },
  'favorecido.sincronizar': {
    titulo: 'Sincronizar com lançamentos',
    paraQueServe: 'Inclui no cadastro os nomes usados em lançamentos, agendamentos e regras que ainda não estão nele.',
    relacaoComTela: 'Só os marcados entram no cadastro ao clicar em "Incluir". Nenhum lançamento é alterado.',
    obrigatorio: false,
  },
}

export const formularios = {}
