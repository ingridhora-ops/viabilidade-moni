-- Templates e instâncias de documentos (Step 3 / Step 7, Autentique, revisão).
-- Substitui arquivo corrompido que continha apenas "image.png".

CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL,
  step INTEGER NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT true,
  arquivo_path TEXT,
  metadados JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_templates_area_step_ativo
  ON public.document_templates (area, step, ativo, versao DESC);

CREATE TABLE IF NOT EXISTS public.document_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES public.processo_step_one (id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  template_id UUID REFERENCES public.document_templates (id) ON DELETE SET NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'aguardando_revisao',
  arquivo_preenchido_path TEXT,
  arquivo_assinado_path TEXT,
  diff_json JSONB,
  motivo_reprovacao TEXT,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  analisado_por UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  analisado_em TIMESTAMPTZ,
  autentique_document_id TEXT,
  assinatura_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_instances_processo_step
  ON public.document_instances (processo_id, step);

CREATE INDEX IF NOT EXISTS idx_document_instances_autentique_doc
  ON public.document_instances (autentique_document_id)
  WHERE autentique_document_id IS NOT NULL;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_templates_select_authenticated" ON public.document_templates;
CREATE POLICY "document_templates_select_authenticated"
  ON public.document_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "document_templates_manage_consultor_admin" ON public.document_templates;
CREATE POLICY "document_templates_manage_consultor_admin"
  ON public.document_templates FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'consultor', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'consultor', 'supervisor')
    )
  );

DROP POLICY IF EXISTS "document_instances_authenticated_all" ON public.document_instances;
CREATE POLICY "document_instances_authenticated_all"
  ON public.document_instances FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.document_templates TO postgres, service_role;
GRANT ALL ON public.document_instances TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_instances TO authenticated;
