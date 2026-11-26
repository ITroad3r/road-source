DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.compensation_action'::regproc);
  n := replace(d,
    $a$v_new_status := CASE WHEN _action = 'forward' THEN 'pending_operations_review'::public.compensation_status ELSE 'reviewed_by_manager'::public.compensation_status END;$a$,
    $a$v_new_status := CASE
      WHEN _action = 'forward' THEN 'pending_operations_review'::public.compensation_status
      WHEN v_status = 'returned_to_manager' THEN 'returned_to_manager'::public.compensation_status
      ELSE 'reviewed_by_manager'::public.compensation_status
    END;$a$);
  IF n = d THEN RAISE EXCEPTION 'compensation manager review status patch did not apply'; END IF;
  EXECUTE n;
END $mig$;