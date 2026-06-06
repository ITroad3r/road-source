
CREATE TYPE public.notification_type AS ENUM ('demand_assigned', 'pipeline_changed', 'candidate_added');

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type notification_type NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  demand_id uuid,
  demand_candidate_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id) WHERE read = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "System inserts notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger: demand assignment
CREATE OR REPLACE FUNCTION public.notify_demand_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, demand_id)
    VALUES (
      NEW.assigned_to,
      'demand_assigned',
      'New demand assigned',
      'You have been assigned to: ' || NEW.title,
      '/demands/' || NEW.id::text,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_demand_assigned
AFTER INSERT OR UPDATE OF assigned_to ON public.demands
FOR EACH ROW EXECUTE FUNCTION public.notify_demand_assigned();

-- Trigger: pipeline stage change
CREATE OR REPLACE FUNCTION public.notify_pipeline_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignee uuid;
  v_demand_title text;
  v_candidate_name text;
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    SELECT d.assigned_to, d.title INTO v_assignee, v_demand_title
    FROM public.demands d WHERE d.id = NEW.demand_id;

    SELECT c.full_name INTO v_candidate_name
    FROM public.talent_hub_cvs c WHERE c.id = NEW.cv_id;

    IF v_assignee IS NOT NULL AND v_assignee <> auth.uid() THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, demand_id, demand_candidate_id)
      VALUES (
        v_assignee,
        'pipeline_changed',
        'Pipeline updated',
        COALESCE(v_candidate_name, 'Candidate') || ' moved to ' || NEW.stage::text || ' on "' || v_demand_title || '"',
        '/demands/' || NEW.demand_id::text,
        NEW.demand_id,
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_pipeline_changed
AFTER UPDATE OF stage ON public.demand_candidates
FOR EACH ROW EXECUTE FUNCTION public.notify_pipeline_changed();
