ALTER PUBLICATION supabase_realtime ADD TABLE public.academy_progress;
ALTER TABLE public.academy_progress REPLICA IDENTITY FULL;