ALTER PUBLICATION supabase_realtime ADD TABLE public.empfehlungsprogramme;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signature_requests;
ALTER TABLE public.empfehlungsprogramme REPLICA IDENTITY FULL;
ALTER TABLE public.signature_requests REPLICA IDENTITY FULL;