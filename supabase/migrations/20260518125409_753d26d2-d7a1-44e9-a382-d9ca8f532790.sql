
ALTER TABLE public.chat_nachrichten REPLICA IDENTITY FULL;
ALTER TABLE public.chat_gruppen REPLICA IDENTITY FULL;
ALTER TABLE public.chat_teilnehmer REPLICA IDENTITY FULL;

-- OSImmobilien: nur aufnehmen, wenn die Tabelle noch nicht in der Publikation ist
DO $osi$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_nachrichten') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_nachrichten;
  END IF;
END $osi$;
-- OSImmobilien: nur aufnehmen, wenn die Tabelle noch nicht in der Publikation ist
DO $osi$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_gruppen') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_gruppen;
  END IF;
END $osi$;
-- OSImmobilien: nur aufnehmen, wenn die Tabelle noch nicht in der Publikation ist
DO $osi$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_teilnehmer') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_teilnehmer;
  END IF;
END $osi$;
