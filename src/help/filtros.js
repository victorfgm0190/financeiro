// Help de campo — busca e filtros (Etapa 3, bloco 5b): Agendamentos, Lançamentos/extrato (inclusive
// os filtros de coluna), seletor de cartão, busca global, busca da Central de Ajuda, filtros dos
// relatórios, opções do Fluxo de Caixa Futuro, período de Reservas e do Razão, lista de Contratos,
// Patrimônio ("Mostrar vendidos" e simulação de saída). Texto curto: filtro não grava nada.
// Nada específico de um cliente.

const f = (titulo, paraQueServe, relacaoComTela) => ({ titulo, paraQueServe, relacaoComTela, obrigatorio: false })

export const campos = {
  // ── Agendamentos ──
  'filtroAgenda.periodo': f('Período', 'Janela de datas dos agendamentos listados.', 'Muda a lista e os totais da aba; "Personalizado" usa as datas dos filtros.'),
  'filtroAgenda.cartao': f('Cartão', 'Mostra só os agendamentos de um cartão.', 'Vazio, mostra todos os cartões.'),
  'filtroAgenda.dataDe': f('Data de', 'Primeira data da lista.', 'Junto com "Data até", substitui o período escolhido.'),
  'filtroAgenda.dataAte': f('Data até', 'Última data da lista.', 'Junto com "Data de", substitui o período escolhido.'),
  'filtroAgenda.descricao': f('Descrição', 'Procura um trecho na descrição.', 'A lista mostra só os agendamentos que contêm o texto.'),
  'filtroAgenda.favorecido': f('Favorecido', 'Procura um trecho no nome do favorecido.', 'A lista mostra só os agendamentos desse favorecido.'),
  'filtroAgenda.categoria': f('Categoria', 'Mostra só uma categoria.', 'Vazio, mostra todas.'),
  'filtroAgenda.tipoDocumento': f('Tipo de documento', 'Mostra só os tipos marcados (boleto, Pix…).', 'Nada marcado, mostra todos.'),
  'filtroAgenda.agendaCelular': f('Agenda do celular', 'Separa os que vão ou não para a agenda do celular.', 'Só filtra a lista; a sincronização se muda no agendamento.'),
  'filtroAgenda.valor': f('Valor (mín./máx.)', 'Faixa de valor dos agendamentos.', 'Pode usar só o mínimo ou só o máximo.'),
  'filtroAgenda.valorLista': f('Valores exatos', 'Escolhe valores exatos da lista.', 'Combina com a faixa de valor ao lado.'),

  // ── Lançamentos e extrato (barra e filtros de coluna) ──
  'filtroLanc.data': f('Data', 'Procura a data digitada, inteira ou só dia e mês.', 'A lista e os totais mostram só o que bate.'),
  'filtroLanc.historico': f('Histórico', 'Procura um trecho na descrição.', 'A lista mostra só os lançamentos que contêm o texto.'),
  'filtroLanc.favorecido': f('Favorecido', 'Procura um trecho no nome do favorecido.', 'A lista mostra só os lançamentos desse favorecido.'),
  'filtroLanc.de': f('Conta De', 'Procura a conta de onde o dinheiro saiu.', 'Útil para achar transferências de uma conta.'),
  'filtroLanc.para': f('Conta Para', 'Procura a conta para onde o dinheiro foi.', 'Útil para achar transferências para uma conta.'),
  'filtroLanc.categoria': f('Categoria', 'Mostra só uma categoria.', 'Vazio, mostra todas.'),
  'filtroLanc.valorDe': f('Valor de', 'Menor valor da lista.', 'Pode usar sozinho ou com "Até R$".'),
  'filtroLanc.valorAte': f('Valor até', 'Maior valor da lista.', 'Pode usar sozinho ou com "De R$".'),
  'filtroLanc.valor': f('Valor', 'Procura um valor.', 'O modo ao lado diz se é o valor exato ou aproximado.'),
  'filtroLanc.valorModo': f('Exato ou aproximado', 'Exato: o mesmo valor. Aprox.: a mesma parte inteira.', 'Aprox. com 200 acha de 200,00 a 200,99.'),
  'filtroLanc.entrada': f('Entrada', 'Escolhe valores exatos de entrada.', 'Nada marcado, mostra todas as entradas.'),
  'filtroLanc.saida': f('Saída', 'Escolhe valores exatos de saída.', 'Nada marcado, mostra todas as saídas.'),
  'filtroLanc.conciliacao': f('Conciliação', 'Todos, só conciliados ou só pendentes.', 'Ajuda a conferir o extrato com o banco.'),
  'filtroCartao.cartao': f('Cartão', 'Cartão cujas faturas aparecem na tela.', 'Troca a fatura, os totais e a lista de lançamentos.'),

  // ── Busca global e Central de Ajuda ──
  'buscaGlobal.valor': f('Valor', 'Procura lançamentos e agendamentos com este valor.', 'Vazio, a busca usa só os outros campos.'),
  'buscaGlobal.modoValor': f('Exato ou aproximado', 'Exato: o mesmo valor. Aproximado: a mesma parte inteira.', 'Só vale quando há valor digitado.'),
  'buscaGlobal.favorecido': f('Favorecido', 'Procura um trecho no nome do favorecido.', 'Combina com os outros campos preenchidos.'),
  'buscaGlobal.descricao': f('Descrição', 'Procura um trecho na descrição.', 'Combina com os outros campos preenchidos.'),
  'buscaGlobal.dataDe': f('Data de', 'Primeira data da busca.', 'Vazio, não limita o início.'),
  'buscaGlobal.dataAte': f('Data até', 'Última data da busca.', 'Vazio, não limita o fim.'),
  'buscaGlobal.status': f('Situação', 'Todos, só registrados ou só pendentes.', 'Muda os resultados na hora, sem buscar de novo.'),
  'buscaAjuda.busca': f('Busca da ajuda', 'Procura assuntos, telas e tarefas da ajuda.', 'Com duas letras ou mais, a lista de resultados aparece abaixo.'),

  // ── Relatórios ──
  'filtroDemo.entrePerfis': f('Transferências entre perfis', 'Inclui o que passou de um perfil para outro.', 'Desligado, essas transferências ficam fora do resultado.'),
  'filtroDemo.ocultarReserva': f('Ocultar reserva', 'Esconde os movimentos das contas de reserva.', 'O resultado mostra só o dia a dia.'),
  'filtroDemo.ocultarPatrimonio': f('Ocultar patrimônio', 'Esconde os movimentos de bens e dívidas.', 'O resultado mostra só o que não é patrimônio.'),
  'filtroDemo.exibirLancamentos': f('Exibir lançamentos', 'Mostra os lançamentos de cada categoria.', 'Vale depois de "Atualizar".'),
  'filtroDemo.regraValor': f('Regra do valor', 'Bruto: a despesa inteira. Líquido: menos o resgate de reserva.', 'Muda os totais das despesas.'),
  'filtroDemo.periodo': f('Período', 'Atalho que preenche as datas.', 'Clique em "Atualizar" para aplicar.'),
  'filtroDemo.dataDe': f('Data inicial', 'Primeiro dia do relatório.', 'Clique em "Atualizar" para aplicar.'),
  'filtroDemo.dataAte': f('Data final', 'Último dia do relatório.', 'Clique em "Atualizar" para aplicar.'),
  'filtroDemo.categorias': f('Categorias', 'Categorias que entram no relatório.', 'Clique em "Atualizar" para aplicar.'),
  'filtroDemo.contas': f('Contas', 'Contas que entram no relatório.', 'Clique em "Atualizar" para aplicar.'),
  'filtroFluxoConta.visao': f('Visão', 'Por conta, por grupo ou contas principais.', 'Muda o seletor de contas abaixo.'),
  'filtroFluxoConta.contas': f('Contas', 'Contas somadas no fluxo.', 'O saldo parte da soma delas.'),
  'filtroFluxoConta.grupo': f('Grupo de contas', 'Grupo cujas contas são somadas.', 'O saldo parte da soma das contas do grupo.'),
  'filtroFluxoConta.dataDe': f('Data inicial', 'Primeiro dia do fluxo.', 'As linhas da tabela começam nesta data.'),
  'filtroFluxoConta.dataAte': f('Data final', 'Último dia do fluxo.', 'Limita os agendamentos incluídos.'),
  'filtroFluxoConta.agendamentos': f('Incluir agendamentos', 'Soma os agendamentos futuros ao fluxo.', 'Desligado, só os lançamentos já feitos.'),
  'filtroFluxoConta.ocultarReserva': f('Ocultar reserva', 'Esconde os movimentos das contas de reserva.', 'O saldo mostra só o dia a dia.'),
  'filtroFluxoConta.ocultarPatrimonio': f('Ocultar patrimônio', 'Esconde os movimentos de bens e dívidas.', 'O saldo mostra só o que não é patrimônio.'),
  'filtroFluxoConta.linha': f('Linha no cálculo', 'Desmarcado, a linha sai da simulação.', 'Só muda este relatório; nada é gravado.'),
  'filtroFluxoConta.dataLinha': f('Data da linha', 'Muda a data do agendamento só nesta simulação.', 'Para gravar, use "Aplicar data".'),
  'filtroBens.dataDe': f('Data inicial', 'Primeiro dia do relatório.', 'Os meses do relatório começam aqui.'),
  'filtroBens.dataAte': f('Data final', 'Último dia do relatório.', 'Os meses do relatório terminam aqui.'),
  'filtroBens.perfil': f('Perfil', 'Mostra só os bens de um perfil.', 'Troca a lista de bens ao lado.'),
  'filtroBens.bem': f('Bem', 'Mostra só um bem.', 'Vazio, mostra todos os bens do perfil.'),
  'filtroFavorecido.periodo': f('Período', 'Atalho que preenche as datas.', 'Clique em "Atualizar" para aplicar.'),
  'filtroFavorecido.dataDe': f('Data inicial', 'Primeiro dia do relatório.', 'Clique em "Atualizar" para aplicar.'),
  'filtroFavorecido.dataAte': f('Data final', 'Último dia do relatório.', 'Clique em "Atualizar" para aplicar.'),
  'filtroFavorecido.contas': f('Contas', 'Contas que entram no relatório.', 'Clique em "Atualizar" para aplicar.'),
  'filtroFavorecido.busca': f('Buscar favorecido', 'Procura um trecho no nome do favorecido.', 'Filtra a tabela e o Excel exportado.'),
  'filtroRendimentos.contrato': f('Contrato', 'Um contrato a receber ou todos.', 'Muda os meses e a conferência abaixo.'),
  'filtroRendimentos.ano': f('Ano', 'Ano do relatório.', 'Muda os meses e a conferência com o informe.'),
  'filtroRendimentos.referencia': f('Mês de referência', 'Em que mês cada aluguel entra.', 'Pagamento, competência ou repasse mudam os totais por mês.'),
  'filtroFatura.cartao': f('Cartão', 'Cartão do relatório.', 'Troca a lista de faturas ao lado.'),
  'filtroFatura.fatura': f('Fatura', 'Fatura do relatório.', 'A lista mostra os lançamentos dela.'),
  'filtroGerencial.cartao': f('Cartão', 'Cartão do extrato gerencial.', 'A lista mostra os movimentos dele.'),
  'filtroGerencial.dataDe': f('De', 'Primeiro dia do extrato.', 'Limita os movimentos listados.'),
  'filtroGerencial.dataAte': f('Até', 'Último dia do extrato.', 'Limita os movimentos listados.'),
  'filtroRelatorio.mes': f('Mês', 'Mês do gráfico de despesas por categoria.', 'Muda só este gráfico.'),

  // ── Fluxo de Caixa Futuro ──
  'opcoesFluxo.consulta': f('Consulta', 'Troca a consulta mostrada.', 'Muda as contas, as opções e o saldo projetado.'),
  'opcoesFluxo.marcarTodos': f('Marcar todos', 'Põe ou tira do cálculo os eventos visíveis.', 'Só muda a simulação; nada é gravado.'),
  'opcoesFluxo.envelopes': f('Incluir envelopes', 'Inclui os envelopes no saldo projetado.', 'Vale só agora; a consulta salva não muda.'),
  'opcoesFluxo.ocultarReservas': f('Ocultar reservas', 'Esconde os movimentos de reserva.', 'Vale só agora; a consulta salva não muda.'),
  'opcoesFluxo.linha': f('Evento no cálculo', 'Desmarcado, o evento sai do saldo projetado.', 'Só muda a simulação; nada é gravado.'),
  'opcoesFluxo.atraso': f('Pendências em atraso', 'Põe ou tira do cálculo o que venceu e não foi pago.', 'Só muda a simulação; nada é gravado.'),

  // ── Reservas ──
  'periodoFluxo.de': f('De', 'Primeiro mês mostrado no Fluxo Futuro.', 'A projeção parte de hoje; meses antes só ficam escondidos.'),
  'periodoFluxo.ate': f('Até', 'Último mês mostrado no Fluxo Futuro.', 'Há um limite de meses; a tela avisa se passar.'),
  'periodoFluxo.atalhos': f('Atalhos', 'Preenchem o "Até" a partir do "De".', 'Clique em "Aplicar" para valer.'),
  'filtroRazao.mes': f('Mês', 'Mostra só um mês do razão.', 'Vazio, mostra todos os meses.'),
  'filtroRazao.funcoes': f('Funções', 'Mostra só as funções marcadas.', 'Nenhuma marcada, mostra todas.'),

  // ── Contratos e Patrimônio ──
  'filtroContratos.perfil': f('Perfil', 'Mostra só os contratos de um perfil.', 'A lista muda na hora.'),
  'filtroContratos.modalidade': f('Modalidade', 'Mostra só uma modalidade (aluguel, serviço…).', 'A lista muda na hora.'),
  'filtroContratos.tipo': f('Tipo', 'A pagar ou a receber.', 'A lista muda na hora.'),
  'filtroContratos.status': f('Status', 'Mostra só contratos ativos, encerrados etc.', 'A lista muda na hora.'),
  'filtroPatrimonio.mostrarVendidos': f('Mostrar vendidos', 'Mostra também os bens já vendidos.', 'Só muda a lista; os totais não mudam.'),
  'simulacaoSaida.mes': f('Mês da contemplação', 'Meses desde o primeiro pagamento até a saída.', 'O resultado abaixo é calculado para este mês.'),
  'simulacaoSaida.agio': f('Ágio na venda', 'Quanto da carta o comprador paga, em %.', 'Muda o valor recebido e o lucro.'),
  'simulacaoSaida.cdi': f('CDI anual', 'Taxa anual para comparar o resultado.', 'Mostra quanto o mesmo dinheiro renderia no CDI.'),
}

export const formularios = {}
