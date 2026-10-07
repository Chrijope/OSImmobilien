-- OSImmobilien: nur aufnehmen, wenn die Tabelle noch nicht in der Publikation ist
DO $osi$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_log') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  END IF;
END $osi$;