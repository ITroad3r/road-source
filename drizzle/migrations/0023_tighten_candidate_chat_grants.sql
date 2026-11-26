REVOKE ALL ON public.candidate_chat_messages, public.candidate_chat_reads FROM anon;
REVOKE ALL ON public.candidate_chat_messages, public.candidate_chat_reads FROM authenticated;
GRANT SELECT,INSERT ON public.candidate_chat_messages TO authenticated;
GRANT SELECT ON public.candidate_chat_reads TO authenticated;