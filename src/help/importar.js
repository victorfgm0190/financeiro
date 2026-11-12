// Help de campo — IMPORTAR: Importar lançamentos (conta), Importar fatura (cartão: arquivo,
// revisão, preencher em lote, categoria → gerencial, estornos, conciliação), mapeamento de arquivo
// do banco e importação Dindin. src/components/Import/*, ImportarLancamentos/*,
// Settings/DindinImportPanel. Nada específico de um cliente.

export const campos = {
  // ── Importar lançamentos (conta corrente, poupança, dinheiro) ─────────────────────────────
  'importarLanc.conta': {
    titulo: 'Conta de destino',
    paraQueServe: 'Conta onde os lançamentos do arquivo serão gravados.',
    relacaoComTela: 'Contas correntes, poupanças e dinheiro. Trocar a conta limpa o arquivo lido. Cartão de crédito é no Importar Fatura.',
    obrigatorio: true,
  },
  'importarLanc.arquivo': {
    titulo: 'Arquivo',
    paraQueServe: 'Planilha preenchida (.xlsx gerado pelo Finup ou .csv com as mesmas colunas) ou extrato .ofx do banco.',
    relacaoComTela: 'É lido na hora e abre a prévia. Nada é gravado antes de "Importar".',
    obrigatorio: true,
  },
  'importarLanc.categoriaPendente': {
    titulo: 'Categoria correspondente',
    paraQueServe: 'Categoria do Finup para um texto de categoria do arquivo que não existe no cadastro.',
    relacaoComTela: 'Escolha uma existente ou crie uma nova; a escolha fica salva no de-para para as próximas importações. Sem escolha, as linhas entram sem categoria.',
    obrigatorio: false,
  },
  'importarLanc.selecionar': {
    titulo: 'Importar a linha',
    paraQueServe: 'Marca as linhas válidas que serão gravadas.',
    relacaoComTela: 'Desmarcada, a linha fica de fora. Possíveis duplicados aparecem destacados para você decidir.',
    obrigatorio: false,
  },

  // ── Mapear arquivo do banco ───────────────────────────────────────────────────────────────
  'mapeador.cabecalho': {
    titulo: 'Linha do cabeçalho',
    paraQueServe: 'Linha da planilha que tem os nomes das colunas.',
    relacaoComTela: 'As linhas acima dela são ignoradas, e os nomes dela aparecem nos seletores de coluna.',
    obrigatorio: true,
  },
  'mapeador.data': {
    titulo: 'Coluna da data',
    paraQueServe: 'Coluna com a data do lançamento.',
    relacaoComTela: 'Lida com o formato da data escolhido abaixo.',
    obrigatorio: true,
  },
  'mapeador.descricao': {
    titulo: 'Coluna da descrição',
    paraQueServe: 'Coluna com a descrição do lançamento.',
    relacaoComTela: 'Vira a descrição de cada lançamento importado.',
    obrigatorio: true,
  },
  'mapeador.modoValor': {
    titulo: 'Como vem o valor',
    paraQueServe: 'Uma coluna de valor ou colunas separadas de débito e crédito.',
    relacaoComTela: 'Muda os seletores logo abaixo.',
    obrigatorio: true,
  },
  'mapeador.valor': {
    titulo: 'Coluna do valor',
    paraQueServe: 'Coluna com o valor do lançamento.',
    relacaoComTela: 'O sinal das despesas é dito em "Despesas aparecem como".',
    obrigatorio: true,
  },
  'mapeador.debito': {
    titulo: 'Coluna de débito',
    paraQueServe: 'Coluna com as saídas.',
    relacaoComTela: 'Valores dela viram despesas.',
    obrigatorio: true,
  },
  'mapeador.credito': {
    titulo: 'Coluna de crédito',
    paraQueServe: 'Coluna com as entradas.',
    relacaoComTela: 'Valores dela viram receitas.',
    obrigatorio: true,
  },
  'mapeador.favorecido': {
    titulo: 'Coluna do favorecido',
    paraQueServe: 'Coluna com quem pagou ou recebeu, se o arquivo tiver.',
    relacaoComTela: 'Opcional. Preenche o favorecido dos lançamentos.',
    obrigatorio: false,
  },
  'mapeador.formatoData': {
    titulo: 'Formato da data',
    paraQueServe: 'Ordem de dia, mês e ano no arquivo.',
    relacaoComTela: 'Errado, as datas saem trocadas na prévia do resultado.',
    obrigatorio: true,
  },
  'mapeador.decimal': {
    titulo: 'Separador decimal',
    paraQueServe: 'Se os centavos vêm depois de vírgula ou de ponto.',
    relacaoComTela: 'Errado, os valores saem multiplicados ou divididos por 100 na prévia.',
    obrigatorio: true,
  },
  'mapeador.sinal': {
    titulo: 'Despesas aparecem como',
    paraQueServe: 'Se as saídas vêm com valor negativo ou positivo.',
    relacaoComTela: 'Decide o que é despesa e o que é receita quando há uma coluna de valor só.',
    obrigatorio: true,
  },
  'mapeador.ignorar': {
    titulo: 'Ignorar linhas que contenham',
    paraQueServe: 'Textos que marcam linhas a pular (totais, saldos).',
    relacaoComTela: 'Linha com algum destes textos fica fora; a contagem aparece no Resultado.',
    obrigatorio: false,
  },
  'mapeador.nome': {
    titulo: 'Nome do modelo',
    paraQueServe: 'Nome para reconhecer este mapeamento depois.',
    relacaoComTela: 'Obrigatório para "Salvar modelo". O próximo arquivo com o mesmo cabeçalho é reconhecido sozinho.',
    obrigatorio: false,
  },
  'mapeador.banco': {
    titulo: 'Banco',
    paraQueServe: 'Banco de onde vem o arquivo.',
    relacaoComTela: 'Opcional; ajuda a identificar o modelo salvo.',
    obrigatorio: false,
  },

  // ── Importar fatura: arquivo ──────────────────────────────────────────────────────────────
  'importarFatura.cartao': {
    titulo: 'Cartão',
    paraQueServe: 'Cartão de crédito da fatura.',
    relacaoComTela: 'Os lançamentos entram neste cartão. Antes do arquivo, serve à conciliação; depois, o arquivo pode detectar o cartão sozinho.',
    obrigatorio: true,
  },
  'importarFatura.mes': {
    titulo: 'Mês de referência',
    paraQueServe: 'Mês da fatura que está sendo importada.',
    relacaoComTela: 'As compras entram nesta fatura, e as parcelas futuras nas seguintes. O arquivo pode detectar o mês; se for diferente, a tela avisa.',
    obrigatorio: true,
  },
  'importarFatura.arquivo': {
    titulo: 'Arquivo da fatura',
    paraQueServe: 'Arquivo da fatura (XLS, XLSX, CSV ou OFX) exportado do banco.',
    relacaoComTela: 'Clique, arraste ou cole. Arquivo não reconhecido abre o mapeamento de colunas. Nada é gravado antes de confirmar.',
    obrigatorio: true,
  },
  'importarFatura.conciliar': {
    titulo: 'Conciliar fatura',
    paraQueServe: 'Compara o extrato do banco com os lançamentos que já estão na fatura escolhida.',
    relacaoComTela: 'Precisa do cartão e do mês. Mostra o que está só no extrato, só no sistema e nos dois.',
    obrigatorio: false,
  },

  // ── Importar fatura: revisão das linhas ───────────────────────────────────────────────────
  'revisaoFatura.importar': {
    titulo: 'Importar a linha',
    paraQueServe: 'Marca as compras que serão gravadas.',
    relacaoComTela: 'Desmarcadas vão para o bloco "Não entram". O que já está no Finup não pode ser marcado.',
    obrigatorio: false,
  },
  'revisaoFatura.data': {
    titulo: 'Datas',
    paraQueServe: 'Data no cartão e data no sistema.',
    relacaoComTela: 'Clique para editar as duas. Um ponto indica quando a data do sistema é diferente da do cartão.',
    obrigatorio: false,
  },
  'revisaoFatura.fatura': {
    titulo: 'Fatura',
    paraQueServe: 'Mês da fatura em que a compra entra.',
    relacaoComTela: 'Fica destacada quando difere do mês de referência. Clique para trocar.',
    obrigatorio: false,
  },
  'revisaoFatura.descricao': {
    titulo: 'Descrição',
    paraQueServe: 'Descrição da compra como veio no arquivo.',
    relacaoComTela: 'Clique para editar. É usada para sugerir categoria e para aprender regras.',
    obrigatorio: false,
  },
  'revisaoFatura.parcelamento': {
    titulo: 'Parcelamento',
    paraQueServe: 'Diz se a compra é à vista ou a parcela N de um total.',
    relacaoComTela: 'Parcelada, as parcelas seguintes são geradas nas próximas faturas.',
    obrigatorio: false,
  },
  'revisaoFatura.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Categoria da compra.',
    relacaoComTela: 'Escolher aprende a classificação para as próximas faturas e oferece aplicar às compras iguais. Pode preencher o grupo gerencial padrão da categoria.',
    obrigatorio: false,
  },
  'revisaoFatura.grupo': {
    titulo: 'Grupo gerencial',
    paraQueServe: 'Grupo gerencial da compra.',
    relacaoComTela: 'Define de qual conta sai o resgate da compra. Trocar oferece aplicar às compras iguais.',
    obrigatorio: false,
  },
  'revisaoFatura.funcao': {
    titulo: 'Função de reserva',
    paraQueServe: 'Função de onde vem o resgate, quando a conta do grupo tem mais de uma.',
    relacaoComTela: 'Obrigatória nesse caso: a linha fica destacada até escolher.',
    obrigatorio: true,
  },
  'revisaoFatura.decidir': {
    titulo: 'Decidir',
    paraQueServe: 'Diz o que fazer com uma linha que parece já estar no Finup.',
    relacaoComTela: 'No cartão "É este?": "Sim, é este" junta a linha ao lançamento do Finup (nada novo é criado); "Não, é outro" importa a linha como nova. Embaixo de cada botão aparece o que acontece. Sem resposta, a linha não entra.',
    obrigatorio: true,
  },
  'revisaoFatura.favorecido': {
    titulo: 'Favorecido do lançamento existente',
    paraQueServe: 'Qual favorecido fica no lançamento que já estava no cartão.',
    relacaoComTela: 'Manter, usar o sugerido pela fatura ou digitar outro. O anterior vai para o histórico.',
    obrigatorio: false,
  },
  'revisaoFatura.baixa': {
    titulo: 'Baixa de agendamento',
    paraQueServe: 'Usa a compra para quitar uma ocorrência de agendamento.',
    relacaoComTela: 'Marcada, ao confirmar a ocorrência é baixada (como no Pagar) e as parcelas futuras quitam as ocorrências das faturas delas. Desmarque para importar como lançamento avulso.',
    obrigatorio: false,
  },
  'revisaoFatura.atualizarParcela': {
    titulo: 'Atualizar a previsão do Finup',
    paraQueServe: 'Aplica à parcela prevista no Finup o que a fatura diz de diferente.',
    relacaoComTela: 'Desmarcada, a parcela gravada fica como está.',
    obrigatorio: false,
  },
  'revisaoFatura.centavos': {
    titulo: 'Estornos de centavos',
    paraQueServe: 'Marca ou desmarca de uma vez o bloco de estornos de centavos.',
    relacaoComTela: 'Abre o bloco para ver as linhas uma a uma.',
    obrigatorio: false,
  },

  // ── Preencher em lote / categoria → gerencial / estornos ─────────────────────────────────
  'loteFatura.contem': {
    titulo: 'Descrição contém',
    paraQueServe: 'Parte da descrição das compras que vão receber o preenchimento.',
    relacaoComTela: '"Aplicar" muda todas as compras da revisão cuja descrição contém este texto.',
    obrigatorio: true,
  },
  'loteFatura.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Categoria aplicada às compras que casam.',
    relacaoComTela: 'Vazia, a categoria das compras não muda.',
    obrigatorio: false,
  },
  'loteFatura.grupo': {
    titulo: 'Grupo gerencial',
    paraQueServe: 'Grupo aplicado às compras que casam.',
    relacaoComTela: 'Se a conta do grupo tem mais de uma função de reserva, abre a escolha da função.',
    obrigatorio: true,
  },
  'loteFatura.funcao': {
    titulo: 'Função de reserva',
    paraQueServe: 'Função de onde vem o resgate dessas compras.',
    relacaoComTela: 'Só aparece quando a conta do grupo tem mais de uma função.',
    obrigatorio: false,
  },
  'loteFatura.apenasDespesas': {
    titulo: 'Apenas despesas',
    paraQueServe: 'Deixa os estornos (receitas) de fora do preenchimento.',
    relacaoComTela: 'Marcado é o padrão: estornos já têm categoria automática própria.',
    obrigatorio: false,
  },
  'catGer.grupo': {
    titulo: 'Grupo gerencial da categoria',
    paraQueServe: 'Grupo usado por todas as compras desta categoria na importação.',
    relacaoComTela: 'Trocar aplica na hora a todas as compras da categoria nesta revisão.',
    obrigatorio: false,
  },
  'estornoConfig.categoria': {
    titulo: 'Categoria padrão para estornos',
    paraQueServe: 'Categoria aplicada aos estornos desta e das próximas faturas.',
    relacaoComTela: 'Fica salva em Configurações › Estornos e já vale para os estornos atuais.',
    obrigatorio: true,
  },

  // ── Conciliação com o extrato ─────────────────────────────────────────────────────────────
  'conciliacao.faturaEncerrada': {
    titulo: 'Fatura encerrada',
    paraQueServe: 'Diz que o fechamento desta fatura já passou.',
    relacaoComTela: 'Marcada, as parcelas que estão só no sistema são empurradas para a fatura seguinte ao confirmar.',
    obrigatorio: false,
  },
  'conciliacao.soExtrato': {
    titulo: 'Importar ou ignorar',
    paraQueServe: 'O que fazer com o item que está só no extrato.',
    relacaoComTela: 'Importar cria o lançamento na fatura; Ignorar deixa de fora. Categoria, grupo e parcelamento da linha valem ao importar.',
    obrigatorio: true,
  },
  'conciliacao.soSistema': {
    titulo: 'Manter ou excluir',
    paraQueServe: 'O que fazer com o lançamento que está só no sistema.',
    relacaoComTela: 'Excluir apaga o lançamento ao confirmar. Parcela prevista que o banco ainda não lançou numa fatura aberta só pode ser mantida.',
    obrigatorio: true,
  },

  // ── Conta corrente (Dindin) e pendências Dindin ───────────────────────────────────────────
  'contaCorrente.arquivo': {
    titulo: 'Arquivo da conta',
    paraQueServe: 'Extrato da conta (XLS, XLSX, CSV ou OFX) para importar.',
    relacaoComTela: 'Abre a prévia com o mapeamento das contas do arquivo. Arquivo não reconhecido abre o mapeamento de colunas.',
    obrigatorio: true,
  },
  'contaCorrente.mapeamento': {
    titulo: 'Conta do Finup',
    paraQueServe: 'Conta do Finup que corresponde a cada conta citada no arquivo.',
    relacaoComTela: 'Os lançamentos da conta do arquivo entram na conta escolhida.',
    obrigatorio: true,
  },
  'contaCorrente.selecionar': {
    titulo: 'Importar a linha',
    paraQueServe: 'Marca os lançamentos que serão gravados.',
    relacaoComTela: 'Duplicados não podem ser marcados.',
    obrigatorio: false,
  },
  'dindin.arquivo': {
    titulo: 'Arquivo Dindin',
    paraQueServe: 'Planilha exportada do Dindin, da aba escolhida (conta corrente ou cartões).',
    relacaoComTela: 'As linhas entram como pendências para revisar. Reenviar o mesmo arquivo não duplica.',
    obrigatorio: false,
  },
  'dindin.selecionar': {
    titulo: 'Selecionar pendências',
    paraQueServe: 'Marca as linhas que serão confirmadas ou ignoradas.',
    relacaoComTela: 'Os botões de ação valem para as linhas marcadas.',
    obrigatorio: false,
  },
}

export const formularios = {}
