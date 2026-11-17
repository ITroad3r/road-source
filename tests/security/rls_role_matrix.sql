-- Role-scoped RLS verification. Runs as the "authenticated" DB role with a real
-- user's JWT claims, swapping that user's roles per scenario. Ends with RAISE so
-- every change is rolled back; the exception message holds the results.
DO $$
DECLARE
  u uuid := '0d9547f8-92e3-454e-bcb9-0832c85716ce'; -- QA test account
  roles_set text[];
  out text := '';
  n int; ok boolean;
BEGIN
  FOREACH roles_set SLICE 1 IN ARRAY ARRAY[['sourceur'],['hrbp'],['operations'],['ceo'],['admin']] LOOP
    DELETE FROM public.user_roles WHERE user_id = u AND role <> 'admin';
    IF roles_set[1] <> 'admin' THEN
      INSERT INTO public.user_roles(user_id, role) VALUES (u, roles_set[1]::public.app_role);
    END IF;
    -- keep an admin row only for the admin scenario (another admin exists so guard allows)
    IF roles_set[1] <> 'admin' THEN DELETE FROM public.user_roles WHERE user_id = u AND role = 'admin'; END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    SELECT count(*) INTO n FROM public.candidate_financials; out := out || roles_set[1] || ': fin_rows=' || n;
    SELECT count(*) INTO n FROM public.talent_hub_cvs; out := out || ' cvs=' || n;
    SELECT count(*) INTO n FROM public.demands; out := out || ' demands=' || n;
    SELECT count(*) INTO n FROM public.clients; out := out || ' clients=' || n;
    BEGIN
      INSERT INTO public.clients(name) VALUES ('[TEST] rls probe'); ok := true;
    EXCEPTION WHEN others THEN ok := false; END;
    out := out || ' client_insert=' || ok;
    BEGIN
      UPDATE public.candidate_financials SET client_rate = client_rate WHERE true;
      GET DIAGNOSTICS n = ROW_COUNT; out := out || ' fin_update_rows=' || n;
    EXCEPTION WHEN others THEN out := out || ' fin_update=denied'; END;
    BEGIN
      INSERT INTO public.user_roles(user_id, role) VALUES (u, 'operations'); ok := true;
    EXCEPTION WHEN others THEN ok := false; END;
    out := out || ' self_escalate=' || ok || E'\n';

    RESET ROLE;
    DELETE FROM public.user_roles WHERE user_id = u AND role = 'operations';
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=u AND role='admin') THEN
      INSERT INTO public.user_roles(user_id, role) VALUES (u, 'admin');
    END IF;
  END LOOP;
  RAISE EXCEPTION 'RESULTS:%', E'\n' || out;
END $$;
