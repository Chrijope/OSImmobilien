-- ===========================================================================
-- Videoräume: nach dem Termin von selbst auf "beendet", und kein zweiter
-- Notizeintrag beim Aufräumen
-- ===========================================================================
--
-- ## Der Befund
--
-- Christian sieht unter "Meine Gespräche" hunderte offener Räume, obwohl die
-- Termine längst vorbei sind. Der Umschalter "Geplant & laufend" gegen
-- "Beendet" arbeitet dabei richtig: Er zeigt nur `offen` und `laufend`.
-- Das Problem liegt eine Stufe darunter. Ein Raum kommt auf drei Wegen nach
-- "beendet", und keiner davon greift im Alltag:
--
--   1. Der Gastgeber drückt "Raum endgültig schließen". Der Knopf steht
--      neben einer roten Rückfrage und tötet den Kundenlink, deshalb drückt
--      ihn niemand.
--   2. Die verknüpfte Meeting-Aktivität wird auf erledigt gesetzt
--      (`meeting_folgeobjekte`). Das macht auch kaum jemand.
--   3. Die Buchung wird abgesagt. Das ist der Ausnahmefall, nicht der
--      Regelfall.
--
-- Das normale Auflegen am Ende eines Gesprächs setzt den Raum ausdrücklich
-- zurück auf "offen", nicht auf "beendet". Und die Nachtprüfung holt
-- hängengebliebene Räume nach sechs Stunden ebenfalls nur auf "offen"
-- zurück. Ergebnis: Jeder je geführte Termin bleibt für immer in der
-- Hauptansicht stehen. Die Liste wächst mit jedem Meeting um eine Zeile und
-- schrumpft nie.
--
-- ## Die Reparatur
--
-- Nicht löschen, sondern schließen. Ein geschlossener Raum verschwindet aus
-- der Hauptansicht, bleibt aber über den Umschalter "Beendet" erreichbar,
-- behält seine Gesprächsnotiz und lässt sich auf der Gastgeberseite mit
-- einem Klick wieder öffnen ("Raum wieder öffnen", derselbe Link gilt
-- weiter). Nichts geht verloren, nichts ist endgültig.
--
-- Löschen bleibt, was es heute schon ist: die wöchentliche Aufgabe von
-- `videoraeume_aufraeumen`, 90 Tage nach Ablauf des Links, also rund 120
-- Tage nach dem Termin, und nur wenn weder Mitschrift noch Buchung daran
-- hängen. Daran wird hier bewusst nichts verschärft.
--
-- ## Die Frist: Terminende plus sechs Stunden
--
-- Gerechnet wird ab dem ENDE des Termins (`termin_at + dauer_minuten`), nicht
-- ab seinem Beginn. Sonst räumte ein langes Gespräch sich selbst ab, während
-- es noch läuft.
--
-- Sechs Stunden Puffer, aus drei Gründen:
--   * Kein Beratungsgespräch zieht sich sechs Stunden über die geplante Zeit
--     hinaus. Wer überzieht, überzieht um Minuten.
--   * Dieselbe Zahl benutzt die Nachtprüfung schon für hängende Räume. Zwei
--     verschiedene Fristen für dieselbe Frage wären nur verwirrend.
--   * Der Nachtlauf startet um 3 Uhr UTC. Ein Termin um 18 Uhr deutscher Zeit
--     ist damit schon in derselben Nacht aus der Liste, ein Termin um
--     Mitternacht in der folgenden. Länger als 29 Stunden steht nie etwas
--     Vergangenes in der Hauptansicht.
--
-- Für Räume OHNE Termin, also die von Hand angelegten spontanen Räume, gibt
-- es nichts, woran ein Terminende hängen könnte. Sie schließen 14 Tage nach
-- ihrer Anlage. Ein spontaner Raum entsteht für ein Gespräch, das gerade
-- jetzt stattfindet; wer ihn nach zwei Wochen noch braucht, öffnet ihn wieder.
--
-- ## Was ausdrücklich NICHT passiert
--
-- Keine Zeile wird gelöscht. Weder der Raum, noch seine Notiz, noch die
-- Meeting-Aktivität im Kundenverlauf, noch die Aufgabe. Ein Statuswechsel an
-- `videoraeume` löst keinen Trigger aus, der irgendwo anders etwas anfasst:
-- `videoraum_frist_nachziehen` greift nur, wenn sich `termin_at` ändert.
-- Der gefährliche Weg ist und bleibt `meeting_raum_entfernen`, und der wird
-- hier nirgends gerufen. Er gehört weiter allein an den Papierkorb, den ein
-- Mensch drückt.
--
-- ## Kein neuer Zeitplan
--
-- Angehängt an die vorhandene Nachtprüfung (`nachtpruefung`, 3 Uhr UTC), die
-- ohnehin schon `nachtpruefung_haengende_raeume` ruft. Ein zweiter pg_cron-
-- Eintrag entsteht nicht, deshalb braucht es hier auch kein Sommer-/Winter-
-- Paar: Die Nachtprüfung läuft mitten in der Nacht, eine Stunde hin oder her
-- ist ihr gleichgültig. Das Sommer-/Winter-Paar im Projekt gibt es nur dort,
-- wo eine Mail zu einer bestimmten deutschen Uhrzeit ankommen soll.

-- ---------------------------------------------------------------------------
-- 1) Die neue Teilprüfung
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nachtpruefung_raeume_nach_termin(_lauf timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anzahl integer;
  v_beispiele jsonb;
  v_ids uuid[];
BEGIN
  /*
   * Nur Räume auf "offen".
   *
   * "laufend" bleibt unangetastet: Dafür ist die Prüfung davor zuständig,
   * die erst auf "offen" zurücksetzt. Damit können sich die beiden nicht in
   * die Quere kommen, und ein Gespräch, das gerade wirklich läuft, wird
   * niemals mitten hinein geschlossen.
   */
  WITH vorbei AS (
    SELECT r.id, r.titel, r.termin_at, r.created_at
      FROM public.videoraeume r
     WHERE r.status = 'offen'
       AND (
         CASE
           WHEN r.termin_at IS NOT NULL
             THEN r.termin_at
                  + make_interval(mins => coalesce(r.dauer_minuten, 45))
                  + interval '6 hours' < now()
           -- Spontaner Raum ohne Termin: 14 Tage ab Anlage.
           ELSE r.created_at < now() - interval '14 days'
         END
       )
       /*
        * Rettungsanker gegen ein veraltetes `termin_at`.
        *
        * Wird eine Buchung verschoben, zieht `buchung_verschieben` den Raum
        * nach. Sollte das einmal nicht durchkommen, hinge hier sonst ein
        * Raum, dessen echter Termin noch bevorsteht. Eine offene Buchung,
        * deren Ende noch keine sechs Stunden zurückliegt, schützt ihn.
        */
       AND NOT EXISTS (
         SELECT 1 FROM public.buchungen b
          WHERE b.videoraum_id = r.id
            AND b.status = 'offen'
            AND b.ende_at > now() - interval '6 hours'
       )
  )
  SELECT count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'titel', titel, 'termin', termin_at, 'angelegt', created_at)
           ORDER BY coalesce(termin_at, created_at) DESC)
           FILTER (WHERE rang <= 10), '[]'::jsonb),
         coalesce(array_agg(id), '{}'::uuid[])
    INTO v_anzahl, v_beispiele, v_ids
    FROM (SELECT v.*, row_number() OVER (
                   ORDER BY coalesce(v.termin_at, v.created_at) DESC) AS rang
            FROM vorbei v) t;

  IF array_length(v_ids, 1) > 0 THEN
    UPDATE public.videoraeume
       SET status = 'beendet', updated_at = now()
     WHERE id = ANY(v_ids);

    -- Reste aus der Teilnehmerliste mitnehmen. Der Raum ist zu, hier wartet
    -- niemand mehr, auf den noch jemand aufmachen könnte.
    UPDATE public.videoraum_teilnehmer
       SET status = 'beendet', verlassen_at = coalesce(verlassen_at, now())
     WHERE raum_id = ANY(v_ids)
       AND status IN ('wartet', 'eingelassen', 'im_gespraech');
  END IF;

  /*
   * Schwere bewusst immer "hinweis", auch wenn etwas geschlossen wurde.
   *
   * Das ist der Normalfall und kein Befund. Die Morgenmail nimmt nur
   * "warnung" und "fehler" auf; so bekommt Christian nicht jeden Morgen eine
   * Mail darüber, dass gestern Termine stattgefunden haben.
   */
  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
  VALUES (_lauf, 'videoraum_nach_termin', 'hinweis', v_anzahl,
          CASE WHEN v_anzahl > 0
               THEN v_anzahl || ' Videoraum/Videoräume waren nach ihrem Termin noch offen und stehen jetzt auf "beendet". Sie sind unter "Meine Gespräche" über "Beendet" weiter da, Notiz und Link inbegriffen, und lassen sich jederzeit wieder öffnen.'
               ELSE 'Kein Videoraum steht nach seinem Termin noch offen.' END,
          v_beispiele);

  RETURN v_anzahl;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
  VALUES (_lauf, 'videoraum_nach_termin', 'fehler', 1,
          'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.nachtpruefung_raeume_nach_termin(timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.nachtpruefung_raeume_nach_termin(timestamptz) IS
  'Teilpruefung des Nachtwaechters. Setzt Raeume, deren Termin seit ueber '
  'sechs Stunden vorbei ist, auf "beendet". Nichts wird geloescht, der '
  'Gastgeber kann jeden Raum wieder oeffnen.';

-- ---------------------------------------------------------------------------
-- 2) In den Nachtlauf einhängen
-- ---------------------------------------------------------------------------
--
-- Angehängt an `nachtpruefung_haengende_raeume`, nicht an `nachtpruefung_lauf`.
-- Grund: Die große Funktion hat über 400 Zeilen und müsste für eine einzige
-- neue Zeile vollständig neu geschrieben werden. Genau dabei sind in diesem
-- Projekt schon einmal Prüfungen verlorengegangen (siehe Migration
-- 20260805150000). Die kleine Funktion dagegen passt auf eine Seite und
-- gehört ohnehin demselben Thema an. Der Rumpf ist unverändert aus
-- 20260805145000 übernommen, neu ist allein der Aufruf am Ende.
--
-- Die Reihenfolge ist Absicht: erst die hängenden Räume auf "offen"
-- zurückholen, dann die vergangenen schließen. So wird ein Raum, der seit
-- Tagen auf "laufend" klebt und dessen Termin vorbei ist, in derselben Nacht
-- fertig aufgeräumt und nicht erst in der übernächsten.

CREATE OR REPLACE FUNCTION public.nachtpruefung_haengende_raeume(_lauf timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anzahl integer;
  v_beispiele jsonb;
  v_ids uuid[];
BEGIN
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'titel', titel, 'seit', updated_at) ORDER BY updated_at), '[]'::jsonb),
         coalesce(array_agg(id), '{}'::uuid[])
    INTO v_anzahl, v_beispiele, v_ids
    FROM (SELECT * FROM public.videoraeume
           WHERE status = 'laufend' AND updated_at < now() - interval '6 hours'
           ORDER BY updated_at LIMIT 10) t;

  IF array_length(v_ids, 1) > 0 THEN
    -- Zurueck auf "offen", nicht auf "beendet": Der Kundenlink soll gelten.
    UPDATE public.videoraeume SET status = 'offen', updated_at = now()
     WHERE id = ANY(v_ids);

    -- Genau die Teilnehmer dieser Raeume, keine anderen.
    UPDATE public.videoraum_teilnehmer
       SET status = 'beendet', verlassen_at = coalesce(verlassen_at, now())
     WHERE raum_id = ANY(v_ids)
       AND status IN ('eingelassen', 'im_gespraech');
  END IF;

  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
  VALUES (_lauf, 'videoraum_haengt',
          CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
          CASE WHEN v_anzahl > 0
               THEN v_anzahl || ' Videoraum/Videoräume hingen seit über 6 Stunden auf "laufend" und wurden soeben auf "offen" zurückgesetzt. Die Kundenlinks gelten weiter.'
               ELSE 'Kein Videoraum hängt.' END,
          v_beispiele);

  -- Neu: die vergangenen Räume schließen. Eigene Fehlerbehandlung, damit ein
  -- Fehlschlag dort diesen Befund hier nicht mit umreißt.
  BEGIN
    PERFORM public.nachtpruefung_raeume_nach_termin(_lauf);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (_lauf, 'videoraum_nach_termin', 'fehler', 1,
            'Die Pruefung selbst ist ausgefallen: ' || SQLERRM);
  END;

  RETURN v_anzahl;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
  VALUES (_lauf, 'videoraum_haengt', 'fehler', 1,
          'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.nachtpruefung_haengende_raeume(timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.nachtpruefung_haengende_raeume(timestamptz) IS
  'Teilpruefung des Nachtwaechters. Holt haengende Raeume auf "offen" zurueck '
  'und ruft danach die Pruefung, die vergangene Raeume auf "beendet" setzt.';

-- ---------------------------------------------------------------------------
-- 3) Einmalig den Altbestand aufräumen
-- ---------------------------------------------------------------------------
--
-- Ohne das wirkt die Reparatur erst ab heute, und die hunderte alten Räume,
-- wegen denen Christian schreibt, blieben genau dort stehen, wo sie sind.
-- Derselbe Aufruf wie in der Nacht, nur einmal von Hand. Der Befund landet
-- unter dem heutigen Datum im Bericht, dort steht dann die Anzahl.

SELECT public.nachtpruefung_raeume_nach_termin(now());

-- ---------------------------------------------------------------------------
-- 4) Nebenbefund: das wöchentliche Aufräumen legte Notizen doppelt ab
-- ---------------------------------------------------------------------------
--
-- `videoraeume_aufraeumen` rettet vor dem Löschen die Gesprächsnotiz in die
-- Kundenakte und erkennt einen bereits vorhandenen Eintrag daran, dass
-- dessen `details` genau 'videoraum:<id>' lautet. Diese Marke schreibt
-- niemand mehr: Seit `src/lib/videoraumNotizAkte.ts` legt der Browser die
-- Notiz schon beim Auflegen ab, und zwar mit dem Notiztext in `details` und
-- einer Merkmarke in `videoraeume.meta->'notizAktivitaet'`.
--
-- Die alte Bedingung findet diesen Eintrag also nie und hätte in 120 Tagen
-- für jede bereits abgelegte Notiz einen zweiten, anders formatierten
-- Eintrag in denselben Kundenverlauf geschrieben. Zwei Fassungen desselben
-- Gesprächs, und keiner weiß, welche die gültige ist.
--
-- Zweite Änderung am selben Ort: Ein Raum, dessen Notiz NICHT gerettet
-- werden konnte, wird nicht mehr gelöscht. Das betrifft die spontanen Räume
-- ohne Kontakt. Es gibt keine Akte, in die ihre Notiz könnte, und dann ist
-- Stehenlassen die einzige Antwort, die nichts verliert. So ein Raum bleibt
-- also dauerhaft liegen. Das ist bewusst so: Eine Notiz ohne zweite Kopie
-- wiegt schwerer als eine Zeile in einer Tabelle. Er steht dabei auf
-- "beendet" und ist damit aus der Hauptansicht heraus. Wer ihn wirklich weg
-- haben will, drückt den Papierkorb.
--
-- Der Rest der Funktion ist unverändert aus 20260805120000 übernommen.

CREATE OR REPLACE FUNCTION public.videoraeume_aufraeumen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geloescht integer := 0;
  v_gerettet integer := 0;
BEGIN
  /*
   * Zuerst die Notizen in die Kundenakte retten.
   *
   * Eine Gesprächsnotiz ist das Gedächtnis des Termins. Sie mit dem Raum zu
   * löschen, weil eine technische Frist abläuft, wäre der eigentliche
   * Datenverlust. Sie wandert als Aktivität an den Kontakt, dort gehört sie
   * ohnehin hin.
   */
  WITH zu_retten AS (
    SELECT r.id, r.kontakt_id, r.titel, r.notiz, r.termin_at
      FROM public.videoraeume r
     WHERE r.expires_at < now() - interval '90 days'
       AND r.kontakt_id IS NOT NULL
       AND coalesce(btrim(r.notiz), '') <> ''
       -- Hat der Browser die Notiz schon abgelegt, ist hier nichts zu tun.
       AND coalesce(r.meta->'notizAktivitaet'->>'aktivitaetId', '') = ''
       AND NOT EXISTS (
         SELECT 1 FROM public.aktivitaeten a
          WHERE a.kunde_id = r.kontakt_id::text
            AND a.details = 'videoraum:' || r.id::text
       )
  ), eingefuegt AS (
    INSERT INTO public.aktivitaeten (kunde_id, art, beschreibung, details, von, faellig_am)
    SELECT z.kontakt_id::text, 'notiz',
           'Notiz aus dem Videogespräch' ||
             coalesce(' am ' || to_char(z.termin_at, 'DD.MM.YYYY'), '') ||
             coalesce(' (' || z.titel || ')', '') || ': ' || z.notiz,
           'videoraum:' || z.id::text,
           'System',
           NULL
      FROM zu_retten z
    RETURNING 1
  )
  SELECT count(*) INTO v_gerettet FROM eingefuegt;

  /*
   * Erst jetzt löschen. Räume mit einer Mitschrift bleiben stehen: Die
   * Mitschrift verweist auf den Raum, und ihre Aufbewahrung richtet sich
   * nach der Kundenakte, nicht nach der Lebensdauer eines Links.
   *
   * Neu: Räume mit einer Notiz, die nirgendwo sonst steht, bleiben ebenfalls
   * stehen. Das sind die spontanen Räume ohne Kontakt.
   */
  WITH weg AS (
    DELETE FROM public.videoraeume r
     WHERE r.expires_at < now() - interval '90 days'
       AND NOT EXISTS (SELECT 1 FROM public.gespraech_mitschriften m WHERE m.raum_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM public.buchungen b WHERE b.videoraum_id = r.id)
       AND (
         coalesce(btrim(r.notiz), '') = ''
         OR r.meta->'notizAktivitaet'->>'aktivitaetId' IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM public.aktivitaeten a
            WHERE a.kunde_id = r.kontakt_id::text
              AND a.details = 'videoraum:' || r.id::text
         )
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_geloescht FROM weg;

  IF v_gerettet > 0 OR v_geloescht > 0 THEN
    RAISE NOTICE 'Videoraeume aufgeraeumt: % geloescht, % Notizen gerettet', v_geloescht, v_gerettet;
  END IF;

  RETURN v_geloescht;
EXCEPTION WHEN OTHERS THEN
  -- Ein Aufräumdienst darf nie etwas anderes umreissen. Lieber einmal nicht
  -- aufgeräumt als eine gescheiterte Nacht.
  RAISE NOTICE 'Aufraeumen der Videoraeume ausgefallen: %', SQLERRM;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.videoraeume_aufraeumen() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Erwartet: eine Zeile 'videoraum_nach_termin' mit der Zahl der soeben
-- geschlossenen Räume, und danach keine offenen Räume mehr, deren Termin
-- länger als sechs Stunden vorbei ist.
--
--   SELECT pruefung, anzahl, meldung
--     FROM nachtpruefung_befunde
--    WHERE pruefung = 'videoraum_nach_termin'
--    ORDER BY lauf_at DESC LIMIT 1;
--
--   SELECT status, count(*) FROM videoraeume GROUP BY status ORDER BY status;
--
--   SELECT count(*) AS noch_offen_obwohl_vorbei
--     FROM videoraeume
--    WHERE status = 'offen' AND termin_at IS NOT NULL
--      AND termin_at + make_interval(mins => coalesce(dauer_minuten, 45))
--          + interval '6 hours' < now();
