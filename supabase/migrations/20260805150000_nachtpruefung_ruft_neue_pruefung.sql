-- ===========================================================================
-- Der Nachtlauf ruft die verbesserte Prüfung, nicht mehr die alte
-- ===========================================================================
--
-- Die strengere Fassung von "Kontakt ohne Zuständigen" lag als eigene
-- Funktion vor und wurde beim Ausführen ihrer Migration einmal von Hand
-- gerufen. Der nächtliche Lauf enthielt aber weiter die alte, nachsichtige
-- Fassung in seinem eigenen Rumpf.
--
-- Beide schreiben unter demselben Namen. Ab dem nächsten Morgen hätte der
-- Nachtlauf den Befund also wieder mit "Jeder Kontakt hat einen Zuständigen"
-- überschrieben, obwohl vier Kunden mit wartender Unterschrift keinen haben.
-- Die Korrektur hätte genau einen Tag gewirkt.
--
-- Gefunden vom Sicherheitsprüfer. Diese Migration spielt `nachtpruefung_lauf`
-- neu ein, mit dem Aufruf statt der Kopie.

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

  -- 1. Buchungen ohne versendete Bestätigung
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

  -- 2. Fehlgeschlagene Terminerinnerungen
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

  -- 3. Läuft der Erinnerungsdienst noch? Nur zukünftige Termine zählen.
  BEGIN
    SELECT count(*) INTO v_anzahl
      FROM public.aktivitaeten
     WHERE faellig_am ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       AND faellig_am::timestamptz > now()
       AND erledigt_am IS NULL
       AND art IN ('termin', 'meeting');

    IF v_anzahl > 0 AND NOT EXISTS (
      SELECT 1 FROM public.termin_erinnerungen WHERE gesendet_am > now() - interval '26 hours'
    ) THEN
      INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
      VALUES (v_lauf, 'erinnerungsdienst_still', 'fehler', 1,
              'Seit über 26 Stunden wurde keine einzige Terminerinnerung versendet, obwohl Termine anstehen. Vermutlich läuft der Zeitplan nicht.');
    ELSIF v_anzahl = 0 THEN
      INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
      VALUES (v_lauf, 'erinnerungsdienst_still', 'hinweis', 0,
              'Es steht derzeit kein Termin in der Zukunft an, es gibt also nichts zu erinnern.');
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

  -- 4. Videoräume, die auf "laufend" hängen
  --
  -- Ausgelagert nach `nachtpruefung_haengende_raeume`, siehe Migration
  -- 20260805145000. Aus demselben Grund wie Prüfung 6: Solange eine Prüfung
  -- doppelt existiert, einmal hier und einmal als Funktion, überschreibt der
  -- Nachtlauf jede Verbesserung wieder.
  BEGIN
    PERFORM public.nachtpruefung_haengende_raeume(v_lauf);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'videoraum_haengt', 'fehler', 1,
            'Die Pruefung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  -- 5. Abgelaufene Signaturanfragen
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

  -- 6. Kontakte ohne Zuständigen
  --
  -- Ausgelagert nach `nachtpruefung_kontakt_ohne_zustaendigen`. Der Block
  -- stand hier zweimal: einmal in dieser Funktion, einmal als eigene
  -- Funktion aus der Nachbesserung. Der Nachtlauf rief die alte Fassung,
  -- die neue lief nur einmal von Hand. Die Korrektur haette damit genau
  -- einen Tag gewirkt, danach haette der Nachtlauf sie ueberschrieben.
  BEGIN
    PERFORM public.nachtpruefung_kontakt_ohne_zustaendigen(v_lauf);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'kontakt_ohne_zustaendigen', 'fehler', 1,
            'Die Pruefung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  -- 7. Termine, deren Videoraum es nicht mehr gibt
  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'name', name, 'start', start_at) ORDER BY start_at), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT b.* FROM public.buchungen b
             WHERE b.status = 'offen'
               AND b.start_at > now()
               AND b.videoraum_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.videoraeume v WHERE v.id = b.videoraum_id)
             ORDER BY b.start_at LIMIT 10) t;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'termin_ohne_raum',
            CASE WHEN v_anzahl > 0 THEN 'fehler' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' anstehende(r) Videotermin(e) verweisen auf einen Raum, den es nicht mehr gibt.'
                 ELSE 'Alle anstehenden Videotermine haben einen gültigen Raum.' END,
            v_beispiele);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'termin_ohne_raum', 'fehler', 1,
            'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  -- 8. Aktive Kontakte auf der Mail-Sperrliste (richtige Spalte: reason)
  BEGIN
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
             'email', s.email, 'grund', s.reason) ORDER BY s.email), '[]'::jsonb)
      INTO v_anzahl, v_beispiele
      FROM (SELECT se.email, se.reason
              FROM public.suppressed_emails se
             WHERE EXISTS (SELECT 1 FROM public.kontakte k
                            WHERE lower(k.email) = lower(se.email)
                              AND coalesce(k.geloescht, false) = false)
             LIMIT 10) s;

    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
    VALUES (v_lauf, 'kunde_auf_sperrliste',
            CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
            CASE WHEN v_anzahl > 0
                 THEN v_anzahl || ' aktive(r) Kontakt(e) stehen auf der Mail-Sperrliste und bekommen von uns gar keine Nachrichten mehr.'
                 ELSE 'Kein aktiver Kontakt steht auf der Mail-Sperrliste.' END,
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

SELECT public.nachtpruefung_lauf();