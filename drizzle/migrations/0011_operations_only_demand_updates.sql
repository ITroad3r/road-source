ALTER POLICY "Demands: update" ON public.demands
USING (public.has_role(auth.uid(), 'operations'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'operations'::public.app_role));
CREATE POLICY "Demands: operations update guard" ON public.demands AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'operations'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'operations'::public.app_role));