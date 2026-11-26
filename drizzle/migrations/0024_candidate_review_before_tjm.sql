DO $migration$
DECLARE p text; t text; old_block text;
BEGIN
  p := pg_get_functiondef('public.enforce_pipeline_decisions()'::regprocedure);
  IF position('Final approval blocked:' in p) = 0 OR position('Only HRBP or Operations can qualify candidates' in p) = 0 THEN
    RAISE EXCEPTION 'Unexpected pipeline function version; review before applying';
  END IF;
  p := replace(p, 'IF NOT public.has_any_role(uid, ARRAY[''hrbp'',''operations'']::public.app_role[]) THEN', 'IF NOT public.has_role(uid, ''hrbp'') THEN');
  p := replace(p, 'Only HRBP or Operations can qualify candidates', 'Only HRBP can qualify candidates');
  p := replace(p, '    NEW.qualified_by := uid;', E'    IF NEW.qualification_status = ''qualified'' AND NEW.stage NOT IN (''screened'',''submitted'',''client_interview'',''offer'',''placed'') THEN\n      RAISE EXCEPTION ''Candidate must reach For Screening/Approval before HRBP qualification'';\n    END IF;\n    NEW.qualified_by := uid;');
  p := replace(p, E'      gate_err := public.compensation_gate_error(NEW.id);\n      IF gate_err IS NOT NULL THEN RAISE EXCEPTION ''Final approval blocked: %'', gate_err; END IF;', '');
  p := replace(p, E'    IF NEW.final_decision = ''approved'' THEN\n      IF NEW.qualification_status', E'    IF NEW.final_decision IN (''approved'',''rejected'') THEN\n      IF NEW.qualification_status');
  EXECUTE p;

  t := pg_get_functiondef('public.enforce_tjm_approval()'::regprocedure);
  t := replace(t, 'dc.qualification_status IS DISTINCT FROM ''qualified'' AND NOT COALESCE(dc.legacy_placement, false)', '(dc.qualification_status IS DISTINCT FROM ''qualified'' OR dc.final_decision IS DISTINCT FROM ''approved'') AND NOT COALESCE(dc.legacy_placement, false)');
  t := replace(t, 'Candidate must be qualified before TJM approval', 'HRBP qualification and Operations candidate approval required before TJM approval');
  old_block := substring(t from position('    IF dc.final_decision = ''approved'' AND dc.stage <> ''placed'' THEN' in t));
  IF old_block = '' OR old_block IS NULL THEN RAISE EXCEPTION 'Unexpected TJM function version'; END IF;
  old_block := substring(old_block from 1 for position(E'    PERFORM set_config(''roadsource.audit'', '''', true);' in old_block) - 1);
  t := replace(t, old_block, '');
  EXECUTE t;
END $migration$;

CREATE OR REPLACE FUNCTION public.enforce_candidate_progression()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); manager boolean; contact public.candidate_dossiers; expected public.candidate_stage;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage <> 'identified' THEN RAISE EXCEPTION 'New candidates must start as Identified'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN RETURN NEW; END IF;
  manager := public.has_any_role(uid, ARRAY['hrbp','operations']::public.app_role[]);
  IF NOT manager AND NOT public.has_role(uid,'sourceur') THEN RAISE EXCEPTION 'Candidate stage editing is not permitted'; END IF;
  IF NEW.stage IN ('submitted','client_interview','offer','placed') AND
    (NEW.qualification_status <> 'qualified' OR NEW.final_decision <> 'approved') THEN
    RAISE EXCEPTION 'HRBP qualification and Operations candidate approval required before proceeding';
  END IF;
  IF NOT manager THEN
    expected := CASE OLD.stage WHEN 'identified' THEN 'contacted'::public.candidate_stage
      WHEN 'contacted' THEN 'screened'::public.candidate_stage WHEN 'screened' THEN 'submitted'::public.candidate_stage
      WHEN 'submitted' THEN 'client_interview'::public.candidate_stage WHEN 'client_interview' THEN 'offer'::public.candidate_stage
      WHEN 'offer' THEN 'placed'::public.candidate_stage ELSE NULL END;
    IF NOT COALESCE(NEW.stage = expected, false) AND NOT (NEW.stage = 'withdrawn' AND OLD.stage <> 'placed') THEN
      RAISE EXCEPTION 'Sourcers must follow the candidate stages in order';
    END IF;
  END IF;
  IF NEW.stage = 'screened' AND OLD.stage IN ('identified','contacted') THEN
    IF OLD.stage <> 'contacted' THEN RAISE EXCEPTION 'Contact the candidate before screening'; END IF;
    SELECT * INTO contact FROM public.candidate_dossiers WHERE demand_candidate_id = NEW.id;
    IF contact.communication_method IS NULL OR contact.communicated_at IS NULL OR contact.employment_status IS NULL
      OR (NULLIF(btrim(contact.availability_notes),'') IS NULL AND contact.expected_joining_date IS NULL)
      OR NULLIF(btrim(contact.country),'') IS NULL OR NULLIF(btrim(contact.city),'') IS NULL
      OR (contact.employment_status = 'employed' AND
          (contact.current_contract_type IS NULL OR contact.current_pay IS NULL OR contact.current_pay_type IS NULL)) THEN
      RAISE EXCEPTION 'Complete contact details: communication method/time, employment, availability, country/city and current contract/pay if employed';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_candidate_progression() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_candidate_progression BEFORE INSERT OR UPDATE ON public.demand_candidates
FOR EACH ROW EXECUTE FUNCTION public.enforce_candidate_progression();