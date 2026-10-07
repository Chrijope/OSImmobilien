-- Enable realtime for tables used by the customer portal so doc/status changes
-- (e.g. Bonität freigegeben) appear instantly in the Kundenportal.
ALTER TABLE public.investments REPLICA IDENTITY FULL;
ALTER TABLE public.kontakte REPLICA IDENTITY FULL;
ALTER TABLE public.benachrichtigungen REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='investments') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.investments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='kontakte') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.kontakte';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='benachrichtigungen') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.benachrichtigungen';
  END IF;
END $$;