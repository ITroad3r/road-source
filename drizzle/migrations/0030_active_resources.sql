CREATE TABLE public.active_resources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 demand_candidate_id uuid UNIQUE REFERENCES public.demand_candidates(id) ON DELETE SET NULL,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
 full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 200),
 job_title text CHECK (job_title IS NULL OR length(job_title) <= 200),
 email text CHECK (email IS NULL OR length(email) <= 200),
 phone text CHECK (phone IS NULL OR length(phone) <= 50),
 start_date date NOT NULL DEFAULT current_date,
 end_date date,
 contract_type public.contract_type,
 notes text CHECK (notes IS NULL OR length(notes) <= 4000),
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT active_resources_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_resources TO authenticated;
GRANT ALL ON public.active_resources TO service_role;
ALTER TABLE public.active_resources ENABLE ROW LEVEL SECURITY;
CREATE INDEX active_resources_client_idx ON public.active_resources(client_id);
CREATE INDEX active_resources_start_idx ON public.active_resources(start_date);
CREATE POLICY "Active resources view business roles" ON public.active_resources FOR SELECT TO authenticated
 USING ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[])));
CREATE POLICY "Active resources insert business roles" ON public.active_resources FOR INSERT TO authenticated
 WITH CHECK ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[])));
CREATE POLICY "Active resources update business roles" ON public.active_resources FOR UPDATE TO authenticated
 USING ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[])))
 WITH CHECK ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[])));
CREATE POLICY "Active resources delete business roles" ON public.active_resources FOR DELETE TO authenticated
 USING ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['sourceur','hrbp','operations','ceo']::public.app_role[])));
CREATE TRIGGER active_resources_updated_at BEFORE UPDATE ON public.active_resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.active_resource_financials (
 resource_id uuid PRIMARY KEY REFERENCES public.active_resources(id) ON DELETE CASCADE,
 pay_type text NOT NULL DEFAULT 'monthly' CHECK (pay_type IN ('monthly','daily')),
 cost_amount numeric CHECK (cost_amount IS NULL OR cost_amount >= 0),
 sell_amount numeric CHECK (sell_amount IS NULL OR sell_amount >= 0),
 currency text NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_resource_financials TO authenticated;
GRANT ALL ON public.active_resource_financials TO service_role;
ALTER TABLE public.active_resource_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Resource financials view ops ceo" ON public.active_resource_financials FOR SELECT TO authenticated
 USING ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['operations','ceo']::public.app_role[])));
CREATE POLICY "Resource financials insert ops ceo" ON public.active_resource_financials FOR INSERT TO authenticated
 WITH CHECK ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['operations','ceo']::public.app_role[])));
CREATE POLICY "Resource financials update ops ceo" ON public.active_resource_financials FOR UPDATE TO authenticated
 USING ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['operations','ceo']::public.app_role[])))
 WITH CHECK ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['operations','ceo']::public.app_role[])));
CREATE POLICY "Resource financials delete ops ceo" ON public.active_resource_financials FOR DELETE TO authenticated
 USING ((SELECT public.has_any_role((SELECT auth.uid()), ARRAY['operations','ceo']::public.app_role[])));
CREATE TRIGGER active_resource_financials_updated_at BEFORE UPDATE ON public.active_resource_financials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_active_resource_on_placement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rid uuid;
BEGIN
 IF NEW.stage <> 'placed' OR (TG_OP = 'UPDATE' AND OLD.stage = 'placed') THEN RETURN NEW; END IF;
 IF EXISTS (SELECT 1 FROM active_resources WHERE demand_candidate_id = NEW.id) THEN RETURN NEW; END IF;
 INSERT INTO active_resources (demand_candidate_id, client_id, full_name, job_title, email, phone, start_date, created_by)
 SELECT NEW.id, d.client_id, c.full_name, d.title, c.email, c.phone,
   COALESCE((SELECT f.placement_date FROM candidate_financials f WHERE f.demand_candidate_id = NEW.id LIMIT 1), current_date), auth.uid()
 FROM demands d, talent_hub_cvs c WHERE d.id = NEW.demand_id AND c.id = NEW.cv_id
 RETURNING id INTO _rid;
 IF _rid IS NOT NULL THEN
  INSERT INTO active_resource_financials (resource_id, pay_type, cost_amount, sell_amount, currency)
  SELECT _rid, 'daily', f.candidate_rate, f.client_rate, upper(COALESCE(NULLIF(f.currency,''),'EUR'))
  FROM candidate_financials f WHERE f.demand_candidate_id = NEW.id AND (f.candidate_rate IS NOT NULL OR f.client_rate IS NOT NULL) LIMIT 1;
 END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_active_resource_on_placement() FROM public, anon, authenticated;
CREATE TRIGGER demand_candidates_active_resource AFTER INSERT OR UPDATE OF stage ON public.demand_candidates
 FOR EACH ROW EXECUTE FUNCTION public.create_active_resource_on_placement();

WITH ins AS (
 INSERT INTO public.active_resources (demand_candidate_id, client_id, full_name, job_title, email, phone, start_date)
 SELECT dc.id, d.client_id, c.full_name, d.title, c.email, c.phone, COALESCE(f.placement_date, dc.updated_at::date)
 FROM public.demand_candidates dc JOIN public.demands d ON d.id = dc.demand_id JOIN public.talent_hub_cvs c ON c.id = dc.cv_id
 LEFT JOIN public.candidate_financials f ON f.demand_candidate_id = dc.id
 WHERE dc.stage = 'placed' ON CONFLICT (demand_candidate_id) DO NOTHING
 RETURNING id, demand_candidate_id)
INSERT INTO public.active_resource_financials (resource_id, pay_type, cost_amount, sell_amount, currency)
SELECT ins.id, 'daily', f.candidate_rate, f.client_rate, upper(COALESCE(NULLIF(f.currency,''),'EUR'))
FROM ins JOIN public.candidate_financials f ON f.demand_candidate_id = ins.demand_candidate_id
WHERE f.candidate_rate IS NOT NULL OR f.client_rate IS NOT NULL;