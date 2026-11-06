-- Lançamento em período já fechado nas Reservas: o lançamento é gravado e fica aqui uma pendência, até o
-- usuário escolher entre Ajuste no próximo período aberto ou Reabrir (src/lib/viradaReserva.js).
-- Idempotente. Não altera nenhum dado existente: só cria a tabela e os índices.
--
-- valor = entrada − saida: quanto o saldo deixou de refletir (edição: a diferença; exclusão: negativo).
-- function_id NULL: o lançamento mexe na conta de reserva sem função (ex.: rendimento atrasado).
-- status: pendente | ajustado (ajuste_id = o ajuste criado) | reaberto | cancelado (edições se anularam).
-- Sem chave estrangeira em lancamento_id: a pendência da exclusão sobrevive ao lançamento apagado.
CREATE TABLE IF NOT EXISTS reserve_pendencias_fechado (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lancamento_id TEXT NOT NULL,
  function_id TEXT,
  account_id TEXT,
  data TEXT NOT NULL,
  entrada NUMERIC(14,2) NOT NULL DEFAULT 0,
  saida NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor NUMERIC(14,2) NOT NULL,
  descricao TEXT,
  motivo TEXT NOT NULL DEFAULT 'novo',
  status TEXT NOT NULL DEFAULT 'pendente',
  ajuste_id TEXT,
  criado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvido_em TIMESTAMPTZ,
  resolvido_por TEXT
);
CREATE INDEX IF NOT EXISTS ix_reserve_pendencias_fechado_status ON reserve_pendencias_fechado (status);
-- Uma pendência aberta por lançamento, função e conta: a segunda edição soma na mesma linha.
CREATE UNIQUE INDEX IF NOT EXISTS ux_reserve_pendencias_fechado_aberta
  ON reserve_pendencias_fechado (lancamento_id, COALESCE(function_id, ''), COALESCE(account_id, ''))
  WHERE status = 'pendente';
