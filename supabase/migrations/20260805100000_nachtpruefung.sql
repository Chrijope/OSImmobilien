-- ===========================================================================
-- Der Nachtwächter: prüft die Daten auf Lücken, Hänger und stille Fehler
-- ===========================================================================
--
-- Jede Nacht um 4 Uhr laufen eine Reihe von Prüfungen über die Datenbank und
-- legen ihre Befunde in `nachtpruefung_befunde` ab. Morgens lässt sich daraus
-- ein Bericht lesen.
--
-- Bewusst als reine Datenbankfunktion und nicht als Edge Function:
--
--   * Sie braucht keinen Zugangsschlüssel und kein Geheimnis.
--   * Sie fällt nicht aus, wenn eine Function nicht ausgerollt wurde.
--   * pg_cron ruft sie direkt, ohne HTTP dazwischen.
--
-- Jede einzelne Prüfung läuft in ihrem eigenen Block mit eigenem
-- Fehlerabfang. Fällt eine aus, etwa weil eine Tabelle noch nicht existiert,
-- laufen die übrigen trotzdem durch und der Ausfall wird selbst als Befund
-- festgehalten. Ein Wächter, der beim ersten Stolperer stehen bleibt, ist
-- schlimmer als keiner: Man verlässt sich auf ihn und er schweigt.

-- ---------------------------------------------------------------------------
-- 1) Wohin die Befunde geschrieben werden
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nachtpruefung_befunde (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Der Lauf, zu dem dieser Befund gehört. Alle Befunde einer Nacht teilen ihn.
  lauf_at timestamptz NOT NULL DEFAULT now(),
  -- Kurzname der Prüfung, etwa 'buchung_ohne_bestaetigung'.
  pruefung text NOT NULL,
  -- 'hinweis' zum Mitlesen, 'warnung' sollte man ansehen, 'fehler' ist kaputt.
  schwere text NOT NULL DEFAULT 'warnung',
  -- Wie viele Fälle die Prüfung gefunden hat. 0 bedeutet: alles in Ordnung.
  anzahl integer NOT NULL DEFAULT 0,
  -- Ein Satz in verständlichem Deutsch, so wie er im Bericht stehen soll.
  meldung text NOT NULL,
  -- Bis zu zehn betroffene Datensätze, damit man nachsehen kann.
  beispiele jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nachtpruefung_schwere_chk CHECK (schwere IN ('hinweis', 'warnung', 'fehler'))
);

CREATE INDEX IF NOT EXISTS nachtpruefung_lauf_idx
  ON public.nachtpruefung_befunde (lauf_at DESC);
CREATE INDEX IF NOT EXISTS nachtpruefung_offen_idx
  ON public.nachtpruefung_befunde (lauf_at DESC) WHERE anzahl > 0;

ALTER TABLE public.nachtpruefung_befunde ENABLE ROW LEVEL SECURITY;

-- Befunde nennen Namen und Zustände von Kunden. Deshalb nur Administratoren.
DROP POLICY IF EXISTS "Admins sehen die Nachtpruefung" ON public.nachtpruefung_befunde;
CREATE POLICY "Admins sehen die Nachtpruefung"
  ON public.nachtpruefung_befunde FOR SELECT TO authenticated
  USING (public.is_admin_role(auth.uid()));

REVOKE ALL ON public.nachtpruefung_befunde FROM anon;

-- ---------------------------------------------------------------------------
-- 2) Die Prüfungen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nachtpruefung_lauf()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lauf timestamptz := now();
  v_anzahl integer;
  v_beispiele jsonb;
  v_befunde integer := 0;

  -- Jede Prüfung schreibt ihren Befund selbst, auch bei null Treffern. Sonst
  -- weiß man morgens nie, ob eine Prüfung lief und nichts fand oder ob sie
  -- gar nicht erst gelaufen ist.
BEGIN
  -- Ältere Läufe aufräumen. Vier Wochen reichen, um einem Muster
  -- nachzugehen; alles davor liest ohnehin niemand mehr.
  DELETE FROM public.nachtpruefung_befunde WHERE lauf_at < now() - interval '28 days';

  -- ── 1. Buchungen, deren Bestätigung nicht rausging ──────────────────────
  -- Die Function vermerkt einen Fehlschlag als `meta.bestaetigung_fehler`.
  -- Der Kunde hat dann gebucht und nie eine Mail bekommen.
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

  -- ── 2. Terminerinnerungen, die fehlgeschlagen sind ──────────────────────
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

  -- ── 3. Der Erinnerungsdienst läuft überhaupt noch? ──────────────────────
  -- Wenn seit 26 Stunden nichts versendet wurde, obwohl Termine anstehen,
  -- ist entweder der Zeitplan aus oder die Function kaputt. Das merkt sonst
  -- niemand, denn ein ausbleibender Versand macht keinen Lärm.
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

  -- ── 4. Videoräume, die auf "laufend" hängen ─────────────────────────────
  -- Fällt dem Gastgeber das Fenster zu, ohne dass der Aufräumer durchkommt,
  -- bleibt der Raum belegt und der nächste Gast kommt nicht hinein.
  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'titel', titel, 'seit', updated_at) ORDER BY updated_at), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT * FROM public.videoraeume
             WHERE status = 'laufend' AND updated_at < now() - interval '6 hours'
             ORDER BY updated_at LIMIT 10) t;

    -- Nicht nur melden, sondern aufräumen. Ein Gespräch, das seit sechs
    -- Stunden läuft, gibt es nicht: Da ist dem Gastgeber das Fenster
    -- zugefallen, bevor der Aufräumer durchkam. Solange der Raum auf
    -- "laufend" steht, kommt der nächste Gast nicht hinein, und niemand
    -- merkt warum. Zurückgesetzt wird auf "offen", nicht auf "beendet":
    -- Der Kundenlink soll weiter gelten.
    UPDATE public.videoraeume
       SET status = 'offen', updated_at = now()
     WHERE status = 'laufend' AND updated_at < now() - interval '6 hours';

    UPDATE public.videoraum_teilnehmer
       SET status = 'beendet', verlassen_at = coalesce(verlassen_at, now())
     WHERE status IN ('eingelassen', 'im_gespraech')
       AND raum_id IN (SELECT id FROM public.videoraeume
                        WHERE status = 'offen' AND updated_at > now() - interval '1 minute');

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'videoraum_haengt',
            CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' Videoraum/Videoräume hingen seit über 6 Stunden auf "laufend" und wurden soeben auf "offen" zurückgesetzt. Die Kundenlinks gelten weiter.'
                 ELSE 'Kein Videoraum hängt.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'videoraum_haengt', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  -- ── 5. Signaturanfragen, die abgelaufen sind ────────────────────────────
  -- Der Kunde hat den Link bekommen und nie unterschrieben. Ohne diese
  -- Meldung fällt das erst auf, wenn jemand den Vorgang zufällig aufmacht.
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

  -- ── 6. Kontakte ohne Zuständigen ────────────────────────────────────────
  -- Ein Lead ohne Betreuer wird von niemandem angerufen.
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

  -- ── 7. Termine, deren Videoraum es nicht mehr gibt ──────────────────────
  --
  -- Die Buchung führt den Raum in der Spalte `videoraum_id`, nicht im meta.
  -- Die erste Fassung dieser Prüfung sah im meta nach und fand deshalb nie
  -- etwas: Sie meldete jede Nacht "alles in Ordnung", ohne je hingesehen zu
  -- haben. Das ist die schlimmste Sorte Prüfung, weil man sich auf sie
  -- verlässt.
  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'name', name, 'start', start_at) ORDER BY start_at), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT b.* FROM public.buchungen b
             WHERE b.status = 'offen'
               AND b.start_at > now()
               AND b.start_at < now() + interval '7 days'
               AND b.videoraum_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.videoraeume v WHERE v.id = b.videoraum_id)
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

  -- ── 8. Mails auf der Sperrliste ─────────────────────────────────────────
  -- Eine gesperrte Adresse bekommt gar nichts mehr, auch keine Bestätigung.
  -- Das fällt sonst nie auf, weil der Versand als Erfolg gilt.
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
$$;

REVOKE ALL ON FUNCTION public.nachtpruefung_lauf() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2b) Damit Prüfung 7 gar nicht mehr anschlagen kann
-- ---------------------------------------------------------------------------
--
-- Auf `buchungen.videoraum_id` lag bisher kein Fremdschlüssel. Wurde ein Raum
-- gelöscht, blieb die Buchung mit einer toten Kennung zurück, und der Kunde
-- stand vor einer Tür, die es nicht mehr gab.
--
-- ON DELETE SET NULL statt CASCADE: Der Termin bleibt bestehen, er hat nur
-- keinen Raum mehr. Die Buchung mitzulöschen, weil ein Raum verschwindet,
-- wäre die falsche Richtung.
--
-- Vorher werden tote Verweise aufgeräumt, sonst lässt sich der Fremdschlüssel
-- nicht anlegen.

DO $$
BEGIN
  UPDATE public.buchungen b
     SET videoraum_id = NULL
   WHERE b.videoraum_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.videoraeume v WHERE v.id = b.videoraum_id);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'buchungen_videoraum_fk'
  ) THEN
    ALTER TABLE public.buchungen
      ADD CONSTRAINT buchungen_videoraum_fk
      FOREIGN KEY (videoraum_id) REFERENCES public.videoraeume(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Fremdschluessel auf buchungen.videoraum_id nicht gesetzt: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Der Bericht für den Morgen
-- ---------------------------------------------------------------------------
--
-- Liefert den letzten Lauf, auffällige Befunde zuerst. Wer nur wissen will,
-- ob etwas anliegt, schaut auf die erste Zeile.

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
AS $$
  SELECT b.lauf_at, b.pruefung, b.schwere, b.anzahl, b.meldung, b.beispiele
    FROM public.nachtpruefung_befunde b
   WHERE b.lauf_at = (SELECT max(lauf_at) FROM public.nachtpruefung_befunde)
     AND public.is_admin_role(auth.uid())
   ORDER BY CASE b.schwere WHEN 'fehler' THEN 0 WHEN 'warnung' THEN 1 ELSE 2 END,
            b.anzahl DESC, b.pruefung;
$$;

GRANT EXECUTE ON FUNCTION public.nachtpruefung_bericht() TO authenticated;
REVOKE ALL ON FUNCTION public.nachtpruefung_bericht() FROM anon;

-- ---------------------------------------------------------------------------
-- 4) Der Zeitplan
-- ---------------------------------------------------------------------------
--
-- 4 Uhr nachts deutscher Zeit. Die Datenbank rechnet in UTC, im Sommer sind
-- das 02:00 UTC, im Winter 03:00. Bewusst fest auf 03:00 UTC gesetzt: Dann
-- läuft er im Sommer um 5 und im Winter um 4 Uhr, in beiden Fällen lange vor
-- dem ersten Arbeitsbeginn. Eine Umschaltung wäre mehr Aufwand als Nutzen.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nachtpruefung') THEN
      PERFORM cron.unschedule('nachtpruefung');
    END IF;
    PERFORM cron.schedule('nachtpruefung', '0 3 * * *', 'SELECT public.nachtpruefung_lauf();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan konnte nicht gesetzt werden: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Einmal sofort laufen lassen, damit gleich ein Stand vorliegt und sich
-- zeigt, ob alle Prüfungen mit dem echten Schema zurechtkommen.
SELECT public.nachtpruefung_lauf();
