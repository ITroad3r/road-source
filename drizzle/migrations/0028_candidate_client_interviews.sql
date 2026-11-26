CREATE TABLE public.candidate_interviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 demand_candidate_id uuid NOT NULL REFERENCES public.demand_candidates(id) ON DELETE CASCADE,
 starts_at timestamptz NOT NULL,
 timezone text NOT NULL CHECK (length(timezone) BETWEEN 1 AND 100),
 mode text NOT NULL CHECK (mode IN ('onsite','online')),
 location text NOT NULL DEFAULT '' CHECK (length(location) <= 1000),
 meeting_url text NOT NULL DEFAULT '' CHECK (length(meeting_url) <= 2000 AND (meeting_url = '' OR meeting_url ~* '^https?://[^[:space:]]+$')),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_interviews TO authenticated;
GRANT ALL ON public.candidate_interviews TO service_role;
ALTER TABLE public.candidate_interviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX candidate_interviews_candidate_time_idx ON public.candidate_interviews(demand_candidate_id, starts_at);
CREATE INDEX candidate_interviews_starts_at_idx ON public.candidate_interviews(starts_at);
CREATE POLICY "Interviews view assigned Sourcer HRBP Operations" ON public.candidate_interviews FOR SELECT TO authenticated USING (
 (SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp','operations']::public.app_role[]))
 AND demand_candidate_id IN (SELECT dc.id FROM public.demand_candidates dc JOIN public.demands d ON d.id = dc.demand_id WHERE (SELECT public.has_any_role((SELECT auth.uid()), ARRAY['hrbp','operations']::public.app_role[])) OR ((SELECT public.has_role((SELECT auth.uid()), 'sourceur')) AND d.assigned_to = (SELECT auth.uid())))
);
CREATE POLICY "Interviews schedule assigned Sourcer HRBP" ON public.candidate_interviews FOR INSERT TO authenticated WITH CHECK (
 (SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[]))
 AND demand_candidate_id IN (SELECT dc.id FROM public.demand_candidates dc JOIN public.demands d ON d.id = dc.demand_id WHERE (SELECT public.has_role((SELECT auth.uid()), 'hrbp')) OR ((SELECT public.has_role((SELECT auth.uid()), 'sourceur')) AND d.assigned_to = (SELECT auth.uid())))
);
CREATE POLICY "Interviews edit assigned Sourcer HRBP" ON public.candidate_interviews FOR UPDATE TO authenticated USING (
 (SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[]))
 AND demand_candidate_id IN (SELECT dc.id FROM public.demand_candidates dc JOIN public.demands d ON d.id = dc.demand_id WHERE (SELECT public.has_role((SELECT auth.uid()), 'hrbp')) OR ((SELECT public.has_role((SELECT auth.uid()), 'sourceur')) AND d.assigned_to = (SELECT auth.uid())))
) WITH CHECK (
 (SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[]))
 AND demand_candidate_id IN (SELECT dc.id FROM public.demand_candidates dc JOIN public.demands d ON d.id = dc.demand_id WHERE (SELECT public.has_role((SELECT auth.uid()), 'hrbp')) OR ((SELECT public.has_role((SELECT auth.uid()), 'sourceur')) AND d.assigned_to = (SELECT auth.uid())))
);
CREATE POLICY "Interviews delete assigned Sourcer HRBP" ON public.candidate_interviews FOR DELETE TO authenticated USING (
 (SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp']::public.app_role[]))
 AND demand_candidate_id IN (SELECT dc.id FROM public.demand_candidates dc JOIN public.demands d ON d.id = dc.demand_id WHERE (SELECT public.has_role((SELECT auth.uid()), 'hrbp')) OR ((SELECT public.has_role((SELECT auth.uid()), 'sourceur')) AND d.assigned_to = (SELECT auth.uid())))
);
CREATE TRIGGER candidate_interviews_updated_at BEFORE UPDATE ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();