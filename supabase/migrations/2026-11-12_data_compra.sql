-- Data da COMPRA original das parcelas de cartão (decisão 9 de docs/importar-fatura-6b-diagnostico.md,
-- 12/11/2026). TEXT 'AAAA-MM-DD', gravada em TODAS as parcelas da série (vinda do date_cartao da parcela 1
-- ou da linha do Itaú, que traz a data da compra). Serve para mostrar "Parcela 2/3 · compra em 12/11" e
-- para calcular a data de registro das parcelas novas (mesmo dia da compra, N-1 meses depois).
-- date_cartao continua sendo "o que veio no arquivo" e não muda de papel no casamento da importação.
-- Aditiva e idempotente: nenhum dado existente é alterado (as parcelas antigas ficam com NULL).
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS data_compra TEXT;
