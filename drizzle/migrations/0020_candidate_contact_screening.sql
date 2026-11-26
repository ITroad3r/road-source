CREATE TABLE public.candidate_dossiers (
 demand_candidate_id uuid PRIMARY KEY REFERENCES public.demand_candidates(id) ON DELETE CASCADE,
 communication_method text CHECK (communication_method IN ('phone','visio','whatsapp')),
 communicated_at timestamptz,
 employment_status text CHECK (employment_status IN ('employed','unemployed')),
 availability_notes text,
 expected_joining_date date,
 current_contract_type text,
 current_pay numeric CHECK (current_pay >= 0),
 current_pay_type text CHECK (current_pay_type IN ('salary','tjm')),
 currency text NOT NULL DEFAULT 'MAD',
 country text, city text, contact_observations text,
 technical_score numeric CHECK (technical_score BETWEEN 0 AND 100),
 psychological_score numeric CHECK (psychological_score BETWEEN 0 AND 100),
 technical_pdf text, psychological_pdf text, screening_observations text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_dossiers TO authenticated;
GRANT ALL ON public.candidate_dossiers TO service_role;
ALTER TABLE public.candidate_dossiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dossier read visible candidature" ON public.candidate_dossiers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.demand_candidates dc WHERE dc.id = demand_candidate_id));
CREATE POLICY "Dossier create Sourcer HRBP" ON public.candidate_dossiers FOR INSERT TO authenticated WITH CHECK ((select public.has_any_role((select auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[])) AND EXISTS (SELECT 1 FROM public.demand_candidates dc WHERE dc.id = demand_candidate_id));
CREATE POLICY "Dossier edit Sourcer HRBP" ON public.candidate_dossiers FOR UPDATE TO authenticated USING ((select public.has_any_role((select auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[])) AND EXISTS (SELECT 1 FROM public.demand_candidates dc WHERE dc.id = demand_candidate_id)) WITH CHECK ((select public.has_any_role((select auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[])) AND EXISTS (SELECT 1 FROM public.demand_candidates dc WHERE dc.id = demand_candidate_id));
CREATE POLICY "Dossier delete Sourcer HRBP" ON public.candidate_dossiers FOR DELETE TO authenticated USING ((select public.has_any_role((select auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[])) AND EXISTS (SELECT 1 FROM public.demand_candidates dc WHERE dc.id = demand_candidate_id));
CREATE TRIGGER dossier_updated BEFORE UPDATE ON public.candidate_dossiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Test PDFs read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'candidate-tests' AND EXISTS (SELECT 1 FROM public.demand_candidates dc WHERE dc.id::text = (storage.foldername(name))[1]));
CREATE POLICY "Test PDFs upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'candidate-tests' AND (select public.has_any_role((select auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[])) AND EXISTS (SELECT 1 FROM public.demand_candidates dc WHERE dc.id::text = (storage.foldername(name))[1]));
CREATE POLICY "Test PDFs delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'candidate-tests' AND (select public.has_any_role((select auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[])) AND EXISTS (SELECT 1 FROM public.demand_candidates dc WHERE dc.id::text = (storage.foldername(name))[1]));
CREATE FUNCTION public.create_candidate_for_demand(_candidate jsonb, _demand_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE c public.talent_hub_cvs; new_id uuid;
BEGIN
 IF NOT public.has_any_role(auth.uid(), ARRAY['sourceur','hrbp','operations']::public.app_role[]) THEN RAISE EXCEPTION 'Candidate editing access required'; END IF;
 c := jsonb_populate_record(NULL::public.talent_hub_cvs, _candidate);
 IF c.full_name IS NULL OR length(trim(c.full_name)) < 2 THEN RAISE EXCEPTION 'Full name required'; END IF;
 INSERT INTO public.talent_hub_cvs (full_name,email,phone,headline,summary,location,linkedin_url,seniority,years_experience,engagement_preference,availability,daily_rate,salary_expectation,remote_ok,preferred_contract_type,skills,tags,cv_url,created_by)
 VALUES(c.full_name,c.email,c.phone,c.headline,c.summary,c.location,c.linkedin_url,c.seniority,c.years_experience,c.engagement_preference,c.availability,c.daily_rate,c.salary_expectation,c.remote_ok,c.preferred_contract_type,c.skills,c.tags,c.cv_url,auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.demand_candidates(demand_id,cv_id,stage,submitted_by) VALUES(_demand_id,new_id,'identified',auth.uid());
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.create_candidate_for_demand(jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_candidate_for_demand(jsonb,uuid) TO authenticated, service_role;