-- PENDING APPROVAL — not applied.
-- Blocks any signed-in user (including admins) from granting or revoking their OWN roles.
-- Admins keep managing other accounts. Recovery when no second admin exists:
-- run the role change from the backend SQL console (no signed-in user, auth.uid() IS NULL);
-- it is still recorded in role_audit_log with actor = NULL ("system").
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  IF auth.uid() IS NOT NULL AND target = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own roles; ask another administrator';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS trg_prevent_self_role_change ON public.user_roles;
CREATE TRIGGER trg_prevent_self_role_change BEFORE INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();
