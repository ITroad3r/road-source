-- 1. Tighten profiles SELECT: own profile or privileged roles only
DROP POLICY IF EXISTS "Profiles viewable by signed-in" ON public.profiles;

CREATE POLICY "Profiles: self or privileged read"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.has_any_role(auth.uid(), ARRAY['division_manager','division_director','ceo','admin']::app_role[])
  );

-- 2. Safe directory RPC for assignee pickers (id + full_name only)
CREATE OR REPLACE FUNCTION public.list_team_members()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id)
  ORDER BY p.full_name NULLS LAST
$$;

REVOKE EXECUTE ON FUNCTION public.list_team_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_team_members() TO authenticated;

-- 3. Restrict talent_hub_cvs SELECT to roles that need PII
DROP POLICY IF EXISTS "Talent Hub: signed-in search" ON public.talent_hub_cvs;

CREATE POLICY "Talent Hub: privileged read"
  ON public.talent_hub_cvs
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['sourcing_team','division_manager','division_director','ceo','admin']::app_role[])
  );

-- 4. Realtime: only allow users to subscribe to their own notification topic
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Realtime: own notifications channel" ON realtime.messages;
CREATE POLICY "Realtime: own notifications channel"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    -- allow postgres_changes on tables they already can SELECT via RLS,
    -- and explicit user-scoped topics like 'user:<uuid>'
    (extension = 'postgres_changes')
    OR (topic = 'user:' || auth.uid()::text)
  );