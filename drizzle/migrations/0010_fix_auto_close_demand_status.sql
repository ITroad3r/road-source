CREATE OR REPLACE FUNCTION public.auto_close_demand_on_hire()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.stage = 'placed' AND (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    UPDATE public.demands
      SET lifecycle = 'filled',
          commercial_outcome = CASE WHEN commercial_outcome = 'lost' THEN commercial_outcome ELSE 'won' END,
          status = 'placed'
      WHERE id = NEW.demand_id
        AND lifecycle <> 'filled';
  END IF;
  RETURN NEW;
END;
$function$;