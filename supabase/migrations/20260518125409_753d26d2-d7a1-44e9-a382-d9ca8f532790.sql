
ALTER TABLE public.chat_nachrichten REPLICA IDENTITY FULL;
ALTER TABLE public.chat_gruppen REPLICA IDENTITY FULL;
ALTER TABLE public.chat_teilnehmer REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_nachrichten;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_gruppen;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_teilnehmer;
