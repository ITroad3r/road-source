CREATE OR REPLACE FUNCTION public.enforce_tjm_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); is_ops boolean; dc record;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  is_ops := public.has_role(uid, 'operations');
  SELECT demand_id, cv_id INTO dc FROM public.demand_candidates WHERE id = NEW.demand_candidate_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.tjm_status = 'approved' THEN
      IF NOT is_ops THEN RAISE EXCEPTION 'Only Operations can approve TJM'; END IF;
      NEW.tjm_approved_by := uid; NEW.tjm_approved_at := now();
      INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
      VALUES (dc.demand_id, dc.cv_id, NEW.demand_candidate_id, uid, 'tjm_approval', 'TJM created as approved',
        jsonb_build_object('from', null, 'to', 'approved', 'client_rate', NEW.client_rate));
    ELSE
      NEW.tjm_approved_by := NULL; NEW.tjm_approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.client_rate IS DISTINCT FROM OLD.client_rate
      OR NEW.candidate_rate IS DISTINCT FROM OLD.candidate_rate
      OR NEW.margin IS DISTINCT FROM OLD.margin) AND OLD.tjm_status = 'approved' THEN
    IF NOT is_ops THEN RAISE EXCEPTION 'Approved TJM can only be changed by Operations'; END IF;
    -- Edit always resets to draft; reapproval is a separate explicit action.
    NEW.tjm_status := 'draft';
    NEW.tjm_approved_by := NULL; NEW.tjm_approved_at := NULL;
    INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
    VALUES (dc.demand_id, dc.cv_id, NEW.demand_candidate_id, uid, 'tjm_approval',
      'Approved TJM edited: reset to draft, reapproval required',
      jsonb_build_object('from', 'approved', 'to', 'draft', 'reason', 'rate_edit',
        'previous_approved_by', OLD.tjm_approved_by, 'previous_approved_at', OLD.tjm_approved_at,
        'old_client_rate', OLD.client_rate, 'new_client_rate', NEW.client_rate,
        'old_candidate_rate', OLD.candidate_rate, 'new_candidate_rate', NEW.candidate_rate,
        'old_margin', OLD.margin, 'new_margin', NEW.margin));
    RETURN NEW;
  END IF;

  IF NEW.tjm_status IS DISTINCT FROM OLD.tjm_status THEN
    IF NOT is_ops THEN RAISE EXCEPTION 'Only Operations can change TJM approval'; END IF;
    IF NEW.tjm_status = 'approved' THEN
      NEW.tjm_approved_by := uid; NEW.tjm_approved_at := now();
    ELSE
      NEW.tjm_approved_by := NULL; NEW.tjm_approved_at := NULL;
    END IF;
    INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
    VALUES (dc.demand_id, dc.cv_id, NEW.demand_candidate_id, uid, 'tjm_approval',
      'TJM status changed from ' || OLD.tjm_status || ' to ' || NEW.tjm_status,
      jsonb_build_object('from', OLD.tjm_status, 'to', NEW.tjm_status, 'client_rate', NEW.client_rate,
        'previous_approved_by', OLD.tjm_approved_by, 'previous_approved_at', OLD.tjm_approved_at));
  ELSE
    NEW.tjm_approved_by := OLD.tjm_approved_by; NEW.tjm_approved_at := OLD.tjm_approved_at;
  END IF;
  RETURN NEW;
END; $$;