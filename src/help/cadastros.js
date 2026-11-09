// Help de campo — CADASTROS (Configurações): Centros de custo e Grupos de contas —
// src/components/Settings/SettingsPanel.jsx, data-help-form="centroCusto" e "grupoConta".
// Nada específico de um cliente.

export const campos = {
  'centroCusto.nome': {
    titulo: 'Centro de custo',
    paraQueServe: 'Rótulo livre para separar lançamentos por área ou finalidade.',
    relacaoComTela: 'Depois de adicionado, aparece no campo Centro de custo dos lançamentos e serve de filtro nos relatórios.',
    obrigatorio: true,
    exemplo: 'Obra',
  },
  'grupoConta.tipo': {
    titulo: 'Tipo do grupo',
    paraQueServe: 'Financeiro reúne contas de movimento; Patrimonial reúne bens, dívidas e empréstimos.',
    relacaoComTela: 'As contas de um grupo patrimonial entram no Patrimônio como bem, dívida ou empréstimo conforme o grupo. O selo Fin./Pat. mostra o tipo na lista.',
    obrigatorio: true,
  },
  'grupoConta.nome': {
    titulo: 'Nome do grupo',
    paraQueServe: 'Nome do grupo de contas, mostrado na lista de Contas e nos seletores.',
    relacaoComTela: 'No cadastro da conta, é o nome escolhido em Grupo. Renomear não muda as contas do grupo.',
    obrigatorio: true,
    exemplo: 'Bancos',
  },
  'grupoConta.ancora': {
    titulo: 'Conta âncora',
    paraQueServe: 'Conta do grupo que absorve a diferença no ajuste de saldo por grupo.',
    relacaoComTela: 'No ajuste por grupo, o saldo inicial da âncora é corrigido para o total bater com o informado. Sem âncora, o ajuste só mostra a diferença.',
    obrigatorio: false,
  },
  'grupoConta.inibir': {
    titulo: 'Inibir grupo',
    paraQueServe: 'Oculta o grupo do app sem excluí-lo.',
    relacaoComTela: 'O grupo vai para "Grupos inibidos" em Contas e some dos seletores. O olho reativa. As contas e os lançamentos não mudam.',
    obrigatorio: false,
  },
}

export const formularios = {}
