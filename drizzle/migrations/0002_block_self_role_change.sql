CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD.user_id; ELSE target := NEW.user_id; END IF;
  IF auth.uid() IS NOT NULL AND target = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own roles; ask another administrator';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_prevent_self_role_change ON public.user_roles;
CREATE TRIGGER trg_prevent_self_role_change BEFORE INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();