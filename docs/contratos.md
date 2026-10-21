# Módulo de Contratos

Contratos de aluguel (e serviço) ligados aos agendamentos. O plano completo está no doc "FINUP — Plano do módulo de Contratos".

## Como funciona

- **As parcelas são agendamentos.** Não existe uma tabela própria de parcelas.
  - Cada parcela é um agendamento `'once'`, identificado por `contrato_id` + `contrato_papel`.
  - O id é determinístico: `ctr_<contrato>_<papel>_<AAAAMM>`.
  - As parcelas são gravadas pelo `/api/sync`, como qualquer agendamento.
- **A ficha do contrato não passa pelo `/api/sync` genérico.** As tabelas `contratos`, `contrato_itens`, `contrato_eventos` e `indices_cache` são lidas e gravadas por rotas dedicadas:
  - `api/contratos.js`
  - `api/contrato-itens.js`
  - `api/contrato-eventos.js`
  - `api/indices.js`
- **Lógica pura** (com testes) em `src/lib/contratos/`:
  - `parcelas.js`: plano, reajuste, sincronização e confirmação de reajuste.
  - `vinculo.js`: candidatos a vínculo e plano de vínculo e desvínculo.
- **Estado e ações** ficam em `src/hooks/useContratos.js`, exposto pelo `useApp()`. A interface fica em `src/components/Contratos/`.
- **Plano do ambiente.** O módulo está ligado quando `ambientes.modulos.contratos` é `true` no `finup_central`.
  - Essa informação vai no token, para a interface.
  - A API confere o valor do central a cada requisição (`MODULOS_DE_PLANO` em `src/lib/permissoes.js`).
  - Depois de ligar o módulo para um ambiente, o usuário precisa entrar de novo para ver o menu.

## Regras

- **Parcela paga nunca muda.** Reajuste, aditivo, renovação e rescisão só mexem nas pendentes. Uma pendente com valor editado à mão (valor diferente da composição) também não é sobrescrita.
- **Reajuste.** Acontece nos aniversários de 12 meses (ou no mês-base, nunca antes de 1 ano).
  - As parcelas depois de um aniversário ficam como `valor_status = 'projetado'` (último valor confirmado × acumulado de 12 meses) até alguém confirmar.
  - "Confirmar reajuste" com escopo "Sim" vale para o ciclo inteiro e reprojeta os ciclos seguintes. Com "Não", vale só para aquela parcela.
- **Vínculo (D2).** A série existente mantém o histórico e recebe o `contrato_id`.
  - Se tem ocorrências consumidas, vira parcelada com total igual ao número delas.
  - Sem nenhuma consumida, vira a parcela única da próxima ocorrência.
  - O contrato não gera parcelas nos meses que a série já cobre.
- **Exclusão de parcela.** Passa pelo modal do contrato. A parcela excluída é registrada em evento `edicao_parcela` e não volta quando as parcelas são geradas de novo.
- **Contrato sem data de fim.** Ao abrir o app, as parcelas são estendidas até 12 meses à frente, só criando competências depois da última que já existe.
- **Manutenção ao abrir o app** (contrato ativo): a descrição das pendentes segue o contrato e, com o índice conhecido, as parcelas ainda PROJETADAS são recalculadas. Parcela projetada sem índice fica no valor anterior (0%) e guarda `composicao.projecao.taxa_pct = null`.
- **Índices.** O SGS do Banco Central é consultado por intervalo de datas (30 meses). O `ultimos/N` aceita no máximo 20 valores e, acima disso, responde HTTP 200 com `{"erro":{}}`.
- **Edição de parcela de contrato.** Frequência, ocorrência e data-base (competência) ficam travadas. O vencimento muda pela exceção da ocorrência (`overrides[data-base].date`).
- **Conta do contrato.** Só conta corrente comum; cartão de crédito fica de fora nesta 1ª versão.

## Entrega 2 — pagamento, condomínio e créditos

- **Gancho de efetivação (P5).** `registerScheduleOccurrence`, `markScheduleRegistered` (baixa que aponta um lançamento pago ou importado), `baixarCobrancaRecorrente` e o auto-registro chamam `posEfetivacaoRef` → `useContratos.notificarEfetivacao`.
  - Uma fila é processada quando o estado já tem a baixa e o lançamento.
  - A decisão é pura: `src/lib/contratos/efetivacao.js`.
  - As perguntas aparecem no `ContratoEfetivacaoHost` (composição do boleto; "aplicar às próximas do ciclo?").
  - `baixarComoJaNoCartao` não dispara: contrato não aceita cartão.
- **Estorno/exclusão.** `reverseTransaction` e `deleteTransaction` chamam `reverterEfetivacaoRef`. O crédito compensado volta a aberto; o gerado (se ainda aberto) sai; um evento é registrado.
- **Composição do boleto** (`ComposicaoBoletoModal`): digitar, colar texto (`parsearTextoBoleto`) ou foto (em breve, `imagemBoleto.js`).
  - Regras em `contrato_regras_itens`: a do contrato vence a global, "começa com" vence "contém".
  - A soma dos itens tem de ser igual ao valor pago.
  - "Pular" usa a composição estimada, marcada para revisar.
- **Créditos do proprietário** (`contrato_creditos`): só controle, nunca lançamento.
  - Cada crédito aberto abate no PRÓXIMO ALUGUEL PENDENTE com vencimento ≥ data do crédito (`src/lib/contratos/creditos.js`).
  - "Não abater neste mês" adia o abatimento (`composicao.creditos_adiados`).
- **Relatórios.** "Despesa real / Valor pago" (`src/lib/contratos/despesaReal.js`) no relatório por categoria e no Orçado×Realizado. A pizza do Painel segue em valor pago.
- **Edição de parcela de contrato.** Usa a regra de registros separados (como a parcela de financiamento) e registra o evento `edicao_parcela`.
- **Regras globais iniciais.** Vêm do kit básico (clientes novos) e de `sql/contratos_entrega2.sql` (bancos existentes).

## Pendências registradas (não corrigir sem pedido)

- `registerScheduleOccurrence` (`AppContext.jsx`): no resgate com detalhamento por função, o `newTxId` devolvido não corresponde a nenhum lançamento.
- Pagamento de parcela de financiamento pelo Patrimônio (`api/financiamento/parcela/[id]/pagar.js`): marca `registered` só no servidor, sem `registered_meta` e sem atualizar o estado do app.
- (Corrigido em 3031c84) `reverseTransaction` pela data da ocorrência e limpando `registeredMeta`; `deleteTransaction` reabrindo a baixa.
