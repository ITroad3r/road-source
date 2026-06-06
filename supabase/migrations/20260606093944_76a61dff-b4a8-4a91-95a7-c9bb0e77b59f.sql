
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid,
  cv_id uuid,
  demand_candidate_id uuid,
  author_id uuid,
  kind text NOT NULL DEFAULT 'note',
  body text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (demand_id IS NOT NULL OR cv_id IS NOT NULL OR demand_candidate_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

CREATE INDEX activity_log_demand_idx ON public.activity_log(demand_id) WHERE demand_id IS NOT NULL;
CREATE INDEX activity_log_cv_idx ON public.activity_log(cv_id) WHERE cv_id IS NOT NULL;
CREATE INDEX activity_log_dc_idx ON public.activity_log(demand_candidate_id) WHERE demand_candidate_id IS NOT NULL;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Anyone signed-in can view (mirrors permissive access on talent_hub_cvs and demand visibility)
CREATE POLICY "Activity: signed-in view"
ON public.activity_log FOR SELECT TO authenticated
USING (true);

-- Signed-in users may insert entries authored by themselves
CREATE POLICY "Activity: insert as self"
ON public.activity_log FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid());

-- Authors edit/delete their own; admins/managers can manage anything
CREATE POLICY "Activity: author or manager update"
ON public.activity_log FOR UPDATE TO authenticated
USING (author_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
WITH CHECK (author_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

CREATE POLICY "Activity: author or manager delete"
ON public.activity_log FOR DELETE TO authenticated
USING (author_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

CREATE TRIGGER trg_activity_log_updated
BEFORE UPDATE ON public.activity_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-log when a demand candidate stage changes
CREATE OR REPLACE FUNCTION public.log_pipeline_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
    VALUES (
      NEW.demand_id,
      NEW.cv_id,
      NEW.id,
      auth.uid(),
      'stage_change',
      'Stage changed from ' || OLD.stage::text || ' to ' || NEW.stage::text,
      jsonb_build_object('from', OLD.stage, 'to', NEW.stage)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_pipeline_stage_change
AFTER UPDATE ON public.demand_candidates
FOR EACH ROW EXECUTE FUNCTION public.log_pipeline_stage_change();

-- Auto-log when a candidate is added to a pipeline
CREATE OR REPLACE FUNCTION public.log_pipeline_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
  VALUES (
    NEW.demand_id,
    NEW.cv_id,
    NEW.id,
    COALESCE(NEW.submitted_by, auth.uid()),
    'pipeline_added',
    'Candidate added to pipeline at stage ' || NEW.stage::text,
    jsonb_build_object('stage', NEW.stage)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_pipeline_added
AFTER INSERT ON public.demand_candidates
FOR EACH ROW EXECUTE FUNCTION public.log_pipeline_added();

-- Auto-log demand status changes
CREATE OR REPLACE FUNCTION public.log_demand_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.activity_log (demand_id, author_id, kind, body, metadata)
    VALUES (
      NEW.id,
      auth.uid(),
      'status_change',
      'Demand status changed from ' || OLD.status::text || ' to ' || NEW.status::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.activity_log (demand_id, author_id, kind, body, metadata)
    VALUES (
      NEW.id,
      auth.uid(),
      'assignment',
      'Demand assignee changed',
      jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_demand_status_change
AFTER UPDATE ON public.demands
FOR EACH ROW EXECUTE FUNCTION public.log_demand_status_change();
