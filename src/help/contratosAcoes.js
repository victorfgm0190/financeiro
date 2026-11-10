// Help de campo — CONTRATOS, formulários fora da ficha (o wizard está em contratos.js):
// vínculo de agendamentos e lançamentos, vincular pagamento, reajuste, créditos, composição do
// boleto e do recibo, encargos na parcela, regras de itens, renovar/rescindir e buscar repasses.
// src/components/Contratos/*. Nada específico de um cliente.

export const campos = {
  // ── Detectamos agendamentos já existentes (vínculo) ───────────────────────────────────────
  'vinculoContrato.selecionar': {
    titulo: 'Vincular este agendamento',
    paraQueServe: 'Marca o agendamento que já existe e pertence a este contrato.',
    relacaoComTela: 'Vinculado, o histórico de pagos dele fica na ficha e o contrato gera só os meses que ele ainda não cobre: nada é duplicado nem apagado. Vêm marcados os que casam bem com o contrato.',
    obrigatorio: false,
  },
  'vinculoContrato.papel': {
    titulo: 'Papel',
    paraQueServe: 'O que este agendamento paga no contrato.',
    relacaoComTela: 'Aluguel (ou a parcela principal) ou condomínio. Decide com quais parcelas do contrato ele é comparado e quais meses ele cobre.',
    obrigatorio: true,
  },
  'vinculoContrato.manterValor': {
    titulo: 'Manter o valor atual',
    paraQueServe: 'Mantém, neste mês, o valor que a série já tem em vez do valor calculado pelo contrato.',
    relacaoComTela: 'Aparece quando o valor da série é diferente do calculado. Desmarcado, vale o valor do contrato.',
    obrigatorio: false,
  },
  'vinculoContrato.lancamentos': {
    titulo: 'Lançamentos já feitos',
    paraQueServe: 'Pagamentos avulsos (sem agendamento) que parecem deste contrato.',
    relacaoComTela: 'Os marcados são ligados à parcela indicada depois de "Revisar". Nenhum vem marcado e nenhum lançamento muda de valor. Dois na mesma parcela não podem.',
    obrigatorio: false,
  },

  // ── Vincular pagamento já lançado ──────────────────────────────────────────────────────────
  'vincularPagamento.busca': {
    titulo: 'Buscar lançamento',
    paraQueServe: 'Filtra os lançamentos livres por favorecido, descrição ou valor.',
    relacaoComTela: 'Só filtra a lista. A lista traz lançamentos da mesma conta ou perfil, sem contrato e sem agendamento, com os mais parecidos primeiro.',
    obrigatorio: false,
  },
  'vincularPagamento.periodo': {
    titulo: 'Período',
    paraQueServe: 'Datas de início e fim dos pagamentos mostrados.',
    relacaoComTela: 'Amplie o período se o pagamento não aparecer.',
    obrigatorio: false,
  },
  'vincularPagamento.lancamento': {
    titulo: 'Lançamento',
    paraQueServe: 'O pagamento que quitou esta parcela.',
    relacaoComTela: 'Depois de "Revisar", ele passa a pagar a parcela. O lançamento não muda; diferença de valor fica na composição como "Diferença no pagamento".',
    obrigatorio: true,
  },
  'vincularPagamento.parcela': {
    titulo: 'Parcela',
    paraQueServe: 'A parcela que este pagamento quitou.',
    relacaoComTela: 'Competência sem parcela é criada já paga com este lançamento. O valor esperado aparece ao lado para comparar.',
    obrigatorio: true,
  },

  // ── Confirmar reajuste ────────────────────────────────────────────────────────────────────
  'reajusteContrato.valor': {
    titulo: 'Aluguel reajustado',
    paraQueServe: 'Valor contratual depois do reajuste, sem bonificação.',
    relacaoComTela: 'Vem com a projeção pelo índice do contrato. Corrija para o valor que veio na cobrança. A bonificação, se houver, é descontada do total da parcela.',
    obrigatorio: true,
  },
  'reajusteContrato.escopo': {
    titulo: 'Aplicar às próximas parcelas',
    paraQueServe: 'Diz se o valor vale só nesta parcela ou nas seguintes do ciclo.',
    relacaoComTela: 'Sim: esta e as seguintes do ciclo passam ao valor, e os ciclos seguintes são reprojetados a partir dele. Não: só esta parcela muda.',
    obrigatorio: true,
  },
  'reajusteRepasse.valor': {
    titulo: 'Aluguel bruto reajustado',
    paraQueServe: 'Aluguel bruto depois do reajuste, no contrato recebido por administradora.',
    relacaoComTela: 'Vale da competência indicada em diante: a taxa de administração recalcula sobre ele e os ciclos seguintes são reprojetados. Competências já conferidas não mudam.',
    obrigatorio: true,
  },

  // ── Créditos ───────────────────────────────────────────────────────────────────────────────
  'creditoContrato.descricao': {
    titulo: 'Descrição',
    paraQueServe: 'Motivo do crédito a abater.',
    relacaoComTela: 'Aparece na composição da parcela onde o crédito é abatido e na aba de créditos.',
    obrigatorio: true,
  },
  'creditoContrato.valor': {
    titulo: 'Valor',
    paraQueServe: 'Quanto será abatido.',
    relacaoComTela: 'Reduz o valor da parcela de destino. Não gera lançamento: aparece na composição.',
    obrigatorio: true,
  },
  'creditoContrato.data': {
    titulo: 'Data do crédito',
    paraQueServe: 'Quando o crédito surgiu.',
    relacaoComTela: 'Data de origem do crédito, mostrada na lista de créditos do contrato.',
    obrigatorio: true,
  },
  'creditoContrato.destino': {
    titulo: 'Abater em',
    paraQueServe: 'Parcela pendente em que o crédito é abatido.',
    relacaoComTela: 'Em branco, segue a regra do contrato (mês seguinte ou próxima pendente). Escolhida, a parcela é recalculada com o abatimento.',
    obrigatorio: false,
  },
  'justificarDiferenca.creditos': {
    titulo: 'Créditos abertos',
    paraQueServe: 'Créditos do contrato que explicam o valor pago a menor.',
    relacaoComTela: 'Os marcados são compensados nesta parcela e somam no justificado. A soma não pode passar da diferença.',
    obrigatorio: false,
  },
  'justificarDiferenca.descricao': {
    titulo: 'Crédito manual',
    paraQueServe: 'Motivo de um desconto já praticado que não estava cadastrado.',
    relacaoComTela: 'Com valor, cria um crédito já compensado nesta parcela. Em branco, vale "Desconto praticado".',
    obrigatorio: false,
  },
  'justificarDiferenca.valor': {
    titulo: 'Valor do desconto',
    paraQueServe: 'Quanto do valor pago a menor é explicado por este desconto.',
    relacaoComTela: 'Soma no justificado. O que sobrar continua como "Diferença no pagamento". O lançamento não muda.',
    obrigatorio: false,
  },

  // ── Composição do boleto do condomínio ────────────────────────────────────────────────────
  'composicaoBoleto.entrada': {
    titulo: 'Como informar os itens',
    paraQueServe: 'Digitar os itens, colar o texto do app do condomínio ou ler uma foto ou PDF do boleto.',
    relacaoComTela: 'Colar e Foto preenchem a lista de itens, que você confere antes de confirmar. Nada é gravado sem "Confirmar".',
    obrigatorio: false,
  },
  'composicaoBoleto.texto': {
    titulo: 'Texto do boleto',
    paraQueServe: 'Texto copiado do app ou do e-mail do condomínio, um item por linha com o valor no fim.',
    relacaoComTela: '"Ler texto" transforma cada linha num item da lista e aplica as regras de quem paga.',
    obrigatorio: false,
    exemplo: 'Taxa de Condomínio 795,11 (uma linha por item).',
  },
  'composicaoBoleto.foto': {
    titulo: 'Foto ou PDF do boleto',
    paraQueServe: 'Lê o vencimento, o total e os itens de uma foto, print ou PDF.',
    relacaoComTela: 'O Assistente preenche a lista para você conferir. O arquivo não fica guardado.',
    obrigatorio: false,
  },
  'composicaoBoleto.total': {
    titulo: 'Total do boleto',
    paraQueServe: 'Valor a pagar do boleto, quando a parcela ainda está pendente.',
    relacaoComTela: 'Vira o valor pendente da parcela, e a soma dos itens tem de fechar com ele. Vazio: o total é a soma dos itens.',
    obrigatorio: false,
  },
  'composicaoBoleto.itemDescricao': {
    titulo: 'Descrição do item',
    paraQueServe: 'Nome do item como está no boleto.',
    relacaoComTela: 'É comparada com as regras de itens para saber quem paga. Embaixo aparece a regra que casou.',
    obrigatorio: true,
  },
  'composicaoBoleto.itemValor': {
    titulo: 'Valor do item',
    paraQueServe: 'Quanto este item cobra no boleto.',
    relacaoComTela: 'Soma no total e na parte do inquilino ou do proprietário.',
    obrigatorio: true,
  },
  'composicaoBoleto.itemResponsavel': {
    titulo: 'De quem é',
    paraQueServe: 'Quem paga o item: inquilino ou proprietário.',
    relacaoComTela: 'Vem da regra que casou. Itens do proprietário viram crédito a abater no aluguel. Sem regra, o item fica destacado até você escolher.',
    obrigatorio: true,
  },
  'composicaoBoleto.lembrar': {
    titulo: 'Lembrar para os próximos',
    paraQueServe: 'Cria uma regra com a escolha feita à mão.',
    relacaoComTela: 'Os próximos boletos com item que começa com o mesmo texto já vêm com o responsável. Sem marcar, a escolha vale só agora.',
    obrigatorio: false,
  },
  'composicaoBoleto.soNesteBoleto': {
    titulo: 'Só neste boleto',
    paraQueServe: 'Marca um item eventual.',
    relacaoComTela: 'O item sai da previsão dos próximos condomínios. Não muda o crédito gerado nem o valor do lançamento.',
    obrigatorio: false,
  },
  'composicaoBoleto.dividir': {
    titulo: 'Dividir entre inquilino e proprietário',
    paraQueServe: 'Separa a parte do proprietário num item que é dos dois.',
    relacaoComTela: 'Informe a parte do proprietário e clique OK: o item vira dois, um de cada.',
    obrigatorio: false,
  },

  // ── Composição do recibo do aluguel ───────────────────────────────────────────────────────
  'composicaoRecibo.entrada': {
    titulo: 'Como informar os itens',
    paraQueServe: 'Digitar os itens, colar o texto do recibo ou ler uma foto ou PDF.',
    relacaoComTela: 'Colar e Foto preenchem a lista, reconhecendo cada item contra o esperado da parcela. Nada grava sem "Confirmar composição".',
    obrigatorio: false,
  },
  'composicaoRecibo.texto': {
    titulo: 'Texto do recibo',
    paraQueServe: 'Texto do recibo, um item por linha; desconto com "-" ou "(-)".',
    relacaoComTela: '"Ler texto" transforma cada linha num item e reconhece contratual, bonificação, encargos e créditos.',
    obrigatorio: false,
    exemplo: 'Aluguel 3.900,00 / Fundo de reserva -79,14 (uma linha por item).',
  },
  'composicaoRecibo.foto': {
    titulo: 'Foto ou PDF do recibo',
    paraQueServe: 'Lê a referência, as datas, o valor pago e os itens de uma foto, print ou PDF.',
    relacaoComTela: 'O Assistente preenche a lista para você conferir. O arquivo não fica guardado.',
    obrigatorio: false,
  },
  'composicaoRecibo.total': {
    titulo: 'Total do recibo',
    paraQueServe: 'Valor total a pagar do recibo, quando a parcela está pendente.',
    relacaoComTela: 'O valor desta parcela passa a ser este total (só esta). Vazio: vale a soma dos itens.',
    obrigatorio: false,
  },
  'composicaoRecibo.itemDescricao': {
    titulo: 'Descrição do item',
    paraQueServe: 'Nome do item como está no recibo.',
    relacaoComTela: 'Usada para reconhecer o item contra o esperado da parcela.',
    obrigatorio: true,
  },
  'composicaoRecibo.itemValor': {
    titulo: 'Valor do item',
    paraQueServe: 'Valor do item, sempre positivo.',
    relacaoComTela: 'Débito soma e crédito subtrai na soma dos itens.',
    obrigatorio: true,
  },
  'composicaoRecibo.itemNatureza': {
    titulo: 'Débito ou crédito',
    paraQueServe: 'Débito aumenta o recibo; crédito diminui.',
    relacaoComTela: 'Muda o sinal do item na soma e na diferença para o valor pago.',
    obrigatorio: true,
  },
  'composicaoRecibo.itemTipo': {
    titulo: 'Tipo do item',
    paraQueServe: 'O que o item é na parcela: contratual, bonificação, encargo ou desconto recorrente, item único ou crédito do proprietário.',
    relacaoComTela: 'Crédito do proprietário abre a escolha do crédito. Item único pode virar recorrente. Valor diferente do previsto vale só nesta parcela.',
    obrigatorio: true,
  },
  'composicaoRecibo.seguir': {
    titulo: 'Usar nas próximas parcelas',
    paraQueServe: 'Leva o valor novo do encargo para as parcelas seguintes.',
    relacaoComTela: 'Desmarcado, o valor diferente vale só nesta parcela.',
    obrigatorio: false,
  },
  'composicaoRecibo.credito': {
    titulo: 'Crédito do proprietário',
    paraQueServe: 'Qual crédito a abater este desconto do recibo representa.',
    relacaoComTela: 'Ligado, o crédito é compensado aqui e sai da parcela onde estava previsto (que é recalculada). "Novo crédito manual" cria um já abatido.',
    obrigatorio: true,
  },
  'composicaoRecibo.recorrente': {
    titulo: 'Tornar recorrente',
    paraQueServe: 'Faz o item único se repetir nas próximas parcelas.',
    relacaoComTela: 'Abre "nesta parcela é a … de …" para saber quantas faltam.',
    obrigatorio: false,
  },
  'composicaoRecibo.parcelaAtual': {
    titulo: 'Parcela atual do item',
    paraQueServe: 'Qual parcela do item está neste recibo.',
    relacaoComTela: 'Com o total, diz em quantas parcelas o item ainda entra.',
    obrigatorio: true,
  },
  'composicaoRecibo.parcelasTotal': {
    titulo: 'Total de parcelas do item',
    paraQueServe: 'Em quantas parcelas o item é cobrado.',
    relacaoComTela: 'O item sai sozinho depois da última.',
    obrigatorio: true,
  },

  // ── Encargos e descontos na parcela (Aditivo / editar → Valores) ──────────────────────────
  'encargoParcela.descricao': {
    titulo: 'Descrição do encargo',
    paraQueServe: 'Nome do encargo ou desconto que entra no valor da parcela.',
    relacaoComTela: 'Aparece na composição de cada parcela com a posição ("3/36").',
    obrigatorio: true,
  },
  'encargoParcela.sinal': {
    titulo: 'Encargo ou desconto',
    paraQueServe: 'Encargo soma na parcela; desconto subtrai.',
    relacaoComTela: 'Muda o sinal do valor na composição e no total da parcela.',
    obrigatorio: true,
  },
  'encargoParcela.valor': {
    titulo: 'Valor por parcela',
    paraQueServe: 'Quanto o item soma ou desconta em cada parcela.',
    relacaoComTela: 'Entra no valor da parcela enquanto o item durar. Não vira despesa separada: o pagamento continua uma linha só.',
    obrigatorio: true,
  },
  'encargoParcela.parcelas': {
    titulo: 'Dura (parcelas)',
    paraQueServe: 'Em quantas parcelas o item é cobrado.',
    relacaoComTela: 'Depois da última, o item sai sozinho das parcelas.',
    obrigatorio: true,
  },
  'encargoParcela.modoInicio': {
    titulo: 'Como informar o início',
    paraQueServe: 'Pelo número da parcela do contrato em que o item começa, ou pela posição dele na próxima parcela pendente.',
    relacaoComTela: 'A segunda forma serve para contrato já em andamento: informe em que parcela do item a próxima pendente está.',
    obrigatorio: true,
  },
  'encargoParcela.inicio': {
    titulo: 'Início',
    paraQueServe: 'Número da parcela do contrato em que o item começa (ou a posição atual do item).',
    relacaoComTela: 'O texto abaixo mostra como fica a próxima parcela.',
    obrigatorio: true,
  },

  // ── Regras de itens ───────────────────────────────────────────────────────────────────────
  'regraItem.escopo': {
    titulo: 'Regras de',
    paraQueServe: 'Mostra as regras globais ou as de um contrato.',
    relacaoComTela: 'Regra nova é criada no escopo escolhido. A regra do contrato vence a global.',
    obrigatorio: false,
  },
  'regraItem.texto': {
    titulo: 'Texto do item',
    paraQueServe: 'Texto que identifica o item no boleto.',
    relacaoComTela: 'Comparado sem diferenciar maiúsculas nem acentos.',
    obrigatorio: true,
  },
  'regraItem.tipoMatch': {
    titulo: 'Casa se',
    paraQueServe: 'Se o item precisa começar com o texto ou só conter o texto.',
    relacaoComTela: '"Começa com" vence "contém" quando duas regras casam.',
    obrigatorio: true,
  },
  'regraItem.responsavel': {
    titulo: 'De quem é',
    paraQueServe: 'Quem paga os itens que casam com a regra.',
    relacaoComTela: 'Itens do proprietário viram crédito a abater no aluguel.',
    obrigatorio: true,
  },
  'regraItem.testar': {
    titulo: 'Testar com o texto do boleto',
    paraQueServe: 'Mostra como as regras atuais classificam um boleto colado.',
    relacaoComTela: 'Só simula: nada é gravado. Itens sem regra aparecem destacados.',
    obrigatorio: false,
  },

  // ── Renovar e rescindir ───────────────────────────────────────────────────────────────────
  'renovarContrato.fim': {
    titulo: 'Novo fim da vigência',
    paraQueServe: 'Até quando o contrato vale depois da renovação.',
    relacaoComTela: 'Vem com 12 meses depois do fim atual e precisa ser posterior a ele. As parcelas do novo período são geradas com a projeção do reajuste.',
    obrigatorio: true,
  },
  'rescindirContrato.data': {
    titulo: 'Data de saída',
    paraQueServe: 'Quando o contrato termina.',
    relacaoComTela: 'Parcelas pendentes com vencimento depois desta data são canceladas; as pagas ficam. O total cancelado aparece logo abaixo.',
    obrigatorio: true,
  },
  'rescindirContrato.motivo': {
    titulo: 'Motivo',
    paraQueServe: 'Por que o contrato foi encerrado.',
    relacaoComTela: 'Fica registrado junto com a rescisão do contrato.',
    obrigatorio: false,
  },

  // ── Buscar repasses já lançados ───────────────────────────────────────────────────────────
  'buscarRepasse.lancamento': {
    titulo: 'Lançamento do repasse',
    paraQueServe: 'Recebimento que pagou o repasse desta competência.',
    relacaoComTela: 'Vem o mais provável. Troque por outro da lista ou escolha Pular. Em "Vincular", o repasse da competência é baixado por ele; o lançamento não muda.',
    obrigatorio: false,
  },

  // ── Relatório de Rendimentos: conferência com o informe da administradora (bloco 5b) ─────────
  'informeAdm.rendimentos': {
    titulo: 'Rendimentos do informe',
    paraQueServe: 'Aluguel bruto do ano que consta no informe da administradora.',
    relacaoComTela: 'A coluna Diferença compara com o calculado. "Gravar informe" guarda o valor no contrato, por ano.',
    obrigatorio: false,
  },
  'informeAdm.deducoes': {
    titulo: 'Deduções do informe',
    paraQueServe: 'Deduções dedutíveis do ano que constam no informe da administradora.',
    relacaoComTela: 'A coluna Diferença compara com o calculado. "Gravar informe" guarda o valor no contrato, por ano.',
    obrigatorio: false,
  },
}

export const formularios = {}
