-- ===========================================================================
-- Aus dem Kooperationsgespraech wird das "Persoenliche Gespraech"
-- ===========================================================================
--
-- Der Termin, den ein Bewerber nach dem Kennenlernen bekommt, heisst ab dem
-- 08.09.2026 "Persoenliches Gespraech". Vorher hiess er "Kooperationsgespräch"
-- (Migration 20260907140000), davor "Bewerbergespräch" (20260906120000).
--
-- **Diese Migration zieht von beiden Zustaenden aus auf den neuen Namen.** Ob
-- 20260907140000 im SQL-Editor gelaufen ist oder nicht, spielt keine Rolle:
-- Jeder UPDATE prueft den Ist-Zustand, und die beiden Funktionen werden
-- vollstaendig ersetzt. Sie ist wiederholbar, mehrfaches Ausfuehren aendert
-- nach dem ersten Lauf nichts mehr.
--
-- Zusaetzlich sinkt die Dauer. Die Arbeitsprobe ist aus dem Gespraech
-- herausgenommen worden, damit werden aus 45 Minuten 35 und aus 30 Minuten 25.
-- Dieselben Zahlen stehen im Browser in `DAUER_LANG_MINUTEN` und
-- `DAUER_KURZ_MINUTEN` (`src/lib/bewerberKennenlernen.ts`); laufen sie
-- auseinander, zeigt die Buchungsseite eine andere Zahl an, als der Kalender
-- blockt.
--
-- **Bereits gebuchte Termine bleiben unberuehrt.** `buchungen.dauer_minuten`
-- und `videoraeume.dauer_minuten` werden nicht angefasst: Wer einen Termin
-- hat, behaelt ihn mit der Laenge, die ihm zugesagt wurde. Geaendert wird nur
-- die Bezeichnung, und auch die nur bei offenen Terminen in der Zukunft.
-- Gelaufene Gespraeche sind ein Beleg und werden nicht nachtraeglich
-- umgeschrieben.
--
-- Der Schluessel der Terminart (`anlass = 'bewerbergespraech'`) bleibt
-- unveraendert. Ueber ihn findet `bewerber_termin_gastgeber` die Gastgeberin,
-- ein geaenderter Schluessel wuerde die Buchung stillschweigend abschalten.
-- Aus demselben Grund bleibt der Pfad der Buchungsstrecke
-- (`/kooperationsgespraech/:token`) im Browser stehen: Er steht in bereits
-- verschickten Mails.
--
-- Voraussetzung: 20260906120000_bewerber_terminbuchung.sql.

-- ---------------------------------------------------------------------------
-- 1) Die Anzeige der Terminart
-- ---------------------------------------------------------------------------
--
-- Von beiden Vorgaengern aus. Wer die Terminart selbst umbenannt hat, behaelt
-- seine Fassung: Nur die beiden bekannten Namen werden ersetzt.

UPDATE public.buchung_terminarten
   SET bezeichnung = 'Persönliches Gespräch'
 WHERE anlass = 'bewerbergespraech'
   AND bezeichnung IN ('Kooperationsgespräch', 'Bewerbergespräch');

-- ---------------------------------------------------------------------------
-- 2) Die lange Fassung: 45 Minuten werden 35
-- ---------------------------------------------------------------------------
--
-- `dauer_minuten` der Terminart ist die lange Fassung. Nur wo noch die
-- urspruenglichen 45 stehen, wird gesenkt; eine von Hand gesetzte Dauer bleibt.

UPDATE public.buchung_terminarten
   SET dauer_minuten = 35
 WHERE anlass = 'bewerbergespraech'
   AND dauer_minuten = 45;

-- ---------------------------------------------------------------------------
-- 3) Die kurze Fassung: 30 Minuten werden 25
-- ---------------------------------------------------------------------------
--
-- Wortgleich zu 20260906120000, nur die Obergrenze der kurzen Fassung sinkt.
-- Dieselbe Regel wie `gespraechsDauerMinuten` im Browser: Wer Themen markiert
-- oder eine eigene Frage gestellt hat, bekommt die lange Fassung.

CREATE OR REPLACE FUNCTION public.bewerber_termin_dauer(_antworten jsonb, _lang integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(COALESCE(_antworten, '{}'::jsonb) -> 'themen') = 'array'
         AND jsonb_array_length(COALESCE(_antworten, '{}'::jsonb) -> 'themen') > 0
      THEN _lang
    WHEN btrim(COALESCE(COALESCE(_antworten, '{}'::jsonb) ->> 'eigeneFrage', '')) <> ''
      THEN _lang
    ELSE LEAST(_lang, 25)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Die Standardagenda des Videoraums
-- ---------------------------------------------------------------------------
--
-- Sie steht im Warteraum, den der Bewerber vor dem Gespraech sieht, und summte
-- sich bisher auf 45 Minuten. Das widerspraeche der neuen Laenge.
--
-- Zwei Aenderungen am Fall `bewerbergespraech`: die Minuten (5, 13, 12, 5 = 35)
-- und die Servicevereinbarung, die es seit dem 07.09.2026 nicht mehr gibt. Die
-- vier anderen Faelle sind wortgleich aus 20260906120000 uebernommen, weil
-- CREATE OR REPLACE die ganze Funktion ersetzt.
--
-- Die Zwillingsfassung im Browser liegt in `src/lib/videoraumAgenda.ts`.
--
-- Bestehende Raeume behalten ihre Agenda: Sie wird beim Anlegen einmal in
-- `videoraeume.agenda` geschrieben, nicht bei jedem Aufruf neu berechnet.

CREATE OR REPLACE FUNCTION public.videoraum_standard_agenda(_art text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _art
    WHEN 'erstgespraech' THEN '[
      {"titel":"Kurz kennenlernen","text":"Wer wir sind und wie wir arbeiten.","minuten":5},
      {"titel":"Ihre Situation","text":"Wo Sie heute stehen und was Sie erreichen wollen.","minuten":10},
      {"titel":"Passt das zusammen?","text":"Ehrlich und ohne Verkaufsdruck.","minuten":10},
      {"titel":"Nächster Schritt","text":"Sie entscheiden, ob ein ausführliches Gespräch folgt.","minuten":5}
    ]'::jsonb
    WHEN 'beratung' THEN '[
      {"titel":"Ihre Ausgangslage","text":"Einkommen, Steuerlast, was Sie bisher aufgebaut haben.","minuten":10},
      {"titel":"Was rechnerisch möglich ist","text":"Wir rechnen Ihren Rahmen gemeinsam durch.","minuten":15},
      {"titel":"Passende Objekte","text":"Zwei bis drei konkrete Beispiele aus dem Bestand.","minuten":15},
      {"titel":"Selbstauskunft ausfüllen","text":"Wir gehen sie gemeinsam durch. Danach wissen wir verbindlich, welcher Rahmen für Sie machbar ist.","minuten":15},
      {"titel":"Ihre Fragen und nächster Schritt","text":"Sie entscheiden, ob und wie es weitergeht.","minuten":5}
    ]'::jsonb
    WHEN 'objektvorstellung' THEN '[
      {"titel":"Das Objekt im Überblick","text":"Lage, Zustand, Ausstattung.","minuten":15},
      {"titel":"Ihre Berechnung","text":"Zeile für Zeile gemeinsam durch.","minuten":20},
      {"titel":"Vermietung und Verwaltung","text":"Wer sich worum kümmert.","minuten":10},
      {"titel":"Ihre Fragen","text":"Alles, was offen ist.","minuten":15}
    ]'::jsonb
    WHEN 'bewerbergespraech' THEN '[
      {"titel":"Ankommen","text":"Kurz gegenseitig vorstellen. Was du im Kennenlernen geschrieben hast, ist gelesen.","minuten":5},
      {"titel":"Deine Themen","text":"Was du markiert hast, und deine eigene Frage.","minuten":13},
      {"titel":"Wie die Zusammenarbeit läuft","text":"Vergütung, was das Haus stellt, Gewerbe und Erlaubnis.","minuten":12},
      {"titel":"Wie es weitergeht","text":"Du entscheidest, ob du starten möchtest. Ein Vertrag kommt erst danach.","minuten":5}
    ]'::jsonb
    ELSE '[]'::jsonb
  END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Die Buchungsfunktion, mit dem neuen Namen im Titel
-- ---------------------------------------------------------------------------
--
-- Wortgleich zu 20260907140000, bis auf den Namen. Sie steht hier vollstaendig,
-- weil CREATE OR REPLACE die ganze Funktion ersetzt und diese Migration auch
-- dann richtig laufen muss, wenn 20260907140000 nie ausgefuehrt wurde.
--
-- Der Titel des Raums und die Bezeichnung der Buchung tragen den Namen des
-- Bewerbers, damit sich in "Meine Gespraeche" zwei Termine am selben Tag
-- auseinanderhalten lassen. Ohne Namen bleibt es beim reinen Terminnamen, damit
-- nie ein Titel mit einem baumelnden Mitteltrenner entsteht.

CREATE OR REPLACE FUNCTION public.bewerber_termin_buchen(
  _token text,
  _start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f record;
  _bewerber record;
  _gastgeber uuid;
  _art public.buchung_terminarten;
  _zone text;
  _dauer integer;
  _tag date;
  _ende timestamptz;
  _abzug jsonb;
  _raum public.videoraeume;
  _buchung public.buchungen;
  -- Der Name des Bewerbers, wie er im Raumtitel und in der Buchung steht.
  _name text;
  -- Die Bezeichnung, die ein Mensch liest: "Persoenliches Gespraech · Max Mustermann".
  _titel text;
BEGIN
  SELECT f.bewerbung_id, f.status, f.antworten
    INTO _f
    FROM public.bewerber_formular f
   WHERE f.token = _token
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieser Link ist uns unbekannt';
  END IF;
  IF _f.status <> 'eingereicht' THEN
    RAISE EXCEPTION 'Bitte sende zuerst deine Angaben ab';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.buchungen b
    WHERE b.bewerbung_id = _f.bewerbung_id AND b.status = 'offen'
  ) THEN
    RAISE EXCEPTION 'Du hast bereits einen Termin. Verschiebe ihn oder sage ihn ab.';
  END IF;

  SELECT b.vorname, b.nachname, b.email, b.telefon
    INTO _bewerber
    FROM public.bewerbungen b
   WHERE b.id = _f.bewerbung_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieser Link ist uns unbekannt';
  END IF;

  _name := btrim(COALESCE(_bewerber.vorname, '') || ' ' || COALESCE(_bewerber.nachname, ''));
  _titel := CASE
              WHEN _name <> '' THEN 'Persönliches Gespräch · ' || left(_name, 120)
              ELSE 'Persönliches Gespräch'
            END;

  _gastgeber := public.bewerber_termin_gastgeber();
  IF _gastgeber IS NULL THEN
    RAISE EXCEPTION 'Zurzeit ist keine Terminbuchung moeglich';
  END IF;

  SELECT * INTO _art
  FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = _gastgeber AND t.anlass = 'bewerbergespraech' AND t.aktiv
  ORDER BY t.sortierung, t.bezeichnung
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zurzeit ist keine Terminbuchung moeglich';
  END IF;

  IF _start IS NULL THEN
    RAISE EXCEPTION 'Bitte eine Startzeit angeben';
  END IF;
  IF _start < now() + make_interval(mins => _art.vorlauf_minuten) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu kurzfristig';
  END IF;
  IF _start > now() + make_interval(days => _art.vorausschau_tage) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu weit in der Zukunft';
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _gastgeber;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _dauer := public.bewerber_termin_dauer(_f.antworten, _art.dauer_minuten);
  _ende := _start + make_interval(mins => _dauer);
  _tag := (_start AT TIME ZONE _zone)::date;

  -- Liegt der Termin vollstaendig in einem verfuegbaren Fenster dieses Tages?
  IF NOT EXISTS (
    WITH fenster AS (
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _gastgeber AND v.datum = _tag AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _gastgeber
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _gastgeber AND a.datum = _tag
        )
    )
    SELECT 1 FROM fenster f
    WHERE _start >= (_tag + f.von) AT TIME ZONE _zone
      AND _ende <= (_tag + f.bis) AT TIME ZONE _zone
  ) THEN
    RAISE EXCEPTION 'Zu dieser Zeit ist kein Termin moeglich';
  END IF;

  -- Zwei Buchende koennen im selben Augenblick auf dieselbe Zeit klicken.
  PERFORM pg_advisory_xact_lock(hashtext('buchung:' || _gastgeber::text));

  IF EXISTS (
    SELECT 1 FROM public.buchungen b
    WHERE b.mitarbeiter_id = _gastgeber
      AND b.status <> 'abgesagt'
      AND b.start_at - make_interval(mins => b.puffer_vor_minuten)
          < _ende + make_interval(mins => _art.puffer_nach_minuten)
      AND b.ende_at + make_interval(mins => b.puffer_nach_minuten)
          > _start - make_interval(mins => _art.puffer_vor_minuten)
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  IF public.buchung_termin_belegt(
    _gastgeber,
    _start - make_interval(mins => _art.puffer_vor_minuten),
    _ende + make_interval(mins => _art.puffer_nach_minuten),
    _zone
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', COALESCE(p.name, 'Deine Ansprechpartnerin'),
    'email', p.email,
    'telefon', p.telefon,
    'bild', p.avatar_url,
    'position', us.einstellungen -> 'profil' ->> 'position',
    'ort', us.einstellungen -> 'videocall' ->> 'ort',
    'zitat', us.einstellungen -> 'videocall' ->> 'zitat'
  ))
  INTO _abzug
  FROM public.profiles p
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE p.id = _gastgeber;

  INSERT INTO public.videoraeume (
    token, art, titel, gastgeber_id, gastgeber_snapshot,
    -- kontakt_id bleibt leer: Ein Bewerber ist kein Kontakt.
    termin_at, dauer_minuten, transkript_angeboten
  ) VALUES (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    'bewerbergespraech',
    _titel,
    _gastgeber,
    COALESCE(_abzug, '{}'::jsonb),
    _start,
    _dauer,
    true
  ) RETURNING * INTO _raum;

  INSERT INTO public.buchungen (
    mitarbeiter_id, terminart_id, link_id, quelle, kontakt_id, bewerbung_id,
    name, email, telefon,
    start_at, ende_at, dauer_minuten, puffer_vor_minuten, puffer_nach_minuten,
    bezeichnung, anlass, status, absage_token, videoraum_id
  ) VALUES (
    _gastgeber, _art.id, NULL, 'persoenlich', NULL, _f.bewerbung_id,
    left(_name, 120),
    left(lower(btrim(COALESCE(_bewerber.email, ''))), 200),
    left(btrim(COALESCE(_bewerber.telefon, '')), 40),
    _start, _ende, _dauer, _art.puffer_vor_minuten, _art.puffer_nach_minuten,
    _titel, 'bewerbergespraech', 'offen', public.buchung_token(), _raum.id
  ) RETURNING * INTO _buchung;

  /*
   * Der Termin gehoert an den Bewerber.
   *
   * Bewusst genau diese drei Felder: `bewerberToDb` in
   * src/lib/bewerbungStore.ts baut `meta` bei jedem Speichern aus den bekannten
   * Feldern neu auf, und diese drei kennt es. Ein Schluessel daneben
   * verschwaende beim naechsten Speichern in der Akte.
   */
  UPDATE public.bewerbungen
     SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'erstgespraechDatum', to_char(_start AT TIME ZONE _zone, 'YYYY-MM-DD'),
           'erstgespraechUhrzeit', to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
           'erstgespraechBerater', COALESCE(_abzug ->> 'name', ''))
   WHERE id = _f.bewerbung_id;

  RETURN jsonb_build_object(
    'id', _buchung.id,
    'start_at', _buchung.start_at,
    'ende_at', _buchung.ende_at,
    'dauer_minuten', _buchung.dauer_minuten,
    'bezeichnung', _buchung.bezeichnung,
    'status', _buchung.status,
    'raum_token', _raum.token,
    'zeitzone', _zone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Die noch bevorstehenden Termine mitbenennen
-- ---------------------------------------------------------------------------
--
-- Von beiden Vorgaengern aus, ohne den alten Namen zu kennen: Gesetzt wird
-- schlicht der neue, wo er noch nicht steht. Betroffen sind nur offene
-- Bewerbertermine in der Zukunft. Die Zeit des Termins bleibt unangetastet,
-- ebenso seine Dauer: Wer gebucht hat, behaelt seinen Termin.

UPDATE public.buchungen b
   SET bezeichnung = 'Persönliches Gespräch · ' || left(btrim(b.name), 120)
 WHERE b.anlass = 'bewerbergespraech'
   AND b.status = 'offen'
   AND b.start_at > now()
   AND btrim(COALESCE(b.name, '')) <> ''
   AND b.bezeichnung IS DISTINCT FROM 'Persönliches Gespräch · ' || left(btrim(b.name), 120);

UPDATE public.buchungen b
   SET bezeichnung = 'Persönliches Gespräch'
 WHERE b.anlass = 'bewerbergespraech'
   AND b.status = 'offen'
   AND b.start_at > now()
   AND btrim(COALESCE(b.name, '')) = ''
   AND b.bezeichnung IS DISTINCT FROM 'Persönliches Gespräch';

UPDATE public.videoraeume r
   SET titel = b.bezeichnung
  FROM public.buchungen b
 WHERE b.videoraum_id = r.id
   AND b.anlass = 'bewerbergespraech'
   AND b.status = 'offen'
   AND b.start_at > now()
   AND r.titel IS DISTINCT FROM b.bezeichnung;
