DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.hv_tickets; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.emails; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.hv_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.emails REPLICA IDENTITY FULL;