// Help de campo — FLUXO DE CAIXA e PROVISÃO —
// src/components/CashFlow/EfetivarModal.jsx (efetivarProvisorio), CashFlow/MudarDataModal.jsx (mudarData),
// Schedule/ProvisaoForm.jsx (provisao) e Reports/ProvisorioForm.jsx (provisorio).
// Nada específico de um cliente.

export const campos = {
  // ── Efetivar provisório ────────────────────────────────────────────────────────────────────
  'efetivarProvisorio.modo': {
    titulo: 'Como efetivar',
    paraQueServe: 'Escolhe em que o provisório se transforma: agendamento ou lançamento realizado.',
    relacaoComTela: 'Agendamento: vira um agendamento "Uma vez" (a pagar ou a receber) na data do provisório, e o saldo da conta só muda quando ele for registrado. Lançamento realizado: grava o lançamento na conta agora e abre o campo Data do lançamento. Nos dois casos o provisório deixa de ser simulação e é substituído pelo item criado.',
    obrigatorio: true,
  },
  'efetivarProvisorio.data': {
    titulo: 'Data do lançamento',
    paraQueServe: 'Data em que o lançamento realizado entra na conta.',
    relacaoComTela: 'Vem com a data do provisório. Hoje ou antes, o saldo da conta muda na hora; data futura, entra como lançamento futuro.',
    obrigatorio: true,
  },
  'efetivarProvisorio.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Categoria do agendamento ou do lançamento criado.',
    relacaoComTela: 'Vem com a categoria do provisório. A lista segue o tipo (entrada mostra receitas; saída, despesas) e o perfil da conta. Em branco, o item fica sem categoria nos relatórios.',
    obrigatorio: false,
  },

  // ── Mudar data (Fluxo de Caixa Futuro) ─────────────────────────────────────────────────────
  'mudarData.nova': {
    titulo: 'Nova data',
    paraQueServe: 'Data para onde o evento vai no fluxo.',
    relacaoComTela: 'A data antiga aparece riscada ao lado. O saldo projetado de cada dia é recalculado com a nova data.',
    obrigatorio: true,
  },
  'mudarData.destino': {
    titulo: 'Simular ou gravar',
    paraQueServe: 'Diz se a nova data é só uma simulação ou se muda o agendamento de verdade.',
    relacaoComTela: 'Só simular: de agendamento, fica como data provisória, vista aqui e no relatório Fluxo de Caixa, sem mexer no agendamento; de envelope ou lançamento, vale só nesta tela e volta ao recarregar. Gravar no agendamento: altera o agendamento real (fatura e gerencial não podem).',
    obrigatorio: true,
  },
  'mudarData.escopo': {
    titulo: 'Quais ocorrências',
    paraQueServe: 'No agendamento recorrente, escolhe se muda só esta ocorrência ou a série.',
    relacaoComTela: 'Só esta ocorrência: vira uma exceção e a série continua igual. Esta e as próximas: a série passa a contar a partir da nova data; os avisos mostram o que muda.',
    obrigatorio: true,
  },

  // ── Provisão de despesa ────────────────────────────────────────────────────────────────────
  'provisao.perfil': {
    titulo: 'Perfil',
    paraQueServe: 'Perfil dono da provisão, quando nenhuma conta foi escolhida.',
    relacaoComTela: 'Sem conta escolhida, a provisão sai da Conta central deste perfil. Some quando você escolhe uma conta ou uma função de reserva, que já dizem o perfil. Sem Conta central no perfil, o Salvar avisa.',
    obrigatorio: true,
  },
  'provisao.descricao': {
    titulo: 'Descrição',
    paraQueServe: 'Nome da despesa prevista.',
    relacaoComTela: 'Aparece no Fluxo Futuro, em Agendamentos e no lançamento quando a provisão for efetivada.',
    obrigatorio: true,
  },
  'provisao.valor': {
    titulo: 'Valor estimado',
    paraQueServe: 'Quanto você espera gastar em cada ocorrência.',
    relacaoComTela: 'Entra como despesa projetada no Fluxo de Caixa principal. Com parcelamento, é o total da ocorrência, dividido nas parcelas (a divisão aparece logo abaixo). O valor real é informado ao efetivar.',
    obrigatorio: true,
  },
  'provisao.data': {
    titulo: 'Data estimada',
    paraQueServe: 'Quando a despesa deve acontecer (na recorrente, a 1ª ocorrência).',
    relacaoComTela: 'Com a frequência, calcula as datas das ocorrências da prévia. Não muda depois que a série parcelada tem baixa.',
    obrigatorio: true,
  },
  'provisao.frequencia': {
    titulo: 'Frequência',
    paraQueServe: 'De quanto em quanto tempo a despesa se repete.',
    relacaoComTela: 'Única: uma ocorrência só. As demais abrem "Até quando" e mostram a prévia das próximas datas. Mensal ou maior permite parcelar cada ocorrência.',
    obrigatorio: true,
  },
  'provisao.ateQuando': {
    titulo: 'Até quando',
    paraQueServe: 'Sem fim repete sempre; com número de ocorrências ou data final, a série termina ali.',
    relacaoComTela: 'Limita as ocorrências da prévia e do Fluxo Futuro.',
    obrigatorio: true,
  },
  'provisao.parcelasPorOcorrencia': {
    titulo: 'Parcelamento',
    paraQueServe: 'Divide o total de cada ocorrência em parcelas mensais.',
    relacaoComTela: 'O valor estimado vira o total da ocorrência e é repartido em parcelas na prévia e no Fluxo Futuro. Cada parcela da prévia pode ser editada com um clique. O limite são os meses do período. Item que já tem baixa não vira parcelado.',
    obrigatorio: false,
    quandoUsar: 'Despesa anual paga em várias vezes.',
  },
  'provisao.conta': {
    titulo: 'Conta (de onde o dinheiro sai)',
    paraQueServe: 'Conta que vai pagar a despesa.',
    relacaoComTela: 'Em branco, vale a Conta central do perfil. Define o perfil das categorias e se a provisão entra no Fluxo de Caixa principal (conta FC, ou a pergunta logo abaixo). Cartão e conta gerencial não aparecem.',
    obrigatorio: true,
  },
  'provisao.fluxoPrincipal': {
    titulo: 'Considerar no Fluxo de Caixa principal',
    paraQueServe: 'Diz se a provisão entra no Fluxo de Caixa principal, quando a conta não decide sozinha.',
    relacaoComTela: 'Só aparece para conta que não é FC. Muda onde o valor aparece no Fluxo de Caixa; o saldo da conta é o mesmo.',
    obrigatorio: false,
  },
  'provisao.favorecido': {
    titulo: 'Favorecido',
    paraQueServe: 'Para quem a despesa será paga.',
    relacaoComTela: 'Vai para o lançamento quando a provisão for efetivada. Nome novo entra no cadastro de favorecidos ao salvar.',
    obrigatorio: false,
  },
  'provisao.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Categoria de despesa da provisão.',
    relacaoComTela: 'Agrupa a provisão no Fluxo Futuro e nos relatórios, e vai para o lançamento ao efetivar. A lista segue o perfil da conta.',
    obrigatorio: false,
  },
  'provisao.comReserva': {
    titulo: 'Será pago com reserva',
    paraQueServe: 'Marca que o dinheiro desta despesa vem de uma função de reserva.',
    relacaoComTela: 'Abre Função de Reserva. A provisão entra como resgate projetado no Fluxo Futuro dessa reserva.',
    obrigatorio: false,
  },
  'provisao.funcaoReserva': {
    titulo: 'Função de reserva',
    paraQueServe: 'Reserva de onde sai o dinheiro da provisão.',
    relacaoComTela: 'A provisão aparece como resgate projetado desta função. Sem conta escolhida, o perfil da provisão é o da conta da função.',
    obrigatorio: true,
  },

  // ── Provisório (Fluxo de Caixa por Conta / Fluxo de Caixa Futuro) ──────────────────────────
  'provisorio.descricao': {
    titulo: 'Descrição',
    paraQueServe: 'Nome da entrada ou saída simulada.',
    relacaoComTela: 'Aparece no Fluxo de Caixa com a marca de provisório. Vai junto se você efetivar o provisório depois.',
    obrigatorio: true,
  },
  'provisorio.data': {
    titulo: 'Data',
    paraQueServe: 'Dia em que a entrada ou saída simulada acontece.',
    relacaoComTela: 'O valor entra no saldo acumulado do Fluxo de Caixa a partir deste dia.',
    obrigatorio: true,
  },
  'provisorio.valor': {
    titulo: 'Valor',
    paraQueServe: 'Quanto entra ou sai na simulação.',
    relacaoComTela: 'Soma nos totais e no projetado do Fluxo de Caixa (relatório e Fluxo de Caixa Futuro). Não mexe no saldo da conta.',
    obrigatorio: true,
  },
  'provisorio.tipo': {
    titulo: 'Tipo',
    paraQueServe: 'Entrada soma no fluxo; Saída subtrai.',
    relacaoComTela: 'Trocar o tipo limpa a categoria, porque a lista muda entre receitas e despesas.',
    obrigatorio: true,
  },
  'provisorio.conta': {
    titulo: 'Conta',
    paraQueServe: 'Conta em cujo fluxo a simulação aparece.',
    relacaoComTela: 'O provisório entra no fluxo desta conta. Na tela Fluxo de Caixa Futuro, a lista traz só as contas da consulta ativa. Define o perfil das categorias.',
    obrigatorio: true,
  },
  'provisorio.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Categoria da simulação, opcional.',
    relacaoComTela: 'A lista segue o tipo e o perfil da conta. Vem sugerida ao efetivar o provisório.',
    obrigatorio: false,
  },
}

export const formularios = {}
