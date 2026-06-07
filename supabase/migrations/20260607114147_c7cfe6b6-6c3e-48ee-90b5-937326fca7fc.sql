CREATE OR REPLACE FUNCTION public.auto_close_demand_on_hire()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage = 'placed' AND (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    UPDATE public.demands
      SET lifecycle = 'filled',
          commercial_outcome = CASE WHEN commercial_outcome = 'lost' THEN commercial_outcome ELSE 'won' END,
          status = 'filled'
      WHERE id = NEW.demand_id
        AND lifecycle <> 'filled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close_demand_on_hire ON public.demand_candidates;
CREATE TRIGGER trg_auto_close_demand_on_hire
AFTER UPDATE OF stage ON public.demand_candidates
FOR EACH ROW
EXECUTE FUNCTION public.auto_close_demand_on_hire();