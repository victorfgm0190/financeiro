# Assistente IA — inventário de ações

Fonte única das ações do Assistente: `src/lib/assistente/acoes.js` (registro central, puro, usado
pelo backend e pelo app) + `src/components/Assistente/executores.jsx` (id → componente).
Ação nova = **uma entrada no registro + uma linha nos executores**. Este documento acompanha as
fases; atualize o **Status** ao implementar.

## Regras fixas

- **O Assistente NUNCA exclui nada** (lançamento, agendamento, cadastro, reserva, contrato…).
  Exclusão fica fora do registro; pedido de exclusão é recusado no backend antes do modelo
  (`api/_iaBaixa.js` `ehPedidoDeExclusao`). Teste: nenhum id/descrição fala em excluir.
- **Estorno não é exclusão**: é 🔴 — o backend responde `abrir_tela('estornar')` sem chamar o modelo.
- **Nada grava sem confirmação.** Criação/edição reaproveitam o formulário ou modal existente
  (validações e efeitos — inclusive chamadas às funções protegidas — ficam onde já estão).
- **Consultas: o app calcula** com as mesmas funções das telas; a IA só escolhe os filtros.
- Funções protegidas (CLAUDE.md) nunca são alteradas; chamar é permitido.
- **Contas** (`src/lib/assistente/contas.js`): a IA escolhe sozinha só as **sugeríveis** — cartões
  ativos de finalidade "Uso comum" e a Conta favorita ★ do perfil ativo (o app envia `perfilAtivo`).
  As demais (reservas, patrimônio, investimento, financiamento, outras correntes, inativas) só se o
  pedido as citou (nome, apelido ou `ia_apelidos`); senão o campo volta vazio e a prévia pergunta.
  **Subcontas gerenciais** (tipo `gerencial`, `is_gerencial` ou nome "Ger. …", o critério da
  Integridade) nunca são gravadas pela IA — nem como origem/destino de transferência; o backend
  responde `abrir_tela` com a explicação e o botão "Abrir a conta". Consultar o saldo delas pode.
  Destino de transferência: qualquer conta ativa citada, exceto gerencial (reserva pode).
- **Duplicidade na criação**: prévia de `registrar_lancamento`, efetivação de pré-lançamento e o
  `TransactionForm` manual procuram lançamentos (conciliados ou não) e pré-lançamentos pendentes
  parecidos — `parecidosNaCriacao` (`src/lib/casamentoFatura.js`, mesmos critérios do "Já lançado":
  mesma conta, valor ±R$ 0,01, data ±3 dias, parcela por parcela). Aviso `AvisoParecidos`:
  "É o mesmo — não salvar" (nada gravado, nem pré-lançamento; "Abrir o existente") ou
  "É outro — salvar mesmo assim" (toque explícito).

## Níveis

| Nível | Comportamento |
|---|---|
| 🟢 consulta | responde direto (cálculo no app) |
| 🟡 criação | prévia no formulário existente + confirmar |
| 🟠 edição | prévia antes→depois + confirmar; agendamento pergunta "só esta ou a série" (`EscopoSerieDialog`) |
| 🔴 crítica/lote | a IA só abre a tela certa (`abrir_tela`), não executa |

Siglas das protegidas: **RG** `reconciliarGerencial`, **RAF** `recalcularAgendamentosFatura`,
**RFS** `reconcileFaturaState`, **AEG** `applyEnsureGerencial`, **SPB** `getSaldoPrincipalBreakdown`.
"chama" = o caminho passa pela função sem alterá-la.

## Carregamento por contexto (custo)

Núcleo fixo (`NUCLEO`): `perguntar`, `abrir_tela`, `registrar_lancamento`, `criar_agendamento`,
`consultar_saldo`, `buscar_lancamentos` + os domínios cujas `palavras` aparecem no pedido (sem
chamada extra ao modelo), filtrados pela permissão do usuário. Mesma ordem → mesmo prefixo →
cache de prompt por grupo. Domínios atuais: `agenda`, `cartao`, `painel`.

## 🟢 Consultas

| Ação | Status | Onde hoje | Reaproveita | Protegida? | Dados |
|---|---|---|---|---|---|
| `consultar_saldo` | ✅ etapa 1 | Contas, Início | `saldosDaConta` + `getAccountSaldos` | — | conta |
| `consultar_saldo_principal` | ✅ fase 1 | Início/Painel | `getSaldoPrincipal` | SPB (só leitura) | perfil ativo |
| `consultar_fatura` | ✅ fase 1 | Cartão | `creditBillKey` + `creditBillStatus` + `isFaturaFechada` | — | cartão, mês |
| `consultar_vencimentos` | ✅ fase 1 | Agenda/Agendamentos | `buildScheduleGroups` + `agendaCalendario.ocorrenciasPendentes` | — | período, pagar/receber |
| `consultar_gastos_categoria` | ✅ fase 1 | Painel, Maiores despesas | `useDespesasPorCategoria` + `periodoDoFiltro` + `useModoDespesas` | — | categoria, período |
| `buscar_lancamentos` | ✅ fase 1 | Busca global | `/api/search` (`searchEntries`) | — | texto, valor, período |
| `consultar_fluxo` | fase 4 | Fluxo de Caixa | `getFluxoCaixaPrincipal` / `computeFluxoCaixa` | — | período, contas |
| `consultar_favorecido` | fase 4 | Relatórios › Por favorecido | ⚠ extrair cálculo de `RelatorioPorFavorecido.jsx` | — | favorecido, período |
| `consultar_reservas` | fase 4 | Reservas | `fetchReserveLedgerSummary` | — | função |
| `consultar_envelopes` | fase 4 | Envelopes | `envelopes.js` | — | envelope |
| `consultar_orcamento` | fase 4 | Orçamento | ⚠ extrair cálculo de `BudgetPanel.jsx` | — | categoria, mês |
| `consultar_patrimonio` | fase 4 | Patrimônio | `getBem`, `getFinanciamento`, `getParcelas` | — | bem |
| `consultar_contrato` | fase 4 | Contratos | `contratoPorId`, `listarEventosContratoApi` | — | contrato |
| `consultar_pendencias` | fase 4 | Alertas › Integridade | `/api/integridade` | — | — |

## 🟡 Criação

| Ação | Status | Onde hoje | Reaproveita | Protegida? | Dados |
|---|---|---|---|---|---|
| `registrar_lancamento` | ✅ etapa 1 | "+" › Lançamento | `TransactionForm` → `addTransaction` | chama RAF/AEG (cartão) | tipo, valor, data, conta, categoria |
| `criar_agendamento` | ✅ etapa 1 | "+" › Agendamento | `ScheduleForm` → `addSchedule` | — | valor, vencimento, recorrência |
| `baixar_agendamento` | ✅ etapa 1.1 | Agendamentos › Pagar | `PayModal` → `addTransaction` + `markScheduleRegistered` | — | nome, valor (exato filtra; aproximado ordena), data, conta |
| `registrar_parcelado_cartao` | fase 3 | `TransactionForm` (parcelado) | + `criarParcelasGerencial` | chama RAF/AEG | cartão, total, parcelas |
| `registrar_transferencia` | fase 3 | "+" › Transferência | `TransactionForm` transfer | — | origem, destino, valor |
| `movimentar_reserva` | fase 3 | "+" › Reserva | `TransactionForm` (reserva) | — | reserva, função, valor |
| `registrar_rendimento` | fase 3 | Contas › Rendimento | `RendimentoModal` | — | conta, valor |
| `criar_provisao` / `efetivar_provisao` | fase 3 | Agendamentos | `ProvisaoForm` / `efetivarProvisao` | — | provisão, valor |
| `data_provisoria_fluxo` | fase 3 | Fluxo de Caixa | `salvarDataProvisoria` | — | ocorrência, data |
| `criar_envelope` / `criar_orcamento` | fase 3 | Envelopes / Orçamento | `addEnvelope` / `addBudget` | — | categoria, limite |
| `criar_cadastro` | fase 3 | Configurações › Cadastros | `addCategory`, `addPayee`, `addCostCenter`, `addTipoDocumento`, `addRule` | — | nome, tipo |
| `criar_conta` | fase 3 | Contas | `AccountForm` → `addAccount` | — | nome, tipo, saldo inicial |

## 🟠 Edição (fase 2)

| Ação | Onde hoje | Reaproveita | Protegida? | Dados |
|---|---|---|---|---|
| `editar_lancamento` | Lançamentos/Extrato | `TransactionForm` (`initial.id`) → `updateTransaction` + `registrarEdicao`; parcelas: `EscopoSerieDialog` | chama AEG; RAF (cartão) | localizar item + campos |
| `editar_agendamento` | Agendamentos | `ScheduleForm` (`initial.id`) → `salvarEdicao` (`camposSerie` + `EscopoSerieDialog`) | — | agendamento, ocorrência, escopo |
| `editar_ocorrencia` | Agendamentos | `edicaoDeOcorrencia` → `updateSchedule` | — | ocorrência, valor/data |
| `pular_ocorrencia` / `desfazer_pulo` | Agendamentos | `skipScheduleOccurrence` / `desfazerPuloOcorrencia` | — | ocorrência |
| `conciliar` | Extrato/Lançamentos/Cartão | `setReconciled` | — | lançamento |
| `confirmar_agendamento` | Agendamentos/Fluxo | `toggleScheduleConfirmado` | — | agendamento |
| `editar_conta` | Contas | `AccountForm` → `updateAccount`, `setMainAccount` | — | conta |
| `atualizar_valor_bem` | Patrimônio | `updateAccountValue` | — | bem, valor |
| `editar_envelope` / `orcamento` / `cadastro` / `regra` | telas | `update*` | — | item |
| `reajuste_contrato` | Contratos | `confirmarReajusteContrato` | — | contrato |

Até a fase 2, edição vai pelo `abrir_tela` (tela geral do item).

## 🔴 Críticas (✅ fase 1: todas via `abrir_tela`)

| Destino (`abrir_tela`) | Tela | Função existente | Protegida? |
|---|---|---|---|
| `estornar` | Lançamentos | `reverseTransaction`, `estornarLancamentoContrato`, `estornarEntrada` | — |
| `pagar_fatura` | Cartão | `TransactionForm` transfer c/ fatura — ⚠ verificar RAF/RFS antes de virar 🟡 | ? |
| `fechar_abrir_fatura` | Cartão | `fecharFatura` / `abrirFatura` | RAF |
| `revisar_fatura` | Cartão | `revisarMovimentosFatura` | RAF + RG |
| `importar_fatura` | Importar (desktop) | `ImportPanel` | RAF + RG + AEG |
| `importar_lancamentos` | Importar lançamentos | `ImportarLancamentosPanel` | — |
| `gerenciais` | Agendamentos | `executarProvisoesGerenciais`, `corrigirDadosGerencial` | RG/RAF |
| `baixa_em_lote` | Agendamentos | `BatchRegisterModal`, `executarTransferenciasInicioMes` | — |
| `vincular_ou_ja_no_cartao` | Agendamentos | `VincularLancamento`, `baixarComoJaNoCartao` | — |
| `edicao_em_massa` | Lançamentos | `bulkUpdateTransactions`, `setTipoDocumentoEmMassa` | — |
| `renomear_favorecido` | Configurações › Favorecidos | `renomearFavorecidos` | — |
| `virada_saldo_reservas` / `ajustes_reserva` | Reservas | `handleVirar`, `addReserveAdjustment` | — |
| `integridade` | Alertas | `aplicarAjustesIntegridade` | — |
| `contratos` | Contratos | `ContratoWizard`, `rescindirContrato` | — |
| `patrimonio` | Patrimônio | `criarBem`, `criarFinanciamento`, `registrarEntrada` | — |
| `configuracoes` | Configurações | `updateSettings`, snapshots, perfis | — |

Telas gerais (`tela_*`): Lançamentos, Agendamentos, Cartão, Contas, Fluxo, Reservas, Envelopes,
Orçamento, Patrimônio, Contratos, Relatórios, Alertas, Configurações.

## ⛔ Fora do registro (exclusões)

`deleteTransaction`, `deleteSchedule`, `deleteAccount`, `deleteCategory`, `deleteCategoryGroup`,
`deleteEnvelope`, `deleteBudget`, `deleteRule`, `deleteGerencialRule`, `deleteGerencialGroup`,
`deleteReserveFunction`, `deleteReservePeriod`, `deleteReserveAdjustment`, `deleteProfile`,
`deleteTipoDocumento`, `deletePayable`, `deleteAccountGroup`, `deleteRateiosFor`, `excluirContrato`,
`excluirParcelaContrato`, `excluirRegraContrato`, `excluirCreditoApi`, `revertCardImport`,
`removerDatasProvisorias`, `apagarDadosDoAparelho`.

## Fases

1. ✅ Registro central + 🟢 `consultar_vencimentos`, `consultar_fatura`, `consultar_gastos_categoria`,
   `buscar_lancamentos`, `consultar_saldo_principal` + `abrir_tela` para todas as 🔴.
2. 🟠 do dia a dia: `editar_lancamento`, `editar_ocorrencia`, `editar_agendamento` (escopo),
   `pular_ocorrencia`, `conciliar` — base: resolvedor "localizar item" + quadro antes→depois.
3. 🟡 restantes (transferência, reserva, provisão, rendimento, envelope/orçamento, cadastros).
4. 🟢/🟠 restantes (favorecido e orçamento exigem extrair o cálculo dos componentes).
