-- ============================================================
-- AGENDA NO CELULAR: escolher quais agendamentos vão para o feed .ics. Coluna nova com padrão
-- true: todo agendamento existente continua sincronizando (nenhum dado muda). O calendário dentro
-- do app mostra todos; o feed exporta só sincronizar_agenda = true. Idempotente; num banco sem a
-- tabela agendamentos (bancos de teste das migrações) não faz nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('agendamentos') IS NOT NULL THEN
    ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS sincronizar_agenda BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
