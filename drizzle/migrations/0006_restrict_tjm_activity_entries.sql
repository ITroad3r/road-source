DROP POLICY IF EXISTS "Activity: business read" ON public.activity_log;
CREATE POLICY "Activity: business read" ON public.activity_log FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['operations'::public.app_role, 'ceo'::public.app_role])
  OR (kind <> 'tjm_approval' AND public.has_any_role(auth.uid(), ARRAY['sourceur'::public.app_role, 'hrbp'::public.app_role]))
);