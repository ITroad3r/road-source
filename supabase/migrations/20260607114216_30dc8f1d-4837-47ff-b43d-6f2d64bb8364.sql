REVOKE EXECUTE ON FUNCTION public.notify_demand_assigned() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_pipeline_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_pipeline_added() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_pipeline_stage_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_demand_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_demand_outcome() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;