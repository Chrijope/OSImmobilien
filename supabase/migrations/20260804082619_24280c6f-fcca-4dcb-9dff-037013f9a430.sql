CREATE TABLE IF NOT EXISTS public.termin_erinnerungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aktivitaet_id uuid NOT NULL REFERENCES public.aktivitaeten(id) ON DELETE CASCADE,
  stufe text NOT NULL,
  termin_at timestamptz NOT NULL,
  gesendet_am timestamptz NOT NULL DEFAULT now(),
  erfolg boolean NOT NULL DEFAULT false,
  fehler text,
  CONSTRAINT termin_erinnerungen_stufe_chk CHECK (stufe IN ('24h', '6h', '1h')),
  CONSTRAINT termin_erinnerungen_einmalig UNIQUE (aktivitaet_id, stufe, termin_at)
);

ALTER TABLE public.termin_erinnerungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitung sieht Terminerinnerungen" ON public.termin_erinnerungen;
CREATE POLICY "Leitung sieht Terminerinnerungen"
  ON public.termin_erinnerungen FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber')
  );

CREATE INDEX IF NOT EXISTS termin_erinnerungen_aktivitaet_idx
  ON public.termin_erinnerungen (aktivitaet_id, termin_at);

SELECT cron.unschedule('send-termin-erinnerungen-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-termin-erinnerungen-hourly');

SELECT cron.schedule(
  'send-termin-erinnerungen-hourly',
  '20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/send-termin-erinnerungen',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer DEIN-ANON-KEY"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);