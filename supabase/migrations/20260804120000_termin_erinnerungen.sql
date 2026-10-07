-- Terminerinnerungen fuer jeden Termin, egal welcher Anlass
--
-- Bisher gab es Erinnerungen nur fuer zwei eng zugeschnittene Faelle:
-- `send-erstgespraech-reminders` liest den Setter-Termin aus `kontakte.meta`,
-- `send-zoom-beratung-reminders` schickt eine Meldung an den Berater. Ein ganz
-- normaler Termin in der Kundenakte, von Hand angelegt oder ueber den
-- Buchungslink entstanden, blieb ohne Erinnerung.
--
-- Neu ist deshalb `send-termin-erinnerungen`. Die Function liest die Termine
-- direkt aus `aktivitaeten` (art = 'meeting') und schickt dem Kunden 24, 6 und
-- 1 Stunde vorher eine Mail.
--
-- Diese Tabelle ist das Gedaechtnis dazu. Sie haelt fest, welche Stufe fuer
-- welchen Termin schon hinausging, damit ein zweiter Lauf in derselben Stunde
-- nichts doppelt schickt.

CREATE TABLE IF NOT EXISTS public.termin_erinnerungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aktivitaet_id uuid NOT NULL REFERENCES public.aktivitaeten(id) ON DELETE CASCADE,
  stufe text NOT NULL,
  -- Der Zeitpunkt, fuer den die Erinnerung galt.
  --
  -- Er gehoert bewusst in den Schluessel. Wird ein Termin verschoben, ist es
  -- ein anderer Zeitpunkt, also darf dieselbe Stufe erneut hinausgehen. Ohne
  -- dieses Feld haette ein einmal erinnerter Termin nach dem Verschieben nie
  -- wieder eine Erinnerung bekommen.
  termin_at timestamptz NOT NULL,
  gesendet_am timestamptz NOT NULL DEFAULT now(),
  -- Der Eintrag entsteht VOR dem Versand und bleibt auch dann stehen, wenn der
  -- Versand scheitert. Sonst wuerde es die naechste Stunde wieder versucht,
  -- und bei einem dauerhaften Fehler jede Stunde erneut. Ein Fehlschlag ist
  -- hier vermerkt, statt ihn durch endloses Wiederholen zu verdecken.
  erfolg boolean NOT NULL DEFAULT false,
  fehler text,
  CONSTRAINT termin_erinnerungen_stufe_chk CHECK (stufe IN ('24h', '6h', '1h')),
  CONSTRAINT termin_erinnerungen_einmalig UNIQUE (aktivitaet_id, stufe, termin_at)
);

ALTER TABLE public.termin_erinnerungen ENABLE ROW LEVEL SECURITY;

-- Geschrieben wird ausschliesslich vom Cronjob mit dem Service-Schluessel, der
-- an RLS vorbeigeht. Fuer Menschen ist die Tabelle nur zum Nachsehen da, und
-- auch das nur fuer die Leitung.
DROP POLICY IF EXISTS "Leitung sieht Terminerinnerungen" ON public.termin_erinnerungen;
CREATE POLICY "Leitung sieht Terminerinnerungen"
  ON public.termin_erinnerungen FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber')
  );

-- Der Job fragt je Lauf nach genau diesen drei Spalten.
CREATE INDEX IF NOT EXISTS termin_erinnerungen_aktivitaet_idx
  ON public.termin_erinnerungen (aktivitaet_id, termin_at);

-- ── Zeitplan ─────────────────────────────────────────────────────────────
--
-- Stuendlich zur Minute 20. Die volle und die halbe Stunde sind bewusst
-- gemieden: dort draengeln sich mehrere Jobs, und am 03.08.2026 ist der
-- Geburtstagsjob in diesem Gedraenge in einen DNS-Timeout gelaufen, der Aufruf
-- hat den Server nie erreicht. Aus demselben Grund 15 Sekunden Timeout statt
-- der voreingestellten fuenf.
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
