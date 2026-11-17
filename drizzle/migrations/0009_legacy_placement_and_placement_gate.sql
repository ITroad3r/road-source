ALTER TABLE public.demand_candidates
  ADD COLUMN IF NOT EXISTS legacy_placement boolean NOT NULL DEFAULT false;
-- One-time snapshot: placements that exist when Stage 3 lands are grandfathered.
UPDATE public.demand_candidates SET legacy_placement = true WHERE stage = 'placed';
COMMENT ON COLUMN public.demand_candidates.legacy_placement IS 'Immutable snapshot: placed before Stage 3 qualification rules; only these rows may re-approve TJM without qualification';

CREATE OR REPLACE FUNCTION public.enforce_pipeline_decisions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); fin_status public.tjm_status;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  PERFORM set_config('roadsource.audit', '1', true);

  IF TG_OP = 'INSERT' THEN
    NEW.legacy_placement := false;
    NEW.qualification_status := 'pending'; NEW.qualified_by := NULL; NEW.qualified_at := NULL; NEW.qualification_notes := NULL;
    NEW.final_decision := 'pending'; NEW.decided_by := NULL; NEW.decided_at := NULL; NEW.decision_notes := NULL;
    IF NEW.stage = 'placed' THEN
      RAISE EXCEPTION 'A new candidature cannot start as placed: qualification, approved TJM and final approval are required';
    END IF;
    PERFORM set_config('roadsource.audit', '', true);
    RETURN NEW;
  END IF;

  NEW.legacy_placement := OLD.legacy_placement; -- immutable for signed-in users

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
      -- Revocation after final approval
      IF OLD.qualification_status = 'qualified' AND NEW.qualification_status <> 'qualified'
         AND OLD.final_decision = 'approved' THEN
        IF OLD.stage = 'placed' THEN
          RAISE EXCEPTION 'Cannot revoke qualification of a placed candidate with final approval; contact Operations to handle the placement first';
        END IF;
        IF NEW.final_decision = 'approved' THEN
          INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
          VALUES (NEW.demand_id, NEW.cv_id, NEW.id, uid, 'final_decision',
            'Final approval invalidated: qualification revoked; reconfirmation required',
            jsonb_build_object('from', 'approved', 'to', 'pending', 'reason', 'qualification_revoked',
              'previous_decided_by', OLD.decided_by, 'previous_decided_at', OLD.decided_at, 'previous_notes', OLD.decision_notes));
          NEW.final_decision := 'pending'; NEW.decision_notes := 'Reset: qualification revoked';
          NEW.decided_by := uid; NEW.decided_at := now();
          PERFORM set_config('roadsource.tjm_reset', '1', true); -- suppress generic log below
        END IF;
      END IF;
    END IF;
  ELSE
    NEW.qualified_by := OLD.qualified_by; NEW.qualified_at := OLD.qualified_at;
  END IF;

  -- Final decision (skip permission check when the change came from the revocation rule above)
  IF (NEW.final_decision IS DISTINCT FROM OLD.final_decision OR NEW.decision_notes IS DISTINCT FROM OLD.decision_notes)
     AND COALESCE(current_setting('roadsource.tjm_reset', true), '') <> '1' THEN
    IF NOT public.has_role(uid, 'operations') THEN
      RAISE EXCEPTION 'Only Operations can make the final decision';
    END IF;
    IF NEW.final_decision = 'approved' THEN
      IF NEW.qualification_status <> 'qualified' THEN
        RAISE EXCEPTION 'Candidate must be qualified by HRBP before final approval';
      END IF;
      SELECT f.tjm_status INTO fin_status FROM public.candidate_financials f WHERE f.demand_candidate_id = NEW.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'An approved TJM is required before final approval (no financial record)'; END IF;
      IF fin_status <> 'approved' THEN RAISE EXCEPTION 'TJM must be approved before final approval'; END IF;
    END IF;
    NEW.decided_by := uid; NEW.decided_at := now();
    IF NEW.final_decision IS DISTINCT FROM OLD.final_decision THEN
      INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
      VALUES (NEW.demand_id, NEW.cv_id, NEW.id, uid, 'final_decision',
        'Final decision changed from ' || OLD.final_decision || ' to ' || NEW.final_decision,
        jsonb_build_object('from', OLD.final_decision, 'to', NEW.final_decision, 'notes', NEW.decision_notes));
    END IF;
  ELSIF NEW.final_decision IS NOT DISTINCT FROM OLD.final_decision AND NEW.decision_notes IS NOT DISTINCT FROM OLD.decision_notes THEN
    NEW.decided_by := OLD.decided_by; NEW.decided_at := OLD.decided_at;
  END IF;

  -- Placement gate: new (non-legacy) candidatures need the full approval chain to become placed.
  IF NEW.stage = 'placed' AND OLD.stage IS DISTINCT FROM 'placed' AND NOT OLD.legacy_placement THEN
    IF NEW.qualification_status <> 'qualified' THEN
      RAISE EXCEPTION 'Cannot place candidate: HRBP qualification required';
    END IF;
    SELECT f.tjm_status INTO fin_status FROM public.candidate_financials f WHERE f.demand_candidate_id = NEW.id;
    IF NOT FOUND OR fin_status <> 'approved' THEN
      RAISE EXCEPTION 'Cannot place candidate: approved TJM required';
    END IF;
    IF NEW.final_decision <> 'approved' THEN
      RAISE EXCEPTION 'Cannot place candidate: final Operations approval required';
    END IF;
  END IF;

  PERFORM set_config('roadsource.tjm_reset', '', true);
  PERFORM set_config('roadsource.audit', '', true);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_tjm_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); is_ops boolean; dc record;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  is_ops := public.has_role(uid, 'operations');
  -- Lock order: financial row (held by this statement) -> candidate row. Pipeline trigger never locks financials.
  SELECT id, demand_id, cv_id, stage, legacy_placement, qualification_status, final_decision, decided_by, decided_at, decision_notes INTO dc
    FROM public.demand_candidates WHERE id = NEW.demand_candidate_id FOR UPDATE;
  PERFORM set_config('roadsource.audit', '1', true);

  IF TG_OP = 'INSERT' THEN
    NEW.amendment_pending := false;
    IF NEW.tjm_status = 'approved' THEN
      IF NOT is_ops THEN RAISE EXCEPTION 'Only Operations can approve TJM'; END IF;
      IF dc.qualification_status IS DISTINCT FROM 'qualified' AND NOT COALESCE(dc.legacy_placement, false) THEN
        RAISE EXCEPTION 'Candidate must be qualified before TJM approval';
      END IF;
      NEW.tjm_approved_by := uid; NEW.tjm_approved_at := now();
      INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
      VALUES (dc.demand_id, dc.cv_id, NEW.demand_candidate_id, uid, 'tjm_approval', 'TJM created as approved',
        jsonb_build_object('from', null, 'to', 'approved', 'client_rate', NEW.client_rate, 'legacy_placement', dc.legacy_placement));
    ELSE
      NEW.tjm_approved_by := NULL; NEW.tjm_approved_at := NULL;
    END IF;
    PERFORM set_config('roadsource.audit', '', true);
    RETURN NEW;
  END IF;

  IF NEW.amendment_pending IS DISTINCT FROM OLD.amendment_pending THEN
    NEW.amendment_pending := OLD.amendment_pending;
  END IF;

  IF (NEW.client_rate IS DISTINCT FROM OLD.client_rate
      OR NEW.candidate_rate IS DISTINCT FROM OLD.candidate_rate
      OR NEW.margin IS DISTINCT FROM OLD.margin) AND OLD.tjm_status = 'approved' THEN
    IF NOT is_ops THEN RAISE EXCEPTION 'Approved TJM can only be changed by Operations'; END IF;
    NEW.tjm_status := 'draft';
    NEW.tjm_approved_by := NULL; NEW.tjm_approved_at := NULL;
    NEW.amendment_pending := (dc.stage = 'placed');
    INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
    VALUES (dc.demand_id, dc.cv_id, NEW.demand_candidate_id, uid, 'tjm_approval',
      CASE WHEN dc.stage = 'placed' THEN 'Approved TJM amended after placement: reapproval required (placement unchanged)'
           ELSE 'Approved TJM edited: reset to draft, reapproval required' END,
      jsonb_build_object('from', 'approved', 'to', 'draft', 'reason', 'rate_edit', 'stage', dc.stage,
        'previous_approved_by', OLD.tjm_approved_by, 'previous_approved_at', OLD.tjm_approved_at,
        'old_client_rate', OLD.client_rate, 'new_client_rate', NEW.client_rate,
        'old_candidate_rate', OLD.candidate_rate, 'new_candidate_rate', NEW.candidate_rate,
        'old_margin', OLD.margin, 'new_margin', NEW.margin));

    IF dc.final_decision = 'approved' AND dc.stage <> 'placed' THEN
      INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
      VALUES (dc.demand_id, dc.cv_id, dc.id, uid, 'final_decision',
        'Final approval invalidated: approved TJM was amended; reconfirmation required',
        jsonb_build_object('from', 'approved', 'to', 'pending', 'reason', 'tjm_amended',
          'previous_decided_by', dc.decided_by, 'previous_decided_at', dc.decided_at, 'previous_notes', dc.decision_notes));
      PERFORM set_config('roadsource.tjm_reset', '1', true);
      UPDATE public.demand_candidates SET final_decision = 'pending', decision_notes = 'Reset: approved TJM amended' WHERE id = dc.id;
      PERFORM set_config('roadsource.tjm_reset', '', true);
      PERFORM set_config('roadsource.audit', '1', true);
    END IF;
    PERFORM set_config('roadsource.audit', '', true);
    RETURN NEW;
  END IF;

  IF NEW.tjm_status IS DISTINCT FROM OLD.tjm_status THEN
    IF NOT is_ops THEN RAISE EXCEPTION 'Only Operations can change TJM approval'; END IF;
    IF NEW.tjm_status = 'approved' THEN
      IF dc.qualification_status IS DISTINCT FROM 'qualified' AND NOT COALESCE(dc.legacy_placement, false) THEN
        RAISE EXCEPTION 'Candidate must be qualified before TJM approval';
      END IF;
      NEW.tjm_approved_by := uid; NEW.tjm_approved_at := now();
      NEW.amendment_pending := false;
    ELSE
      NEW.tjm_approved_by := NULL; NEW.tjm_approved_at := NULL;
    END IF;
    INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
    VALUES (dc.demand_id, dc.cv_id, NEW.demand_candidate_id, uid, 'tjm_approval',
      'TJM status changed from ' || OLD.tjm_status || ' to ' || NEW.tjm_status,
      jsonb_build_object('from', OLD.tjm_status, 'to', NEW.tjm_status, 'client_rate', NEW.client_rate,
        'amendment_after_placement', OLD.amendment_pending, 'legacy_placement', dc.legacy_placement,
        'previous_approved_by', OLD.tjm_approved_by, 'previous_approved_at', OLD.tjm_approved_at));
  ELSE
    NEW.tjm_approved_by := OLD.tjm_approved_by; NEW.tjm_approved_at := OLD.tjm_approved_at;
  END IF;
  PERFORM set_config('roadsource.audit', '', true);
  RETURN NEW;
END; $$;