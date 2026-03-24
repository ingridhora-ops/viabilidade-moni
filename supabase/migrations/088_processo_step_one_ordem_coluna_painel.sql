-- Ordem manual dos cards dentro de cada coluna (etapa_painel) nos Kanbans.
ALTER TABLE public.processo_step_one
  ADD COLUMN IF NOT EXISTS ordem_coluna_painel INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.processo_step_one.ordem_coluna_painel IS 'Ordem de exibição do card na coluna etapa_painel (menor = mais acima).';

-- Backfill estável por fase: mais antigo primeiro (alinhado ao histórico).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY etapa_painel
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) - 1 AS rn
  FROM public.processo_step_one
)
UPDATE public.processo_step_one p
SET ordem_coluna_painel = ranked.rn
FROM ranked
WHERE p.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_processo_step_one_etapa_ordem
  ON public.processo_step_one (etapa_painel, ordem_coluna_painel);
