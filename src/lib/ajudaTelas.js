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
    paraQueServe: 'Resumo da sua vida financeira: quanto você tem disponível, como o mês está indo e como ele deve terminar.',
    itens: [
      ['Saldo Principal', 'O dinheiro disponível do dia a dia — soma das contas marcadas com "Somar no Saldo Principal". Clique para ver como o valor foi calculado.'],
      ['Receitas e Despesas do mês', 'O que entrou e saiu no mês financeiro atual.'],
      ['Projeção', 'Como o saldo deve ficar até o fim do mês, contando os agendamentos que ainda vão acontecer.'],
    ],
    dicas: ['Use o filtro de perfil no topo para ver só uma pessoa ou empresa, ou "Tudo" para ver tudo junto.'],
  },
  accounts: {
    titulo: 'Contas',
    paraQueServe: 'Todas as suas contas e bens, separados em grupos (conta corrente, poupança, investimentos, imóveis…).',
    itens: [
      ['Nova Conta', 'Cadastra uma conta. Escolha o perfil (CPF/CNPJ) dela para que apareça nos totais certos.'],
      ['Grupos', 'Organiza as contas em grupos e define a ordem em que aparecem.'],
      ['Cartão da conta', 'Mostra o saldo de hoje e o saldo futuro. Clique para abrir o extrato.'],
    ],
    dicas: [
      'Conta "Sem vínculo" só aparece no filtro "Tudo".',
      'Contas sem grupo ficam na seção "Sem Grupo", no fim da página.',
    ],
  },
  credit: {
    titulo: 'Cartão de Crédito',
    paraQueServe: 'Acompanhe cada fatura do cartão: as compras, as parcelas, o total e o pagamento.',
    itens: [
      ['Seleção de fatura', 'Escolha o cartão e o mês da fatura que quer ver.'],
      ['Lançamentos da fatura', 'As compras que entram nessa fatura, inclusive as parcelas de compras antigas.'],
      ['Pagar fatura', 'Registra o pagamento a partir da conta pagadora do cartão.'],
    ],
    dicas: ['O dia de fechamento do cartão decide em qual fatura cada compra cai — confira no cadastro do cartão.'],
  },
  schedule: {
    titulo: 'Agendamentos',
    paraQueServe: 'Suas contas a pagar e a receber, com as datas de cada ocorrência.',
    itens: [
      ['Novo agendamento', 'Cria uma conta a pagar ou a receber, única, recorrente (todo mês, toda semana…) ou parcelada.'],
      ['Pagar / Receber', 'Na data, confirma que aconteceu: o agendamento vira um lançamento na conta.'],
    ],
    dicas: ['Ao editar um agendamento recorrente, o Finup pergunta se a mudança vale só para uma ocorrência ou para as próximas.'],
  },
  import: {
    titulo: 'Importar Fatura',
    paraQueServe: 'Traga o arquivo da fatura do cartão (do site do banco) e confira com o que já está lançado no Finup.',
    itens: [
      ['Carregar arquivo', 'Escolha o cartão e o arquivo. O mês da fatura é lido do próprio arquivo quando possível.'],
      ['Revisar lançamentos', 'Veja o que é novo, o que já está no Finup e o que precisa da sua decisão.'],
      ['Confirmar', 'Grava só as linhas novas e marca as já existentes como conferidas.'],
    ],
    dicas: ['Os números do resumo, das abas e do botão Confirmar sempre batem entre si.'],
  },
  'importar-lancamentos': {
    titulo: 'Importar lançamentos',
    paraQueServe: 'Traga extratos e planilhas (Excel, CSV ou OFX) de qualquer banco para dentro do Finup.',
    itens: [
      ['Modelo', 'Na primeira vez, diga em qual coluna está cada informação. O Finup lembra para os próximos arquivos iguais.'],
      ['Desfazer', 'Cada importação pode ser desfeita depois, se algo não sair como esperado.'],
    ],
    dicas: [],
  },
  cashflow: {
    titulo: 'Fluxo de Caixa',
    paraQueServe: 'Mostra como o seu saldo vai ficar nos próximos dias e meses, somando o que já aconteceu com o que está agendado.',
    itens: [
      ['Período', 'Escolha até quando quer enxergar o futuro.'],
      ['Linhas do fluxo', 'Cada entrada e saída prevista, com o saldo depois dela.'],
    ],
    dicas: ['Se o saldo ficar negativo em alguma data, dá tempo de se planejar antes.'],
  },
  transactions: {
    titulo: 'Lançamentos',
    paraQueServe: 'Tudo o que já entrou ou saiu das suas contas e cartões.',
    itens: [
      ['Novo lançamento', 'Registra uma receita, despesa ou transferência.'],
      ['Filtros', 'Encontre lançamentos por período, conta, categoria ou texto.'],
    ],
    dicas: ['Um lançamento pode ser dividido em várias categorias ("Dividir em categorias").'],
  },
  reservas: {
    titulo: 'Reservas',
    paraQueServe: 'O dinheiro separado para objetivos — quanto há em cada reserva e para onde ele foi.',
    itens: [
      ['Saldo das reservas', 'Quanto há guardado em cada objetivo.'],
      ['Movimentos', 'Depósitos, resgates e os gastos pagos com dinheiro da reserva.'],
    ],
    dicas: [],
  },
  envelopes: {
    titulo: 'Envelopes',
    paraQueServe: 'Limites de gasto por assunto no mês (mercado, lazer…) e quanto já foi usado de cada um.',
    itens: [['Barra do envelope', 'A parte cheia é o que já foi gasto; a cor avisa quando está perto do limite ou passou dele.']],
    dicas: [],
  },
  budget: {
    titulo: 'Orçamento',
    paraQueServe: 'Defina quanto pretende gastar em cada categoria e compare com o que realmente aconteceu.',
    itens: [['Previsto × realizado', 'Para cada categoria, o valor planejado ao lado do valor gasto.']],
    dicas: [],
  },
  patrimonio: {
    titulo: 'Patrimônio',
    paraQueServe: 'Tudo o que você tem menos o que você deve: contas, investimentos, bens, dívidas e financiamentos.',
    itens: [['Patrimônio Líquido', 'O valor final, somando os bens e descontando as dívidas. Clique para ver a composição.']],
    dicas: [],
  },
  contratos: {
    titulo: 'Contratos',
    paraQueServe: 'Contratos com cobranças que se repetem (aluguel, prestação de serviço) e o andamento de cada um.',
    itens: [['Ficha do contrato', 'Os dados do contrato, os itens cobrados e o histórico de pagamentos.']],
    dicas: [],
  },
  reports: {
    titulo: 'Relatórios',
    paraQueServe: 'Relatórios para analisar o dinheiro por período, conta, categoria ou favorecido, com exportação para Excel.',
    itens: [['Exportar', 'Gera a planilha do relatório na tela, pronta para imprimir ou enviar.']],
    dicas: [],
  },
  alerts: {
    titulo: 'Alertas',
    paraQueServe: 'O que vence hoje e nos próximos dias, e os avisos que precisam da sua atenção.',
    itens: [['Alertas de vencimento', 'Contas a pagar e faturas perto do vencimento.']],
    dicas: [],
  },
  settings: {
    titulo: 'Configurações',
    paraQueServe: 'Ajustes do Finup: perfis, categorias, grupos de contas, período financeiro, regras e dados.',
    itens: [
      ['Perfis', 'Cadastre as pessoas e empresas (CPF/CNPJ) donas das contas.'],
      ['Período financeiro', 'O dia em que o seu mês financeiro começa (por exemplo, o dia do salário).'],
    ],
    dicas: [],
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

export const ajudaDaTela = (pagina) => AJUDA_TELAS[pagina] || null
