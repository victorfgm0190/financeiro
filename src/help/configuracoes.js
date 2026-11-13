// Help de campo — CONFIGURAÇÕES (as seções que ainda não tinham ajuda): período, estornos e IOF,
// regras de classificação e de grupo gerencial, controle gerencial e grupos, backup, manutenção,
// identidade, tipos de documento, usuários, trocar senha, feriados, apelidos da IA, de-para,
// kit de categorias, guias e agenda no celular. src/components/Settings/*, BoasVindas/GuiasTelasPanel,
// pages/TrocarSenha. Nada específico de um cliente.

export const campos = {
  // ── Período financeiro ────────────────────────────────────────────────────────────────────
  'periodo.modo': {
    titulo: 'Tipo de mês financeiro',
    paraQueServe: 'Como receitas e despesas são agrupadas por mês no Dashboard e nos relatórios.',
    relacaoComTela: 'Mês corrido vai do dia 1 ao último dia do mês. Mês personalizado começa no dia de início escolhido e libera esse campo.',
    obrigatorio: true,
  },
  'periodo.diaInicio': {
    titulo: 'Dia de início do mês financeiro',
    paraQueServe: 'Dia em que cada mês financeiro começa, no modo personalizado.',
    relacaoComTela: 'O período vai deste dia até a véspera dele no mês seguinte e leva o nome do mês em que começa. Vale de 1 a 28. Sem efeito no mês corrido. Grava com Salvar.',
    obrigatorio: false,
    exemplo: 'Dia 5: o mês vai de 5 de um mês a 4 do seguinte.',
  },
  'periodo.perguntarVirada': {
    titulo: 'Perguntar sobre a virada',
    paraQueServe: 'Liga a pergunta de virada de saldo ao entrar em Reservas.',
    relacaoComTela: 'Quando um mês financeiro termina sem virada, Reservas pergunta se você quer fazê-la. Desligada, a pergunta some, mas o botão "Virar Saldo" continua. Grava na hora.',
    obrigatorio: false,
  },
  'periodo.diasCaixa': {
    titulo: 'Dias à frente do aviso de caixa',
    paraQueServe: 'Prazo que o aviso de caixa da reserva olha à frente.',
    relacaoComTela: 'O aviso compara o saldo da conta de reserva com o que está previsto para sair nesse prazo. Grava na hora.',
    obrigatorio: false,
  },

  // ── Estornos de cartão e IOF ──────────────────────────────────────────────────────────────
  'estorno.ligado': {
    titulo: 'Categoria padrão para estornos',
    paraQueServe: 'Aplica uma categoria automaticamente aos estornos da fatura.',
    relacaoComTela: 'Vale na importação e na conciliação de fatura, para receitas que não são pagamento nem anuidade. Ligado, abre o campo Categoria.',
    obrigatorio: false,
  },
  'estorno.categoria': {
    titulo: 'Categoria dos estornos',
    paraQueServe: 'Categoria aplicada aos estornos detectados na fatura.',
    relacaoComTela: 'Cada estorno importado já vem com ela. Dá para trocar linha a linha na revisão.',
    obrigatorio: true,
  },
  'estorno.iof': {
    titulo: 'Alíquota do IOF',
    paraQueServe: 'Percentual de IOF das compras internacionais no cartão.',
    relacaoComTela: 'Usada quando o Assistente lança compra em moeda estrangeira: o IOF é estimado com ela. Na importação da fatura, compra e IOF recebem o valor real. Grava ao sair do campo.',
    obrigatorio: true,
  },

  // ── Regras de classificação ───────────────────────────────────────────────────────────────
  'classificacao.contem': {
    titulo: 'Contém',
    paraQueServe: 'Texto que a descrição do lançamento precisa conter.',
    relacaoComTela: 'Na importação, o lançamento cuja descrição contém este texto recebe a categoria da regra.',
    obrigatorio: true,
  },
  'classificacao.categoria': {
    titulo: 'Categoria',
    paraQueServe: 'Categoria aplicada quando a regra casa.',
    relacaoComTela: 'Entra sugerida nos lançamentos importados; dá para trocar na revisão.',
    obrigatorio: true,
  },

  // ── Regras de grupo gerencial ─────────────────────────────────────────────────────────────
  'regraGerencial.contem': {
    titulo: 'Palavra-chave',
    paraQueServe: 'Texto que a descrição da compra no cartão precisa conter.',
    relacaoComTela: 'As regras são testadas em ordem na importação de fatura; a primeira que bater define o grupo gerencial.',
    obrigatorio: true,
  },
  'regraGerencial.parcelado': {
    titulo: 'Parcelado ou à vista',
    paraQueServe: 'Restringe a regra a compras parceladas, à vista ou qualquer uma.',
    relacaoComTela: 'Compra que não combina com esta escolha não usa a regra.',
    obrigatorio: false,
  },
  'regraGerencial.valorMin': {
    titulo: 'Valor mínimo',
    paraQueServe: 'Menor valor de compra em que a regra vale.',
    relacaoComTela: 'Vazio: sem limite mínimo.',
    obrigatorio: false,
  },
  'regraGerencial.valorMax': {
    titulo: 'Valor máximo',
    paraQueServe: 'Maior valor de compra em que a regra vale.',
    relacaoComTela: 'Vazio: sem limite máximo.',
    obrigatorio: false,
  },
  'regraGerencial.grupo': {
    titulo: 'Grupo gerencial',
    paraQueServe: 'Grupo aplicado à compra que casa com a regra.',
    relacaoComTela: 'Entra na revisão da fatura; dá para trocar linha a linha.',
    obrigatorio: true,
  },

  // ── Controle gerencial ────────────────────────────────────────────────────────────────────
  'controleGerencial.ligar': {
    titulo: 'Usar controle gerencial',
    paraQueServe: 'Liga ou desliga a classificação gerencial no ambiente todo.',
    relacaoComTela: 'Desligado, o grupo gerencial some de lançamentos, agendamentos e importação de fatura, e nada gerencial é gerado. O histórico fica. Para desligar, as subcontas precisam estar zeradas e os agendamentos gerenciais concluídos.',
    obrigatorio: false,
  },
  'grupoGerencial.nome': {
    titulo: 'Nome do grupo',
    paraQueServe: 'Nome do grupo gerencial.',
    relacaoComTela: 'Aparece com o número nos seletores de grupo e nos totais por grupo da fatura.',
    obrigatorio: true,
  },
  'grupoGerencial.apelido': {
    titulo: 'Apelido',
    paraQueServe: 'Sigla curta do grupo, até 4 letras.',
    relacaoComTela: 'Identificação curta do grupo, usada junto com o número.',
    obrigatorio: true,
  },
  'grupoGerencial.contaResgate': {
    titulo: 'Conta de resgate padrão',
    paraQueServe: 'Conta de onde sai o dinheiro das compras deste grupo.',
    relacaoComTela: 'Na importação de fatura, as compras do grupo geram o resgate desta conta. Se ela tem mais de uma função de reserva, a revisão pede a função.',
    obrigatorio: false,
  },

  // ── Backup e manutenção ───────────────────────────────────────────────────────────────────
  'backup.importar': {
    titulo: 'Restaurar backup',
    paraQueServe: 'Troca os dados deste ambiente pelos de um arquivo de backup (.json) gerado pelo Finup.',
    relacaoComTela: 'Mostra antes uma prévia (origem, data, versão, quantidades e avisos) e pede para digitar RESTAURAR. É tudo ou nada: se algo falhar, nada muda. Usuários, senhas e a identidade do ambiente ficam como estão. Arquivo de versão antiga do backup é recusado.',
    obrigatorio: false,
  },
  'backup.confirmacao': {
    titulo: 'Confirmação da restauração',
    paraQueServe: 'Evita restaurar por engano: a restauração troca os dados do ambiente.',
    relacaoComTela: 'O botão Restaurar só libera com a palavra RESTAURAR, em maiúsculas.',
    obrigatorio: true,
  },
  'backup.conferir': {
    titulo: 'Conferir com um arquivo',
    paraQueServe: 'Compara um arquivo de backup com o banco atual, tabela por tabela, sem mudar nada.',
    relacaoComTela: 'Mostra, para cada tabela, a quantidade no arquivo e no banco e se o conteúdo é igual (ok) ou diferente.',
    obrigatorio: false,
  },
  'backup.pasta': {
    titulo: 'Pasta de backup',
    paraQueServe: 'Pasta deste computador onde o backup ao sair é gravado.',
    relacaoComTela: 'Fica guardada neste navegador, para o seu usuário. Se o navegador pedir permissão de novo, ela é pedida no clique do "Sim" ao sair. Se o navegador recusar a permissão de gravar na pasta (no Chrome: cadeado → Configurações do site → Edição de arquivos), a tela avisa e o backup ao sair vai para a pasta Downloads.',
    obrigatorio: false,
  },
  'backup.perguntarAoSair': {
    titulo: 'Perguntar ao sair',
    paraQueServe: 'Liga ou desliga a pergunta "Deseja fazer backup antes de sair?" no botão Sair deste computador.',
    relacaoComTela: 'Sempre: pergunta a cada Sair. Nunca: sai direto. Ao escolher a pasta de backup, passa para Sempre (se você ainda não tinha escolhido). No celular nunca pergunta.',
    obrigatorio: false,
  },
  'aplicativo.usar': {
    titulo: 'Usar como aplicativo',
    paraQueServe: 'Mostra se o Finup está instalado como aplicativo neste computador e como instalar.',
    relacaoComTela: 'Instalado, o Finup abre na própria janela, com ícone na barra de tarefas (ou no Dock, no Mac). O Microsoft Edge e o Google Chrome instalam e gravam o backup ao sair numa pasta; outros navegadores não instalam e mandam o backup para a pasta Downloads. "Mostrar o aviso de novo" desfaz o "Não mostrar mais" do aviso.',
    obrigatorio: false,
  },
  'aplicativo.aviso': {
    titulo: 'Aviso "Use o Finup como aplicativo"',
    paraQueServe: 'Sugere instalar o Finup neste computador ou usar um navegador que tenha todos os recursos.',
    relacaoComTela: 'Aparece no máximo uma vez a cada 7 dias, só no computador e fora do aplicativo instalado, e nunca por cima de um guia. "Agora não" fecha até a próxima vez; "Não mostrar mais" desliga (Configurações → Geral → Usar como aplicativo reativa). Depois de instalado, não aparece mais.',
    obrigatorio: false,
  },
  'atualizacao.aviso': {
    titulo: 'Aviso "Há uma atualização do Finup"',
    paraQueServe: 'Avisa que há uma versão nova do Finup e pergunta se você quer atualizar agora.',
    relacaoComTela: '"Atualizar agora" primeiro envia todas as suas alterações e só então atualiza; sem internet, não atualiza e explica, e nada se perde. "Mais tarde" lembra de novo em 4 horas ou na próxima vez que você abrir o Finup. Quando a atualização é necessária, não há "Mais tarde" e o aviso explica o motivo. O aviso espera você fechar um formulário aberto. No meio de uma importação, conciliação ou formulário não salvo, o aviso diz o que seria perdido: "Atualizar depois" espera você terminar (o aviso volta com "Pronto!") e "Atualizar mesmo assim" pede confirmação. Depois de atualizar, você volta para a mesma tela.',
    obrigatorio: false,
  },
  'novidades.janela': {
    titulo: 'O que mudou no Finup',
    paraQueServe: 'Mostra as novidades das versões que você ainda não viu.',
    relacaoComTela: 'Aparece depois de uma atualização, uma vez por versão, em qualquer aparelho em que você entrar. "Entendi" marca como vistas. O histórico completo fica em Ajuda → Novidades.',
    obrigatorio: false,
  },
  'novidades.historico': {
    titulo: 'Novidades',
    paraQueServe: 'O que mudou em cada versão do Finup, da mais nova para a mais antiga.',
    relacaoComTela: 'É a mesma lista da janela "O que mudou no Finup", completa. Itens marcados "para administradores" só aparecem para quem é administrador.',
    obrigatorio: false,
  },
  'backup.manter': {
    titulo: 'Backups a manter na pasta',
    paraQueServe: 'Quantos backups deste ambiente ficam guardados na pasta.',
    relacaoComTela: 'Ao gravar um novo, os mais antigos do Finup deste ambiente além dessa quantidade são apagados. Nenhum outro arquivo da pasta é tocado.',
    obrigatorio: false,
  },
  'ajusteSaldo.grupo': {
    titulo: 'Grupo de contas',
    paraQueServe: 'Grupo cujo saldo será conferido com o saldo real.',
    relacaoComTela: 'O grupo precisa ter conta âncora (Configurações › Grupos de contas). É o saldo inicial dela que é corrigido.',
    obrigatorio: true,
  },
  'ajusteSaldo.data': {
    titulo: 'Data de referência',
    paraQueServe: 'Dia do saldo real que você está informando.',
    relacaoComTela: 'O saldo calculado do grupo nesta data é comparado com o esperado.',
    obrigatorio: true,
  },
  'ajusteSaldo.esperado': {
    titulo: 'Saldo esperado',
    paraQueServe: 'Saldo real do grupo na data, como no extrato.',
    relacaoComTela: '"Calcular diferença" mostra quanto falta; o saldo inicial da âncora só muda em "Confirmar ajuste".',
    obrigatorio: true,
  },

  // ── Identidade do ambiente ────────────────────────────────────────────────────────────────
  'identidade.nome': {
    titulo: 'Nome do ambiente',
    paraQueServe: 'De quem é o sistema.',
    relacaoComTela: 'Aparece no rodapé da barra lateral e no cabeçalho dos relatórios em Excel. Vazio: os relatórios usam o nome do usuário logado.',
    obrigatorio: false,
  },
  'identidade.frase': {
    titulo: 'Frase do ambiente',
    paraQueServe: 'Frase exibida no cabeçalho dos relatórios.',
    relacaoComTela: 'Vazia: a linha da frase não aparece.',
    obrigatorio: false,
  },

  // ── Tipos de documento ────────────────────────────────────────────────────────────────────
  'tipoDocumento.nome': {
    titulo: 'Nome',
    paraQueServe: 'Nome do tipo de documento.',
    relacaoComTela: 'Aparece no seletor de tipo de documento de agendamentos e lançamentos.',
    obrigatorio: true,
  },
  'tipoDocumento.sigla': {
    titulo: 'Sigla',
    paraQueServe: 'Abreviação curta, em maiúsculas.',
    relacaoComTela: 'É o selo na coluna "Doc." do Fluxo de Caixa e de Agendamentos.',
    obrigatorio: true,
  },
  'tipoDocumento.natureza': {
    titulo: 'Natureza',
    paraQueServe: 'Em quais itens o tipo é oferecido: a pagar, a receber ou ambos.',
    relacaoComTela: 'O seletor de tipo só mostra os que combinam com o item (despesa ou receita).',
    obrigatorio: true,
  },
  'tipoDocumento.cor': {
    titulo: 'Cor',
    paraQueServe: 'Cor do selo do tipo.',
    relacaoComTela: 'O selo ao lado mostra como fica.',
    obrigatorio: false,
  },

  // ── Usuários ──────────────────────────────────────────────────────────────────────────────
  'usuario.nome': {
    titulo: 'Nome',
    paraQueServe: 'Nome da pessoa.',
    relacaoComTela: 'Aparece no menu do usuário e no histórico de alterações.',
    obrigatorio: true,
  },
  'usuario.username': {
    titulo: 'Usuário',
    paraQueServe: 'Nome de acesso para entrar no sistema.',
    relacaoComTela: 'Fica em minúsculas e não muda depois de criado.',
    obrigatorio: true,
  },
  'usuario.email': {
    titulo: 'E-mail',
    paraQueServe: 'E-mail da pessoa.',
    relacaoComTela: 'Também serve para entrar (usuário ou e-mail).',
    obrigatorio: true,
  },
  'usuario.senha': {
    titulo: 'Senha',
    paraQueServe: 'Senha de acesso, com no mínimo 8 caracteres.',
    relacaoComTela: 'Obrigatória ao criar. Na edição, em branco mantém a atual; preenchida, redefine a senha.',
    obrigatorio: true,
  },
  'usuario.confirmar': {
    titulo: 'Confirmar senha',
    paraQueServe: 'Repita a senha para evitar erro de digitação.',
    relacaoComTela: 'Precisa ser igual à senha.',
    obrigatorio: true,
  },
  'usuario.nivel': {
    titulo: 'Nível de acesso',
    paraQueServe: 'O que a pessoa pode ver e fazer.',
    relacaoComTela: 'Administrador: tudo. Operador: inclui, edita e exclui, sem usuários nem configurações do sistema. Consulta: só vê. Personalizado: abre a grade de permissões por módulo.',
    obrigatorio: true,
  },
  'usuario.permissoes': {
    titulo: 'Permissões por módulo',
    paraQueServe: 'Ver, incluir, editar e excluir em cada módulo, no nível personalizado.',
    relacaoComTela: 'Marcar incluir, editar ou excluir marca Ver; desmarcar Ver desmarca o resto.',
    obrigatorio: false,
  },
  'usuario.perfisTodos': {
    titulo: 'Todos os perfis',
    paraQueServe: 'Libera todos os perfis (CPF/CNPJ) para a pessoa.',
    relacaoComTela: 'Desmarcado, abre a lista para escolher os perfis permitidos.',
    obrigatorio: false,
  },
  'usuario.perfis': {
    titulo: 'Perfis permitidos',
    paraQueServe: 'Perfis que a pessoa pode ver e gravar.',
    relacaoComTela: 'Ela só vê e grava contas, lançamentos e agendamentos dos perfis marcados.',
    obrigatorio: false,
  },
  'usuario.ativo': {
    titulo: 'Ativo',
    paraQueServe: 'Permite ou bloqueia a entrada da pessoa.',
    relacaoComTela: 'Inativo não entra no sistema; o histórico dele continua. Você não pode desativar o próprio usuário.',
    obrigatorio: false,
  },
  'usuario.trocarSenha': {
    titulo: 'Trocar senha no próximo login',
    paraQueServe: 'Obriga a pessoa a definir uma senha nova ao entrar.',
    relacaoComTela: 'No próximo login aparece a tela "Defina uma nova senha" antes de qualquer outra.',
    obrigatorio: false,
  },
  'redefinirSenha.nova': {
    titulo: 'Nova senha',
    paraQueServe: 'Senha nova para este usuário, com no mínimo 8 caracteres.',
    relacaoComTela: 'Substitui a senha atual dele sem pedir a antiga.',
    obrigatorio: true,
  },
  'redefinirSenha.confirmar': {
    titulo: 'Confirmar',
    paraQueServe: 'Repita a nova senha.',
    relacaoComTela: 'Precisa ser igual à nova senha.',
    obrigatorio: true,
  },
  'redefinirSenha.trocar': {
    titulo: 'Pedir para trocar no próximo login',
    paraQueServe: 'Faz a pessoa escolher a própria senha ao entrar.',
    relacaoComTela: 'Recomendado: assim só ela conhece a senha que vai usar.',
    obrigatorio: false,
  },

  // ── Trocar minha senha ────────────────────────────────────────────────────────────────────
  'trocarSenha.atual': {
    titulo: 'Senha atual',
    paraQueServe: 'A senha que você usa hoje.',
    relacaoComTela: 'Confirma que é você antes de trocar.',
    obrigatorio: true,
  },
  'trocarSenha.nova': {
    titulo: 'Nova senha',
    paraQueServe: 'A senha que passa a valer, com no mínimo 8 caracteres.',
    relacaoComTela: 'Precisa ser diferente da atual. Vale no próximo login.',
    obrigatorio: true,
  },
  'trocarSenha.repetir': {
    titulo: 'Repita a nova senha',
    paraQueServe: 'Confirma a nova senha.',
    relacaoComTela: 'Precisa ser igual à nova senha.',
    obrigatorio: true,
  },

  // ── Feriados ──────────────────────────────────────────────────────────────────────────────
  'feriado.ligado': {
    titulo: 'Feriado ligado',
    paraQueServe: 'Liga ou desliga o feriado.',
    relacaoComTela: 'Feriado ligado é descontado nos envelopes diários com "Descontar feriados". Desligado, conta como dia comum.',
    obrigatorio: false,
  },
  'feriado.nome': {
    titulo: 'Nome do feriado',
    paraQueServe: 'Nome do feriado estadual ou municipal.',
    relacaoComTela: 'Aparece na lista do ano.',
    obrigatorio: true,
  },
  'feriado.abrangencia': {
    titulo: 'Abrangência',
    paraQueServe: 'Se o feriado é municipal ou estadual.',
    relacaoComTela: 'Só identificação na lista.',
    obrigatorio: true,
  },
  'feriado.data': {
    titulo: 'Data do feriado',
    paraQueServe: 'Dia do feriado.',
    relacaoComTela: 'Com "Repete todo ano", vale o mesmo dia e mês nos anos seguintes.',
    obrigatorio: true,
  },
  'feriado.todoAno': {
    titulo: 'Repete todo ano',
    paraQueServe: 'Faz o feriado se repetir no mesmo dia e mês.',
    relacaoComTela: 'Desmarcado, vale só no ano da data.',
    obrigatorio: false,
  },

  // ── Apelidos da IA ────────────────────────────────────────────────────────────────────────
  'apelido.termo': {
    titulo: 'Termo',
    paraQueServe: 'Palavra que você usa com o Assistente.',
    relacaoComTela: 'Quando o Assistente encontra este termo, usa o cadastro de "Vai para". Grava ao sair do campo.',
    obrigatorio: true,
  },
  'apelido.destino': {
    titulo: 'Vai para',
    paraQueServe: 'Cadastro que o termo representa: categoria, conta, favorecido ou descrição de fatura.',
    relacaoComTela: 'Trocar grava na hora e vale nas próximas mensagens ao Assistente.',
    obrigatorio: true,
  },

  // ── De-para de importação ─────────────────────────────────────────────────────────────────
  'depara.origem': {
    titulo: 'Texto no arquivo',
    paraQueServe: 'Categoria como ela vem no arquivo importado.',
    relacaoComTela: 'Em Importar lançamentos, a linha com esta categoria recebe a categoria do Finup escolhida.',
    obrigatorio: true,
  },
  'depara.categoria': {
    titulo: 'Categoria do Finup',
    paraQueServe: 'Categoria que substitui o texto do arquivo.',
    relacaoComTela: 'Vale nas próximas importações. Trocar numa linha da lista grava na hora.',
    obrigatorio: true,
  },

  // ── Kit de categorias ─────────────────────────────────────────────────────────────────────
  'kitCategorias.selecionar': {
    titulo: 'Categorias do kit',
    paraQueServe: 'Categorias padrão que ainda faltam no seu cadastro.',
    relacaoComTela: 'As marcadas são criadas em "Adicionar", no grupo indicado. As que já existem não aparecem.',
    obrigatorio: false,
  },

  // ── Guias das telas ───────────────────────────────────────────────────────────────────────
  'guias.ligados': {
    titulo: 'Guias do sistema',
    paraQueServe: 'Liga os tours das telas e o botão "?".',
    relacaoComTela: 'Desligados, nenhum tour abre sozinho e o "?" não aparece nas telas. As escolhas de cada tela ficam guardadas para quando religar.',
    obrigatorio: false,
  },
  'guias.jornada': {
    titulo: 'Jornada guiada',
    paraQueServe: 'Passo a passo para conhecer o Finup, com o progresso no Painel.',
    relacaoComTela: 'Desligada, não aparecem as boas-vindas nem o painel de progresso.',
    obrigatorio: false,
  },
  'guias.ajudaCampos': {
    titulo: 'Mostrar ícones de ajuda nos campos',
    paraQueServe: 'Mostra o ⓘ ao lado dos campos.',
    relacaoComTela: 'Desligado, o ⓘ some, mas a tecla F1 continua abrindo a ajuda do campo.',
    obrigatorio: false,
  },
  'guias.oferta': {
    titulo: 'Oferecer o preenchimento guiado',
    paraQueServe: 'Oferece o guia na primeira vez que um formulário é aberto.',
    relacaoComTela: 'Desligado, a oferta não aparece; o botão "Preencher com guia" continua no formulário.',
    obrigatorio: false,
  },

  // ── Agenda no celular ─────────────────────────────────────────────────────────────────────
  'agendaCelular.tipos': {
    titulo: 'Mostrar na agenda',
    paraQueServe: 'Quais calendários assinar: despesas, receitas ou os dois.',
    relacaoComTela: 'Cada escolha vira um calendário separado ("Finup Despesas", "Finup Receitas"). Com a agenda criada, mudar aqui atualiza o mesmo link.',
    obrigatorio: true,
  },
  'agendaCelular.valores': {
    titulo: 'Mostrar valores',
    paraQueServe: 'Mostra ou esconde os valores nos eventos da agenda.',
    relacaoComTela: 'Não: o evento mostra só a descrição. Com a agenda criada, mudar aqui atualiza o mesmo link.',
    obrigatorio: true,
  },
}

export const formularios = {}
