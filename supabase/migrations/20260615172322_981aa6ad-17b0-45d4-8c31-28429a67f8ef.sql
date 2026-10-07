DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bewerbungen') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bewerbungen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='empfehlungen') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.empfehlungen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='kontakte') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.kontakte';
  END IF;
END $$;

ALTER TABLE public.bewerbungen REPLICA IDENTITY FULL;
ALTER TABLE public.empfehlungen REPLICA IDENTITY FULL;
ALTER TABLE public.kontakte REPLICA IDENTITY FULL;