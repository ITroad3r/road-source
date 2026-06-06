
DROP POLICY "System inserts notifications" ON public.notifications;

REVOKE EXECUTE ON FUNCTION public.notify_demand_assigned() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_pipeline_changed() FROM PUBLIC, anon, authenticated;
