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
- **Conta do contrato.** Só conta corrente comum; cartão de crédito fica de fora nesta 1ª versão.

## Pendências registradas (não corrigir sem pedido)

- `registerScheduleOccurrence` (`AppContext.jsx`): no resgate com detalhamento por função, o `newTxId` devolvido não corresponde a nenhum lançamento.
- Pagamento de parcela de financiamento pelo Patrimônio (`api/financiamento/parcela/[id]/pagar.js`): marca `registered` só no servidor, sem `registered_meta` e sem atualizar o estado do app.
- Para corrigir no início da Entrega 2, mostrando o diff antes: `reverseTransaction` usa `tx.date` em vez de `dataOcorrencia` e não limpa `registeredMeta`; `deleteTransaction` deixa a baixa órfã.
