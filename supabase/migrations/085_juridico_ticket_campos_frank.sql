-- Campos preenchidos pelo Frank ao abrir o ticket: nome (obrigatório), condomínio e lote (opcionais)

ALTER TABLE public.juridico_tickets
  ADD COLUMN IF NOT EXISTS nome_frank TEXT,
  ADD COLUMN IF NOT EXISTS nome_condominio TEXT,
  ADD COLUMN IF NOT EXISTS lote TEXT;

COMMENT ON COLUMN public.juridico_tickets.nome_frank IS 'Nome do franqueado (obrigatório no formulário)';
COMMENT ON COLUMN public.juridico_tickets.nome_condominio IS 'Nome do condomínio (opcional)';
COMMENT ON COLUMN public.juridico_tickets.lote IS 'Lote (opcional)';
