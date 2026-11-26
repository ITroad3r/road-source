CREATE FUNCTION public.can_access_candidate_chat(_dc uuid, _room text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT _room IN ('sourcing','operations') AND EXISTS (SELECT 1 FROM public.demand_candidates dc JOIN public.demands d ON d.id=dc.demand_id WHERE dc.id=_dc AND (public.has_role(auth.uid(),'hrbp') OR (_room='sourcing' AND public.has_role(auth.uid(),'sourceur') AND d.assigned_to=auth.uid()) OR (_room='operations' AND public.has_role(auth.uid(),'operations'))));
$$;
REVOKE ALL ON FUNCTION public.can_access_candidate_chat(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_candidate_chat(uuid,text) TO authenticated,service_role;
CREATE TABLE public.candidate_chat_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 demand_candidate_id uuid NOT NULL REFERENCES public.demand_candidates(id) ON DELETE CASCADE,
 room text NOT NULL CHECK(room IN ('sourcing','operations')),
 sender_id uuid NOT NULL,
 sender_name text NOT NULL DEFAULT '',
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 5000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT,INSERT ON public.candidate_chat_messages TO authenticated;
GRANT ALL ON public.candidate_chat_messages TO service_role;
ALTER TABLE public.candidate_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat participants read" ON public.candidate_chat_messages FOR SELECT TO authenticated USING(public.can_access_candidate_chat(demand_candidate_id,room));
CREATE POLICY "Chat participants send as themselves" ON public.candidate_chat_messages FOR INSERT TO authenticated WITH CHECK(sender_id=(SELECT auth.uid()) AND public.can_access_candidate_chat(demand_candidate_id,room));
CREATE INDEX candidate_chat_messages_room_time ON public.candidate_chat_messages(demand_candidate_id,room,created_at DESC);
CREATE INDEX candidate_chat_messages_sender ON public.candidate_chat_messages(sender_id);
CREATE TABLE public.candidate_chat_reads (
 user_id uuid NOT NULL,
 demand_candidate_id uuid NOT NULL REFERENCES public.demand_candidates(id) ON DELETE CASCADE,
 room text NOT NULL CHECK(room IN ('sourcing','operations')),
 last_read_at timestamptz NOT NULL DEFAULT 'epoch',
 PRIMARY KEY(user_id,demand_candidate_id,room)
);
GRANT SELECT ON public.candidate_chat_reads TO authenticated;
GRANT ALL ON public.candidate_chat_reads TO service_role;
ALTER TABLE public.candidate_chat_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own chat receipts" ON public.candidate_chat_reads FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) AND public.can_access_candidate_chat(demand_candidate_id,room));
CREATE INDEX candidate_chat_reads_candidate ON public.candidate_chat_reads(demand_candidate_id);
CREATE FUNCTION public.prepare_candidate_chat_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NEW.sender_id<>auth.uid() OR NOT public.can_access_candidate_chat(NEW.demand_candidate_id,NEW.room) THEN RAISE EXCEPTION 'Chat access denied' USING ERRCODE='42501'; END IF;
 NEW.body:=btrim(NEW.body); NEW.created_at:=clock_timestamp();
 SELECT coalesce(nullif(p.full_name,''),'Participant') INTO NEW.sender_name FROM public.profiles p WHERE p.id=auth.uid();
 NEW.sender_name:=coalesce(NEW.sender_name,'Participant'); RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_candidate_chat_message() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER prepare_candidate_chat_message BEFORE INSERT ON public.candidate_chat_messages FOR EACH ROW EXECUTE FUNCTION public.prepare_candidate_chat_message();
CREATE FUNCTION public.mark_candidate_chat_read(_dc uuid,_room text,_through timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_access_candidate_chat(_dc,_room) THEN RAISE EXCEPTION 'Chat access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.candidate_chat_messages m WHERE m.demand_candidate_id=_dc AND m.room=_room AND m.created_at=_through) THEN RAISE EXCEPTION 'Invalid read receipt'; END IF;
 INSERT INTO public.candidate_chat_reads(user_id,demand_candidate_id,room,last_read_at) VALUES(auth.uid(),_dc,_room,_through)
 ON CONFLICT(user_id,demand_candidate_id,room) DO UPDATE SET last_read_at=greatest(public.candidate_chat_reads.last_read_at,excluded.last_read_at);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_candidate_chat_read(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_candidate_chat_read(uuid,text,timestamptz) TO authenticated,service_role;
CREATE FUNCTION public.candidate_chat_unread(_dc uuid) RETURNS TABLE(room text, unread bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT m.room,count(*) FROM public.candidate_chat_messages m LEFT JOIN public.candidate_chat_reads r ON r.demand_candidate_id=m.demand_candidate_id AND r.room=m.room AND r.user_id=auth.uid()
 WHERE m.demand_candidate_id=_dc AND m.sender_id<>auth.uid() AND m.created_at>coalesce(r.last_read_at,'epoch'::timestamptz) GROUP BY m.room;
$$;
REVOKE ALL ON FUNCTION public.candidate_chat_unread(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.candidate_chat_unread(uuid) TO authenticated,service_role;
CREATE FUNCTION public.candidate_chat_topic_allowed(_topic text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT split_part(_topic,':',1)='candidate-chat' AND EXISTS(SELECT 1 FROM public.demand_candidates dc WHERE dc.id::text=split_part(_topic,':',2) AND public.can_access_candidate_chat(dc.id,split_part(_topic,':',3)));
$$;
REVOKE ALL ON FUNCTION public.candidate_chat_topic_allowed(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.candidate_chat_topic_allowed(text) TO authenticated,service_role;
CREATE POLICY "Private candidate chat signals" ON realtime.messages FOR SELECT TO authenticated USING(public.candidate_chat_topic_allowed(realtime.topic()));
CREATE FUNCTION public.ring_candidate_chat() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM realtime.send('{}'::jsonb,'changed','candidate-chat:'||NEW.demand_candidate_id::text||':'||NEW.room,true); RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ring_candidate_chat() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ring_candidate_chat AFTER INSERT ON public.candidate_chat_messages FOR EACH ROW EXECUTE FUNCTION public.ring_candidate_chat();