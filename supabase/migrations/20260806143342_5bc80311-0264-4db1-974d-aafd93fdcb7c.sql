CREATE OR REPLACE FUNCTION public.buchung_pipeline_rang(_stufe text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(_stufe, '')))
    WHEN 'neuer_lead'            THEN 0
    WHEN 'nicht_erreicht'        THEN 1
    WHEN 'erreicht'              THEN 2
    WHEN 'follow_up'             THEN 3
    WHEN 'erstgespraech_geplant' THEN 4
    WHEN 'erstgespraech'         THEN 5
    WHEN 'eg_noshow'             THEN 6
    WHEN 'beratungsgespraech'    THEN 7
    WHEN 'bg_noshow'             THEN 8
    WHEN 'selbstauskunft'        THEN 9
    WHEN 'objektauswahl'         THEN 10
    WHEN 'reservierung'          THEN 11
    WHEN 'bonitaetsunterlagen'   THEN 12
    WHEN 'finanzierung'          THEN 13
    WHEN 'notar'                 THEN 14
    WHEN 'faelligkeit'           THEN 15
    WHEN 'abrechnung'            THEN 16
    WHEN 'abgeschlossen'         THEN 17
    WHEN 'bestandsimport'        THEN 18
    WHEN 'archiviert'            THEN 19
    WHEN 'verloren'              THEN 20
    WHEN 'zugewiesen'            THEN 0
    WHEN 'kontaktversuche'       THEN 2
    WHEN 'vermoegensaufbau'      THEN 3
    ELSE -1
  END;
$$;

COMMENT ON FUNCTION public.buchung_pipeline_rang(text) IS
  'Rang einer Pipelinestufe. Muss mit PIPELINE_STUFEN in src/lib/pipelineStufen.ts uebereinstimmen, das prueft buchungPipelineRang.test.ts.';

DO $$
DECLARE
  v_betroffen integer;
BEGIN
  WITH ohne_rv AS (
    SELECT i.id
      FROM public.investments i
     WHERE i.meta->>'pipelineStufe' = 'bonitaetsunterlagen'
       AND coalesce((i.meta->>'rvSigned')::boolean, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM public.signature_requests s
          WHERE s.investment_id::text = i.id::text
            AND s.person_type LIKE 'rv_%'
       )
  )
  UPDATE public.investments i
     SET meta = jsonb_set(
           coalesce(i.meta, '{}'::jsonb),
           '{pipelineStufe}',
           '"objektauswahl"'::jsonb
         ) || jsonb_build_object(
           'stufeKorrigiertAm', to_jsonb(now()),
           'stufeKorrigiertGrund', to_jsonb('Pipeline-Reihenfolge gedreht am 06.08.2026'::text)
         )
    FROM ohne_rv
   WHERE i.id = ohne_rv.id;

  GET DIAGNOSTICS v_betroffen = ROW_COUNT;
  RAISE NOTICE 'Pipeline-Umstellung: % Investment(s) von bonitaetsunterlagen auf objektauswahl gesetzt', v_betroffen;
END $$;

CREATE OR REPLACE FUNCTION public.nachtpruefung_reservierung_ohne_bonitaet(_lauf timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anzahl integer;
  v_beispiele jsonb;
BEGIN
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
           'investment', id, 'kunde', kunde, 'seit', reserviert_seit,
           'tage', tage) ORDER BY reserviert_seit), '[]'::jsonb)
    INTO v_anzahl, v_beispiele
    FROM (
      SELECT i.id,
             btrim(coalesce(k.vorname, '') || ' ' || coalesce(k.nachname, '')) AS kunde,
             (i.meta->>'rvSignedAt')::timestamptz AS reserviert_seit,
             extract(day FROM now() - (i.meta->>'rvSignedAt')::timestamptz)::int AS tage
        FROM public.investments i
        JOIN public.kontakte k ON k.id = i.kunde_id
       WHERE coalesce((i.meta->>'rvSigned')::boolean, false) = true
         AND coalesce(i.meta->>'pipelineStufe', '') IN ('reservierung', 'bonitaetsunterlagen')
         AND i.meta->>'rvSignedAt' IS NOT NULL
         AND (i.meta->>'rvSignedAt')::timestamptz < now() - interval '14 days'
         AND coalesce(k.geloescht, false) = false
         AND coalesce((k.meta->>'keineBenachrichtigungen')::boolean, false) = false
       ORDER BY (i.meta->>'rvSignedAt')::timestamptz
       LIMIT 10
    ) t;

  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
  VALUES (_lauf, 'reservierung_ohne_bonitaet',
          CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
          CASE WHEN v_anzahl > 0
               THEN v_anzahl || ' Reservierung(en) stehen seit über 14 Tagen ohne freigegebene Bonität. Die Einheiten sind blockiert, ohne dass die Finanzierbarkeit feststeht. Bitte beim Kunden nachfassen oder die Reservierung aufheben.'
               ELSE 'Keine Reservierung wartet länger als 14 Tage auf die Bonität.' END,
          v_beispiele);

  RETURN v_anzahl;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
  VALUES (_lauf, 'reservierung_ohne_bonitaet', 'fehler', 1,
          'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.nachtpruefung_reservierung_ohne_bonitaet(timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.nachtpruefung_reservierung_ohne_bonitaet(timestamptz) IS
  'Teilpruefung des Nachtwaechters. Noetig, seit die Bonitaet hinter der Reservierung liegt und eine Einheit blockiert sein kann, bevor die Finanzierbarkeit feststeht.';

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

  -- 8. Aktive Kontakte auf der Mail-Sperrliste
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

  -- 10. Reservierung seit über 14 Tagen ohne freigegebene Bonität
  BEGIN
    PERFORM public.nachtpruefung_reservierung_ohne_bonitaet(v_lauf);
    v_befunde := v_befunde + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'reservierung_ohne_bonitaet', 'fehler', 1,
            'Aufruf fehlgeschlagen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  RETURN v_befunde;
END;
$fn$;

SELECT public.nachtpruefung_lauf();