-- ===========================================================================
-- Bewerberformular vor dem Erstgespräch
-- ===========================================================================
--
-- Der Bewerber bekommt nach seiner Bewerbung eine Mail mit einem persönlichen
-- Link und beantwortet dort zehn kurze Fragen. Die HR-Managerin sieht die
-- Antworten im Erstgesprächs-Tab und kann das Gespräch damit sofort vertiefen,
-- statt den Werdegang erst zu erheben.
--
-- Bewusst eine eigene Tabelle und nicht `bewerbungen.meta`:
--
--   1. `bewerberToDb` in src/lib/bewerbungStore.ts baut das meta-Objekt bei
--      jedem Speichern aus den bekannten Feldern neu auf. Ein Schlüssel, den
--      der Store nicht kennt, verschwindet beim nächsten Speichern.
--   2. Was der Bewerber selbst geschrieben hat, ist rechtlich etwas anderes
--      als interne Notizen über ihn. Einwilligungszeitpunkt, Textfassung und
--      Löschfrist gehören sauber getrennt.
--
-- Zugriffsschutz nach dem Muster der Selbstauskunft, aber gleich in der
-- verschärften Fassung: `anon` bekommt keinerlei direkten Tabellenzugriff.
-- Gelesen wird über eine Datenbankfunktion, die nur Vorname, Status und
-- Ablaufdatum herausgibt. Wer ein Token errät, sieht damit nichts als einen
-- Vornamen. Geschrieben wird ausschließlich über eine Edge Function mit
-- Service-Rolle.

CREATE TABLE IF NOT EXISTS public.bewerber_formular (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 32 Byte Zufall, hexadezimal. Nicht ableitbar, ohne Bezug zur Person.
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  bewerbung_id uuid NOT NULL REFERENCES public.bewerbungen(id) ON DELETE CASCADE,
  -- Nur der Vorname, für die Begrüßung auf der öffentlichen Seite.
  -- Bewusst kein Nachname und keine Adresse: Was nicht gebraucht wird,
  -- steht auch nicht hinter einem öffentlich erreichbaren Token.
  vorname text NOT NULL DEFAULT '',
  -- offen | eingereicht | abgelaufen | ersetzt
  status text NOT NULL DEFAULT 'offen',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  antworten jsonb NOT NULL DEFAULT '{}'::jsonb,
  eingereicht_am timestamptz,
  einwilligung_am timestamptz,
  -- Welche Fassung des Einwilligungstextes der Bewerber gesehen hat.
  einwilligung_version text,
  -- Zeitpunkt der einen Erinnerung. Gesetzt heißt: wurde verschickt.
  erinnerung_am timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS bewerber_formular_bewerbung_idx
  ON public.bewerber_formular (bewerbung_id);

-- Für den Erinnerungsdienst: sucht offene Formulare, die alt genug sind.
CREATE INDEX IF NOT EXISTS bewerber_formular_offen_idx
  ON public.bewerber_formular (status, created_at)
  WHERE status = 'offen';

COMMENT ON TABLE public.bewerber_formular IS
  'Persönliche Vorab-Fragebögen der Bewerber. Lesen über get_bewerber_formular, Schreiben nur über Edge Functions mit Service-Rolle.';

-- ── Zeilensicherheit ──

ALTER TABLE public.bewerber_formular ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Interne duerfen Bewerberformulare lesen" ON public.bewerber_formular;
CREATE POLICY "Interne duerfen Bewerberformulare lesen"
  ON public.bewerber_formular FOR SELECT TO authenticated
  USING (public.is_internal_role(auth.uid()));

-- Kein INSERT, UPDATE oder DELETE für angemeldete Nutzer. Alles Schreibende
-- läuft über die Service-Rolle, die die Zeilensicherheit ohnehin umgeht.
REVOKE ALL ON public.bewerber_formular FROM anon;
GRANT SELECT ON public.bewerber_formular TO authenticated;

-- ── Lesen für die öffentliche Seite ──

CREATE OR REPLACE FUNCTION public.get_bewerber_formular(_token text)
RETURNS TABLE (
  vorname text,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Gibt bewusst NICHT die ganze Zeile zurück. Weder die Bewerbungs-Kennung
  -- noch bereits gegebene Antworten verlassen die Datenbank auf diesem Weg.
  SELECT f.vorname, f.status, f.expires_at
  FROM public.bewerber_formular f
  WHERE f.token = _token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_bewerber_formular(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_bewerber_formular(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_bewerber_formular(text) IS
  'Öffentliche Leseabfrage für die Formularseite. Liefert nur Vorname, Status und Ablaufdatum.';

-- ── Abgelaufene Token aufräumen ──
--
-- Nicht eingereichte Formulare enthalten nur einen Vornamen. Sie werden 30
-- Tage nach Ablauf entfernt. Eingereichte Antworten bleiben und folgen der
-- allgemeinen Löschfrist des Bewerbermanagements.

CREATE OR REPLACE FUNCTION public.bewerber_formular_aufraeumen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _anzahl integer;
BEGIN
  UPDATE public.bewerber_formular
     SET status = 'abgelaufen'
   WHERE status = 'offen'
     AND expires_at < now();

  DELETE FROM public.bewerber_formular
   WHERE status IN ('abgelaufen', 'ersetzt')
     AND eingereicht_am IS NULL
     AND expires_at < now() - interval '30 days';

  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  RETURN _anzahl;
END $$;

REVOKE ALL ON FUNCTION public.bewerber_formular_aufraeumen() FROM anon, authenticated;

COMMENT ON FUNCTION public.bewerber_formular_aufraeumen() IS
  'Markiert abgelaufene Formular-Token und löscht nie eingereichte nach 30 Tagen.';

-- ── Zeitplan für die eine Erinnerung ──
--
-- Einmal täglich um 08:00 UTC, also 10 Uhr deutscher Sommerzeit. Die Function
-- prüft selbst, ob überhaupt erinnert werden darf: Der Fragebogen muss offen
-- sein, älter als drei Tage, und das Erstgespräch darf noch nicht geführt sein.

DO $$
DECLARE
  _alt RECORD;
  _url text := 'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/send-bewerber-formular-erinnerungen';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;

  FOR _alt IN
    SELECT jobname FROM cron.job
     WHERE jobname = 'bewerber-formular-erinnerungen'
        OR command LIKE '%/functions/v1/send-bewerber-formular-erinnerungen%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(_alt.jobname);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Zeitplan "%" konnte nicht entfernt werden: %.', _alt.jobname, SQLERRM;
    END;
  END LOOP;

  PERFORM cron.schedule(
    'bewerber-formular-erinnerungen',
    '0 8 * * *',
    format(
      $cron$SELECT net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);$cron$,
      _url
    )
  );
  RAISE NOTICE 'Zeitplan "bewerber-formular-erinnerungen" gesetzt.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;
