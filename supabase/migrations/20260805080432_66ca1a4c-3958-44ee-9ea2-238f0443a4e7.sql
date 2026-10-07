CREATE TABLE IF NOT EXISTS public.nachtpruefung_befunde (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lauf_at timestamptz NOT NULL DEFAULT now(),
  pruefung text NOT NULL,
  schwere text NOT NULL DEFAULT 'warnung',
  anzahl integer NOT NULL DEFAULT 0,
  meldung text NOT NULL,
  beispiele jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nachtpruefung_schwere_chk CHECK (schwere IN ('hinweis', 'warnung', 'fehler'))
);

CREATE INDEX IF NOT EXISTS nachtpruefung_lauf_idx
  ON public.nachtpruefung_befunde (lauf_at DESC);
CREATE INDEX IF NOT EXISTS nachtpruefung_offen_idx
  ON public.nachtpruefung_befunde (lauf_at DESC) WHERE anzahl > 0;

GRANT SELECT ON public.nachtpruefung_befunde TO authenticated;
GRANT ALL ON public.nachtpruefung_befunde TO service_role;

ALTER TABLE public.nachtpruefung_befunde ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins sehen die Nachtpruefung" ON public.nachtpruefung_befunde;
CREATE POLICY "Admins sehen die Nachtpruefung"
  ON public.nachtpruefung_befunde FOR SELECT TO authenticated
  USING (public.is_admin_role(auth.uid()));

REVOKE ALL ON public.nachtpruefung_befunde FROM anon;

CREATE OR REPLACE FUNCTION public.nachtpruefung_lauf()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lauf timestamptz := now();
  v_anzahl integer;
  v_beispiele jsonb;
  v_befunde integer := 0;
BEGIN
  DELETE FROM public.nachtpruefung_befunde WHERE lauf_at < now() - interval '28 days';

  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'name', name, 'start', start_at,
             'fehler', meta->>'bestaetigung_fehler') ORDER BY start_at DESC), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT * FROM public.buchungen
             WHERE meta ? 'bestaetigung_fehler'
               AND created_at > now() - interval '14 days'
             ORDER BY created_at DESC LIMIT 10) t;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'buchung_ohne_bestaetigung',
            CASE WHEN v_anzahl > 0 THEN 'fehler' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' Buchung(en) der letzten 14 Tage ohne versendete Bestätigung. Diese Kunden haben gebucht und nie eine Mail bekommen.'
                 ELSE 'Alle Buchungsbestätigungen der letzten 14 Tage sind rausgegangen.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'buchung_ohne_bestaetigung', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'stufe', stufe, 'termin', termin_at, 'fehler', fehler) ORDER BY gesendet_am DESC), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT * FROM public.termin_erinnerungen
             WHERE erfolg = false AND gesendet_am > now() - interval '7 days'
             ORDER BY gesendet_am DESC LIMIT 10) t;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'erinnerung_fehlgeschlagen',
            CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' Terminerinnerung(en) der letzten 7 Tage sind nicht angekommen.'
                 ELSE 'Alle Terminerinnerungen der letzten 7 Tage sind rausgegangen.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'erinnerung_fehlgeschlagen', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  BEGIN
    SELECT count(*) INTO v_anzahl
      FROM public.aktivitaeten
     WHERE faellig_am IS NOT NULL AND faellig_am <> ''
       AND erledigt_am IS NULL
       AND art IN ('termin', 'meeting');

    IF v_anzahl > 0 AND NOT EXISTS (
      SELECT 1 FROM public.termin_erinnerungen WHERE gesendet_am > now() - interval '26 hours'
    ) THEN
      INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
      VALUES (v_lauf, 'erinnerungsdienst_still', 'fehler', 1,
              'Seit über 26 Stunden wurde keine einzige Terminerinnerung versendet, obwohl Termine anstehen. Vermutlich läuft der Zeitplan nicht.');
    ELSE
      INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
      VALUES (v_lauf, 'erinnerungsdienst_still', 'hinweis', 0,
              'Der Erinnerungsdienst hat in den letzten 26 Stunden gearbeitet.');
    END IF;
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'erinnerungsdienst_still', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'titel', titel, 'seit', updated_at) ORDER BY updated_at), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT * FROM public.videoraeume
             WHERE status = 'laufend' AND updated_at < now() - interval '6 hours'
             ORDER BY updated_at LIMIT 10) t;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'videoraum_haengt',
            CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' Videoraum/Videoräume stehen seit über 6 Stunden auf "laufend" und blockieren damit den nächsten Gast.'
                 ELSE 'Kein Videoraum hängt.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'videoraum_haengt', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'name', name, 'email', email, 'abgelaufen', expires_at) ORDER BY expires_at DESC), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT * FROM public.signature_requests
             WHERE status = 'pending'
               AND expires_at < now()
               AND expires_at > now() - interval '30 days'
             ORDER BY expires_at DESC LIMIT 10) t;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'signatur_abgelaufen',
            CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' Unterschrift(en) sind abgelaufen, ohne dass jemand unterschrieben hat. Hier lohnt ein Anruf.'
                 ELSE 'Keine abgelaufenen Unterschriftsanfragen.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'signatur_abgelaufen', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'name', coalesce(vorname, '') || ' ' || coalesce(nachname, ''),
             'seit', created_at) ORDER BY created_at), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT * FROM public.kontakte
             WHERE zustaendig_id IS NULL
               AND coalesce((meta->>'offenerLead')::boolean, false) = false
               AND coalesce(geloescht, false) = false
               AND created_at < now() - interval '2 days'
             ORDER BY created_at LIMIT 10) t;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'kontakt_ohne_zustaendigen',
            CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' Kontakt(e) liegen seit über zwei Tagen ohne Zuständigen da und sind auch nicht als offener Lead gekennzeichnet.'
                 ELSE 'Jeder Kontakt hat einen Zuständigen.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'kontakt_ohne_zustaendigen', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'name', name, 'start', start_at) ORDER BY start_at), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT b.* FROM public.buchungen b
             WHERE b.status = 'offen'
               AND b.start_at > now()
               AND b.start_at < now() + interval '7 days'
               AND NOT EXISTS (SELECT 1 FROM public.videoraeume v WHERE v.id::text = b.meta->>'raum_id')
               AND b.meta ? 'raum_id'
             ORDER BY b.start_at LIMIT 10) t;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'termin_ohne_raum',
            CASE WHEN v_anzahl > 0 THEN 'fehler' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' anstehende(r) Termin(e) verweisen auf einen Videoraum, den es nicht mehr gibt. Diese Kunden kommen nicht hinein.'
                 ELSE 'Alle anstehenden Videotermine haben einen gültigen Raum.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'termin_ohne_raum', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('email', email) ORDER BY created_at DESC), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT s.* FROM public.suppressed_emails s
             WHERE EXISTS (SELECT 1 FROM public.kontakte k
                            WHERE lower(k.email) = lower(s.email)
                              AND coalesce(k.geloescht, false) = false)
             ORDER BY s.created_at DESC LIMIT 10) t;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'kunde_auf_sperrliste',
            CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' aktive(r) Kontakt(e) stehen auf der Mail-Sperrliste und bekommen von uns gar keine Nachrichten mehr.'
                 ELSE 'Kein aktiver Kontakt steht auf der Sperrliste.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'kunde_auf_sperrliste', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  RETURN v_befunde;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nachtpruefung_lauf() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.nachtpruefung_bericht()
RETURNS TABLE (
  lauf_at timestamptz,
  pruefung text,
  schwere text,
  anzahl integer,
  meldung text,
  beispiele jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT b.lauf_at, b.pruefung, b.schwere, b.anzahl, b.meldung, b.beispiele
    FROM public.nachtpruefung_befunde b
   WHERE b.lauf_at = (SELECT max(lauf_at) FROM public.nachtpruefung_befunde)
     AND public.is_admin_role(auth.uid())
   ORDER BY CASE b.schwere WHEN 'fehler' THEN 0 WHEN 'warnung' THEN 1 ELSE 2 END,
            b.anzahl DESC, b.pruefung;
$fn$;

GRANT EXECUTE ON FUNCTION public.nachtpruefung_bericht() TO authenticated;
REVOKE ALL ON FUNCTION public.nachtpruefung_bericht() FROM anon;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nachtpruefung') THEN
      PERFORM cron.unschedule('nachtpruefung');
    END IF;
    PERFORM cron.schedule('nachtpruefung', '0 3 * * *', 'SELECT public.nachtpruefung_lauf();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan konnte nicht gesetzt werden: %. Bitte von Hand anlegen.', SQLERRM;
END $do$;

SELECT public.nachtpruefung_lauf();