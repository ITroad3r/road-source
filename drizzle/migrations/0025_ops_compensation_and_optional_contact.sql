DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.compensation_action'::regproc);
  n := replace(d, $a$IF NOT public.has_role(uid,'hrbp') THEN RAISE EXCEPTION 'Only the Sourcing Manager (HRBP) can$a$,
                  $a$IF NOT public.has_any_role(uid, ARRAY['hrbp','operations']::public.app_role[]) THEN RAISE EXCEPTION 'Only HRBP or Operations can$a$);
  n := replace(n, $a$actor := 'hrbp';$a$, $a$actor := CASE WHEN public.has_role(uid,'hrbp') THEN 'hrbp'::public.app_role ELSE 'operations'::public.app_role END;$a$);
  n := replace(n, $a$IF v_status <> 'pending_operations_review' THEN RAISE EXCEPTION 'Proposal is not awaiting Operations review (status %)', v_status; END IF;$a$,
                  $a$IF _action = 'return_to_manager' AND v_status <> 'pending_operations_review' THEN RAISE EXCEPTION 'Proposal is not awaiting Operations review (status %)', v_status; END IF;
    IF v_status NOT IN ('pending_operations_review','pending_manager_review','reviewed_by_manager','returned_to_manager') THEN RAISE EXCEPTION 'Proposal is not awaiting review (status %)', v_status; END IF;$a$);
  IF n = d OR (length(n) - length(replace(n, 'has_any_role(uid, ARRAY[''hrbp'',''operations'']', ''))) = 0 THEN RAISE EXCEPTION 'compensation_action patch did not apply'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.enforce_candidate_progression'::regproc);
  n := regexp_replace(d, '\n  IF NEW\.stage = ''screened'' AND OLD\.stage IN.*?\n  END IF;\n  RETURN NEW;', E'\n  RETURN NEW;', 's');
  IF n = d THEN RAISE EXCEPTION 'progression patch did not apply'; END IF;
  EXECUTE n;
END $mig$;