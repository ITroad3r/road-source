
-- Phase 2: Two-axis demand status + RFO support

CREATE TYPE public.demand_lifecycle AS ENUM ('open','in_progress','on_hold','filled','cancelled');
CREATE TYPE public.commercial_outcome AS ENUM ('pending','won','lost');

ALTER TABLE public.demands
  ADD COLUMN is_rfo boolean NOT NULL DEFAULT false,
  ADD COLUMN rfo_deadline timestamptz,
  ADD COLUMN positions_count integer NOT NULL DEFAULT 1,
  ADD COLUMN lifecycle public.demand_lifecycle NOT NULL DEFAULT 'open',
  ADD COLUMN commercial_outcome public.commercial_outcome NOT NULL DEFAULT 'pending',
  ADD COLUMN lost_reason text;

-- Migrate legacy status values into the new two axes
UPDATE public.demands SET
  lifecycle = CASE status::text
    WHEN 'open' THEN 'open'::public.demand_lifecycle
    WHEN 'sourcing' THEN 'in_progress'::public.demand_lifecycle
    WHEN 'submitted' THEN 'in_progress'::public.demand_lifecycle
    WHEN 'interview' THEN 'in_progress'::public.demand_lifecycle
    WHEN 'offer' THEN 'in_progress'::public.demand_lifecycle
    WHEN 'placed' THEN 'filled'::public.demand_lifecycle
    WHEN 'closed' THEN 'cancelled'::public.demand_lifecycle
    WHEN 'lost' THEN 'cancelled'::public.demand_lifecycle
    ELSE 'open'::public.demand_lifecycle
  END,
  commercial_outcome = CASE status::text
    WHEN 'placed' THEN 'won'::public.commercial_outcome
    WHEN 'lost' THEN 'lost'::public.commercial_outcome
    ELSE 'pending'::public.commercial_outcome
  END;

-- Log lifecycle and commercial-outcome changes through the existing activity_log trigger
CREATE OR REPLACE FUNCTION public.log_demand_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.activity_log (demand_id, author_id, kind, body, metadata)
    VALUES (NEW.id, auth.uid(), 'status_change',
      'Legacy status changed from ' || OLD.status::text || ' to ' || NEW.status::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF NEW.lifecycle IS DISTINCT FROM OLD.lifecycle THEN
    INSERT INTO public.activity_log (demand_id, author_id, kind, body, metadata)
    VALUES (NEW.id, auth.uid(), 'status_change',
      'Lifecycle changed from ' || OLD.lifecycle::text || ' to ' || NEW.lifecycle::text,
      jsonb_build_object('axis','lifecycle','from', OLD.lifecycle, 'to', NEW.lifecycle));
  END IF;
  IF NEW.commercial_outcome IS DISTINCT FROM OLD.commercial_outcome THEN
    INSERT INTO public.activity_log (demand_id, author_id, kind, body, metadata)
    VALUES (NEW.id, auth.uid(), 'status_change',
      'Commercial outcome changed from ' || OLD.commercial_outcome::text || ' to ' || NEW.commercial_outcome::text,
      jsonb_build_object('axis','commercial','from', OLD.commercial_outcome, 'to', NEW.commercial_outcome, 'lost_reason', NEW.lost_reason));
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.activity_log (demand_id, author_id, kind, body, metadata)
    VALUES (NEW.id, auth.uid(), 'assignment','Demand assignee changed',
      jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
  END IF;
  RETURN NEW;
END;
$function$;

-- Make sure the trigger exists (it logs status/assignment changes)
DROP TRIGGER IF EXISTS trg_log_demand_status_change ON public.demands;
CREATE TRIGGER trg_log_demand_status_change
AFTER UPDATE ON public.demands
FOR EACH ROW EXECUTE FUNCTION public.log_demand_status_change();

-- Validation: lost_reason required when commercial_outcome = 'lost'
CREATE OR REPLACE FUNCTION public.validate_demand_outcome()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.commercial_outcome = 'lost' AND (NEW.lost_reason IS NULL OR length(trim(NEW.lost_reason)) = 0) THEN
    RAISE EXCEPTION 'lost_reason is required when commercial_outcome is lost';
  END IF;
  IF NEW.is_rfo = true AND NEW.positions_count < 1 THEN
    RAISE EXCEPTION 'positions_count must be >= 1';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_demand_outcome ON public.demands;
CREATE TRIGGER trg_validate_demand_outcome
BEFORE INSERT OR UPDATE ON public.demands
FOR EACH ROW EXECUTE FUNCTION public.validate_demand_outcome();
