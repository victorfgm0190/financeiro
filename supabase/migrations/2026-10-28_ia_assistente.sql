-- ASSISTENTE IA (etapa 1): pré-lançamentos (prévia fechada sem confirmar — não afetam saldo, fatura,
-- grupos gerenciais nem relatórios), apelidos aprendidos com as correções e consumo da API. Só
-- tabelas novas, nenhum dado muda. A rota também cria se faltar (api/_ia.js ensureIaSchema).
CREATE TABLE IF NOT EXISTS ia_pre_lancamentos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tipo TEXT NOT NULL CHECK (tipo IN ('lancamento', 'agendamento')),
  payload JSONB NOT NULL,
  texto_original TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'efetivado', 'descartado')),
  lancamento_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ia_apelidos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tipo TEXT NOT NULL CHECK (tipo IN ('categoria', 'conta', 'favorecido', 'descricao_fatura')),
  termo TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  usos INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, termo)
);
CREATE TABLE IF NOT EXISTS ia_uso (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ambiente TEXT,
  ferramenta TEXT,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_saida INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
