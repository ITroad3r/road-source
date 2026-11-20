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
  ELSIF _action = 'reopen' THEN
    -- Rejected compensation goes back to the Sourcing Manager (HRBP) for renegotiation.
    IF public.has_role(uid,'hrbp') THEN actor := 'hrbp';
    ELSIF public.has_role(uid,'operations') THEN actor := 'operations';
    ELSE RAISE EXCEPTION 'Only HRBP or Operations can reopen rejected compensation'; END IF;
    IF v_status <> 'rejected' THEN RAISE EXCEPTION 'Only rejected proposals can be reopened'; END IF;
    IF c IS NULL THEN RAISE EXCEPTION 'A justification is required'; END IF;
  ELSIF _action = 'request_alternatives' THEN
    IF NOT public.has_role(uid,'hrbp') THEN RAISE EXCEPTION 'Only the Sourcing Manager (HRBP) can request alternative candidates'; END IF;
    actor := 'hrbp';
    IF v_status <> 'rejected' THEN RAISE EXCEPTION 'Alternative candidates can only be requested after a compensation rejection'; END IF;
    IF c IS NULL THEN RAISE EXCEPTION 'A justification is required'; END IF;
  ELSIF _action = 'start_amendment' THEN
    IF NOT public.has_role(uid,'operations') THEN RAISE EXCEPTION 'Only Operations can reopen or amend compensation'; END IF;
    actor := 'operations';
    IF v_status <> 'approved' THEN RAISE EXCEPTION 'Only approved compensation can be amended'; END IF;
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
    v_new_status := 'returned_to_manager'; new_type := cur_type; new_amt := cur_amt;
    UPDATE public.compensation_proposals SET last_return_reason = c, final_by = NULL, final_at = NULL, status = v_new_status WHERE id = v_id;
  ELSIF _action = 'request_alternatives' THEN
    v_new_status := 'rejected'; new_type := cur_type; new_amt := cur_amt;
    IF v_assigned IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, demand_id, demand_candidate_id, link)
      VALUES (v_assigned, 'pipeline_changed', 'Alternative candidates requested', c, v_demand, _demand_candidate_id, '/demands/' || v_demand);
    END IF;
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