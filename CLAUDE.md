# FINUP — instruções para o Claude

## Funções protegidas

NUNCA modificar (nem refatorar, renomear ou "só ajustar um detalhe") sem pedido explícito do usuário:

- `reconciliarGerencial()` — `src/context/AppContext.jsx`
- `getSaldoPrincipalBreakdown()` — `src/context/AppContext.jsx`
- `recalcularAgendamentosFatura()` — `src/context/AppContext.jsx`
- `reconcileFaturaState()` — `src/context/AppContext.jsx`
- `applyEnsureGerencial()` — `src/context/AppContext.jsx`
- o componente `src/components/Patrimonio/PatrimonioEditavel.jsx`

Chamar essas funções é permitido; alterar o corpo, a assinatura ou o comportamento delas, não. Se uma
tarefa parecer exigir mudança numa delas, pare e pergunte. Ao entregar, informe quais funções foram
tocadas.
