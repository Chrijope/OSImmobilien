-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create private storage bucket for backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Only service_role can access backups bucket
CREATE POLICY "Service role full access on backups"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'backups')
WITH CHECK (bucket_id = 'backups');
