// Help de campo — PATRIMÔNIO (bens, financiamento, consórcio, vendas e baixas) —
// src/components/Patrimonio/*, Accounts/AccountsPanel.jsx (Atualizar valor).
// Formulários: financiamento, aberturaFinanciamento, consorcio, eventoConsorcio, planoVenda,
// pagarParcela, baixaBem, vendaCota, vendaBem, entradaBem, parametrizarBem,
// favorecidoFinanciamento, receitaBem, atualizarValor, valoresBem. Nada específico de um cliente.

export const campos = {
  // ── Criar Financiamento ────────────────────────────────────────────────────────────────────
  'financiamento.valorPrincipal': {
    titulo: 'Valor a financiar',
    paraQueServe: 'Quanto do bem é pago pelo financiamento (o principal, sem juros).',
    relacaoComTela: 'Vem sugerido como a nota fiscal menos a entrada já paga. É o saldo inicial da conta de dívida criada para o financiamento. Com o número e o valor das parcelas, forma a prévia: os juros totais são o total das parcelas menos este valor.',
    obrigatorio: true,
  },
  'financiamento.numParcelas': {
    titulo: 'Número de parcelas',
    paraQueServe: 'Quantas parcelas o contrato tem no total.',
    relacaoComTela: 'Cria uma parcela por mês a partir da 1ª parcela. Cada parcela vira um agendamento de transferência da conta que paga para a conta de dívida, menos as já pagas antes do Finup. Divide principal e juros na prévia.',
    obrigatorio: true,
  },
  'financiamento.valorParcela': {
    titulo: 'Valor da parcela',
    paraQueServe: 'Valor de cada parcela, como está no contrato ou no boleto.',
    relacaoComTela: 'Parcela × número de parcelas = valor total. Se o total ficar menor que o valor a financiar, a prévia fica vermelha e o botão Criar não libera. Cada agendamento já vem rateado em principal e juros.',
    obrigatorio: true,
  },
  'financiamento.favorecido': {
    titulo: 'Favorecido',
    paraQueServe: 'Quem recebe as parcelas: o banco ou a financeira.',
    relacaoComTela: 'Vira o favorecido de todos os agendamentos das parcelas. Pode ser trocado depois em Editar favorecido, na aba Parcelas do bem. As sugestões são os favorecidos e as contas que podem receber.',
    obrigatorio: true,
  },
  'financiamento.contaFavorecida': {
    titulo: 'Banco favorecido (conta)',
    paraQueServe: 'Liga o financiamento a uma conta cadastrada do banco que recebe.',
    relacaoComTela: 'Opcional. É o vínculo contábil, usado na descrição da conta de dívida. Sem conta, vale só o texto do campo Favorecido.',
    obrigatorio: false,
  },
  'financiamento.primeiraParcela': {
    titulo: '1ª parcela vence em',
    paraQueServe: 'Data de vencimento da primeira parcela do contrato.',
    relacaoComTela: 'As demais vencem nos meses seguintes. É a base das datas de todas as parcelas, inclusive as pagas antes do Finup.',
    obrigatorio: true,
  },
  'financiamento.contaOrigem': {
    titulo: 'Conta que paga as parcelas',
    paraQueServe: 'Conta corrente de onde sai o dinheiro de cada parcela.',
    relacaoComTela: 'Vem preenchida com a conta central do perfil do bem. É a conta de origem dos agendamentos e a sugerida ao pagar uma parcela.',
    obrigatorio: true,
  },
  'financiamento.aberturaParcelas': {
    titulo: 'Parcelas já pagas antes do Finup',
    paraQueServe: 'Quantas parcelas foram pagas antes de você usar o Finup.',
    relacaoComTela: 'Essas primeiras parcelas ficam pagas e somam no bem, sem lançamento em conta e sem entrar no Demonstrativo, e não ganham agendamento. Preencha junto com o valor total pago e a data de referência.',
    obrigatorio: false,
    quandoUsar: 'Financiamento que já estava em andamento quando você começou a usar o Finup.',
  },
  'financiamento.aberturaValor': {
    titulo: 'Valor total pago até então',
    paraQueServe: 'Soma do que foi pago nas parcelas anteriores ao Finup.',
    relacaoComTela: 'Entra no saldo do bem como histórico de abertura. Não mexe em nenhuma conta. Vai junto com a quantidade de parcelas e a data de referência.',
    obrigatorio: false,
  },
  'financiamento.aberturaData': {
    titulo: 'Data de referência',
    paraQueServe: 'Data em que o histórico de abertura passa a valer.',
    relacaoComTela: 'É a data do registro de abertura no extrato do bem. Use a data do último pagamento anterior ao Finup ou a do extrato que você consultou.',
    obrigatorio: false,
  },

  // ── Consórcio ──────────────────────────────────────────────────────────────────────────────
  'consorcio.administradora': {
    titulo: 'Administradora',
    paraQueServe: 'Empresa que administra o grupo do consórcio.',
    relacaoComTela: 'A lista vem do cadastro de Favorecidos. Aparece no cabeçalho da aba Consórcio. Se faltar, cadastre em Configurações › Favorecidos.',
    obrigatorio: false,
  },
  'consorcio.grupo': {
    titulo: 'Grupo',
    paraQueServe: 'Número do grupo no contrato do consórcio.',
    relacaoComTela: 'Só identificação: aparece no cabeçalho da aba Consórcio. Várias cotas do mesmo grupo ficam no mesmo bem.',
    obrigatorio: false,
  },
  'consorcio.dataAdesao': {
    titulo: 'Data de adesão padrão',
    paraQueServe: 'Data de adesão sugerida para as cotas.',
    relacaoComTela: 'Ao mudar, preenche as cotas ainda sem data e as cotas novas. A data que vale é a de cada cota.',
    obrigatorio: false,
  },
  'consorcio.indiceReajuste': {
    titulo: 'Índice de reajuste',
    paraQueServe: 'Índice que o contrato usa para reajustar a parcela.',
    relacaoComTela: 'Só registro: aparece no cabeçalho da aba Consórcio. O reajuste em si é lançado pelo botão Reajuste, com a nova parcela.',
    obrigatorio: false,
  },
  'consorcio.contaOrigem': {
    titulo: 'Conta ou reserva de onde sai o pagamento',
    paraQueServe: 'Conta (ou conta de reserva) que paga as parcelas do consórcio.',
    relacaoComTela: 'Fica registrada nos dados do consórcio. Não cria agendamentos: as parcelas são pagas pelos agendamentos de transferência para o bem.',
    obrigatorio: false,
  },
  'consorcio.cotaNumero': {
    titulo: 'Número da cota',
    paraQueServe: 'Número da cota no contrato da administradora.',
    relacaoComTela: 'Identifica a cota na aba Consórcio, nas baixas ("Cota") e na venda por cota. Cada cota do grupo tem o seu bloco.',
    obrigatorio: true,
  },
  'consorcio.cotaAdesao': {
    titulo: 'Data de adesão da cota',
    paraQueServe: 'Quando esta cota entrou no grupo.',
    relacaoComTela: 'Sem previsão de encerramento, o Finup estima o fim da cota como adesão + prazo.',
    obrigatorio: false,
  },
  'consorcio.cotaCarta': {
    titulo: 'Valor da carta de crédito',
    paraQueServe: 'Crédito contratado nesta cota.',
    relacaoComTela: 'Soma no total de cartas da aba Consórcio. É a referência para a contemplação e o uso da carta.',
    obrigatorio: true,
  },
  'consorcio.cotaPrazo': {
    titulo: 'Prazo (meses)',
    paraQueServe: 'Total de meses do grupo para esta cota.',
    relacaoComTela: 'Com as parcelas pagas, dá as parcelas restantes da cota. Com a adesão, estima o encerramento quando ele não foi informado.',
    obrigatorio: false,
  },
  'consorcio.cotaPercentual': {
    titulo: '% da parcela paga',
    paraQueServe: 'Percentual da parcela cheia que você paga todo mês.',
    relacaoComTela: 'Parcela do mês = parcela cheia × este percentual. Abaixo de 100, a aba Consórcio indica meia parcela.',
    obrigatorio: true,
    exemplo: '50 para meia parcela; 100 para parcela cheia.',
  },
  'consorcio.cotaParcelaCheia': {
    titulo: 'Valor da parcela cheia',
    paraQueServe: 'Parcela a 100%, antes de qualquer redução.',
    relacaoComTela: 'Com o % da parcela, dá a parcela mensal da cota, somada na aba Consórcio e usada na venda por cota para ajustar os agendamentos.',
    obrigatorio: false,
  },
  'consorcio.cotaSaldoDevedor': {
    titulo: 'Saldo devedor informado',
    paraQueServe: 'Saldo devedor da cota como consta no extrato da administradora.',
    relacaoComTela: 'Só para conferência: soma no saldo devedor da aba Consórcio. Não muda o saldo do bem.',
    obrigatorio: false,
  },
  'consorcio.cotaSaldoData': {
    titulo: 'Data da informação do saldo',
    paraQueServe: 'Data do extrato de onde veio o saldo devedor.',
    relacaoComTela: 'Mostra de quando é o saldo informado, para saber se está atualizado.',
    obrigatorio: false,
  },
  'consorcio.cotaParcelasPagas': {
    titulo: 'Parcelas pagas informadas',
    paraQueServe: 'Quantas parcelas a administradora mostra como pagas.',
    relacaoComTela: 'É comparada com as parcelas pagas no Finup: se forem diferentes, a aba Consórcio avisa. Também divide entre as cotas o que foi pago sem cota definida.',
    obrigatorio: false,
  },
  'consorcio.cotaEncerramento': {
    titulo: 'Previsão de encerramento',
    paraQueServe: 'Data prevista de fim da cota, conforme o contrato.',
    relacaoComTela: 'Em branco, o Finup usa a data da última parcela ou estima por adesão + prazo (marcado como estimado).',
    obrigatorio: false,
  },
  'consorcio.cotaUltimaParcela': {
    titulo: 'Data da última parcela',
    paraQueServe: 'Vencimento da última parcela da cota.',
    relacaoComTela: 'Sem previsão de encerramento, é esta data que mostra o fim da cota.',
    obrigatorio: false,
  },
  'consorcio.cotaValorPago': {
    titulo: 'Valores pagos informados',
    paraQueServe: 'Total pago nesta cota, segundo o extrato da administradora.',
    relacaoComTela: 'Só para conferência com o que foi pago no Finup. Não muda o saldo do bem.',
    obrigatorio: false,
  },
  'consorcio.cotaAberturaParcelas': {
    titulo: 'Parcelas já pagas antes do Finup',
    paraQueServe: 'Quantas parcelas desta cota foram pagas antes de usar o Finup.',
    relacaoComTela: 'Viram histórico de abertura: somam no bem, sem lançamento em conta e sem Demonstrativo. Preencha junto com o valor total e a data de referência.',
    obrigatorio: false,
  },
  'consorcio.cotaAberturaValor': {
    titulo: 'Valor total pago até então',
    paraQueServe: 'Soma paga nesta cota antes de usar o Finup.',
    relacaoComTela: 'Entra no saldo do bem como histórico de abertura, sem mexer em conta.',
    obrigatorio: false,
  },
  'consorcio.cotaAberturaData': {
    titulo: 'Data de referência',
    paraQueServe: 'Data do histórico de abertura desta cota.',
    relacaoComTela: 'Data do registro no extrato do bem. Sem adesão, serve de base para estimar o encerramento.',
    obrigatorio: false,
  },
  'consorcio.quitado': {
    titulo: 'Consórcio quitado',
    paraQueServe: 'Marca que todas as parcelas do consórcio já foram pagas.',
    relacaoComTela: 'A situação do consórcio passa a Quitada. Contemplado ou vendido não muda por esta caixa.',
    obrigatorio: false,
  },

  // ── Eventos do consórcio (contemplação, reajuste, venda, uso da carta) ─────────────────────
  'eventoConsorcio.data': {
    titulo: 'Data',
    paraQueServe: 'Quando o evento aconteceu (no reajuste, a partir de quando vale).',
    relacaoComTela: 'No reajuste e na contemplação, os agendamentos do consórcio mudam a partir desta data. Na venda, é a data do lançamento do valor recebido.',
    obrigatorio: true,
  },
  'eventoConsorcio.valor': {
    titulo: 'Valor do evento',
    paraQueServe: 'Na venda, quanto entrou; no uso da carta, o valor do bem comprado; no reajuste e na contemplação, a nova parcela por cota.',
    relacaoComTela: 'Nova parcela: os agendamentos passam a este valor a partir da data. Venda: o ganho é o valor recebido menos o custo próprio líquido, e os agendamentos são encerrados. Uso da carta: o bem passa a valer o valor comprado.',
    obrigatorio: true,
    atencao: 'Se uma reserva abastece esses pagamentos, confira o agendamento dela depois.',
  },
  'eventoConsorcio.conta': {
    titulo: 'Conta que recebeu',
    paraQueServe: 'Conta onde entrou o dinheiro da venda do consórcio.',
    relacaoComTela: 'O valor recebido é lançado nesta conta e sai do bem.',
    obrigatorio: true,
  },

  // ── Plano de venda do consórcio ────────────────────────────────────────────────────────────
  'planoVenda.mes': {
    titulo: 'Mês previsto de venda',
    paraQueServe: 'Mês em que você pretende vender esta cota.',
    relacaoComTela: 'A projeção do quadro e do gráfico para de contar parcelas da cota a partir deste mês. Simulação: não gera lançamento.',
    obrigatorio: false,
  },
  'planoVenda.valor': {
    titulo: 'Valor de venda esperado',
    paraQueServe: 'Quanto você espera receber pela cota.',
    relacaoComTela: 'Entra na projeção como resultado da venda e no saldo da função de reserva escolhida. Não gera lançamento.',
    obrigatorio: false,
  },
  'planoVenda.vendidaAntes': {
    titulo: 'Vendida antes (sem lançamento)',
    paraQueServe: 'Marca uma cota vendida antes de existir a venda por cota no Finup.',
    relacaoComTela: 'A cota sai da projeção e abre os campos Vendida em e Valor recebido. Não gera lançamento. Para vender agora, use Vender cota na aba Consórcio.',
    obrigatorio: false,
  },
  'planoVenda.vendidaEm': {
    titulo: 'Vendida em',
    paraQueServe: 'Data em que a cota foi vendida, antes do Finup registrar vendas.',
    relacaoComTela: 'Só registro no plano: não gera lançamento.',
    obrigatorio: false,
  },
  'planoVenda.vendidaValor': {
    titulo: 'Valor recebido',
    paraQueServe: 'Quanto foi recebido pela cota vendida antes.',
    relacaoComTela: 'Só registro no plano: não gera lançamento nem mexe em conta.',
    obrigatorio: false,
  },
  'planoVenda.funcao': {
    titulo: 'Função de reserva que paga as parcelas',
    paraQueServe: 'Reserva de onde sai o dinheiro das parcelas do consórcio.',
    relacaoComTela: 'Com ela, o gráfico mostra o saldo da função mês a mês até a venda. Sem ela, a projeção mostra só o bem.',
    obrigatorio: false,
  },

  // ── Pagar parcela do financiamento ─────────────────────────────────────────────────────────
  'pagarParcela.valor': {
    titulo: 'Quanto você vai pagar',
    paraQueServe: 'Valor deste pagamento da parcela.',
    relacaoComTela: 'O rateio paga primeiro o principal e depois os juros. Menor que o que falta, a parcela fica parcial; igual, fica quitada. Cria até 2 lançamentos: prestação (principal) e taxa de financiamento (juros).',
    obrigatorio: true,
  },
  'pagarParcela.data': {
    titulo: 'Data do pagamento',
    paraQueServe: 'Quando o dinheiro saiu da conta.',
    relacaoComTela: 'É a data dos lançamentos de principal e juros, e entra no saldo da conta de origem nesta data.',
    obrigatorio: true,
  },
  'pagarParcela.conta': {
    titulo: 'Conta de origem',
    paraQueServe: 'Conta de onde sai o pagamento.',
    relacaoComTela: 'Vem preenchida com a conta do financiamento ou a central do perfil. O saldo dela diminui pelo valor pago.',
    obrigatorio: true,
  },
  'pagarParcela.quitar': {
    titulo: 'Quitar com desconto',
    paraQueServe: 'Encerra a parcela paga antecipadamente, com o principal pago inteiro.',
    relacaoComTela: 'Marcada, a diferença dos juros vira desconto e a parcela fica quitada. Desmarcada, o pagamento é parcial e o resto continua em aberto. Só aparece quando o valor cobre o principal.',
    obrigatorio: false,
  },

  // ── Marcar parcela como paga / crédito (baixa sem movimento em conta) ──────────────────────
  'baixaBem.motivo': {
    titulo: 'Motivo',
    paraQueServe: 'Por que a parcela foi paga sem sair dinheiro de uma conta sua no Finup.',
    relacaoComTela: 'Paga por terceiro: alguém pagou por você e abre Quem pagou. Conta não controlada: você pagou de uma conta fora do Finup. Crédito ou rendimento: a administradora abateu. Em todos, nenhum saldo de conta muda.',
    obrigatorio: true,
  },
  'baixaBem.valor': {
    titulo: 'Valor',
    paraQueServe: 'Quanto foi pago (ou o crédito abatido).',
    relacaoComTela: 'Soma no saldo do bem e no extrato dele. Pode ser diferente do valor da parcela.',
    obrigatorio: true,
  },
  'baixaBem.data': {
    titulo: 'Data',
    paraQueServe: 'Quando a parcela foi paga ou o crédito abatido.',
    relacaoComTela: 'Data do registro no extrato do bem e da receita de benefício, se houver.',
    obrigatorio: true,
  },
  'baixaBem.cota': {
    titulo: 'Cota',
    paraQueServe: 'Cota do consórcio a que este pagamento pertence.',
    relacaoComTela: 'Com cota, a baixa conta só para ela nas parcelas pagas e no custo da cota. Sem cota, é dividida entre as cotas.',
    obrigatorio: false,
  },
  'baixaBem.quemPagou': {
    titulo: 'Quem pagou',
    paraQueServe: 'Favorecido que pagou a parcela por você.',
    relacaoComTela: 'Aparece no extrato do bem. É o favorecido da receita de benefício, se você gerar.',
    obrigatorio: true,
  },
  'baixaBem.gerarReceita': {
    titulo: 'Gerar a receita de benefício',
    paraQueServe: 'Registra no Demonstrativo o valor pago pelo terceiro como receita sua.',
    relacaoComTela: 'Marcada, pede a categoria e lança a receita na conta do próprio bem. Nenhuma conta corrente muda.',
    obrigatorio: false,
  },
  'baixaBem.categoria': {
    titulo: 'Categoria da receita',
    paraQueServe: 'Categoria de receita do benefício pago pelo terceiro.',
    relacaoComTela: 'É onde a receita aparece no Demonstrativo.',
    obrigatorio: true,
  },
  'baixaBem.observacao': {
    titulo: 'Observação',
    paraQueServe: 'Texto que aparece no extrato do bem para esta baixa.',
    relacaoComTela: 'Só descrição. Dá para desfazer a baixa depois, no Resumo do bem.',
    obrigatorio: false,
  },

  // ── Venda de cota do consórcio ─────────────────────────────────────────────────────────────
  'vendaCota.data': {
    titulo: 'Data da venda',
    paraQueServe: 'Quando a cota foi vendida.',
    relacaoComTela: 'Data dos lançamentos da venda. Os agendamentos da cota mudam a partir deste mês, como mostra "O que muda nos agendamentos".',
    obrigatorio: true,
  },
  'vendaCota.valor': {
    titulo: 'Valor recebido',
    paraQueServe: 'Quanto o comprador pagou pela cota.',
    relacaoComTela: 'Entra na conta escolhida. Menos os custos e o custo da cota, dá o ganho ou a perda da prévia.',
    obrigatorio: true,
  },
  'vendaCota.conta': {
    titulo: 'Conta onde o dinheiro entrou',
    paraQueServe: 'Conta que recebeu o valor da venda.',
    relacaoComTela: 'O valor recebido é lançado nela. Se o consórcio tem uma função de reserva vinculada, a prévia mostra que o valor entra nela.',
    obrigatorio: true,
  },
  'vendaCota.comprador': {
    titulo: 'Comprador',
    paraQueServe: 'Quem comprou a cota.',
    relacaoComTela: 'Vira o favorecido do lançamento da venda. Nome novo entra no cadastro de favorecidos.',
    obrigatorio: false,
  },
  'vendaCota.custos': {
    titulo: 'Custos da venda',
    paraQueServe: 'Taxas e comissões pagas para vender a cota.',
    relacaoComTela: 'Reduzem o ganho (ou aumentam a perda). Com valor, pede a categoria dos custos.',
    obrigatorio: false,
  },
  'vendaCota.custosCategoria': {
    titulo: 'Categoria dos custos',
    paraQueServe: 'Categoria de despesa dos custos da venda.',
    relacaoComTela: 'É onde os custos aparecem no Demonstrativo.',
    obrigatorio: true,
  },
  'vendaCota.custoCota': {
    titulo: 'Custo da cota',
    paraQueServe: 'Quanto esta cota custou até a venda.',
    relacaoComTela: 'Vem estimado: pago próprio, por terceiro, abertura e créditos atribuídos à cota. É abatido do bem e entra no ganho ou na perda. Não passa do saldo do bem. Na última cota, o custo é o saldo restante do bem.',
    obrigatorio: false,
  },
  'vendaCota.observacao': {
    titulo: 'Observação',
    paraQueServe: 'Anotação sobre a venda da cota.',
    relacaoComTela: 'Fica no registro da venda, no histórico do consórcio.',
    obrigatorio: false,
  },
  'vendaCota.categoriaResultado': {
    titulo: 'Categoria de ganho ou perda',
    paraQueServe: 'Categoria do resultado da venda, quando o bem não tem uma definida.',
    relacaoComTela: 'Só aparece se o bem não tem categoria de ganho/perda. O resultado da prévia é lançado nela.',
    obrigatorio: true,
  },

  // ── Venda do bem ───────────────────────────────────────────────────────────────────────────
  'vendaBem.data': {
    titulo: 'Data da venda',
    paraQueServe: 'Quando o bem foi vendido.',
    relacaoComTela: 'Data dos lançamentos da venda e da quitação, se houver.',
    obrigatorio: true,
  },
  'vendaBem.valor': {
    titulo: 'Valor recebido',
    paraQueServe: 'Quanto o comprador pagou pelo bem.',
    relacaoComTela: 'Entra na conta escolhida. Menos custos, saldo contábil do bem e quitação, dá o ganho ou a perda da prévia.',
    obrigatorio: true,
  },
  'vendaBem.conta': {
    titulo: 'Conta onde o dinheiro entrou',
    paraQueServe: 'Conta que recebeu o valor da venda.',
    relacaoComTela: 'O valor recebido é lançado nela.',
    obrigatorio: true,
  },
  'vendaBem.comprador': {
    titulo: 'Comprador',
    paraQueServe: 'Quem comprou o bem.',
    relacaoComTela: 'Vira o favorecido do lançamento da venda. Nome novo entra no cadastro de favorecidos.',
    obrigatorio: false,
  },
  'vendaBem.custos': {
    titulo: 'Custos da venda',
    paraQueServe: 'Taxas, comissões e despesas para vender o bem.',
    relacaoComTela: 'Reduzem o ganho (ou aumentam a perda). Com valor, pede a categoria dos custos.',
    obrigatorio: false,
  },
  'vendaBem.custosCategoria': {
    titulo: 'Categoria dos custos',
    paraQueServe: 'Categoria de despesa dos custos da venda.',
    relacaoComTela: 'É onde os custos aparecem no Demonstrativo.',
    obrigatorio: true,
  },
  'vendaBem.observacao': {
    titulo: 'Observação',
    paraQueServe: 'Anotação sobre a venda.',
    relacaoComTela: 'Fica no resumo da venda, na aba Informações do bem.',
    obrigatorio: false,
  },
  'vendaBem.quitar': {
    titulo: 'Quitar com o dinheiro da venda',
    paraQueServe: 'Paga o saldo devedor do financiamento do bem na venda.',
    relacaoComTela: 'Marcada, abre o valor da quitação, que sai da conta e entra na prévia. Desmarcada, a dívida continua aberta e as parcelas seguem a pagar.',
    obrigatorio: false,
  },
  'vendaBem.valorQuitacao': {
    titulo: 'Valor da quitação',
    paraQueServe: 'Quanto foi pago para quitar o financiamento.',
    relacaoComTela: 'Vem com o saldo devedor e pode ser corrigido (desconto de quitação). Entra na prévia e quita a dívida do financiamento.',
    obrigatorio: true,
  },
  'vendaBem.cancelarAgendamentos': {
    titulo: 'Agendamentos a cancelar',
    paraQueServe: 'Agendamentos futuros ligados ao bem que devem acabar com a venda.',
    relacaoComTela: 'Os marcados são encerrados ao confirmar; os desmarcados continuam. Vêm todos marcados.',
    obrigatorio: false,
  },
  'vendaBem.categoriaResultado': {
    titulo: 'Categoria de ganho ou perda',
    paraQueServe: 'Categoria do resultado da venda, quando o bem não tem uma definida.',
    relacaoComTela: 'Só aparece se o bem não tem categoria de ganho/perda. O resultado da prévia é lançado nela.',
    obrigatorio: true,
  },

  // ── Registrar entrada à vista ──────────────────────────────────────────────────────────────
  'entradaBem.data': {
    titulo: 'Data da entrada',
    paraQueServe: 'Data em que a entrada do bem foi paga.',
    relacaoComTela: 'Data do registro da entrada no extrato do bem e, no trade-in, da venda do bem antigo.',
    obrigatorio: true,
  },
  'entradaBem.busca': {
    titulo: 'Buscar transferências',
    paraQueServe: 'Filtra a lista por descrição ou nome de conta.',
    relacaoComTela: 'Só filtra a lista; não muda o que já está marcado.',
    obrigatorio: false,
  },
  'entradaBem.transferencias': {
    titulo: 'Transferências disponíveis',
    paraQueServe: 'Transferências feitas para a conta deste bem que pagaram a entrada.',
    relacaoComTela: 'As marcadas somam no Total da entrada e ficam vinculadas ao bem. Para cada uma, dá para escolher a categoria do bem. Só aparecem transferências para a conta do bem ainda não vinculadas.',
    obrigatorio: false,
  },
  'entradaBem.categoria': {
    titulo: 'Categoria da transferência',
    paraQueServe: 'Categoria do bem para esta transferência.',
    relacaoComTela: 'Grava a categoria na transferência só se ela estiver sem categoria.',
    obrigatorio: false,
  },
  'entradaBem.favorecido': {
    titulo: 'Favorecido',
    paraQueServe: 'Quem recebeu a entrada (o vendedor).',
    relacaoComTela: 'Preenche as transferências marcadas que estão sem favorecido. As que já têm um não mudam.',
    obrigatorio: false,
  },
  'entradaBem.tradeIn': {
    titulo: 'Usar um bem antigo como entrada',
    paraQueServe: 'Dá outro bem seu como parte do pagamento (trade-in).',
    relacaoComTela: 'Abre Qual bem e Por quanto vai vender. O valor soma no Total da entrada, o bem antigo vai a zero e passa a vendido, e o ganho ou a perda é lançado.',
    obrigatorio: false,
  },
  'entradaBem.bemAntigo': {
    titulo: 'Qual bem',
    paraQueServe: 'Bem antigo entregue na troca.',
    relacaoComTela: 'A nota fiscal dele é a base do ganho ou da perda. Bem já vendido é recusado.',
    obrigatorio: true,
  },
  'entradaBem.valorTradeIn': {
    titulo: 'Por quanto vai vender',
    paraQueServe: 'Valor dado ao bem antigo na troca.',
    relacaoComTela: 'Soma no Total da entrada. Menos a nota fiscal do bem antigo, dá o ganho ou a perda de capital, lançado na categoria do bem antigo (ou deste bem).',
    obrigatorio: true,
  },

  // ── Parametrizar bem (ligar conta patrimonial ao módulo de bem) ───────────────────────────
  'parametrizarBem.notaFiscal': {
    titulo: 'Valor da nota fiscal',
    paraQueServe: 'Valor de compra do bem, conforme a nota fiscal ou o contrato.',
    relacaoComTela: 'É a base do valor a financiar e do ganho ou da perda numa venda ou troca. Não pode ser mudado depois de gravado.',
    obrigatorio: true,
  },
  'parametrizarBem.descricao': {
    titulo: 'Descrição',
    paraQueServe: 'Texto livre sobre o bem.',
    relacaoComTela: 'Aparece na aba Informações do bem.',
    obrigatorio: false,
  },
  'parametrizarBem.categoriaPerda': {
    titulo: 'Perda de venda de bem',
    paraQueServe: 'Categoria de despesa usada quando o bem é vendido por menos do que custou.',
    relacaoComTela: 'Venda ou troca com perda lança a diferença nesta categoria. Vem sugerida a de perda de capital, se houver.',
    obrigatorio: true,
  },
  'parametrizarBem.categoriaGanho': {
    titulo: 'Ganho de venda de bem',
    paraQueServe: 'Categoria de receita usada quando o bem é vendido por mais do que custou.',
    relacaoComTela: 'Venda ou troca com ganho lança a diferença nesta categoria. Vem sugerida a de ganho de capital, se houver.',
    obrigatorio: true,
  },
  'parametrizarBem.categoriaPrestacao': {
    titulo: 'Prestação (principal)',
    paraQueServe: 'Categoria da parte de principal das parcelas do financiamento.',
    relacaoComTela: 'Cada parcela paga lança o principal nesta categoria e o juro na de taxa de financiamento.',
    obrigatorio: true,
  },
  'parametrizarBem.categoriaJuros': {
    titulo: 'Taxa de financiamento (juros)',
    paraQueServe: 'Categoria da parte de juros das parcelas do financiamento.',
    relacaoComTela: 'É onde os juros pagos aparecem no Demonstrativo.',
    obrigatorio: true,
  },

  // ── Editar favorecido do financiamento ────────────────────────────────────────────────────
  'favorecidoFinanciamento.favorecido': {
    titulo: 'Favorecido',
    paraQueServe: 'Quem recebe as parcelas do financiamento.',
    relacaoComTela: 'Troca o favorecido de todas as parcelas, inclusive as já pagas. É o texto que os agendamentos mostram.',
    obrigatorio: true,
  },
  'favorecidoFinanciamento.conta': {
    titulo: 'Conta vinculada',
    paraQueServe: 'Conta do banco que recebe, como vínculo contábil.',
    relacaoComTela: 'Opcional. Usada na descrição da conta de dívida. Escolher uma conta preenche o Favorecido com o nome dela, se você não o digitou.',
    obrigatorio: false,
  },
  'favorecidoFinanciamento.nomeBanco': {
    titulo: 'Nome do banco',
    paraQueServe: 'Nome da conta do novo banco que recebe as parcelas.',
    relacaoComTela: 'Cria a conta e a liga ao financiamento. Se já existe uma conta com este nome, ela é reaproveitada.',
    obrigatorio: true,
  },
  'favorecidoFinanciamento.tipoBanco': {
    titulo: 'Tipo',
    paraQueServe: 'Tipo da conta criada para o novo banco.',
    relacaoComTela: 'A conta nasce com este tipo na lista de Contas.',
    obrigatorio: false,
  },

  // ── Ligar uma receita ao bem ──────────────────────────────────────────────────────────────
  'receitaBem.busca': {
    titulo: 'Buscar receita',
    paraQueServe: 'Filtra as receitas por quem pagou ou pela descrição.',
    relacaoComTela: 'Só mostra receitas ainda não ligadas a um bem. Clique numa para escolher.',
    obrigatorio: false,
  },
  'receitaBem.papel': {
    titulo: 'O que é esta receita',
    paraQueServe: 'Como a receita escolhida entra no bem.',
    relacaoComTela: 'Devolução ou reembolso: entrou numa conta sua e reduz o custo do bem. Pago por terceiro: o terceiro pagou a parcela direto.',
    obrigatorio: true,
    atencao: 'Se você pagou e o terceiro devolveu, use devolução: senão a parcela conta duas vezes.',
  },

  // ── Atualizar valor (conta patrimonial ou investimento) ───────────────────────────────────
  'atualizarValor.novoValor': {
    titulo: 'Novo valor',
    paraQueServe: 'Valor atual de mercado do bem ou da conta.',
    relacaoComTela: 'Substitui o saldo exibido e entra no histórico de valores com a data de hoje. Aceita negativo.',
    obrigatorio: true,
  },
  'atualizarValor.observacao': {
    titulo: 'Observação',
    paraQueServe: 'De onde veio o valor ou por que mudou.',
    relacaoComTela: 'Aparece no histórico de valores, ao lado do valor.',
    obrigatorio: false,
  },

  // ── Valores do bem (aba Informações) ──────────────────────────────────────────────────────
  'valoresBem.notaFiscal': {
    titulo: 'Valor de contrato / nota fiscal',
    paraQueServe: 'Quanto o bem custou, pelo contrato ou pela nota fiscal.',
    relacaoComTela: 'Com "Usar no Patrimônio" em Contrato / Nota Fiscal, é este valor que entra no Patrimônio. Só editável enquanto o bem não tem movimentação.',
    obrigatorio: false,
  },
  'valoresBem.valorPago': {
    titulo: 'Valor pago / IR',
    paraQueServe: 'Quanto foi efetivamente pago, como declarado no Imposto de Renda.',
    relacaoComTela: 'Com "Usar no Patrimônio" em Valor Pago, é este valor que entra no Patrimônio. Em branco, vale o saldo da conta do bem.',
    obrigatorio: false,
  },
  'valoresBem.usarNoPatrimonio': {
    titulo: 'Usar no Patrimônio',
    paraQueServe: 'Qual dos dois valores o Patrimônio usa para este bem.',
    relacaoComTela: 'Trocar grava na hora e muda o valor do bem no Patrimônio, sem reescrever nada. Se o escolhido estiver em branco, vale o saldo.',
    obrigatorio: false,
  },
}

export const formularios = {}
