-- Data de adesão por cota: cotas do mesmo consórcio podem ser compradas em datas diferentes.
-- consorcios.data_adesao continua existindo só como padrão sugerido ao incluir uma cota nova.
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS data_adesao TEXT;

-- Cotas já cadastradas herdam a data que estava no consórcio.
UPDATE consorcio_cotas q
   SET data_adesao = c.data_adesao
  FROM consorcios c
 WHERE c.bem_id = q.bem_id
   AND q.data_adesao IS NULL
   AND c.data_adesao IS NOT NULL;
