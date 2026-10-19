# FINUP — instruções para o Claude

## Funções protegidas

NUNCA modificar (nem refatorar, renomear ou "só ajustar um detalhe") sem pedido explícito do usuário:

- `reconciliarGerencial()` — `src/context/AppContext.jsx`
- `getSaldoPrincipalBreakdown()` — wrapper em `src/context/AppContext.jsx`; o cálculo mora em
  `calcularSaldoPrincipalBreakdown()` — `src/lib/saldoPrincipal.js` (também protegida; ver
  `docs/saldo-principal.md`)
- `recalcularAgendamentosFatura()` — `src/context/AppContext.jsx`
- `reconcileFaturaState()` — `src/context/AppContext.jsx`
- `applyEnsureGerencial()` — `src/context/AppContext.jsx`
- o componente `src/components/Patrimonio/PatrimonioEditavel.jsx`

Chamar essas funções é permitido; alterar o corpo, a assinatura ou o comportamento delas, não. Se uma
tarefa parecer exigir mudança numa delas, pare e pergunte. Ao entregar, informe quais funções foram
tocadas.

## Restrições de arquitetura

Invariantes que valem para qualquer mudança:

- Saldo de conta corrente vem só dos lançamentos, via `recalcularSaldo()` no frontend. Nunca gravar
  saldo direto pelo backend (gera contagem dobrada).
- `addTransaction` respeita IDs vindos de fora (evita duplicação na sincronização).
- `contas.id` é TEXT; tabelas novas usam PK/FK TEXT com `gen_random_uuid()::text`.
- `lancamentos.date` é TEXT: agrupar por mês com `SUBSTRING(date, 1, 7)`, não `TO_CHAR`.
- Cartão: filtrar por `fatura_ref`, não por intervalo de `date`.
- `card_id` sozinho traz só parte dos registros: a maioria das parcelas tem `account_id` preenchido
  e `card_id` NULL.
- `lancamentos.origin` é gravado na criação e nunca alterado.
- SELECT de preview antes de qualquer DELETE/UPDATE no banco; ajustes de saldo atômicos.
- Acesso ao Neon sempre via `/api` (o navegador nunca fala com o banco).
