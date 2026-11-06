-- Ganho e perda de capital nos ambientes que já existem (src/lib/kitCategorias.js). O cadastro de bem
-- exige uma categoria de perda e uma de ganho. Idempotente:
--   • só insere a que não existir: compara os nomes sem acento e sem maiúsculas ("Perda de Capital" =
--     "Perda de capital"), e o id do kit;
--   • banco sem nenhuma categoria não recebe nada: ambiente novo ganha pelo kit básico, depois das migrações;
--   • o grupo entra em configuracoes.category_groups só se a categoria foi criada nele.
DO $$
BEGIN
  -- Um IF por vez: cada comando só é analisado ao executar, e a tabela pode não existir.
  IF to_regclass('categorias') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'categorias' AND column_name = 'category_group') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM categorias) THEN
    RETURN;
  END IF;

  INSERT INTO categorias (id, name, type, color, icon, category_group)
  SELECT k.id, k.name, k.type, k.color, k.icon, 'Ganho e perda de capital'
    FROM (VALUES
      ('cat_kit_ganho_capital', 'Ganho de capital', 'income', '#22c55e', '📈'),
      ('cat_kit_perda_capital', 'Perda de capital', 'expense', '#ef4444', '📉')
    ) AS k(id, name, type, color, icon)
   WHERE NOT EXISTS (
     SELECT 1 FROM categorias c
      WHERE c.id = k.id
         OR lower(btrim(translate(c.name, 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))) = lower(k.name)
   )
  ON CONFLICT (id) DO NOTHING;

  IF to_regclass('configuracoes') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'configuracoes' AND column_name = 'category_groups') THEN
    UPDATE configuracoes
       SET category_groups = COALESCE(category_groups, '[]'::jsonb) || to_jsonb('Ganho e perda de capital'::text)
     WHERE EXISTS (SELECT 1 FROM categorias WHERE category_group = 'Ganho e perda de capital')
       AND NOT COALESCE(category_groups, '[]'::jsonb) ? 'Ganho e perda de capital';
  END IF;
END $$;
