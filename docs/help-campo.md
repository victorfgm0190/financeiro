# Help de campo (F1 / ⓘ)

Camada de ajuda por **campo**, ao lado do help de tela (`src/lib/ajudaTelas.js`, botão "?") e da jornada guiada.

## Conteúdo — `src/help/`

- Um arquivo por tela (`contratos.js`, `agendamentos.js`, …) exportando `campos` e `formularios`; `index.js` junta tudo.
- Campo `'tela.campo'`: `{ titulo, paraQueServe, relacaoComTela, oQueAconteceAoSalvar?, obrigatorio, quandoUsar?, atencao?, exemplo?, pendente? }`.
  - `paraQueServe` é o texto curto do ícone ⓘ (1–2 frases, sem exemplo).
  - `relacaoComTela` é o principal: como o campo mexe nos outros e no resultado.
  - `pendente`: conteúdo só migrado, falta completar.
- Formulário: `{ objetivo, preRequisitos: [{ id, texto }], ordemCampos, resumoAoSalvar }`.
- `src/lib/helpCampos.js` é só um adaptador (`HELP_CAMPOS`, `textoHelpCampo`) que lê de `src/help`.

## Marcação na tela

- `data-help-id="tela.campo"` no campo ou no contêiner dele (o help acha pelo `closest`).
- Componentes de campo aceitam `helpId`: `InputMoeda`, `CampoValor` e `CategorySelect` (contêiner `display: contents`).
- O `Campo` do wizard de contrato tem dois props:
  - `help`: ⓘ + F1;
  - `ajuda`: só F1, quando a explicação já está escrita na tela.
- `data-help-form="<form>"` no contêiner do formulário (para a F1 sem campo e para o "Preencher com guia").

## Comportamento

- **F1** (`src/help/teclaF1.js`): ouvinte global na captura, sempre `preventDefault` + `stopPropagation`.
  - Campo com foco: help do campo.
  - Sem campo, dentro de um formulário: help do formulário.
  - Fora de formulário: o "?" da tela (evento `finup:ajuda-tela`). Sem ele, o painel aponta para a Central de Ajuda.
  - Com modificador: nada.
  - No Mac: fn+F1.
- **Painel** (`HelpCampoPainel`, montado no App):
  - Computador: drawer lateral que não bloqueia. O foco fica no campo, o painel acompanha a troca de campo e o Esc fecha só ele.
  - Celular: bottom sheet aberto pelo ⓘ (área de toque de 44px). Tocar no campo só abre o teclado.
  - Rodapé: "Ajuda da tela" e "Preencher com guia" (evento `finup:preencher-guia`, atendido pelo formulário guiado).
- **ⓘ**:
  - Passar o mouse mostra o texto curto.
  - Clicar ou tocar abre o painel completo.
  - Não colocar ⓘ quando a explicação já está escrita visível ao lado do campo (a F1 continua funcionando).

## Atalhos (blindagem)

- F1 é fixa: aparece em Configurações › Atalhos como linha com cadeado e nenhum atalho pode usá-la.
  - Na captura de um atalho, a F1 chega à tela de captura e é recusada, sem abrir a ajuda.
- `RESERVED_KEYS` (`src/lib/atalhos/combinacao.js`) são recusadas com mensagem, na tela e na API:
  - F3, F5, F6, F7, F11, F12;
  - Ctrl+R/W/T/N/L/P/F/H/J/D/Tab;
  - Ctrl+Shift+R/T/N;
  - Alt+F4;
  - Alt+setas;
  - os menus do navegador: Alt+F, Alt+D, Alt+E.
- O atalho precisa de Ctrl ou Alt. Sozinhas, só F2, F4, F8, F9 e F10.
- Sem duplicados: a API recusa com 409 a combinação já usada no mesmo contexto ou numa ação global.
- O motor de atalhos:
  - não dispara durante composição de texto (IME);
  - com foco em campo de digitação, só dispara com Ctrl ou Alt (como o Alt+G de gravar);
  - nunca recebe a F1.
- Migração: ao carregar, atalho gravado que viola as regras volta ao padrão. Se o padrão estiver ocupado, é desativado. A correção é gravada no banco e mostra um aviso único (`AvisoAtalhosMigrados`).

## Preenchimento Guiado (Etapa 4)

- Estado e regras puras: `src/help/guiaPreenchimento.js`. Balão: `GuiaPreenchimento` (montado no App).
- `BotaoPreencherGuia` vai dentro do contêiner `data-help-form`. Só aparece com roteiro na base (`formularios[form]`).
  - Props:
    - `resumo()`: linhas com os dados reais;
    - `funcao`: os pré-requisitos de `src/lib/prerequisitos.js`;
    - `oferecer`;
    - `onFechar`.
  - Atende o rodapé do help de campo (`finup:preencher-guia`).
- O botão de salvar leva `data-help-salvar="<form>"`. No wizard, o de avançar etapa leva `data-help-avancar="<form>"`.
- Fluxo:
  1. Pré-requisitos, só se faltar algum. "Cadastrar agora" fecha o formulário e abre o Faça comigo; no fim, "Voltar para …" reabre o formulário já guiado.
  2. Objetivo.
  3. Todos os campos marcados com `data-help-id` (com conteúdo na base), na ordem visual da tela (de cima para baixo, da esquerda para a direita; vale no celular):
     - pula os que não estão na tela;
     - põe o foco no campo;
     - acompanha a troca de etapa do wizard.
     - `ordemCampos` não decide a ordem.
     - O teste `camposDoGuia` garante que todo campo visível tem passo (`controlesSemPasso`).
  4. O que a validação do formulário barra.
  5. "Ao salvar, vai acontecer…".
  6. Acende o Salvar.
  7. Pronto.
- "Obrigatório" e o bloqueio do Próximo vêm da validação do próprio formulário, via prop `validacao` (`erros()`, `obrigatorio(id)`):
  - agendamento: `errosDoAgendamento`, a mesma do Salvar;
  - contrato: `errosDaEtapa`, a mesma do Avançar. O fim da vigência é obrigatório só sem "Sem data de fim".
  - Sem `validacao`, vale a base mais campo vazio.
  - Avançar/Salvar barrado: o guia volta ao primeiro campo com erro.
- Teclas e botões:
  - Enter avança, exceto com lista aberta ou em texto longo.
  - Seletor próprio (`aria-haspopup`) fechado: com valor (`data-preenchido="sim"`), Enter avança; vazio, Enter abre a lista.
  - Botão de escolha (`aria-pressed`): Enter no já escolhido avança.
  - Liga/desliga (`role="switch"`): Enter avança.
  - Esc sai; com o help de campo aberto, o Esc é dele.
  - Próximo segura um obrigatório vazio; Pular passa direto.
- Faça comigo (Sim no fim do tour, Fazer agora da jornada e dos pré-requisitos): quando a tarefa abre um formulário com roteiro, o guia assume. Ao salvar, a tarefa conta como concluída.
- Oferta discreta na 1ª abertura de cada formulário novo: Sim / Não / Não perguntar mais.
  - A resposta é gravada por usuário: `progresso.guiaOfertas.<form>` e `progresso.guiaOfertaDesligada` (POST `guiaOferta`).
- O guia NUNCA preenche nem salva nada.

## Preferências (Etapa 5) — Configurações › Geral › Guias das telas

- "Mostrar ícones de ajuda nos campos" (`ajuda_campos`): desligado, o ⓘ some, mas a F1 continua abrindo a ajuda do campo.
- "Oferecer o preenchimento guiado": `progresso.guiaOfertaDesligada`, o mesmo do "Não perguntar mais" da oferta.
  - O botão "Preencher com guia" fica sempre no formulário.
- "Reativar ofertas de guia": apaga `progresso.guiaOfertas` e religa a oferta. Cada formulário volta a oferecer uma vez.
- Tudo por usuário em `boas_vindas_usuario` via `/api/boas-vindas` (POST `guiaOfertaLigada` / `guiaOfertasReativar`). Sem migração: usa colunas que já existem.

## Conferência — `npm run help:check` (Etapa 6)

`scripts/help-check.mjs` lê o JSX de `src/` (espree) e lista, saindo com código 1 se houver algo:

1. **Campo sem `data-help-id`** — `input` (exceto hidden/submit/button), `select`, `textarea`, os
   campos do app (`SearchableSelect`, `InputMoeda`, `DateInput`, `CategorySelect`,
   `TipoDocumentoSelect`, `CampoValor`, `FavorecidoAutocomplete`, `TransferenciaPerfisCategorias`,
   `FimRepeticao`), `role="switch"`, `aria-haspopup="listbox"` e componentes do próprio arquivo que
   desenham um campo sem cobri-lo — dentro de um elemento com `data-help-form` e fora de um
   contêiner `data-help-id` / `data-guia-fora`. Componente que repassa o id (`help`, `ajuda` ou
   `helpId` com um id `tela.campo`) conta como contêiner.
2. **Id sem conteúdo** — `data-help-id`, `<HelpCampo campo>` ou `help/ajuda/helpId` que não existe
   em `src/help/`.
3. **Conteúdo pendente** — campo da base com `pendente` ou sem `relacaoComTela`.

O que vem de outro componente (não visível no JSX do arquivo) é conferido em tempo de execução:
em `npm run dev`, `src/help/avisoDev.js` (instalado no `main.jsx`, fora do build de produção)
avisa no console `[help:check] …`, uma vez por item, campo sem passo dentro de `data-help-form` e
`data-help-id` sem conteúdo. `src/components/Ajuda/camposDasTelas.test.jsx` roda o check e audita
o DOM de Contas (todos os tipos) e Lançamentos (rápido e completo).

Telas completas: Contratos, Agendamentos, Contas (`data-help-form="conta"`), Lançamentos
(`lancamento`), Categorias (`categoriaGrupo`, `categoria`), Perfis (`perfil`), Favorecidos
(`favorecidoMescla`, `favorecidoRenomear`) e Reservas (`reserva`). Só os formulários de Contratos e
Agendamentos têm roteiro de Preenchimento Guiado (`formularios`); os demais têm F1/ⓘ em todo campo.

### Ajustes pós-Etapa 6

- **Foco e balão do ⓘ:** o foco inicial do `Modal` vai para o primeiro focável que não é um ⓘ.
  O balão abre só com hover, clique ou quando o usuário chega no ⓘ pelo Tab; foco programático
  (modal abrindo, guia, atalho) não abre. Teste: `src/components/shared/HelpCampoFoco.test.jsx`.
- **Listas editáveis de Configurações › Cadastros:** controles sem rótulo ganharam `data-help-id`
  no próprio controle e o ⓘ numa legenda acima da lista. São eles:
  - Categorias (`data-help-form="categoriaLista"`): perfis, grupo, grupo gerencial,
    investimento, espelho, conta do espelho, renomear grupo e filtro de perfil.
  - Centros de custo (`centroCusto`).
  - Grupos de contas (`grupoConta`): tipo, nome, âncora e inibir.
  - Favorecidos (`favorecidos`): busca, seleção e sincronizar.

  O conteúdo está em `categorias.js`, `favorecidos.js` e `cadastros.js`. O `help:check` passou a
  incluir `PerfisMultiSelect` como campo.

## Etapa 3 — formulários que faltavam (em blocos)

### Bloco 1 — Patrimônio

- O conteúdo está em `src/help/patrimonio.js`.
- Formulários (`data-help-form`), com todo campo coberto:
  - `financiamento` (Criar financiamento);
  - `aberturaFinanciamento` (Histórico de abertura; usa os ids `financiamento.abertura*`);
  - `consorcio` (dados e cotas);
  - `eventoConsorcio` (contemplação, reajuste, venda e uso da carta);
  - `planoVenda` (Plano de venda);
  - `pagarParcela`;
  - `baixaBem` (Marcar como paga / crédito);
  - `vendaCota`;
  - `vendaBem`;
  - `entradaBem` (Registrar entrada à vista, com trade-in);
  - `parametrizarBem`;
  - `favorecidoFinanciamento`;
  - `receitaBem` (Ligar uma receita ao bem);
  - `atualizarValor` (Patrimônio e Contas);
  - `valoresBem` (Valores do bem).
- `valoresBem` fica em `PatrimonioEditavel.jsx`, componente protegido. A mudança foi autorizada pelo usuário em 09/11/2026 **somente** para a marcação de ajuda (`data-help-form`, `data-help-id`, ⓘ). Nenhum cálculo, gravação, estado ou fluxo foi alterado.
- Teste: `src/components/Patrimonio/ajudaCampos.test.jsx`. Ele audita o DOM dos formulários, inclusive os campos que só aparecem depois de uma escolha (terceiro + receita, trade-in, financiamento aberto na venda, custos com categoria).

### Bloco 2 — Fluxo de Caixa e Provisão

- O conteúdo está em `src/help/fluxo.js`.
- Formulários (`data-help-form`):
  - `efetivarProvisorio`: como efetivar, data do lançamento e categoria;
  - `mudarData`: nova data, simular ou gravar, e quais ocorrências;
  - `provisao`: Provisão nova e editar;
  - `provisorio`: Provisório do Fluxo por Conta e do Fluxo de Caixa Futuro.
- Componentes compartilhados:
  - `CampoParcelamento` ganhou `helpId`; o padrão continua `agendamento.parcelasPorOcorrencia`, e a Provisão usa `provisao.parcelasPorOcorrencia`;
  - `PerguntaFluxoPrincipal` ganhou `helpId` opcional, que mostra o ⓘ.
- As escolhas por rádio (efetivar como, onde vale a nova data, quais ocorrências) ganharam um rótulo com ⓘ e `role="radiogroup"`.
- O Tipo do provisório ganhou `aria-pressed`.
- Teste: `src/components/CashFlow/ajudaCampos.test.jsx`.

### Bloco 3 — Contratos

- O conteúdo está em `src/help/contratosAcoes.js`. O wizard da ficha continua em `contratos.js`.
- Formulários (`data-help-form`):
  - `vinculoContrato`: agendamentos e lançamentos detectados;
  - `vincularPagamento`;
  - `reajusteContrato` e `reajusteRepasse`;
  - `creditoManual`, `trocarDestino` e `justificarDiferenca`;
  - `composicaoBoleto` e `composicaoRecibo`;
  - `regraItem`: Regras de itens, com o teste;
  - `renovarContrato` e `rescindirContrato`;
  - `buscarRepasse`.
- Os Encargos e descontos na parcela usam os ids `encargoParcela.*` dentro do formulário `contrato`.
- Linhas editáveis sem rótulo (itens do boleto e do recibo, encargos, lançamentos para vincular) recebem `data-help-id` no próprio controle e um ⓘ numa legenda acima da lista. É o mesmo padrão das listas de Cadastros.
- Placeholders com exemplo passaram a descrever a função. São eles: os textos para colar do boleto, do recibo e do teste de regras, o motivo do crédito e a descrição do encargo.
- Teste: `src/components/Contratos/ajudaCampos.test.jsx`.

### Bloco 4 — Configurações e Importar

- O conteúdo está em `src/help/configuracoes.js` e `src/help/importar.js`.
- **Configurações** (`data-help-form`):
  - `periodo`: tipo de mês, dia de início, pergunta da virada e dias do aviso de caixa;
  - `estornos` e `iof`;
  - `classificacao` e `regraGerencial`: as duas têm legenda com ⓘ;
  - `controleGerencial` (a chave) e `grupoGerencial` (novo e editar);
  - `backup`: importar o arquivo;
  - `ajusteSaldo`: Manutenção › Ajuste de saldo por grupo;
  - `identidade`;
  - `tipoDocumento`: novo e editar;
  - `usuario` e `redefinirSenha`: inclui a grade de permissões e os perfis permitidos;
  - `trocarSenha`: a janela e a tela de primeiro acesso;
  - `feriados`, `apelidos` e `depara`: listas com ⓘ no cabeçalho ou numa legenda;
  - `kitCategorias`;
  - `guias`;
  - `agendaCelular`;
  - `dindin`: só no ambiente principal.
- **Importar** (`data-help-form`):
  - `importarLanc`: Importar lançamentos;
  - `importarFatura`:
    - passo inicial: cartão, mês, arquivo e conciliar;
    - revisão: as células têm `data-help-id`, e a legenda acima da tabela traz o ⓘ de cada coluna. A legenda vale para desktop e celular, onde a tabela vira cartões;
  - `loteFatura`: Preencher em lote;
  - `catGer`: Categoria → Gerencial;
  - `estornoConfig`: Estornos detectados;
  - `conciliacao`: fatura encerrada, importar ou ignorar, manter ou excluir;
  - `mapeador`: Mapear arquivo do banco;
  - `contaCorrente`: aba Dindin, só no ambiente principal.
- Componentes que ganharam `helpId`:
  - `DropZone` (ImportPanel);
  - `colSelect` (mapeador);
  - `SelectCategoria` (ParametrizarBem, bloco 1).
- O ⓘ dentro de área clicável (zona do arquivo, rótulo de checkbox) não aciona o controle: o `HelpCampo` para a propagação do clique.
- Placeholders com exemplo passaram a descrever a função. São eles: a sigla do tipo de documento, o nome do feriado, o nome do modelo de importação e o "Contém" da classificação.
- Atalhos não entrou: a tela só tem botões de gravar a combinação, sem campo de digitação.
- Testes:
  - `src/components/Settings/ajudaCampos.test.jsx`;
  - `src/components/Import/ajudaCampos.test.jsx`;
  - um caso novo em `AgendaCelularPanel.test.jsx`.

