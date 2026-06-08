CREATE TABLE public.generated_cvs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cv_id UUID NOT NULL REFERENCES public.talent_hub_cvs(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('pdf','docx')),
  storage_path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_title TEXT,
  anonymized BOOLEAN NOT NULL DEFAULT true,
  generated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_cvs TO authenticated;
GRANT ALL ON public.generated_cvs TO service_role;

ALTER TABLE public.generated_cvs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team members can view generated cvs"
  ON public.generated_cvs FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','ceo','division_director','division_manager','sourcing_team']::app_role[]));

CREATE POLICY "team members can insert generated cvs"
  ON public.generated_cvs FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','ceo','division_director','division_manager','sourcing_team']::app_role[]));

CREATE POLICY "team members can delete generated cvs"
  ON public.generated_cvs FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','ceo','division_director','division_manager','sourcing_team']::app_role[]));

CREATE INDEX idx_generated_cvs_cv_id ON public.generated_cvs(cv_id, created_at DESC);