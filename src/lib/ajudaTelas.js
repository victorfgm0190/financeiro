// TEXTOS das boas-vindas, do checklist "Primeiros passos" e da ajuda "?" de cada tela — tudo aqui,
// para editar sem mexer nos componentes. Linguagem simples, sem jargão, igual para todos os clientes
// (nada de nome de pessoa, conta ou banco). Ícones: nomes do lucide-react (resolvidos no componente).
//
// `mostrar(ctx)` decide se o item aparece no ambiente/usuário. ctx = {
//   podeVer(pagina),       // a tela existe no menu deste usuário (mesma regra do menu)
//   podeIncluir(modulo),   // pode criar itens no módulo (contas, agendamentos…)
//   iaAtiva,               // Assistente disponível (mesma condição do botão ✨ do cabeçalho)
//   gerencialAtivo,        // controle gerencial ligado no ambiente (Configurações)
// }

const sempre = () => true

// ── 1. Boas-vindas (carrossel) ───────────────────────────────────────────────────────────────────
export const PASSOS_BOAS_VINDAS = [
  {
    id: 'bem-vindo', icone: 'Sparkles', mostrar: sempre,
    titulo: 'Bem-vindo ao Finup!',
    texto: 'O Finup organiza o seu dinheiro num lugar só: contas, cartões, contas a pagar e a receber — da pessoa física e da empresa, cada uma separada, mas visíveis juntas quando você quiser.',
  },
  {
    id: 'perfis', icone: 'Users', mostrar: sempre,
    titulo: 'Perfis (CPF/CNPJ)',
    texto: 'Perfil é a pessoa ou a empresa dona do dinheiro. Toda conta deve ter um perfil: assim você vê os números de cada um separado, ou de todos juntos no filtro "Tudo", no topo da tela.',
    dica: 'Conta "Sem vínculo" (sem perfil) só aparece no filtro "Tudo" e fica de fora dos totais de cada perfil.',
  },
  {
    id: 'contas', icone: 'Wallet', mostrar: (c) => c.podeVer('accounts'),
    titulo: 'Contas',
    texto: 'Cadastre suas contas bancárias, poupança, dinheiro em espécie e investimentos. O saldo de cada uma é calculado pelos lançamentos.',
    itens: [
      'Conta favorita: a que já vem escolhida quando você faz um lançamento.',
      'Conta central: a conta principal de cada perfil, usada nos pagamentos automáticos (como a fatura do cartão).',
      'Saldo Principal: soma das contas marcadas com "Somar no Saldo Principal" — é o dinheiro disponível do dia a dia.',
    ],
  },
  {
    id: 'cartao', icone: 'CreditCard', mostrar: (c) => c.podeVer('credit'),
    titulo: 'Cartão de Crédito',
    texto: 'Cadastre o cartão com o dia de fechamento e o de vencimento. As compras vão para a fatura certa sozinhas, e você acompanha cada fatura mês a mês.',
    dica: 'Em "Importar Fatura" você traz o arquivo do banco e o Finup confere o que já está lançado.',
    dicaSe: (c) => c.podeVer('import'),
  },
  {
    id: 'agendamentos', icone: 'Calendar', mostrar: (c) => c.podeVer('schedule'),
    titulo: 'Agendamentos',
    texto: 'São as contas a pagar e a receber: aluguel, salário, mensalidades. Podem se repetir todo mês (recorrência) ou ser divididas em parcelas. Na data, você confirma o pagamento com um clique.',
  },
  {
    id: 'lancamentos', icone: 'TrendingUp', mostrar: (c) => c.podeVer('transactions') || c.podeVer('cashflow'),
    titulo: 'Lançamentos e Fluxo de Caixa',
    texto: 'Lançamento é o que já aconteceu: o dinheiro que entrou ou saiu. O Fluxo de Caixa mostra o que ainda vai acontecer, somando os agendamentos, para você ver como o saldo fica nos próximos dias e meses.',
  },
  {
    id: 'painel', icone: 'LayoutDashboard', mostrar: sempre,
    titulo: 'Painel',
    texto: 'É a tela inicial, com o resumo de tudo: o Saldo Principal, as receitas e despesas do mês e a projeção de como o mês vai terminar.',
  },
  {
    id: 'assistente', icone: 'Sparkles', mostrar: (c) => c.iaAtiva,
    titulo: 'Assistente',
    texto: 'Escreva, fale ou mande a foto de um comprovante — por exemplo, "gastei 50 no mercado no cartão". O Assistente prepara o lançamento e você só confere antes de salvar. Nada é gravado sem a sua confirmação.',
  },
  {
    id: 'gerencial', icone: 'Layers', mostrar: (c) => c.gerencialAtivo && c.podeVer('reservas'),
    titulo: 'Controle gerencial e Reservas',
    texto: 'Separe dinheiro para objetivos (viagem, reforma, emergência) em reservas, e acompanhe quanto de cada gasto sai delas. O Finup faz as transferências de controle para você.',
  },
]

// Último passo: atalhos para começar. `acao` = o que o botão faz (resolvido pelo componente).
export const PRIMEIROS_PASSOS_TOUR = {
  id: 'primeiros-passos', icone: 'Rocket',
  titulo: 'Primeiros passos',
  texto: 'Comece por aqui. Você pode voltar a este tour quando quiser pelo link "Rever tour de boas-vindas".',
}

// ── 2. Checklist "Primeiros passos" (Painel) ─────────────────────────────────────────────────────
// `feito(dados)`: dados = { profiles, accounts, schedules }.
export const CHECKLIST = [
  {
    id: 'perfil', acao: 'perfil', mostrar: sempre,
    texto: 'Criar o seu perfil (CPF ou CNPJ)',
    botao: 'Fazer agora',
    feito: (d) => (d.profiles || []).length > 0,
  },
  {
    id: 'conta', acao: 'conta', mostrar: (c) => c.podeVer('accounts') && c.podeIncluir('contas'),
    texto: 'Cadastrar a primeira conta (ligada a um perfil)',
    botao: 'Fazer agora',
    feito: (d) => (d.accounts || []).some(a => a.type !== 'credit' && a.profileId && !a.isGerencial),
  },
  {
    id: 'cartao', acao: 'cartao', mostrar: (c) => c.podeVer('credit') && c.podeIncluir('contas'),
    texto: 'Cadastrar o primeiro cartão de crédito',
    botao: 'Fazer agora',
    feito: (d) => (d.accounts || []).some(a => a.type === 'credit'),
  },
  {
    id: 'agendamento', acao: 'agendamento', mostrar: (c) => c.podeVer('schedule') && c.podeIncluir('agendamentos'),
    texto: 'Criar o primeiro agendamento (uma conta a pagar ou a receber)',
    botao: 'Fazer agora',
    feito: (d) => (d.schedules || []).length > 0,
  },
]
export const CHECKLIST_TITULO = 'Primeiros passos'
export const CHECKLIST_SUBTITULO = 'Faltam poucos passos para o Finup ficar com a sua cara.'
export const CHECKLIST_OCULTAR = 'Ocultar'

// Botões do último passo do tour (mesmas ações do checklist).
export const BOTOES_PRIMEIROS_PASSOS = {
  perfil: 'Criar ou conferir perfil',
  conta: 'Criar a primeira conta',
  cartao: 'Cadastrar um cartão',
  agendamento: 'Criar o primeiro agendamento',
}

export const TOUR_BOTOES = { proximo: 'Próximo', voltar: 'Voltar', pular: 'Pular', concluir: 'Começar a usar' }
export const LINK_REVER_TOUR = 'Rever tour de boas-vindas'

// ── 3. Ajuda de cada tela (botão "?" ao lado do título) ─────────────────────────────────────────
// Chave = página do app (a mesma do menu). `itens`: o que cada card/botão principal faz.
export const AJUDA_TELAS = {
  dashboard: {
    titulo: 'Painel',
    descricao: 'Resumo da sua vida financeira: quanto você tem disponível, como o mês está indo e como ele deve terminar.',
    itens: [
      { chave: 'ver-alertas', rotulo: 'Ver alertas', texto: 'Aparece quando uma fatura de cartão está perto de vencer; leva para a tela de Alertas.', modulo: 'pagina:alerts' },
      { chave: 'saldo-principal', rotulo: 'Saldo Principal', texto: 'O dinheiro disponível do dia a dia — soma das contas marcadas com "Somar no Saldo Principal". Clique para ver como o valor foi calculado.' },
      { chave: 'cards-mes', rotulo: 'Receitas e Despesas do mês', texto: 'O que entrou e saiu no mês financeiro atual, comparado com o mês anterior. Clique num card para ver os lançamentos.' },
      { chave: 'projecao', rotulo: 'Projeção', texto: 'Como o saldo deve ficar até o fim do mês, contando os agendamentos que ainda vão acontecer.' },
      { chave: 'envelopes', rotulo: 'Envelopes do mês', texto: 'Quanto já foi usado de cada envelope no mês. Só aparece quando há envelopes cadastrados.' },
      { chave: 'uso-receita', rotulo: 'Uso da Receita', texto: 'Quanto da receita do mês já foi gasto; a cor avisa quando está perto ou acima do que entrou.' },
      { chave: 'grafico-6-meses', rotulo: 'Receitas vs Despesas', texto: 'Gráfico com o que entrou e saiu em cada um dos últimos 6 meses.' },
      { chave: 'proximos-vencimentos', rotulo: 'Próximos Vencimentos', texto: 'Contas a pagar e a receber dos próximos 7 dias, e as que estão em atraso.' },
      { chave: 'maiores-despesas', rotulo: 'Maiores Despesas', texto: 'Gráfico de pizza com as categorias em que você mais gastou. Clique numa fatia para ver os detalhes.' },
      { chave: 'filtros-despesas', rotulo: 'Cheio / Líquido e período', texto: 'Escolha o mês (atual, anterior ou últimos 3) e se o valor desconta o que foi pago com dinheiro de reserva.' },
      { chave: 'ranking-categorias', rotulo: 'Ranking por Categoria', texto: 'As mesmas despesas em forma de lista, da categoria que mais gastou para a que menos gastou.' },
      { chave: 'top-favorecidos', rotulo: 'Top 5 Favorecidos', texto: 'De quem você mais recebeu e com quem mais gastou no mês. Clique num nome para ver os lançamentos.' },
      { chave: 'contas', rotulo: 'Contas', texto: 'O saldo de cada conta e a dívida de cada cartão, com a data do último movimento.' },
    ],
    dicas: [
      'Use o filtro de perfil no topo para ver só uma pessoa ou empresa, ou "Tudo" para ver tudo junto.',
      'Conta de saldo principal sem movimento há mais de 30 dias aparece com um aviso — vale conferir se falta lançar algo.',
    ],
  },
  inicio: {
    titulo: 'Início',
    descricao: 'A tela inicial do celular: o seu saldo principal, o resumo do mês e os cards que você escolheu.',
    itens: [
      { chave: 'ocultar', rotulo: 'Olho', texto: 'Esconde ou mostra os valores na tela — útil em lugares públicos.' },
      { chave: 'perfis', rotulo: 'Perfis', texto: 'Escolha de qual pessoa ou empresa ver os números, ou "Tudo" para ver todos juntos.' },
      { chave: 'buscar', rotulo: 'Buscar', texto: 'Procura lançamentos, contas e agendamentos em todo o Finup.' },
      { chave: 'resumo', rotulo: 'Saldo principal', texto: 'O dinheiro disponível do dia a dia, as receitas e despesas do mês e como o mês deve terminar. Toque para ver como o valor foi calculado.' },
      { chave: 'ver-tudo', rotulo: 'Ver tudo', texto: 'Em cada card, abre a tela completa daquele assunto.' },
      { chave: 'personalizar', rotulo: 'Personalizar cards do Início', texto: 'Escolha quais cards aparecem e em que ordem.' },
    ],
    dicas: [],
  },
  mais: {
    titulo: 'Mais',
    descricao: 'Todas as telas que não cabem na barra de baixo, as configurações e a sua sessão.',
    itens: [
      { chave: 'telas', rotulo: 'Telas', texto: 'Toque num quadro para abrir a tela correspondente.' },
      { chave: 'configuracoes', rotulo: 'Configurações', texto: 'Os ajustes do Finup: perfis, categorias, regras e outros.' },
      { chave: 'tema', rotulo: 'Tema', texto: 'Escolha o visual claro, escuro ou igual ao do celular.' },
      { chave: 'sessao', rotulo: 'Sua sessão', texto: 'Mostra com qual usuário você entrou e tem o botão para sair.' },
    ],
    dicas: [],
  },
  despesas: {
    titulo: 'Maiores despesas',
    descricao: 'Em que categorias o seu dinheiro foi gasto no período, em pizza ou em ranking.',
    itens: [
      { chave: 'periodo', rotulo: 'Período', texto: 'Mês atual, mês anterior ou os últimos meses.' },
      { chave: 'visao-modo', rotulo: 'Pizza / Ranking e Cheio / Líquido', texto: 'Escolha entre o gráfico de pizza e a lista em ordem, e se o valor é cheio ou descontando o que saiu das reservas.' },
      { chave: 'ver-todas', rotulo: 'Ver todas / Mostrar menos', texto: 'Mostra todas as categorias ou só as maiores.' },
    ],
    dicas: [
      '"Cheio" bate com as Despesas do Mês do Painel; "Líquido" desconta o resgate de reserva da mesma categoria.',
    ],
  },
  accounts: {
    titulo: 'Contas',
    descricao: 'Todas as suas contas e bens, separados em grupos (conta corrente, poupança, investimentos, imóveis…).',
    itens: [
      { chave: 'saldo', rotulo: 'Saldo Atual', texto: 'A soma das contas que estão na tela, hoje. O Saldo Futuro mostra como fica depois dos lançamentos já feitos com data à frente.' },
      { chave: 'pl', rotulo: 'Patrimônio Líquido', texto: 'Tudo o que você tem menos o que deve. Clique para ver a composição.' },
      { chave: 'sem-grupo', rotulo: 'N sem grupo (no fim da página) ↓', texto: 'Aparece ao lado de "Contas (N)" quando há contas fora dos grupos. Clique para descer até a seção "Sem Grupo".' },
      { chave: 'grupos', rotulo: 'Grupos', texto: 'Organiza as contas em grupos e define a ordem em que aparecem.' },
      { chave: 'nova', rotulo: 'Nova Conta', texto: 'Cadastra uma conta. Escolha o perfil (CPF/CNPJ) dela para que apareça nos totais certos.', modulo: 'pode:contas:incluir' },
      { chave: 'grupo', rotulo: 'Cabeçalho do grupo', texto: 'Mostra o total do grupo. Clique para recolher ou abrir as contas dele.' },
      { chave: 'card', rotulo: 'Cartão da conta', texto: 'Mostra o saldo de hoje e o saldo futuro. Clique para abrir o extrato. Arraste o cartão para outro grupo para mudá-lo de lugar.' },
      { chave: 'selos', rotulo: 'Selos da conta', texto: 'Perfil dono da conta (ou "Sem vínculo"), apelido, FC (soma no Saldo Principal), INV (investimento), CC (Conta central) e Inativa.' },
      { chave: 'rendimento', rotulo: 'Lançar rendimento', texto: 'Registra o rendimento do mês. Só aparece em contas com categoria de rendimento definida.', modulo: 'pode:contas:editar' },
      { chave: 'editar', rotulo: 'Editar conta (lápis)', texto: 'Abre o cadastro da conta para mudar nome, perfil, grupo e opções.', modulo: 'pode:contas:editar' },
      { chave: 'inativar', rotulo: 'Inativar / Reativar (olho)', texto: 'Inativa a conta sem apagar nada: ela some dos formulários de lançamento. Clique de novo para reativar.', modulo: 'pode:contas:editar' },
      { chave: 'excluir', rotulo: 'Excluir conta (lixeira)', texto: 'Apaga a conta de vez. Pede confirmação antes.', modulo: 'pode:contas:excluir' },
      { chave: 'ordem', rotulo: 'Setas ↑ ↓', texto: 'Mudam a posição da conta dentro do grupo.', modulo: 'pode:contas:editar' },
      { chave: 'recalcular', rotulo: 'Recalcular', texto: 'Refaz o saldo da conta a partir dos lançamentos dela.', modulo: 'pode:contas:editar' },
      { chave: 'favorita', rotulo: 'Definir como favorita', texto: 'Marca a conta com estrela e a lista primeiro em Lançamentos. Vale uma favorita por perfil.', modulo: 'pode:contas:editar' },
    ],
    dicas: [
      'Conta "Sem vínculo" não está ligada a nenhum perfil: só aparece no filtro "Tudo", não entra no Saldo Principal nem nos totais dos perfis e não pode ser Conta central. Edite a conta e escolha um perfil.',
      'Contas sem grupo ficam na seção "Sem Grupo", no fim da página.',
      'Cartão de crédito com vencimento mais próximo ganha a borda azul e o aviso "Próxima fatura".',
    ],
  },
  'accounts:extrato': {
    titulo: 'Extrato da conta',
    descricao: 'Todos os lançamentos da conta no mês escolhido, com o saldo depois de cada um.',
    itens: [
      { chave: 'voltar', rotulo: 'Voltar', texto: 'Fecha o extrato e volta para a lista de contas.' },
      { chave: 'mes', rotulo: 'Seletor de mês', texto: 'Use as setas para ver o mês anterior ou o próximo.' },
      { chave: 'resumo-fatura', rotulo: 'Resumo das faturas', texto: 'Em contas gerenciais, mostra quanto entrou e saiu para cada fatura do cartão.', modulo: 'gerencial' },
      { chave: 'selecionar', rotulo: 'Selecionar', texto: 'Liga a seleção para marcar vários lançamentos e alterar, conciliar ou excluir de uma vez.', modulo: 'pode:lancamentos:editar' },
      { chave: 'reconciliar', rotulo: 'Reconciliar', texto: 'Abre a lista do período para marcar como conferido o que bate com o banco. Só no computador.', modulo: 'pode:lancamentos:editar' },
      { chave: 'conciliar-gerenciais', rotulo: 'Conciliar Gerenciais', texto: 'Marca como conferidos, de uma vez, os lançamentos pendentes do período que envolvem uma conta gerencial.', modulo: 'pode:lancamentos:editar' },
      { chave: 'excel', rotulo: 'Excel', texto: 'Baixa o extrato do mês, com os filtros aplicados, em planilha. Aparece em contas gerenciais.', modulo: 'gerencial' },
      { chave: 'novo', rotulo: 'Novo Lançamento', texto: 'Registra uma receita, despesa ou transferência já nesta conta.', modulo: 'pode:lancamentos:incluir' },
      { chave: 'saldos', rotulo: 'Saldos do mês', texto: 'Saldo Atual, Saldo Futuro (quando há lançamentos com data à frente), Entradas e Saídas do mês.' },
      { chave: 'filtros', rotulo: 'Filtros', texto: 'Digite data, histórico, favorecido ou conta para encontrar lançamentos; Entrada e Saída filtram por valor.' },
      { chave: 'filtro-conciliacao', rotulo: 'Todos / Conciliados / Pendentes', texto: 'Mostra todos os lançamentos, só os já conferidos ou só os que faltam conferir.' },
      { chave: 'limpar', rotulo: 'Limpar filtros (X)', texto: 'Apaga tudo o que foi digitado nos filtros.' },
      { chave: 'acoes-linha', rotulo: 'Ações da linha', texto: 'Ao passar o mouse na linha: editar, duplicar, estornar ou excluir o lançamento.' },
      { chave: 'conciliado', rotulo: 'Coluna R', texto: 'Clique no círculo para marcar o lançamento como conferido com o banco (ou desmarcar).' },
      { chave: 'barra-selecao', rotulo: 'Barra de seleção', texto: 'No modo Selecionar: Alterar Selecionados, Conciliar, Desconciliar ou Excluir os lançamentos marcados.' },
    ],
    dicas: [
      'Clique numa linha para editar o lançamento.',
      'Selos "Futuro", "Gerencial" ou "Reserva" indicam lançamento já feito com data à frente: ele já conta no Saldo Futuro.',
    ],
  },
  credit: {
    titulo: 'Cartão de Crédito',
    descricao: 'Acompanhe cada fatura do cartão: as compras, as parcelas, o total e o pagamento.',
    itens: [
      { chave: 'cartao', rotulo: 'Seleção do cartão', texto: 'Escolha o cartão que quer ver.' },
      { chave: 'editar-cartao', rotulo: 'Editar cartão (lápis)', texto: 'Abre o cadastro do cartão: limite, dia de fechamento, vencimento e conta pagadora.', modulo: 'pode:contas:editar' },
      { chave: 'fatura', rotulo: 'Mês da fatura', texto: 'Use as setas para ir para a fatura anterior ou a próxima.' },
      { chave: 'extrato', rotulo: 'Extrato', texto: 'Abre o extrato gerencial do cartão, com os grupos e o saldo corrido. Só no computador.', modulo: 'gerencial' },
      { chave: 'relatorio', rotulo: 'Relatório', texto: 'Abre o relatório da fatura, pronto para conferir ou exportar.' },
      { chave: 'fatura-selecionada', rotulo: 'Fatura Selecionada', texto: 'O total da fatura e quantos lançamentos ela tem, somando os agendamentos previstos quando houver.' },
      { chave: 'pagamento', rotulo: 'Saldo a Pagar / Valor Pago', texto: 'Quanto falta pagar ou quanto já foi pago, e se a fatura está paga, parcialmente paga ou não paga.' },
      { chave: 'fechar', rotulo: 'Fechar / Abrir Fatura', texto: 'Fecha a fatura para ninguém lançar nela sem querer. Abra de novo se precisar ajustar.', modulo: 'pode:cartao:editar' },
      { chave: 'novo', rotulo: 'Novo Lançamento', texto: 'Registra uma compra ou estorno neste cartão. Fica bloqueado com a fatura fechada.', modulo: 'pode:cartao:incluir' },
      { chave: 'pagar', rotulo: 'Pagar Fatura', texto: 'Registra o pagamento a partir da conta pagadora do cartão.', modulo: 'pode:cartao:incluir' },
      { chave: 'atualizar', rotulo: 'Atualizar', texto: 'Recalcula o total da fatura e atualiza a conta a pagar dela.', modulo: 'pode:cartao:editar' },
      { chave: 'revisar', rotulo: 'Revisar Movimentos Automáticos', texto: 'Mostra os ajustes automáticos pendentes da fatura antes de aplicar.', modulo: 'pode:cartao:editar' },
      { chave: 'selecionar', rotulo: 'Selecionar', texto: 'Liga a seleção para marcar vários lançamentos e alterar ou conciliar de uma vez.', modulo: 'pode:cartao:editar' },
      { chave: 'reconciliar', rotulo: 'Reconciliar', texto: 'Abre a lista da fatura para marcar como conferido o que bate com a fatura do banco. Só no computador.', modulo: 'pode:cartao:editar' },
      { chave: 'acoes-linha', rotulo: 'Ações da linha', texto: 'Editar, duplicar ou excluir a compra.' },
      { chave: 'conciliado', rotulo: 'Coluna R', texto: 'Clique no círculo para marcar a compra como conferida (ou desmarcar).' },
      { chave: 'previstos', rotulo: 'Agendamentos previstos', texto: 'Despesas agendadas que ainda vão entrar nesta fatura. Clique para ver a lista.' },
    ],
    dicas: [
      'O dia de fechamento do cartão decide em qual fatura cada compra cai — confira no cadastro do cartão.',
      'Os filtros acima da lista ajudam a achar uma compra por data, descrição, favorecido ou valor.',
    ],
  },
  'credit:extrato': {
    titulo: 'Extrato Gerencial',
    descricao: 'Todas as movimentações do cartão num período, com o saldo corrido depois de cada uma.',
    itens: [
      { chave: 'cartao', rotulo: 'Cartão', texto: 'Escolha o cartão do extrato.' },
      { chave: 'de', rotulo: 'De', texto: 'Data inicial do período.' },
      { chave: 'ate', rotulo: 'Até', texto: 'Data final do período.' },
      { chave: 'ger', rotulo: 'Coluna Ger', texto: 'O grupo gerencial de cada lançamento.', modulo: 'gerencial' },
      { chave: 'conciliado', rotulo: 'Coluna R', texto: 'Clique no círculo para marcar o lançamento como conferido (ou desmarcar).' },
      { chave: 'saldo', rotulo: 'Saldo', texto: 'O saldo depois de cada linha: D quando é devedor, C quando é credor.' },
    ],
    dicas: [
      'Use "Voltar ao Cartão", no alto, para voltar à fatura.',
    ],
  },
  schedule: {
    titulo: 'Agendamentos',
    descricao: 'Suas contas a pagar e a receber, com as datas de cada ocorrência.',
    itens: [
      { chave: 'visao', rotulo: 'Lista / Calendário', texto: 'Escolhe como ver os agendamentos: em lista ou num calendário do mês.' },
      { chave: 'exportar', rotulo: 'Exportar Excel', texto: 'Gera uma planilha com a lista do jeito que está filtrada na tela.' },
      { chave: 'executar-gerenciais', rotulo: 'Executar Gerenciais', texto: 'Faz de uma vez as transferências de controle das provisões que estão pendentes.', modulo: 'gerencial' },
      { chave: 'lancar-provisao', rotulo: 'Lançar Provisão', texto: 'Reserva um valor previsto para uma despesa que ainda vai acontecer, sem saber o valor exato.', modulo: 'pode:agendamentos:incluir' },
      { chave: 'novo', rotulo: 'Novo Agendamento', texto: 'Cria uma conta a pagar ou a receber, única, recorrente (todo mês, toda semana…) ou parcelada.', modulo: 'pode:agendamentos:incluir' },
      { chave: 'abas', rotulo: 'Abas', texto: 'Separa os agendamentos das contas, do cartão de crédito, do controle gerencial e das contas anuais.' },
      { chave: 'status', rotulo: 'A pagar / Provisões / Pagos', texto: 'Mostra só o que ainda falta pagar, as provisões ou o que já foi pago.' },
      { chave: 'periodo', rotulo: 'Período', texto: 'Escolhe o intervalo de datas da lista: este mês, próximos 30 dias, tudo…' },
      { chave: 'filtros', rotulo: 'Filtros', texto: 'Abre mais filtros: datas, descrição, favorecido, categoria, tipo de documento e valor.' },
      { chave: 'conta-reserva', rotulo: 'Conta de reserva', texto: 'Na aba Contas Anuais, mostra só os agendamentos de uma conta de reserva.' },
      { chave: 'tipo', rotulo: 'Todos / Entradas / Saídas / Transferências', texto: 'Filtra a lista pelo tipo de movimento.' },
      { chave: 'selecionar', rotulo: 'Selecionar', texto: 'Marca vários agendamentos para pagar, pular ou alterar todos de uma vez.', modulo: 'pode:agendamentos:editar' },
      { chave: 'pagar', rotulo: 'Pagar / Receber', texto: 'Na data, confirma que aconteceu: o agendamento vira um lançamento na conta.', modulo: 'pode:agendamentos:editar' },
      { chave: 'editar', rotulo: 'Editar (lápis na linha)', texto: 'Muda os dados do agendamento, como valor, data ou categoria.', modulo: 'pode:agendamentos:editar' },
    ],
    dicas: [
      'Ao editar um agendamento recorrente, o Finup pergunta se a mudança vale só para uma ocorrência ou para as próximas.',
    ],
  },
  transactions: {
    titulo: 'Lançamentos',
    descricao: 'Tudo o que já entrou ou saiu das suas contas e cartões. Escolha uma conta ou uma fatura para ver os lançamentos.',
    itens: [
      { chave: 'novo', rotulo: 'Novo', texto: 'Registra uma receita, despesa ou transferência. Primeiro você escolhe a conta.', modulo: 'pode:lancamentos:incluir' },
      { chave: 'conta', rotulo: 'Cartão da conta', texto: 'Mostra o saldo atual da conta. Clique para abrir o extrato com os lançamentos dela.' },
      { chave: 'novo-cartao', rotulo: '+ no cartão de crédito', texto: 'Registra uma compra direto nesse cartão.', modulo: 'pode:lancamentos:incluir' },
      { chave: 'fatura', rotulo: 'Fatura do cartão', texto: 'Cada mês de fatura com o total e a quantidade de compras. Clique para ver as compras dela.' },
    ],
    dicas: [
      'Um lançamento pode ser dividido em várias categorias ("Dividir em categorias").',
    ],
  },
  'transactions:fatura': {
    titulo: 'Fatura do cartão',
    descricao: 'As compras de uma fatura do cartão, com o total e o que já foi conferido.',
    itens: [
      { chave: 'voltar', rotulo: 'Lançamentos', texto: 'Volta para a lista de contas e cartões.' },
      { chave: 'reconciliar', rotulo: 'Reconciliar', texto: 'Abre a lista das compras ainda não conferidas para marcar várias de uma vez.', modulo: 'pode:lancamentos:editar' },
      { chave: 'novo', rotulo: 'Novo', texto: 'Registra uma nova compra nesse cartão.', modulo: 'pode:lancamentos:incluir' },
      { chave: 'resumo', rotulo: 'Fatura e Lançamentos', texto: 'O valor total da fatura e quantas compras ela tem.' },
      { chave: 'filtros', rotulo: 'Filtros', texto: 'Encontre compras por data, histórico, favorecido, categoria ou valor. O total da fatura não muda.' },
      { chave: 'conciliados', rotulo: 'Conciliados / Pendentes', texto: 'Quanto das compras na tela já foi conferido e quanto ainda falta.' },
      { chave: 'estornar', rotulo: 'Estornar (seta na linha)', texto: 'Registra a devolução de uma compra, sem apagar a original.', modulo: 'pode:lancamentos:incluir' },
      { chave: 'editar', rotulo: 'Editar (lápis na linha)', texto: 'Abre a compra para ver ou mudar os dados.' },
      { chave: 'duplicar', rotulo: 'Duplicar', texto: 'Cria uma cópia da compra numa data que você escolhe.', modulo: 'pode:lancamentos:incluir' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira na linha)', texto: 'Apaga a compra. Se ela tiver um resgate ligado, o Finup avisa antes.', modulo: 'pode:lancamentos:excluir' },
      { chave: 'reconciliado', rotulo: 'R (conferido)', texto: 'Marca ou desmarca a compra como conferida com a fatura do banco.' },
    ],
    dicas: [
      'O dia de fechamento do cartão decide em qual fatura cada compra cai.',
    ],
  },
  import: {
    titulo: 'Importar Fatura',
    descricao: 'Traga o arquivo da fatura do cartão (do site do banco) e confira com o que já está lançado no Finup.',
    itens: [
      { chave: 'cartao', rotulo: 'Cartão', texto: 'Escolha o cartão de crédito da fatura que você vai trazer.' },
      { chave: 'mes', rotulo: 'Mês de Referência', texto: 'O mês da fatura. Na importação ele é lido do próprio arquivo quando possível; na conciliação, é você quem escolhe.' },
      { chave: 'arquivo', rotulo: 'Carregar arquivo', texto: 'Clique, arraste ou cole o arquivo da fatura (Excel, CSV ou OFX). Arquivo de outro banco: diga uma vez em qual coluna está cada informação e o Finup guarda como modelo.' },
      { chave: 'conciliar', rotulo: 'Conciliar Fatura', texto: 'Compara o arquivo do banco com a fatura que já está no Finup e mostra o que falta, o que sobra e a diferença. Escolha antes o cartão e o mês.' },
      { chave: 'conciliacao-confirmar', rotulo: 'Confirmar Conciliação', texto: 'No modo Conciliar Fatura: grava o que você marcou para importar ou excluir e volta para a tela normal.' },
      { chave: 'resumo', rotulo: 'Resumo da revisão', texto: 'Total do arquivo, o que já está no Finup, o que será importado e quantos itens precisam da sua decisão.' },
      { chave: 'conferencia', rotulo: 'Conferência da fatura', texto: 'Explica a diferença entre o total do arquivo e o da fatura no Finup. Abre sozinha quando sobra valor sem explicação.' },
      { chave: 'abas', rotulo: 'Revisar lançamentos', texto: 'Veja o que é novo, o que já está no Finup e o que precisa da sua decisão.' },
      { chave: 'regras', rotulo: 'Gerenciar regras de classificação', texto: 'Abre as regras que preenchem categoria e grupo sozinhos a partir da descrição da compra.' },
      { chave: 'classificar-auto', rotulo: 'Classificar Auto', texto: 'Preenche categoria e grupo das linhas usando as suas regras e o que você já classificou antes.' },
      { chave: 'preencher-lote', rotulo: 'Preencher em Lote', texto: 'Aplica a mesma categoria e o mesmo grupo a várias linhas de uma vez.' },
      { chave: 'cat-ger', rotulo: 'Cat → Ger', texto: 'Troca o grupo gerencial de todas as linhas de uma mesma categoria de uma só vez.' },
      { chave: 'cancelar', rotulo: 'Cancelar', texto: 'Descarta o arquivo carregado sem gravar nada.' },
      { chave: 'confirmar', rotulo: 'Confirmar', texto: 'Grava só as linhas novas e marca as já existentes como conferidas.' },
      { chave: 'historico', rotulo: 'Histórico de Importações', texto: 'As importações já feitas. Clique numa delas para editar ou use "Estornar" para desfazer.' },
    ],
    dicas: [
      'Os números do resumo, das abas e do botão Confirmar sempre batem entre si.',
      'Itens que precisam de decisão ficam de fora até você escolher o que fazer com eles.',
    ],
  },
  'import:conciliacao': {
    titulo: 'Conciliar Fatura',
    descricao: 'Compare o arquivo da fatura do banco com a fatura que já está no Finup e decida o que importar, excluir ou manter até a diferença zerar.',
    itens: [
      { chave: 'cabecalho', rotulo: 'Conciliação de Fatura', texto: 'Mostra o cartão, o mês e o arquivo que estão sendo comparados.' },
      { chave: 'sair', rotulo: 'Sair', texto: 'Sai da conciliação sem gravar nada.' },
      { chave: 'totais', rotulo: 'Totais e Diferença', texto: 'Total do arquivo, total no Finup depois das suas escolhas e a diferença entre eles.' },
      { chave: 'fatura-encerrada', rotulo: 'Fatura encerrada', texto: 'Marque quando o fechamento já passou: parcelas que faltam vão para a fatura seguinte.' },
      { chave: 'acoes', rotulo: 'Resumo e Confirmar Conciliação', texto: 'Quantos itens já batem, quantos serão importados e excluídos, e o botão para gravar.' },
      { chave: 'cancelar', rotulo: 'Cancelar', texto: 'Desiste da conciliação sem gravar nada.' },
      { chave: 'so-arquivo', rotulo: 'Só no arquivo — falta no Finup', texto: 'Compras que estão no arquivo do banco e não foram achadas no Finup.' },
      { chave: 'importar-ignorar', rotulo: 'Importar / Ignorar', texto: 'Escolha se a compra entra no Finup ou fica de fora.' },
      { chave: 'so-sistema', rotulo: 'Só no Finup — não está no arquivo', texto: 'Lançamentos da fatura no Finup que não aparecem no arquivo do banco.' },
      { chave: 'manter-excluir', rotulo: 'Manter / Excluir', texto: 'Mantenha o lançamento ou marque para excluir ao confirmar.' },
      { chave: 'conciliados', rotulo: 'Conciliados', texto: 'Compras que estão nos dois lados e já batem. Não precisam de ação.' },
      { chave: 'editar', rotulo: 'Editar (lápis)', texto: 'Abre o lançamento do Finup para corrigir algum dado.' },
    ],
    dicas: [],
  },
  'importar-lancamentos': {
    titulo: 'Importar lançamentos',
    descricao: 'Traga extratos e planilhas (Excel, CSV ou OFX) de qualquer banco para dentro do Finup.',
    itens: [
      { chave: 'conta', rotulo: 'Conta de destino', texto: 'A conta que vai receber os lançamentos. Cartão de crédito continua no Importar Fatura.' },
      { chave: 'gerar-excel', rotulo: 'Gerar Excel para preencher', texto: 'Baixa uma planilha modelo desta conta, já com as listas de categorias e favorecidos.' },
      { chave: 'arquivo', rotulo: 'Enviar o arquivo preenchido', texto: 'Escolha a planilha preenchida, um CSV com as mesmas colunas ou o extrato OFX do banco.' },
      { chave: 'previa', rotulo: 'Prévia', texto: 'Antes de gravar, mostra quantas linhas estão certas, com erro, possíveis duplicadas e quantas serão importadas.' },
      { chave: 'marcar-todas', rotulo: 'Marcar todas', texto: 'Marca ou desmarca todas as linhas da prévia. Só as marcadas são importadas.' },
      { chave: 'importar', rotulo: 'Importar', texto: 'Grava os lançamentos marcados na conta escolhida.' },
      { chave: 'cancelar', rotulo: 'Cancelar', texto: 'Descarta o arquivo lido sem gravar nada.' },
      { chave: 'ultimas', rotulo: 'Últimas importações', texto: 'A lista das importações feitas. Cada uma pode ser desfeita depois, se algo não sair como esperado.' },
      { chave: 'recarregar', rotulo: 'Recarregar', texto: 'Atualiza a lista das últimas importações.' },
      { chave: 'desfazer', rotulo: 'Desfazer importação', texto: 'Apaga os lançamentos daquela importação e o saldo da conta volta ao que era.', modulo: 'pode:lancamentos:excluir' },
    ],
    dicas: [
      'Categorias do arquivo que não existem no Finup podem ser ligadas a uma categoria sua — o Finup lembra nas próximas vezes.',
      'Linhas marcadas como "possível duplicado" já parecem estar na conta: confira antes de importar.',
    ],
  },
  cashflow: {
    titulo: 'Fluxo de Caixa',
    descricao: 'Mostra como o seu saldo vai ficar nos próximos dias e meses, somando o que já aconteceu com o que está agendado.',
    itens: [
      { chave: 'prazo', rotulo: 'Período', texto: 'Escolha até quando quer enxergar o futuro.' },
      { chave: 'filtros', rotulo: 'Filtros e consultas', texto: 'No celular, abre as consultas e as opções de envelopes, reservas e provisórios.' },
      { chave: 'editar-consulta', rotulo: 'Editar consulta atual', texto: 'Muda quais contas e opções a consulta aberta usa.', modulo: 'pode:fluxo:editar' },
      { chave: 'nova-consulta', rotulo: 'Nova consulta', texto: 'Cria uma visão do fluxo com as contas que você escolher (por exemplo, só as da empresa).', modulo: 'pode:fluxo:incluir' },
      { chave: 'consultas', rotulo: 'Consultas', texto: 'Troque entre as visões salvas. "FC Principal" usa as contas que somam no Saldo Principal.' },
      { chave: 'saldo-inicial', rotulo: 'Saldo inicial', texto: 'O ponto de partida: o saldo de cada conta no seu último dia com movimento.' },
      { chave: 'resumo', rotulo: 'Projetado e Mínimo', texto: 'Quanto o saldo deve estar no fim do prazo e o ponto mais baixo que ele vai atingir no caminho.' },
      { chave: 'grafico', rotulo: 'Projeção de saldo', texto: 'Gráfico do saldo dia a dia no prazo escolhido.' },
      { chave: 'marcar-todos', rotulo: 'Marcar todos', texto: 'Liga ou desliga de uma vez todos os eventos que estão na tela.' },
      { chave: 'incluir-envelopes', rotulo: 'Incluir envelopes', texto: 'Soma no fluxo o que ainda falta gastar dos envelopes do mês.' },
      { chave: 'ocultar-reservas', rotulo: 'Ocultar reservas', texto: 'Esconde os depósitos e resgates de reserva da lista.' },
      { chave: 'provisorio', rotulo: 'Provisório', texto: 'Adiciona uma entrada ou saída de teste, só para simular, sem gravar como lançamento.', modulo: 'pode:fluxo:incluir' },
      { chave: 'caixinha', rotulo: 'Caixinha da linha', texto: 'Desmarque um evento para ver como o saldo fica sem ele.' },
      { chave: 'status', rotulo: 'Confirmado / A confirmar', texto: 'Marca se o próximo vencimento de um agendamento já está confirmado.', modulo: 'pode:agendamentos:editar' },
      { chave: 'acoes', rotulo: 'Mudar data e Efetivar', texto: 'Simule outra data para um evento ou transforme um provisório em agendamento ou lançamento de verdade.', modulo: 'pode:fluxo:editar' },
    ],
    dicas: [
      'Se o saldo ficar negativo em alguma data, dá tempo de se planejar antes.',
      'Desmarcar linhas e mudar datas aqui é só simulação: o dinheiro de verdade não muda.',
    ],
  },
  reservas: {
    titulo: 'Reservas',
    descricao: 'O dinheiro separado para objetivos — quanto há em cada reserva e para onde ele foi.',
    itens: [
      { chave: 'abas', rotulo: 'Abas', texto: 'Troca entre as contas reserva, o resumo das funções, o fluxo futuro, o razão diário e o histórico.' },
      { chave: 'totais', rotulo: 'Total Reservado / Depósitos / Resgates', texto: 'Quanto há guardado nas contas reserva e quanto entrou e saiu no mês.' },
      { chave: 'conta', rotulo: 'Saldo das reservas', texto: 'Quanto há guardado em cada conta reserva e o que entrou e saiu dela no mês.' },
      { chave: 'extrato', rotulo: 'Ver Extrato', texto: 'Mostra os depósitos e resgates da conta reserva.' },
    ],
    dicas: [
      'Para uma conta aparecer aqui, ative "É conta de reserva" no cadastro dela.',
    ],
  },
  'reservas:fluxo': {
    titulo: 'Reservas — Fluxo Futuro',
    descricao: 'Como o saldo de cada função deve ficar nos próximos 12 meses, contando os depósitos e resgates agendados.',
    itens: [
      { chave: 'total', rotulo: 'Total investido', texto: 'A soma do saldo das funções, com aviso das que vão ficar negativas.' },
      { chave: 'exportar', rotulo: 'Exportar Excel', texto: 'Gera uma planilha com a projeção mês a mês.' },
      { chave: 'meses', rotulo: 'Setas dos meses', texto: 'No celular, avança ou volta os meses mostrados.' },
      { chave: 'tabela', rotulo: 'Projeção por mês', texto: 'Depósitos, resgates e saldo de cada mês. Clique num valor para ver os agendamentos que o compõem.' },
    ],
    dicas: [
      'Mês em vermelho indica que a função ficaria negativa: dá tempo de ajustar antes.',
    ],
  },
  'reservas:historico': {
    titulo: 'Reservas — Histórico',
    descricao: 'Os períodos já fechados com "Virar Saldo" e como cada função terminou.',
    itens: [
      { chave: 'periodo', rotulo: 'Período fechado', texto: 'Escolhe qual virada de saldo você quer ver.' },
      { chave: 'tabela', rotulo: 'Tabela do período', texto: 'Saldo inicial, entradas, saídas, ajuste e saldo final de cada função naquele período.' },
    ],
    dicas: [],
  },
  'reservas:razao': {
    titulo: 'Reservas — Razão Diário',
    descricao: 'Um registro por função por dia, para conferir a evolução de cada reserva.',
    itens: [
      { chave: 'atualizar', rotulo: 'Atualizar', texto: 'Busca de novo os registros do razão.' },
      { chave: 'exportar', rotulo: 'Excel', texto: 'Gera uma planilha com as linhas filtradas.' },
      { chave: 'mes', rotulo: 'Mês', texto: 'Mostra só os registros de um mês.' },
      { chave: 'funcoes', rotulo: 'Funções', texto: 'Clique nas funções para ver só elas na tabela e no gráfico.' },
      { chave: 'grafico', rotulo: 'Gráfico', texto: 'A evolução do saldo das funções ao longo dos dias.' },
      { chave: 'tabela', rotulo: 'Tabela do razão', texto: 'Entradas, saídas, ajustes e saldos por dia. Clique no título de uma coluna para ordenar.' },
      { chave: 'ver-periodo', rotulo: 'Ver período', texto: 'Abre no Histórico o período fechado a que a linha pertence.' },
    ],
    dicas: [
      'Divergência diferente de zero indica um lançamento que não entrou em nenhuma função.',
    ],
  },
  'reservas:resumo': {
    titulo: 'Reservas — Resumo',
    descricao: 'Cada objetivo (função de reserva) com o saldo, as entradas e saídas e o que ainda vai acontecer.',
    itens: [
      { chave: 'total', rotulo: 'Total reservado', texto: 'A soma do saldo atualizado de todas as funções.' },
      { chave: 'exportar', rotulo: 'Exportar Excel', texto: 'Gera uma planilha com o resumo das funções.' },
      { chave: 'desfazer-virada', rotulo: 'Desfazer Virada', texto: 'Desfaz a última virada de saldo feita agora.', modulo: 'pode:reservas:editar' },
      { chave: 'virar-saldo', rotulo: 'Virar Saldo', texto: 'Fecha o período: o saldo de hoje vira o saldo inicial do próximo, e o fechado vai para o Histórico.', modulo: 'pode:reservas:editar' },
      { chave: 'nova-funcao', rotulo: 'Nova Função', texto: 'Cria um objetivo de reserva, com conta, valor anual e mês de vencimento.', modulo: 'pode:reservas:incluir' },
      { chave: 'saldo-real', rotulo: 'Saldo Real', texto: 'Digite o saldo do banco para ver quanto falta distribuir entre as funções.' },
      { chave: 'exibir-despesa', rotulo: 'Exibir como despesa', texto: 'Liga ou desliga se o depósito dessa função conta como despesa nos relatórios.', modulo: 'pode:reservas:editar' },
      { chave: 'entradas-saidas', rotulo: 'Entradas / Saídas', texto: 'Clique no valor para ver de onde veio cada entrada ou saída.' },
      { chave: 'ajuste', rotulo: 'Ajuste', texto: 'Mostra o histórico de ajustes da função; o "+" grava um ajuste novo.' },
      { chave: 'distribuir', rotulo: 'Distribuir', texto: 'Reparte a diferença entre o saldo do banco e as funções. Não move dinheiro entre contas.', modulo: 'pode:reservas:editar' },
      { chave: 'mov-futuros', rotulo: 'Mov. Futuros', texto: 'Os depósitos e resgates já agendados para essa função.' },
      { chave: 'editar', rotulo: 'Editar (lápis)', texto: 'Muda os dados da função.', modulo: 'pode:reservas:editar' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Apaga a função de reserva.', modulo: 'pode:reservas:excluir' },
    ],
    dicas: [
      'Arraste uma função para mudar a ordem dentro da mesma conta.',
    ],
  },
  envelopes: {
    titulo: 'Envelopes',
    descricao: 'Limites de gasto por assunto no mês (mercado, lazer…) e quanto já foi usado de cada um.',
    itens: [
      { chave: 'novo', rotulo: 'Novo Envelope', texto: 'Cria um envelope com nome, limite mensal e as categorias que entram nele.', modulo: 'pode:envelopes:incluir' },
      { chave: 'competencia', rotulo: 'Competência', texto: 'Use as setas para ver os envelopes de outro mês.' },
      { chave: 'totais', rotulo: 'Total limite / Já gasto / Ainda posso gastar', texto: 'A soma de todos os envelopes do mês.' },
      { chave: 'envelope', rotulo: 'Barra do envelope', texto: 'A parte cheia é o que já foi gasto; a cor avisa quando está perto do limite ou passou dele. Toque para ver os lançamentos.' },
      { chave: 'opcoes', rotulo: 'Opções (⋯)', texto: 'Edita ou exclui o envelope.', modulo: 'pode:envelopes:editar' },
    ],
    dicas: [
      'Compras parceladas aparecem separadas das à vista dentro de cada envelope.',
    ],
  },
  budget: {
    titulo: 'Orçamento',
    descricao: 'Defina quanto pretende gastar em cada categoria e compare com o que realmente aconteceu.',
    itens: [
      { chave: 'resumo', rotulo: 'Total Orçado / Gasto / Saldo', texto: 'Quanto foi planejado no mês, quanto já foi gasto e quanto ainda sobra.' },
      { chave: 'modo-valor', rotulo: 'Despesa real / Valor pago', texto: 'Escolhe como contar os lançamentos de contratos nos gastos.', modulo: 'contratos' },
      { chave: 'novo', rotulo: 'Novo Orçamento', texto: 'Define um limite de gasto no mês para uma categoria.', modulo: 'pode:orcamento:incluir' },
      { chave: 'categoria', rotulo: 'Previsto × realizado', texto: 'Para cada categoria, o valor planejado ao lado do valor gasto. A barra muda de cor perto do limite e quando estoura.' },
      { chave: 'editar', rotulo: 'Editar (lápis)', texto: 'Muda a categoria ou o valor orçado.', modulo: 'pode:orcamento:editar' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove o orçamento dessa categoria.', modulo: 'pode:orcamento:excluir' },
    ],
    dicas: [
      'Os gastos seguem o mês financeiro definido em Configurações.',
    ],
  },
  patrimonio: {
    titulo: 'Patrimônio',
    descricao: 'Tudo o que você tem menos o que você deve: contas, investimentos, bens, dívidas e financiamentos.',
    itens: [
      { chave: 'kpis', rotulo: 'Bens, Investimentos, Contas, Dívidas e Cartão', texto: 'O total de cada parte do patrimônio. Clique em qualquer um para ver de onde vem o valor.' },
      { chave: 'pl', rotulo: 'Patrimônio Líquido', texto: 'O valor final, somando os bens e descontando as dívidas. Clique para ver a composição.' },
      { chave: 'evolucao', rotulo: 'Evolução do Patrimônio Líquido', texto: 'Como o patrimônio mudou nos últimos 6 meses. Fica mais real quando você atualiza o valor dos bens.' },
      { chave: 'bem', rotulo: 'Nome do bem', texto: 'Clique para ver os detalhes do bem: nota fiscal, financiamento e parcelas.' },
      { chave: 'historico', rotulo: 'Atualizações', texto: 'Mostra ou esconde o histórico de valores do bem.' },
      { chave: 'detalhar', rotulo: 'Detalhar bem (lápis)', texto: 'Abre a ficha do bem, onde dá para registrar entrada, financiamento e pagar parcelas.' },
      { chave: 'atualizar-valor', rotulo: 'Atualizar valor', texto: 'Informa quanto o bem vale hoje; o valor antigo fica guardado no histórico.', modulo: 'pode:patrimonio:editar' },
      { chave: 'divida', rotulo: 'Dívida ou financiamento', texto: 'O saldo devedor. Em financiamento, clique para consultar as parcelas.' },
      { chave: 'resumo', rotulo: 'Resumo Patrimonial', texto: 'A conta completa, linha por linha. Clique numa linha para ver a composição dela.' },
    ],
    dicas: [
      'Bens, dívidas e investimentos são contas: cadastre-os na tela Contas, num grupo patrimonial.',
      'Na ficha do bem, em "Valores do Bem", você escolhe se ele entra no patrimônio pelo valor da nota fiscal ou pelo valor pago.',
    ],
  },
  contratos: {
    titulo: 'Contratos',
    descricao: 'Contratos com cobranças que se repetem (aluguel, prestação de serviço) e o andamento de cada um.',
    itens: [
      { chave: 'abas', rotulo: 'Contratos / Regras de itens do boleto', texto: 'Alterna entre a lista de contratos e as regras que dizem quem paga cada item do boleto.' },
      { chave: 'perfil', rotulo: 'Perfil', texto: 'Mostra só os contratos de uma pessoa ou empresa.' },
      { chave: 'tipo', rotulo: 'Tipo', texto: 'Filtra entre contratos a pagar e a receber.' },
      { chave: 'status', rotulo: 'Status', texto: 'Filtra pela situação do contrato (ativo, encerrado…).' },
      { chave: 'novo', rotulo: 'Novo contrato', texto: 'Cadastra um contrato passo a passo: partes, valor, vencimento e reajuste.', modulo: 'pode:contratos:incluir' },
      { chave: 'lista', rotulo: 'Ficha do contrato', texto: 'Clique num contrato da lista para abrir a ficha: os dados, os itens cobrados e o histórico de pagamentos.' },
    ],
    dicas: [
      'A lista vem ordenada pelo próximo vencimento.',
    ],
  },
  'contratos:regras': {
    titulo: 'Regras de itens do boleto',
    descricao: 'Diga quem paga cada item do boleto (por exemplo, do condomínio): o inquilino ou o proprietário. Vale para todos os contratos ou só para um.',
    itens: [
      { chave: 'escopo', rotulo: 'Regras de', texto: 'Escolha se quer ver as regras de todos os contratos (globais) ou as de um contrato só.' },
      { chave: 'nova', rotulo: '+ Regra', texto: 'Cria uma regra: o texto do item, como ele é reconhecido e de quem é.', modulo: 'pode:contratos:editar' },
      { chave: 'lista', rotulo: 'Lista de regras', texto: 'As regras cadastradas. Use o lápis para editar e a lixeira para excluir.' },
      { chave: 'testar', rotulo: 'Testar', texto: 'Cole o texto do boleto e veja como cada item seria classificado pelas regras.' },
    ],
    dicas: [
      'A regra de um contrato vence a global, e "começa com" vence "contém".',
    ],
  },
  reports: {
    titulo: 'Relatórios',
    descricao: 'Relatórios para analisar o dinheiro por período, conta, categoria ou favorecido, com exportação para Excel.',
    itens: [
      { chave: 'demonstrativo', rotulo: 'Demonstrativo Financeiro', texto: 'Receitas e despesas agrupadas por categoria no período que você escolher.' },
      { chave: 'favorecido', rotulo: 'Relatório por Favorecido', texto: 'Quanto você pagou e recebeu de cada pessoa ou empresa.' },
      { chave: 'fluxo-conta', rotulo: 'Fluxo de Caixa por Conta', texto: 'Movimentos e saldo acumulado de uma conta, de um grupo ou das contas principais, com o que está agendado.' },
      { chave: 'fatura', rotulo: 'Relatório de Fatura', texto: 'Análise das faturas do cartão de crédito. Só aparece se houver cartão cadastrado.' },
      { chave: 'medias', rotulo: 'Médias dos 6 meses', texto: 'A média mensal de receitas, despesas e saldo dos últimos 6 meses.' },
      { chave: 'evolucao', rotulo: 'Evolução dos Últimos 6 Meses', texto: 'Gráfico com o que entrou e saiu em cada mês.' },
      { chave: 'despesas-categoria', rotulo: 'Despesas por Categoria', texto: 'Pizza com as categorias em que mais se gastou no mês escolhido.' },
      { chave: 'modo-valor', rotulo: 'Despesa real / Valor pago', texto: 'Para contratos: mostra o gasto real (sem os créditos do proprietário) ou o valor que saiu da conta.', modulo: 'contratos' },
      { chave: 'mes', rotulo: 'Mês', texto: 'Escolha o mês da pizza e do ranking.' },
      { chave: 'ranking', rotulo: 'Ranking de Despesas', texto: 'As 10 categorias com mais gasto no mês, com a porcentagem de cada uma.' },
    ],
    dicas: [
      'Cada relatório tem botão para exportar a planilha, pronta para imprimir ou enviar.',
    ],
  },
  'reports:demonstrativo': {
    titulo: 'Demonstrativo Financeiro',
    descricao: 'Receitas e despesas do período, agrupadas por categoria e subcategoria, com exportação para planilha.',
    itens: [
      { chave: 'voltar', rotulo: 'Voltar aos Relatórios', texto: 'Volta para a lista de relatórios.' },
      { chave: 'entre-perfis', rotulo: 'Incluir transferências entre perfis', texto: 'Conta como receita ou despesa o dinheiro passado entre pessoas ou empresas suas.' },
      { chave: 'ocultar-reserva', rotulo: 'Ocultar movimentos de reserva', texto: 'Tira do relatório os depósitos e resgates de reserva.' },
      { chave: 'ocultar-patrimonio', rotulo: 'Ocultar movimentos de patrimônio', texto: 'Tira do relatório compras e vendas de bens e investimentos.' },
      { chave: 'exibir-lancamentos', rotulo: 'Exibir lançamentos', texto: 'Mostra cada lançamento embaixo da sua categoria, não só os totais.' },
      { chave: 'periodo', rotulo: 'Período', texto: 'Atalhos para escolher rapidamente os últimos meses.' },
      { chave: 'datas', rotulo: 'Data Inicial e Data Final', texto: 'Ou escolha as datas exatas do relatório.' },
      { chave: 'categorias', rotulo: 'Categorias', texto: 'Escolha quais categorias entram no relatório.' },
      { chave: 'contas', rotulo: 'Contas', texto: 'Escolha quais contas entram no relatório.' },
      { chave: 'atualizar', rotulo: 'Atualizar', texto: 'Monta o relatório com os filtros escolhidos. O botão fica destacado quando há filtro novo para aplicar.' },
      { chave: 'exportar-csv', rotulo: 'Exportar CSV', texto: 'Baixa o relatório num arquivo simples, que abre em qualquer planilha.' },
      { chave: 'exportar-excel', rotulo: 'Exportar Excel', texto: 'Gera a planilha formatada, pronta para imprimir ou enviar.' },
      { chave: 'tabela', rotulo: 'Relatório', texto: 'Receitas e despesas por grupo e categoria, com o total de cada uma.' },
    ],
    dicas: [
      'Depois de mudar um filtro, clique em Atualizar para o relatório refletir a mudança.',
    ],
  },
  'reports:favorecido': {
    titulo: 'Relatório por Favorecido',
    descricao: 'Quanto você pagou e recebeu de cada pessoa ou empresa no período, com os lançamentos de cada uma.',
    itens: [
      { chave: 'voltar', rotulo: 'Voltar aos Relatórios', texto: 'Volta para a lista de relatórios.' },
      { chave: 'periodo', rotulo: 'Período', texto: 'Atalhos para escolher rapidamente os últimos meses.' },
      { chave: 'datas', rotulo: 'Data Inicial e Data Final', texto: 'Ou escolha as datas exatas do relatório.' },
      { chave: 'contas', rotulo: 'Contas', texto: 'Escolha quais contas entram no relatório.' },
      { chave: 'atualizar', rotulo: 'Atualizar', texto: 'Monta o relatório com os filtros escolhidos.' },
      { chave: 'csv-sintetico', rotulo: 'CSV Sintético', texto: 'Baixa só os totais de cada favorecido.' },
      { chave: 'csv-analitico', rotulo: 'CSV Analítico', texto: 'Baixa os totais e também cada lançamento.' },
      { chave: 'excel', rotulo: 'Excel', texto: 'Gera a planilha formatada, pronta para imprimir ou enviar.' },
      { chave: 'busca', rotulo: 'Buscar favorecido', texto: 'Filtra a lista pelo nome.' },
      { chave: 'tabela', rotulo: 'Tabela de favorecidos', texto: 'Total pago, recebido e saldo de cada um. Clique numa linha para ver os lançamentos.' },
    ],
    dicas: [],
  },
  'reports:fluxo-conta': {
    titulo: 'Fluxo de Caixa por Conta',
    descricao: 'Os movimentos e o saldo acumulado de uma conta, de um grupo ou das contas principais, incluindo o que está agendado.',
    itens: [
      { chave: 'voltar', rotulo: 'Voltar aos Relatórios', texto: 'Volta para a lista de relatórios.' },
      { chave: 'visao', rotulo: 'Por Conta / Por Grupo / Contas Principais', texto: 'Escolha se quer ver contas avulsas, um grupo de contas ou as que somam no Saldo Principal.' },
      { chave: 'provisorio', rotulo: 'Provisório', texto: 'Adiciona uma entrada ou saída de teste, só para simular.', modulo: 'pode:fluxo:incluir' },
      { chave: 'selecao', rotulo: 'Contas / Grupo de Contas', texto: 'Escolha as contas ou o grupo que entram no relatório.' },
      { chave: 'datas', rotulo: 'Data inicial e Data final', texto: 'O período do relatório.' },
      { chave: 'incluir-agendamentos', rotulo: 'Incluir agendamentos', texto: 'Soma também o que ainda vai acontecer, não só o que já foi lançado.' },
      { chave: 'ocultar-reserva', rotulo: 'Ocultar movimentos de reserva', texto: 'Tira da lista os depósitos e resgates de reserva.' },
      { chave: 'ocultar-patrimonio', rotulo: 'Ocultar movimentos de patrimônio', texto: 'Tira da lista compras e vendas de bens e investimentos.' },
      { chave: 'resumo', rotulo: 'Entradas, Saídas e Saldo Projetado', texto: 'Os totais do período e onde o saldo deve terminar.' },
      { chave: 'exportar', rotulo: 'Exportar Excel', texto: 'Gera a planilha das movimentações.' },
      { chave: 'caixinha', rotulo: 'Caixinha da linha', texto: 'Desmarque uma linha para ver o saldo sem ela.' },
      { chave: 'data', rotulo: 'Data (clicável)', texto: 'Clique na data de um agendamento para simular outro dia.' },
    ],
    dicas: [
      'O saldo parte do dia anterior à data inicial e vai somando cada movimento do período.',
    ],
  },
  alerts: {
    titulo: 'Alertas',
    descricao: 'O que vence hoje e nos próximos dias, e os avisos que precisam da sua atenção.',
    itens: [
      { chave: 'abas', rotulo: 'Vencimentos / Integridade', texto: 'Troque entre os vencimentos e a conferência automática dos dados.' },
      { chave: 'notificacoes', rotulo: 'Ativar Notificações', texto: 'Deixa o navegador avisar quando uma conta vence hoje.' },
      { chave: 'duplicados', rotulo: 'Conferir em Agendamentos', texto: 'Uma ocorrência não foi registrada sozinha porque já existe um lançamento parecido; confira e decida em Agendamentos.', modulo: 'pagina:schedule' },
      { chave: 'alertas-vencimento', rotulo: 'Alertas de vencimento', texto: 'Contas a pagar e faturas perto do vencimento.' },
      { chave: 'dispensar', rotulo: 'Dispensar', texto: 'Tira o alerta da lista quando você já cuidou dele.' },
      { chave: 'calendario-cartoes', rotulo: 'Calendário de Vencimentos — Cartões', texto: 'O próximo vencimento de cada cartão, quantos dias faltam e o valor da fatura.' },
    ],
    dicas: [
      'O aviso de vencimento usa os dias de antecedência definidos em cada agendamento ("Lembrar com Antecedência").',
    ],
  },
  'alerts:integridade': {
    titulo: 'Integridade',
    descricao: 'Confere faturas, parcelas e subcontas com as regras do Finup e lista o que não bate. Ela só aponta — nada é corrigido sem você mandar.',
    itens: [
      { chave: 'varrer', rotulo: 'Varrer agora', texto: 'Faz uma nova conferência de todos os dados.', modulo: 'pode:alertas:editar' },
      { chave: 'status', rotulo: 'Pendentes / Ignoradas / Resolvidas', texto: 'Escolha quais pendências quer ver.' },
      { chave: 'corrigir-todas', rotulo: 'Corrigir todas', texto: 'Aplica de uma vez as correções que o Finup sabe fazer sozinho e confere de novo.', modulo: 'pode:alertas:editar' },
      { chave: 'corrigir', rotulo: 'Corrigir', texto: 'Mostra a correção proposta para a pendência antes de aplicar.', modulo: 'pode:alertas:editar' },
      { chave: 'abrir-lancamento', rotulo: 'Abrir lançamento / Ir para a fatura', texto: 'Abre o lançamento ou a fatura envolvidos para você conferir.' },
      { chave: 'ignorar', rotulo: 'Ignorar / Reabrir', texto: 'Tira da lista uma pendência que você sabe que está certa, ou traz de volta uma ignorada.', modulo: 'pode:alertas:editar' },
    ],
    dicas: [
      'Faturas já fechadas não são avaliadas.',
    ],
  },
  assistente: {
    titulo: 'Assistente',
    descricao: 'Conte o que aconteceu do seu jeito — escrevendo, falando ou mandando uma foto, print ou PDF — e o Assistente prepara o lançamento, o agendamento ou a consulta. Nada é salvo sem você conferir.',
    itens: [
      { chave: 'texto', rotulo: 'Campo de texto', texto: 'Escreva o que quer lançar ou consultar, com as suas palavras. Também dá para colar um print aqui.' },
      { chave: 'microfone', rotulo: 'Microfone', texto: 'Fale em vez de digitar. Ele para sozinho quando você fica em silêncio, ou toque de novo para parar.' },
      { chave: 'camera', rotulo: 'Câmera', texto: 'Tira a foto de um cupom, nota, boleto ou comprovante.' },
      { chave: 'anexar', rotulo: 'Anexar', texto: 'Escolhe uma imagem ou um PDF já salvo: print, comprovante de Pix, boleto, fatura, nota fiscal ou extrato (PDF até 3 MB).' },
      { chave: 'enviar', rotulo: 'Enviar', texto: 'Manda o pedido. A resposta vem como uma prévia para você conferir, mudar o que quiser e só então salvar.' },
    ],
    dicas: [
      'Fatura ou extrato em PDF com vários lançamentos vira uma lista para confirmar um por um.',
      'O Assistente nunca exclui nada. Para excluir, ele mostra onde fazer isso.',
    ],
  },
  clientes: {
    titulo: 'Clientes Finup',
    descricao: 'Tela do administrador da plataforma: pedidos de novos clientes, cadastro, aprovação e acompanhamento de cada cliente.',
    itens: [
      { chave: 'abas', rotulo: 'Clientes / Consumo de IA', texto: 'Alterna entre a lista de clientes e o consumo do Assistente por cliente.' },
      { chave: 'filtro-status', rotulo: 'Filtro por situação', texto: 'Mostra os clientes de uma situação (pedido, ativo, suspenso…), com a quantidade em cada uma.' },
      { chave: 'recarregar', rotulo: 'Recarregar', texto: 'Atualiza a lista de clientes.' },
      { chave: 'novo', rotulo: 'Novo cliente', texto: 'Cadastra um cliente à mão, sem esperar o pedido pelo site.' },
      { chave: 'lista', rotulo: 'Lista de clientes', texto: 'Clique num cliente para ver os dados e as ações: aprovar, reenviar convite, mensagem de boas-vindas, editar ou excluir. O ícone de gráfico abre a Análise do Cliente.' },
    ],
    dicas: [
      'Para excluir um cliente, cancele-o antes.',
    ],
  },
  'clientes:consumo': {
    titulo: 'Consumo de IA',
    descricao: 'Quanto cada cliente usou o Assistente no período e o custo estimado, com a tabela de preços usada no cálculo.',
    itens: [
      { chave: 'periodo', rotulo: 'Período', texto: 'Este mês, o mês anterior ou um intervalo de datas à sua escolha.' },
      { chave: 'cliente', rotulo: 'Cliente', texto: 'Mostra todos os clientes juntos ou só um.' },
      { chave: 'recarregar', rotulo: 'Recarregar', texto: 'Lê de novo o consumo de cada cliente.' },
      { chave: 'totais', rotulo: 'Totais', texto: 'Chamadas, tokens, imagens, custo estimado em dólar e em reais e tempo médio de resposta.' },
      { chave: 'precos', rotulo: 'Preços', texto: 'O preço de cada modelo por milhão de tokens, com a data em que passou a valer. Sem preço, o custo fica parcial.' },
    ],
    dicas: [
      'É uma estimativa pelos tokens registrados: o valor cobrado de verdade está no Console da Anthropic.',
    ],
  },
  settings: {
    titulo: 'Configurações',
    descricao: 'Ajustes do Finup: perfis, categorias, grupos de contas, período financeiro, regras e dados. Escolha a aba no alto e, quando houver, a seção no menu ao lado.',
    itens: [
      { chave: 'caminho', rotulo: 'Você está em', texto: 'Mostra a aba e a seção abertas agora.' },
      { chave: 'aba-geral', rotulo: 'Geral', texto: 'Período financeiro, identidade do ambiente, estornos e IOF de cartão, perfis e agenda no celular.' },
      { chave: 'aba-cadastros', rotulo: 'Cadastros', texto: 'Categorias, centros de custo, grupos de contas, controle gerencial, favorecidos, tipos de documento, apelidos e atalhos.' },
      { chave: 'aba-regras', rotulo: 'Regras', texto: 'Regras que preenchem categoria e grupo gerencial sozinhas pela descrição do lançamento.' },
      { chave: 'aba-dados', rotulo: 'Dados', texto: 'Backup, manutenção e os dados guardados neste aparelho.' },
      { chave: 'aba-usuarios', rotulo: 'Usuários', texto: 'Quem pode entrar no sistema e o que cada pessoa pode fazer.', modulo: 'pode:usuarios:ver' },
      { chave: 'aba-perigo', rotulo: 'Zona de perigo', texto: 'Ações que apagam dados e não têm volta.' },
      { chave: 'secoes', rotulo: 'Seções', texto: 'O menu da aba: clique numa seção para abrir os ajustes dela.' },
    ],
    dicas: [
      'Cada seção tem o próprio guia: abra a seção e toque no "?" para ver os botões dela.',
      'Se aparecer "Somente leitura", o seu nível de acesso permite ver, mas não gravar, aquela seção.',
    ],
  },
  'settings:agenda-celular': {
    titulo: 'Agenda no celular',
    descricao: 'Mostra os agendamentos pendentes e as faturas em aberto na agenda do iPhone ou no Google Agenda.',
    itens: [
      { chave: 'mostrar', rotulo: 'Mostrar na agenda', texto: 'Escolha se a agenda mostra despesas, receitas ou as duas.' },
      { chave: 'valores', rotulo: 'Mostrar valores', texto: 'Com "Não", cada compromisso aparece só com o nome, sem o valor.' },
      { chave: 'criar', rotulo: 'Criar minha agenda', texto: 'Gera o seu link de agenda pela primeira vez.' },
      { chave: 'iphone', rotulo: 'Adicionar ao iPhone', texto: 'Abre a agenda do iPhone para assinar o calendário.' },
      { chave: 'google', rotulo: 'Adicionar ao Google Agenda', texto: 'Abre o Google Agenda para assinar o calendário.' },
      { chave: 'copiar', rotulo: 'Copiar link', texto: 'Copia o link para colar em outro aplicativo de agenda.' },
      { chave: 'novo-link', rotulo: 'Gerar novo link', texto: 'Troca o link; as assinaturas antigas param de atualizar.' },
    ],
    dicas: [
      'Quais agendamentos entram você escolhe em cada agendamento ou em lote na lista de Agendamentos.',
      'A agenda é só para consulta: pagar e editar continuam no Finup.',
    ],
  },
  'settings:apelidos-ia': {
    titulo: 'Apelidos da IA',
    descricao: 'Termos que o Assistente aprendeu quando você corrigiu uma sugestão dele; passam a valer nas próximas vezes.',
    itens: [
      { chave: 'recarregar', rotulo: 'Recarregar', texto: 'Busca a lista de novo.' },
      { chave: 'termo', rotulo: 'Termo', texto: 'A palavra que você usa; edite e saia do campo para gravar.' },
      { chave: 'destino', rotulo: 'Vai para', texto: 'A categoria, conta ou favorecido para onde o termo leva.' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove o apelido.', modulo: 'pode:cadastros:excluir' },
    ],
    dicas: [
      'Apelido que aponta para um cadastro apagado ou renomeado aparece marcado e é ignorado.',
    ],
  },
  'settings:atalhos': {
    titulo: 'Atalhos',
    descricao: 'As combinações de teclas de cada ação. Valem só no computador.',
    itens: [
      { chave: 'restaurar-todos', rotulo: 'Restaurar todos os padrões', texto: 'Volta todos os atalhos personalizados para o padrão.' },
      { chave: 'gravar', rotulo: 'Gravar atalho', texto: 'Clique e aperte a nova combinação (com Alt ou Ctrl); Esc cancela.' },
      { chave: 'desativar', rotulo: 'Desativar', texto: 'Deixa a ação sem atalho.' },
      { chave: 'restaurar', rotulo: 'Restaurar padrão', texto: 'Volta o atalho dessa ação para o padrão.' },
      { chave: 'fixos', rotulo: 'Fixos', texto: 'Atalhos que não podem ser mudados.' },
    ],
    dicas: [
      'Aperte Shift+? em qualquer tela para ver os atalhos dela.',
    ],
  },
  'settings:backup': {
    titulo: 'Backup',
    descricao: 'Baixe uma cópia de todos os dados do app ou restaure uma cópia anterior.',
    itens: [
      { chave: 'contagem', rotulo: 'Contas, lançamentos, agendamentos', texto: 'Quanto existe hoje, para conferir antes de exportar ou restaurar.' },
      { chave: 'exportar', rotulo: 'Exportar backup completo', texto: 'Baixa um arquivo com todos os dados.' },
      { chave: 'importar', rotulo: 'Importar backup', texto: 'Substitui todos os dados atuais pelos do arquivo escolhido.' },
    ],
    dicas: [
      'Restaurar um backup não tem volta: exporte um backup atual antes.',
    ],
  },
  'settings:categorias': {
    titulo: 'Categorias',
    descricao: 'As categorias de receita e despesa, organizadas em grupos, e a ordem em que aparecem nos seletores.',
    itens: [
      { chave: 'padrao', rotulo: 'Padrão', texto: 'Volta grupos e categorias para a ordem padrão.' },
      { chave: 'novo-grupo', rotulo: '+ Grupo', texto: 'Cria um grupo de categorias.' },
      { chave: 'filtro-perfil', rotulo: 'Mostrar categorias de', texto: 'Mostra só as categorias de um perfil.' },
      { chave: 'grupo-editar', rotulo: 'Renomear / excluir grupo', texto: 'Muda o nome do grupo; um grupo só pode ser excluído quando está vazio.' },
      { chave: 'ordem', rotulo: 'Arrastar ⠿ e setas', texto: 'Arraste ou use as setas para mudar a ordem de grupos e categorias.' },
      { chave: 'cat-grupo', rotulo: 'Grupo da categoria', texto: 'Passa a categoria para outro grupo, sem mexer nos lançamentos.' },
      { chave: 'cat-gerencial', rotulo: 'Grupo gerencial padrão', texto: 'O grupo gerencial que já vem escolhido ao lançar nesta categoria.', modulo: 'gerencial' },
      { chave: 'cat-investimento', rotulo: 'Conta de investimento', texto: 'Despesas de cartão nesta categoria geram um aporte automático nessa conta.' },
      { chave: 'cat-espelho', rotulo: 'Espelho', texto: 'Ligado, cada lançamento nesta categoria cria uma cópia na conta vinculada (por exemplo, empréstimos).' },
      { chave: 'cat-excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove a categoria.' },
      { chave: 'nova-categoria', rotulo: 'Adicionar categoria', texto: 'Cria uma categoria com nome, grupo, tipo, emoji e perfis.' },
    ],
    dicas: [
      'Para reordenar, deixe o filtro em "Todos os perfis".',
      'O grupo é obrigatório: escolha um existente ou digite um nome novo para criá-lo junto.',
    ],
  },
  'settings:centros-custo': {
    titulo: 'Centros de custo',
    descricao: 'Rótulos livres para separar lançamentos por finalidade.',
    itens: [
      { chave: 'lista', rotulo: 'Centros cadastrados', texto: 'Os centros de custo que você já criou.' },
      { chave: 'novo', rotulo: 'Adicionar', texto: 'Digite o nome e adicione um novo centro de custo.' },
    ],
    dicas: [],
  },
  'settings:classificacao': {
    titulo: 'Regras de classificação',
    descricao: 'Categoria e favorecido aplicados automaticamente quando a descrição do lançamento contém um texto.',
    itens: [
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove a regra.' },
      { chave: 'nova', rotulo: 'Adicionar', texto: 'Digite o texto que a descrição deve conter e escolha a categoria.' },
    ],
    dicas: [
      'As regras também são criadas sozinhas quando você classifica lançamentos importados.',
    ],
  },
  'settings:controle-gerencial': {
    titulo: 'Controle gerencial',
    descricao: 'Liga ou desliga o controle gerencial do ambiente e cadastra os grupos usados para separar os gastos do cartão.',
    itens: [
      { chave: 'chave', rotulo: 'Usar controle gerencial', texto: 'Liga ou desliga o controle gerencial para o ambiente todo; o histórico fica guardado.' },
      { chave: 'novo-grupo', rotulo: '+ Grupo', texto: 'Cria um novo grupo gerencial, com nome, apelido e conta de resgate.', modulo: 'gerencial' },
      { chave: 'editar', rotulo: 'Editar (lápis)', texto: 'Altera o nome, o apelido ou a conta de resgate do grupo.', modulo: 'gerencial' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove o grupo. Os grupos marcados como fixos não podem ser removidos.', modulo: 'gerencial' },
    ],
    dicas: [
      'Para desligar, as subcontas gerenciais precisam estar com saldo zero e sem agendamentos pendentes; o Finup mostra o que falta.',
      'Esta seção só aparece no computador.',
    ],
  },
  'settings:dados-aparelho': {
    titulo: 'Dados deste aparelho',
    descricao: 'Apaga os dados guardados neste navegador ou celular e encerra a sessão. Os dados na nuvem não são afetados.',
    itens: [
      { chave: 'apagar', rotulo: 'Sair e apagar dados deste aparelho', texto: 'Use em computador compartilhado, ao terminar.' },
    ],
    dicas: [
      'Se houver alterações ainda não enviadas, envie antes de apagar.',
    ],
  },
  'settings:depara-importacao': {
    titulo: 'De-para de importação',
    descricao: 'Quando um arquivo importado traz uma categoria que não existe no Finup, ela vira a categoria escolhida aqui.',
    itens: [
      { chave: 'recarregar', rotulo: 'Recarregar', texto: 'Busca a lista de novo.' },
      { chave: 'novo', rotulo: 'Adicionar', texto: 'Digite o texto como vem no arquivo e escolha a categoria do Finup.', modulo: 'pode:lancamentos:incluir' },
      { chave: 'categoria', rotulo: 'Categoria do Finup', texto: 'Troca a categoria de um de-para já salvo.' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove o de-para.', modulo: 'pode:lancamentos:incluir' },
    ],
    dicas: [
      'Os de-paras também são criados na prévia da importação, ao escolher a categoria correspondente.',
    ],
  },
  'settings:estornos': {
    titulo: 'Estorno e IOF de cartão',
    descricao: 'Como tratar estornos que aparecem na fatura do cartão e qual alíquota de IOF usar em compras internacionais.',
    itens: [
      { chave: 'estorno', rotulo: 'Aplicar categoria padrão para estornos', texto: 'Ligado, os estornos da fatura já entram com a categoria escolhida.' },
      { chave: 'estorno-categoria', rotulo: 'Categoria', texto: 'A categoria usada nos estornos de cartão.' },
      { chave: 'iof', rotulo: 'Alíquota do IOF (%)', texto: 'O percentual de IOF usado para estimar compras em moeda estrangeira.' },
    ],
    dicas: [
      'Na importação da fatura, a compra e o IOF recebem o valor real cobrado.',
    ],
  },
  'settings:favorecidos': {
    titulo: 'Favorecidos',
    descricao: 'O cadastro de favorecidos: inclua os nomes que já estão em uso, renomeie e junte nomes repetidos.',
    itens: [
      { chave: 'sincronizar', rotulo: 'Sincronizar com lançamentos', texto: 'Inclui no cadastro os nomes usados em lançamentos, agendamentos e regras que ainda não estão nele.' },
      { chave: 'busca', rotulo: 'Buscar favorecido', texto: 'Filtra a lista pelo nome.' },
      { chave: 'selecionar', rotulo: 'Marcar', texto: 'Marque dois ou mais nomes para juntá-los em um só.' },
      { chave: 'mesclar', rotulo: 'Mesclar', texto: 'Escolha o nome final e veja a prévia antes de aplicar.' },
      { chave: 'renomear', rotulo: 'Renomear', texto: 'Troca o nome em todos os lançamentos, agendamentos e regras.' },
    ],
    dicas: [
      'Marque "Usar esse nome nas próximas importações" para que o nome novo seja aplicado sozinho.',
    ],
  },
  'settings:grupo-gerencial': {
    titulo: 'Regras de grupo gerencial',
    descricao: 'Escolhem o grupo gerencial na importação da fatura pela descrição, parcelamento e valor. Vale a primeira que bater.',
    itens: [
      { chave: 'ordem', rotulo: 'Setas', texto: 'Mudam a ordem em que as regras são testadas.', modulo: 'gerencial' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove a regra.', modulo: 'gerencial' },
      { chave: 'nova', rotulo: 'Nova regra', texto: 'Palavra-chave, parcelado ou à vista, valor mínimo e máximo e o grupo gerencial.', modulo: 'gerencial' },
    ],
    dicas: [
      'Esta seção só aparece no computador.',
    ],
  },
  'settings:grupos-contas': {
    titulo: 'Grupos de contas',
    descricao: 'Agrupam as contas (por exemplo, por banco) e definem a ordem em que aparecem nos seletores.',
    itens: [
      { chave: 'padrao', rotulo: 'Padrão', texto: 'Volta os grupos para a ordem padrão.' },
      { chave: 'ordem', rotulo: 'Arrastar ⠿ e setas', texto: 'Arraste ou use as setas para mudar a ordem dos grupos.' },
      { chave: 'inibir', rotulo: 'Inibir / Reativar (olho)', texto: 'Esconde o grupo do app sem apagá-lo; o olho reativa.' },
      { chave: 'editar', rotulo: 'Editar (lápis)', texto: 'Muda o nome e a conta âncora, usada no ajuste de saldo do grupo.' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove o grupo; as contas dele ficam sem grupo.' },
      { chave: 'novo', rotulo: 'Novo grupo', texto: 'Escolha Financeiro ou Patrimonial, digite o nome e clique em +.' },
    ],
    dicas: [],
  },
  'settings:guias': {
    titulo: 'Guias das telas',
    descricao: 'Escolha se o guia de cada tela deve aparecer sozinho quando você entra nela. O botão "?" ao lado do título continua abrindo o guia quando quiser.',
    itens: [
      { chave: 'interruptor', rotulo: 'Guias do sistema', texto: 'Liga ou desliga todos os guias de uma vez. Desligados, nenhum tour abre sozinho e o "?" some.' },
      { chave: 'reativar', rotulo: 'Reativar todos os guias', texto: 'Volta a mostrar o guia de todas as telas, inclusive as que você marcou "Não mostrar mais".' },
      { chave: 'desativar', rotulo: 'Desativar todos os guias', texto: 'Para de abrir o guia sozinho em todas as telas, de uma vez.' },
      { chave: 'lista', rotulo: 'Lista de telas', texto: 'Mostra se o tour de cada tela abre sozinho e deixa mudar uma por uma.' },
    ],
    dicas: [
      'Vale para você, em qualquer aparelho. Os outros usuários escolhem por conta própria.',
    ],
  },
  'settings:identidade': {
    titulo: 'Identidade do ambiente',
    descricao: 'O nome e a frase que aparecem no rodapé da barra lateral e no cabeçalho dos relatórios em Excel.',
    itens: [
      { chave: 'nome', rotulo: 'Nome do ambiente', texto: 'De quem é o sistema. Vazio, os relatórios usam o nome de quem está logado.' },
      { chave: 'frase', rotulo: 'Frase do ambiente', texto: 'Uma frase opcional para os relatórios. Vazia, a linha não aparece.' },
      { chave: 'salvar', rotulo: 'Salvar', texto: 'Grava o nome e a frase.', modulo: 'pode:configuracoes:editar' },
    ],
    dicas: [],
  },
  'settings:importacao': {
    titulo: 'Importação',
    descricao: 'Importação do histórico de lançamentos de outro aplicativo, revisando linha a linha antes de gravar.',
    itens: [
      { chave: 'recarregar', rotulo: 'Recarregar', texto: 'Busca de novo as linhas pendentes.' },
      { chave: 'abas', rotulo: 'Conta Corrente / Cartões', texto: 'Escolha o tipo do arquivo que vai importar.' },
      { chave: 'arquivo', rotulo: 'Selecionar arquivo', texto: 'Envia a planilha (XLS/XLSX) para revisão.' },
      { chave: 'contagem', rotulo: 'Pendentes, confirmados, ignorados', texto: 'Quantas linhas estão em cada situação.' },
      { chave: 'confirmar', rotulo: 'Confirmar importação', texto: 'Grava as linhas marcadas como lançamentos.' },
      { chave: 'ignorar', rotulo: 'Ignorar', texto: 'Descarta as linhas marcadas.' },
      { chave: 'limpar', rotulo: 'Limpar pendentes', texto: 'Remove todas as pendências, sem mexer no que já foi confirmado.' },
    ],
    dicas: [
      'Linhas em amarelo estão sem conta e precisam de revisão.',
    ],
  },
  'settings:manutencao': {
    titulo: 'Manutenção',
    descricao: 'Ferramentas para corrigir diferenças nos dados. Nada muda até você confirmar.',
    itens: [
      { chave: 'rateio', rotulo: 'Rateio de agendamentos nas baixas', texto: 'Encontra lançamentos que pagaram um agendamento dividido e ficaram sem a divisão.' },
      { chave: 'rateio-procurar', rotulo: 'Procurar', texto: 'Lista esses lançamentos para você conferir e aplicar a divisão.' },
      { chave: 'recalcular-saldos', rotulo: 'Recalcular todos os saldos', texto: 'Refaz o saldo de cada conta a partir do saldo inicial e dos lançamentos.' },
      { chave: 'corrigir-gerencial', rotulo: 'Corrigir Dados Gerenciais', texto: 'Arruma as transferências e os agendamentos gerenciais dos parcelados.', modulo: 'gerencial' },
      { chave: 'recalcular-faturas', rotulo: 'Recalcular Agendamentos de Faturas', texto: 'Refaz os agendamentos de pagamento das faturas de cada cartão.' },
      { chave: 'ajuste-grupo', rotulo: 'Ajuste de saldo por grupo', texto: 'Escolha o grupo, a data e o saldo real; o Finup calcula a diferença antes de ajustar.' },
      { chave: 'desfazer', rotulo: 'Restaurar saldo anterior', texto: 'Desfaz o último ajuste de saldo.' },
    ],
    dicas: [
      'O ajuste por grupo precisa de uma conta âncora definida em Cadastros › Grupos de contas.',
    ],
  },
  'settings:perfis': {
    titulo: 'Perfis',
    descricao: 'As pessoas e empresas (CPF/CNPJ) donas das contas. Os perfis separam contas, lançamentos e relatórios.',
    itens: [
      { chave: 'novo', rotulo: 'Novo Perfil', texto: 'Cadastra uma pessoa ou empresa.' },
      { chave: 'ordem', rotulo: 'Subir / Descer', texto: 'Muda a ordem dos perfis nos seletores e nos botões do topo.' },
      { chave: 'editar', rotulo: 'Editar (lápis)', texto: 'Altera nome, documento, cor ou tipo do perfil.' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove o perfil; as contas dele ficam sem perfil.' },
      { chave: 'principal', rotulo: 'Perfil principal', texto: 'No formulário do perfil: marca o perfil que já vem escolhido ao abrir o Finup.' },
    ],
    dicas: [
      'Com perfis cadastrados, aparece um filtro por perfil na barra superior.',
    ],
  },
  'settings:periodo': {
    titulo: 'Período financeiro',
    descricao: 'Define quando o seu mês financeiro começa e termina, para agrupar receitas e despesas no Painel e nos relatórios.',
    itens: [
      { chave: 'modo', rotulo: 'Mês corrido / Mês personalizado', texto: 'Mês corrido vai do dia 1 ao fim do mês; personalizado começa no dia que você escolher.' },
      { chave: 'dia-inicio', rotulo: 'Dia de início do mês financeiro', texto: 'O dia em que o seu mês financeiro começa (por exemplo, o dia do salário).' },
      { chave: 'salvar', rotulo: 'Salvar', texto: 'Grava o modo e o dia de início.' },
    ],
    dicas: [
      'No mês personalizado, o período leva o nome do mês em que começa.',
    ],
  },
  'settings:tipos-documento': {
    titulo: 'Tipos de documento',
    descricao: 'Tipos que classificam agendamentos e lançamentos (boleto, fatura, recibo…) e aparecem na coluna "Doc.".',
    itens: [
      { chave: 'novo', rotulo: 'Novo tipo', texto: 'Cadastra um tipo com nome, sigla, natureza e cor.' },
      { chave: 'ordem', rotulo: 'Arrastar ⠿ e setas', texto: 'Muda a ordem dos tipos nos formulários.' },
      { chave: 'ativo', rotulo: 'Ativo / Inativo', texto: 'Inativo some dos formulários, mas continua nos registros antigos.' },
      { chave: 'editar', rotulo: 'Editar (lápis)', texto: 'Altera nome, sigla, natureza ou cor.' },
      { chave: 'excluir', rotulo: 'Excluir (lixeira)', texto: 'Remove o tipo; se ele estiver em uso, só é inativado.' },
    ],
    dicas: [
      'O tipo do sistema (com cadeado) não pode ser excluído.',
    ],
  },
  'settings:usuarios': {
    titulo: 'Usuários',
    descricao: 'Quem pode entrar no sistema, com o nível de acesso, os perfis permitidos e a situação de cada pessoa.',
    itens: [
      { chave: 'recarregar', rotulo: 'Recarregar', texto: 'Busca a lista de novo.', modulo: 'pode:usuarios:ver' },
      { chave: 'novo', rotulo: 'Novo usuário', texto: 'Cadastra uma pessoa com nome, usuário, e-mail, senha, nível e perfis.', modulo: 'pode:usuarios:ver' },
      { chave: 'link', rotulo: 'Enviar link de senha (e-mail)', texto: 'Manda por e-mail um link para a pessoa criar a própria senha.', modulo: 'pode:usuarios:ver' },
      { chave: 'senha', rotulo: 'Redefinir senha (chave)', texto: 'Define uma senha nova para a pessoa, sem pedir a atual.', modulo: 'pode:usuarios:ver' },
      { chave: 'editar', rotulo: 'Editar (lápis)', texto: 'Muda nome, e-mail, nível de acesso e perfis permitidos.', modulo: 'pode:usuarios:ver' },
      { chave: 'ativar', rotulo: 'Ativar / Desativar', texto: 'Desativado, a pessoa não consegue entrar.', modulo: 'pode:usuarios:ver' },
      { chave: 'desbloquear', rotulo: 'Desbloquear', texto: 'Aparece após senhas erradas: libera o acesso antes dos 15 minutos.', modulo: 'pode:usuarios:ver' },
    ],
    dicas: [
      'Mudanças de nível valem a partir do próximo login da pessoa.',
      'Você não pode desativar o próprio usuário.',
    ],
  },
  'settings:zona-perigo': {
    titulo: 'Zona de perigo',
    descricao: 'Apaga todos os dados do aplicativo. Esta ação não tem volta.',
    itens: [
      { chave: 'apagar', rotulo: 'Apagar Todos os Dados', texto: 'Apaga contas, lançamentos e agendamentos depois de pedir confirmação.' },
    ],
    dicas: [
      'Antes de apagar, exporte um backup em Dados › Backup.',
    ],
  },
}

// Passos do tour visíveis no ambiente/usuário (o último, "Primeiros passos", sempre vai no fim).
export function passosVisiveis(ctx) {
  return PASSOS_BOAS_VINDAS.filter(p => p.mostrar(ctx)).map(p => ({ ...p, dica: p.dicaSe && !p.dicaSe(ctx) ? null : p.dica || null }))
}

// Itens do checklist visíveis e o status de cada um. → { itens: [{ ...item, feito }], completo }
export function checklistComStatus(ctx, dados) {
  const itens = CHECKLIST.filter(i => i.mostrar(ctx)).map(i => ({ ...i, feito: !!i.feito(dados) }))
  return { itens, completo: itens.every(i => i.feito) }
}

// ── Guia da Tela ───────────────────────────────────────────────────────────────────────────────────
// Telas com guia (ids aceitos pela API para "Não mostrar mais").
export const TELAS_COM_GUIA = Object.keys(AJUDA_TELAS)

export const ajudaDaTela = (tela) => AJUDA_TELAS[tela] || null

// `modulo` do item → o item aparece neste ambiente/usuário? (mesmo contexto do tour: mostrar(ctx))
//   'gerencial' | 'ia' | 'contratos' | 'pode:<modulo>:<acao>' | 'pagina:<id da página>'
export function itemVisivel(item, ctx) {
  const m = item?.modulo
  if (!m || !ctx) return true
  if (m === 'gerencial') return !!ctx.gerencialAtivo
  if (m === 'ia') return !!ctx.iaAtiva
  if (m === 'contratos') return !!ctx.podeVer?.('contratos')
  const [tipo, a, b] = m.split(':')
  if (tipo === 'pode') return !!ctx.pode?.(a, b || 'ver')
  if (tipo === 'pagina') return !!ctx.podeVer?.(a)
  return true
}

// Guia pronto para mostrar: { titulo, descricao, itens (só os visíveis, na ordem), dicas } ou null.
export function guiaDaTela(tela, ctx) {
  const g = AJUDA_TELAS[tela]
  if (!g) return null
  return { ...g, itens: (g.itens || []).filter(i => itemVisivel(i, ctx)), dicas: g.dicas || [] }
}
