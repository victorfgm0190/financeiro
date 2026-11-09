// Help de campo — modais ligados a lançamentos e cadastros soltos (Etapa 3, bloco 5a): rateio,
// edição em lote, reconciliar em lote, lançamento × agendamento, escopo da série, vincular, moeda
// estrangeira, duplicar, resgate, perfil rápido, renomear favorecido, aceitar saldo e início do mês.
// Nada específico de um cliente.

export const campos = {
  'rateio.categoria': {
    titulo: 'Categoria da parte',
    paraQueServe: 'Categoria de uma parte do lançamento dividido.',
    relacaoComTela: 'Cada parte entra nos relatórios na sua categoria; o lançamento continua um só na conta.',
    obrigatorio: true,
  },
  'rateio.valor': {
    titulo: 'Valor da parte',
    paraQueServe: 'Quanto do lançamento vai para esta categoria.',
    relacaoComTela: 'A soma das partes precisa fechar com o valor do lançamento. "Usar restante" preenche o que falta.',
    obrigatorio: true,
  },
  'rateio.descricao': {
    titulo: 'Descrição da parte',
    paraQueServe: 'Detalhe opcional da parte.',
    relacaoComTela: 'Aparece no detalhamento do lançamento.',
    obrigatorio: false,
  },
  'edicaoLote.data': {
    titulo: 'Data',
    paraQueServe: 'Nova data para todos os selecionados.',
    relacaoComTela: 'Vazia, a data de cada um não muda.',
    obrigatorio: false,
  },
  'edicaoLote.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Nova categoria para todos os selecionados.',
    relacaoComTela: 'Vazia, não muda. Não vale para transferências.',
    obrigatorio: false,
  },
  'edicaoLote.motivo': {
    titulo: 'Motivo da alteração',
    paraQueServe: 'Por que os lançamentos estão mudando.',
    relacaoComTela: 'Fica no histórico de alterações de cada lançamento.',
    obrigatorio: false,
  },
  'reconciliarLote.selecionar': {
    titulo: 'Lançamentos',
    paraQueServe: 'Marca os lançamentos que mudam de situação.',
    relacaoComTela: 'O total marcado aparece no rodapé.',
    obrigatorio: false,
  },
  'reconciliarLote.operacao': {
    titulo: 'Reconciliar ou não',
    paraQueServe: 'Marca os selecionados como reconciliados (conferidos com o extrato) ou desfaz.',
    relacaoComTela: 'Muda a lista: Reconciliar mostra os pendentes; Não reconciliar mostra os já conferidos.',
    obrigatorio: true,
  },
  'vinculoAgendamento.campos': {
    titulo: 'Campos diferentes',
    paraQueServe: 'Qual versão fica quando o lançamento e o agendamento divergem.',
    relacaoComTela: 'Usar os do agendamento troca os campos do lançamento; manter os deste deixa o lançamento como está.',
    obrigatorio: true,
  },
  'vinculoAgendamento.atualizarAgendamento': {
    titulo: 'Atualizar também o agendamento',
    paraQueServe: 'Leva os campos do lançamento para o agendamento.',
    relacaoComTela: 'Sim: as próximas ocorrências passam a usar os novos campos. Só neste: o agendamento não muda.',
    obrigatorio: true,
  },
  'vinculoAgendamento.atualizarFuturas': {
    titulo: 'Atualizar as próximas ocorrências',
    paraQueServe: 'Passa o valor deste lançamento para as próximas ocorrências.',
    relacaoComTela: 'Desmarcado, só esta ocorrência fica com o valor diferente.',
    obrigatorio: false,
  },
  'escopoSerie.escopo': {
    titulo: 'Onde aplicar',
    paraQueServe: 'Só nesta parcela ou nesta e nas próximas pendentes.',
    relacaoComTela: 'Parcelas já pagas e lançamentos já gerados nunca mudam.',
    obrigatorio: true,
  },
  'escopoSerie.motivo': {
    titulo: 'Motivo da alteração',
    paraQueServe: 'Por que a série está mudando.',
    relacaoComTela: 'Fica no histórico de alterações.',
    obrigatorio: false,
  },
  'vinculoLancamento.busca': {
    titulo: 'Buscar',
    paraQueServe: 'Procura outro agendamento ou parcela para vincular.',
    relacaoComTela: 'Sem busca, a lista mostra os parecidos (mesmo sentido, até 15 dias).',
    obrigatorio: false,
  },
  'vinculoLancamento.manter': {
    titulo: 'O que fica na ocorrência',
    paraQueServe: 'Valor e data do lançamento real ou os previstos.',
    relacaoComTela: 'A ocorrência fica baixada apontando este lançamento; nada novo é criado.',
    obrigatorio: true,
  },
  'vinculoLancamento.campos': {
    titulo: 'Campos a levar',
    paraQueServe: 'Na mescla com uma parcela, quais campos deste lançamento passam para ela.',
    relacaoComTela: 'A parcela fica e este lançamento avulso é removido.',
    obrigatorio: false,
  },
  'moedaEstrangeira.valor': {
    titulo: 'Valor em moeda estrangeira',
    paraQueServe: 'Valor da compra na moeda original.',
    relacaoComTela: '"Recalcular" refaz o valor em reais e o IOF com a cotação mostrada.',
    obrigatorio: false,
  },
  'duplicar.data': {
    titulo: 'Data da cópia',
    paraQueServe: 'Data do novo lançamento copiado.',
    relacaoComTela: 'A cópia leva os outros campos do original.',
    obrigatorio: true,
  },
  'resgate.data': {
    titulo: 'Data do resgate',
    paraQueServe: 'Quando o dinheiro sai da reserva para pagar esta despesa.',
    relacaoComTela: 'Cria o agendamento de resgate da conta da reserva para a conta principal nesta data.',
    obrigatorio: true,
  },
  'perfilRapido.tipo': {
    titulo: 'Tipo',
    paraQueServe: 'Pessoa física ou jurídica.',
    relacaoComTela: 'Muda os rótulos: Nome e CPF, ou Razão social e CNPJ.',
    obrigatorio: true,
  },
  'perfilRapido.nome': {
    titulo: 'Nome',
    paraQueServe: 'Nome da pessoa ou razão social da empresa dona das contas.',
    relacaoComTela: 'Aparece no filtro de perfil do topo da tela.',
    obrigatorio: true,
  },
  'perfilRapido.documento': {
    titulo: 'CPF ou CNPJ',
    paraQueServe: 'Documento do perfil, só os números.',
    relacaoComTela: 'Opcional; identifica o perfil nos relatórios.',
    obrigatorio: false,
  },
  'favorecidoRenomear.lancamentos': {
    titulo: 'Onde renomear',
    paraQueServe: 'Lançamentos e agendamentos que passam a usar o novo nome.',
    relacaoComTela: 'Só os marcados passam a usar o novo nome.',
    obrigatorio: false,
  },
  'aceitarSaldo.motivo': {
    titulo: 'Motivo',
    paraQueServe: 'Por que o saldo atual está sendo aceito como correto.',
    relacaoComTela: 'Fica registrado junto com o marco de saldo aceito.',
    obrigatorio: true,
  },
  'inicioMes.selecionar': {
    titulo: 'Transferências do início do mês',
    paraQueServe: 'Marca as transferências que serão lançadas agora.',
    relacaoComTela: 'Só as marcadas são lançadas ao confirmar.',
    obrigatorio: false,
  },
}

export const formularios = {}
