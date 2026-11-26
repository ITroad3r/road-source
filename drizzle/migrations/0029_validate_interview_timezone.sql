CREATE OR REPLACE FUNCTION public.validate_candidate_interview_timezone() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone) THEN
  RAISE EXCEPTION 'Invalid interview timezone' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER candidate_interviews_valid_timezone BEFORE INSERT OR UPDATE ON public.candidate_interviews FOR EACH ROW EXECUTE FUNCTION public.validate_candidate_interview_timezone();