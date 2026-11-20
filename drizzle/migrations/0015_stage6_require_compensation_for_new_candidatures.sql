ALTER TABLE public.demand_candidates ADD COLUMN requires_compensation boolean NOT NULL DEFAULT false;
ALTER TABLE public.demand_candidates ALTER COLUMN requires_compensation SET DEFAULT true;
COMMENT ON COLUMN public.demand_candidates.requires_compensation IS 'Stage 6: true for candidatures created after the compensation workflow; false = pre-Stage 6 compatibility (approved TJM rule).';

CREATE OR REPLACE FUNCTION public.protect_requires_compensation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.requires_compensation := true;
  ELSE NEW.requires_compensation := OLD.requires_compensation; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_requires_compensation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_protect_requires_compensation BEFORE INSERT OR UPDATE ON public.demand_candidates
FOR EACH ROW EXECUTE FUNCTION public.protect_requires_compensation();

CREATE OR REPLACE FUNCTION public.compensation_gate_error(_dc uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p_status public.compensation_status; p_type public.contract_type; fin public.tjm_status; req boolean;
BEGIN
  SELECT requires_compensation INTO req FROM public.demand_candidates WHERE id = _dc;
  SELECT status, final_contract_type INTO p_status, p_type FROM public.compensation_proposals WHERE demand_candidate_id = _dc;
  SELECT f.tjm_status INTO fin FROM public.candidate_financials f WHERE f.demand_candidate_id = _dc;
  IF p_status IS NULL THEN
    IF COALESCE(req, true) THEN RETURN 'contract type and compensation must be submitted and approved by Operations'; END IF;
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