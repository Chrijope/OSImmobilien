-- ===========================================================================
-- Abmeldung „Kein Interesse mehr" aus der Nachfass-Mail
-- ===========================================================================
--
-- Die einmalige Nachfass-Mail an alle Bewerber im Eingang trägt einen
-- Textlink „Ich habe kein Interesse mehr". Er führt auf eine öffentliche
-- Seite, die beim Öffnen nichts ändert; erst der Knopf dort schickt das Token
-- an die Edge Function `bewerber-kein-interesse`, und die setzt den Bewerber
-- auf „Kein Interesse".
--
-- Aufbau nach dem Muster von `bewerber_formular` (20260819180000):
--
--   Token       32 Byte Zufall als Hex, nicht ableitbar, ohne Personenbezug.
--   vorname     nur für die Begrüßung auf der Seite, sonst nichts Persönliches.
--   status      offen | bestaetigt | ersetzt
--   grund       das freiwillige Feld „Magst du uns kurz sagen, warum?"
--   expires_at  90 Tage ab Erstellung. Danach gilt der Link nicht mehr.
--
-- Zugriffsschutz, bewusst enger als beim Formular: Weder `anon` noch
-- `authenticated` haben direkten Tabellenzugriff. Das CRM liest die Tabelle
-- nirgends, deshalb gibt es auch keine Lesepolicy für Interne (die Rolle
-- is_internal_role umfasst auch Vertriebspartner, und die haben mit fremden
-- Abmelde-Token nichts zu tun). Die öffentliche Seite liest über
-- `get_bewerber_abmeldung(token)`, die nur Vorname und Status herausgibt.
-- Geschrieben wird ausschließlich über Edge Functions mit der Service-Rolle:
-- `send-bewerber-nachfass` legt die Token an, `bewerber-kein-interesse`
-- verbraucht sie.

CREATE TABLE IF NOT EXISTS public.bewerber_abmeldung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  bewerbung_id uuid NOT NULL REFERENCES public.bewerbungen(id) ON DELETE CASCADE,
  vorname text NOT NULL DEFAULT '',
  -- offen | bestaetigt | ersetzt
  status text NOT NULL DEFAULT 'offen',
  -- Der freiwillige Grund des Bewerbers, höchstens 500 Zeichen.
  grund text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  -- Gesetzt heißt: Der Bewerber hat auf der Seite bestätigt.
  verwendet_am timestamptz,
  -- Nach 90 Tagen ist der Link nicht mehr gültig. Wer sich dann noch
  -- abmelden will, schreibt an office@example.org, die Seite sagt das.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

-- Robust gegen einen frueheren Lauf der ersten Fassung ohne expires_at.
ALTER TABLE public.bewerber_abmeldung
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days');

CREATE INDEX IF NOT EXISTS bewerber_abmeldung_bewerbung_idx
  ON public.bewerber_abmeldung (bewerbung_id);

COMMENT ON TABLE public.bewerber_abmeldung IS
  'Abmelde-Token aus der Nachfass-Mail an Bewerber im Eingang. Lesen nur über get_bewerber_abmeldung, Schreiben nur über Edge Functions mit Service-Rolle.';

-- ── Zeilensicherheit ──
--
-- RLS ist an, und es gibt keine einzige Policy: Kein angemeldeter Nutzer
-- liest oder schreibt hier direkt. Die Service-Rolle umgeht RLS ohnehin.

ALTER TABLE public.bewerber_abmeldung ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bewerber_abmeldung FROM anon, authenticated;

-- ── Lesen für die öffentliche Seite ──

CREATE OR REPLACE FUNCTION public.get_bewerber_abmeldung(_token text)
RETURNS TABLE (
  vorname text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Gibt bewusst NICHT die ganze Zeile zurück. Weder die Bewerbungs-Kennung
  -- noch ein bereits eingetragener Grund verlassen die Datenbank auf diesem
  -- Weg. Ein abgelaufenes offenes Token meldet sich als 'abgelaufen', damit
  -- die Seite kein Ablaufdatum braucht.
  SELECT
    a.vorname,
    CASE
      WHEN a.status = 'offen' AND a.expires_at < now() THEN 'abgelaufen'
      ELSE a.status
    END AS status
  FROM public.bewerber_abmeldung a
  WHERE a.token = _token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_bewerber_abmeldung(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_bewerber_abmeldung(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_bewerber_abmeldung(text) IS
  'Öffentliche Leseabfrage für die Seite „Kein Interesse mehr". Liefert nur Vorname und Status.';

-- ── Aufräumen ──
--
-- Ein Token trägt nur einen Vornamen und, nach der Bestätigung, den Grund.
-- Der Grund steht dann längst in der Bewerberakte (meta.selbstAbgemeldetGrund)
-- und folgt deren Löschfrist; die Tokenzeile selbst wird nicht mehr gebraucht.
-- Verbrauchte und ersetzte Einträge gehen 30 Tage nach ihrer Verwendung,
-- nie verwendete 30 Tage nach ihrem Ablauf.

CREATE OR REPLACE FUNCTION public.bewerber_abmeldung_aufraeumen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _anzahl integer;
BEGIN
  DELETE FROM public.bewerber_abmeldung
   WHERE (status IN ('bestaetigt', 'ersetzt')
          AND COALESCE(verwendet_am, erstellt_am) < now() - interval '30 days')
      OR (status = 'offen'
          AND expires_at < now() - interval '30 days');

  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  RETURN _anzahl;
END $$;

REVOKE ALL ON FUNCTION public.bewerber_abmeldung_aufraeumen() FROM public, anon, authenticated;

COMMENT ON FUNCTION public.bewerber_abmeldung_aufraeumen() IS
  'Löscht verbrauchte, ersetzte und abgelaufene Abmelde-Token 30 Tage nach Verwendung bzw. Ablauf.';

-- Wöchentlich, sonntags um 4 Uhr UTC, wie das Aufräumen der Videoräume.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bewerber-abmeldung-aufraeumen') THEN
      PERFORM cron.unschedule('bewerber-abmeldung-aufraeumen');
    END IF;
    PERFORM cron.schedule('bewerber-abmeldung-aufraeumen', '0 4 * * 0',
                          'SELECT public.bewerber_abmeldung_aufraeumen();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuers Aufraeumen nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;
