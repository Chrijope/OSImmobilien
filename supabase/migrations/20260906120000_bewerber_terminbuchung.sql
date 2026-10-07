-- ===========================================================================
-- Der Bewerber sucht sich seinen Termin selbst aus
-- ===========================================================================
--
-- Bis hierher endete das Kennenlernen mit einem Versprechen: "Die HR-Managerin
-- meldet sich mit dem Weg zur Terminwahl." Gebucht wurde danach ueber Calendly,
-- also ausserhalb des Hauses, und im CRM stand davon nichts.
--
-- Diese Migration bringt die Buchung an den hauseigenen Kalender. Sie baut
-- dafuer keinen zweiten Buchungsapparat, sondern haengt den Bewerber an den
-- vorhandenen: dieselben Tabellen `buchung_terminarten`,
-- `buchung_verfuegbarkeiten`, `buchungen` und `videoraeume`, dieselbe Rechnung
-- fuer freie Zeiten, dieselben Absage- und Verschiebefunktionen.
--
-- ── Der eine Unterschied, auf den es ankommt ──
--
-- `buchung_anlegen` legt aus einer Buchung ueber einen offenen Link einen
-- **Lead** an und setzt ihm eine **Pipelinestufe** (20260804160000). Fuer einen
-- Kunden ist das richtig, fuer einen Bewerber waere es falsch: Ein Bewerber ist
-- kein Interessent, er gehoert in keine Vertriebspipeline und in keine
-- Kundenakte. Deshalb bucht er nicht ueber `buchung_anlegen`, sondern ueber
-- `bewerber_termin_buchen` weiter unten. Diese Funktion legt
--
--   * keinen Eintrag in `kontakte` an,
--   * keine `meta -> pipelineStufe`,
--   * keinen Termin in `aktivitaeten`.
--
-- Sie schreibt stattdessen `buchungen.bewerbung_id` und traegt Datum und
-- Uhrzeit am Bewerber selbst nach, damit der Termin dort auftaucht, wo im
-- Bewerbermanagement ohnehin danach gesucht wird.
--
-- ── Was ohne diese Migration passiert ──
--
-- Nichts Schlimmes. Der Store faengt die fehlenden Funktionen ab, Ansicht 21
-- zeigt dann weiterhin nur Dauer, Tagesordnung und den naechsten Schritt, so
-- wie bisher. Erst nach dem Lauf im SQL-Editor erscheint die Zeitauswahl.

-- ---------------------------------------------------------------------------
-- 1) Der neue Anlass 'bewerbergespraech'
-- ---------------------------------------------------------------------------
--
-- Drei Pruefregeln sind betroffen, genau wie bei 20260804140000. Die dritte ist
-- die wichtige: Der Anlass einer Terminart wird beim Buchen unveraendert in
-- `videoraeume.art` geschrieben. Ohne die Erweiterung dort schluege jede
-- Buchung mit dem neuen Anlass fehl.
--
-- Nebenbei wird ein Versehen aus 20260827130000 mitgeheilt:
-- 'finanzierungsgespraech' kam damals zu `buchung_terminarten` und `buchungen`
-- dazu, aber nicht zu `videoraeume`. Eine Buchung auf ein Finanzierungsgespraech
-- laeuft deshalb heute in eine verletzte Pruefregel. Da diese Migration die
-- Regel ohnehin neu schreibt, waere das Weglassen die eigentliche Entscheidung.

ALTER TABLE public.buchung_terminarten
  DROP CONSTRAINT IF EXISTS buchung_terminarten_anlass_chk;
ALTER TABLE public.buchung_terminarten
  ADD CONSTRAINT buchung_terminarten_anlass_chk
  CHECK (anlass IN ('erstgespraech', 'beratung', 'objektvorstellung',
                    'finanzierungsgespraech', 'bewerbergespraech', 'sonstiges'));

ALTER TABLE public.buchungen
  DROP CONSTRAINT IF EXISTS buchungen_anlass_chk;
ALTER TABLE public.buchungen
  ADD CONSTRAINT buchungen_anlass_chk
  CHECK (anlass IN ('erstgespraech', 'beratung', 'objektvorstellung',
                    'finanzierungsgespraech', 'bewerbergespraech', 'sonstiges'));

ALTER TABLE public.videoraeume
  DROP CONSTRAINT IF EXISTS videoraeume_art_chk;
ALTER TABLE public.videoraeume
  ADD CONSTRAINT videoraeume_art_chk
  CHECK (art IN ('erstgespraech', 'beratung', 'objektvorstellung',
                 'finanzierungsgespraech', 'bewerbergespraech', 'sonstiges'));

-- ---------------------------------------------------------------------------
-- 2) Die Agenda des Warteraums fuer die neue Raumart
-- ---------------------------------------------------------------------------
--
-- Der Ausloeser `videoraum_vervollstaendigen` fuellt eine leere Agenda aus
-- dieser Funktion. Sie steht bewusst doppelt, hier und in
-- `src/lib/videoraumAgenda.ts`: Ein Raum, der ohne Browser entsteht, kann sie
-- sich nicht von dort holen. Aendert sich eine Agenda, gehoert sie an beiden
-- Stellen nachgezogen. Die vier bestehenden Faelle sind wortgleich aus
-- 20260805120000 uebernommen, dazu kommt der fuenfte.
--
-- Die Punkte spiegeln den Gespraechsleitfaden des Bewerberprozesses: ein Kern,
-- Module nach Bedarf, eine kurze Arbeitsprobe. Angesprochen wird der Bewerber
-- mit Du, wie im ganzen Kennenlernen.

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
      {"titel":"Deine Themen","text":"Was du markiert hast, und deine eigene Frage.","minuten":15},
      {"titel":"Wie die Zusammenarbeit läuft","text":"Vergütung, Servicevereinbarung, Gewerbe und Erlaubnis.","minuten":15},
      {"titel":"Wie es weitergeht","text":"Du entscheidest, ob du starten möchtest. Ein Vertrag kommt erst danach.","minuten":10}
    ]'::jsonb
    ELSE '[]'::jsonb
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Der Termin gehoert dem Bewerber, nicht einem Kontakt
-- ---------------------------------------------------------------------------
--
-- `buchungen.kontakt_id` bleibt bei einer Bewerberbuchung leer. Der Bezug
-- laeuft ueber diese Spalte. `ON DELETE SET NULL` und nicht `CASCADE`: Wird ein
-- Bewerber geloescht, soll die Buchung nicht mitverschwinden, sonst faellt ein
-- Termin lautlos aus dem Kalender der HR-Managerin.

ALTER TABLE public.buchungen
  ADD COLUMN IF NOT EXISTS bewerbung_id uuid
  REFERENCES public.bewerbungen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS buchungen_bewerbung_idx
  ON public.buchungen (bewerbung_id)
  WHERE bewerbung_id IS NOT NULL;

COMMENT ON COLUMN public.buchungen.bewerbung_id IS
  'Bewerber, dem dieser Termin gehoert. Gesetzt statt kontakt_id: Ein Bewerber ist kein Lead.';

-- ---------------------------------------------------------------------------
-- 4) Die Terminart "Bewerbergespräch"
-- ---------------------------------------------------------------------------
--
-- Sie bekommt, wer heute Bewerber betreut oder den Ablauf pruefen soll: die
-- Rolle `hr` und die Administratoren. Bewusst beide, damit der Ablauf
-- durchgespielt werden kann, bevor die HR-Managerin freigeschaltet ist.
--
-- `oeffentlich = false` ist der wichtige Wert: Ohne ihn stuende
-- "Bewerbergespräch" im offenen Buchungslink zwischen den Kundenterminen, und
-- ein Interessent koennte es waehlen.
--
-- Mehrfach ausfuehrbar und ohne UPDATE, wie der Nachtrag 20260905120000: Wer
-- die Terminart schon hat, erkennbar am Anlass oder an der Bezeichnung, bekommt
-- keine zweite. Wer sie umbenannt oder abgeschaltet hat, behaelt seine Fassung.
--
-- Die 45 Minuten sind die lange Fassung. Wer im Kennenlernen nichts zu klaeren
-- markiert hat, bekommt 30; das rechnet `bewerber_termin_dauer` weiter unten
-- aus, und dieselbe Regel steht in `gespraechsDauerMinuten` im Browser.
--
-- Vorlauf 24 Stunden statt der ueblichen 4: Eine Bewerbung ist keine
-- Kundenanfrage, und die HR-Managerin soll den Bogen vorher lesen koennen.
-- Vorausschau 30 Tage, weiter im Voraus plant hier niemand.

INSERT INTO public.buchung_terminarten
  (mitarbeiter_id, bezeichnung, beschreibung, dauer_minuten,
   puffer_vor_minuten, puffer_nach_minuten, vorlauf_minuten,
   vorausschau_tage, raster_minuten, aktiv, oeffentlich, anlass, sortierung)
SELECT
  b.user_id,
  'Bewerbergespräch',
  'Wir sprechen über das, was du im Kennenlernen aufgeschrieben hast: deine Themen, deine Frage und wie eine Zusammenarbeit bei uns aussieht.',
  45, 0, 15, 1440, 30, 15, true, false, 'bewerbergespraech', 5
FROM (
  SELECT p.id AS user_id
  FROM public.profiles p
  WHERE public.is_admin_role(p.id)
  UNION
  SELECT r.user_id
  FROM public.user_roles r
  WHERE r.role::text = 'hr'
) AS b
WHERE b.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.buchung_terminarten t
    WHERE t.mitarbeiter_id = b.user_id
      AND (
        t.anlass = 'bewerbergespraech'
        OR lower(btrim(t.bezeichnung)) = lower('Bewerbergespräch')
      )
  );

-- ---------------------------------------------------------------------------
-- 5) Wessen Kalender der Bewerber sieht
-- ---------------------------------------------------------------------------
--
-- Zustaendig ist die HR-Managerin. Aber eine Terminart allein macht noch keinen
-- buchbaren Kalender: Ohne eine einzige Wochenregel in
-- `buchung_verfuegbarkeiten` gaebe es keine freie Zeit, und der Bewerber saehe
-- eine leere Liste, ohne dass jemand den Grund erkennt.
--
-- Deshalb wird der Gastgeber in dieser Reihenfolge gesucht:
--
--   1. Wer die Rolle `hr` traegt, eine aktive Terminart "Bewerbergespräch" hat
--      und wenigstens eine Wochenregel gepflegt hat.
--   2. Sonst jeder andere, auf den dasselbe zutrifft.
--
-- Punkt 2 ist der Weg fuer die Erprobung: Solange die HR-Managerin ihren
-- Wochenplan nicht gepflegt hat, uebernimmt der Administrator, der ihn hat.
-- Sobald sie ihn pflegt, geht der Termin von selbst an sie ueber, ohne dass
-- jemand Code anfasst.
--
-- Tragen mehrere Personen dieselbe Rolle, gewinnt die kleinste Nutzerkennung.
-- Das ist willkuerlich, aber stabil, und folgt derselben Entscheidung wie
-- `_shared/hr-ansprechpartner.ts`.

CREATE OR REPLACE FUNCTION public.bewerber_termin_gastgeber()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.mitarbeiter_id
  FROM public.buchung_terminarten t
  WHERE t.anlass = 'bewerbergespraech'
    AND t.aktiv
    AND EXISTS (
      SELECT 1 FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = t.mitarbeiter_id
        AND v.wochentag IS NOT NULL
        AND NOT v.geschlossen
    )
  ORDER BY
    -- false sortiert vor true: Wer die Rolle hr hat, steht vorn.
    (NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = t.mitarbeiter_id AND r.role::text = 'hr'
    )),
    t.mitarbeiter_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.bewerber_termin_gastgeber() FROM public;
-- Bewusst nicht fuer `anon` freigegeben. Sie wird nur aus den Funktionen
-- darunter gerufen, die selbst SECURITY DEFINER sind.

-- ---------------------------------------------------------------------------
-- 6) Wie lang das Gespraech wird
-- ---------------------------------------------------------------------------
--
-- Dieselbe Regel wie `gespraechsDauerMinuten` in
-- `src/lib/bewerberKennenlernen.ts`: Wer Themen markiert oder eine eigene Frage
-- gestellt hat, bekommt die lange Fassung, sonst die kurze. Der Bewerber sieht
-- die Zahl auf Ansicht 21, bevor er waehlt.
--
-- Die lange Fassung ist die Dauer der Terminart. Wird sie dort auf 60 gestellt,
-- waechst nur die lange mit; die kurze bleibt bei 30, ausser die Terminart
-- selbst faellt darunter.

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
    ELSE LEAST(_lang, 30)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Was der Bewerber ohne Konto zu sehen bekommt
-- ---------------------------------------------------------------------------
--
-- Gelesen wird ausschliesslich mit dem Kennenlern-Token, also demselben Link,
-- den er per Mail bekommen hat. Herausgegeben wird nur, was er ohnehin
-- erfaehrt: mit wem er spricht, in welcher Zeitzone, wie lange, und sein
-- eigener Termin. Weder die Bewerbungskennung noch der Absagetoken verlassen
-- die Datenbank auf diesem Weg; Absagen und Verschieben laufen ueber dieselbe
-- Kennung wie das Lesen.

CREATE OR REPLACE FUNCTION public.bewerber_termin_zugang(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f record;
  _gastgeber uuid;
  _art public.buchung_terminarten;
  _zone text;
  _dauer integer;
  -- Bewusst einzelne Variablen und kein `record`: Findet die Abfrage darunter
  -- keine Zeile, waere ein nie zugewiesener Datensatz beim Lesen ein Fehler.
  -- Einzelne Variablen bleiben schlicht NULL, und genau das ist der Normalfall
  -- (der Bewerber hat noch keinen Termin).
  _b_id uuid;
  _b_start timestamptz;
  _b_ende timestamptz;
  _b_dauer integer;
  _b_status text;
  _b_bezeichnung text;
  _b_raum_id uuid;
  _abzug jsonb;
  _raum text;
BEGIN
  SELECT f.bewerbung_id, f.status, f.antworten
    INTO _f
    FROM public.bewerber_formular f
   WHERE f.token = _token
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _gastgeber := public.bewerber_termin_gastgeber();
  IF _gastgeber IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO _art
  FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = _gastgeber AND t.anlass = 'bewerbergespraech' AND t.aktiv
  ORDER BY t.sortierung, t.bezeichnung
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _gastgeber;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _dauer := public.bewerber_termin_dauer(_f.antworten, _art.dauer_minuten);

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', COALESCE(p.name, 'Deine Ansprechpartnerin'),
    'email', p.email,
    'telefon', p.telefon,
    'bild', p.avatar_url,
    'position', us.einstellungen -> 'profil' ->> 'position'
  ))
  INTO _abzug
  FROM public.profiles p
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE p.id = _gastgeber;

  -- Der eigene Termin, falls es einen gibt. Abgesagte zaehlen nicht, sonst
  -- staende auf der Seite ein Termin, den es nicht mehr gibt.
  SELECT b.id, b.start_at, b.ende_at, b.dauer_minuten, b.status, b.bezeichnung, b.videoraum_id
    INTO _b_id, _b_start, _b_ende, _b_dauer, _b_status, _b_bezeichnung, _b_raum_id
    FROM public.buchungen b
   WHERE b.bewerbung_id = _f.bewerbung_id
     AND b.status <> 'abgesagt'
   ORDER BY b.start_at DESC
   LIMIT 1;

  IF _b_raum_id IS NOT NULL THEN
    SELECT v.token INTO _raum FROM public.videoraeume v WHERE v.id = _b_raum_id;
  END IF;

  RETURN jsonb_build_object(
    'gastgeber', COALESCE(_abzug, '{}'::jsonb),
    'zeitzone', _zone,
    'dauer_minuten', _dauer,
    'bezeichnung', _art.bezeichnung,
    'beschreibung', _art.beschreibung,
    'vorausschau_tage', _art.vorausschau_tage,
    -- Gebucht wird erst, wenn die Angaben abgesendet sind. Vorher gibt es
    -- keine Antworten, aus denen sich die Dauer ergeben koennte.
    'buchbar', (_f.status = 'eingereicht'),
    'buchung', CASE WHEN _b_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _b_id,
      'start_at', _b_start,
      'ende_at', _b_ende,
      'dauer_minuten', _b_dauer,
      'status', _b_status,
      'bezeichnung', _b_bezeichnung,
      'raum_token', _raum
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bewerber_termin_zugang(text) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_zugang(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) Die freien Zeiten
-- ---------------------------------------------------------------------------
--
-- Dieselbe Rechnung wie `buchung_freie_zeiten` aus 20260804090000, mit einem
-- Unterschied: Die Dauer kommt nicht aus der Terminart, sondern aus den
-- Antworten des Bewerbers. Sonst waere die angebotene Zeit eine andere als die
-- gebuchte, und ein 30-Minuten-Gespraech wuerde 45 Minuten sperren.

CREATE OR REPLACE FUNCTION public.bewerber_termin_freie_zeiten(
  _token text,
  _von date,
  _bis date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f record;
  _gastgeber uuid;
  _art public.buchung_terminarten;
  _zone text;
  _dauer integer;
  _tag date;
  _letzter_tag date;
  _fenster record;
  _start timestamptz;
  _ende timestamptz;
  _block_von timestamptz;
  _block_bis timestamptz;
  _frueheste timestamptz;
  _spaeteste timestamptz;
  _treffer jsonb := '[]'::jsonb;
BEGIN
  SELECT f.bewerbung_id, f.status, f.antworten
    INTO _f
    FROM public.bewerber_formular f
   WHERE f.token = _token
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;
  -- Erst nach dem Absenden: Vorher gibt es keine Antworten, und ohne sie
  -- laesst sich die Dauer nicht bestimmen.
  IF _f.status <> 'eingereicht' THEN
    RETURN '[]'::jsonb;
  END IF;

  _gastgeber := public.bewerber_termin_gastgeber();
  IF _gastgeber IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO _art
  FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = _gastgeber AND t.anlass = 'bewerbergespraech' AND t.aktiv
  ORDER BY t.sortierung, t.bezeichnung
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _gastgeber;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _dauer := public.bewerber_termin_dauer(_f.antworten, _art.dauer_minuten);

  _frueheste := now() + make_interval(mins => _art.vorlauf_minuten);
  _spaeteste := now() + make_interval(days => _art.vorausschau_tage);

  _tag := GREATEST(COALESCE(_von, (now() AT TIME ZONE _zone)::date),
                   (now() AT TIME ZONE _zone)::date);
  _letzter_tag := LEAST(COALESCE(_bis, _tag + 31), (_spaeteste AT TIME ZONE _zone)::date);
  -- Deckel gegen zu grosse Abfragen ueber den oeffentlichen Zugang.
  _letzter_tag := LEAST(_letzter_tag, _tag + 62);

  WHILE _tag <= _letzter_tag LOOP
    FOR _fenster IN
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _gastgeber
        AND v.datum = _tag
        AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _gastgeber
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _gastgeber AND a.datum = _tag
        )
      ORDER BY 1
    LOOP
      _start := (_tag + _fenster.von) AT TIME ZONE _zone;
      LOOP
        _ende := _start + make_interval(mins => _dauer);
        EXIT WHEN _ende > ((_tag + _fenster.bis) AT TIME ZONE _zone);

        IF _start >= _frueheste AND _start <= _spaeteste THEN
          _block_von := _start - make_interval(mins => _art.puffer_vor_minuten);
          _block_bis := _ende + make_interval(mins => _art.puffer_nach_minuten);

          IF NOT EXISTS (
            SELECT 1 FROM public.buchungen b
            WHERE b.mitarbeiter_id = _gastgeber
              AND b.status <> 'abgesagt'
              -- Der eigene Termin steht sich beim Verschieben nicht im Weg.
              AND b.bewerbung_id IS DISTINCT FROM _f.bewerbung_id
              AND b.start_at - make_interval(mins => b.puffer_vor_minuten) < _block_bis
              AND b.ende_at + make_interval(mins => b.puffer_nach_minuten) > _block_von
          ) AND NOT public.buchung_termin_belegt(_gastgeber, _block_von, _block_bis, _zone) THEN
            _treffer := _treffer || to_jsonb(to_char(_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
          END IF;
        END IF;

        _start := _start + make_interval(mins => _art.raster_minuten);
      END LOOP;
    END LOOP;
    _tag := _tag + 1;
  END LOOP;

  RETURN _treffer;
END;
$$;

REVOKE ALL ON FUNCTION public.bewerber_termin_freie_zeiten(text, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_freie_zeiten(text, date, date) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) Buchen
-- ---------------------------------------------------------------------------
--
-- Aufgebaut wie `buchung_anlegen`, aber ohne dessen Kundenteil. Kein Kontakt,
-- keine Pipelinestufe, kein Termin in `aktivitaeten`. Was entsteht: ein
-- Videoraum, eine Zeile in `buchungen` mit `bewerbung_id`, und Datum und
-- Uhrzeit am Bewerber.

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
    _art.bezeichnung,
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
    left(btrim(COALESCE(_bewerber.vorname, '') || ' ' || COALESCE(_bewerber.nachname, '')), 120),
    left(lower(btrim(COALESCE(_bewerber.email, ''))), 200),
    left(btrim(COALESCE(_bewerber.telefon, '')), 40),
    _start, _ende, _dauer, _art.puffer_vor_minuten, _art.puffer_nach_minuten,
    _art.bezeichnung, 'bewerbergespraech', 'offen', public.buchung_token(), _raum.id
  ) RETURNING * INTO _buchung;

  /*
   * Der Termin gehoert an den Bewerber.
   *
   * Bewusst genau diese drei Felder: `bewerberToDb` in
   * src/lib/bewerbungStore.ts baut `meta` bei jedem Speichern aus den bekannten
   * Feldern neu auf, und diese drei kennt es. Ein Schluessel daneben
   * verschwaende beim naechsten Speichern in der Akte.
   *
   * Damit erscheint der Termin ueberall dort, wo im Bewerbermanagement ohnehin
   * danach gesucht wird, und die vorhandene Erinnerungskette
   * `send-bewerber-erstgespraech-reminders` greift von selbst. Sie liest genau
   * diese Felder; ohne den Namen stuende in ihrer Mail kein Ansprechpartner.
   *
   * Das Datum im Format JJJJ-MM-TT, so wie `DateInput` es in der Akte
   * speichert.
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
-- 10) Verschieben und Absagen
-- ---------------------------------------------------------------------------
--
-- Beides laeuft ueber die vorhandenen Funktionen `buchung_verschieben` und
-- `buchung_absagen` aus 20260804170000. Sie pruefen Fenster, Vorlauf und
-- Kollisionen, schliessen den Videoraum und lassen den eigenen Termin sich
-- selbst nicht im Weg stehen. Das alles ein zweites Mal zu schreiben, waere die
-- schlechtere Fehlerquelle.
--
-- Hier steht deshalb nur, was dort fehlt: die Aufloesung vom Kennenlern-Token
-- auf den Absagetoken, und das Nachziehen von Datum und Uhrzeit am Bewerber.
-- Der Absagetoken selbst wird nie herausgegeben.

CREATE OR REPLACE FUNCTION public.bewerber_termin_verschieben(
  _token text,
  _start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bewerbung uuid;
  _absage text;
  _zone text;
  _ergebnis jsonb;
BEGIN
  SELECT f.bewerbung_id INTO _bewerbung
    FROM public.bewerber_formular f
   WHERE f.token = _token AND f.status = 'eingereicht'
   LIMIT 1;
  IF _bewerbung IS NULL THEN
    RAISE EXCEPTION 'Dieser Link ist uns unbekannt';
  END IF;

  SELECT b.absage_token INTO _absage
    FROM public.buchungen b
   WHERE b.bewerbung_id = _bewerbung AND b.status = 'offen'
   ORDER BY b.start_at DESC
   LIMIT 1;
  IF _absage IS NULL THEN
    RAISE EXCEPTION 'Dieser Termin laesst sich nicht mehr verschieben';
  END IF;

  _ergebnis := public.buchung_verschieben(_absage, _start);
  _zone := COALESCE(_ergebnis ->> 'zeitzone', 'Europe/Berlin');

  UPDATE public.bewerbungen
     SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'erstgespraechDatum', to_char(_start AT TIME ZONE _zone, 'YYYY-MM-DD'),
           'erstgespraechUhrzeit', to_char(_start AT TIME ZONE _zone, 'HH24:MI'))
   WHERE id = _bewerbung;

  RETURN _ergebnis;
END;
$$;

CREATE OR REPLACE FUNCTION public.bewerber_termin_absagen(
  _token text,
  _grund text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bewerbung uuid;
  _absage text;
  _zone text;
  _alt timestamptz;
  _ergebnis jsonb;
BEGIN
  SELECT f.bewerbung_id INTO _bewerbung
    FROM public.bewerber_formular f
   WHERE f.token = _token AND f.status = 'eingereicht'
   LIMIT 1;
  IF _bewerbung IS NULL THEN
    RAISE EXCEPTION 'Dieser Link ist uns unbekannt';
  END IF;

  SELECT b.absage_token, b.start_at INTO _absage, _alt
    FROM public.buchungen b
   WHERE b.bewerbung_id = _bewerbung AND b.status = 'offen'
   ORDER BY b.start_at DESC
   LIMIT 1;
  IF _absage IS NULL THEN
    RAISE EXCEPTION 'Dieser Termin laesst sich nicht mehr absagen';
  END IF;

  _ergebnis := public.buchung_absagen(_absage, _grund);

  -- Datum und Uhrzeit am Bewerber nur dann raeumen, wenn dort noch genau
  -- dieser Termin steht. Hat die HR-Managerin inzwischen von Hand etwas
  -- anderes eingetragen, bleibt ihre Angabe stehen.
  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchungen b
  LEFT JOIN public.buchung_einstellungen e ON e.mitarbeiter_id = b.mitarbeiter_id
  WHERE b.absage_token = _absage;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  UPDATE public.bewerbungen
     SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'erstgespraechDatum', '', 'erstgespraechUhrzeit', '')
   WHERE id = _bewerbung
     AND COALESCE(meta ->> 'erstgespraechDatum', '') = to_char(_alt AT TIME ZONE _zone, 'YYYY-MM-DD')
     AND COALESCE(meta ->> 'erstgespraechUhrzeit', '') = to_char(_alt AT TIME ZONE _zone, 'HH24:MI');

  RETURN _ergebnis;
END;
$$;

REVOKE ALL ON FUNCTION public.bewerber_termin_verschieben(text, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.bewerber_termin_absagen(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_verschieben(text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_absagen(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) IS
  'Terminbuchung des Bewerbers ueber den Kennenlern-Token. Legt bewusst keinen Lead an und setzt keine Pipelinestufe.';
