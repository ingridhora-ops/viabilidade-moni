-- Esvaziar rede_franqueados (ex.: dados de seed).
-- Evita TRUNCATE, que falha quando há FKs ativas.
-- Primeiro zera as colunas FK que apontam para public.rede_franqueados, depois faz DELETE.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey) AS u(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum AND NOT a.attisdropped
    WHERE c.confrelid = 'public.rede_franqueados'::regclass
      AND c.contype = 'f'
  LOOP
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I IS NOT NULL', r.tbl, r.col, r.col);
  END LOOP;
END $$;

DELETE FROM public.rede_franqueados;
