# Central de Ajuda — textos para revisão

Gerado de `src/lib/ajudaTelas.js` (explicação `detalhe`, `exemplo`, `dicas`, `errosComuns`) e `src/lib/perguntasFrequentes.js`. Para mudar um texto, edite aqueles arquivos — este documento é só para leitura. Exemplos são fictícios e iguais para todos os clientes.

## Como a Central funciona

- Menu "Ajuda" (computador: barra lateral, logo abaixo de Configurações; celular: Mais › Ajuda › Central de Ajuda). Fica no menu mesmo com os guias desligados.
- Busca "O que você quer fazer?": procura em títulos, textos, exemplos, tarefas "Faça comigo" e perguntas frequentes (sem acento, plural/singular). Primeiro o que tem a palavra no título; depois perguntas, tarefas, telas e funções.
- "Comece por aqui": o resumo das boas-vindas e o checklist Primeiros passos.
- Uma seção por tela que a pessoa enxerga (mesmas regras do menu, das permissões, das abas de Configurações e do controle gerencial; no celular, só as telas que existem no celular). Tela de administrador da plataforma (Clientes Finup) fica de fora.
- Em cada seção: para que serve, "Tour desta tela", "Faça comigo" (as tarefas que começam nela), cada função com explicação, exemplo e "Mostrar na tela" (abre a tela e o tour já naquele item), dicas e erros comuns. Subtelas sem atalho direto (extrato, relatórios, abas internas) não têm "Mostrar na tela".
- Âncoras: `#ajuda`, `#ajuda/<tela>`, `#ajuda/<tela>/<item>` (ex.: `#ajuda/schedule/novo`, `#ajuda/settings%3Aperfis`). O "?" de cada tela (Ajuda detalhada com exemplos), o "Ver com exemplos" do tour e os links das perguntas usam essas âncoras.
- Computador: índice lateral + conteúdo. Celular: acordeão (uma tela aberta por vez).

Total: 58 telas e subtelas, 410 funções, 18 perguntas frequentes.

## Perguntas frequentes

- **Qual a diferença entre lançamento e agendamento?** Lançamento é o que já aconteceu (o dinheiro já entrou ou saiu). Agendamento é o que vai acontecer: uma conta a pagar ou a receber. Na data, você confirma o agendamento e ele vira um lançamento. → `#ajuda/schedule`
- **O que é o Saldo Principal?** É o dinheiro disponível do dia a dia: a soma das contas marcadas com "Somar no Saldo Principal". No Painel, clique nele para ver como o valor foi calculado. → `#ajuda/dashboard`
- **Criei uma conta e ela não aparece. Por quê?** Provavelmente ela está "Sem vínculo" (sem perfil) e há um perfil selecionado no topo. Escolha "Tudo" no topo para vê-la, ou edite a conta e escolha o perfil dela. Conta sem grupo fica na seção "Sem Grupo", no fim da página de Contas. → `#ajuda/accounts`
- **Para que serve o perfil (CPF/CNPJ)?** O perfil é a pessoa ou a empresa dona do dinheiro. Com cada conta ligada a um perfil, você vê os números de cada um separados, ou de todos juntos no filtro "Tudo". → `#ajuda/settings:perfis`
- **Como funciona a fatura do cartão?** Cada compra cai na fatura pelo dia de fechamento do cartão: comprou antes do fechamento, entra na fatura que vence neste mês; depois, na do mês seguinte. Na tela Cartão de Crédito você vê cada fatura e registra o pagamento. → `#ajuda/credit`
- **Como lanço uma compra parcelada?** No cartão: faça o lançamento da compra e informe o número de parcelas — o Finup coloca cada parcela na fatura certa. Fora do cartão (boleto, carnê): crie um agendamento parcelado. → `#ajuda/transactions` _(só com o módulo/permissão)_
- **O que é uma provisão?** É um gasto previsto que ainda não tem data ou valor exatos, como IPVA, material escolar ou um conserto. Ele aparece no Fluxo de Caixa para você se preparar, e vira despesa quando acontecer. → `#ajuda/schedule/lancar-provisao`
- **Como cadastro uma conta que se repete todo mês?** Crie um agendamento com a frequência "Mensal". Exemplo: aluguel de R$ 1.500,00 todo dia 10. Ele aparece no Fluxo de Caixa de todos os meses até a data final que você escolher. → `#ajuda/schedule/novo`
- **Importei um arquivo errado. Como desfaço?** Em Importar lançamentos, cada importação aparece na lista com o botão para desfazer. Na Importação de fatura do cartão, use "Estornar" no histórico de importações. → `#ajuda/importar-lancamentos` _(só com o módulo/permissão)_
- **Para que serve o Fluxo de Caixa?** Ele mostra como o seu saldo vai ficar nos próximos dias e meses, somando o que já aconteceu com o que está agendado. Se o saldo ficar negativo em alguma data, dá tempo de se planejar. → `#ajuda/cashflow`
- **O que é a Conta central?** É a conta principal de cada perfil, usada nos pagamentos automáticos, como a fatura do cartão. Cada perfil tem a sua. Defina em Contas, editando a conta. → `#ajuda/accounts`
- **O que é a Conta favorita?** É a conta que já vem escolhida quando você faz um lançamento, para economizar cliques. Pode haver uma por perfil. → `#ajuda/accounts`
- **Como trago a fatura do cartão do site do banco?** Baixe o arquivo da fatura no site do banco (Excel, CSV ou OFX) e use "Importar Fatura". O Finup mostra o que é novo, o que já está lançado e o que precisa da sua decisão antes de gravar. → `#ajuda/import` _(só com o módulo/permissão)_
- **Uma compra teve coisas de categorias diferentes. Como separo?** No lançamento, use "Dividir em categorias" e informe quanto foi de cada uma. Exemplo: R$ 250,00 no posto, sendo R$ 200,00 de combustível e R$ 50,00 de conveniência. → `#ajuda/transactions` _(só com o módulo/permissão)_
- **O Assistente grava as coisas sozinho?** Não. Ele só prepara a prévia — você confere, muda o que quiser e salva. E ele nunca exclui nada. → `#ajuda/assistente` _(só com o módulo/permissão)_
- **Como separo dinheiro para um objetivo?** Use as Reservas: crie um objetivo (por exemplo, viagem ou emergência) e acompanhe quanto já guardou e quanto saiu dele. → `#ajuda/reservas` _(só com o módulo/permissão)_
- **Meu mês começa no dia do salário. Dá para ajustar?** Sim. Em Configurações › Geral › Período financeiro, escolha o dia em que o seu mês começa. Os totais do mês passam a seguir esse período. → `#ajuda/settings:periodo`
- **Os tours estão atrapalhando. Como desligo?** Em Configurações › Geral › Guias das telas, desligue "Guias do sistema". Esta Central de Ajuda continua disponível no menu, e de cada seção você pode iniciar o tour quando quiser. → `#ajuda/settings:guias`

## Painel `dashboard`

Resumo da sua vida financeira: quanto você tem disponível, como o mês está indo e como ele deve terminar.

- **Ver alertas** _(só se: pagina:alerts)_ — Quando uma fatura de cartão está perto de vencer, aparece um aviso no alto do Painel. O link leva para a tela de Alertas, com os detalhes.
  - _Exemplo: "Fatura vence em 2 dias" — clique em "Ver alertas" para ver qual cartão e o valor._
- **Saldo Principal** — Soma o saldo das contas marcadas com "Somar no Saldo Principal" — o dinheiro que você usa no dia a dia. Clicando, você vê conta por conta como o valor foi formado.
  - _Exemplo: conta corrente R$ 1.800,00 + carteira R$ 200,00 = Saldo Principal de R$ 2.000,00._
- **Receitas e Despesas do mês** — Mostram o que entrou e o que saiu no mês financeiro atual e comparam com o mês anterior. Clicando num card, você vê os lançamentos que formam o total.
  - _Exemplo: Despesas do mês R$ 4.200,00, 10% a menos que no mês passado._
- **Projeção** — Parte do saldo de hoje e soma o que ainda está agendado até o fim do mês. Mostra como o mês deve terminar se tudo acontecer como previsto.
  - _Exemplo: saldo hoje R$ 2.000,00, ainda entram R$ 3.000,00 e saem R$ 2.500,00 — o mês deve fechar com R$ 2.500,00._
- **Envelopes do mês** — Mostra cada envelope (limite de gasto) do mês e quanto já foi usado dele. Só aparece quando há envelopes cadastrados.
  - _Exemplo: envelope "Lazer" de R$ 500,00 com R$ 350,00 usados — 70% do limite._
- **Uso da Receita** — Compara o que já saiu com o que entrou no mês. A barra muda de cor quando os gastos se aproximam ou passam da receita.
  - _Exemplo: entrou R$ 5.000,00 e já saiu R$ 4.600,00 — 92% usado, a barra fica em alerta._
- **Receitas vs Despesas** — Coloca lado a lado o que entrou e o que saiu em cada um dos últimos 6 meses. Ajuda a ver se os gastos estão subindo.
  - _Exemplo: as despesas de dezembro passaram as receitas — vale ver por quê._
- **Próximos Vencimentos** — Lista as contas a pagar e a receber dos próximos 7 dias e as que já estão atrasadas, para nada passar.
  - _Exemplo: "Escola — vence amanhã — R$ 900,00"._
- **Maiores Despesas** — Gráfico de pizza com as categorias em que mais saiu dinheiro no período. Clicando numa fatia, você vê os lançamentos daquela categoria.
  - _Exemplo: a fatia "Alimentação" é a maior: clique para ver mercado, padaria e restaurantes._
- **Cheio / Líquido e período** — O período escolhe o mês (atual, anterior ou os últimos 3). "Cheio" mostra o gasto total; "Líquido" desconta o que foi pago com dinheiro de reserva na mesma categoria.
  - _Exemplo: R$ 2.000,00 de viagem pagos com a reserva "Férias" aparecem no Cheio, mas não no Líquido._
- **Ranking por Categoria** — As mesmas despesas do gráfico, em lista ordenada da maior para a menor, com o valor e a parte do total de cada categoria.
  - _Exemplo: 1º Moradia R$ 1.800,00; 2º Alimentação R$ 1.200,00; 3º Transporte R$ 600,00._
- **Top 5 Favorecidos** — Mostra de quem você mais recebeu e com quem mais gastou no mês. Clicando num nome, você vê os lançamentos dele.
  - _Exemplo: o supermercado do bairro aparece em 1º lugar nos gastos, com R$ 900,00._
- **Contas** — Lista cada conta com o saldo atual e cada cartão com a dívida, além da data do último movimento. Conta parada há mais de 30 dias ganha um aviso.
  - _Exemplo: "Poupança — R$ 5.000,00 — último movimento há 45 dias" com aviso: será que falta lançar o rendimento?_

**Dicas**

- Use o filtro de perfil no topo para ver só uma pessoa ou empresa, ou "Tudo" para ver tudo junto.
- Conta de saldo principal sem movimento há mais de 30 dias aparece com um aviso — vale conferir se falta lançar algo.

**Erros comuns**

- Os números parecem pequenos: confira o filtro de perfil no topo — com uma pessoa ou empresa escolhida, só as contas dela entram.

## Início `inicio`

A tela inicial do celular: o seu saldo principal, o resumo do mês e os cards que você escolheu.

- **Olho** — Troca os valores por asteriscos em todo o Finup. Toque de novo para mostrar.
  - _Exemplo: vai abrir o Finup no ônibus? Toque no olho antes para esconder os valores._
- **Perfis** — Cada perfil é uma pessoa ou empresa. Escolhendo um, todos os números da tela passam a ser só dele. "Tudo" junta todos.
  - _Exemplo: escolha o perfil da empresa para ver só o caixa do CNPJ._
- **Buscar** — Abre uma busca única: digite parte do nome, valor ou descrição e o Finup procura em lançamentos, contas e agendamentos.
  - _Exemplo: digite "farmácia" para achar as compras na farmácia._
- **Saldo principal** — Mostra o Saldo Principal, o que entrou e saiu no mês e a previsão de como o mês termina. Tocando, você vê a conta por trás do valor.
  - _Exemplo: Saldo principal R$ 2.000,00, previsão de fechar o mês com R$ 1.500,00._
- **Ver tudo** — Cada card do Início é um resumo. "Ver tudo" abre a tela completa daquele assunto.
  - _Exemplo: no card de Agendamentos, toque em "Ver tudo" para abrir a lista completa de contas a pagar._
- **Personalizar cards do Início** — Liga ou desliga cada card e muda a ordem deles. A escolha fica salva para o seu usuário.
  - _Exemplo: suba o card de Agendamentos para o topo e desligue o de Reservas, se não usa._

## Mais `mais`

Todas as telas que não cabem na barra de baixo, as configurações e a sua sessão.

- **Telas** — Cada quadro abre uma tela do Finup. Só aparecem as telas que o seu acesso permite usar.
  - _Exemplo: toque em "Fluxo de Caixa" para ver a projeção do saldo._
- **Configurações** — Reúne os ajustes: perfis, categorias, regras de classificação, guias das telas e outros. Algumas opções só aparecem para quem administra.
  - _Exemplo: abra Configurações para criar uma categoria nova, como "Pet"._
- **Tema** — Muda as cores do Finup. "Automático" segue o modo claro ou escuro do celular.
  - _Exemplo: escolha "Escuro" para usar à noite sem cansar a vista._
- **Sua sessão** — Mostra o nome do usuário que está usando o Finup neste aparelho. O botão sai da conta.
  - _Exemplo: usou o celular de outra pessoa? Toque em "Sair" antes de devolver._

## Maiores despesas `despesas`

Em que categorias o seu dinheiro foi gasto no período, em pizza ou em ranking.

- **Período** — Escolhe de qual intervalo vêm as despesas: o mês financeiro atual, o anterior ou os últimos meses juntos.
  - _Exemplo: escolha "Mês anterior" para comparar com o que está gastando agora._
- **Pizza / Ranking e Cheio / Líquido** — Pizza mostra as fatias de cada categoria; Ranking mostra a lista em ordem. "Cheio" é o gasto total; "Líquido" desconta o que foi pago com dinheiro de reserva.
  - _Exemplo: escolha Ranking + Líquido para ver quanto cada categoria pesou no dinheiro do dia a dia._
- **Ver todas / Mostrar menos** — Por padrão aparecem só as maiores categorias. "Ver todas" abre a lista completa; "Mostrar menos" recolhe de novo.
  - _Exemplo: toque em "Ver todas (14)" para achar uma categoria pequena, como "Assinaturas"._

**Dicas**

- "Cheio" bate com as Despesas do Mês do Painel; "Líquido" desconta o resgate de reserva da mesma categoria.

## Contas `accounts`

Todas as suas contas e bens, separados em grupos (conta corrente, poupança, investimentos, imóveis…).

- **Saldo Atual** — Soma o saldo de hoje de todas as contas que aparecem na tela, respeitando o perfil escolhido no topo. Quando há lançamentos já feitos com data à frente, aparece também o Saldo Futuro, que já conta com eles.
  - _Exemplo: conta corrente com R$ 2.000,00 e poupança com R$ 500,00 dão Saldo Atual de R$ 2.500,00._
- **Patrimônio Líquido** — É o retrato do que você tem: soma contas, investimentos e bens e tira as dívidas e o que está em aberto no cartão. Clique no card para ver item por item de onde vem o número.
  - _Exemplo: R$ 10.000,00 em contas mais um carro de R$ 40.000,00, menos R$ 15.000,00 de financiamento, dão R$ 35.000,00._
- **N sem grupo (no fim da página) ↓** — Conta sem grupo não some: ela vai para a seção "Sem Grupo", no fim da página. Este aviso mostra quantas estão lá e leva você direto até elas.
  - _Exemplo: "2 sem grupo ↓" — clique, veja as duas contas e arraste cada uma para o grupo certo._
- **Grupos** — Abre a lista de grupos para criar, renomear ou mudar a ordem deles. Grupos do tipo patrimonial servem para bens, dívidas e empréstimos e alimentam a tela Patrimônio.
  - _Exemplo: crie os grupos "Bancos", "Investimentos" e "Veículos" e coloque "Bancos" em primeiro._
- **Nova Conta** _(só se: pode:contas:incluir)_ — Abre o cadastro de conta. Ali você escolhe o tipo (conta corrente, poupança, cartão, dinheiro, bem, dívida…), o nome, o perfil dono e o grupo. Cartão de crédito também é cadastrado por aqui.
  - _Exemplo: tipo "Conta Corrente", nome "Conta do dia a dia", perfil da pessoa física, grupo "Bancos"._
- **Cabeçalho do grupo** — Cada grupo tem um cabeçalho com o nome e o total das contas dele. Clicar recolhe ou abre o grupo, para a tela ficar mais limpa.
  - _Exemplo: recolha o grupo "Investimentos" para ver só as contas do dia a dia._
- **Cartão da conta** — Cada conta aparece num cartão colorido com o saldo de hoje e o saldo futuro. Clique nele para abrir o extrato da conta. Para mudar de grupo, arraste o cartão até o outro grupo.
  - _Exemplo: clique no cartão da conta corrente para ver os lançamentos do mês._
- **Selos da conta** — As etiquetas abaixo do nome resumem a conta: o perfil dono (ou "Sem vínculo"), o apelido, FC (soma no Saldo Principal), INV (investimento), CC (Conta central) e Inativa. "Sem vínculo" quer dizer que a conta não tem perfil: só aparece no filtro "Tudo" e fica fora dos totais dos perfis.
  - _Exemplo: uma conta com os selos "FC" e "CC" soma no Saldo Principal e é a conta que paga as faturas do perfil._
- **Lançar rendimento** _(só se: pode:contas:editar)_ — Você informa o saldo novo que o banco mostra e o app lança a diferença como receita de rendimento. Só aparece quando a conta tem uma categoria de rendimento no cadastro.
  - _Exemplo: a aplicação tinha R$ 1.000,00 e o banco mostra R$ 1.008,50; o app lança R$ 8,50 de rendimento._
- **Editar conta (lápis)** _(só se: pode:contas:editar)_ — Abre o mesmo formulário do cadastro, já preenchido. Dá para trocar nome, apelido, perfil, grupo, saldo inicial e as opções da conta.
  - _Exemplo: a conta está "Sem vínculo"; clique no lápis e escolha o perfil em "Vínculo (CPF / CNPJ)"._
- **Inativar / Reativar (olho)** _(só se: pode:contas:editar)_ — Conta inativa continua com todo o histórico, mas deixa de aparecer na escolha de conta dos lançamentos. Útil para conta encerrada. Clique no olho de novo para reativar.
  - _Exemplo: você encerrou uma conta antiga; inative-a para ela não aparecer mais ao lançar._
- **Excluir conta (lixeira)** _(só se: pode:contas:excluir)_ — Apaga a conta de vez. O app pede confirmação antes. Se a conta tem histórico, prefira inativar.
  - _Exemplo: você criou uma conta de teste por engano; exclua-a pela lixeira._
- **Setas ↑ ↓** _(só se: pode:contas:editar)_ — As setas sobem ou descem a conta uma posição dentro do grupo. A ordem vale para esta tela.
  - _Exemplo: suba a conta que você mais usa para o topo do grupo "Bancos"._
- **Recalcular** _(só se: pode:contas:editar)_ — Refaz o saldo da conta somando, desde o saldo inicial, todos os lançamentos dela. Use quando o saldo parecer errado.
  - _Exemplo: depois de corrigir vários lançamentos antigos, clique em Recalcular para o saldo ficar certo._
- **Atualizar Valor** _(só se: pode:contas:editar)_ — Aparece no cartão das contas do tipo Bem / Ativo, no lugar do "Recalcular". O bem não tem lançamentos para recalcular: você mesmo informa o valor de hoje, e o anterior fica guardado.
  - _Exemplo: o imóvel foi avaliado em R$ 280.000,00; clique em Atualizar Valor e informe o novo número._
- **Definir como favorita** _(só se: pode:contas:editar)_ — A conta favorita ganha uma estrela e já vem escolhida primeiro em Lançamentos. Cada perfil tem uma favorita: marcar outra tira a estrela da anterior do mesmo perfil.
  - _Exemplo: marque como favorita a conta onde cai o seu salário, que é a que você mais usa._

**Dicas**

- Conta "Sem vínculo" não está ligada a nenhum perfil: só aparece no filtro "Tudo", não entra no Saldo Principal nem nos totais dos perfis e não pode ser Conta central. Edite a conta e escolha um perfil.
- Contas sem grupo ficam na seção "Sem Grupo", no fim da página.
- Cartão de crédito com vencimento mais próximo ganha a borda azul e o aviso "Próxima fatura".

**Erros comuns**

- Conta criada "some" da lista: ela foi salva sem perfil e o filtro do topo está num perfil. Escolha "Tudo" no topo, edite a conta e defina o perfil.
- Saldo da conta diferente do banco: confira o Saldo Inicial no cadastro (lápis) e use "Recalcular" para refazer o saldo pelos lançamentos.
- Conta não entra no Saldo Principal: edite a conta e ligue "Somar no Saldo Principal" (selo FC).

## Extrato da conta `accounts:extrato`

Todos os lançamentos da conta no mês escolhido, com o saldo depois de cada um.

- **Voltar** — Fecha o extrato e volta para a lista de contas, no mesmo lugar onde você estava.
  - _Exemplo: terminou de conferir o mês? Clique em Voltar para escolher outra conta._
- **Seletor de mês** — O extrato mostra um mês por vez. As setas levam para o mês anterior ou o seguinte, e o saldo de cada linha acompanha.
  - _Exemplo: clique na seta da esquerda para ver os lançamentos do mês passado._
- **Resumo das faturas** _(só se: gerencial)_ — Aparece em contas gerenciais. Mostra, para cada fatura do cartão, quanto entrou e quanto saiu nesta conta, para você ver se a fatura está coberta.
  - _Exemplo: a fatura de março recebeu R$ 800,00 e gastou R$ 750,00; sobram R$ 50,00 nela._
- **Selecionar** _(só se: pode:lancamentos:editar)_ — Liga caixinhas em cada linha para você marcar vários lançamentos. Depois, a barra de baixo deixa alterar, conciliar ou excluir todos de uma vez.
  - _Exemplo: marque cinco lançamentos de mercado e troque a categoria de todos juntos._
- **Reconciliar** _(só se: pode:lancamentos:editar)_ — Abre a lista do período ao lado do que o banco mostra, para você ir marcando como conferido o que bate. Só no computador.
  - _Exemplo: com o extrato do banco aberto, marque cada lançamento igual como conferido._
- **Conciliar Gerenciais** _(só se: pode:lancamentos:editar)_ — Marca como conferidos, de uma só vez, os lançamentos pendentes do período que envolvem uma conta gerencial. Poupa o trabalho de marcar um por um.
  - _Exemplo: no fim do mês, clique para conferir todas as transferências de controle de uma vez._
- **Excel** _(só se: gerencial)_ — Baixa uma planilha com o extrato do mês, do jeito que está filtrado na tela.
  - _Exemplo: filtre só as saídas e clique em Excel para mandar a lista ao contador._
- **Novo Lançamento** _(só se: pode:lancamentos:incluir)_ — Abre o formulário de lançamento já com esta conta escolhida. Serve para receita, despesa ou transferência.
  - _Exemplo: lance uma despesa de R$ 120,00 de farmácia direto nesta conta._
- **Saldos do mês** — Os quadros do topo mostram o Saldo Atual, o Saldo Futuro (quando há lançamentos com data à frente) e quanto entrou e saiu no mês.
  - _Exemplo: Entradas R$ 5.000,00 e Saídas R$ 3.200,00 mostram que sobraram R$ 1.800,00 no mês._
- **Filtros** — Cada coluna tem um campo de busca. Digite parte da data, do histórico, do favorecido ou da conta; em Entrada e Saída, digite um valor.
  - _Exemplo: digite "luz" no histórico para achar a conta de energia do mês._
- **Todos / Conciliados / Pendentes** — Troca entre ver todos os lançamentos, só os já conferidos com o banco ou só os que ainda faltam conferir.
  - _Exemplo: escolha "Pendentes" para ver o que ainda falta bater com o banco._
- **Limpar filtros (X)** — Apaga de uma vez tudo o que foi digitado nos filtros e volta a mostrar a lista completa.
  - _Exemplo: depois de buscar "luz", clique no X para ver tudo de novo._
- **Ações da linha** — Ao passar o mouse sobre um lançamento aparecem botões para editar, duplicar, estornar ou excluir. Duplicar é útil para gastos parecidos.
  - _Exemplo: duplique a compra de padaria de ontem e só troque a data e o valor._
- **Coluna R** — O círculo da coluna R diz se o lançamento já foi conferido com o banco. Clique para marcar ou desmarcar.
  - _Exemplo: o banco mostra o débito de R$ 89,90; clique no círculo da mesma linha para marcar como conferido._
- **Barra de seleção** — Aparece embaixo quando o modo Selecionar está ligado e há lançamentos marcados. Ela mostra quantos estão marcados e os botões para alterar, conciliar, desconciliar ou excluir.
  - _Exemplo: com 3 lançamentos marcados, clique em Conciliar para conferir os três juntos._

**Dicas**

- Clique numa linha para editar o lançamento.
- Selos "Futuro", "Gerencial" ou "Reserva" indicam lançamento já feito com data à frente: ele já conta no Saldo Futuro.

**Erros comuns**

- Lançamento não aparece: confira o mês no seletor e limpe os filtros (X).
- Saldo Futuro diferente do Saldo Atual: há lançamentos com data à frente; eles só contam no Saldo Atual quando a data chegar.

## Cartão de Crédito `credit`

Acompanhe cada fatura do cartão: as compras, as parcelas, o total e o pagamento.

- **Seleção do cartão** — Se você tem mais de um cartão, escolha aqui qual quer ver. A tela inteira (fatura, totais e lista) passa a ser desse cartão.
  - _Exemplo: troque do cartão pessoal para o cartão da empresa._
- **Editar cartão (lápis)** _(só se: pode:contas:editar)_ — Abre o cadastro do cartão: limite, dias de fechamento e vencimento, finais e a conta que paga a fatura. É o mesmo cadastro da tela Contas.
  - _Exemplo: o banco mudou o vencimento para o dia 15; abra o lápis e troque o Dia de Vencimento._
- **Mês da fatura** — Mostra o mês da fatura que está na tela. As setas levam para a fatura anterior ou a próxima, inclusive faturas futuras com parcelas.
  - _Exemplo: clique na seta da direita para ver quanto das parcelas já cai na fatura do mês que vem._
- **Extrato** _(só se: gerencial)_ — Abre o extrato gerencial do cartão: todas as movimentações de um período, com o grupo gerencial e o saldo corrido. Só no computador.
  - _Exemplo: veja tudo o que passou pelo cartão de janeiro a março numa lista só._
- **Relatório** — Mostra a fatura organizada para conferir e exportar, com os totais por categoria.
  - _Exemplo: abra o relatório para ver quanto da fatura foi de restaurante._
- **Fatura Selecionada** — O total das compras da fatura que está na tela e quantos lançamentos ela tem. Se há despesas agendadas para entrar nela, o card mostra os "previstos" e o total com eles.
  - _Exemplo: R$ 1.200,00 em 18 lançamentos, + R$ 100,00 previstos = R$ 1.300,00 total._
- **Limite Disponível** — Quanto do limite ainda está livre: o limite do cartão menos tudo o que está em aberto, incluindo parcelas futuras.
  - _Exemplo: limite de R$ 5.000,00 com R$ 1.800,00 em aberto deixa R$ 3.200,00 disponíveis._
- **Dívida Total** — Tudo o que você deve neste cartão, somando a fatura atual e as parcelas das próximas. Embaixo aparecem os dias de fechamento e de vencimento.
  - _Exemplo: fatura de R$ 1.000,00 e mais R$ 800,00 de parcelas futuras dão R$ 1.800,00 de dívida._
- **Saldo a Pagar / Valor Pago** — Mostra quanto ainda falta pagar ou quanto já foi pago, e se a fatura está paga, parcialmente paga ou não paga.
  - _Exemplo: fatura de R$ 1.300,00 com R$ 1.000,00 pagos aparece como "Parcialmente paga"._
- **Fechar / Abrir Fatura** _(só se: pode:cartao:editar)_ — Fechar a fatura trava a fatura para ninguém lançar nela sem querer depois de conferida. Se precisar ajustar algo, clique em "Abrir Fatura".
  - _Exemplo: conferiu a fatura com a do banco? Feche-a para não mexer mais._
- **Novo Lançamento** _(só se: pode:cartao:incluir)_ — Abre o formulário já com este cartão escolhido, para lançar uma compra ou um estorno. Fica bloqueado quando a fatura está fechada.
  - _Exemplo: lance uma compra de R$ 300,00 em 3 vezes; as parcelas vão para as próximas faturas._
- **Pagar Fatura** _(só se: pode:cartao:incluir)_ — Registra o pagamento da fatura, saindo da conta pagadora do cartão. Já vem com o total e a data do vencimento; você pode mudar o valor para pagar só uma parte.
  - _Exemplo: pague R$ 1.300,00 da conta corrente no dia do vencimento._
- **Atualizar** _(só se: pode:cartao:editar)_ — Refaz o total da fatura e acerta o valor da conta a pagar dela nos agendamentos. Use depois de mudar várias compras.
  - _Exemplo: você corrigiu o valor de duas compras; clique em Atualizar para a conta a pagar acompanhar._
- **Revisar Movimentos Automáticos** _(só se: pode:cartao:editar)_ — Mostra os ajustes automáticos que o app faria nesta fatura (transferências de controle e resgates) antes de aplicar, para você conferir.
  - _Exemplo: antes de fechar o mês, revise e veja se falta algum resgate de reserva._
- **Selecionar** _(só se: pode:cartao:editar)_ — Liga caixinhas em cada compra para marcar várias e alterar ou conciliar todas de uma vez.
  - _Exemplo: marque todas as compras de combustível e troque a categoria de uma vez._
- **Reconciliar** _(só se: pode:cartao:editar)_ — Abre a lista da fatura para você marcar como conferido o que bate com a fatura do banco. Só no computador.
  - _Exemplo: com a fatura do banco ao lado, marque cada compra igual como conferida._
- **Ações da linha** — Botões no fim de cada compra: editar, duplicar ou excluir.
  - _Exemplo: a compra foi lançada com valor errado; clique em editar e corrija._
- **Coluna R** — O círculo da coluna R diz se a compra já foi conferida com a fatura do banco. Clique para marcar ou desmarcar.
  - _Exemplo: a compra de R$ 59,90 está na fatura do banco; clique no círculo dela._
- **Agendamentos previstos** — São despesas agendadas para cair neste cartão que ainda não viraram compra. Elas entram no total previsto da fatura. Clique para ver a lista.
  - _Exemplo: a assinatura de streaming de R$ 39,90 agendada no cartão aparece aqui até ser lançada._

**Dicas**

- O dia de fechamento do cartão decide em qual fatura cada compra cai — confira no cadastro do cartão.
- Os filtros acima da lista ajudam a achar uma compra por data, descrição, favorecido ou valor.

**Erros comuns**

- Compra caiu na fatura errada: confira o dia de fechamento no cadastro do cartão (lápis).
- "Novo Lançamento" bloqueado: a fatura está fechada. Clique em "Abrir Fatura" se precisar lançar nela.
- Não aparece nenhum cartão: cadastre o cartão em Contas → Nova Conta, tipo "Cartão de Crédito".

## Extrato Gerencial `credit:extrato`

Todas as movimentações do cartão num período, com o saldo corrido depois de cada uma.

- **Cartão** — Escolha de qual cartão você quer o extrato. A lista e o saldo mudam na hora.
  - _Exemplo: escolha o cartão da empresa para ver só as movimentações dele._
- **De** — Primeiro dia do período do extrato. Lançamentos antes desta data ficam de fora.
  - _Exemplo: 01/01 para começar no início do ano._
- **Até** — Último dia do período do extrato. Lançamentos depois desta data ficam de fora.
  - _Exemplo: 31/03 para ver o primeiro trimestre inteiro._
- **Coluna Ger** _(só se: gerencial)_ — Mostra o grupo gerencial de cada lançamento, ou seja, de qual controle o gasto saiu.
  - _Exemplo: um gasto de viagem marcado com o grupo da reserva "Viagem"._
- **Coluna R** — O círculo da coluna R mostra se o lançamento já foi conferido. Clique para marcar ou desmarcar.
  - _Exemplo: clique no círculo do pagamento da fatura depois de ver que ele saiu do banco._
- **Saldo** — O saldo do cartão depois de cada linha. "D" quer dizer que você está devendo; "C" quer dizer que há crédito a seu favor.
  - _Exemplo: "R$ 450,00 D" depois de uma compra; "R$ 0,00" depois do pagamento da fatura._

**Dicas**

- Use "Voltar ao Cartão", no alto, para voltar à fatura.

**Erros comuns**

- Lista vazia: confira se as datas De e Até cobrem o período que você quer ver.

## Agendamentos `schedule`

Suas contas a pagar e a receber, com as datas de cada ocorrência.

- **Lista / Calendário** — A Lista mostra os agendamentos um embaixo do outro, separados por data. O Calendário mostra o mês inteiro, com as contas em cada dia. Os filtros valem nas duas visões.
  - _Exemplo: use o Calendário para ver de relance quais dias do mês concentram mais contas a pagar._
- **Exportar Excel** — Gera uma planilha do Excel com exatamente o que está na tela: mesma aba, mesmo período e mesmos filtros. Bom para conferir ou mandar para outra pessoa.
  - _Exemplo: filtre "Saídas" em "Este mês" e exporte para ter a lista das contas a pagar do mês numa planilha._
- **Executar Gerenciais** _(só se: gerencial)_ — Quando há provisões do controle gerencial esperando, o Finup mostra quantas são. O botão faz de uma vez as transferências de controle entre as contas, sem você precisar fazer uma por uma. Você confere a lista antes de confirmar.
  - _Exemplo: o botão mostra "Executar Gerenciais (3)": clique, confira as três transferências e confirme._
- **Lançar Provisão** _(só se: pode:agendamentos:incluir)_ — Provisão é uma despesa que vai acontecer, mas cujo valor ou data você ainda não sabe com certeza. Você lança uma estimativa e ela já entra no Fluxo de Caixa. Quando a conta chegar, use "Efetivar Provisão" para informar o valor e a data reais.
  - _Exemplo: conserto do carro previsto para março, uns R$ 800,00 — lance como provisão e efetive quando souber o valor certo._
- **Novo Agendamento** _(só se: pode:agendamentos:incluir)_ — Abre o formulário para cadastrar uma conta a pagar (Despesa), a receber (Receita) ou uma transferência entre suas contas. Você escolhe se acontece uma vez só, se repete (todo mês, toda semana…) ou se é parcelada.
  - _Exemplo: aluguel de R$ 1.500,00 todo dia 10, sem data para acabar._
- **Abas** — Cada aba junta um tipo de agendamento. "Agendamentos" são as contas normais; "Cartão de Crédito" são as faturas; "Gerencial" são os movimentos do controle gerencial; "Contas Anuais" são as despesas pagas com dinheiro guardado em reserva. O número em cada aba é quantos estão pendentes.
  - _Exemplo: para ver quando vence a próxima fatura do cartão, abra a aba "Cartão de Crédito"._
- **A pagar / Provisões / Pagos** — "A pagar" mostra o que ainda vai acontecer ou está atrasado. "Provisões" mostra só as despesas estimadas. "Pagos" mostra o que já foi confirmado, com a data e o valor pagos.
  - _Exemplo: escolha "Pagos" e o período "Mês passado" para conferir tudo o que foi pago no mês anterior._
- **Período** — Define de que datas a lista mostra os agendamentos. Contas atrasadas aparecem no topo, em destaque, para não serem esquecidas.
  - _Exemplo: escolha "Próximos 30 dias" para ver tudo o que vence até o mês que vem._
- **Filtros** — Abre um painel com filtros extras. Dá para combinar vários: por exemplo, uma faixa de datas e uma categoria. Para voltar a ver tudo, limpe os filtros.
  - _Exemplo: digite "luz" na descrição para achar só a conta de energia._
- **Conta de reserva** — Aparece na aba Contas Anuais. Cada botão é uma conta de reserva; ao escolher uma, a lista mostra só as despesas que serão pagas com o dinheiro dela.
  - _Exemplo: escolha a reserva "Impostos do ano" para ver só o IPVA e o IPTU que sairão dela._
- **Todos / Entradas / Saídas / Transferências** — Mostra só um tipo de movimento: Entradas (dinheiro que vai entrar), Saídas (dinheiro que vai sair) ou Transferências (entre as suas contas). O número ao lado é quantos há de cada tipo.
  - _Exemplo: clique em "Entradas" para ver só os recebimentos previstos, como salário e aluguéis a receber._
- **Selecionar** _(só se: pode:agendamentos:editar)_ — Liga as caixinhas de seleção nas linhas. Marque vários agendamentos e use a barra que aparece para pagar, pular ou alterar todos juntos.
  - _Exemplo: no fim do mês, selecione as cinco contas já pagas e confirme o pagamento de todas de uma vez._
- **Pagar / Receber** _(só se: pode:agendamentos:editar)_ — Abre a janela de pagamento da próxima ocorrência. Ali você confere a conta, o valor e a data do pagamento. Ao confirmar, vira um lançamento de verdade e o saldo da conta muda.
  - _Exemplo: a conta de internet de R$ 120,00 venceu hoje; clique no botão verde, confira e confirme._
- **Efetivar Provisão** _(só se: pode:agendamentos:editar)_ — Aparece na linha de uma provisão ainda não efetivada. Você informa quanto e quando foi de verdade; a provisão vira uma despesa normal, pronta para ser paga. Em provisão que se repete, a próxima ocorrência continua como estimativa.
  - _Exemplo: a provisão do conserto era R$ 800,00, mas a nota veio de R$ 750,00 no dia 12 — efetive com esses valores._
- **Pular** _(só se: pode:agendamentos:editar)_ — Use quando uma conta que se repete não vai acontecer naquele mês. Nada é lançado e o agendamento avança para a próxima data. Em agendamento único, pular cancela o agendamento (o Finup pergunta antes).
  - _Exemplo: a escola não cobra mensalidade em janeiro — pule a ocorrência de janeiro._
- **Estornar** _(só se: pode:agendamentos:editar)_ — Tira a ocorrência da lista sem gerar lançamento, como se ela não fosse acontecer. A ação não pode ser desfeita, por isso o Finup mostra os dados e pede confirmação.
  - _Exemplo: a cobrança de R$ 50,00 foi cancelada pela loja — estorne a ocorrência._
- **Editar (lápis na linha)** _(só se: pode:agendamentos:editar)_ — Abre o agendamento para mudar valor, data, categoria, conta e outros dados. Em agendamento que se repete, o Finup pergunta se a mudança vale só para uma ocorrência ou também para as próximas.
  - _Exemplo: o condomínio subiu de R$ 600,00 para R$ 650,00 — edite e diga que vale para as próximas._
- **Excluir (lixeira na linha)** _(só se: pode:agendamentos:excluir)_ — Remove o agendamento da lista e do Fluxo de Caixa. O que já foi pago continua lançado nas contas. Pede confirmação antes.
  - _Exemplo: cancelou a assinatura de streaming? Exclua o agendamento para ele sumir dos próximos meses._

**Dicas**

- Ao editar um agendamento recorrente, o Finup pergunta se a mudança vale só para uma ocorrência ou para as próximas.

**Erros comuns**

- O agendamento não aparece na lista: confira o Período e o status (A pagar / Provisões / Pagos) — pode estar fora do intervalo escolhido.
- Pagou e o saldo não mudou: o pagamento só entra na conta depois de clicar em "Pagar" e confirmar. Só criar o agendamento não mexe no saldo.
- Conta paga em dobro: se o lançamento já foi feito à mão, use "Vincular a um lançamento" na janela de pagamento em vez de registrar outro.

## Lançamentos `transactions`

Tudo o que já entrou ou saiu das suas contas e cartões. Escolha uma conta ou uma fatura para ver os lançamentos.

- **Novo** _(só se: pode:lancamentos:incluir)_ — Abre o formulário de lançamento. Se você tiver mais de uma conta, o Finup pergunta primeiro "Qual conta?". Depois é só escolher se é Receita, Despesa ou Transferência e preencher valor, data e categoria.
  - _Exemplo: registrar a conta de luz de R$ 180,00 paga hoje pela conta corrente._
- **Cartão da conta** — Cada cartão mostra uma conta com o saldo de hoje. O saldo é a soma de tudo o que entrou e saiu dela. Clique para ver o extrato com todos os lançamentos da conta.
  - _Exemplo: clicar na conta corrente para conferir as compras da semana._
- **+ no cartão de crédito** _(só se: pode:lancamentos:incluir)_ — O "+" ao lado do nome do cartão já abre o lançamento com esse cartão escolhido. Ali você também pode marcar a compra como parcelada.
  - _Exemplo: uma compra de R$ 600,00 em 3 vezes no cartão._
- **Fatura do cartão** — Abaixo de cada cartão aparecem as faturas, mês a mês, com o total e a quantidade de compras. Clique numa fatura para ver e conferir as compras dela.
  - _Exemplo: abrir a fatura de março para conferir se o total bate com o do banco._

**Dicas**

- Um lançamento pode ser dividido em várias categorias ("Dividir em categorias").

**Erros comuns**

- Não acho o botão "Novo" no celular: no celular, use o botão "+" do rodapé ou abra a conta e toque no "+" dela.
- A compra no cartão caiu na fatura do mês seguinte: é o dia de fechamento do cartão. Compras depois do fechamento vão para a próxima fatura.

## Fatura do cartão `transactions:fatura`

As compras de uma fatura do cartão, com o total e o que já foi conferido.

- **Lançamentos** — Fecha a fatura e volta para a lista de contas e cartões. Nada do que você fez é perdido.
  - _Exemplo: depois de conferir a fatura de abril, voltar para ver a de maio._
- **Reconciliar** _(só se: pode:lancamentos:editar)_ — Mostra só as compras ainda não conferidas. Você marca várias de uma vez como conferidas com a fatura do banco, ou escolhe algumas para alterar juntas.
  - _Exemplo: marcar de uma vez as 20 compras que já bateram com o aplicativo do banco._
- **Novo** _(só se: pode:lancamentos:incluir)_ — Abre um lançamento novo já neste cartão, como despesa. Use para compras que ainda não estão na fatura.
  - _Exemplo: lançar um lanche de R$ 35,00 que você esqueceu de registrar._
- **Fatura e Lançamentos** — O total da fatura e quantas compras ela tem. Os filtros não mudam esse total: ele é sempre da fatura inteira.
  - _Exemplo: fatura de R$ 2.450,00 com 38 lançamentos._
- **Filtros** — Ajudam a achar compras pela data, pelo texto do histórico, pelo favorecido, pela categoria ou pelo valor. Só escondem linhas da lista; o total da fatura continua o mesmo.
  - _Exemplo: filtrar a categoria "Mercado" para ver quanto foi gasto com mercado nesta fatura._
- **Conciliados / Pendentes** — Soma das compras visíveis que já foram conferidas e das que ainda faltam conferir. Quando "Pendentes" chega a zero, a fatura está toda conferida.
  - _Exemplo: Conciliados R$ 2.000,00 e Pendentes R$ 450,00 — faltam R$ 450,00 para conferir._
- **Estornar (seta na linha)** _(só se: pode:lancamentos:incluir)_ — Registra a devolução de uma compra (um crédito no cartão) ligada à compra original. A compra continua lá, e a devolução diminui a fatura.
  - _Exemplo: a loja devolveu os R$ 120,00 de um produto trocado._
- **Editar (lápis na linha)** — Abre a compra para ver todos os dados. Se o seu acesso permitir, você pode mudar categoria, descrição, valor e outros campos e salvar.
  - _Exemplo: trocar a categoria de uma compra de "Outros" para "Farmácia"._
- **Duplicar** _(só se: pode:lancamentos:incluir)_ — Cria uma cópia da compra com a data que você escolher. O formulário abre preenchido e só grava quando você salvar. Em compra parcelada, copia só a parcela clicada.
  - _Exemplo: repetir a mensalidade da academia de R$ 99,00 no mês seguinte._
- **Excluir (lixeira na linha)** _(só se: pode:lancamentos:excluir)_ — Apaga a compra de vez. Se ela tiver um resgate de reserva ligado, o Finup avisa e apaga os dois juntos.
  - _Exemplo: apagar uma compra lançada duas vezes por engano._
- **R (conferido)** — O "R" mostra se a compra já foi conferida com a fatura do banco. Clique para marcar ou desmarcar. Não muda nenhum valor.
  - _Exemplo: marcar o "R" na compra de R$ 89,90 depois de ver que ela está na fatura do banco._

**Dicas**

- O dia de fechamento do cartão decide em qual fatura cada compra cai.

**Erros comuns**

- Apaguei uma compra que foi devolvida: em vez de excluir, use "Estornar". Assim a compra original fica no histórico e a devolução abate a fatura.
- O botão "Reconciliar" não aparece: ele só aparece no computador e quando a fatura tem compras.

## Importar Fatura `import`

Traga o arquivo da fatura do cartão (do site do banco) e confira com o que já está lançado no Finup.

- **Cartão** — O cartão de crédito dono da fatura. As compras novas serão gravadas nele.
  - _Exemplo: escolher o "Cartão Azul" antes de trazer a fatura dele._
- **Mês de Referência** — O mês da fatura. Ao importar, o Finup tenta ler o mês do próprio arquivo e preenche sozinho. Para conciliar, é você quem escolhe o mês antes.
  - _Exemplo: fatura com vencimento em maio → Mês de Referência 05/2025._
- **Carregar arquivo** — Clique, arraste ou cole o arquivo baixado do site ou do aplicativo do banco (Excel, CSV ou OFX). Se o banco usa um formato diferente, você diz uma vez em qual coluna está a data, a descrição e o valor, e o Finup guarda esse modelo.
  - _Exemplo: arrastar o arquivo "fatura-maio.csv" para a área de carregar arquivo._
- **Conciliar Fatura** — Abre o modo de conciliação: compara o arquivo do banco com a fatura que já existe no Finup e separa o que só está no arquivo, o que só está no Finup e o que já bate. Escolha o cartão e o mês antes.
  - _Exemplo: a fatura no Finup soma R$ 1.900,00 e a do banco R$ 2.000,00 — a conciliação mostra quais compras explicam os R$ 100,00._
- **Confirmar Conciliação** — Aparece só no modo Conciliar Fatura. Grava de uma vez tudo o que você marcou: importa as compras que faltavam e exclui as que sobravam. Depois volta para a tela normal.
  - _Exemplo: confirmar a importação de 2 compras que faltavam e a exclusão de 1 compra lançada em dobro._
- **Resumo da revisão** — Mostra, logo depois de carregar o arquivo, o total do arquivo, quanto dele já está no Finup, quanto será importado e quantos itens pedem a sua decisão. Esses números batem com as abas e com o botão Confirmar.
  - _Exemplo: arquivo com 40 compras — 30 já no Finup, 8 novas e 2 para você decidir._
- **Conferência da fatura** — Explica a diferença entre o total do arquivo e o total da fatura no Finup. Ela abre sozinha quando sobra um valor sem explicação, para você não gravar uma fatura que não bate.
  - _Exemplo: a conferência mostra uma diferença de R$ 15,90 por causa de uma tarifa que ainda não está no Finup._
- **Revisar lançamentos** — Separa as linhas do arquivo em grupos: as novas, as que já estão no Finup e as que precisam de decisão (por exemplo, parecidas com algo já lançado). Clique numa aba para ver só aquele grupo.
  - _Exemplo: abrir a aba das que precisam de decisão e dizer se uma compra parecida é a mesma ou é outra._
- **Gerenciar regras de classificação** — Abre a lista de regras de classificação. Cada regra diz: quando a descrição tiver tal palavra, use tal categoria e tal grupo. Elas são usadas pelo "Classificar Auto".
  - _Exemplo: criar a regra "POSTO" → categoria Combustível._
- **Classificar Auto** — Preenche categoria e grupo das linhas sozinho, usando as suas regras e o que você já classificou em compras parecidas. Depois você só confere.
  - _Exemplo: todas as compras com "SUPERMERCADO" na descrição recebem a categoria Mercado._
- **Preencher em Lote** — Escolha uma categoria e um grupo e aplique nas linhas que você marcar, de uma vez, sem preencher linha por linha.
  - _Exemplo: colocar a categoria "Viagem" em todas as 12 compras feitas durante as férias._
- **Cat → Ger** — Para cada categoria que aparece no arquivo, troca o grupo gerencial de todas as linhas dela de uma vez.
  - _Exemplo: todas as linhas da categoria "Restaurante" passam para o mesmo grupo gerencial._
- **Cancelar** — Descarta o arquivo carregado e volta para o início. Nada é gravado.
  - _Exemplo: você carregou a fatura do cartão errado — clique em Cancelar e carregue de novo._
- **Confirmar** — Mostra uma última prévia e, ao confirmar, grava só as linhas novas e marca como conferidas as que já estavam no Finup. O número no botão é a quantidade que será gravada.
  - _Exemplo: "Confirmar (8)" grava as 8 compras novas da fatura._
- **Histórico de Importações** — A lista das importações já feitas, com data, arquivo e quantidade. Clique numa delas para reabrir e corrigir, ou use "Estornar" para desfazer a importação inteira.
  - _Exemplo: desfazer a importação de ontem porque o arquivo era de outro cartão._

**Dicas**

- Os números do resumo, das abas e do botão Confirmar sempre batem entre si.
- Itens que precisam de decisão ficam de fora até você escolher o que fazer com eles.

**Erros comuns**

- O botão "Conciliar Fatura" está apagado: escolha antes o Cartão e o Mês de Referência.
- O total do arquivo não bate com o do Finup: abra "Conferência da fatura" — ela mostra de onde vem a diferença (compras faltando, sobrando ou com valor diferente).
- Algumas linhas não foram gravadas: itens que "precisam da sua decisão" ficam de fora até você escolher o que fazer com eles.

## Conciliar Fatura `import:conciliacao`

Compare o arquivo da fatura do banco com a fatura que já está no Finup e decida o que importar, excluir ou manter até a diferença zerar.

- **Conciliação de Fatura** — Confira aqui se o cartão e o mês são os certos antes de decidir qualquer coisa. Se não forem, saia e escolha de novo.
  - _Exemplo: "Cartão Azul · 05/2025 · fatura-maio.csv"._
- **Sair** — Volta para a tela normal do Importar Fatura. Nenhuma das escolhas feitas aqui é gravada.
  - _Exemplo: você escolheu o mês errado — clique em Sair e comece de novo._
- **Totais e Diferença** — A cada escolha (importar, ignorar, manter, excluir) o total do Finup é recalculado. O objetivo é a Diferença chegar a zero, quando aparece o sinal de certo.
  - _Exemplo: arquivo R$ 2.000,00, Finup R$ 1.950,00 → diferença de R$ 50,00 ainda a explicar._
- **Fatura encerrada** — Só aparece quando há parcelas no Finup que não estão no arquivo. Com a fatura já fechada, essas parcelas são levadas para o mês seguinte ao confirmar. Em fatura ainda aberta, nada é mudado.
  - _Exemplo: a parcela 3/10 de uma compra não veio nesta fatura — ela passa para a fatura do mês seguinte._
- **Resumo e Confirmar Conciliação** — O botão "Confirmar Conciliação" grava de uma vez tudo o que você marcou e volta para a tela normal. Ele fica apagado enquanto não houver nada para importar, excluir ou mover.
  - _Exemplo: "35 conciliados · 2 a importar · 1 a excluir" → Confirmar Conciliação._
- **Cancelar** — Igual ao Sair: descarta as escolhas e volta para a tela normal.
  - _Exemplo: cancelar para baixar de novo o arquivo completo da fatura._
- **Só no arquivo — falta no Finup** — Para cada uma, você pode ajustar categoria e grupo e escolher se importa ou ignora. Clique na linha para ver o histórico daquele fornecedor.
  - _Exemplo: uma assinatura de R$ 29,90 que você não lançou aparece aqui._
- **Importar / Ignorar** — "Importar" grava a compra na fatura ao confirmar. "Ignorar" deixa de fora — use quando ela já está no Finup com outro valor ou outra data.
  - _Exemplo: ignorar uma compra que você lançou com a data do recibo, diferente da do banco._
- **Só no Finup — não está no arquivo** — Pode ser algo lançado em dobro, no cartão errado, ou uma compra que só vai entrar na próxima fatura. Decida linha por linha.
  - _Exemplo: uma compra de R$ 45,00 lançada duas vezes aparece aqui._
- **Manter / Excluir** — "Manter" não muda nada. "Excluir" apaga o lançamento quando você confirmar. Lançamentos que ainda podem chegar numa fatura aberta só podem ser mantidos.
  - _Exemplo: excluir a cópia repetida de uma compra._
- **Conciliados** — Ao confirmar, essas compras são marcadas como conferidas. Clique numa linha para ver o histórico do fornecedor.
  - _Exemplo: as 35 compras que já estavam certas no Finup._
- **Editar (lápis)** — Use quando a compra bate, mas algum dado está errado no Finup, como a categoria ou a descrição.
  - _Exemplo: corrigir a categoria de uma compra conciliada de "Outros" para "Farmácia"._

## Importar lançamentos `importar-lancamentos`

Traga extratos e planilhas (Excel, CSV ou OFX) de qualquer banco para dentro do Finup.

- **Conta de destino** — A conta onde os lançamentos do arquivo vão entrar. Escolha antes de enviar o arquivo; trocar a conta descarta o arquivo lido.
  - _Exemplo: escolher a "Conta Corrente" para trazer o extrato do mês._
- **Gerar Excel para preencher** — Baixa uma planilha modelo desta conta, com as colunas certas e listas das suas categorias e favorecidos. Você preenche e envia de volta.
  - _Exemplo: baixar o modelo, digitar os gastos em dinheiro da semana e enviar._
- **Enviar o arquivo preenchido** — Escolha a planilha preenchida (.xlsx), um CSV com as mesmas colunas ou o extrato OFX baixado do banco. O Finup lê o arquivo e mostra a prévia antes de gravar.
  - _Exemplo: enviar o arquivo "extrato-junho.ofx" baixado do site do banco._
- **Prévia** — Antes de gravar, mostra quantas linhas estão certas, quantas têm erro, quantas parecem já existir na conta e quantas serão importadas, com o total de entradas e saídas.
  - _Exemplo: 25 válidas, 1 com erro, 2 possíveis duplicados, 23 a importar._
- **Marcar todas** — A caixinha do título marca ou desmarca todas as linhas de uma vez. Só as linhas marcadas são importadas; desmarque as que não quer trazer.
  - _Exemplo: desmarcar tudo e marcar só as 3 linhas que faltam na conta._
- **Importar** — Grava os lançamentos marcados na conta escolhida. O saldo da conta é atualizado e a importação entra em "Últimas importações".
  - _Exemplo: "Importar 23 lançamentos em Conta Corrente"._
- **Cancelar** — Descarta o arquivo lido e a prévia. Nada é gravado.
  - _Exemplo: você enviou o extrato do mês errado — cancele e envie o certo._
- **Últimas importações** — Lista as importações feitas, com conta, data, formato, quantidade e totais. Cada uma pode ser desfeita depois.
  - _Exemplo: ver que a importação de ontem trouxe 23 lançamentos com R$ 4.200,00 de saídas._
- **Recarregar** — Busca de novo a lista de importações, por exemplo depois de importar em outro aparelho.
  - _Exemplo: tocar em recarregar para ver uma importação feita no celular._
- **Desfazer importação** _(só se: pode:lancamentos:excluir)_ — Apaga só os lançamentos daquela importação, e o saldo da conta volta ao que era. Não dá para refazer: seria preciso importar o arquivo de novo.
  - _Exemplo: desfazer a importação feita na conta errada._

**Dicas**

- Categorias do arquivo que não existem no Finup podem ser ligadas a uma categoria sua — o Finup lembra nas próximas vezes.
- Linhas marcadas como "possível duplicado" já parecem estar na conta: confira antes de importar.

**Erros comuns**

- Queria importar a fatura do cartão aqui: cartão de crédito é no "Importar Fatura". Esta tela é para conta corrente, poupança e dinheiro.
- Algumas linhas aparecem "com erro": elas ficam de fora. Corrija a data ou o valor no arquivo e envie de novo.
- Importei na conta errada: use "Desfazer importação" em Últimas importações e importe de novo na conta certa.

## Fluxo de Caixa `cashflow`

Mostra como o seu saldo vai ficar nos próximos dias e meses, somando o que já aconteceu com o que está agendado.

- **Período** — Define até que dia o Finup projeta o saldo. Quanto maior o prazo, mais agendamentos entram na conta.
  - _Exemplo: escolha 90 dias para ver se o dinheiro chega até as férias._
- **Filtros e consultas** — No celular, as consultas e as opções (envelopes, reservas e provisórios) ficam guardadas neste botão para a tela não ficar apertada.
  - _Exemplo: toque no botão de filtros e ligue "Ocultar reservas" para ver só o que mexe no dia a dia._
- **Editar consulta atual** _(só se: pode:fluxo:editar)_ — Abre a consulta que está na tela para trocar as contas ou as opções dela. A consulta "FC Principal" não é editável: ela segue as contas marcadas para o Saldo Principal.
  - _Exemplo: inclua a poupança na consulta "Família" para ela entrar na projeção._
- **Nova consulta** _(só se: pode:fluxo:incluir)_ — Cria uma visão do fluxo com as contas que você escolher. Ela fica salva e aparece junto das outras consultas.
  - _Exemplo: crie a consulta "Empresa" só com as contas do CNPJ._
- **Consultas** — Cada consulta é um jeito salvo de olhar o fluxo, com o seu conjunto de contas. Clique numa para trocar; a escolhida fica destacada.
  - _Exemplo: troque de "FC Principal" para "Empresa" para ver só o caixa da empresa._
- **Saldo inicial** — É de onde a projeção parte: o saldo atual de cada conta da consulta, somado. Cada conta usa o seu último dia com movimento.
  - _Exemplo: se a conta corrente tem R$ 2.000,00 e a poupança R$ 500,00, o saldo inicial é R$ 2.500,00._
- **Projetado e Mínimo** — "Projetado" é quanto deve sobrar no último dia do prazo. "Mínimo" é o ponto mais baixo que o saldo atinge no caminho, com a data — é ele que avisa se vai faltar dinheiro antes.
  - _Exemplo: Projetado R$ 3.000,00, mas Mínimo de R$ -200,00 no dia 5: vai faltar dinheiro antes do salário cair._
- **Projeção de saldo** — Desenha o saldo dia a dia no prazo escolhido. Descidas são saídas; subidas são entradas. Passe o mouse ou o dedo para ver o valor de cada dia.
  - _Exemplo: uma queda grande todo dia 10 costuma ser o aluguel e o cartão._
- **Marcar todos** — Marca ou desmarca de uma vez todos os eventos visíveis. Útil para voltar ao normal depois de simular.
  - _Exemplo: depois de desmarcar algumas contas para testar, clique em "Marcar todos" para incluir tudo de novo._
- **Incluir envelopes** — Envelopes são limites de gasto do mês (mercado, lazer…). Ligado, o fluxo desconta o que ainda falta gastar deles, deixando a projeção mais realista.
  - _Exemplo: envelope de mercado de R$ 1.000,00 com R$ 400,00 já gastos — o fluxo desconta os R$ 600,00 que faltam._
- **Ocultar reservas** — Esconde da lista os depósitos e resgates de reserva, que são dinheiro mudando de lugar entre as suas contas. A lista fica mais limpa.
  - _Exemplo: ligue para ver só as contas e recebimentos de verdade, sem as transferências para a reserva._
- **Provisório** _(só se: pode:fluxo:incluir)_ — Cria uma entrada ou saída só para testar "e se…". Ela entra na projeção, mas não vira lançamento nem agendamento. Depois você pode apagar ou efetivar.
  - _Exemplo: e se eu comprar uma geladeira de R$ 3.000,00 no dia 20? Adicione um provisório e veja o saldo._
- **Caixinha da linha** — Cada linha tem uma caixinha. Desmarcada, aquele evento sai da conta e o saldo é recalculado na hora. Nada é apagado: é só simulação.
  - _Exemplo: desmarque o bônus que talvez não venha e veja se o mês fecha mesmo assim._
- **Confirmado / A confirmar** _(só se: pode:agendamentos:editar)_ — Diz se o próximo vencimento de um agendamento já está certo ("Confirmado") ou ainda pode mudar ("A confirmar"). Clique no selo para trocar.
  - _Exemplo: o cliente avisou que paga no dia 15 — marque o recebimento como "Confirmado"._
- **Mudar data e Efetivar** _(só se: pode:fluxo:editar)_ — "Mudar data" simula o evento em outro dia, sem alterar o agendamento. "Efetivar" transforma um provisório em agendamento ou lançamento de verdade.
  - _Exemplo: e se o aluguel for pago dia 15 em vez de dia 10? Use "Mudar data" e veja o efeito no saldo._

**Dicas**

- Se o saldo ficar negativo em alguma data, dá tempo de se planejar antes.
- Desmarcar linhas e mudar datas aqui é só simulação: o dinheiro de verdade não muda.

**Erros comuns**

- O saldo projetado parece errado: confira se todas as caixinhas estão marcadas — um evento desmarcado fica fora da conta.
- Uma conta não entra no fluxo: na consulta "FC Principal" só entram as contas marcadas com "Somar no Saldo Principal". Crie uma consulta própria para incluir outras.

## Reservas `reservas`

O dinheiro separado para objetivos — quanto há em cada reserva e para onde ele foi.

- **Abas** — A tela de Reservas tem cinco partes: Contas Reserva (o saldo de cada conta), Resumo (cada objetivo), Fluxo Futuro (os próximos 12 meses), Razão Diário (dia a dia) e Histórico (períodos fechados).
  - _Exemplo: abrir a aba Resumo para ver quanto já há guardado para o IPVA._
- **Aba Resumo** — É na aba Resumo que você cria, edita e acompanha as funções de reserva (os objetivos). As outras abas mostram o futuro, o dia a dia e o histórico.
  - _Exemplo: abrir o Resumo para criar a função "Viagem de férias"._
- **Total Reservado / Depósitos / Resgates** — Total Reservado é a soma do saldo das contas reserva. Depósitos e Resgates mostram quanto entrou e quanto saiu delas no mês.
  - _Exemplo: R$ 8.000,00 reservados, R$ 1.000,00 depositados e R$ 300,00 resgatados no mês._
- **Saldo das reservas** — Um cartão para cada conta marcada como reserva, com o saldo de hoje e o que entrou e saiu dela no mês.
  - _Exemplo: a "Poupança Reserva" com R$ 5.000,00 e R$ 500,00 depositados no mês._
- **Ver Extrato** — Abre a lista dos depósitos e resgates dessa conta reserva, para ver de onde veio e para onde foi cada valor.
  - _Exemplo: ver o resgate de R$ 300,00 usado para pagar o conserto do carro._

**Dicas**

- Para uma conta aparecer aqui, ative "É conta de reserva" no cadastro dela.

**Erros comuns**

- Minha conta não aparece aqui: no cadastro da conta, ative "É conta de reserva".

## Reservas — Fluxo Futuro `reservas:fluxo`

Como o saldo de cada função deve ficar nos próximos 12 meses, contando os depósitos e resgates agendados.

- **Total investido** — A soma do saldo de hoje das funções, com um aviso das funções que vão ficar negativas em algum mês.
  - _Exemplo: Total investido R$ 6.000,00 — 1 função fica negativa em agosto._
- **Exportar Excel** — Gera uma planilha Excel com a projeção de cada função, mês a mês.
  - _Exemplo: exportar o fluxo para planejar os depósitos do semestre._
- **Setas dos meses** — No celular, a tabela não cabe inteira: use as setas para avançar ou voltar os meses mostrados.
  - _Exemplo: tocar na seta da direita para ver de julho a setembro._
- **Projeção por mês** — Para cada função, os depósitos, os resgates e o saldo previsto em cada um dos próximos 12 meses. Clique num valor para ver os agendamentos que o formam.
  - _Exemplo: a função "IPVA" sobe R$ 150,00 por mês e cai R$ 1.800,00 em março._

**Dicas**

- Mês em vermelho indica que a função ficaria negativa: dá tempo de ajustar antes.

## Reservas — Histórico `reservas:historico`

Os períodos já fechados com "Virar Saldo" e como cada função terminou.

- **Período fechado** — Cada "Virar Saldo" fecha um período. Escolha aqui qual período fechado você quer ver.
  - _Exemplo: escolher o período que terminou em 31/12 para ver como cada função fechou o ano._
- **Tabela do período** — Para cada função: saldo inicial, entradas, saídas, ajustes e saldo final daquele período.
  - _Exemplo: "Férias" começou com R$ 1.000,00, recebeu R$ 1.800,00, gastou R$ 2.500,00 e fechou com R$ 300,00._

## Reservas — Razão Diário `reservas:razao`

Um registro por função por dia, para conferir a evolução de cada reserva.

- **Atualizar** — Busca de novo os registros do razão, para ver movimentos feitos há pouco.
  - _Exemplo: atualizar depois de registrar um depósito na reserva._
- **Excel** — Gera uma planilha Excel com as linhas que estão na tela, respeitando o mês e as funções escolhidas.
  - _Exemplo: exportar só o mês de maio da função "Férias"._
- **Mês** — Mostra só os registros do mês escolhido na tabela e no gráfico.
  - _Exemplo: escolher junho para conferir os depósitos daquele mês._
- **Funções** — Clique nos nomes das funções para ver só elas. Clique de novo para tirar do filtro.
  - _Exemplo: deixar só "IPVA" e "Seguro" marcados para comparar as duas._
- **Gráfico** — Uma linha por função mostrando como o saldo mudou ao longo dos dias.
  - _Exemplo: ver a linha do "IPVA" subir todo mês e cair em março._
- **Tabela do razão** — Uma linha por função por dia, com entradas, saídas, ajustes e saldos. Clique no título de uma coluna para ordenar por ela.
  - _Exemplo: ordenar pela coluna Saídas para achar o maior resgate do ano._
- **Ver período** — Leva para a aba Histórico já mostrando o período fechado ao qual aquela linha pertence.
  - _Exemplo: de uma linha de dezembro, abrir o período fechado em 31/12._

**Dicas**

- Divergência diferente de zero indica um lançamento que não entrou em nenhuma função.

## Reservas — Resumo `reservas:resumo`

Cada objetivo (função de reserva) com o saldo, as entradas e saídas e o que ainda vai acontecer.

- **Total reservado** — A soma do saldo atualizado de todas as funções (objetivos) de reserva.
  - _Exemplo: IPVA R$ 1.200,00 + Férias R$ 3.000,00 = Total reservado R$ 4.200,00._
- **Exportar Excel** — Gera uma planilha Excel com o resumo de todas as funções, com saldo inicial, entradas, saídas e saldo.
  - _Exemplo: exportar o resumo para mostrar ao contador._
- **Desfazer Virada** _(só se: pode:reservas:editar)_ — Aparece logo depois de uma virada de saldo. Desfaz a última virada e volta os saldos iniciais como estavam.
  - _Exemplo: você virou o saldo com a data errada — desfaça e vire de novo._
- **Virar Saldo** _(só se: pode:reservas:editar)_ — Fecha o período: o saldo de hoje de cada função passa a ser o saldo inicial do próximo período, e o período fechado vai para o Histórico.
  - _Exemplo: virar o saldo no fim do ano para começar o ano novo com os saldos atualizados._
- **Nova Função** _(só se: pode:reservas:incluir)_ — Cria uma função de reserva, que é um objetivo para o dinheiro guardado. Você dá um nome, escolhe a conta reserva, quanto vai gastar no ano e em que mês vence.
  - _Exemplo: função "IPVA", na Poupança Reserva, R$ 1.800,00 por ano, vencendo em março._
- **Saldo Real** — Digite o saldo que o banco mostra para a conta reserva. O Finup compara com a soma das funções e mostra quanto falta (ou sobra) distribuir.
  - _Exemplo: o banco mostra R$ 5.050,00 e as funções somam R$ 5.000,00 — sobram R$ 50,00 de rendimento._
- **Exibir como despesa** _(só se: pode:reservas:editar)_ — Liga ou desliga se os depósitos e resgates dessa função contam como despesa no Painel e nos Relatórios.
  - _Exemplo: deixar ligado para o "IPVA" (é um gasto futuro) e desligado para "Poupança"._
- **Entradas / Saídas** — Clique no valor das entradas ou das saídas para ver a lista de lançamentos que formam esse número.
  - _Exemplo: clicar em Saídas de R$ 800,00 e ver que foi o pagamento do seguro._
- **Ajuste** — Mostra os ajustes feitos na função. O "+" grava um ajuste novo, para corrigir o saldo sem criar lançamento.
  - _Exemplo: ajustar +R$ 20,00 de rendimento que entrou na função "Férias"._
- **Distribuir** _(só se: pode:reservas:editar)_ — Reparte entre as funções a diferença entre o saldo do banco e a soma das funções. É só uma divisão no controle: não move dinheiro entre contas.
  - _Exemplo: dividir R$ 50,00 de rendimento entre as funções da Poupança Reserva._
- **Mov. Futuros** — Os depósitos e resgates já agendados para essa função, com data e valor.
  - _Exemplo: ver os 12 depósitos mensais de R$ 150,00 agendados para o "IPVA"._
- **Editar (lápis)** _(só se: pode:reservas:editar)_ — Abre a função para mudar nome, conta, valores e mês de vencimento. Para funções já usadas, o Finup sugere valores calculados dos lançamentos.
  - _Exemplo: aumentar a Despesa Anual do "Seguro" de R$ 1.500,00 para R$ 1.700,00._
- **Excluir (lixeira)** _(só se: pode:reservas:excluir)_ — Apaga a função de reserva depois de pedir confirmação. Não dá para desfazer.
  - _Exemplo: apagar a função "Reforma" depois que a obra terminou._

**Dicas**

- Arraste uma função para mudar a ordem dentro da mesma conta.

**Erros comuns**

- Fiz a virada de saldo por engano: logo depois, use "Desfazer Virada".
- A soma das funções não bate com o saldo do banco: digite o saldo do banco em "Saldo Real" e use "Distribuir" para repartir a diferença.

## Envelopes `envelopes`

Limites de gasto por assunto no mês (mercado, lazer…) e quanto já foi usado de cada um.

- **Novo Envelope** _(só se: pode:envelopes:incluir)_ — Cria um envelope: um limite de gasto mensal para um assunto. Você dá um nome, o limite, o dia de vencimento e marca as categorias que contam nele.
  - _Exemplo: envelope "Mercado" com limite de R$ 1.200,00 por mês e as categorias Mercado e Padaria._
- **Competência** — O mês que está sendo mostrado. Use as setas para ver os envelopes de meses anteriores ou do próximo.
  - _Exemplo: voltar para o mês passado para ver se o envelope "Lazer" estourou._
- **Total limite / Já gasto / Ainda posso gastar** — Somando todos os envelopes do mês: o limite total, quanto já foi gasto e quanto ainda dá para gastar (ou quanto estourou).
  - _Exemplo: limite R$ 2.000,00, já gasto R$ 1.400,00, ainda posso gastar R$ 600,00._
- **Barra do envelope** — A barra mostra quanto do limite já foi usado. A cor muda quando está perto do limite e quando passa dele. Toque para ver os lançamentos que entraram no envelope.
  - _Exemplo: o envelope "Combustível" com R$ 380,00 de R$ 400,00 fica amarelo._
- **Opções (⋯)** _(só se: pode:envelopes:editar)_ — O botão "⋯" do envelope abre as opções para editar (nome, limite, categorias) ou excluir o envelope.
  - _Exemplo: aumentar o limite do "Mercado" para R$ 1.400,00._

**Dicas**

- Compras parceladas aparecem separadas das à vista dentro de cada envelope.

**Erros comuns**

- Um gasto não entrou no envelope: confira se a categoria do lançamento está entre as "Categorias Vinculadas" do envelope.
- Os valores parecem do mês errado: use as setas da Competência para escolher o mês.

## Orçamento `budget`

Defina quanto pretende gastar em cada categoria e compare com o que realmente aconteceu.

- **Total Orçado / Gasto / Saldo** — Somando todas as categorias com orçamento: quanto foi planejado, quanto já foi gasto e quanto ainda sobra no mês.
  - _Exemplo: orçado R$ 3.000,00, gasto R$ 2.100,00, saldo R$ 900,00._
- **Despesa real / Valor pago** _(só se: contratos)_ — Só aparece quando o módulo de Contratos está ligado. "Despesa real" conta o valor do contrato no mês dele; "Valor pago" conta o que saiu da conta.
  - _Exemplo: um contrato pago em 3 vezes pode contar pelo valor do mês ou pelo pagamento feito._
- **Novo Orçamento** _(só se: pode:orcamento:incluir)_ — Abre um formulário simples: escolha a categoria de despesa e o valor que você pretende gastar com ela por mês.
  - _Exemplo: orçar R$ 600,00 por mês para "Restaurantes"._
- **Previsto × realizado** — Cada cartão mostra a categoria, o valor planejado e o valor gasto, com uma barra. A barra fica amarela perto do limite e vermelha quando estoura.
  - _Exemplo: "Restaurantes" com R$ 650,00 gastos de R$ 600,00 aparece em vermelho._
- **Editar (lápis)** _(só se: pode:orcamento:editar)_ — Abre o orçamento para trocar a categoria ou o valor planejado.
  - _Exemplo: subir o orçamento de "Mercado" de R$ 1.000,00 para R$ 1.100,00._
- **Excluir (lixeira)** _(só se: pode:orcamento:excluir)_ — Remove o orçamento dessa categoria. Os lançamentos não são apagados.
  - _Exemplo: tirar o orçamento de "Presentes" depois do fim do ano._

**Dicas**

- Os gastos seguem o mês financeiro definido em Configurações.

**Erros comuns**

- A categoria não aparece na lista do Novo Orçamento: cada categoria só pode ter um orçamento. Edite o que já existe.
- Os gastos não batem com o mês do calendário: o Orçamento segue o mês financeiro definido em Configurações.

## Patrimônio `patrimonio`

Tudo o que você tem menos o que você deve: contas, investimentos, bens, dívidas e financiamentos.

- **Bens, Investimentos, Contas, Dívidas e Cartão** — Cada card soma uma parte do patrimônio: bens (imóveis, veículos), investimentos, saldo das contas, dívidas e o que está em aberto no cartão. Clique em qualquer um para ver a lista do que entra nele.
  - _Exemplo: clique em "Bens" e veja que ele soma um apartamento e um carro._
- **Patrimônio Líquido** — É o resultado final: bens + investimentos + contas, menos dívidas, empréstimos e cartão. Clique para ver a conta completa.
  - _Exemplo: R$ 300.000,00 em bens e contas menos R$ 120.000,00 de dívidas dão R$ 180.000,00._
- **Evolução do Patrimônio Líquido** — Gráfico com o patrimônio líquido dos últimos 6 meses. Os meses passados usam o histórico de valores dos bens; sem atualizações, a linha fica quase reta.
  - _Exemplo: ao atualizar o valor do carro todo mês, o gráfico mostra a desvalorização dele._
- **Nome do bem** — Clicar no nome abre a ficha do bem, com nota fiscal, entrada, financiamento e parcelas.
  - _Exemplo: clique no nome do carro para ver quantas parcelas do financiamento faltam._
- **Atualizações** — Mostra ou esconde a lista de valores que o bem já teve, com data e observação.
  - _Exemplo: veja que o imóvel valia R$ 250.000,00 no ano passado e R$ 270.000,00 hoje._
- **Detalhar bem (lápis)** — Abre a ficha completa do bem, onde você registra a entrada, monta o financiamento e paga as parcelas.
  - _Exemplo: comprou um carro com entrada e 48 parcelas? Registre tudo na ficha dele._
- **Atualizar valor** _(só se: pode:patrimonio:editar)_ — Você informa quanto o bem vale hoje e, se quiser, uma observação. O valor antigo não se perde: vai para o histórico.
  - _Exemplo: a tabela de preços diz que o carro vale R$ 42.000,00; atualize com a observação "tabela de março"._
- **Dívida ou financiamento** — Mostra o saldo devedor de cada dívida. Quando é financiamento, clique para consultar as parcelas pagas e as que faltam.
  - _Exemplo: clique no financiamento do imóvel para ver o saldo devedor e a próxima parcela._
- **Resumo Patrimonial** — A conta do patrimônio linha por linha, do total de bens até o patrimônio líquido. Clique numa linha para ver o que forma aquele valor.
  - _Exemplo: clique na linha "Dívidas" para ver cada dívida e quanto falta de cada uma._

**Dicas**

- Bens, dívidas e investimentos são contas: cadastre-os na tela Contas, num grupo patrimonial.
- Na ficha do bem, em "Valores do Bem", você escolhe se ele entra no patrimônio pelo valor da nota fiscal ou pelo valor pago.

**Erros comuns**

- Bem não aparece: ele é cadastrado em Contas → Nova Conta, tipo "Bem / Ativo" (ou numa conta de um grupo patrimonial).
- Gráfico de evolução "reto": atualize o valor dos bens de tempos em tempos para o histórico mostrar a variação.

## Contratos `contratos`

Contratos com cobranças que se repetem (aluguel, prestação de serviço) e o andamento de cada um.

- **Contratos / Regras de itens do boleto** — A aba Contratos mostra a lista; a aba Regras de itens do boleto diz quem paga cada item cobrado no boleto.
  - _Exemplo: abra "Regras de itens do boleto" para dizer que o fundo de obras é do proprietário._
- **Perfil** — Mostra só os contratos de uma pessoa ou empresa, ou de todos.
  - _Exemplo: escolha o perfil da empresa para ver só o aluguel da loja._
- **Tipo** — Separa os contratos em que você paga (é o inquilino ou contratante) dos que você recebe (é o proprietário ou prestador).
  - _Exemplo: escolha "A receber" para ver os imóveis que você aluga para outras pessoas._
- **Status** — Filtra pela situação do contrato. O padrão mostra só os ativos; escolha "Todos" para ver também os encerrados.
  - _Exemplo: escolha "Encerrado" para consultar um aluguel antigo._
- **Novo contrato** _(só se: pode:contratos:incluir)_ — Abre o cadastro em etapas: dados, valores, reajuste, imóvel e prévia. No fim, o Finup gera as parcelas como agendamentos.
  - _Exemplo: aluguel de R$ 1.500,00 todo dia 10, reajuste pelo IPCA no aniversário._
- **Ficha do contrato** — Cada linha mostra o valor atual, a vigência, o próximo vencimento e o próximo reajuste. Clique para abrir a ficha completa.
  - _Exemplo: clique em "Apto 302" para ver as parcelas pagas e as que faltam._

**Dicas**

- A lista vem ordenada pelo próximo vencimento.

**Erros comuns**

- O contrato não aparece na lista: confira os filtros de Perfil, Tipo e Status (o padrão mostra só os ativos).
- O botão "Avançar" não passa: falta algum campo obrigatório da etapa; a mensagem em vermelho diz qual.

## Regras de itens do boleto `contratos:regras`

Diga quem paga cada item do boleto (por exemplo, do condomínio): o inquilino ou o proprietário. Vale para todos os contratos ou só para um.

- **Regras de** — Regras globais valem para todos os contratos. Escolha um contrato para ver ou criar regras só dele.
  - _Exemplo: escolha o contrato da sala comercial para uma regra que só vale lá._
- **+ Regra** _(só se: pode:contratos:editar)_ — Informe o texto do item como aparece no boleto, se ele "começa com" ou "contém" esse texto, e quem paga: inquilino ou proprietário.
  - _Exemplo: "FUNDO DE OBRAS", contém, responsável Proprietário._
- **Lista de regras** — Mostra as regras cadastradas no escopo escolhido. Use o lápis para mudar e a lixeira para excluir.
  - _Exemplo: edite a regra "TAXA EXTRA" para passar a ser do inquilino._
- **Testar** — Cole o texto do boleto e veja como cada item seria classificado antes de lançar. Nada é gravado.
  - _Exemplo: cole as linhas do boleto do condomínio e confira quem paga cada uma._

**Dicas**

- A regra de um contrato vence a global, e "começa com" vence "contém".

## Relatórios `reports`

Relatórios para analisar o dinheiro por período, conta, categoria ou favorecido, com exportação para Excel.

- **Demonstrativo Financeiro** — Abre o relatório de receitas e despesas por grupo e categoria, com filtros de período, contas e categorias e exportação para planilha.
  - _Exemplo: veja quanto foi gasto em cada categoria nos últimos 3 meses._
- **Relatório por Favorecido** — Abre o relatório com quanto foi pago e recebido de cada pessoa ou empresa, com os lançamentos de cada uma.
  - _Exemplo: descubra quanto você pagou à escola no ano._
- **Fluxo de Caixa por Conta** — Abre o extrato com saldo acumulado de uma conta, de um grupo ou das contas principais, podendo somar o que ainda está agendado.
  - _Exemplo: veja como o saldo da conta da empresa fica até o fim do mês._
- **Relatório de Fatura** — Abre a análise das faturas do cartão, com os gastos por grupo e categoria.
  - _Exemplo: compare a fatura deste mês com a do mês passado._
- **Médias dos 6 meses** — Mostra a média mensal de receitas, despesas e saldo dos últimos 6 meses. Ajuda a saber quanto você costuma gastar.
  - _Exemplo: média de despesas de R$ 4.200,00 por mês._
- **Evolução dos Últimos 6 Meses** — Gráfico de barras com o que entrou e o que saiu em cada um dos últimos 6 meses.
  - _Exemplo: perceber que as despesas sobem todo fim de ano._
- **Despesas por Categoria** — Gráfico de pizza com a participação de cada categoria nas despesas do mês escolhido.
  - _Exemplo: ver que Moradia é a maior fatia do mês._
- **Despesa real / Valor pago** _(só se: contratos)_ — Só para quem usa Contratos. "Despesa real" desconta os créditos que são do proprietário; "Valor pago" mostra o que saiu da conta de fato.
  - _Exemplo: o boleto foi R$ 1.800,00, mas R$ 200,00 eram do proprietário; a despesa real é R$ 1.600,00._
- **Mês** — Escolhe o mês usado na pizza e no ranking de despesas.
  - _Exemplo: escolha o mês anterior para comparar com o atual._
- **Ranking de Despesas** — Lista as 10 categorias com mais gasto no mês, com o valor e a porcentagem de cada uma.
  - _Exemplo: Supermercado em 1º lugar, com 22% das despesas._

**Dicas**

- Cada relatório tem botão para exportar a planilha, pronta para imprimir ou enviar.

**Erros comuns**

- Não vejo o Relatório de Fatura: ele só aparece quando há pelo menos um cartão de crédito cadastrado.

## Demonstrativo Financeiro `reports:demonstrativo`

Receitas e despesas do período, agrupadas por categoria e subcategoria, com exportação para planilha.

- **Voltar aos Relatórios** — Fecha o Demonstrativo e volta para a lista de relatórios.
  - _Exemplo: depois de exportar, volte para abrir o Relatório por Favorecido._
- **Incluir transferências entre perfis** — Normalmente, dinheiro passado entre perfis seus não conta como receita nem despesa. Ligue para que conte.
  - _Exemplo: ver o pró-labore que a empresa pagou para você como despesa da empresa._
- **Ocultar movimentos de reserva** — Tira do relatório os depósitos e resgates das contas reserva, para ver só o dia a dia.
  - _Exemplo: esconda o depósito mensal de R$ 500,00 na reserva de emergência._
- **Ocultar movimentos de patrimônio** — Tira do relatório compras e vendas de bens e aplicações em investimento, que não são gasto do dia a dia.
  - _Exemplo: esconda a compra de um carro para não distorcer as despesas do mês._
- **Exibir lançamentos** — Mostra cada lançamento embaixo da sua categoria, além dos totais. Bom para conferir de onde vem um valor.
  - _Exemplo: ver cada compra que formou o total de "Restaurantes"._
- **Período** — Botões rápidos que preenchem as datas com os últimos meses.
  - _Exemplo: clique em "3 meses" para ver o trimestre._
- **Data Inicial e Data Final** — Escolha a data inicial e a final exatas, quando os atalhos não servem.
  - _Exemplo: de 01/01 a 30/06 para ver o primeiro semestre._
- **Categorias** — Marque só as categorias que interessam. Sem nada marcado, todas entram.
  - _Exemplo: marque só "Saúde" e "Farmácia" para somar os gastos médicos._
- **Contas** — Marque só as contas que entram no relatório. Sem nada marcado, todas entram.
  - _Exemplo: marque só as contas da empresa._
- **Atualizar** — Monta o relatório com os filtros escolhidos. Ele fica destacado quando há mudança ainda não aplicada.
  - _Exemplo: escolha o período e clique em Atualizar._
- **Exportar CSV** — Baixa um arquivo simples, sem formatação, que abre em qualquer planilha.
  - _Exemplo: exporte em CSV para colar os números em outra planilha sua._
- **Exportar Excel** — Gera a planilha formatada, com cabeçalho do ambiente e os filtros usados, pronta para imprimir ou enviar.
  - _Exemplo: exporte em Excel para mandar o resumo do mês ao seu contador._
- **Relatório** — O relatório em si: receitas e despesas por grupo e categoria, com o total de cada uma e o resultado do período.
  - _Exemplo: Receitas R$ 8.000,00, Despesas R$ 6.500,00, resultado R$ 1.500,00._

**Dicas**

- Depois de mudar um filtro, clique em Atualizar para o relatório refletir a mudança.

**Erros comuns**

- Mudei o filtro e o relatório não mudou: clique em Atualizar para aplicar.
- Os botões de exportar não aparecem: monte o relatório primeiro clicando em Atualizar.

## Relatório por Favorecido `reports:favorecido`

Quanto você pagou e recebeu de cada pessoa ou empresa no período, com os lançamentos de cada uma.

- **Voltar aos Relatórios** — Fecha este relatório e volta para a lista de relatórios.
  - _Exemplo: volte para abrir o Demonstrativo Financeiro._
- **Período** — Botões rápidos que preenchem as datas com os últimos meses.
  - _Exemplo: clique em "12 meses" para ver o último ano._
- **Data Inicial e Data Final** — Escolha a data inicial e a final exatas do relatório.
  - _Exemplo: de 01/01 a 31/12 para fechar o ano._
- **Contas** — Marque só as contas que entram. Sem nada marcado, todas entram.
  - _Exemplo: marque só o cartão de crédito para ver onde você mais compra._
- **Atualizar** — Monta o relatório com os filtros escolhidos.
  - _Exemplo: mude o período e clique em Atualizar._
- **CSV Sintético** — Baixa uma linha por favorecido, só com os totais pago, recebido e saldo.
  - _Exemplo: uma lista curta com quanto foi pago a cada fornecedor._
- **CSV Analítico** — Baixa os totais e, embaixo de cada favorecido, cada lançamento que formou o total.
  - _Exemplo: conferir cada pagamento feito ao eletricista no ano._
- **Excel** — Gera a planilha formatada, pronta para imprimir ou enviar.
  - _Exemplo: mande ao contador a lista do que foi pago a prestadores de serviço._
- **Buscar favorecido** — Digite parte do nome para filtrar a tabela.
  - _Exemplo: digite "posto" para ver todos os postos de combustível._
- **Tabela de favorecidos** — Total pago, recebido e saldo de cada favorecido. Clique numa linha para ver os lançamentos dele.
  - _Exemplo: clique em "Escola Aprender" para ver as 12 mensalidades._

## Fluxo de Caixa por Conta `reports:fluxo-conta`

Os movimentos e o saldo acumulado de uma conta, de um grupo ou das contas principais, incluindo o que está agendado.

- **Voltar aos Relatórios** — Fecha este relatório e volta para a lista de relatórios.
  - _Exemplo: volte para abrir outro relatório._
- **Por Conta / Por Grupo / Contas Principais** — "Por Conta" deixa escolher contas avulsas; "Por Grupo" usa um grupo de contas; "Contas Principais" usa as que somam no Saldo Principal.
  - _Exemplo: escolha "Contas Principais" para ver o dinheiro do dia a dia._
- **Provisório** _(só se: pode:fluxo:incluir)_ — Adiciona uma entrada ou saída só para simular. Ela não vira lançamento nem agendamento.
  - _Exemplo: simule uma despesa de R$ 2.000,00 no dia 20 para ver se o saldo aguenta._
- **Contas / Grupo de Contas** — Escolha as contas ou o grupo de contas que entram, conforme a visão escolhida.
  - _Exemplo: marque a conta corrente e a poupança._
- **Data inicial e Data final** — O período do relatório. O saldo começa no dia anterior à data inicial.
  - _Exemplo: de hoje até o fim do próximo mês._
- **Incluir agendamentos** — Ligado, soma também as contas a pagar e a receber que ainda vão acontecer, não só o que já foi lançado.
  - _Exemplo: ligue para ver o salário e o aluguel do próximo mês no saldo._
- **Ocultar movimentos de reserva** — Tira da lista os depósitos e resgates de reserva.
  - _Exemplo: esconda as transferências para a reserva de emergência._
- **Ocultar movimentos de patrimônio** — Tira da lista compras e vendas de bens e investimentos.
  - _Exemplo: esconda a aplicação mensal no investimento._
- **Entradas, Saídas e Saldo Projetado** — Mostra o total que entra, o que sai e o saldo esperado no fim do período.
  - _Exemplo: Entradas R$ 6.000,00, Saídas R$ 5.200,00, Saldo projetado R$ 2.300,00._
- **Exportar Excel** — Gera a planilha com todas as movimentações e o saldo após cada uma.
  - _Exemplo: exporte o fluxo do mês para planejar com a família._
- **Caixinha da linha** — Desmarque uma linha para ver o saldo sem ela. É só simulação: nada muda de verdade.
  - _Exemplo: desmarque a viagem planejada para ver quanto sobra sem ela._
- **Data (clicável)** — Clique na data de um agendamento para testar outro dia e ver o efeito no saldo. Não altera o agendamento.
  - _Exemplo: mude o IPVA do dia 5 para o dia 25 e veja se o saldo fica positivo._

**Dicas**

- O saldo parte do dia anterior à data inicial e vai somando cada movimento do período.

**Erros comuns**

- O saldo inicial parece errado: ele é o saldo do dia anterior à data inicial. Confira se há lançamentos faltando antes do período.

## Alertas `alerts`

O que vence hoje e nos próximos dias, e os avisos que precisam da sua atenção.

- **Vencimentos / Integridade** — "Vencimentos" lista o que está para vencer. "Integridade" mostra a conferência automática dos dados (faturas, parcelas e subcontas).
  - _Exemplo: abra "Integridade" para ver se alguma fatura ficou com valor diferente do esperado._
- **Ativar Notificações** — Pede ao navegador permissão para mostrar avisos. Com ela, o Finup avisa no dia em que uma conta vence, mesmo com outra tela aberta.
  - _Exemplo: clique, aceite a permissão, e no dia do boleto da escola aparece um aviso na tela._
- **Conferir em Agendamentos** _(só se: pagina:schedule)_ — O Finup registra sozinho algumas contas na data, mas para quando já existe um lançamento muito parecido, para não lançar em dobro. O botão leva a Agendamentos, onde você decide se é o mesmo ou não.
  - _Exemplo: a mensalidade da academia já foi lançada à mão; em Agendamentos, ligue a ocorrência a esse lançamento._
- **Alertas de vencimento** — Lista as contas a pagar e as faturas que vencem hoje ou nos próximos dias, conforme a antecedência definida em cada agendamento.
  - _Exemplo: "Conta de luz — vence em 3 dias — R$ 180,00"._
- **Dispensar** — Tira o alerta da lista. Não paga nem apaga a conta: só diz que você já viu e cuidou dele.
  - _Exemplo: já agendou o pagamento no banco? Dispense o alerta para limpar a lista._
- **Calendário de Vencimentos — Cartões** — Mostra cada cartão com a data do próximo vencimento, quantos dias faltam e o valor da fatura.
  - _Exemplo: "Cartão final 1234 — vence dia 15 — faltam 6 dias — R$ 2.300,00"._

**Dicas**

- O aviso de vencimento usa os dias de antecedência definidos em cada agendamento ("Lembrar com Antecedência").

**Erros comuns**

- Não chega aviso no celular ou computador: clique em "Ativar Notificações" e aceite a permissão do navegador.

## Integridade `alerts:integridade`

Confere faturas, parcelas e subcontas com as regras do Finup e lista o que não bate. Ela só aponta — nada é corrigido sem você mandar.

- **Varrer agora** _(só se: pode:alertas:editar)_ — Refaz a conferência de todos os dados agora. Use depois de corrigir algo à mão, para ver se a pendência sumiu.
  - _Exemplo: você ajustou uma parcela no cartão; clique em "Varrer agora" para conferir de novo._
- **Pendentes / Ignoradas / Resolvidas** — "Pendentes" são as que precisam de atenção. "Ignoradas" são as que você disse que estão certas. "Resolvidas" são as que já foram corrigidas.
  - _Exemplo: abra "Ignoradas" para rever uma pendência que você ignorou por engano._
- **Corrigir todas** _(só se: pode:alertas:editar)_ — Aplica, de uma vez, as correções que o Finup sabe fazer sozinho, e depois confere tudo de novo. As que precisam da sua decisão continuam na lista.
  - _Exemplo: "Corrigir todas (5)" ajusta as cinco pendências automáticas numa só ação._
- **Corrigir** _(só se: pode:alertas:editar)_ — Mostra o que será mudado para resolver aquela pendência. Nada é gravado antes de você confirmar.
  - _Exemplo: a correção propõe mover uma parcela para a fatura certa; confira e confirme._
- **Abrir lançamento / Ir para a fatura** — Abre o lançamento ou a fatura do cartão ligados à pendência, para você ver os dados com calma.
  - _Exemplo: a pendência fala de uma compra parcelada; clique em "Abrir lançamento" para ver as parcelas._
- **Ignorar / Reabrir** _(só se: pode:alertas:editar)_ — "Ignorar" tira da lista uma pendência que você sabe que está certa. "Reabrir" traz de volta uma que foi ignorada.
  - _Exemplo: a diferença na fatura é de um acordo com o banco que você conhece; ignore a pendência._

**Dicas**

- Faturas já fechadas não são avaliadas.

**Erros comuns**

- Corrigiu e a pendência voltou: algum dado ainda não bate. Abra o lançamento ou a fatura indicada e confira antes de corrigir de novo.

## Assistente `assistente`

Conte o que aconteceu do seu jeito — escrevendo, falando ou mandando uma foto, print ou PDF — e o Assistente prepara o lançamento, o agendamento ou a consulta. Nada é salvo sem você conferir.

- **Campo de texto** — Escreva como falaria com alguém: o valor, onde foi e, se quiser, a conta ou o cartão. Dá para colar um print aqui também.
  - _Exemplo: "gastei 80 no posto no cartão" ou "recebi 1.200 de aluguel ontem"._
- **Microfone** — Toque, espere o bipe e fale. Ele para sozinho depois de uns segundos de silêncio; o texto aparece no campo para você conferir antes de enviar.
  - _Exemplo: "paguei 150 de luz no pix"._
- **Câmera** — Abre a câmera para fotografar o papel. O Assistente lê valor, data e estabelecimento.
  - _Exemplo: foto do cupom do supermercado._
- **Anexar** — Escolhe uma imagem ou um PDF já salvo. Fatura ou extrato com vários lançamentos vira uma lista para confirmar um por um.
  - _Exemplo: o PDF do boleto do condomínio vira uma conta a pagar com o vencimento certo._
- **Enviar** — O Assistente prepara a prévia nos formulários de sempre. Nada é salvo até você conferir e confirmar; ele nunca exclui nada.
  - _Exemplo: depois de enviar "almoço 45", aparece a prévia de uma despesa de R$ 45,00 para você salvar._

**Dicas**

- Fatura ou extrato em PDF com vários lançamentos vira uma lista para confirmar um por um.
- O Assistente nunca exclui nada. Para excluir, ele mostra onde fazer isso.

**Erros comuns**

- O microfone não funciona: permita o microfone para o Finup no navegador ou use o do teclado.
- PDF muito grande (mais de 3 MB): envie só as páginas necessárias ou tire um print.

## Clientes Finup `clientes`

Tela do administrador da plataforma: pedidos de novos clientes, cadastro, aprovação e acompanhamento de cada cliente.

- **Clientes / Consumo de IA** — A aba Clientes cuida dos cadastros e pedidos; a aba Consumo de IA mostra quanto cada cliente usou o Assistente.
  - _Exemplo: abra "Consumo de IA" no fim do mês para conferir os custos._
- **Filtro por situação** — Botões com cada situação (pedido, ativo, suspenso, cancelado…) e a quantidade de clientes em cada uma. Clique para filtrar.
  - _Exemplo: clique em "Pedido" para ver quem pediu acesso pelo site e ainda espera aprovação._
- **Recarregar** — Busca a lista de clientes de novo no servidor.
  - _Exemplo: um pedido acabou de chegar pelo site; recarregue para vê-lo._
- **Novo cliente** — Cadastra um cliente direto, sem esperar o pedido pelo site. Depois ele segue o mesmo caminho de aprovação.
  - _Exemplo: cadastre a "Loja Modelo" que fechou contrato por telefone._
- **Lista de clientes** — Clique num cliente para ver os dados e as ações: aprovar, reenviar convite, mensagem de boas-vindas, editar ou excluir. O ícone de gráfico abre a Análise do Cliente.
  - _Exemplo: abra um cliente com situação "Pedido" e clique em Aprovar._

**Dicas**

- Para excluir um cliente, cancele-o antes.

**Erros comuns**

- Não consigo excluir um cliente: cancele o cliente primeiro; só então a exclusão fica disponível.

## Consumo de IA `clientes:consumo`

Quanto cada cliente usou o Assistente no período e o custo estimado, com a tabela de preços usada no cálculo.

- **Período** — Escolha este mês, o mês anterior ou um intervalo de datas para somar o consumo.
  - _Exemplo: escolha "Mês anterior" para fechar a conta do mês que passou._
- **Cliente** — Mostra a soma de todos os clientes ou só de um.
  - _Exemplo: escolha um cliente para ver se ele está usando muito o Assistente._
- **Recarregar** — Lê de novo o consumo registrado de cada cliente.
  - _Exemplo: recarregue depois de alguns minutos para ver as chamadas mais recentes._
- **Totais** — Mostra o número de chamadas, os tokens (pedaços de texto processados), as imagens, o custo estimado em dólar e em reais e o tempo médio de resposta.
  - _Exemplo: 1.200 chamadas no mês, custo estimado de US$ 4,80._
- **Preços** — A tabela com o preço de cada modelo por milhão de tokens e a data em que o preço passou a valer. O cálculo usa o preço válido em cada dia.
  - _Exemplo: cadastre o preço novo de um modelo a partir do dia em que ele mudou._

**Dicas**

- É uma estimativa pelos tokens registrados: o valor cobrado de verdade está no Console da Anthropic.

**Erros comuns**

- Custo aparece como parcial: falta o preço de algum modelo usado. Cadastre o preço na tabela Preços.

## Configurações `settings`

Ajustes do Finup: perfis, categorias, grupos de contas, período financeiro, regras e dados. Escolha a aba no alto e, quando houver, a seção no menu ao lado.

- **Você está em** — É a linha logo abaixo do título. Ela mostra em qual aba e em qual seção você está, para não se perder entre tantos ajustes.
  - _Exemplo: "Configurações › Cadastros › Categorias" quer dizer que você está editando as categorias._
- **Geral** — Reúne os ajustes básicos do ambiente: quando o mês financeiro começa, o nome que sai nos relatórios, as regras de estorno e IOF do cartão, os perfis (CPF/CNPJ) e a agenda no celular.
  - _Exemplo: abra Geral › Perfis para cadastrar a sua empresa._
- **Cadastros** — São as listas usadas nos formulários do dia a dia. O que você cadastra aqui aparece para escolher ao lançar, agendar ou importar.
  - _Exemplo: crie a categoria "Academia" em Cadastros › Categorias para usá-la nos lançamentos._
- **Regras** — Regras fazem o Finup preencher campos sozinho quando a descrição do lançamento tem um certo texto. Economizam tempo na importação.
  - _Exemplo: tudo que tiver "POSTO" na descrição vai para a categoria Combustível._
- **Dados** — Tudo o que mexe nos dados como um todo: cópia de segurança (backup), ferramentas de manutenção e a limpeza dos dados guardados no aparelho.
  - _Exemplo: baixe um backup em Dados › Backup antes de uma grande mudança._
- **Usuários** _(só se: pode:usuarios:ver)_ — Só administradores veem esta aba. Nela você cadastra quem pode entrar, define o nível de acesso e quais perfis cada pessoa enxerga.
  - _Exemplo: cadastre o contador com nível Consulta, para ele só ver os números._
- **Zona de perigo** — Fica separada e em vermelho porque as ações dela apagam dados de vez. Use só quando tiver certeza e um backup feito.
  - _Exemplo: apagar todos os dados para recomeçar um ambiente de teste do zero._
- **Seções** — Cada aba tem várias seções. No computador o menu fica à esquerda; no celular, logo acima do conteúdo. A seção aberta fica destacada.
  - _Exemplo: na aba Cadastros, clique em "Grupos de contas" para organizar as suas contas._

**Dicas**

- Cada seção tem o próprio guia: abra a seção e toque no "?" para ver os botões dela.
- Se aparecer "Somente leitura", o seu nível de acesso permite ver, mas não gravar, aquela seção.

**Erros comuns**

- Não acho uma seção: ela fica dentro de uma aba. Escolha a aba no alto (Geral, Cadastros, Regras…) e depois a seção no menu ao lado.
- Aparece "Somente leitura": o seu nível de acesso só permite ver. Peça a um administrador para mudar a sua permissão.

## Agenda no celular `settings:agenda-celular`

Mostra os agendamentos pendentes e as faturas em aberto na agenda do iPhone ou no Google Agenda.

- **Mostrar na agenda** — Escolha o que vai para a agenda: só as contas a pagar, só as a receber, ou as duas. Com "Ambos", cada uma vira um calendário separado.
  - _Exemplo: escolha "Despesas" para lembrar só do que você tem que pagar._
- **Mostrar valores** — Define se o valor aparece junto do nome do compromisso. Desligue se outras pessoas costumam ver a tela do seu celular.
  - _Exemplo: com "Sim" aparece "Aluguel — R$ 1.500,00"; com "Não", só "Aluguel"._
- **Criar minha agenda** — Cria o seu link pessoal de agenda. Só precisa fazer uma vez; depois aparecem os botões para adicionar ao celular.
  - _Exemplo: clique em "Criar minha agenda" e, em seguida, em "Adicionar ao iPhone"._
- **Adicionar ao iPhone** — Abre a agenda do iPhone pedindo para assinar o calendário do Finup. Confirme no celular e os vencimentos passam a aparecer lá.
  - _Exemplo: abra esta tela no próprio iPhone, toque no botão e confirme "Assinar"._
- **Adicionar ao Google Agenda** — Abre o Google Agenda com o calendário do Finup pronto para adicionar. Depois ele aparece também no celular Android ligado à mesma conta.
  - _Exemplo: clique no botão, confirme "Adicionar" e veja as contas a pagar no calendário._
- **Copiar link** — Copia o endereço do calendário para você colar em outro aplicativo de agenda que aceite assinatura por link.
  - _Exemplo: copie o link e cole na opção "Adicionar calendário por URL" do seu aplicativo._
- **Gerar novo link** — Cria um endereço novo e desliga o antigo. Use se o link foi parar com alguém que não devia. Depois, adicione a agenda de novo nos aparelhos.
  - _Exemplo: você mandou o link por engano para um grupo; gere um novo e assine de novo no seu celular._

**Dicas**

- Quais agendamentos entram você escolhe em cada agendamento ou em lote na lista de Agendamentos.
- A agenda é só para consulta: pagar e editar continuam no Finup.

**Erros comuns**

- A agenda do celular não mostra um agendamento: confira se ele está marcado para sincronizar com a agenda (no próprio agendamento ou em lote na lista).
- Os compromissos demoram a mudar: o aplicativo de agenda do celular atualiza a assinatura de tempos em tempos, não na hora.

## Apelidos da IA `settings:apelidos-ia`

Termos que o Assistente aprendeu quando você corrigiu uma sugestão dele; passam a valer nas próximas vezes.

- **Recarregar** — Busca de novo a lista no servidor, para ver apelidos que o Assistente aprendeu há pouco.
  - _Exemplo: você acabou de corrigir uma sugestão no Assistente; clique em Recarregar para ver o apelido novo._
- **Termo** — É a palavra ou expressão do seu jeito de falar. Dá para corrigir o texto direto no campo; ao sair dele, a mudança é gravada.
  - _Exemplo: o termo "mercadinho" pode apontar para a categoria Supermercado._
- **Vai para** — Mostra para onde o termo leva: uma categoria, uma conta ou um favorecido. É o que o Assistente vai escolher quando ouvir aquele termo.
  - _Exemplo: "conta da empresa" vai para a conta corrente do perfil da empresa._
- **Excluir (lixeira)** _(só se: pode:cadastros:excluir)_ — Apaga o apelido. O Assistente volta a adivinhar sozinho na próxima vez e pode aprender de novo se você corrigir.
  - _Exemplo: apague o apelido "farmácia → Saúde" se agora quiser separar em outra categoria._

**Dicas**

- Apelido que aponta para um cadastro apagado ou renomeado aparece marcado e é ignorado.

## Atalhos `settings:atalhos`

As combinações de teclas de cada ação. Valem só no computador.

- **Restaurar todos os padrões** — Desfaz todas as suas personalizações de uma vez e volta cada ação para a combinação de fábrica.
  - _Exemplo: você mudou vários atalhos e se confundiu; clique aqui para começar do padrão._
- **Gravar atalho** — Clique no botão do atalho e aperte a nova combinação no teclado. Ela fica gravada para você em qualquer computador. Esc cancela sem mudar.
  - _Exemplo: clique no atalho de "Novo lançamento" e aperte Alt+N._
- **Desativar** — Tira o atalho daquela ação. Útil quando a combinação atrapalha outro programa que você usa.
  - _Exemplo: desative um atalho que conflita com o do seu navegador._
- **Restaurar padrão** — Volta só aquela ação para a combinação padrão, sem mexer nas outras.
  - _Exemplo: restaure o atalho de "Buscar" e mantenha os demais como você deixou._
- **Fixos** — Lista combinações que valem sempre e não podem ser mudadas, como a que mostra a ajuda de atalhos.
  - _Exemplo: Shift+? abre a lista de atalhos da tela em que você está._

**Dicas**

- Aperte Shift+? em qualquer tela para ver os atalhos dela.

**Erros comuns**

- O atalho não funciona: atalhos valem só no computador e não funcionam enquanto você digita dentro de um campo.
- Combinação recusada: ela já é usada por outra ação ou é reservada. Escolha outra, sempre com Alt ou Ctrl.

## Backup `settings:backup`

Baixe uma cópia de todos os dados do app ou restaure uma cópia anterior.

- **Contas, lançamentos, agendamentos** — Mostra quantas contas, lançamentos e agendamentos existem agora. Serve para conferir se o backup tem o tamanho esperado.
  - _Exemplo: antes de restaurar, anote que há 12 contas e 3.400 lançamentos para comparar depois._
- **Exportar backup completo** — Baixa um arquivo com todos os dados do ambiente. Guarde num lugar seguro: ele é a sua cópia de segurança.
  - _Exemplo: exporte um backup no fim de cada mês e guarde na sua pasta de documentos._
- **Importar backup** — Troca todos os dados atuais pelos do arquivo escolhido. Não junta: o que não estiver no arquivo deixa de existir.
  - _Exemplo: restaurar a cópia de ontem depois de apagar algo importante sem querer._

**Dicas**

- Restaurar um backup não tem volta: exporte um backup atual antes.

**Erros comuns**

- Restaurou o arquivo errado: a restauração troca tudo. Por isso, sempre exporte um backup atual antes de importar outro.

## Categorias `settings:categorias`

As categorias de receita e despesa, organizadas em grupos, e a ordem em que aparecem nos seletores.

- **Padrão** — Volta a ordem de grupos e categorias para a padrão (grupos na ordem do sistema e categorias em ordem alfabética). Nada é apagado.
  - _Exemplo: depois de arrastar muita coisa, clique em Padrão para reorganizar tudo._
- **+ Grupo** — Cria um grupo vazio para juntar categorias parecidas. Depois você move categorias para ele.
  - _Exemplo: crie o grupo "Casa" para juntar Aluguel, Luz e Água._
- **Mostrar categorias de** — Mostra só as categorias liberadas para um perfil (pessoa ou empresa). Categorias sem perfil valem para todos e sempre aparecem.
  - _Exemplo: escolha o perfil da empresa para ver só as categorias usadas por ela._
- **Renomear / excluir grupo** — O lápis renomeia o grupo e as categorias dele acompanham. A lixeira só funciona com o grupo vazio.
  - _Exemplo: renomeie o grupo "Transporte" para "Carro e transporte"._
- **Arrastar ⠿ e setas** — Arraste pelo ⠿ ou use as setas para mudar a posição. A ordem daqui é a mesma dos seletores de categoria em todo o Finup.
  - _Exemplo: suba "Supermercado" para o topo, já que é a que você mais usa._
- **Grupo da categoria** — Troca o grupo de uma categoria. Os lançamentos continuam na mesma categoria; só muda onde ela aparece nos relatórios.
  - _Exemplo: mova "Farmácia" do grupo "Outros" para o grupo "Saúde"._
- **Grupo gerencial padrão** _(só se: gerencial)_ — Define o grupo gerencial que já vem preenchido quando você lança nesta categoria. Você ainda pode trocar no lançamento.
  - _Exemplo: a categoria "Viagem" já vem com o grupo gerencial da reserva de viagens._
- **Conta de investimento** — Ao escolher uma conta aqui, cada despesa de cartão nesta categoria gera também um aporte nessa conta de investimento.
  - _Exemplo: compras na categoria "Previdência" no cartão viram aporte na conta de previdência._
- **Espelho** — Ligado, cada lançamento nesta categoria cria uma cópia na conta vinculada. Serve para controlar, por exemplo, quanto alguém lhe deve.
  - _Exemplo: a categoria "Empréstimo a terceiros" espelha cada valor na conta "A receber de terceiros"._
- **Excluir (lixeira)** — Apaga a categoria. Antes, confira se ela não está em uso; se estiver, prefira mover os lançamentos para outra categoria.
  - _Exemplo: exclua uma categoria criada por engano e ainda sem lançamentos._
- **Adicionar categoria** — Preencha o nome, o grupo, se é despesa, receita ou ambos, um emoji e, se quiser, os perfis que podem usar. Clique em Adicionar.
  - _Exemplo: "Pet shop", grupo "Casa", Despesa, emoji 🐶, para todos os perfis._

**Dicas**

- Para reordenar, deixe o filtro em "Todos os perfis".
- O grupo é obrigatório: escolha um existente ou digite um nome novo para criá-lo junto.

**Erros comuns**

- Não consigo criar a categoria: o campo Grupo é obrigatório. Escolha um grupo da lista ou digite um nome novo.
- As setas de ordem sumiram: o filtro está num perfil. Volte para "Todos os perfis" para reordenar.

## Centros de custo `settings:centros-custo`

Rótulos livres para separar lançamentos por finalidade.

- **Centros cadastrados** — Mostra todos os centros de custo já criados. Eles aparecem como opção nos lançamentos e agendamentos.
  - _Exemplo: "Obra", "Filial Centro" e "Viagem de férias"._
- **Adicionar** — Digite um nome curto e clique em Adicionar. O centro de custo é um rótulo extra, que não substitui a categoria.
  - _Exemplo: crie "Reforma 2026" para somar tudo o que for gasto na reforma, de várias categorias._

## Regras de classificação `settings:classificacao`

Categoria e favorecido aplicados automaticamente quando a descrição do lançamento contém um texto.

- **Excluir (lixeira)** — Apaga a regra. Os lançamentos já classificados por ela não mudam; ela só deixa de agir nos próximos.
  - _Exemplo: apague a regra "PADARIA → Lazer" que foi criada com a categoria errada._
- **Adicionar** — Digite um pedaço de texto que aparece na descrição e escolha a categoria. Toda descrição que contiver esse texto recebe a categoria sozinha.
  - _Exemplo: "FARMA" → Saúde; assim "FARMACIA CENTRAL" já entra em Saúde._

**Dicas**

- As regras também são criadas sozinhas quando você classifica lançamentos importados.

## Controle gerencial `settings:controle-gerencial`

Liga ou desliga o controle gerencial do ambiente e cadastra os grupos usados para separar os gastos do cartão.

- **Usar controle gerencial** — Liga ou desliga o controle gerencial para todo o ambiente. Desligado, as telas e campos gerenciais somem, mas o histórico fica guardado.
  - _Exemplo: ligue para separar os gastos do cartão por objetivo, como casa, viagem e trabalho._
- **+ Grupo** _(só se: gerencial)_ — Cria um grupo para separar os gastos do cartão. Informe o nome, um apelido curto (até 4 letras) e a conta de onde sai o resgate.
  - _Exemplo: grupo "Viagens", apelido "VIA", com resgate na conta reserva de viagens._
- **Editar (lápis)** _(só se: gerencial)_ — Muda nome, apelido ou conta de resgate do grupo. Os lançamentos que já usam o grupo continuam ligados a ele.
  - _Exemplo: troque a conta de resgate do grupo "Casa" para a nova conta reserva._
- **Excluir (lixeira)** _(só se: gerencial)_ — Remove o grupo. Grupos fixos do sistema não podem ser removidos.
  - _Exemplo: exclua o grupo "Festa 2025" depois que tudo dele foi resolvido._

**Dicas**

- Para desligar, as subcontas gerenciais precisam estar com saldo zero e sem agendamentos pendentes; o Finup mostra o que falta.
- Esta seção só aparece no computador.

**Erros comuns**

- Não consigo desligar: ainda há saldo nas subcontas gerenciais ou agendamentos pendentes. O Finup lista o que falta resolver.

## Dados deste aparelho `settings:dados-aparelho`

Apaga os dados guardados neste navegador ou celular e encerra a sessão. Os dados na nuvem não são afetados.

- **Sair e apagar dados deste aparelho** — Encerra a sessão e limpa o que ficou guardado neste navegador ou celular. Os seus dados na nuvem continuam intactos e voltam quando você entrar de novo.
  - _Exemplo: usou o Finup no computador de um hotel; ao terminar, clique aqui antes de sair._

**Dicas**

- Se houver alterações ainda não enviadas, envie antes de apagar.

## De-para de importação `settings:depara-importacao`

Quando um arquivo importado traz uma categoria que não existe no Finup, ela vira a categoria escolhida aqui.

- **Recarregar** — Busca a lista de novo, incluindo de-paras criados há pouco durante uma importação.
  - _Exemplo: você acabou de importar uma planilha; recarregue para ver os de-paras novos._
- **Adicionar** _(só se: pode:lancamentos:incluir)_ — Digite o nome da categoria exatamente como vem no arquivo e escolha a categoria do Finup que deve recebê-la.
  - _Exemplo: "Alimentação/Mercado" do arquivo vira "Supermercado" no Finup._
- **Categoria do Finup** — Troca a categoria de destino de um de-para já salvo. Vale para as próximas importações.
  - _Exemplo: mude "Lazer/Bar" de "Lazer" para "Restaurantes"._
- **Excluir (lixeira)** _(só se: pode:lancamentos:incluir)_ — Apaga o de-para. Na próxima importação, o Finup volta a perguntar qual categoria usar.
  - _Exemplo: apague um de-para que ligou duas categorias erradas._

**Dicas**

- Os de-paras também são criados na prévia da importação, ao escolher a categoria correspondente.

## Estorno e IOF de cartão `settings:estornos`

Como tratar estornos que aparecem na fatura do cartão e qual alíquota de IOF usar em compras internacionais.

- **Aplicar categoria padrão para estornos** — Ligado, todo estorno encontrado na importação da fatura (dinheiro devolvido que não é pagamento) já entra com uma categoria definida.
  - _Exemplo: a loja devolveu R$ 80,00 de uma compra cancelada e o estorno já entra classificado._
- **Categoria** — A categoria que os estornos do cartão recebem quando a opção acima está ligada.
  - _Exemplo: escolha a categoria "Estornos e devoluções"._
- **Alíquota do IOF (%)** — A porcentagem de IOF usada para estimar compras em moeda estrangeira lançadas pelo Assistente. Grava quando você sai do campo.
  - _Exemplo: com 3,5%, uma compra que deu R$ 100,00 estima R$ 3,50 de IOF._

**Dicas**

- Na importação da fatura, a compra e o IOF recebem o valor real cobrado.

## Favorecidos `settings:favorecidos`

O cadastro de favorecidos: inclua os nomes que já estão em uso, renomeie e junte nomes repetidos.

- **Sincronizar com lançamentos** — Procura nomes usados em lançamentos, agendamentos e regras que ainda não estão no cadastro e os inclui.
  - _Exemplo: depois de importar um extrato, sincronize para ver os nomes novos na lista._
- **Buscar favorecido** — Digite parte do nome para filtrar a lista e achar rápido o favorecido.
  - _Exemplo: digite "padaria" para ver todas as padarias cadastradas._
- **Marcar** — Marque a caixinha dos nomes que são a mesma pessoa ou empresa. Com dois ou mais marcados, o botão Mesclar fica disponível.
  - _Exemplo: marque "Mercado Bom Preço" e "MERCADO BOM PRECO LTDA"._
- **Mesclar** — Junta os nomes marcados em um só. Você escolhe o nome final e vê quantos registros mudam antes de confirmar.
  - _Exemplo: os dois nomes acima viram só "Mercado Bom Preço"._
- **Renomear** — Troca o nome em todos os lugares onde ele aparece: lançamentos, agendamentos e regras.
  - _Exemplo: renomeie "Dr. Silva" para "Clínica Silva"._

**Dicas**

- Marque "Usar esse nome nas próximas importações" para que o nome novo seja aplicado sozinho.

**Erros comuns**

- O mesmo favorecido aparece com nomes diferentes: marque os nomes repetidos e use Mesclar para deixar um só.

## Regras de grupo gerencial `settings:grupo-gerencial`

Escolhem o grupo gerencial na importação da fatura pela descrição, parcelamento e valor. Vale a primeira que bater.

- **Setas** _(só se: gerencial)_ — As regras são testadas de cima para baixo e vale a primeira que combinar. Use as setas para mudar a prioridade.
  - _Exemplo: suba a regra "UBER parcelado" para ela valer antes da regra geral "UBER"._
- **Excluir (lixeira)** _(só se: gerencial)_ — Apaga a regra. Na próxima importação da fatura ela deixa de ser usada.
  - _Exemplo: exclua a regra de um grupo gerencial que você não usa mais._
- **Nova regra** _(só se: gerencial)_ — Informe a palavra-chave da descrição, se vale para compra parcelada, à vista ou qualquer uma, um valor mínimo e máximo (opcionais) e o grupo gerencial.
  - _Exemplo: "HOTEL", qualquer forma, acima de R$ 300,00 → grupo "Viagens"._

**Dicas**

- Esta seção só aparece no computador.

## Grupos de contas `settings:grupos-contas`

Agrupam as contas (por exemplo, por banco) e definem a ordem em que aparecem nos seletores.

- **Padrão** — Volta os grupos de contas para a ordem padrão. Nada é apagado.
  - _Exemplo: clique em Padrão se a ordem ficou confusa depois de muitas mudanças._
- **Arrastar ⠿ e setas** — Arraste pelo ⠿ ou use as setas. A ordem daqui é a mesma da tela Contas e dos seletores de conta.
  - _Exemplo: deixe o grupo do banco que você mais usa em primeiro._
- **Inibir / Reativar (olho)** — Esconde o grupo do aplicativo sem apagar nada. O olho de novo traz o grupo de volta.
  - _Exemplo: inibir o grupo de um banco que você deixou de usar, mantendo o histórico._
- **Editar (lápis)** — Muda o nome do grupo e a conta âncora. A conta âncora é a que recebe o ajuste quando você acerta o saldo do grupo todo em Manutenção.
  - _Exemplo: renomeie para "Banco A" e escolha a conta corrente como âncora._
- **Excluir (lixeira)** — Remove o grupo. As contas dele não são apagadas: passam para a seção "Sem Grupo".
  - _Exemplo: exclua um grupo vazio criado por engano._
- **Novo grupo** — Escolha o tipo: Financeiro (contas de dinheiro) ou Patrimonial (bens, investimentos e dívidas). Digite o nome e clique em +.
  - _Exemplo: tipo Patrimonial, nome "Imóveis", para cadastrar casa e terreno._

## Guias das telas `settings:guias`

Escolha se o guia de cada tela deve aparecer sozinho quando você entra nela. O botão "?" ao lado do título continua abrindo o guia quando quiser.

- **Guias do sistema** — É a chave geral dos guias. Desligada, nenhum tour abre sozinho, o "?" some dos títulos e o checklist de primeiros passos não aparece. Religando, tudo volta como estava.
  - _Exemplo: desligue os guias para mostrar o Finup numa reunião sem nenhuma janela de ajuda abrindo._
- **Reativar todos os guias** — Faz o guia voltar a abrir sozinho em todas as telas, inclusive nas que você tinha marcado "Não mostrar mais".
  - _Exemplo: depois de um tempo sem usar o Finup, reative para relembrar cada tela._
- **Desativar todos os guias** — Para de abrir o guia sozinho em qualquer tela. O botão "?" ao lado do título continua funcionando quando você quiser.
  - _Exemplo: você já conhece o Finup e prefere abrir a ajuda só pelo "?"._
- **Lista de telas** — Mostra cada tela e se o tour dela abre sozinho. Use o botão da linha para ligar ou desligar o tour de uma tela só.
  - _Exemplo: deixe o tour ligado só em Contratos, que você ainda está aprendendo._

**Dicas**

- Vale para você, em qualquer aparelho. Os outros usuários escolhem por conta própria.

## Identidade do ambiente `settings:identidade`

O nome e a frase que aparecem no rodapé da barra lateral e no cabeçalho dos relatórios em Excel.

- **Nome do ambiente** — O nome do dono do sistema, mostrado no rodapé do menu lateral e no cabeçalho das planilhas exportadas.
  - _Exemplo: "Família Souza" ou "Padaria Pão Quente"._
- **Frase do ambiente** — Uma linha opcional que sai embaixo do nome nos relatórios em Excel. Deixe em branco se não quiser.
  - _Exemplo: "Controle financeiro pessoal e da empresa"._
- **Salvar** _(só se: pode:configuracoes:editar)_ — Grava o nome e a frase. Os próximos relatórios exportados já saem com eles.
  - _Exemplo: preencha o nome, clique em Salvar e exporte um relatório para conferir o cabeçalho._

## Importação `settings:importacao`

Importação do histórico de lançamentos de outro aplicativo, revisando linha a linha antes de gravar.

- **Recarregar** — Busca de novo as linhas que ainda esperam revisão.
  - _Exemplo: outra pessoa revisou parte das linhas; recarregue para ver como ficou._
- **Conta Corrente / Cartões** — Separa a importação de extratos de conta corrente da importação de cartões, porque cada arquivo tem colunas diferentes.
  - _Exemplo: escolha "Cartões" antes de enviar a planilha das faturas antigas._
- **Selecionar arquivo** — Envia a planilha exportada do outro aplicativo. As linhas ficam pendentes para você revisar antes de virarem lançamentos.
  - _Exemplo: envie o arquivo .xlsx com o histórico do ano passado._
- **Pendentes, confirmados, ignorados** — Mostra quantas linhas ainda faltam revisar, quantas já viraram lançamento e quantas você descartou.
  - _Exemplo: "120 pendentes, 300 confirmados, 8 ignorados"._
- **Confirmar importação** — Transforma as linhas marcadas em lançamentos de verdade nas contas indicadas.
  - _Exemplo: marque as 50 linhas de janeiro e clique em Confirmar importação._
- **Ignorar** — Descarta as linhas marcadas sem criar lançamentos. Útil para linhas repetidas ou que não interessam.
  - _Exemplo: ignore as linhas de transferências que já estão lançadas._
- **Limpar pendentes** — Remove todas as linhas pendentes de uma vez. O que já foi confirmado continua como está.
  - _Exemplo: enviou o arquivo errado; limpe as pendências e envie o certo._

**Dicas**

- Linhas em amarelo estão sem conta e precisam de revisão.

**Erros comuns**

- Linha em amarelo não importa: ela está sem conta. Escolha a conta da linha antes de confirmar.

## Manutenção `settings:manutencao`

Ferramentas para corrigir diferenças nos dados. Nada muda até você confirmar.

- **Rateio de agendamentos nas baixas** — Procura pagamentos de agendamentos divididos em categorias que ficaram sem a divisão no lançamento.
  - _Exemplo: o condomínio era dividido entre "Taxa" e "Fundo de reserva", mas o pagamento ficou numa categoria só._
- **Procurar** — Faz a busca e mostra a lista. Você confere cada caso e decide aplicar a divisão.
  - _Exemplo: clique em Procurar, confira os 3 lançamentos achados e aplique._
- **Recalcular todos os saldos** — Refaz o saldo de todas as contas somando o saldo inicial e todos os lançamentos. Use se algum saldo parecer errado.
  - _Exemplo: o saldo de uma conta não bate com a soma do extrato; recalcule._
- **Corrigir Dados Gerenciais** _(só se: gerencial)_ — Arruma transferências e agendamentos gerenciais de compras parceladas que ficaram fora do lugar.
  - _Exemplo: uma compra parcelada mudou de grupo e as transferências antigas ficaram para trás._
- **Recalcular Agendamentos de Faturas** — Refaz as contas a pagar das faturas de cada cartão a partir das compras lançadas.
  - _Exemplo: o valor agendado da fatura não bate com o total das compras; recalcule._
- **Ajuste de saldo por grupo** — Informe o grupo de contas, a data e o saldo real do banco. O Finup mostra a diferença e lança o ajuste na conta âncora.
  - _Exemplo: o banco mostra R$ 5.000,00 e o Finup R$ 4.950,00; o ajuste lança R$ 50,00._
- **Restaurar saldo anterior** — Desfaz o último ajuste de saldo feito aqui, voltando o saldo ao que era.
  - _Exemplo: digitou o saldo errado no ajuste; clique para desfazer e faça de novo._

**Dicas**

- O ajuste por grupo precisa de uma conta âncora definida em Cadastros › Grupos de contas.

**Erros comuns**

- O ajuste por grupo não aparece para o grupo: falta definir a conta âncora em Cadastros › Grupos de contas.

## Perfis `settings:perfis`

As pessoas e empresas (CPF/CNPJ) donas das contas. Os perfis separam contas, lançamentos e relatórios.

- **Novo Perfil** — Abre o formulário para cadastrar uma pessoa (CPF) ou empresa (CNPJ). Cada perfil tem o próprio saldo, relatórios e categorias.
  - _Exemplo: um perfil para você (Pessoa Física) e outro para a sua loja (Pessoa Jurídica)._
- **Subir / Descer** — Muda a posição do perfil nos seletores e nos botões de filtro do topo da tela.
  - _Exemplo: suba o perfil da empresa se é o que você mais consulta._
- **Editar (lápis)** — Abre o formulário com os dados do perfil para trocar nome, documento, cor ou tipo.
  - _Exemplo: corrija o CNPJ digitado errado._
- **Excluir (lixeira)** — Apaga o perfil depois de confirmar. As contas dele continuam existindo, mas ficam "Sem vínculo".
  - _Exemplo: exclua um perfil de teste que não tem contas._
- **Perfil principal** — Dentro do formulário: o perfil marcado como principal já vem escolhido no filtro quando você abre o Finup.
  - _Exemplo: marque o seu perfil pessoal como principal para abrir sempre nele._

**Dicas**

- Com perfis cadastrados, aparece um filtro por perfil na barra superior.

**Erros comuns**

- Conta aparece como "Sem vínculo": ela não tem perfil. Edite a conta na tela Contas e escolha o perfil.
- Excluí um perfil e as contas sumiram dos totais: elas ficaram sem perfil. Ligue as contas a outro perfil.

## Período financeiro `settings:periodo`

Define quando o seu mês financeiro começa e termina, para agrupar receitas e despesas no Painel e nos relatórios.

- **Mês corrido / Mês personalizado** — "Mês corrido" usa o mês do calendário. "Mês personalizado" começa num dia que você escolhe, bom para quem recebe salário no meio do mês.
  - _Exemplo: quem recebe no dia 5 usa mês personalizado começando no dia 5._
- **Dia de início do mês financeiro** — O dia em que o seu mês financeiro começa (de 1 a 28). Só vale no modo "Mês personalizado".
  - _Exemplo: dia 15 faz o mês ir de 15/05 a 14/06, chamado de "Maio"._
- **Salvar** — Grava o modo e o dia. O Painel e os relatórios passam a agrupar receitas e despesas pelo novo período.
  - _Exemplo: mude para o dia 10, clique em Salvar e veja o Painel com o novo mês._

**Dicas**

- No mês personalizado, o período leva o nome do mês em que começa.

## Tipos de documento `settings:tipos-documento`

Tipos que classificam agendamentos e lançamentos (boleto, fatura, recibo…) e aparecem na coluna "Doc.".

- **Novo tipo** — Cadastra um tipo com nome, sigla curta (que aparece na coluna "Doc."), natureza e cor.
  - _Exemplo: nome "Nota fiscal", sigla "NF", cor verde._
- **Arrastar ⠿ e setas** — Arraste pelo ⠿ ou use as setas para mudar a ordem em que os tipos aparecem nos formulários.
  - _Exemplo: deixe "Boleto" em primeiro, já que é o mais usado._
- **Ativo / Inativo** — Tipo inativo some das opções dos formulários, mas continua aparecendo nos registros antigos que o usam.
  - _Exemplo: inative "Cheque" se você não usa mais cheques._
- **Editar (lápis)** — Muda nome, sigla, natureza ou cor. Os registros que já usam o tipo mostram a mudança.
  - _Exemplo: troque a cor de "Fatura" para destacar melhor na lista._
- **Excluir (lixeira)** — Apaga o tipo. Se ele já estiver em algum agendamento ou lançamento, o Finup só o inativa, para não perder a informação.
  - _Exemplo: exclua um tipo criado por engano e nunca usado._

**Dicas**

- O tipo do sistema (com cadeado) não pode ser excluído.

## Usuários `settings:usuarios`

Quem pode entrar no sistema, com o nível de acesso, os perfis permitidos e a situação de cada pessoa.

- **Recarregar** _(só se: pode:usuarios:ver)_ — Busca a lista de usuários de novo, com a situação atualizada de cada um.
  - _Exemplo: a pessoa acabou de criar a senha; recarregue para ver a situação nova._
- **Novo usuário** _(só se: pode:usuarios:ver)_ — Cadastra quem vai usar o sistema: nome, usuário para entrar, e-mail, senha, nível de acesso e os perfis que a pessoa pode ver.
  - _Exemplo: cadastre a secretária como Operador, vendo só o perfil da empresa._
- **Enviar link de senha (e-mail)** _(só se: pode:usuarios:ver)_ — Manda um e-mail com um link para a própria pessoa criar a senha. Assim você não precisa saber a senha dela.
  - _Exemplo: cadastre o usuário e clique no envelope para ele receber o convite por e-mail._
- **Redefinir senha (chave)** _(só se: pode:usuarios:ver)_ — Define uma senha nova na hora, sem precisar da antiga. Passe a senha à pessoa por um meio seguro.
  - _Exemplo: a pessoa esqueceu a senha e está sem acesso ao e-mail._
- **Editar (lápis)** _(só se: pode:usuarios:ver)_ — Muda nome, e-mail, nível de acesso e perfis permitidos da pessoa.
  - _Exemplo: passe alguém de Consulta para Operador para que possa lançar._
- **Ativar / Desativar** _(só se: pode:usuarios:ver)_ — Desativado, o usuário não entra mais, mas o histórico dele fica guardado. Dá para ativar de novo depois.
  - _Exemplo: desative o acesso de quem saiu da empresa._
- **Desbloquear** _(só se: pode:usuarios:ver)_ — Depois de várias senhas erradas o acesso fica travado por 15 minutos. Este botão libera na hora.
  - _Exemplo: a pessoa errou a senha cinco vezes e precisa entrar agora._

**Dicas**

- Mudanças de nível valem a partir do próximo login da pessoa.
- Você não pode desativar o próprio usuário.

**Erros comuns**

- A pessoa não consegue entrar: confira se o usuário está Ativo e se não ficou bloqueado por senhas erradas.
- Mudei o nível e nada aconteceu: a mudança vale a partir do próximo login da pessoa.

## Zona de perigo `settings:zona-perigo`

Apaga todos os dados do aplicativo. Esta ação não tem volta.

- **Apagar Todos os Dados** — Apaga contas, lançamentos e agendamentos do ambiente inteiro, depois de pedir confirmação. Não tem como desfazer sem um backup.
  - _Exemplo: zerar um ambiente de teste, depois de exportar um backup em Dados › Backup._

**Dicas**

- Antes de apagar, exporte um backup em Dados › Backup.
