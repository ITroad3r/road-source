CREATE TYPE public.contract_type AS ENUM ('cdi','cdd','freelance');
CREATE TYPE public.compensation_status AS ENUM (
  'draft','pending_manager_review','returned_to_sourceur','reviewed_by_manager',
  'pending_operations_review','returned_to_manager','approved','rejected');

ALTER TABLE public.talent_hub_cvs ADD COLUMN preferred_contract_type public.contract_type;

CREATE TABLE public.compensation_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_candidate_id uuid NOT NULL UNIQUE REFERENCES public.demand_candidates(id) ON DELETE CASCADE,
  status public.compensation_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  proposed_contract_type public.contract_type,
  proposed_amount numeric(12,2) CHECK (proposed_amount IS NULL OR proposed_amount > 0),
  proposed_by uuid, proposed_at timestamptz,
  original_contract_type public.contract_type,
  original_amount numeric(12,2),
  original_submitted_by uuid, original_submitted_at timestamptz,
  manager_contract_type public.contract_type,
  manager_amount numeric(12,2) CHECK (manager_amount IS NULL OR manager_amount > 0),
  manager_comment text, manager_by uuid, manager_at timestamptz,
  final_contract_type public.contract_type,
  final_amount numeric(12,2) CHECK (final_amount IS NULL OR final_amount > 0),
  operations_comment text, final_by uuid, final_at timestamptz,
  last_return_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approved_has_final CHECK (status <> 'approved' OR (final_contract_type IS NOT NULL AND final_amount IS NOT NULL AND final_by IS NOT NULL AND final_at IS NOT NULL))
);
CREATE INDEX compensation_proposals_status_idx ON public.compensation_proposals(status);
GRANT SELECT ON public.compensation_proposals TO authenticated;
GRANT ALL ON public.compensation_proposals TO service_role;
ALTER TABLE public.compensation_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Compensation: read" ON public.compensation_proposals FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['hrbp','operations','ceo']::public.app_role[])
  OR (public.has_role(auth.uid(), 'sourceur') AND EXISTS (
    SELECT 1 FROM public.demand_candidates dc JOIN public.demands d ON d.id = dc.demand_id
    WHERE dc.id = compensation_proposals.demand_candidate_id AND d.assigned_to = auth.uid()))
);

CREATE TABLE public.compensation_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.compensation_proposals(id) ON DELETE CASCADE,
  demand_candidate_id uuid NOT NULL,
  cv_id uuid NOT NULL,
  demand_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_role public.app_role NOT NULL,
  action text NOT NULL,
  from_status public.compensation_status,
  to_status public.compensation_status NOT NULL,
  old_contract_type public.contract_type,
  new_contract_type public.contract_type,
  old_amount numeric(12,2),
  new_amount numeric(12,2),
  currency text NOT NULL,
  frequency text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compensation_audit_proposal_idx ON public.compensation_audit(proposal_id, created_at);
GRANT SELECT ON public.compensation_audit TO authenticated;
GRANT SELECT, INSERT ON public.compensation_audit TO service_role;
ALTER TABLE public.compensation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Compensation audit: read" ON public.compensation_audit FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.compensation_proposals p WHERE p.id = compensation_audit.proposal_id));

CREATE OR REPLACE FUNCTION public.compensation_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Compensation audit history is append-only';
END $$;
CREATE TRIGGER trg_compensation_audit_immutable BEFORE UPDATE OR DELETE ON public.compensation_audit
FOR EACH ROW EXECUTE FUNCTION public.compensation_audit_immutable();

CREATE OR REPLACE FUNCTION public.compensation_frequency(_t public.contract_type) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _t = 'freelance' THEN 'daily' WHEN _t IS NULL THEN NULL ELSE 'monthly' END $$;

CREATE OR REPLACE FUNCTION public.compensation_gate_error(_dc uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p_status public.compensation_status; p_type public.contract_type; fin public.tjm_status;
BEGIN
  SELECT status, final_contract_type INTO p_status, p_type FROM public.compensation_proposals WHERE demand_candidate_id = _dc;
  SELECT f.tjm_status INTO fin FROM public.candidate_financials f WHERE f.demand_candidate_id = _dc;
  IF p_status IS NULL THEN
    IF fin IS NULL THEN RETURN 'approved compensation or approved TJM required'; END IF;
    IF fin <> 'approved' THEN RETURN 'approved TJM required'; END IF;
    RETURN NULL;
  END IF;
  IF p_status <> 'approved' THEN RETURN 'compensation must be approved by Operations'; END IF;
  IF p_type = 'freelance' AND fin IS DISTINCT FROM 'approved' THEN
    RETURN 'approved commercial TJM required for Freelance';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.compensation_gate_error(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.compensation_action(
  _demand_candidate_id uuid, _action text, _expected_version integer DEFAULT NULL,
  _contract_type public.contract_type DEFAULT NULL, _amount numeric DEFAULT NULL,
  _currency text DEFAULT NULL, _comment text DEFAULT NULL)
RETURNS SETOF public.compensation_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_demand uuid; v_cv uuid; v_stage public.candidate_stage; v_final public.final_decision; v_assigned uuid;
  v_id uuid; v_status public.compensation_status; v_version integer; v_currency text;
  v_ptype public.contract_type; v_pamt numeric; v_mtype public.contract_type; v_mamt numeric;
  v_ftype public.contract_type; v_famt numeric; v_orig timestamptz; v_new_status public.compensation_status;
  actor public.app_role; is_assigned boolean; cur_type public.contract_type; cur_amt numeric;
  new_type public.contract_type; new_amt numeric; c text := nullif(btrim(coalesce(_comment,'')), '');
  is_new boolean := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF c IS NOT NULL AND length(c) > 2000 THEN RAISE EXCEPTION 'Comment too long (max 2000)'; END IF;
  IF _amount IS NOT NULL AND (_amount <= 0 OR _amount > 10000000) THEN RAISE EXCEPTION 'Amount must be a positive number'; END IF;
  IF _currency IS NOT NULL AND _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid currency'; END IF;

  SELECT dc0.demand_id, dc0.cv_id, dc0.stage, dc0.final_decision, d.assigned_to
    INTO v_demand, v_cv, v_stage, v_final, v_assigned
    FROM public.demand_candidates dc0 JOIN public.demands d ON d.id = dc0.demand_id
   WHERE dc0.id = _demand_candidate_id FOR UPDATE OF dc0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidature not found'; END IF;
  is_assigned := v_assigned IS NOT DISTINCT FROM uid;

  SELECT id, status, version, currency, proposed_contract_type, proposed_amount, manager_contract_type, manager_amount,
         final_contract_type, final_amount, original_submitted_at
    INTO v_id, v_status, v_version, v_currency, v_ptype, v_pamt, v_mtype, v_mamt, v_ftype, v_famt, v_orig
    FROM public.compensation_proposals WHERE demand_candidate_id = _demand_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    IF _action NOT IN ('save_draft','submit') THEN RAISE EXCEPTION 'No compensation proposal exists for this candidature'; END IF;
    IF NOT ((public.has_role(uid,'sourceur') AND is_assigned) OR public.has_any_role(uid, ARRAY['hrbp','operations']::public.app_role[])) THEN
      RAISE EXCEPTION 'Not allowed to submit compensation for this candidature';
    END IF;
    INSERT INTO public.compensation_proposals (demand_candidate_id) VALUES (_demand_candidate_id)
      RETURNING id, status, version, currency INTO v_id, v_status, v_version, v_currency;
    is_new := true;
  ELSIF _expected_version IS NULL OR _expected_version <> v_version THEN
    RAISE EXCEPTION 'Stale update: the proposal was changed by someone else (current version %). Reload and try again', v_version
      USING ERRCODE = '40001';
  END IF;

  IF _action IN ('save_draft','submit') THEN
    IF public.has_role(uid,'sourceur') AND is_assigned THEN actor := 'sourceur';
    ELSIF public.has_role(uid,'hrbp') THEN actor := 'hrbp';
    ELSIF public.has_role(uid,'operations') THEN actor := 'operations';
    ELSE RAISE EXCEPTION 'Not allowed to submit compensation for this candidature'; END IF;
    IF v_status NOT IN ('draft','returned_to_sourceur') THEN RAISE EXCEPTION 'Proposal cannot be edited in status %', v_status; END IF;
  ELSIF _action IN ('manager_review','forward','return_to_sourceur') THEN
    IF NOT public.has_role(uid,'hrbp') THEN RAISE EXCEPTION 'Only the Sourcing Manager (HRBP) can review compensation'; END IF;
    actor := 'hrbp';
    IF v_status NOT IN ('pending_manager_review','reviewed_by_manager','returned_to_manager') THEN
      RAISE EXCEPTION 'Proposal is not awaiting manager review (status %)', v_status; END IF;
  ELSIF _action IN ('approve','reject','return_to_manager') THEN
    IF NOT public.has_role(uid,'operations') THEN RAISE EXCEPTION 'Only Operations can finalize compensation'; END IF;
    actor := 'operations';
    IF v_status <> 'pending_operations_review' THEN RAISE EXCEPTION 'Proposal is not awaiting Operations review (status %)', v_status; END IF;
  ELSIF _action IN ('reopen','start_amendment') THEN
    IF NOT public.has_role(uid,'operations') THEN RAISE EXCEPTION 'Only Operations can reopen or amend compensation'; END IF;
    actor := 'operations';
    IF _action = 'reopen' AND v_status <> 'rejected' THEN RAISE EXCEPTION 'Only rejected proposals can be reopened'; END IF;
    IF _action = 'start_amendment' AND v_status <> 'approved' THEN RAISE EXCEPTION 'Only approved compensation can be amended'; END IF;
    IF c IS NULL THEN RAISE EXCEPTION 'A justification is required'; END IF;
  ELSE
    RAISE EXCEPTION 'Unknown action %', _action;
  END IF;

  IF v_status IN ('pending_manager_review','reviewed_by_manager','returned_to_manager','pending_operations_review') THEN
    cur_type := coalesce(v_mtype, v_ptype); cur_amt := coalesce(v_mamt, v_pamt);
  ELSIF v_status = 'approved' THEN
    cur_type := v_ftype; cur_amt := v_famt;
  ELSE
    cur_type := v_ptype; cur_amt := v_pamt;
  END IF;
  new_type := coalesce(_contract_type, cur_type);
  new_amt := coalesce(_amount, cur_amt);
  IF _contract_type IS NOT NULL AND cur_type IS NOT NULL AND _contract_type IS DISTINCT FROM cur_type AND _amount IS NULL
     AND _action IN ('save_draft','submit','manager_review','forward','approve') THEN
    RAISE EXCEPTION 'A new amount is required when changing the contract type';
  END IF;

  IF _action = 'save_draft' THEN
    v_new_status := 'draft';
    UPDATE public.compensation_proposals SET proposed_contract_type = new_type, proposed_amount = new_amt,
      currency = coalesce(_currency, currency), proposed_by = uid, proposed_at = now(), status = v_new_status
      WHERE id = v_id;
  ELSIF _action = 'submit' THEN
    IF new_type IS NULL THEN RAISE EXCEPTION 'Contract type is required before submission'; END IF;
    IF new_amt IS NULL THEN RAISE EXCEPTION 'Compensation amount is required before submission'; END IF;
    v_new_status := 'pending_manager_review';
    UPDATE public.compensation_proposals SET proposed_contract_type = new_type, proposed_amount = new_amt,
      currency = coalesce(_currency, currency), proposed_by = uid, proposed_at = now(), status = v_new_status,
      original_contract_type = CASE WHEN v_orig IS NULL THEN new_type ELSE original_contract_type END,
      original_amount = CASE WHEN v_orig IS NULL THEN new_amt ELSE original_amount END,
      original_submitted_by = CASE WHEN v_orig IS NULL THEN uid ELSE original_submitted_by END,
      original_submitted_at = CASE WHEN v_orig IS NULL THEN now() ELSE original_submitted_at END,
      manager_contract_type = NULL, manager_amount = NULL, manager_comment = NULL, manager_by = NULL, manager_at = NULL
      WHERE id = v_id;
  ELSIF _action IN ('manager_review','forward') THEN
    v_new_status := CASE WHEN _action = 'forward' THEN 'pending_operations_review'::public.compensation_status ELSE 'reviewed_by_manager'::public.compensation_status END;
    UPDATE public.compensation_proposals SET manager_contract_type = new_type, manager_amount = new_amt,
      currency = coalesce(_currency, currency), manager_comment = coalesce(c, manager_comment), manager_by = uid, manager_at = now(),
      status = v_new_status WHERE id = v_id;
  ELSIF _action = 'return_to_sourceur' THEN
    IF c IS NULL THEN RAISE EXCEPTION 'A reason is required to return the proposal'; END IF;
    v_new_status := 'returned_to_sourceur'; new_type := cur_type; new_amt := cur_amt;
    UPDATE public.compensation_proposals SET last_return_reason = c, status = v_new_status WHERE id = v_id;
  ELSIF _action = 'approve' THEN
    v_new_status := 'approved';
    UPDATE public.compensation_proposals SET currency = coalesce(_currency, currency), final_contract_type = new_type, final_amount = new_amt,
      operations_comment = c, final_by = uid, final_at = now(), status = v_new_status WHERE id = v_id;
  ELSIF _action = 'reject' THEN
    IF c IS NULL THEN RAISE EXCEPTION 'A reason is required to reject the proposal'; END IF;
    v_new_status := 'rejected'; new_type := cur_type; new_amt := cur_amt;
    UPDATE public.compensation_proposals SET operations_comment = c, final_by = uid, final_at = now(),
      final_contract_type = NULL, final_amount = NULL, status = v_new_status WHERE id = v_id;
  ELSIF _action = 'return_to_manager' THEN
    IF c IS NULL THEN RAISE EXCEPTION 'A reason is required to return the proposal'; END IF;
    v_new_status := 'returned_to_manager'; new_type := cur_type; new_amt := cur_amt;
    UPDATE public.compensation_proposals SET last_return_reason = c, status = v_new_status WHERE id = v_id;
  ELSIF _action = 'reopen' THEN
    v_new_status := 'returned_to_sourceur'; new_type := cur_type; new_amt := cur_amt;
    UPDATE public.compensation_proposals SET last_return_reason = c, final_by = NULL, final_at = NULL, status = v_new_status WHERE id = v_id;
  ELSIF _action = 'start_amendment' THEN
    v_new_status := 'pending_operations_review'; new_type := cur_type; new_amt := cur_amt;
    UPDATE public.compensation_proposals SET manager_contract_type = final_contract_type, manager_amount = final_amount,
      final_contract_type = NULL, final_amount = NULL, final_by = NULL, final_at = NULL,
      operations_comment = c, status = v_new_status WHERE id = v_id;
  END IF;

  UPDATE public.compensation_proposals SET version = version + 1, updated_at = now() WHERE id = v_id
    RETURNING currency INTO v_currency;

  INSERT INTO public.compensation_audit (proposal_id, demand_candidate_id, cv_id, demand_id, actor_id, actor_role, action,
    from_status, to_status, old_contract_type, new_contract_type, old_amount, new_amount, currency, frequency, comment)
  VALUES (v_id, _demand_candidate_id, v_cv, v_demand, uid, actor, _action,
    CASE WHEN is_new THEN NULL ELSE v_status END, v_new_status,
    cur_type, new_type, cur_amt, new_amt, v_currency, public.compensation_frequency(coalesce(new_type, cur_type)), c);

  IF v_status = 'approved' AND v_new_status <> 'approved' AND v_final = 'approved' AND v_stage <> 'placed' THEN
    PERFORM set_config('roadsource.tjm_reset', '1', true);
    UPDATE public.demand_candidates SET final_decision = 'pending', decision_notes = 'Reset: compensation amendment',
      decided_by = uid, decided_at = now() WHERE id = _demand_candidate_id;
    PERFORM set_config('roadsource.tjm_reset', '', true);
    PERFORM set_config('roadsource.audit', '1', true);
    INSERT INTO public.activity_log (demand_id, cv_id, demand_candidate_id, author_id, kind, body, metadata)
    VALUES (v_demand, v_cv, _demand_candidate_id, uid, 'final_decision', 'Final approval invalidated: compensation amendment started; reconfirmation required',
      jsonb_build_object('from','approved','to','pending','reason','compensation_amended'));
    PERFORM set_config('roadsource.audit', '', true);
  END IF;

  RETURN QUERY SELECT * FROM public.compensation_proposals WHERE id = v_id;
END $$;
REVOKE ALL ON FUNCTION public.compensation_action(uuid, text, integer, public.contract_type, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compensation_action(uuid, text, integer, public.contract_type, numeric, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.compensation_frequency(public.contract_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compensation_audit_immutable() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_pipeline_decisions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); gate_err text;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  PERFORM set_config('roadsource.audit', '1', true);

  IF TG_OP = 'INSERT' THEN
    NEW.legacy_placement := false;
    NEW.qualification_status := 'pending'; NEW.qualified_by := NULL; NEW.qualified_at := NULL; NEW.qualification_notes := NULL;
    NEW.final_decision := 'pending'; NEW.decided_by := NULL; NEW.decided_at := NULL; NEW.decision_notes := NULL;
    IF NEW.stage = 'placed' THEN
      RAISE EXCEPTION 'A new candidature cannot start as placed: qualification, approved compensation and final approval are required';
    END IF;
    PERFORM set_config('roadsource.audit', '', true);
    RETURN NEW;
  END IF;

  NEW.legacy_placement := OLD.legacy_placement;

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
          PERFORM set_config('roadsource.tjm_reset', '1', true);
        END IF;
      END IF;
    END IF;
  ELSE
    NEW.qualified_by := OLD.qualified_by; NEW.qualified_at := OLD.qualified_at;
  END IF;

  IF (NEW.final_decision IS DISTINCT FROM OLD.final_decision OR NEW.decision_notes IS DISTINCT FROM OLD.decision_notes)
     AND COALESCE(current_setting('roadsource.tjm_reset', true), '') <> '1' THEN
    IF NOT public.has_role(uid, 'operations') THEN
      RAISE EXCEPTION 'Only Operations can make the final decision';
    END IF;
    IF NEW.final_decision = 'approved' THEN
      IF NEW.qualification_status <> 'qualified' THEN
        RAISE EXCEPTION 'Candidate must be qualified by HRBP before final approval';
      END IF;
      gate_err := public.compensation_gate_error(NEW.id);
      IF gate_err IS NOT NULL THEN RAISE EXCEPTION 'Final approval blocked: %', gate_err; END IF;
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

  IF NEW.stage = 'placed' AND OLD.stage IS DISTINCT FROM 'placed' AND NOT OLD.legacy_placement THEN
    IF NEW.qualification_status <> 'qualified' THEN
      RAISE EXCEPTION 'Cannot place candidate: HRBP qualification required';
    END IF;
    gate_err := public.compensation_gate_error(NEW.id);
    IF gate_err IS NOT NULL THEN RAISE EXCEPTION 'Cannot place candidate: %', gate_err; END IF;
    IF NEW.final_decision <> 'approved' THEN
      RAISE EXCEPTION 'Cannot place candidate: final Operations approval required';
    END IF;
  END IF;

  PERFORM set_config('roadsource.tjm_reset', '', true);
  PERFORM set_config('roadsource.audit', '', true);
  RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.enforce_pipeline_decisions() FROM PUBLIC, anon, authenticated;