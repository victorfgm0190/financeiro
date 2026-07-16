# FINUP — Documentação Técnica do Código-Fonte

> Documento gerado a partir da leitura direta do código-fonte atual.
> **Stack:** React 18 + Vite, Tailwind (tema dark), banco Neon PostgreSQL acessado
> via funções serverless (`/api/*`), autenticação JWT.
>
> Para cada arquivo: **o que faz**, **funções/hooks principais exportados** e
> **dependências importantes** entre arquivos.

---

## Visão geral da arquitetura

```
                       ┌──────────────────────────────┐
   Componentes  ──────▶│  src/context/AppContext.jsx  │  (estado global + regras de negócio)
   (Panels)            └──────────────┬───────────────┘
                                      │ usa
        ┌─────────────────────────────┼──────────────────────────────┐
        ▼                             ▼                              ▼
 src/lib/fluxoCaixa.js        src/lib/parcelas.js            src/lib/fatura.js
 (projeção de saldo)          (séries de parcelas)           (fatura / datas gerenciais)
                                      │
                                      ▼ persistência (src/lib/db.js)
                       ┌──────────────────────────────┐
                       │  api/load.js  · api/sync.js   │  ← serverless (Neon PostgreSQL)
                       │  api/_auth.js (guard JWT)     │
                       └──────────────────────────────┘
```

A camada **`lib/`** contém funções puras (sem React) reutilizadas tanto pelos
componentes quanto pelo `AppContext`. O **`AppContext`** é a única fonte de
verdade do estado da aplicação e centraliza as regras de negócio (saldos,
reservas, gerencial, parcelamento, espelho de empréstimos, patrimônio). Os
**componentes/painéis** consomem o contexto via o hook `useApp()`. A
persistência é feita por `src/lib/db.js` (não incluído no escopo deste
documento), que fala com os endpoints **`api/load.js`** (leitura + migrações) e
**`api/sync.js`** (gravação), ambos protegidos por **`api/_auth.js`**.

---

## 1. `src/context/AppContext.jsx`

### O que faz
É o **coração da aplicação** (~4.270 linhas). Define um React Context que mantém
todo o estado (`data`) e expõe as operações de negócio. Além do CRUD básico
(contas, transações, agendamentos, categorias, orçamentos, regras, grupos
gerenciais, favorecidos, envelopes, perfis, funções de reserva), concentra a
lógica que mantém saldos e projeções consistentes:

- **Saldos:** aplica/reverte o efeito de cada lançamento nas contas de forma
  simétrica, servindo de fonte única para adicionar, editar e excluir.
- **Reserva / Patrimônio / Investimento:** gera lançamentos-sombra automáticos
  (`accountId: null`) quando há transferências para/de contas vinculadas.
- **Empréstimos (conta-espelho):** gera lançamentos-espelho a partir de
  categorias/contas configuradas, com proteção contra loop (`isEspelho`).
- **Gerencial (Grupo G):** classifica lançamentos, cria transferências
  gerenciais das parcelas, recalcula agendamentos de fatura e reconcilia.
- **Provisões e agendamentos:** calcula ocorrências pendentes, efetiva
  provisões e reancora séries recorrentes por frequência.

### Constantes e helpers de módulo (fora do componente)
- `DEFAULT_ACCOUNT_GROUPS` **(exportado)** — grupos de conta padrão (Conta
  Corrente, Poupança, Investimentos, Cartão, Dinheiro, Imóveis, Veículos,
  Dívidas, Empréstimos a Terceiros), com `type` financeiro/patrimonial.
- `defaultData` — estado inicial completo, incluindo o grande catálogo de
  `categories` (grupos Alimentação, Bancos, Moradia, Saúde, Remunerações,
  Rendimentos, Aplicações, etc.) e os grupos gerenciais fixos `G` (number 1) e
  `D` (Despesa).
- `isParcelada(tx)` — identifica despesa que faz parte de uma série (por
  `installmentNum > 1` ou marcador `N/N` na descrição).
- `etapaAId(expenseId)` → `tx_gerA_<expenseId>` — id determinístico da
  transferência gerencial "etapa A".
- `grupoTemFuncoes(...)` / `sanitizeReservaFuncao(...)` — guardas de integridade
  que evitam função de reserva órfã grudada a lançamento de grupo incompatível.
- `computePendingUpTo(schedule, upToDateStr)` — todas as ocorrências pendentes
  de um agendamento até uma data (respeita `nextOccurrence`, frequência e nº de
  parcelas).
- `advanceByFrequency(dateStr, frequency)` — avança uma data por 1 intervalo da
  frequência (usado ao efetivar provisão recorrente).
- `applyBalanceEffect(accounts, t, dir)` / `applyTransferEffect(accounts, tx, dir)`
  — aplicam (`dir=+1`) ou revertem (`dir=-1`) o efeito de um lançamento nos
  saldos. Fonte única para add/edit/delete (editar = reverter antigo + aplicar
  novo). Tratam pagamento de fatura vinculado, estorno em cartão, etc.
- `buildReservaAutoTxs(...)` — gera as sombras de **reserva**, **patrimônio** e
  **investimento** (depósito = despesa; resgate = receita), herdando categoria
  da função de reserva quando existe.
- `buildEspelhoTxs(...)` — gera os lançamentos-espelho de **empréstimos**
  (casos A/B por categoria com `geraEspelho`; caso C: despesa direta numa
  conta-espelho → transfere para "Dinheiro Ger").
- `buildInvestAutoIncomeTx(...)` — aporte automático numa conta de investimento
  a partir de despesa com categoria vinculada (`investmentAccountId`).
- `faturaMesAnoOf(card, date, faturaMonthYear)` — resolve a fatura de referência.

### Exportado
- **`AppProvider({ children })`** — componente Provider. Internamente declara
  todas as operações via `useCallback`. A `value` do contexto expõe, entre
  muitos outros:
  - **Dados:** `data`, `settings`, `accounts`, `transactions`, `schedules`,
    `budgets`, `categories`, `classificationRules`, `gerencialRules`,
    `envelopes`, `accountGroups`, `costCenters`, `payees`, `gerencialGroups`,
    `payables`, `profiles`, `cardImports`, `reserveFunctions`,
    `scheduleReservaFuncoes`, `rateios`.
  - **Transações:** `addTransaction`, `updateTransaction`, `deleteTransaction`,
    `reverseTransaction`, `reverseGerencialCascadeOnly`, `setReconciled`,
    `bulkUpdateTransactions`.
  - **Contas:** `addAccount`, `updateAccount`, `deleteAccount`, `setMainAccount`,
    `recalcularSaldo`, `saveBalanceSnapshot`, `restoreBalanceSnapshot`,
    `getAccountSaldos`, `getSaldoPrincipalBreakdown`.
  - **Agendamentos/Provisões:** `addSchedule`, `updateSchedule`,
    `deleteSchedule`, `registerScheduleOccurrence`, `skipScheduleOccurrence`,
    `efetivarProvisao`, `getProximaProvisaoOccurrence`, `getNextOccurrences`,
    `findLinkedResgate`.
  - **Gerencial:** `processarLancamentoGerencial`, `criarParcelasGerencial`,
    `recalcularAgendamentosFatura`, `reconciliarGerencial`,
    `ajustarParcelasGrupoGerencial`, `propagarValorParcelas`,
    `getProvisoesPendentes`, `executarProvisoesGerenciais`,
    `corrigirDadosGerencial`.
  - **Reserva:** `addReserveFunction`, `updateReserveFunction`,
    `deleteReserveFunction`, `reorderReserveFunctions`.
  - **Fluxo de caixa / períodos:** `getFinancialPeriod`, `getFluxoCaixaPrincipal`.
  - **Classificação:** `classifyByRules`, `classifyGerencialByRules`,
    `learnClassification`, regras e exceções de recorrência.
  - **Perfis (CPF/CNPJ):** `activeProfileId`, `setActiveProfileId`,
    `profileAccounts`, `profileTransactions`, `profileSchedules`, etc.
- **`useApp()`** — hook de consumo do contexto. Lança erro se usado fora do
  `AppProvider`.

### Dependências importantes
- **`src/lib/db.js`** — todas as funções de persistência (`loadFromDb`,
  `syncSection`, `*ToRow`, `saveRateios`, `bulkUpdateTransactionsApi`, …).
- **`src/lib/fatura.js`** — `computeFaturaRef`, `computeScheduleDate`,
  `gerencialKey`, `nextMonthScheduleDate`, `prevMonthScheduleDate`.
- **`src/lib/parcelas.js`** — `installmentSystemDate`.
- **`src/lib/installments.js`** — `installmentKey`.
- **`src/lib/fluxoCaixa.js`** — `computeFluxoCaixa`, `occEfetiva`.
- **`src/lib/storage.js`** — `saveLocal`, `loadLocal` (persistência local).
- **`date-fns`** — aritmética de datas.
- É **consumido por praticamente todos os componentes** via `useApp()`.

---

## 2. `src/lib/fluxoCaixa.js`

### O que faz
Núcleo do **Fluxo de Caixa por Conta** — fonte única da projeção de saldo de um
conjunto de contas dentro de um período. Usado pelo relatório
(`Reports/FluxoCaixaPorConta`) e pelos KPIs **FINAL CICLO** / **PROJETADO** do
Painel Geral, garantindo cálculo idêntico em ambos.

Modelo (ancorado no saldo real `account.balance`):
```
saldoAnterior = Σ balance − Σ(transações reais com data >= start)
saldoFinal    = saldoAnterior + Σ(movimentos: transações + agendamentos + envelopes)
PROJETADO     = saldoFinal            (já com envelopes subtraídos)
FINAL CICLO   = saldoFinal + envelopesTotal
```

### Funções exportadas
- **`computeFluxoCaixa({...})`** — computa linhas e saldos. Recebe `accountIds`
  (Set), `currentBalance`, `start`, `end`, `transactions`, `schedules`,
  `envelopes`, `reserveFunctions`, `getNextOccurrences` e flags de exibição
  (`hideReserva`, `hidePatrimonio`, `reservaSet`, `patrimonioSet`,
  `includeSchedules`). Retorna `{ rows, saldoAnterior, saldoFinal,
  saldoFinalSemEnvelopes, totalEntrada, totalSaida, envelopesTotal }`.
  Internamente:
  1. **Transações reais** no período → linhas "Registrada".
  2. **Agendamentos pendentes** → linhas "Projetado"/"A pagar"/"A receber";
     provisão de despesa com reserva vinculada projeta **duas linhas** (resgate
     + despesa).
  3. **Envelopes** → por ciclo sobreposto, projeta o restante (limite − gasto)
     datado no vencimento.
  Transferência interna (ambas as contas no conjunto) é neutralizada.
- **`occEfetiva(schedule, dataOriginal)`** — aplica o override de uma ocorrência
  específica (`schedule.overrides[data] = { date?, amount? }`), devolvendo data
  e valor efetivos.
- **`envelopeCyclesOverlapping(dueDay, start, end)`** — ciclos de um envelope
  (de D+1 de um mês até D do seguinte) que se sobrepõem ao intervalo.

### Dependências importantes
- **Função pura**, sem dependências de outros módulos do projeto (apenas
  `Date`). É **importada pelo `AppContext`** (`computeFluxoCaixa`, `occEfetiva`)
  e pelos relatórios de fluxo de caixa. Depende do callback `getNextOccurrences`
  (injetado pelo chamador) para expandir agendamentos.

---

## 3. `src/lib/parcelas.js`

### O que faz
Helpers de **parcelamento** compartilhados entre a importação de fatura
(`ImportPanel`) e o "Editar Lançamento" (`TransactionForm`). Fonte única — antes
duplicados no `ImportPanel`. Cuidam da conversão fatura↔data, da regra de "data
de sistema" das parcelas do Finup, da detecção de duplicatas e da montagem da
visão de uma série.

### Funções exportadas
- **`addMonthToFatura(yyyymm, n)`** — avança `n` meses em uma string `YYYY-MM`
  (aceita negativo).
- **`faturaToDate(faturaYYYYMM, dueDay)`** — data de vencimento (`YYYY-MM-DD`) do
  cartão no mês da fatura (clampa ao último dia do mês).
- **`clampDateToFatura(dateStr, faturaYYYYMM, closingDay)`** — restringe uma data
  ao período válido da fatura; fora do intervalo, cai no dia de fechamento.
- **`installmentSystemDate(faturaYYYYMM, num, fallbackDate, financialStartDay)`**
  — data de sistema de uma parcela: 1/N ou à vista mantém a data; parcela N com
  N>1 vai para o dia `financialStartDay` do mês **anterior** à fatura. `date_cartao`
  nunca é alterado.
- **`isDuplicateInstallment(row, existing, accountId)`** — detecta duplicata de
  parcelado (mesma base + número + valor ±R$0,50), independente do mês.
- **`findExistingParcela(inst, num, amount, accountId, existing)`** — localiza a
  transação de uma parcela específica já no banco.
- **`installmentPrefix(description)`** — prefixo permissivo para agrupar parcelas
  irmãs (remove o último bloco `N/M`).
- **`buildSiblingDescription(anchorDesc, anchorNum, k, total)`** — gera a
  descrição da parcela `k` a partir de uma irmã âncora.
- **`buildSeries(tx, transactions, account, financialStartDay)`** — monta a visão
  da série a partir de uma âncora (usa `installment_num/total` já gravados).
  Retorna `{ base, total, siblings, missing }` (irmãs presentes + parcelas
  ausentes com campos herdados) ou `null` se não for parcela.

### Dependências importantes
- **`src/lib/installments.js`** — `detectInstallment`, `normalizeInstallmentBase`.
- **Importado por** `src/context/AppContext.jsx` (`installmentSystemDate`) e por
  `src/components/Import/ImportPanel.jsx` (várias funções).

---

## 4. `src/lib/fatura.js`

### O que faz
Funções puras de **cálculo de fatura de cartão e datas gerenciais**. Determinam
a fatura de referência de um gasto e as datas dos agendamentos gerenciais
(devolução, resgate parcelado) do Grupo G, além da chave única do agendamento
gerencial.

### Funções exportadas
- **`computeFaturaRef(txDate, closingDay)`** — fatura (`MM/YYYY`) de um gasto:
  dia ≤ `closingDay` → mês corrente; dia > `closingDay` → mês seguinte.
- **`computeScheduleDate(faturaRef, financialStartDay)`** — data (`YYYY-MM-DD`)
  do agendamento de devolução: dia `financialStartDay` do mês de vencimento.
- **`nextMonthScheduleDate(faturaRef, financialStartDay)`** — dia
  `financialStartDay` do mês **seguinte** ao vencimento (resgate parcelado).
- **`prevMonthScheduleDate(faturaRef, financialStartDay)`** — dia
  `financialStartDay` do mês **anterior** ao vencimento (transferências
  gerenciais das parcelas 2..N; trata virada de ano).
- **`gerencialKey(cardId, faturaRef)`** → `ger_<cardId>_<MM_YYYY>` — chave única
  do agendamento gerencial (cartão + fatura).

### Dependências importantes
- **Função pura**, sem imports do projeto. **Importado por** `AppContext`
  (`computeFaturaRef`, `computeScheduleDate`, `gerencialKey`,
  `nextMonthScheduleDate`, `prevMonthScheduleDate`) e por `ImportPanel`
  (`computeFaturaRef`).

---

## 5. `src/components/CreditCard/CreditCardPanel.jsx`

### O que faz
Painel do **Cartão de Crédito**: navegação por faturas (mês a mês), listagem dos
lançamentos da fatura selecionada, ações de CRUD, marcação de conciliação,
edição em lote, e visões auxiliares (Extrato Gerencial e Relatório de Fatura).
Integra a lógica gerencial (Grupo G) via badges e totalizadores.

### Exportado
- **`CreditCardPanel()`** (export default) — componente principal do painel.

### Funções/helpers internos relevantes
- `getBillKey(date, card)` — chave da fatura (`YYYY-MM`) de uma data, seguindo a
  mesma convenção de `computeFaturaRef` (baseada em `closingDay`).
- `txBillKey(tx, card)` — usa `faturaMonthYear` explícito ou deriva da data.
- `getBillLabel(key)` / `offsetBillKey(key, months)` — rótulo em PT e navegação
  entre faturas.
- `GerBadge` — badge do grupo gerencial (G/D/numerado).
- `CopyIdBadge` — badge que copia o id do lançamento.

### Dependências importantes
- **`useApp()`** (`AppContext`) — dados e operações.
- **`context/FabContext`** (`useRegisterFab`) — botão flutuante.
- **`components/shared/utils`** — `fmt`, `fmtDate`, `today`, filtros de
  lançamento (`EMPTY_LANC_FILTROS`, `matchLancFiltros`), `classifyFatura`, etc.
- **Subcomponentes:** `ExtratoGerencial`, `RelatorioFatura`,
  `Transactions/TransactionForm`, e vários de `shared/` (`Modal`,
  `ConfirmDialog`, `Toast`, `TxMobileItem`, `LancamentoFiltros`,
  `GerencialTotalizer`, `ReconciliarModal`, `BulkEditModal`, `DuplicateButton`,
  `DateInput`).
- **`hooks/useIsMobile`**.

---

## 6. `src/components/Import/ImportPanel.jsx`

### O que faz
Painel de **importação de extratos e faturas** (arquivos CSV/XLS de banco e
cartão, incluindo Itaú e o formato Dindin). Faz o parsing, a normalização, a
detecção de duplicatas, a pré-classificação por regras, o mapeamento de contas,
o casamento com agendamentos (`ScheduleMatchModal`) e a criação das
transações — inclusive a mecânica de **parcelamento** (via `lib/parcelas`) e a
**fatura de referência** (via `lib/fatura`). É um dos maiores componentes
(~3.000 linhas).

### Exportado
- **`ImportPanel()`** (export default) — componente principal.

### Funções/helpers internos relevantes
- `readFileAsText(file)` — lê arquivo como texto (UTF-8).
- `isItauCSV(text)` / `parseItauCSV(text, categories)` — detecção e parsing do
  CSV do Itaú, tratando pagamento de fatura (ignorado) e estornos (importados
  como receita na categoria de estorno).
- Diversos helpers de detecção de parcela, duplicata e classificação (reutilizam
  os módulos `lib/*`).

### Dependências importantes
- **`src/lib/dindinParse`** — `parseFile`, `normalizeDate`, `fuzzyMatchAccount`,
  `parseDindinCC`, `parseDindinCartao`.
- **`src/lib/fatura`** — `computeFaturaRef`.
- **`src/lib/installments`** — `detectInstallment`, `installmentKey`.
- **`src/lib/parcelas`** — `addMonthToFatura`, `faturaToDate`,
  `clampDateToFatura`, `isDuplicateInstallment`, `findExistingParcela`,
  `installmentSystemDate`.
- **`src/lib/db`** — `loadAccountMappings`, `fetchTransactionHistory`.
- **`useApp()`** (`AppContext`) — cria/consulta transações, regras, contas.
- **Subcomponentes:** `ScheduleMatchModal`, `CategorySelect`, `RateioModal`,
  `GerencialTotalizer`, `ImportPreviewModal`, `AccountOptions`, `ConfirmDialog`,
  `Toast`, `DateInput`, `Modal`, `TransactionForm`, `TransactionHistoryModal`.

---

## 7. `src/components/Accounts/ExtratoContaPanel.jsx`

### O que faz
**Extrato de uma conta**: lista os lançamentos da conta selecionada com saldo
corrente calculado, navegação por período, filtros, conciliação, edição em lote
e agrupamento inteligente de transferências. Recebe a conta por prop e integra
ações de CRUD via callbacks do pai.

### Exportado
- **`ExtratoContaPanel({ account, onClose, onEdit, onNewTx, onDelete, backButton })`**
  (export default) — componente principal. As ações de edição/criação/exclusão
  são delegadas ao componente pai via props.

### Funções/helpers internos relevantes
- `balanceAt(account, allTransactions, fromDate)` — saldo da conta imediatamente
  antes de `fromDate`, revertendo os lançamentos do intervalo `[fromDate, hoje]`.
  Lançamentos com data **futura** não são revertidos (não entram em
  `account.balance`), mantendo o mesmo critério de `recalcularSaldo`.
- `netCAIncoming(rows, accountId, aplicacaoIds)` — netiza várias transferências
  recebidas de uma mesma conta de aplicação no mesmo dia, agrupando-as numa
  única linha líquida (preserva a ordem cronológica).

### Dependências importantes
- **`useApp()`** (`AppContext`) — transações, contas, ações.
- **`components/shared/utils`** — `fmt`, `fmtDate`, filtros de lançamento.
- **Subcomponentes:** `ConfirmDialog`, `Toast`, `TxMobileItem`,
  `LancamentoFiltros`, `ReconciliarModal`, `BulkEditModal`,
  `ValueFilterDropdown`, `DuplicateButton`, `ReconciledTotals`.

---

## 8. `src/components/Reports/DemonstrativoFinanceiro.jsx`

### O que faz
**Demonstrativo financeiro** (relatório de receitas × despesas) por período
configurável (mensal a anual), com agrupamento por categoria/grupo, filtros de
conta e categoria persistidos em `localStorage`, e tratamento especial de
transferências entre perfis (CPF↔CNPJ) e de sombras de reserva/patrimônio.

### Exportado
- **`DemonstrativoFinanceiro()`** (export default) — componente principal.

### Funções/helpers internos relevantes
- `PERIOD_OPTIONS` — opções de período (1, 2, 3, 4, 6, 12 meses).
- `getRange(startDay, months)` — calcula `{ start, end }` do período a partir do
  dia de início do mês financeiro.
- `loadFilters()` / `saveFilters(f)` — persistem os filtros do relatório em
  `localStorage` (chave `finup_demonstrativo_filters`).
- `expandInterProfileTransfers(transactions, accounts, profiles)` — expande cada
  transferência entre perfis em duas pernas income/expense, cada uma com a
  categoria do seu lado (`categoria_cnpj_id` / `categoria_cpf_id`), marcadas com
  `_interProfile`.
- `MultiSelectPanel({ label, items, selected, onChange })` — painel de seleção
  múltipla reutilizado nos filtros.

### Dependências importantes
- **`useApp()`** (`AppContext`) — transações, contas, categorias, perfis.
- **`components/shared/utils`** — utilidades de classificação de despesa/receita
  de relatório: `countsAsReportExpense`, `countsAsReportIncome`,
  `aplicacaoAccountIds`, `reservaDespesaFuncIds`, `isResgateReservaSombra`,
  `accountsForView`, `groupedAccountOptions`, `fmt`, `fmtDate`.
- **`components/shared/DateInput`**, **`hooks/useIsMobile`**.

---

## 9. `src/components/Reservas/ReservasPanel.jsx`

### O que faz
Painel do **Sistema de Reservas**: gerencia as funções de reserva (saldo
inicial, entradas, saídas, depósito mensal, mês de vencimento, ajustes), exibe a
matriz mensal, permite "virar saldo" (fechar período) e exportar para `.xlsx`.
Combina estado global (funções de reserva no Neon) com estado local do
dispositivo (overrides de saldo real e histórico de viradas em `localStorage`).

### Exportado
- **`ReservasPanel()`** (export default) — componente principal.

### Funções/hooks internos relevantes
- **`useReservas()`** — hook interno que combina as funções de reserva do
  contexto (`reserveFunctions`, `addReserveFunction`, `updateReserveFunction`,
  `deleteReserveFunction`) com estado local persistido:
  - `accountBalances` (chave `finup_reserve_balances`) e `periods` (chave
    `finup_reserve_periods`), ambos em `localStorage`.
  - `addFunction` / `updateFunction` / `deleteFunction` — delegam ao contexto.
  - `setAccountBalance(accountId, value)` — override local de saldo real.
  - `virarSaldo(saldosAtualizados, monthKey)` — fecha o período: registra um
    snapshot em `periods`, transforma o saldo atualizado em novo `saldoInicial`,
    zera entradas/saídas via override e limpa o ajuste do mês fechado.
- `exportSheet(rows, filename)` — exporta uma matriz como `.xlsx` (via `xlsx`).
- `mmYYYY()` — string `MMYYYY` do mês atual (nome de arquivo).
- `MONTH_LABELS` — rótulos abreviados dos meses.

### Dependências importantes
- **`useApp()`** (`AppContext`) — funções de reserva (fonte global no Neon).
- **`src/lib/db`** — `fetchReserveFunctionTransactions` (lançamentos de uma
  função de reserva).
- **`xlsx`** — exportação de planilha.
- **`components/shared/utils`** — `fmt`, `fmtDate`, `accountsForView`.
- **Subcomponentes:** `Modal`, `ConfirmDialog`; **`hooks/useIsMobile`**.

---

## 10. `api/_auth.js`

### O que faz
Utilitário de **autenticação JWT** para os endpoints serverless. Extrai e valida
o Bearer token e fornece um guard para proteger handlers.

### Funções exportadas
- **`verifyToken(req)`** — lê o header `Authorization: Bearer <token>`, valida
  com `JWT_SECRET` (via `jsonwebtoken`) e retorna o payload decodificado, ou
  `null` se ausente/inválido/expirado ou se `JWT_SECRET` não estiver
  configurado.
- **`requireAuth(req, res)`** — guard para endpoints protegidos: retorna `true`
  se autenticado; caso contrário responde **401** e retorna `false`. Uso padrão:
  `if (!requireAuth(req, res)) return`.

### Dependências importantes
- **`jsonwebtoken`** — verificação do token.
- **Variável de ambiente `JWT_SECRET`**.
- **Consumido por** `api/load.js`, `api/sync.js` e demais endpoints protegidos.

---

## 11. `api/load.js`

### O que faz
Endpoint serverless de **carga inicial do banco** (`GET`). Antes de ler os
dados, executa **migrações idempotentes** de schema (via `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, índices e *backfills*),
garantindo que o banco Neon esteja no formato que o app espera. Em seguida
carrega todas as tabelas em paralelo e devolve um snapshot completo do estado.

### Handler
- **`default async function handler(req, res)`** — protegido por
  `requireAuth`. Passos:
  1. **Migrações de `lancamentos`:** colunas gerenciais e de parcelamento
     (`gerencial_schedule_id`, `fatura_month_year`, `date_cartao`,
     `parent_tx_id`, `reserva_funcao_id`, `reserva_conta_id`, `installment_num`,
     `installment_total`, `installment_key` + índice único parcial,
     `categoria_cnpj_id`/`categoria_cpf_id`, `is_espelho`, `espelho_origem_id`,
     `card_id`, `fatura_ref`, `source_expense_id`, `source_schedule_id`) e
     *backfills* dos `tx_gerA_*` legados (deriva `source_expense_id`, `card_id`
     e `fatura_ref` da despesa origem).
  2. **Migrações de `agendamentos`:** `reserva_funcao_id`, `fatura_ref`,
     `card_id`, `fatura_mes_ano`, `tipo`, `confirmado`, `is_provisao`,
     `provisao_efetivada`, `provisao_efetivada_until`, `next_occurrence`,
     `source_tx_id`.
  3. **`reserve_functions`** (cria tabela + colunas de override e
     `exibir_como_despesa`, com **seed único** de quais funções contam como
     despesa).
  4. **`importacoes_pendentes`** (staging da importação Dindin),
     **`gerencial_rules`**, **`lancamento_rateios`**,
     **`schedule_reserva_funcoes`**, além de colunas em `contas`, `categorias`,
     `configuracoes`, `regras_classificacao` e vários **seeds idempotentes**
     (categorias Capitalização/Consórcio, conversão de contas em investimento).
  5. **Carga paralela** (`Promise.all`) de: contas, lançamentos, agendamentos,
     categorias, orçamento, regras, reservas_funcoes, favorecidos,
     configuracoes, envelopes, grupos_conta, perfis, card_imports,
     gerencial_rules, reserve_functions, lancamento_rateios,
     schedule_reserva_funcoes.
  6. **Resposta** JSON com todas as coleções (`accs`, `txs`, `scheds`, `cats`,
     `buds`, `rules`, `gers`, `pays`, `faves`, `cfg`, `envs`, `groups`,
     `perfis`, `imports`, `grules`, `rfns`, `rateios`, `srfs`).
  7. **Erros:** distingue "tabela ausente" (código `42P01` / mensagens de
     relação inexistente) → **404**; demais → **500**.

### Dependências importantes
- **`./_db.js`** — `query` (acesso ao Neon PostgreSQL).
- **`./_auth.js`** — `requireAuth`.
- **Consumido por** `src/lib/db.js` (`loadFromDb`), que por sua vez alimenta o
  `AppContext` na inicialização.

---

## 12. `api/sync.js`

### O que faz
Endpoint serverless de **gravação** (`POST`). Recebe um lote de alterações e as
persiste no banco, com um formato genérico de upsert/delete por seção e casos
especiais para contas+cartões, favorecidos e configurações.

### Handler
- **`default async function handler(req, res)`** — protegido por `requireAuth`;
  aceita apenas `POST` (senão **405**). Faz `parseBody(req)` e despacha por
  `body.type`:
  - **`'section'`** — sync genérico de uma tabela: `deleteRows(table, delete)` +
    `upsertRows(table, upsert)` (em paralelo).
  - **`'accounts'`** — grava `contas` (delete + upsert) e depois `cartoes`
    (delete + upsert) — cartões dependem das contas, então executam em
    sequência.
  - **`'payees'`** — favorecidos usam `name` como PK: remove e insere por nome.
  - **`'settings'`** — linha única em `configuracoes` (`id = 1`) via upsert.
  - Tipo desconhecido → **400**; erro interno → **500** (loga
    `[api/sync]`).
  - Sucesso → `{ ok: true }`.

### Dependências importantes
- **`./_db.js`** — `upsertRows`, `deleteRows`, `parseBody`.
- **`./_auth.js`** — `requireAuth`.
- **Consumido por** `src/lib/db.js` (funções `syncSection`, `syncAccounts`,
  `syncPayees`, `syncSettings`), acionadas pelas operações de escrita do
  `AppContext`.

---

## Mapa de dependências (resumo)

| Arquivo | Depende de | É consumido por |
|---|---|---|
| `context/AppContext.jsx` | `lib/db`, `lib/fatura`, `lib/parcelas`, `lib/installments`, `lib/fluxoCaixa`, `lib/storage`, `date-fns` | Todos os componentes (via `useApp()`) |
| `lib/fluxoCaixa.js` | — (puro) | `AppContext`, relatórios de fluxo de caixa |
| `lib/parcelas.js` | `lib/installments` | `AppContext`, `ImportPanel`, `TransactionForm` |
| `lib/fatura.js` | — (puro) | `AppContext`, `ImportPanel` |
| `CreditCardPanel.jsx` | `AppContext`, `FabContext`, `shared/*`, subcomponentes de cartão | App (roteamento de painéis) |
| `ImportPanel.jsx` | `AppContext`, `lib/dindinParse`, `lib/fatura`, `lib/installments`, `lib/parcelas`, `lib/db`, subcomponentes | App |
| `ExtratoContaPanel.jsx` | `AppContext`, `shared/*` | Painéis de contas (recebe `account` por prop) |
| `DemonstrativoFinanceiro.jsx` | `AppContext`, `shared/utils`, `DateInput` | Relatórios |
| `ReservasPanel.jsx` | `AppContext`, `lib/db`, `xlsx`, `shared/*` | App |
| `api/_auth.js` | `jsonwebtoken`, `JWT_SECRET` | `api/load.js`, `api/sync.js` |
| `api/load.js` | `api/_db`, `api/_auth` | `lib/db` (`loadFromDb`) → `AppContext` |
| `api/sync.js` | `api/_db`, `api/_auth` | `lib/db` (sync*) → operações do `AppContext` |
