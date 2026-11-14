# Botões da tela Cartão de Crédito — diagnóstico

Levantamento de 14/11/2026. É **só diagnóstico**: nenhum código nem dado foi alterado.

**Fontes**
- Leitura do código na `homologacao` (82215c1).
- Consultas SQL somente de leitura no banco do vm (`neondb`).
- As regras do motor de integridade rodadas em Node sobre uma cópia lida do banco, sem gravar nada.

**Simulação do motor**
- Tentei rodar o motor inteiro (AppProvider em teste) sobre uma cópia dos dados do vm.
- O cartão Itaupers terminou com exit=1: o teste estourou o limite de 25 minutos ao montar o app com
  os ~4.800 lançamentos do vm. Foi interrompido a pedido do usuário.
- As conclusões abaixo vêm do código e do SQL.

## Parte A — os três botões

Os três ficam em `src/components/CreditCard/CreditCardPanel.jsx`, na coluna da direita dos cards.
Só aparecem para quem pode **editar** cartão. "Reconciliar Gerenciais" só aparece no computador.
Nenhum dos três depende da chave do controle gerencial: os três aparecem mesmo com ela desligada.

### 1. "Atualizar"

| Item | Como é hoje |
|---|---|
| Código | `onClick` inline: `recalcularAgendamentosFatura(cartão, ano, mês)` e, sem esperar, `reconciliarGerencial(cartão)` |
| /api | Nenhuma chamada direta. Grava pelo sync normal do app (`/api/sync`, `/api/sync-srf`) |
| Passo a passo | (1) `reconcileFaturaState` na fatura da tela: recria os agendamentos geridos pendentes dela (pagamento da fatura, devolução gerencial, resgates por conta de origem) e o detalhamento por função; (2) `reconciliarGerencial` roda o mesmo `reconcileFaturaState` em **todas** as faturas do cartão; (3) recalcula o saldo gravado de **todas** as contas Ger. (Σ transferências), de qualquer cartão |
| Tabelas | `agendamentos` (pagamento_fatura, gerencial_devolucao, resgate_reserva), `schedule_reserva_funcoes`, `contas.balance` das Ger. |
| Prévia | **Não.** Mostra só o toast "Fatura atualizada: R$ X" (o total, que não mudou) |
| Escopo | Fatura da tela → todas as faturas do cartão → saldos Ger. de todos os cartões |

### 2. "Revisar Movimentos Automáticos"

| Item | Como é hoje |
|---|---|
| Código | `handleAbrirRevisar` → `revisarMovimentosFatura({ dryRun: true })` (`computeRevisaoFatura` no AppContext) + `computeRevisaoExtras` + `competenciaRevisao` (motor de integridade, regras de competência). Executar: `handleExecutarRevisar` (`dryRun: false`), `handleDeletarFantasmas`, `handleRecalcularAgendamentos`, `aplicarCorrecoesCompetencia` |
| /api | Nada direto; sync normal. As correções de competência gravam antes o histórico (`registrarEdicao` → historico_alteracoes) |
| Passo a passo | **Prévia** em 4 seções. (1) Motor da fatura: roda `applyEnsureGerencial` em cada gasto e `reconcileFaturaState`, e lista o que mudaria — etapas A (criar/remover/atualizar), resgates, devolução, pagamento. (2) "Fantasmas": entradas na Ger. do cartão sem fatura e com id não reconhecido. (3) Resgate/devolução cujo detalhamento por função não soma o valor. (4) Competência fora do lugar (em **qualquer** fatura): gasto em fatura implausível, reserva Ger. em fatura divergente ou duplicada. **Aplicar**: (1) grava o estado calculado num update atômico; (2) **apaga** os fantasmas; (3) recalcula e reconcilia; (4) exclui duplicatas, move de fatura e reconcilia as faturas afetadas |
| Tabelas | `lancamentos` (etapas A `tx_gerA_*`, exclusões, mudança de fatura), `agendamentos`, `schedule_reserva_funcoes`, `historico_alteracoes` |
| Prévia | **Sim.** Cada seção é aplicada pelo usuário depois de ver a lista |
| Escopo | Seções 1–3: só a fatura da tela. Seção 4: todas as faturas do cartão e da Ger. dele |

### 3. "Reconciliar Gerenciais"

| Item | Como é hoje |
|---|---|
| Código | `handleReconciliarGerencial`: `recalcularAgendamentosFatura` (fatura da tela) e depois `await reconciliarGerencial(cartão)` |
| /api | Sync normal |
| Passo a passo | **Igual ao "Atualizar"**. A única diferença é que espera o resultado e mostra "N agendamentos ajustados, M saldos corrigidos" (o detalhe vai só para o console) |
| Tabelas | As mesmas do "Atualizar" |
| Prévia | **Não** |
| Escopo | O mesmo do "Atualizar" (todas as faturas do cartão; saldos Ger. de todos os cartões) |

### O que já roda sozinho

- **Ao salvar, editar ou importar lançamento de cartão:** `addTransaction`/`updateTransaction` chamam
  `applyEnsureGerencial`, `recalcularAgendamentosFatura` da fatura e `reconciliarGerencial` das faturas
  afetadas. A importação também chama `ensureGerencialState` nos lançamentos novos e
  `reconciliarGerencial` no fim.
  → "Atualizar" e "Reconciliar" **repetem** isso para o cartão inteiro.
- **Ícone de atualizar do topo:** só recarrega os dados do banco; não recalcula nada.
- **Motor de integridade** (`api/integridade.js`, regras em `src/lib/integridade/regras.js`): detecta
  as mesmas divergências (etapa A faltando/valor, resgate faltando/valor, fechamento da fatura, saldo da
  subconta, competência), mas **só registra pendências**. A correção é manual (Pendências › Ajustar).
  → A seção 4 do "Revisar" usa as regras dele.
- **Recálculo de saldos:** `reconciliarGerencial` passo B grava o saldo das contas Ger. Os saldos das
  contas correntes continuam vindo só dos lançamentos.
- **Conferência da importação:** compara arquivo × banco. Não toca no gerencial.

### Funções protegidas

| Botão | Chama (protegidas) | Altera alguma? |
|---|---|---|
| Atualizar | `recalcularAgendamentosFatura`, `reconciliarGerencial` (que usa `reconcileFaturaState`) | Não |
| Revisar | `applyEnsureGerencial`, `reconcileFaturaState` (via `computeRevisaoFatura`), `recalcularAgendamentosFatura`, `reconciliarGerencial` | Não |
| Reconciliar Gerenciais | `recalcularAgendamentosFatura`, `reconciliarGerencial` | Não |

`getSaldoPrincipalBreakdown` não é usado por nenhum dos três.

### Controle gerencial desligado e cartão sem lançamentos

- **Desligado:** os três continuam visíveis e rodam o motor. Para quem nunca usou grupos, o motor não
  acha nada de gerencial e só recria o **pagamento da fatura**.
- **O risco do desligado:** um cliente que desligou depois de usar continua tendo os agendamentos e
  as contas Ger. **recalculados** pelos botões. Isso contraria a ideia de "só deixam de aparecer".
- **Cartão sem lançamentos:** o motor não cria nada e remove agendamentos geridos pendentes de faturas
  que zeraram. O "Revisar" mostra "Tudo em ordem".

### Riscos

| Risco | Atualizar / Reconciliar | Revisar |
|---|---|---|
| Duplicar | Baixo. Os ids são determinísticos (`fsch_<cartão>_<AAAAMM>_…`) e o motor preserva o que já foi registrado: executado não é recriado (`isResgatePago`) | Baixo. A mesma garantia vale para a seção 1 |
| Apagar | **Remove agendamentos pendentes** de faturas que, no recálculo, ficaram sem gasto, **sem prévia**. Faturas de ciclo passado ficam intactas | Seção 2 **exclui lançamentos** ("fantasmas") e a seção 4 exclui duplicatas — sempre depois da prévia, e a 4 grava histórico antes |
| Recriar algo já baixado | Não: executados são preservados | Não |
| Saldos | Grava o saldo das contas Ger. de **todos** os cartões, sem mostrar antes | Não mexe em saldo (fica para o "Reconciliar") |
| Escopo maior que a tela | Sim: o cartão inteiro, e os saldos Ger. de todos | Seção 4 olha todas as faturas do cartão |

### "Revisar Movimentos Automáticos" × "Reconciliar Gerenciais"

| | Revisar | Reconciliar |
|---|---|---|
| Prévia antes de agir | Sim | Não |
| Etapa A por gasto (`applyEnsureGerencial`) | Sim | Não (só os agendamentos) |
| Agendamentos geridos | Sim, só da fatura da tela | Sim, de todas as faturas do cartão |
| Saldo gravado das contas Ger. | **Não** | Sim |
| Fantasmas e detalhamento divergente | Sim | Não |
| Competência fora do lugar | Sim | Não |
| Histórico das correções | Só na seção 4 | Não |

**Dá para juntar** num único "Verificar e corrigir gerenciais", porque os dois usam o mesmo núcleo
(`reconcileFaturaState`):
1. Rodar a prévia do "Revisar" (seções 1–4).
2. Acrescentar o passo B do "Reconciliar" como **mais uma seção da prévia** ("Saldo da conta Ger.: gravado
   R$ X, pelas transferências R$ Y").
3. Aplicar só o que o usuário confirmar, registrando no histórico.

O "Atualizar" pode sair: faz o mesmo que o "Reconciliar", sem prévia, e com um toast que não diz o que
fez.

### O que cada botão encontraria hoje — fatura Nov/2026 (vm)

Medido por SQL: gastos do grupo G da fatura × transferências de reserva gerencial (etapa A) que
apontam para esses gastos (as `tx_gerA_*` automáticas e as `tx_ger_*` do "Executar Gerenciais") ×
saldo da conta Ger.

| Cartão | Grupo G | Etapas A | Diferença | Conta Ger.: saldo gravado / pelas transferências | Agendamentos da fatura |
|---|---|---|---|---|---|
| **Itaupers** | 181 · R$ 15.281,75 | 176 · R$ 14.845,05 | **R$ 436,70 (5 faltando)** | R$ 14.845,05 / R$ 14.845,05 | devolução 14.845,05 · resgates 3.594,22 e 4.030,71 · pagamento 22.568,46 |
| ITAUAZUL | 5 · R$ 209,58 | 5 · R$ 209,58 | 0 | R$ 209,58 / R$ 209,58 | devolução 209,58 · resgates 369,34 e 52,72 · pagamento 693,20 |
| NUGI | 0 | 0 | 0 | R$ 0,00 / R$ 0,00 | nenhum |
| NUBANK | 0 | 0 | 0 | sem conta Ger. | nenhum |
| BBCCRED | 0 | 0 | 0 | R$ 54,35 / R$ 54,35 | pagamento 24,00 |

**Itaupers, as 5 etapas A faltando (R$ 436,70)**

| Lançamento | Data | Descrição | Valor |
|---|---|---|---|
| tx_1793381502101_q1ikzhbr71 | 24/10 | CABELOS FILHOS | 120,00 |
| tx_1793381185489_v5hdhix5yzn | 25/10 | Amazonprimebr | 19,90 |
| tx_1793359242212_b4cc72bssjo | 26/10 | Ebn *Spotify | 40,90 |
| tx_1793358964217_eyob5kqcj1b | 27/10 | VIVO | 216,00 |
| tx_1793359060890_jucqmubmjb | 27/10 | Apple.com/bill | 39,90 |

**Causa provável (achado deste diagnóstico)**
- Os cinco foram criados em 30/10 pelo **registro de agendamento** (origin `agendamento`).
- Foram gravados com `account_type` **vazio**. O motor gerencial só considera gasto de cartão com
  `accountType === 'credit'` — inclusive o `computeRevisaoFatura` do "Revisar" e o passo A do
  `reconciliarGerencial`.
- No banco, os únicos gastos de cartão sem `account_type` são esses 5, mais o IOF da Neon (R$ 2,90,
  sem grupo).

**Consequência: nenhum dos três botões corrige esse caso.** O "Revisar" mostraria a fatura sem as 5
etapas como "em ordem". O "Reconciliar"/"Atualizar" não acharia nada a mudar: a devolução
(14.845,05) e o saldo Ger. (14.845,05) já batem com as etapas existentes.

Correção sugerida (não aplicada):
1. Gravar `account_type = 'credit'` nesses 6 lançamentos.
2. Rodar o "Revisar", que então criaria as 5 etapas A e levaria a devolução a R$ 15.281,75.
3. Achar e corrigir o ponto do registro de agendamento de cartão que grava sem `accountType`.

**O motor de integridade** (regras, desde 08/2026) já aponta esse caso: 5 `GER_ETAPA_A_FALTANDO` + 5
`CADEIA_INCOMPLETA` em 11/2026 e `GER_FECHAMENTO_FATURA` 11/2026 ("gastos G R$ 15.281,75 × etapas A
R$ 14.845,05 × devolução R$ 14.845,05, diferença R$ 436,70").

**Outros apontamentos do motor nos 5 cartões**

| Cartão | Apontamento |
|---|---|
| Itaupers | `GER_SALDO_SUBCONTA` 11/2026 (saldo 14.845,05 × esperado 17.730,55); 32 `GER_ETAPA_A_FALTANDO` em 12/2026 (fatura futura: a etapa A só nasce pelo "Executar Gerenciais", o que é esperado) |
| ITAUAZUL | `GER_SALDO_SUBCONTA` 12/2026 (209,58 × 0) |
| BBCCRED | `GER_SALDO_SUBCONTA` 05/2026 (54,35 × 0) |
| Vários | `PARCELA_SEM_VINCULO` / `SERIE_PARCELAS_INCOMPLETA` (séries sem `serie_id`) — fora do escopo dos botões |

## Parte B — faturas antigas que aparecem como "não pagas"

> **Correção (14/11, depois do diagnóstico):** no vm e no teste1, as faturas 03/2026 e 04/2026 do
> Itaupers e a 10/2024 do ITAUAZUL **já estão marcadas como fechadas**. "Fechar fatura" não é
> necessário para elas, e a seção g do "Verificar e corrigir" só lista fatura antiga ainda NÃO
> fechada (por isso não as mostra). A duplicata da Amazon continua valendo, porque a seção d olha
> também as faturas fechadas.

São faturas **anteriores à última fatura paga** do cartão e que, pela regra da tela, ainda aparecem
como não pagas. Encontradas em **todos** os cartões do vm:

| Cartão | Última fatura paga | Faturas antigas não pagas |
|---|---|---|
| Itaupers | 10/2026 | 03/2026, 04/2026 |
| ITAUAZUL | 10/2026 | 10/2024 |
| NUGI, BBCCRED | 10/2026 | nenhuma |
| NUBANK, SWILE, Caju, Midway | nenhuma paga | nenhuma |

### Itaupers 03/2026 — total R$ 26,36, pago 0

| id | data | descrição | valor | fatura_ref | conciliado | origem |
|---|---|---|---|---|---|---|
| tx_1781713596579_z82del65iub | 13/03/2026 | MP *OUTLETCENTERB 01/10 | 26,36 | 03/2026 | não | manual (criado 17/06) |

### Itaupers 04/2026 — total R$ 67,55, pago 0

| id | data | descrição | valor | fatura_ref | conciliado | origem |
|---|---|---|---|---|---|---|
| tx_1781666606862_6dntyzsramh | 13/04/2026 | LOJAS AMERIC-CT 501/05 | 41,19 | 04/2026 | não | manual (criado 17/06) |
| tx_1781713596579_ljm3iu0rr48 | 13/04/2026 | MP *OUTLETCENTERB 02/10 | 26,36 | 04/2026 | não | manual (criado 17/06) |

**Motivo provável (Itaupers):**
- São as **primeiras parcelas** de séries lançadas à mão em 17/06 (1/10, 2/10 e 1/5).
- A data cai em março e abril, antes de as faturas serem acompanhadas no Finup (o primeiro pagamento
  registrado é da fatura 05/2026).
- As faturas de março e abril foram pagas fora do Finup. As parcelas seguintes das mesmas séries estão
  nas faturas 05 a 10/2026, que constam como pagas.

**Correção sugerida:** **não excluir** (são parte das séries). Marcar as faturas 03 e 04/2026 do
Itaupers como **fechadas** (botão "Fechar Fatura", que já existe) ou registrar um "pagamento histórico".
Com a regra atual ("depois da última paga") elas já não atrapalham a fatura padrão.

### ITAUAZUL 10/2024 — total R$ 47,40, pago 0

| id | data | descrição | valor | fatura_ref | conciliado | origem |
|---|---|---|---|---|---|---|
| tx_1792083424139_wx4y4wc75f | 15/09/2026 | Amazon Br *Amazon Br | 47,40 | **10/2024** | não | importacao_fatura (importação de 15/10/2026, arquivo "fatura-fechada-final 5060-outubro2026 (1).xlsx", gravada com mês 2024-10) |

**Duplicata:** há **outra** Amazon Br de R$ 47,40 com a mesma data (15/09/2026) na fatura correta,
10/2026: `tx_1789736098210_ljp7acpz2oc`, importada em 18/09.

**Motivo provável:** a importação de 15/10/2026 foi gravada com o **mês de referência 2024-10**
(ano errado). A linha que já existia na 10/2026 não foi reconhecida como a mesma, porque o casamento é
por fatura. O motor de integridade já aponta `COMPETENCIA_IMPLAUSIVEL` 10/2024.

**Correção sugerida:** **excluir a duplicata** `tx_1792083424139_wx4y4wc75f`. É exatamente o que a seção
4 do "Revisar" (competência) propõe como `excluir_duplicata`. Conferir antes que a importação de
15/10 não deixou outras linhas em 10/2024 (no vm só ficou esta).

## Parte C — proposta (nada aplicado)

| Mudança | Impacto | Risco |
|---|---|---|
| **Remover "Atualizar"** | Some um botão que repete o "Reconciliar" sem prévia e com um aviso enganoso (mostra o total) | Baixo: tudo o que ele faz já roda ao salvar ou importar e continua no botão unificado |
| **Juntar "Revisar" + "Reconciliar" em "Verificar e corrigir gerenciais"** com prévia por seção (etapas A, agendamentos, detalhamento, saldo da conta Ger., competência, faturas antigas) e confirmação | Uma ação só, sempre com prévia; o saldo Ger. deixa de ser regravado às cegas | Médio: é UI nova sobre o mesmo núcleo; as funções protegidas só são chamadas, não alteradas |
| **Esconder num menu "⋯ Mais"**, só para administrador, e **invisível com o controle gerencial desligado** | Cliente comum não vê ferramenta técnica; quem desligou o controle não tem os dados gerenciais recalculados | Baixo |
| **Corrigir o motor para não depender de `accountType`** gravado (usar o tipo da conta) **ou** garantir `account_type = 'credit'` no registro de agendamento de cartão | Resolve a causa das 5 etapas A faltando no Itaupers (R$ 436,70), que nenhum botão corrige hoje | **Toca funções protegidas** (`reconcileFaturaState`/`applyEnsureGerencial` filtram por `accountType`) se for pelo motor → precisa de autorização. Pelo lado do registro de agendamento, não toca nada protegido |
| **Aviso automático ao abrir a fatura**, pelo motor de integridade: as regras `GER_FECHAMENTO_FATURA`, `GER_SALDO_SUBCONTA`, `GER_ETAPA_A_FALTANDO` e `NUM_RESGATE_*` são puras e rodam no navegador (o "Revisar" já usa as de competência). Mostrar só quando houver diferença ("A fatura 11/2026 tem R$ 436,70 do grupo G sem reserva na Ger. Itaupers. Corrigir?") e abrir o "Verificar e corrigir" na seção certa; o botão manual fica como plano B | Viável e barato para **uma fatura**: as regras recebem um recorte (`desde`) e não exigem o motor inteiro | Baixo, se for só aviso. Deve respeitar fatura fechada (as regras já fazem) e ficar invisível com o controle desligado |
| **Faturas antigas no mesmo "Verificar e corrigir"**: seção "Faturas anteriores à última paga, ainda abertas", com as ações "Fechar fatura" (Itaupers 03 e 04/2026) e "Excluir duplicata" (ITAUAZUL 10/2024, que já vem da regra de competência) | Limpa os restos sem SQL manual | Baixo: as ações já existem (fechar fatura; excluir com histórico) |

**Ordem sugerida**
1. Corrigir o registro de agendamento de cartão (`account_type`) e os 6 lançamentos (com prévia SQL e o
   seu OK).
2. Unificar os botões com prévia e escondê-los no "⋯ Mais".
3. Aviso automático por fatura.
4. Seção de faturas antigas.
