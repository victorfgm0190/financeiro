# Guia da Tela — textos para revisão

Gerado de `src/lib/ajudaTelas.js` (AJUDA_TELAS). Para mudar um texto, edite aquele arquivo — este documento é só para leitura.
O tour da tela mostra, nesta ordem: o "Para que serve" (1º balão), um balão por item com o botão na tela (o número abaixo), um balão "Em cada linha da lista" com os itens marcados (por linha) quando a lista está vazia, e "Pronto!". Item cujo botão não está na tela no momento é pulado.
A explicação longa e o exemplo de cada item estão em `docs/central-ajuda-revisao.md` (Central de Ajuda).
`(só se: …)` = o item só aparece com o módulo ligado ou com a permissão. `(por linha)` = botão repetido em cada linha da lista.

Total: 58 telas e subtelas, 410 itens.

## Painel `dashboard`

Resumo da sua vida financeira: quanto você tem disponível, como o mês está indo e como ele deve terminar.

1. **Ver alertas** — Aparece quando uma fatura de cartão está perto de vencer; leva para a tela de Alertas. _(só se: pagina:alerts)_
2. **Saldo Principal** — O dinheiro disponível do dia a dia — soma das contas marcadas com "Somar no Saldo Principal". Clique para ver como o valor foi calculado.
3. **Receitas e Despesas do mês** — O que entrou e saiu no mês financeiro atual, comparado com o mês anterior. Clique num card para ver os lançamentos.
4. **Projeção** — Como o saldo deve ficar até o fim do mês, contando os agendamentos que ainda vão acontecer.
5. **Envelopes do mês** — Quanto já foi usado de cada envelope no mês. Só aparece quando há envelopes cadastrados.
6. **Uso da Receita** — Quanto da receita do mês já foi gasto; a cor avisa quando está perto ou acima do que entrou.
7. **Receitas vs Despesas** — Gráfico com o que entrou e saiu em cada um dos últimos 6 meses.
8. **Próximos Vencimentos** — Contas a pagar e a receber dos próximos 7 dias, e as que estão em atraso.
9. **Maiores Despesas** — Gráfico de pizza com as categorias em que você mais gastou. Clique numa fatia para ver os detalhes.
10. **Cheio / Líquido e período** — Escolha o mês (atual, anterior ou últimos 3) e se o valor desconta o que foi pago com dinheiro de reserva.
11. **Ranking por Categoria** — As mesmas despesas em forma de lista, da categoria que mais gastou para a que menos gastou.
12. **Top 5 Favorecidos** — De quem você mais recebeu e com quem mais gastou no mês. Clique num nome para ver os lançamentos.
13. **Contas** — O saldo de cada conta e a dívida de cada cartão, com a data do último movimento.

**Dicas**

- Use o filtro de perfil no topo para ver só uma pessoa ou empresa, ou "Tudo" para ver tudo junto.
- Conta de saldo principal sem movimento há mais de 30 dias aparece com um aviso — vale conferir se falta lançar algo.

## Início `inicio`

A tela inicial do celular: o seu saldo principal, o resumo do mês e os cards que você escolheu.

1. **Olho** — Esconde ou mostra os valores na tela — útil em lugares públicos.
2. **Perfis** — Escolha de qual pessoa ou empresa ver os números, ou "Tudo" para ver todos juntos.
3. **Buscar** — Procura lançamentos, contas e agendamentos em todo o Finup.
4. **Saldo principal** — O dinheiro disponível do dia a dia, as receitas e despesas do mês e como o mês deve terminar. Toque para ver como o valor foi calculado.
5. **Ver tudo** — Em cada card, abre a tela completa daquele assunto.
6. **Personalizar cards do Início** — Escolha quais cards aparecem e em que ordem.

## Mais `mais`

Todas as telas que não cabem na barra de baixo, as configurações e a sua sessão.

1. **Telas** — Toque num quadro para abrir a tela correspondente.
2. **Configurações** — Os ajustes do Finup: perfis, categorias, regras e outros.
3. **Tema** — Escolha o visual claro, escuro ou igual ao do celular.
4. **Sua sessão** — Mostra com qual usuário você entrou e tem o botão para sair.

## Maiores despesas `despesas`

Em que categorias o seu dinheiro foi gasto no período, em pizza ou em ranking.

1. **Período** — Mês atual, mês anterior ou os últimos meses.
2. **Pizza / Ranking e Cheio / Líquido** — Escolha entre o gráfico de pizza e a lista em ordem, e se o valor é cheio ou descontando o que saiu das reservas.
3. **Ver todas / Mostrar menos** — Mostra todas as categorias ou só as maiores.

**Dicas**

- "Cheio" bate com as Despesas do Mês do Painel; "Líquido" desconta o resgate de reserva da mesma categoria.

## Contas `accounts`

Todas as suas contas e bens, separados em grupos (conta corrente, poupança, investimentos, imóveis…).

1. **Saldo Atual** — A soma das contas que estão na tela, hoje. O Saldo Futuro mostra como fica depois dos lançamentos já feitos com data à frente.
2. **Patrimônio Líquido** — Tudo o que você tem menos o que deve. Clique para ver a composição.
3. **N sem grupo (no fim da página) ↓** — Aparece ao lado de "Contas (N)" quando há contas fora dos grupos. Clique para descer até a seção "Sem Grupo".
4. **Grupos** — Organiza as contas em grupos e define a ordem em que aparecem.
5. **Nova Conta** — Cadastra uma conta. Escolha o perfil (CPF/CNPJ) dela para que apareça nos totais certos. _(só se: pode:contas:incluir)_
6. **Cabeçalho do grupo** — Mostra o total do grupo. Clique para recolher ou abrir as contas dele. _(por linha)_
7. **Cartão da conta** — Mostra o saldo de hoje e o saldo futuro. Clique para abrir o extrato. Arraste o cartão para outro grupo para mudá-lo de lugar. _(por linha)_
8. **Selos da conta** — Perfil dono da conta (ou "Sem vínculo"), apelido, FC (soma no Saldo Principal), INV (investimento), CC (Conta central) e Inativa. _(por linha)_
9. **Lançar rendimento** — Registra o rendimento do mês. Só aparece em contas com categoria de rendimento definida. _(por linha)_ _(só se: pode:contas:editar)_
10. **Editar conta (lápis)** — Abre o cadastro da conta para mudar nome, perfil, grupo e opções. _(por linha)_ _(só se: pode:contas:editar)_
11. **Inativar / Reativar (olho)** — Inativa a conta sem apagar nada: ela some dos formulários de lançamento. Clique de novo para reativar. _(por linha)_ _(só se: pode:contas:editar)_
12. **Excluir conta (lixeira)** — Apaga a conta de vez. Pede confirmação antes. _(por linha)_ _(só se: pode:contas:excluir)_
13. **Setas ↑ ↓** — Mudam a posição da conta dentro do grupo. _(por linha)_ _(só se: pode:contas:editar)_
14. **Recalcular** — Refaz o saldo da conta a partir dos lançamentos dela. _(por linha)_ _(só se: pode:contas:editar)_
15. **Atualizar Valor** — Em contas de bem, informa quanto o bem vale hoje; o valor antigo vai para o histórico. _(por linha)_ _(só se: pode:contas:editar)_
16. **Definir como favorita** — Marca a conta com estrela e a lista primeiro em Lançamentos. Vale uma favorita por perfil. _(por linha)_ _(só se: pode:contas:editar)_

**Dicas**

- Conta "Sem vínculo" não está ligada a nenhum perfil: só aparece no filtro "Tudo", não entra no Saldo Principal nem nos totais dos perfis e não pode ser Conta central. Edite a conta e escolha um perfil.
- Contas sem grupo ficam na seção "Sem Grupo", no fim da página.
- Cartão de crédito com vencimento mais próximo ganha a borda azul e o aviso "Próxima fatura".

## Extrato da conta `accounts:extrato`

Todos os lançamentos da conta no mês escolhido, com o saldo depois de cada um.

1. **Voltar** — Fecha o extrato e volta para a lista de contas.
2. **Seletor de mês** — Use as setas para ver o mês anterior ou o próximo.
3. **Resumo das faturas** — Em contas gerenciais, mostra quanto entrou e saiu para cada fatura do cartão. _(só se: gerencial)_
4. **Selecionar** — Liga a seleção para marcar vários lançamentos e alterar, conciliar ou excluir de uma vez. _(só se: pode:lancamentos:editar)_
5. **Reconciliar** — Abre a lista do período para marcar como conferido o que bate com o banco. Só no computador. _(só se: pode:lancamentos:editar)_
6. **Conciliar Gerenciais** — Marca como conferidos, de uma vez, os lançamentos pendentes do período que envolvem uma conta gerencial. _(só se: pode:lancamentos:editar)_
7. **Excel** — Baixa o extrato do mês, com os filtros aplicados, em planilha. Aparece em contas gerenciais. _(só se: gerencial)_
8. **Novo Lançamento** — Registra uma receita, despesa ou transferência já nesta conta. _(só se: pode:lancamentos:incluir)_
9. **Saldos do mês** — Saldo Atual, Saldo Futuro (quando há lançamentos com data à frente), Entradas e Saídas do mês.
10. **Filtros** — Digite data, histórico, favorecido ou conta para encontrar lançamentos; Entrada e Saída filtram por valor.
11. **Todos / Conciliados / Pendentes** — Mostra todos os lançamentos, só os já conferidos ou só os que faltam conferir.
12. **Limpar filtros (X)** — Apaga tudo o que foi digitado nos filtros.
13. **Ações da linha** — Ao passar o mouse na linha: editar, duplicar, estornar ou excluir o lançamento. _(por linha)_
14. **Coluna R** — Clique no círculo para marcar o lançamento como conferido com o banco (ou desmarcar).
15. **Barra de seleção** — No modo Selecionar: Alterar Selecionados, Conciliar, Desconciliar ou Excluir os lançamentos marcados.

**Dicas**

- Clique numa linha para editar o lançamento.
- Selos "Futuro", "Gerencial" ou "Reserva" indicam lançamento já feito com data à frente: ele já conta no Saldo Futuro.

## Cartão de Crédito `credit`

Acompanhe cada fatura do cartão: as compras, as parcelas, o total e o pagamento.

1. **Seleção do cartão** — Escolha o cartão que quer ver.
2. **Editar cartão (lápis)** — Abre o cadastro do cartão: limite, dia de fechamento, vencimento e conta pagadora. _(só se: pode:contas:editar)_
3. **Mês da fatura** — Use as setas para ir para a fatura anterior ou a próxima.
4. **Extrato** — Abre o extrato gerencial do cartão, com os grupos e o saldo corrido. Só no computador. _(só se: gerencial)_
5. **Relatório** — Abre o relatório da fatura, pronto para conferir ou exportar.
6. **Fatura Selecionada** — O total da fatura e quantos lançamentos ela tem, somando os agendamentos previstos quando houver.
7. **Limite Disponível** — Quanto do limite do cartão ainda está livre.
8. **Dívida Total** — Tudo o que você deve no cartão, com os dias de fechamento e vencimento.
9. **Saldo a Pagar / Valor Pago** — Quanto falta pagar ou quanto já foi pago, e se a fatura está paga, parcialmente paga ou não paga.
10. **Fechar / Abrir Fatura** — Fecha a fatura para ninguém lançar nela sem querer. Abra de novo se precisar ajustar. _(só se: pode:cartao:editar)_
11. **Novo Lançamento** — Registra uma compra ou estorno neste cartão. Fica bloqueado com a fatura fechada. _(só se: pode:cartao:incluir)_
12. **Pagar Fatura** — Registra o pagamento a partir da conta pagadora do cartão. _(só se: pode:cartao:incluir)_
13. **Atualizar** — Recalcula o total da fatura e atualiza a conta a pagar dela. _(só se: pode:cartao:editar)_
14. **Revisar Movimentos Automáticos** — Mostra os ajustes automáticos pendentes da fatura antes de aplicar. _(só se: pode:cartao:editar)_
15. **Selecionar** — Liga a seleção para marcar vários lançamentos e alterar ou conciliar de uma vez. _(só se: pode:cartao:editar)_
16. **Reconciliar** — Abre a lista da fatura para marcar como conferido o que bate com a fatura do banco. Só no computador. _(só se: pode:cartao:editar)_
17. **Ações da linha** — Editar, duplicar ou excluir a compra. _(por linha)_
18. **Coluna R** — Clique no círculo para marcar a compra como conferida (ou desmarcar).
19. **Agendamentos previstos** — Despesas agendadas que ainda vão entrar nesta fatura. Clique para ver a lista.

**Dicas**

- O dia de fechamento do cartão decide em qual fatura cada compra cai — confira no cadastro do cartão.
- Os filtros acima da lista ajudam a achar uma compra por data, descrição, favorecido ou valor.

## Extrato Gerencial `credit:extrato`

Todas as movimentações do cartão num período, com o saldo corrido depois de cada uma.

1. **Cartão** — Escolha o cartão do extrato.
2. **De** — Data inicial do período.
3. **Até** — Data final do período.
4. **Coluna Ger** — O grupo gerencial de cada lançamento. _(só se: gerencial)_
5. **Coluna R** — Clique no círculo para marcar o lançamento como conferido (ou desmarcar).
6. **Saldo** — O saldo depois de cada linha: D quando é devedor, C quando é credor.

**Dicas**

- Use "Voltar ao Cartão", no alto, para voltar à fatura.

## Agendamentos `schedule`

Suas contas a pagar e a receber, com as datas de cada ocorrência.

1. **Lista / Calendário** — Escolhe como ver os agendamentos: em lista ou num calendário do mês.
2. **Exportar Excel** — Gera uma planilha com a lista do jeito que está filtrada na tela.
3. **Executar Gerenciais** — Faz de uma vez as transferências de controle das provisões que estão pendentes. _(só se: gerencial)_
4. **Lançar Provisão** — Reserva um valor previsto para uma despesa que ainda vai acontecer, sem saber o valor exato. _(só se: pode:agendamentos:incluir)_
5. **Novo Agendamento** — Cria uma conta a pagar ou a receber, única, recorrente (todo mês, toda semana…) ou parcelada. _(só se: pode:agendamentos:incluir)_
6. **Abas** — Separa os agendamentos das contas, do cartão de crédito, do controle gerencial e das contas anuais.
7. **A pagar / Provisões / Pagos** — Mostra só o que ainda falta pagar, as provisões ou o que já foi pago.
8. **Período** — Escolhe o intervalo de datas da lista: este mês, próximos 30 dias, tudo…
9. **Filtros** — Abre mais filtros: datas, descrição, favorecido, categoria, tipo de documento e valor.
10. **Conta de reserva** — Na aba Contas Anuais, mostra só os agendamentos de uma conta de reserva.
11. **Todos / Entradas / Saídas / Transferências** — Filtra a lista pelo tipo de movimento.
12. **Selecionar** — Marca vários agendamentos para pagar, pular ou alterar todos de uma vez. _(só se: pode:agendamentos:editar)_
13. **Pagar / Receber** — Na data, confirma que aconteceu: o agendamento vira um lançamento na conta. _(por linha)_ _(só se: pode:agendamentos:editar)_
14. **Efetivar Provisão** — Informa o valor e a data reais de uma provisão quando a conta chega. _(por linha)_ _(só se: pode:agendamentos:editar)_
15. **Pular** — Pula esta ocorrência sem lançar nada e passa para a próxima. _(por linha)_ _(só se: pode:agendamentos:editar)_
16. **Estornar** — Cancela esta ocorrência, sem lançar nada. Pede confirmação. _(por linha)_ _(só se: pode:agendamentos:editar)_
17. **Editar (lápis na linha)** — Muda os dados do agendamento, como valor, data ou categoria. _(por linha)_ _(só se: pode:agendamentos:editar)_
18. **Excluir (lixeira na linha)** — Apaga o agendamento inteiro, com todas as próximas ocorrências. _(por linha)_ _(só se: pode:agendamentos:excluir)_

**Dicas**

- Ao editar um agendamento recorrente, o Finup pergunta se a mudança vale só para uma ocorrência ou para as próximas.

## Lançamentos `transactions`

Tudo o que já entrou ou saiu das suas contas e cartões. Escolha uma conta ou uma fatura para ver os lançamentos.

1. **Novo** — Registra uma receita, despesa ou transferência. Primeiro você escolhe a conta. _(só se: pode:lancamentos:incluir)_
2. **Cartão da conta** — Mostra o saldo atual da conta. Clique para abrir o extrato com os lançamentos dela. _(por linha)_
3. **+ no cartão de crédito** — Registra uma compra direto nesse cartão. _(por linha)_ _(só se: pode:lancamentos:incluir)_
4. **Fatura do cartão** — Cada mês de fatura com o total e a quantidade de compras. Clique para ver as compras dela. _(por linha)_

**Dicas**

- Um lançamento pode ser dividido em várias categorias ("Dividir em categorias").

## Fatura do cartão `transactions:fatura`

As compras de uma fatura do cartão, com o total e o que já foi conferido.

1. **Lançamentos** — Volta para a lista de contas e cartões.
2. **Reconciliar** — Abre a lista das compras ainda não conferidas para marcar várias de uma vez. _(só se: pode:lancamentos:editar)_
3. **Novo** — Registra uma nova compra nesse cartão. _(só se: pode:lancamentos:incluir)_
4. **Fatura e Lançamentos** — O valor total da fatura e quantas compras ela tem.
5. **Filtros** — Encontre compras por data, histórico, favorecido, categoria ou valor. O total da fatura não muda.
6. **Conciliados / Pendentes** — Quanto das compras na tela já foi conferido e quanto ainda falta.
7. **Estornar (seta na linha)** — Registra a devolução de uma compra, sem apagar a original. _(por linha)_ _(só se: pode:lancamentos:incluir)_
8. **Editar (lápis na linha)** — Abre a compra para ver ou mudar os dados. _(por linha)_
9. **Duplicar** — Cria uma cópia da compra numa data que você escolhe. _(por linha)_ _(só se: pode:lancamentos:incluir)_
10. **Excluir (lixeira na linha)** — Apaga a compra. Se ela tiver um resgate ligado, o Finup avisa antes. _(por linha)_ _(só se: pode:lancamentos:excluir)_
11. **R (conferido)** — Marca ou desmarca a compra como conferida com a fatura do banco. _(por linha)_

**Dicas**

- O dia de fechamento do cartão decide em qual fatura cada compra cai.

## Importar Fatura `import`

Traga o arquivo da fatura do cartão (do site do banco) e confira com o que já está lançado no Finup.

1. **Cartão** — Escolha o cartão de crédito da fatura que você vai trazer.
2. **Mês de Referência** — O mês da fatura. Na importação ele é lido do próprio arquivo quando possível; na conciliação, é você quem escolhe.
3. **Carregar arquivo** — Clique, arraste ou cole o arquivo da fatura (Excel, CSV ou OFX). Arquivo de outro banco: diga uma vez em qual coluna está cada informação e o Finup guarda como modelo.
4. **Conciliar Fatura** — Compara o arquivo do banco com a fatura que já está no Finup e mostra o que falta, o que sobra e a diferença. Escolha antes o cartão e o mês.
5. **Confirmar Conciliação** — No modo Conciliar Fatura: grava o que você marcou para importar ou excluir e volta para a tela normal.
6. **Resumo da revisão** — Total do arquivo, o que já está no Finup, o que será importado e quantos itens precisam da sua decisão.
7. **Conferência da fatura** — Explica a diferença entre o total do arquivo e o da fatura no Finup. Abre sozinha quando sobra valor sem explicação.
8. **Revisar lançamentos** — Veja o que é novo, o que já está no Finup e o que precisa da sua decisão.
9. **Gerenciar regras de classificação** — Abre as regras que preenchem categoria e grupo sozinhos a partir da descrição da compra.
10. **Classificar Auto** — Preenche categoria e grupo das linhas usando as suas regras e o que você já classificou antes.
11. **Preencher em Lote** — Aplica a mesma categoria e o mesmo grupo a várias linhas de uma vez.
12. **Cat → Ger** — Troca o grupo gerencial de todas as linhas de uma mesma categoria de uma só vez.
13. **Cancelar** — Descarta o arquivo carregado sem gravar nada.
14. **Confirmar** — Grava só as linhas novas e marca as já existentes como conferidas.
15. **Histórico de Importações** — As importações já feitas. Clique numa delas para editar ou use "Estornar" para desfazer.

**Dicas**

- Os números do resumo, das abas e do botão Confirmar sempre batem entre si.
- Itens que precisam de decisão ficam de fora até você escolher o que fazer com eles.

## Conciliar Fatura `import:conciliacao`

Compare o arquivo da fatura do banco com a fatura que já está no Finup e decida o que importar, excluir ou manter até a diferença zerar.

1. **Conciliação de Fatura** — Mostra o cartão, o mês e o arquivo que estão sendo comparados.
2. **Sair** — Sai da conciliação sem gravar nada.
3. **Totais e Diferença** — Total do arquivo, total no Finup depois das suas escolhas e a diferença entre eles.
4. **Fatura encerrada** — Marque quando o fechamento já passou: parcelas que faltam vão para a fatura seguinte.
5. **Resumo e Confirmar Conciliação** — Quantos itens já batem, quantos serão importados e excluídos, e o botão para gravar.
6. **Cancelar** — Desiste da conciliação sem gravar nada.
7. **Só no arquivo — falta no Finup** — Compras que estão no arquivo do banco e não foram achadas no Finup.
8. **Importar / Ignorar** — Escolha se a compra entra no Finup ou fica de fora. _(por linha)_
9. **Só no Finup — não está no arquivo** — Lançamentos da fatura no Finup que não aparecem no arquivo do banco.
10. **Manter / Excluir** — Mantenha o lançamento ou marque para excluir ao confirmar. _(por linha)_
11. **Conciliados** — Compras que estão nos dois lados e já batem. Não precisam de ação.
12. **Editar (lápis)** — Abre o lançamento do Finup para corrigir algum dado. _(por linha)_

## Importar lançamentos `importar-lancamentos`

Traga extratos e planilhas (Excel, CSV ou OFX) de qualquer banco para dentro do Finup.

1. **Conta de destino** — A conta que vai receber os lançamentos. Cartão de crédito continua no Importar Fatura.
2. **Gerar Excel para preencher** — Baixa uma planilha modelo desta conta, já com as listas de categorias e favorecidos.
3. **Enviar o arquivo preenchido** — Escolha a planilha preenchida, um CSV com as mesmas colunas ou o extrato OFX do banco.
4. **Prévia** — Antes de gravar, mostra quantas linhas estão certas, com erro, possíveis duplicadas e quantas serão importadas.
5. **Marcar todas** — Marca ou desmarca todas as linhas da prévia. Só as marcadas são importadas.
6. **Importar** — Grava os lançamentos marcados na conta escolhida.
7. **Cancelar** — Descarta o arquivo lido sem gravar nada.
8. **Últimas importações** — A lista das importações feitas. Cada uma pode ser desfeita depois, se algo não sair como esperado.
9. **Recarregar** — Atualiza a lista das últimas importações.
10. **Desfazer importação** — Apaga os lançamentos daquela importação e o saldo da conta volta ao que era. _(por linha)_ _(só se: pode:lancamentos:excluir)_

**Dicas**

- Categorias do arquivo que não existem no Finup podem ser ligadas a uma categoria sua — o Finup lembra nas próximas vezes.
- Linhas marcadas como "possível duplicado" já parecem estar na conta: confira antes de importar.

## Fluxo de Caixa `cashflow`

Mostra como o seu saldo vai ficar nos próximos dias e meses, somando o que já aconteceu com o que está agendado.

1. **Período** — Escolha até quando quer enxergar o futuro.
2. **Filtros e consultas** — No celular, abre as consultas e as opções de envelopes, reservas e provisórios.
3. **Editar consulta atual** — Muda quais contas e opções a consulta aberta usa. _(só se: pode:fluxo:editar)_
4. **Nova consulta** — Cria uma visão do fluxo com as contas que você escolher (por exemplo, só as da empresa). _(só se: pode:fluxo:incluir)_
5. **Consultas** — Troque entre as visões salvas. "FC Principal" usa as contas que somam no Saldo Principal.
6. **Saldo inicial** — O ponto de partida: o saldo de cada conta no seu último dia com movimento.
7. **Projetado e Mínimo** — Quanto o saldo deve estar no fim do prazo e o ponto mais baixo que ele vai atingir no caminho.
8. **Projeção de saldo** — Gráfico do saldo dia a dia no prazo escolhido.
9. **Marcar todos** — Liga ou desliga de uma vez todos os eventos que estão na tela.
10. **Incluir envelopes** — Soma no fluxo o que ainda falta gastar dos envelopes do mês.
11. **Ocultar reservas** — Esconde os depósitos e resgates de reserva da lista.
12. **Provisório** — Adiciona uma entrada ou saída de teste, só para simular, sem gravar como lançamento. _(só se: pode:fluxo:incluir)_
13. **Caixinha da linha** — Desmarque um evento para ver como o saldo fica sem ele.
14. **Confirmado / A confirmar** — Marca se o próximo vencimento de um agendamento já está confirmado. _(só se: pode:agendamentos:editar)_
15. **Mudar data e Efetivar** — Simule outra data para um evento ou transforme um provisório em agendamento ou lançamento de verdade. _(só se: pode:fluxo:editar)_

**Dicas**

- Se o saldo ficar negativo em alguma data, dá tempo de se planejar antes.
- Desmarcar linhas e mudar datas aqui é só simulação: o dinheiro de verdade não muda.

## Reservas `reservas`

O dinheiro separado para objetivos — quanto há em cada reserva e para onde ele foi.

1. **Abas** — Troca entre as contas reserva, o resumo das funções, o fluxo futuro, o razão diário e o histórico.
2. **Aba Resumo** — Abre o Resumo: cada objetivo de reserva, com saldo, entradas e saídas.
3. **Total Reservado / Depósitos / Resgates** — Quanto há guardado nas contas reserva e quanto entrou e saiu no mês.
4. **Saldo das reservas** — Quanto há guardado em cada conta reserva e o que entrou e saiu dela no mês. _(por linha)_
5. **Ver Extrato** — Mostra os depósitos e resgates da conta reserva. _(por linha)_

**Dicas**

- Para uma conta aparecer aqui, ative "É conta de reserva" no cadastro dela.

## Reservas — Fluxo Futuro `reservas:fluxo`

Como o saldo de cada função deve ficar nos próximos 12 meses, contando os depósitos e resgates agendados.

1. **Total investido** — A soma do saldo das funções, com aviso das que vão ficar negativas.
2. **Exportar Excel** — Gera uma planilha com a projeção mês a mês.
3. **Setas dos meses** — No celular, avança ou volta os meses mostrados.
4. **Projeção por mês** — Depósitos, resgates e saldo de cada mês. Clique num valor para ver os agendamentos que o compõem.

**Dicas**

- Mês em vermelho indica que a função ficaria negativa: dá tempo de ajustar antes.

## Reservas — Histórico `reservas:historico`

Os períodos já fechados com "Virar Saldo" e como cada função terminou.

1. **Período fechado** — Escolhe qual virada de saldo você quer ver.
2. **Tabela do período** — Saldo inicial, entradas, saídas, ajuste e saldo final de cada função naquele período.

## Reservas — Razão Diário `reservas:razao`

Um registro por função por dia, para conferir a evolução de cada reserva.

1. **Atualizar** — Busca de novo os registros do razão.
2. **Excel** — Gera uma planilha com as linhas filtradas.
3. **Mês** — Mostra só os registros de um mês.
4. **Funções** — Clique nas funções para ver só elas na tabela e no gráfico.
5. **Gráfico** — A evolução do saldo das funções ao longo dos dias.
6. **Tabela do razão** — Entradas, saídas, ajustes e saldos por dia. Clique no título de uma coluna para ordenar.
7. **Ver período** — Abre no Histórico o período fechado a que a linha pertence. _(por linha)_

**Dicas**

- Divergência diferente de zero indica um lançamento que não entrou em nenhuma função.

## Reservas — Resumo `reservas:resumo`

Cada objetivo (função de reserva) com o saldo, as entradas e saídas e o que ainda vai acontecer.

1. **Total reservado** — A soma do saldo atualizado de todas as funções.
2. **Exportar Excel** — Gera uma planilha com o resumo das funções.
3. **Desfazer Virada** — Desfaz a última virada de saldo feita agora. _(só se: pode:reservas:editar)_
4. **Virar Saldo** — Fecha o período: o saldo de hoje vira o saldo inicial do próximo, e o fechado vai para o Histórico. _(só se: pode:reservas:editar)_
5. **Nova Função** — Cria um objetivo de reserva, com conta, valor anual e mês de vencimento. _(só se: pode:reservas:incluir)_
6. **Saldo Real** — Digite o saldo do banco para ver quanto falta distribuir entre as funções.
7. **Exibir como despesa** — Liga ou desliga se o depósito dessa função conta como despesa nos relatórios. _(por linha)_ _(só se: pode:reservas:editar)_
8. **Entradas / Saídas** — Clique no valor para ver de onde veio cada entrada ou saída. _(por linha)_
9. **Ajuste** — Mostra o histórico de ajustes da função; o "+" grava um ajuste novo. _(por linha)_
10. **Distribuir** — Reparte a diferença entre o saldo do banco e as funções. Não move dinheiro entre contas. _(só se: pode:reservas:editar)_
11. **Mov. Futuros** — Os depósitos e resgates já agendados para essa função. _(por linha)_
12. **Editar (lápis)** — Muda os dados da função. _(por linha)_ _(só se: pode:reservas:editar)_
13. **Excluir (lixeira)** — Apaga a função de reserva. _(por linha)_ _(só se: pode:reservas:excluir)_

**Dicas**

- Arraste uma função para mudar a ordem dentro da mesma conta.

## Envelopes `envelopes`

Limites de gasto por assunto no mês (mercado, lazer…) e quanto já foi usado de cada um.

1. **Novo Envelope** — Cria um envelope com nome, limite mensal e as categorias que entram nele. _(só se: pode:envelopes:incluir)_
2. **Competência** — Use as setas para ver os envelopes de outro mês.
3. **Total limite / Já gasto / Ainda posso gastar** — A soma de todos os envelopes do mês.
4. **Barra do envelope** — A parte cheia é o que já foi gasto; a cor avisa quando está perto do limite ou passou dele. Toque para ver os lançamentos. _(por linha)_
5. **Opções (⋯)** — Edita ou exclui o envelope. _(por linha)_ _(só se: pode:envelopes:editar)_

**Dicas**

- Compras parceladas aparecem separadas das à vista dentro de cada envelope.

## Orçamento `budget`

Defina quanto pretende gastar em cada categoria e compare com o que realmente aconteceu.

1. **Total Orçado / Gasto / Saldo** — Quanto foi planejado no mês, quanto já foi gasto e quanto ainda sobra.
2. **Despesa real / Valor pago** — Escolhe como contar os lançamentos de contratos nos gastos. _(só se: contratos)_
3. **Novo Orçamento** — Define um limite de gasto no mês para uma categoria. _(só se: pode:orcamento:incluir)_
4. **Previsto × realizado** — Para cada categoria, o valor planejado ao lado do valor gasto. A barra muda de cor perto do limite e quando estoura. _(por linha)_
5. **Editar (lápis)** — Muda a categoria ou o valor orçado. _(por linha)_ _(só se: pode:orcamento:editar)_
6. **Excluir (lixeira)** — Remove o orçamento dessa categoria. _(por linha)_ _(só se: pode:orcamento:excluir)_

**Dicas**

- Os gastos seguem o mês financeiro definido em Configurações.

## Patrimônio `patrimonio`

Tudo o que você tem menos o que você deve: contas, investimentos, bens, dívidas e financiamentos.

1. **Bens, Investimentos, Contas, Dívidas e Cartão** — O total de cada parte do patrimônio. Clique em qualquer um para ver de onde vem o valor.
2. **Patrimônio Líquido** — O valor final, somando os bens e descontando as dívidas. Clique para ver a composição.
3. **Evolução do Patrimônio Líquido** — Como o patrimônio mudou nos últimos 6 meses. Fica mais real quando você atualiza o valor dos bens.
4. **Nome do bem** — Clique para ver os detalhes do bem: nota fiscal, financiamento e parcelas. _(por linha)_
5. **Atualizações** — Mostra ou esconde o histórico de valores do bem. _(por linha)_
6. **Detalhar bem (lápis)** — Abre a ficha do bem, onde dá para registrar entrada, financiamento e pagar parcelas. _(por linha)_
7. **Atualizar valor** — Informa quanto o bem vale hoje; o valor antigo fica guardado no histórico. _(por linha)_ _(só se: pode:patrimonio:editar)_
8. **Dívida ou financiamento** — O saldo devedor. Em financiamento, clique para consultar as parcelas. _(por linha)_
9. **Resumo Patrimonial** — A conta completa, linha por linha. Clique numa linha para ver a composição dela.

**Dicas**

- Bens, dívidas e investimentos são contas: cadastre-os na tela Contas, num grupo patrimonial.
- Na ficha do bem, em "Valores do Bem", você escolhe se ele entra no patrimônio pelo valor da nota fiscal ou pelo valor pago.

## Contratos `contratos`

Contratos com cobranças que se repetem (aluguel, prestação de serviço) e o andamento de cada um.

1. **Contratos / Regras de itens do boleto** — Alterna entre a lista de contratos e as regras que dizem quem paga cada item do boleto.
2. **Perfil** — Mostra só os contratos de uma pessoa ou empresa.
3. **Tipo** — Filtra entre contratos a pagar e a receber.
4. **Status** — Filtra pela situação do contrato (ativo, encerrado…).
5. **Novo contrato** — Cadastra um contrato passo a passo: partes, valor, vencimento e reajuste. _(só se: pode:contratos:incluir)_
6. **Ficha do contrato** — Clique num contrato da lista para abrir a ficha: os dados, os itens cobrados e o histórico de pagamentos.

**Dicas**

- A lista vem ordenada pelo próximo vencimento.

## Regras de itens do boleto `contratos:regras`

Diga quem paga cada item do boleto (por exemplo, do condomínio): o inquilino ou o proprietário. Vale para todos os contratos ou só para um.

1. **Regras de** — Escolha se quer ver as regras de todos os contratos (globais) ou as de um contrato só.
2. **+ Regra** — Cria uma regra: o texto do item, como ele é reconhecido e de quem é. _(só se: pode:contratos:editar)_
3. **Lista de regras** — As regras cadastradas. Use o lápis para editar e a lixeira para excluir.
4. **Testar** — Cole o texto do boleto e veja como cada item seria classificado pelas regras.

**Dicas**

- A regra de um contrato vence a global, e "começa com" vence "contém".

## Relatórios `reports`

Relatórios para analisar o dinheiro por período, conta, categoria ou favorecido, com exportação para Excel.

1. **Demonstrativo Financeiro** — Receitas e despesas agrupadas por categoria no período que você escolher.
2. **Relatório por Favorecido** — Quanto você pagou e recebeu de cada pessoa ou empresa.
3. **Fluxo de Caixa por Conta** — Movimentos e saldo acumulado de uma conta, de um grupo ou das contas principais, com o que está agendado.
4. **Relatório de Fatura** — Análise das faturas do cartão de crédito. Só aparece se houver cartão cadastrado.
5. **Médias dos 6 meses** — A média mensal de receitas, despesas e saldo dos últimos 6 meses.
6. **Evolução dos Últimos 6 Meses** — Gráfico com o que entrou e saiu em cada mês.
7. **Despesas por Categoria** — Pizza com as categorias em que mais se gastou no mês escolhido.
8. **Despesa real / Valor pago** — Para contratos: mostra o gasto real (sem os créditos do proprietário) ou o valor que saiu da conta. _(só se: contratos)_
9. **Mês** — Escolha o mês da pizza e do ranking.
10. **Ranking de Despesas** — As 10 categorias com mais gasto no mês, com a porcentagem de cada uma.

**Dicas**

- Cada relatório tem botão para exportar a planilha, pronta para imprimir ou enviar.

## Demonstrativo Financeiro `reports:demonstrativo`

Receitas e despesas do período, agrupadas por categoria e subcategoria, com exportação para planilha.

1. **Voltar aos Relatórios** — Volta para a lista de relatórios.
2. **Incluir transferências entre perfis** — Conta como receita ou despesa o dinheiro passado entre pessoas ou empresas suas.
3. **Ocultar movimentos de reserva** — Tira do relatório os depósitos e resgates de reserva.
4. **Ocultar movimentos de patrimônio** — Tira do relatório compras e vendas de bens e investimentos.
5. **Exibir lançamentos** — Mostra cada lançamento embaixo da sua categoria, não só os totais.
6. **Período** — Atalhos para escolher rapidamente os últimos meses.
7. **Data Inicial e Data Final** — Ou escolha as datas exatas do relatório.
8. **Categorias** — Escolha quais categorias entram no relatório.
9. **Contas** — Escolha quais contas entram no relatório.
10. **Atualizar** — Monta o relatório com os filtros escolhidos. O botão fica destacado quando há filtro novo para aplicar.
11. **Exportar CSV** — Baixa o relatório num arquivo simples, que abre em qualquer planilha.
12. **Exportar Excel** — Gera a planilha formatada, pronta para imprimir ou enviar.
13. **Relatório** — Receitas e despesas por grupo e categoria, com o total de cada uma.

**Dicas**

- Depois de mudar um filtro, clique em Atualizar para o relatório refletir a mudança.

## Relatório por Favorecido `reports:favorecido`

Quanto você pagou e recebeu de cada pessoa ou empresa no período, com os lançamentos de cada uma.

1. **Voltar aos Relatórios** — Volta para a lista de relatórios.
2. **Período** — Atalhos para escolher rapidamente os últimos meses.
3. **Data Inicial e Data Final** — Ou escolha as datas exatas do relatório.
4. **Contas** — Escolha quais contas entram no relatório.
5. **Atualizar** — Monta o relatório com os filtros escolhidos.
6. **CSV Sintético** — Baixa só os totais de cada favorecido.
7. **CSV Analítico** — Baixa os totais e também cada lançamento.
8. **Excel** — Gera a planilha formatada, pronta para imprimir ou enviar.
9. **Buscar favorecido** — Filtra a lista pelo nome.
10. **Tabela de favorecidos** — Total pago, recebido e saldo de cada um. Clique numa linha para ver os lançamentos.

## Fluxo de Caixa por Conta `reports:fluxo-conta`

Os movimentos e o saldo acumulado de uma conta, de um grupo ou das contas principais, incluindo o que está agendado.

1. **Voltar aos Relatórios** — Volta para a lista de relatórios.
2. **Por Conta / Por Grupo / Contas Principais** — Escolha se quer ver contas avulsas, um grupo de contas ou as que somam no Saldo Principal.
3. **Provisório** — Adiciona uma entrada ou saída de teste, só para simular. _(só se: pode:fluxo:incluir)_
4. **Contas / Grupo de Contas** — Escolha as contas ou o grupo que entram no relatório.
5. **Data inicial e Data final** — O período do relatório.
6. **Incluir agendamentos** — Soma também o que ainda vai acontecer, não só o que já foi lançado.
7. **Ocultar movimentos de reserva** — Tira da lista os depósitos e resgates de reserva.
8. **Ocultar movimentos de patrimônio** — Tira da lista compras e vendas de bens e investimentos.
9. **Entradas, Saídas e Saldo Projetado** — Os totais do período e onde o saldo deve terminar.
10. **Exportar Excel** — Gera a planilha das movimentações.
11. **Caixinha da linha** — Desmarque uma linha para ver o saldo sem ela.
12. **Data (clicável)** — Clique na data de um agendamento para simular outro dia.

**Dicas**

- O saldo parte do dia anterior à data inicial e vai somando cada movimento do período.

## Alertas `alerts`

O que vence hoje e nos próximos dias, e os avisos que precisam da sua atenção.

1. **Vencimentos / Integridade** — Troque entre os vencimentos e a conferência automática dos dados.
2. **Ativar Notificações** — Deixa o navegador avisar quando uma conta vence hoje.
3. **Conferir em Agendamentos** — Uma ocorrência não foi registrada sozinha porque já existe um lançamento parecido; confira e decida em Agendamentos. _(só se: pagina:schedule)_
4. **Alertas de vencimento** — Contas a pagar e faturas perto do vencimento.
5. **Dispensar** — Tira o alerta da lista quando você já cuidou dele. _(por linha)_
6. **Calendário de Vencimentos — Cartões** — O próximo vencimento de cada cartão, quantos dias faltam e o valor da fatura.

**Dicas**

- O aviso de vencimento usa os dias de antecedência definidos em cada agendamento ("Lembrar com Antecedência").

## Integridade `alerts:integridade`

Confere faturas, parcelas e subcontas com as regras do Finup e lista o que não bate. Ela só aponta — nada é corrigido sem você mandar.

1. **Varrer agora** — Faz uma nova conferência de todos os dados. _(só se: pode:alertas:editar)_
2. **Pendentes / Ignoradas / Resolvidas** — Escolha quais pendências quer ver.
3. **Corrigir todas** — Aplica de uma vez as correções que o Finup sabe fazer sozinho e confere de novo. _(só se: pode:alertas:editar)_
4. **Corrigir** — Mostra a correção proposta para a pendência antes de aplicar. _(por linha)_ _(só se: pode:alertas:editar)_
5. **Abrir lançamento / Ir para a fatura** — Abre o lançamento ou a fatura envolvidos para você conferir. _(por linha)_
6. **Ignorar / Reabrir** — Tira da lista uma pendência que você sabe que está certa, ou traz de volta uma ignorada. _(por linha)_ _(só se: pode:alertas:editar)_

**Dicas**

- Faturas já fechadas não são avaliadas.

## Assistente `assistente`

Conte o que aconteceu do seu jeito — escrevendo, falando ou mandando uma foto, print ou PDF — e o Assistente prepara o lançamento, o agendamento ou a consulta. Nada é salvo sem você conferir.

1. **Campo de texto** — Escreva o que quer lançar ou consultar, com as suas palavras. Também dá para colar um print aqui.
2. **Microfone** — Fale em vez de digitar. Ele para sozinho quando você fica em silêncio, ou toque de novo para parar.
3. **Câmera** — Tira a foto de um cupom, nota, boleto ou comprovante.
4. **Anexar** — Escolhe uma imagem ou um PDF já salvo: print, comprovante de Pix, boleto, fatura, nota fiscal ou extrato (PDF até 3 MB).
5. **Enviar** — Manda o pedido. A resposta vem como uma prévia para você conferir, mudar o que quiser e só então salvar.

**Dicas**

- Fatura ou extrato em PDF com vários lançamentos vira uma lista para confirmar um por um.
- O Assistente nunca exclui nada. Para excluir, ele mostra onde fazer isso.

## Clientes Finup `clientes`

Tela do administrador da plataforma: pedidos de novos clientes, cadastro, aprovação e acompanhamento de cada cliente.

1. **Clientes / Consumo de IA** — Alterna entre a lista de clientes e o consumo do Assistente por cliente.
2. **Filtro por situação** — Mostra os clientes de uma situação (pedido, ativo, suspenso…), com a quantidade em cada uma.
3. **Recarregar** — Atualiza a lista de clientes.
4. **Novo cliente** — Cadastra um cliente à mão, sem esperar o pedido pelo site.
5. **Lista de clientes** — Clique num cliente para ver os dados e as ações: aprovar, reenviar convite, mensagem de boas-vindas, editar ou excluir. O ícone de gráfico abre a Análise do Cliente.

**Dicas**

- Para excluir um cliente, cancele-o antes.

## Consumo de IA `clientes:consumo`

Quanto cada cliente usou o Assistente no período e o custo estimado, com a tabela de preços usada no cálculo.

1. **Período** — Este mês, o mês anterior ou um intervalo de datas à sua escolha.
2. **Cliente** — Mostra todos os clientes juntos ou só um.
3. **Recarregar** — Lê de novo o consumo de cada cliente.
4. **Totais** — Chamadas, tokens, imagens, custo estimado em dólar e em reais e tempo médio de resposta.
5. **Preços** — O preço de cada modelo por milhão de tokens, com a data em que passou a valer. Sem preço, o custo fica parcial.

**Dicas**

- É uma estimativa pelos tokens registrados: o valor cobrado de verdade está no Console da Anthropic.

## Configurações `settings`

Ajustes do Finup: perfis, categorias, grupos de contas, período financeiro, regras e dados. Escolha a aba no alto e, quando houver, a seção no menu ao lado.

1. **Você está em** — Mostra a aba e a seção abertas agora.
2. **Geral** — Período financeiro, identidade do ambiente, estornos e IOF de cartão, perfis e agenda no celular.
3. **Cadastros** — Categorias, centros de custo, grupos de contas, controle gerencial, favorecidos, tipos de documento, apelidos e atalhos.
4. **Regras** — Regras que preenchem categoria e grupo gerencial sozinhas pela descrição do lançamento.
5. **Dados** — Backup, manutenção e os dados guardados neste aparelho.
6. **Usuários** — Quem pode entrar no sistema e o que cada pessoa pode fazer. _(só se: pode:usuarios:ver)_
7. **Zona de perigo** — Ações que apagam dados e não têm volta.
8. **Seções** — O menu da aba: clique numa seção para abrir os ajustes dela.

**Dicas**

- Cada seção tem o próprio guia: abra a seção e toque no "?" para ver os botões dela.
- Se aparecer "Somente leitura", o seu nível de acesso permite ver, mas não gravar, aquela seção.

## Agenda no celular `settings:agenda-celular`

Mostra os agendamentos pendentes e as faturas em aberto na agenda do iPhone ou no Google Agenda.

1. **Mostrar na agenda** — Escolha se a agenda mostra despesas, receitas ou as duas.
2. **Mostrar valores** — Com "Não", cada compromisso aparece só com o nome, sem o valor.
3. **Criar minha agenda** — Gera o seu link de agenda pela primeira vez.
4. **Adicionar ao iPhone** — Abre a agenda do iPhone para assinar o calendário.
5. **Adicionar ao Google Agenda** — Abre o Google Agenda para assinar o calendário.
6. **Copiar link** — Copia o link para colar em outro aplicativo de agenda.
7. **Gerar novo link** — Troca o link; as assinaturas antigas param de atualizar.

**Dicas**

- Quais agendamentos entram você escolhe em cada agendamento ou em lote na lista de Agendamentos.
- A agenda é só para consulta: pagar e editar continuam no Finup.

## Apelidos da IA `settings:apelidos-ia`

Termos que o Assistente aprendeu quando você corrigiu uma sugestão dele; passam a valer nas próximas vezes.

1. **Recarregar** — Busca a lista de novo.
2. **Termo** — A palavra que você usa; edite e saia do campo para gravar.
3. **Vai para** — A categoria, conta ou favorecido para onde o termo leva.
4. **Excluir (lixeira)** — Remove o apelido. _(só se: pode:cadastros:excluir)_

**Dicas**

- Apelido que aponta para um cadastro apagado ou renomeado aparece marcado e é ignorado.

## Atalhos `settings:atalhos`

As combinações de teclas de cada ação. Valem só no computador.

1. **Restaurar todos os padrões** — Volta todos os atalhos personalizados para o padrão.
2. **Gravar atalho** — Clique e aperte a nova combinação (com Alt ou Ctrl); Esc cancela.
3. **Desativar** — Deixa a ação sem atalho.
4. **Restaurar padrão** — Volta o atalho dessa ação para o padrão.
5. **Fixos** — Atalhos que não podem ser mudados.

**Dicas**

- Aperte Shift+? em qualquer tela para ver os atalhos dela.

## Backup `settings:backup`

Baixe uma cópia de todos os dados do app ou restaure uma cópia anterior.

1. **Contas, lançamentos, agendamentos** — Quanto existe hoje, para conferir antes de exportar ou restaurar.
2. **Exportar backup completo** — Baixa um arquivo com todos os dados.
3. **Importar backup** — Substitui todos os dados atuais pelos do arquivo escolhido.

**Dicas**

- Restaurar um backup não tem volta: exporte um backup atual antes.

## Categorias `settings:categorias`

As categorias de receita e despesa, organizadas em grupos, e a ordem em que aparecem nos seletores.

1. **Padrão** — Volta grupos e categorias para a ordem padrão.
2. **+ Grupo** — Cria um grupo de categorias.
3. **Mostrar categorias de** — Mostra só as categorias de um perfil.
4. **Renomear / excluir grupo** — Muda o nome do grupo; um grupo só pode ser excluído quando está vazio.
5. **Arrastar ⠿ e setas** — Arraste ou use as setas para mudar a ordem de grupos e categorias.
6. **Grupo da categoria** — Passa a categoria para outro grupo, sem mexer nos lançamentos.
7. **Grupo gerencial padrão** — O grupo gerencial que já vem escolhido ao lançar nesta categoria. _(só se: gerencial)_
8. **Conta de investimento** — Despesas de cartão nesta categoria geram um aporte automático nessa conta.
9. **Espelho** — Ligado, cada lançamento nesta categoria cria uma cópia na conta vinculada (por exemplo, empréstimos).
10. **Excluir (lixeira)** — Remove a categoria.
11. **Adicionar categoria** — Cria uma categoria com nome, grupo, tipo, emoji e perfis.

**Dicas**

- Para reordenar, deixe o filtro em "Todos os perfis".
- O grupo é obrigatório: escolha um existente ou digite um nome novo para criá-lo junto.

## Centros de custo `settings:centros-custo`

Rótulos livres para separar lançamentos por finalidade.

1. **Centros cadastrados** — Os centros de custo que você já criou.
2. **Adicionar** — Digite o nome e adicione um novo centro de custo.

## Regras de classificação `settings:classificacao`

Categoria e favorecido aplicados automaticamente quando a descrição do lançamento contém um texto.

1. **Excluir (lixeira)** — Remove a regra.
2. **Adicionar** — Digite o texto que a descrição deve conter e escolha a categoria.

**Dicas**

- As regras também são criadas sozinhas quando você classifica lançamentos importados.

## Controle gerencial `settings:controle-gerencial`

Liga ou desliga o controle gerencial do ambiente e cadastra os grupos usados para separar os gastos do cartão.

1. **Usar controle gerencial** — Liga ou desliga o controle gerencial para o ambiente todo; o histórico fica guardado.
2. **+ Grupo** — Cria um novo grupo gerencial, com nome, apelido e conta de resgate. _(só se: gerencial)_
3. **Editar (lápis)** — Altera o nome, o apelido ou a conta de resgate do grupo. _(só se: gerencial)_
4. **Excluir (lixeira)** — Remove o grupo. Os grupos marcados como fixos não podem ser removidos. _(só se: gerencial)_

**Dicas**

- Para desligar, as subcontas gerenciais precisam estar com saldo zero e sem agendamentos pendentes; o Finup mostra o que falta.
- Esta seção só aparece no computador.

## Dados deste aparelho `settings:dados-aparelho`

Apaga os dados guardados neste navegador ou celular e encerra a sessão. Os dados na nuvem não são afetados.

1. **Sair e apagar dados deste aparelho** — Use em computador compartilhado, ao terminar.

**Dicas**

- Se houver alterações ainda não enviadas, envie antes de apagar.

## De-para de importação `settings:depara-importacao`

Quando um arquivo importado traz uma categoria que não existe no Finup, ela vira a categoria escolhida aqui.

1. **Recarregar** — Busca a lista de novo.
2. **Adicionar** — Digite o texto como vem no arquivo e escolha a categoria do Finup. _(só se: pode:lancamentos:incluir)_
3. **Categoria do Finup** — Troca a categoria de um de-para já salvo.
4. **Excluir (lixeira)** — Remove o de-para. _(só se: pode:lancamentos:incluir)_

**Dicas**

- Os de-paras também são criados na prévia da importação, ao escolher a categoria correspondente.

## Estorno e IOF de cartão `settings:estornos`

Como tratar estornos que aparecem na fatura do cartão e qual alíquota de IOF usar em compras internacionais.

1. **Aplicar categoria padrão para estornos** — Ligado, os estornos da fatura já entram com a categoria escolhida.
2. **Categoria** — A categoria usada nos estornos de cartão.
3. **Alíquota do IOF (%)** — O percentual de IOF usado para estimar compras em moeda estrangeira.

**Dicas**

- Na importação da fatura, a compra e o IOF recebem o valor real cobrado.

## Favorecidos `settings:favorecidos`

O cadastro de favorecidos: inclua os nomes que já estão em uso, renomeie e junte nomes repetidos.

1. **Sincronizar com lançamentos** — Inclui no cadastro os nomes usados em lançamentos, agendamentos e regras que ainda não estão nele.
2. **Buscar favorecido** — Filtra a lista pelo nome.
3. **Marcar** — Marque dois ou mais nomes para juntá-los em um só.
4. **Mesclar** — Escolha o nome final e veja a prévia antes de aplicar.
5. **Renomear** — Troca o nome em todos os lançamentos, agendamentos e regras.

**Dicas**

- Marque "Usar esse nome nas próximas importações" para que o nome novo seja aplicado sozinho.

## Regras de grupo gerencial `settings:grupo-gerencial`

Escolhem o grupo gerencial na importação da fatura pela descrição, parcelamento e valor. Vale a primeira que bater.

1. **Setas** — Mudam a ordem em que as regras são testadas. _(só se: gerencial)_
2. **Excluir (lixeira)** — Remove a regra. _(só se: gerencial)_
3. **Nova regra** — Palavra-chave, parcelado ou à vista, valor mínimo e máximo e o grupo gerencial. _(só se: gerencial)_

**Dicas**

- Esta seção só aparece no computador.

## Grupos de contas `settings:grupos-contas`

Agrupam as contas (por exemplo, por banco) e definem a ordem em que aparecem nos seletores.

1. **Padrão** — Volta os grupos para a ordem padrão.
2. **Arrastar ⠿ e setas** — Arraste ou use as setas para mudar a ordem dos grupos.
3. **Inibir / Reativar (olho)** — Esconde o grupo do app sem apagá-lo; o olho reativa.
4. **Editar (lápis)** — Muda o nome e a conta âncora, usada no ajuste de saldo do grupo.
5. **Excluir (lixeira)** — Remove o grupo; as contas dele ficam sem grupo.
6. **Novo grupo** — Escolha Financeiro ou Patrimonial, digite o nome e clique em +.

## Guias das telas `settings:guias`

Escolha se o guia de cada tela deve aparecer sozinho quando você entra nela. O botão "?" ao lado do título continua abrindo o guia quando quiser.

1. **Guias do sistema** — Liga ou desliga todos os guias de uma vez. Desligados, nenhum tour abre sozinho e o "?" some.
2. **Reativar todos os guias** — Volta a mostrar o guia de todas as telas, inclusive as que você marcou "Não mostrar mais".
3. **Desativar todos os guias** — Para de abrir o guia sozinho em todas as telas, de uma vez.
4. **Lista de telas** — Mostra se o tour de cada tela abre sozinho e deixa mudar uma por uma.

**Dicas**

- Vale para você, em qualquer aparelho. Os outros usuários escolhem por conta própria.

## Identidade do ambiente `settings:identidade`

O nome e a frase que aparecem no rodapé da barra lateral e no cabeçalho dos relatórios em Excel.

1. **Nome do ambiente** — De quem é o sistema. Vazio, os relatórios usam o nome de quem está logado.
2. **Frase do ambiente** — Uma frase opcional para os relatórios. Vazia, a linha não aparece.
3. **Salvar** — Grava o nome e a frase. _(só se: pode:configuracoes:editar)_

## Importação `settings:importacao`

Importação do histórico de lançamentos de outro aplicativo, revisando linha a linha antes de gravar.

1. **Recarregar** — Busca de novo as linhas pendentes.
2. **Conta Corrente / Cartões** — Escolha o tipo do arquivo que vai importar.
3. **Selecionar arquivo** — Envia a planilha (XLS/XLSX) para revisão.
4. **Pendentes, confirmados, ignorados** — Quantas linhas estão em cada situação.
5. **Confirmar importação** — Grava as linhas marcadas como lançamentos.
6. **Ignorar** — Descarta as linhas marcadas.
7. **Limpar pendentes** — Remove todas as pendências, sem mexer no que já foi confirmado.

**Dicas**

- Linhas em amarelo estão sem conta e precisam de revisão.

## Manutenção `settings:manutencao`

Ferramentas para corrigir diferenças nos dados. Nada muda até você confirmar.

1. **Rateio de agendamentos nas baixas** — Encontra lançamentos que pagaram um agendamento dividido e ficaram sem a divisão.
2. **Procurar** — Lista esses lançamentos para você conferir e aplicar a divisão.
3. **Recalcular todos os saldos** — Refaz o saldo de cada conta a partir do saldo inicial e dos lançamentos.
4. **Corrigir Dados Gerenciais** — Arruma as transferências e os agendamentos gerenciais dos parcelados. _(só se: gerencial)_
5. **Recalcular Agendamentos de Faturas** — Refaz os agendamentos de pagamento das faturas de cada cartão.
6. **Ajuste de saldo por grupo** — Escolha o grupo, a data e o saldo real; o Finup calcula a diferença antes de ajustar.
7. **Restaurar saldo anterior** — Desfaz o último ajuste de saldo.

**Dicas**

- O ajuste por grupo precisa de uma conta âncora definida em Cadastros › Grupos de contas.

## Perfis `settings:perfis`

As pessoas e empresas (CPF/CNPJ) donas das contas. Os perfis separam contas, lançamentos e relatórios.

1. **Novo Perfil** — Cadastra uma pessoa ou empresa.
2. **Subir / Descer** — Muda a ordem dos perfis nos seletores e nos botões do topo.
3. **Editar (lápis)** — Altera nome, documento, cor ou tipo do perfil.
4. **Excluir (lixeira)** — Remove o perfil; as contas dele ficam sem perfil.
5. **Perfil principal** — No formulário do perfil: marca o perfil que já vem escolhido ao abrir o Finup.

**Dicas**

- Com perfis cadastrados, aparece um filtro por perfil na barra superior.

## Período financeiro `settings:periodo`

Define quando o seu mês financeiro começa e termina, para agrupar receitas e despesas no Painel e nos relatórios.

1. **Mês corrido / Mês personalizado** — Mês corrido vai do dia 1 ao fim do mês; personalizado começa no dia que você escolher.
2. **Dia de início do mês financeiro** — O dia em que o seu mês financeiro começa (por exemplo, o dia do salário).
3. **Salvar** — Grava o modo e o dia de início.

**Dicas**

- No mês personalizado, o período leva o nome do mês em que começa.

## Tipos de documento `settings:tipos-documento`

Tipos que classificam agendamentos e lançamentos (boleto, fatura, recibo…) e aparecem na coluna "Doc.".

1. **Novo tipo** — Cadastra um tipo com nome, sigla, natureza e cor.
2. **Arrastar ⠿ e setas** — Muda a ordem dos tipos nos formulários.
3. **Ativo / Inativo** — Inativo some dos formulários, mas continua nos registros antigos.
4. **Editar (lápis)** — Altera nome, sigla, natureza ou cor.
5. **Excluir (lixeira)** — Remove o tipo; se ele estiver em uso, só é inativado.

**Dicas**

- O tipo do sistema (com cadeado) não pode ser excluído.

## Usuários `settings:usuarios`

Quem pode entrar no sistema, com o nível de acesso, os perfis permitidos e a situação de cada pessoa.

1. **Recarregar** — Busca a lista de novo. _(só se: pode:usuarios:ver)_
2. **Novo usuário** — Cadastra uma pessoa com nome, usuário, e-mail, senha, nível e perfis. _(só se: pode:usuarios:ver)_
3. **Enviar link de senha (e-mail)** — Manda por e-mail um link para a pessoa criar a própria senha. _(só se: pode:usuarios:ver)_
4. **Redefinir senha (chave)** — Define uma senha nova para a pessoa, sem pedir a atual. _(só se: pode:usuarios:ver)_
5. **Editar (lápis)** — Muda nome, e-mail, nível de acesso e perfis permitidos. _(só se: pode:usuarios:ver)_
6. **Ativar / Desativar** — Desativado, a pessoa não consegue entrar. _(só se: pode:usuarios:ver)_
7. **Desbloquear** — Aparece após senhas erradas: libera o acesso antes dos 15 minutos. _(só se: pode:usuarios:ver)_

**Dicas**

- Mudanças de nível valem a partir do próximo login da pessoa.
- Você não pode desativar o próprio usuário.

## Zona de perigo `settings:zona-perigo`

Apaga todos os dados do aplicativo. Esta ação não tem volta.

1. **Apagar Todos os Dados** — Apaga contas, lançamentos e agendamentos depois de pedir confirmação.

**Dicas**

- Antes de apagar, exporte um backup em Dados › Backup.
