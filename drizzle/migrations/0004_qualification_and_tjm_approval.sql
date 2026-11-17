DO $$ BEGIN
  CREATE TYPE public.qualification_status AS ENUM ('pending','qualified','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.final_decision AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.tjm_status AS ENUM ('draft','approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.demand_candidates
  ADD COLUMN IF NOT EXISTS qualification_status public.qualification_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS qualified_by uuid,
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualification_notes text,
  ADD COLUMN IF NOT EXISTS final_decision public.final_decision NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_notes text;

ALTER TABLE public.candidate_financials
  ADD COLUMN IF NOT EXISTS tjm_status public.tjm_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS tjm_approved_by uuid,
  ADD COLUMN IF NOT EXISTS tjm_approved_at timestamptz;

COMMENT ON COLUMN public.candidate_financials.client_rate IS 'Company TJM (validated commercial rate); candidate expectation stays on talent_hub_cvs.daily_rate';

CREATE OR REPLACE FUNCTION public.enforce_pipeline_decisions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); fin_status public.tjm_status; fin_exists boolean;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.qualification_status := 'pending'; NEW.qualified_by := NULL; NEW.qualified_at := NULL; NEW.qualification_notes := NULL;
    NEW.final_decision := 'pending'; NEW.decided_by := NULL; NEW.decided_at := NULL; NEW.decision_notes := NULL;
    RETURN NEW;
  END IF;

  -- Qualification
  IF NEW.qualification_status IS DISTINCT FROM OLD.qualification_status
     OR NEW.qualification_notes IS DISTINCT FROM OLD.qualification_notes THEN
    IF NOT public.has_any_role(uid, ARRAY['hrbp','operations']::public.app_role[]) THEN
      RAISE EXCEPTION 'Only HRBP or Operations can qualify candidates';
    END IF;
    NEW.qualified_by := uid; NEW.qualified_at := now();
    IF NEW.qualification_status IS DISTINCT FROM OLD.qualification_status THEN
      INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
      VALUES (NEW.demand_id, NEW.cv_id, NEW.id, uid, 'qualification',
        'Qualification changed from ' || OLD.qualification_status || ' to ' || NEW.qualification_status,
        jsonb_build_object('from', OLD.qualification_status, 'to', NEW.qualification_status, 'notes', NEW.qualification_notes));
    END IF;
  ELSE
    NEW.qualified_by := OLD.qualified_by; NEW.qualified_at := OLD.qualified_at;
  END IF;

  -- Final decision
  IF NEW.final_decision IS DISTINCT FROM OLD.final_decision
     OR NEW.decision_notes IS DISTINCT FROM OLD.decision_notes THEN
    IF NOT public.has_role(uid, 'operations') THEN
      RAISE EXCEPTION 'Only Operations can make the final decision';
    END IF;
    IF NEW.final_decision = 'approved' THEN
      IF NEW.qualification_status <> 'qualified' THEN
        RAISE EXCEPTION 'Candidate must be qualified by HRBP before final approval';
      END IF;
      SELECT true, f.tjm_status INTO fin_exists, fin_status
        FROM public.candidate_financials f WHERE f.demand_candidate_id = NEW.id LIMIT 1;
      IF fin_exists AND fin_status <> 'approved' THEN
        RAISE EXCEPTION 'TJM must be approved before final approval';
      END IF;
    END IF;
    NEW.decided_by := uid; NEW.decided_at := now();
    IF NEW.final_decision IS DISTINCT FROM OLD.final_decision THEN
      INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
      VALUES (NEW.demand_id, NEW.cv_id, NEW.id, uid, 'final_decision',
        'Final decision changed from ' || OLD.final_decision || ' to ' || NEW.final_decision,
        jsonb_build_object('from', OLD.final_decision, 'to', NEW.final_decision, 'notes', NEW.decision_notes));
    END IF;
  ELSE
    NEW.decided_by := OLD.decided_by; NEW.decided_at := OLD.decided_at;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_pipeline_decisions ON public.demand_candidates;
CREATE TRIGGER trg_enforce_pipeline_decisions BEFORE INSERT OR UPDATE ON public.demand_candidates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pipeline_decisions();

CREATE OR REPLACE FUNCTION public.enforce_tjm_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); is_ops boolean; dc record;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  is_ops := public.has_role(uid, 'operations');

  IF TG_OP = 'INSERT' THEN
    IF NEW.tjm_status = 'approved' THEN
      IF NOT is_ops THEN RAISE EXCEPTION 'Only Operations can approve TJM'; END IF;
      NEW.tjm_approved_by := uid; NEW.tjm_approved_at := now();
    ELSE
      NEW.tjm_approved_by := NULL; NEW.tjm_approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.client_rate IS DISTINCT FROM OLD.client_rate
      OR NEW.candidate_rate IS DISTINCT FROM OLD.candidate_rate
      OR NEW.margin IS DISTINCT FROM OLD.margin) AND OLD.tjm_status = 'approved' THEN
    IF NOT is_ops THEN RAISE EXCEPTION 'Approved TJM can only be changed by Operations'; END IF;
    -- Any rate change on an approved TJM sends it back to draft; re-approval is a separate step.
    NEW.tjm_status := 'draft';
  END IF;

  IF NEW.tjm_status IS DISTINCT FROM OLD.tjm_status THEN
    IF NOT is_ops THEN RAISE EXCEPTION 'Only Operations can change TJM approval'; END IF;
    IF NEW.tjm_status = 'approved' THEN
      NEW.tjm_approved_by := uid; NEW.tjm_approved_at := now();
    ELSE
      NEW.tjm_approved_by := NULL; NEW.tjm_approved_at := NULL;
    END IF;
    SELECT demand_id, cv_id INTO dc FROM public.demand_candidates WHERE id = NEW.demand_candidate_id;
    INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
    VALUES (dc.demand_id, dc.cv_id, NEW.demand_candidate_id, uid, 'tjm_approval',
      'TJM status changed from ' || OLD.tjm_status || ' to ' || NEW.tjm_status,
      jsonb_build_object('from', OLD.tjm_status, 'to', NEW.tjm_status, 'client_rate', NEW.client_rate));
  ELSE
    NEW.tjm_approved_by := OLD.tjm_approved_by; NEW.tjm_approved_at := OLD.tjm_approved_at;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_tjm_approval ON public.candidate_financials;
CREATE TRIGGER trg_enforce_tjm_approval BEFORE INSERT OR UPDATE ON public.candidate_financials
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tjm_approval();