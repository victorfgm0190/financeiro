-- SUBCONTAS GERENCIAIS identificadas pelo VÍNCULO (não pelo nome): as contas que recebem a etapa A
-- (tx_gerA_* / origin 'etapa_a') ou a provisão gerencial ('auto-provisao'), ou que são a conta das
-- devoluções gerenciais (agendamentos tipo 'gerencial_devolucao'), passam a ter type 'gerencial' e
-- is_gerencial = true — a marca que o Assistente IA usa para nunca gravar nelas. Desde 29/10 o
-- próprio motor já cria a subconta assim. Cartão de crédito nunca é marcado. Idempotente.
UPDATE contas SET type = 'gerencial', is_gerencial = true
 WHERE type <> 'credit'
   AND (type IS DISTINCT FROM 'gerencial' OR is_gerencial IS NOT TRUE)
   AND id IN (
     SELECT to_account_id FROM lancamentos
      WHERE to_account_id IS NOT NULL AND (id LIKE 'tx\_gerA\_%' OR origin IN ('etapa_a', 'auto-provisao'))
     UNION
     SELECT account_id FROM agendamentos WHERE tipo = 'gerencial_devolucao' AND account_id IS NOT NULL
   );
