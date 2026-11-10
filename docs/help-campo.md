# Help de campo (F1 / ⓘ)

Camada de ajuda por **campo**, ao lado do help de tela (`src/lib/ajudaTelas.js`, botão "?") e da jornada guiada.

## Conteúdo — `src/help/`

- Um arquivo por tela (`contratos.js`, `agendamentos.js`, …) exportando `campos` e `formularios`; `index.js` junta tudo.
- Campo `'tela.campo'`: `{ titulo, paraQueServe, relacaoComTela, oQueAconteceAoSalvar?, obrigatorio, quandoUsar?, atencao?, exemplo?, pendente? }`.
  - `paraQueServe` é o texto curto do ícone ⓘ (1–2 frases, sem exemplo).
  - `relacaoComTela` é o principal: como o campo mexe nos outros e no resultado.
  - `pendente`: conteúdo só migrado, falta completar.
- Formulário: `{ objetivo, preRequisitos: [{ id, texto }], ordemCampos, resumoAoSalvar }`.
- O texto curto do ⓘ vem de `textoCurtoDoCampo(id)` (`src/help/index.js`), que devolve o `paraQueServe`.
  O adaptador antigo `src/lib/helpCampos.js` foi removido na Etapa 4.

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

## Etapa 3 — formulários que faltavam (em blocos) — concluída

Concluída no bloco 5b (09/11/2026). Ficam fora, por decisão: Controle de Clientes, Consumo de IA e a caixa
de mensagem e os anexos do Assistente.

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

### Bloco 5a — demais formulários que gravam

- O conteúdo está em `src/help/operacoes.js` e `src/help/lancamentosModais.js`.
- **Agendamentos:**
  - `efetivarProvisao`;
  - `registrarLote`: legenda com valor e data por item, mais o valor transferido de fato;
  - seleção em lote e tipo de documento em massa (`agendamentoLote.*`);
  - `ocorrencia`: pular, data e valor;
  - `executarGerenciais`.
- **Reservas:**
  - saldo real e "Distribuir" no Resumo;
  - `reservaSaldoInicial`: o popover do saldo inicial;
  - `ajusteReserva`: novo e editar;
  - período fechado do Histórico;
  - `viradaDecisao`: a decisão da diferença na virada assistida.
- **Envelopes** (`envelope`) e **Orçamento** (`orcamento`).
- **Cartão de Crédito:** `pagamentoFatura` e a seleção de lançamentos (`lancamentoLote.selecionar`, também no extrato da conta).
- **Contas:**
  - Gerenciar grupos: `grupoConta`, com os mesmos ids de Cadastros;
  - `rendimento`.
- **Dívidas:** `planoDivida` e `pagamentoDivida`.
- **Modais de lançamento:**
  - `rateio`;
  - `edicaoLote`;
  - `reconciliarLote`;
  - `vinculoAgendamento` (lançamento × agendamento);
  - `escopoSerie`, nas três variantes;
  - `vinculoLancamento`;
  - valor em moeda estrangeira;
  - `duplicar`;
  - `resgate`.
- **Cadastros soltos e avisos:**
  - `perfilRapido`;
  - "onde renomear" do favorecido;
  - `aceitarSaldo`;
  - `inicioMes`.
- **Fluxo de Caixa:**
  - `consultaFluxo`: consulta salva;
  - `aplicarData` no Fluxo por Conta, que usa `mudarData.escopo`.
- **Celular:** `inicioCards` (Personalizar cards do Início).
- Teste: `src/components/Ajuda/camposBloco5a.test.jsx`.
- Ficam para o bloco 5b: filtros e busca, prévias do Assistente e telas sem login.

### Bloco 5b — busca, filtros, prévias do Assistente e telas sem login

- Texto curto (uma linha em `paraQueServe` e em `relacaoComTela`).
- **Busca e filtros** (`src/help/filtros.js`):
  - Agendamentos: `filtrosAgendamentos` (período, cartão e o painel de filtros);
  - Lançamentos e extrato: `filtrosLancamentos` em `LancamentoFiltros` e nos filtros de coluna do
    extrato (desktop). A linha não tem rótulo: uma legenda com ⓘ fica acima, e a altura da linha não muda.
    Quem passa controles em `extra` informa a legenda em `legendaExtra`;
  - `ValueFilterDropdown` aceita `helpId` (no contêiner);
  - seletor de cartão (`seletorCartao`), busca global (`buscaGlobal`) e busca da Central de Ajuda (`buscaAjuda`);
  - relatórios: Demonstrativo, Fluxo por Conta (inclui a caixinha e a data de cada linha), Bens,
    Por favorecido, Rendimentos, Relatório da fatura, Extrato gerencial e o mês de Despesas por Categoria;
  - Fluxo de Caixa Futuro (`opcoesFluxo`): consulta, marcar todos, envelopes, reservas, evento no cálculo e
    pendências em atraso, no desktop e no celular; o nome da consulta no cartão usa `consultaFluxo.nome`;
  - Reservas: período do Fluxo Futuro (`periodoFluxoReservas`) e filtros do Razão (`filtrosRazao`);
  - Contratos (`filtrosContratos`); Patrimônio: "Mostrar vendidos" e a simulação de saída (`simulacaoSaida`).
- **Rendimentos:** a conferência com o informe da administradora grava e ganhou `informeAdm` (em
  `src/help/contratosAcoes.js`).
- **Prévias do Assistente** (`src/help/assistente.js`): agendamento, baixa, contrato, despesa, lote,
  compra em dólar, já na fatura, escolher conta e as consultas.
- **Telas sem login** (`src/help/acesso.js`): Login, Esqueci minha senha, Definir senha e Pedido de cadastro.
  Texto genérico, sem detalhe de segurança. O `HelpCampoPainel` (ⓘ e F1) também é montado no Login e
  nas páginas públicas (`src/App.jsx`).
- Teste: `src/components/Ajuda/camposBloco5b.test.jsx`.

## Etapa 4 do pacote pós-help — limpeza e revisão (09/11/2026)

- **title × ⓘ:** saiu o `title` (balão nativo) que repetia o texto do ⓘ do mesmo campo. Onde o campo não
  tinha outro nome acessível, o texto virou `aria-label`; em `<label>`/`<th>` com texto visível, só saiu.
  O `title` continua em botões só de ícone e onde explica um estado da linha (ex.: "Tirar este evento do
  cálculo"), que o ⓘ não diz.
- **Adaptador removido:** `src/lib/helpCampos.js` saiu. O texto curto do ⓘ vem de
  `textoCurtoDoCampo(id)` em `src/help/index.js`.
- **Placeholders:** descrevem a função do campo, sem exemplo nem dado regional (sem DDD fixo, sem
  "000.000.000-00"). Máscaras de formato digitado (DD/MM/AAAA, 0,00) continuam.
- **Telas sem login** (Login, Esqueci minha senha, Definir senha, Trocar senha, Pedido de cadastro): o
  painel é montado com `<HelpCampoPainel semLogin />` — sem "Ajuda da tela" nem Central de Ajuda (exigem
  login). F1 fora de campo mostra só a dica de usar o ⓘ/F1 nos campos.
- **Celular:** o ⓘ é inline e "colado" à última palavra do rótulo (`.help-campo-cola`, word joiner
  gerado por CSS em `src/index.css`): nunca fica sozinho na linha de baixo. O texto do rótulo não muda.
  Revisão feita no Chrome em 375 e 414 px (app com dados fictícios e `/api` simulada), sem rolagem
  lateral, ⓘ sobre campo ou botão de salvar fora da tela.

## Etapa 5 do pacote pós-help — "Preencher com guia" em Conta e Lançamento (10/11/2026)

- **Formulários:** Nova/Editar conta (`AccountForm`, `data-help-form="conta"`) e Novo/Editar lançamento
  (`TransactionForm`, `data-help-form="lancamento"` — Receita, Despesa e Transferência, no completo e no
  rápido do "+" do celular). Mesmo `BotaoPreencherGuia` e mesmo `GuiaPreenchimento` dos outros guias.
  - Roteiros na base: `formularios.conta` (`src/help/contas.js`) e `formularios.lancamento`
    (`src/help/lancamentos.js`), com objetivo, pré-requisitos, `ordemCampos` (na ordem da tela) e resumo.
  - Só os campos visíveis entram. Na conta, o tipo escolhido decide os seguintes (cartão: limite, dias,
    finais, câmbio, conta pagadora; bem/dívida: valor atual e aquisição; poupança e bem: investimento;
    conta corrente: Conta central). No lançamento, a aba decide (transferência: conta destino, fatura paga,
    reserva; cartão: fatura e parcelado; rateio; Repetir). Trocar o tipo ou a aba no meio do guia:
    se o campo atual some, o guia segue para o próximo campo ainda não visto da tela nova.
  - Validação do guia = a do Salvar: `errosDaConta` (nome; cartão: dias e finais; Patrimônio e
    investimento: categoria) e `errosDoLancamento` (valor, conta, conta destino, tipo de documento
    exigido, rateio que não fecha, categoria da reserva livre, função de reserva do grupo, e os campos
    com `required` do navegador, como a conta da classificação gerencial). Salvar barrado no meio do
    guia: ele vai ao primeiro campo que falta e mostra o aviso da validação.
  - Resumo com os dados reais (tipo, valor, contas, data, categoria/rateio, parcelas, agendamento).
  - Botão e oferta: só para quem pode gravar; a oferta só no formulário novo. Na prévia do Assistente
    (`destaques`/`onSalvo`) o botão não aparece: ela tem o próprio Confirmar.
  - Pré-requisito do lançamento: uma conta (`prerequisitos.js`). "Cadastrar agora" volta ao Novo
    lançamento de Lançamentos (`ABRIR_FORMULARIO.lancamento`).
  - "Dividir em categorias" e "Mais opções" nunca abrem sozinhos: o objetivo e o help da categoria dizem
    que existem. Tocar em "Mais opções" durante o guia abre o formulário completo e o guia continua nele.
- **Ajustes no guia (valem para todos os formulários):**
  - Foco: num grupo de opções vai para a opção já escolhida (rádio marcado, `aria-pressed="true"`). Assim
    o Enter avança em vez de trocar a escolha. As abas do lançamento ganharam `aria-pressed`. Campo só com
    botão de ação ("Dividir em categorias"): o foco fica no Próximo do balão.
  - Pausa: se o formulário sai da tela mas a janela dele continua aberta (pergunta do próprio formulário,
    como "É parcela?", "Parecidos", Histórico ou o resgate da reserva), o balão some, o Esc é da
    janela, e o guia volta com o formulário. "Pronto" só quando a janela fecha depois do Salvar.
  - Celular: o balão fica em cima, embaixo (acima do teclado) ou logo abaixo do campo aceso, entre ele
    e o Salvar. Escolhe a posição que não cobre o campo e, se der, nem o Salvar (`ladoDoBalaoCelular`).
    Entre os dois, ele pode encolher até 180 px e rolar por dentro.
- **ⓘ:** o balão do hover só abre com movimento real do mouse, num aparelho com mouse. Quando a tela muda
  debaixo de um ponteiro parado (o guia trocou de passo), o navegador repetia o último ponto tocado e o
  balão abria sozinho. O clique/toque no ⓘ e o Tab continuam iguais.
- **Revisão no celular:** Chrome em 375×667 e 414×896, com dados fictícios e `/api` simulada. Percorridos
  o "+" Lançamento, Transferência, Agendamento, Lançamento › Mais opções e Contas › Nova conta (cartão).
  Em nenhum passo o balão cobriu o campo aceso ou o Salvar, nenhum balão do ⓘ abriu, e não houve rolagem
  lateral.
- **help:check:** confere campos e ids, não os roteiros. Os roteiros são conferidos por `src/help/help.test.js`
  (os ids de `ordemCampos` existem na base).
- Testes: `src/components/Ajuda/GuiaContaLancamento.test.jsx` (formulários de verdade: troca de tipo e
  de aba, Enter, obrigatório, Salvar no meio, "Dividir" e "Mais opções", rápido do celular) e os casos
  novos em `GuiaPreenchimento.test.jsx` (pausa, foco, lado do balão) e `HelpCampo.test.jsx` (hover
  só com movimento real).
