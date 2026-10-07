-- ===========================================================================
-- Nachtwaechter: Unstimmigkeiten in den Objektdaten, je Bereich OBJ, FIN, AS
-- ===========================================================================
--
-- WARUM
--
-- Christian am 24.09.2026: Unstimmigkeiten in den Objektdaten sollen jeden
-- Morgen automatisch im Morgenbericht stehen, zugeordnet zu Objektmanagement
-- (OBJ, Tobias Ammann), Finanzierung (FIN, Fabian Kortmann) und Aftersales
-- (AS, Sophie Lindner). Anlass war ein Stichprobenabruf: Beim Objekt
-- "Crailsheim" lautet die Adresse nur "9a" und die PLZ 04177 gehoert zu
-- Leipzig, bei Germering nennt der Titel 82210 und das Feld 82110, bei
-- Delitzsch steht im Titel "0409" statt 04509.
--
-- WAS DIESE MIGRATION TUT
--
--   1) `nachtpruefung_befunde` bekommt die Spalte `bereich`. Jede neue
--      Objektpruefung traegt dort OBJ, FIN oder AS. Die alten Pruefungen
--      bleiben ohne Bereich, fuer sie aendert sich nichts.
--   2) Fuenf kleine Helfer und die Teilpruefung `nachtpruefung_objektdaten`
--      mit fuenfzehn Regeln, jede in ihrem eigenen Fehlerabfang.
--   3) Eine neue Fassung von `nachtpruefung_lauf`. Sie ist WORTGETREU die
--      Fassung aus 20260806143342 (alle zehn bisherigen Bloecke, keiner
--      fehlt), dazu Block 11, der die Objektpruefung ruft.
--   4) `kennzahlen_tagesstand_objektdaten` schreibt je Bereich zwei Zahlen
--      in `kennzahlen_tagesstand`: wie viele Objekte eine Unstimmigkeit haben
--      und wie viele Treffer seit dem letzten Lauf neu sind. Daraus liest das
--      8-Uhr-Briefing, ein zweites Datensystem entsteht nicht. Der Zeitplan
--      `kennzahlen-tagesstand` ruft sie als dritten Teil.
--   5) Einmal laufen lassen und eine lesende Pruefabfrage.
--
-- NEU GEGEN BESTEHEND
--
-- Viele Befunde bleiben tagelang stehen. Damit nicht jeden Morgen dieselbe
-- lange Mail hinausgeht, traegt jeder Treffer in `beispiele` das Feld `neu`:
-- wahr, wenn dasselbe Objekt beim juengsten frueheren Lauf DERSELBEN Pruefung
-- nicht auf der Liste stand. Die Morgenmail nennt nur die neuen einzeln und
-- die bestehenden als Zahl. Beim allerersten Lauf ist alles neu; der erste
-- Lauf geschieht unten in dieser Migration, die Mail am naechsten Morgen
-- vergleicht also schon mit ihm.
--
-- KEINE FLUT
--
-- Trifft eine Regel mindestens zehn Objekte und dabei mindestens 80 Prozent
-- aller geprueften, wird das Feld offenbar grundsaetzlich nicht gepflegt. Dann
-- entsteht EIN Sammelbefund (Schwere "hinweis", keine Einzelliste) statt
-- einer Liste, die jeden Morgen dasselbe sagt.
--
-- INVESTAGON
--
-- Jeder Treffer traegt `quelle` ("investagon" oder "crm") und `aktion`. Bei
-- Investagon-Objekten heisst die Folge "in Investagon korrigieren", denn der
-- naechtliche Abgleich ueberschreibt geaenderte Felder im CRM. Ausnahme sind
-- Felder, die Investagon nicht liefert (Ruecklage, Verwaltungsart): Die
-- pflegt man im CRM, der Abgleich laesst sie stehen.
--
-- DATENSCHUTZ
--
-- In `beispiele` stehen nur Objektkennung, Objekttitel, Einheitennummern,
-- Feldnamen und Werte der Objekte. Keine Kunden, Kaeufer, Mieter oder
-- Verkaeufer. Die Spalten `kunde_id`, `kunde_name`, `vorgemerkt_*`,
-- `belegung_kunde_*` werden nicht einmal gelesen.
--
-- TYPEN
--
-- Alle Verknuepfungen zwischen `objekte`, `wohnungen`, `objekt_dokumente` und
-- `wohnungs_dokumente` vergleichen beide Seiten als Text (`::text = ::text`).
-- Die Spalten sind laut Historie uuid gegen uuid; der Textvergleich bleibt
-- aber auch dann richtig, wenn eine Seite irgendwann Text wird. Ein einseitiges
-- `::text` gegen uuid hat die Funktionen dieses Projekts schon dreimal
-- zerlegt, das kommt hier nicht vor.
--
-- WIEDERHOLBAR: nur CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, eine
-- Pruefregel, die vorher entfernt wird, und ein Zeitplan, der vorher
-- abgemeldet wird. Ein zweiter Lauf legt nur einen weiteren Pruefdurchgang an.
--
-- UNGEPRUEFT: Diese Datei ist ohne Datenbankzugang geschrieben und in keiner
-- Datenbank gelaufen. Jede Regel hat ihren eigenen Fehlerabfang; passt eine
-- nicht auf das echte Schema, steht sie als Befund mit Schwere "fehler" in der
-- Pruefabfrage ganz unten, und die uebrigen laufen trotzdem.

-- ---------------------------------------------------------------------------
-- 1) Die Spalte `bereich`
-- ---------------------------------------------------------------------------

ALTER TABLE public.nachtpruefung_befunde
  ADD COLUMN IF NOT EXISTS bereich text;

ALTER TABLE public.nachtpruefung_befunde
  DROP CONSTRAINT IF EXISTS nachtpruefung_bereich_chk;

-- Dieselbe feste Liste wie in `kennzahlen_tagesstand`, damit ein Tippfehler
-- einen Befund nicht still aus der Zuordnung fallen laesst. Leer bleibt
-- erlaubt: Die bisherigen Pruefungen gehoeren keinem Bereich.
ALTER TABLE public.nachtpruefung_befunde
  ADD CONSTRAINT nachtpruefung_bereich_chk CHECK (bereich IS NULL OR bereich IN (
    'AGL', 'OPS', 'VL', 'TEC', 'REC', 'HR', 'VA', 'ST',
    'MKT', 'OBJ', 'BO', 'FIN', 'AS', 'CTR'
  ));

COMMENT ON COLUMN public.nachtpruefung_befunde.bereich IS
  'Abteilungskuerzel, dem der Befund gehoert (etwa OBJ, FIN, AS). Leer bei '
  'den Systempruefungen ohne Bereich.';

-- ---------------------------------------------------------------------------
-- 2) Helfer
-- ---------------------------------------------------------------------------

/*
 * Zahl aus einem Textfeld, NULL statt Fehler. Wortgleich mit der Fassung aus
 * 20260914180000_kennzahlen_alle_abteilungen.sql; hier noch einmal angelegt,
 * damit diese Migration auch dann laeuft, wenn jene fehlen sollte.
 */
CREATE OR REPLACE FUNCTION public.kennzahl_zahl(_roh text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF _roh IS NULL OR btrim(_roh) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(_roh)::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.kennzahl_zahl(text) FROM anon;

/*
 * Ein Unterlagentitel in der Form, in der sich Stichworte finden lassen.
 *
 * SQL-Entsprechung von `normalisiereTitel` in
 * supabase/functions/_shared/dokument-gruppen.ts: NFC, Umlaute
 * ausgeschrieben, Akzente weg, klein, alles ausser Buchstaben und Ziffern
 * wird zum Leerzeichen. Die Grossumlaute werden vor `lower` ersetzt, weil
 * `lower` sie je nach Spracheinstellung der Datenbank nicht anfasst.
 */
CREATE OR REPLACE FUNCTION public.nachtpruefung_normtext(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
           lower(translate(
             replace(replace(replace(replace(replace(replace(replace(
               normalize(coalesce(_t, ''), NFC),
               'Ä', 'ae'), 'Ö', 'oe'), 'Ü', 'ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
             'ÉÈÊÁÀÂÓÒÔÍÌÎÚÙÛÇÑéèêëáàâóòôíìîïúùûçñ',
             'EEEAAAOOOIIIUUUCNeeeeaaaoooiiiiuuucn')),
           '[^a-z0-9]+', ' ', 'g'));
$$;

/*
 * Ist eine Zeile in `wohnungen` die Summenzeile eines Hauses?
 *
 * Investagon liefert bei Haeusern, die man auch im Ganzen kaufen kann, eine
 * zusaetzliche Einheit "Global" mit der Summe aller Wohnungen
 * (`property_usage` = 'Globalobjekt'). Sie ist keine Wohnung und bleibt bei
 * allen Einheitenregeln aussen vor.
 */
CREATE OR REPLACE FUNCTION public.nachtpruefung_globalzeile(_we_nr text, _etage text, _meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(_we_nr, ''))) = 'global'
      OR lower(btrim(coalesce(_etage, ''))) = 'global'
      OR coalesce(_meta->'investagonRaw'->>'property_usage', '') = 'Globalobjekt';
$$;

/*
 * Ein Treffer als JSON, so wie er in `beispiele` steht.
 *
 * `_art` sagt, wem das Feld gehoert, und bestimmt damit den Satz in `aktion`:
 *   'feld'       Investagon liefert es, der Abgleich ueberschreibt das CRM.
 *   'ergaenzen'  Investagon liefert es, fehlt dort aber; eine Pflege im CRM
 *                bleibt stehen, weil der Abgleich nur Gelieferte schreibt.
 *   'crm'        Investagon liefert es nicht, es gehoert allein dem CRM.
 *   'unterlage'  eine fehlende Datei.
 * Bei selbst angelegten Objekten heisst es immer "im CRM".
 *
 * Hoechstens fuenf Einheitennummern, der Rest als Zahl.
 */
CREATE OR REPLACE FUNCTION public.nachtpruefung_objektdaten_eintrag(
  _objekt_id uuid,
  _titel text,
  _meta jsonb,
  _detail text,
  _einheiten text[] DEFAULT NULL,
  _art text DEFAULT 'feld'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'objekt_id', _objekt_id::text,
    'titel', coalesce(nullif(btrim(_titel), ''), 'Objekt ohne Titel'),
    'quelle', CASE WHEN coalesce(_meta->>'investagonSlug', '') <> '' THEN 'investagon' ELSE 'crm' END,
    'detail', _detail,
    'einheiten', CASE WHEN coalesce(array_length(_einheiten, 1), 0) > 0
                      THEN to_jsonb(_einheiten[1:5]) END,
    'einheiten_weitere', CASE WHEN coalesce(array_length(_einheiten, 1), 0) > 5
                              THEN array_length(_einheiten, 1) - 5 END,
    'aktion', CASE
      WHEN coalesce(_meta->>'investagonSlug', '') = '' THEN
        CASE WHEN _art = 'unterlage' THEN 'Im CRM am Objekt hochladen.'
             ELSE 'Im CRM am Objekt korrigieren.' END
      WHEN _art = 'unterlage' THEN 'In Investagon ergänzen oder im CRM hochladen.'
      WHEN _art = 'crm' THEN 'Im CRM pflegen. Investagon liefert dieses Feld nicht, der Abgleich lässt es stehen.'
      WHEN _art = 'ergaenzen' THEN 'In Investagon ergänzen. Eine Pflege im CRM bleibt stehen, solange Investagon nichts liefert.'
      ELSE 'In Investagon korrigieren. Eine Änderung im CRM überschreibt der nächste Abgleich.'
    END
  ));
$$;

/*
 * Einen Befund einer Objektregel schreiben: neu markieren, Flut abfangen,
 * Meldung bauen. Gibt die Zahl der betroffenen Objekte zurueck.
 *
 * `_treffer` ist ein JSON-Array aus `nachtpruefung_objektdaten_eintrag`, je
 * Objekt hoechstens ein Eintrag. `_geprueft` ist die Zahl der Objekte, die
 * die Regel angesehen hat. `_was` ist der Name der Regel als Satzanfang.
 */
CREATE OR REPLACE FUNCTION public.nachtpruefung_objektdaten_schreiben(
  _lauf timestamptz,
  _pruefung text,
  _bereich text,
  _schwere text,
  _geprueft integer,
  _treffer jsonb,
  _was text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_treffer jsonb := CASE WHEN jsonb_typeof(_treffer) = 'array' THEN _treffer ELSE '[]'::jsonb END;
  v_anzahl integer;
  v_vorher jsonb;
  v_beispiele jsonb;
  v_neu integer;
  v_investagon integer;
  v_geprueft integer := coalesce(_geprueft, 0);
BEGIN
  v_anzahl := jsonb_array_length(v_treffer);

  -- Der juengste fruehere Befund derselben Pruefung, ohne Ausfaelle. Fehlt
  -- er (erster Lauf), ist jeder Treffer neu.
  SELECT b.beispiele INTO v_vorher
    FROM public.nachtpruefung_befunde b
   WHERE b.pruefung = _pruefung
     AND b.lauf_at < _lauf
     AND b.schwere <> 'fehler'
   ORDER BY b.lauf_at DESC
   LIMIT 1;
  IF v_vorher IS NULL OR jsonb_typeof(v_vorher) <> 'array' THEN
    v_vorher := '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(
           t.e || jsonb_build_object('neu', NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(v_vorher) p
              WHERE p->>'objekt_id' = t.e->>'objekt_id'))
           ORDER BY t.e->>'titel', t.e->>'objekt_id'), '[]'::jsonb)
    INTO v_beispiele
    FROM jsonb_array_elements(v_treffer) AS t(e);

  SELECT count(*) FILTER (WHERE (e->>'neu')::boolean),
         count(*) FILTER (WHERE e->>'quelle' = 'investagon')
    INTO v_neu, v_investagon
    FROM jsonb_array_elements(v_beispiele) AS e;

  IF v_anzahl = 0 THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, bereich, schwere, anzahl, meldung, beispiele)
    VALUES (_lauf, _pruefung, _bereich, 'hinweis', 0,
            _was || ': bei keinem der ' || v_geprueft || ' geprüften Objekte.', '[]'::jsonb);
  ELSIF v_anzahl >= 10 AND v_geprueft >= 10 AND v_anzahl >= ceil(v_geprueft * 0.8) THEN
    -- Sammelbefund: Das Feld wird offenbar grundsaetzlich nicht gepflegt.
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, bereich, schwere, anzahl, meldung, beispiele)
    VALUES (_lauf, _pruefung, _bereich, 'hinweis', v_anzahl,
            _was || ': bei ' || v_anzahl || ' von ' || v_geprueft || ' Objekten, davon '
              || v_investagon || ' aus Investagon. Das Feld wird offenbar grundsätzlich nicht gepflegt, '
              || 'deshalb ein Sammelbefund statt einer Liste.',
            '[]'::jsonb);
  ELSE
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, bereich, schwere, anzahl, meldung, beispiele)
    VALUES (_lauf, _pruefung, _bereich, _schwere, v_anzahl,
            _was || ': ' || v_anzahl || ' Objekt' || CASE WHEN v_anzahl = 1 THEN '' ELSE 'e' END
              || ' von ' || v_geprueft
              || CASE WHEN v_neu = 0 THEN ', keines neu seit dem letzten Lauf.'
                      ELSE ', davon ' || v_neu || ' neu seit dem letzten Lauf.' END,
            v_beispiele);
  END IF;

  RETURN v_anzahl;
END;
$$;

/* Eine Regel ist selbst ausgefallen: das als Befund festhalten. */
CREATE OR REPLACE FUNCTION public.nachtpruefung_objektdaten_ausfall(
  _lauf timestamptz, _pruefung text, _bereich text, _fehler text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, bereich, schwere, anzahl, meldung)
  VALUES (_lauf, _pruefung, _bereich, 'fehler', 1, 'Die Prüfung selbst ist ausgefallen: ' || coalesce(_fehler, 'unbekannt'));
$$;

REVOKE ALL ON FUNCTION public.nachtpruefung_normtext(text) FROM anon;
REVOKE ALL ON FUNCTION public.nachtpruefung_globalzeile(text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.nachtpruefung_objektdaten_eintrag(uuid, text, jsonb, text, text[], text) FROM anon;
REVOKE ALL ON FUNCTION public.nachtpruefung_objektdaten_schreiben(timestamptz, text, text, text, integer, jsonb, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.nachtpruefung_objektdaten_ausfall(timestamptz, text, text, text) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Die fuenfzehn Regeln
-- ---------------------------------------------------------------------------
--
-- Umfang: "Im Vertrieb" heisst sichtbar und freigegeben, dieselbe Bedingung,
-- unter der ein Objekt zum Verkauf steht (src/lib/objekteStore.ts:1052, auch
-- OBJ.standzeit_max_tage im Kennzahlenlauf). Entwuerfe sind in Arbeit und
-- bleiben draussen. Die Aftersales-Regeln sehen zusaetzlich die
-- ausgeblendeten freigegebenen Objekte an, denn ein ausverkauftes Haus
-- verschwindet oft aus dem Vertrieb, seine Kaeufer bleiben.

CREATE OR REPLACE FUNCTION public.nachtpruefung_objektdaten(_lauf timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_jahr integer := extract(year FROM (now() AT TIME ZONE 'Europe/Berlin'))::integer;
  v_treffer jsonb;
  v_geprueft integer;
  v_regeln integer := 0;
BEGIN

  -- ═════════════════════════════════════════════════════════════════════
  -- OBJ: Stammdaten
  -- ═════════════════════════════════════════════════════════════════════

  /*
   * O1. Adresse unvollstaendig.
   * Leer, ohne Strassennamen (kein Buchstabenblock aus drei Zeichen), ohne
   * Hausnummer (keine Ziffer) oder ohne Ort. Fall "Crailsheim": Adresse "9a".
   * Die Adresse steht im Exposé und im Kaufvertragsentwurf.
   */
  BEGIN
    SELECT count(*) INTO v_geprueft
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             CASE
               WHEN btrim(coalesce(o.adresse, '')) = '' THEN 'Straße und Hausnummer fehlen'
               WHEN btrim(coalesce(o.adresse, '')) !~ '[A-Za-zÄÖÜäöüß]{3,}'
                 THEN 'Adresse „' || btrim(o.adresse) || '“ enthält keinen Straßennamen'
               WHEN btrim(coalesce(o.adresse, '')) !~ '[0-9]'
                 THEN 'Adresse „' || btrim(o.adresse) || '“ ohne Hausnummer'
               ELSE 'Ort fehlt'
             END)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND (btrim(coalesce(o.adresse, '')) = ''
            OR btrim(coalesce(o.adresse, '')) !~ '[A-Za-zÄÖÜäöüß]{3,}'
            OR btrim(coalesce(o.adresse, '')) !~ '[0-9]'
            OR btrim(coalesce(o.ort, '')) = '');

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_adresse', 'OBJ', 'warnung',
      v_geprueft, v_treffer, 'Adresse unvollständig');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_adresse', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * O2. PLZ fehlt oder ist nicht fuenfstellig.
   * Fall "Taubestrasse 18": Feld leer, der Titel nennt 04347.
   */
  BEGIN
    SELECT count(*) INTO v_geprueft
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             CASE WHEN btrim(coalesce(o.plz, '')) = '' THEN 'PLZ fehlt'
                  ELSE 'PLZ „' || btrim(o.plz) || '“ ist nicht fünfstellig' END
             || CASE WHEN r.m5 IS NOT NULL THEN ', im Titel steht ' || r.m5[1] ELSE '' END)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      CROSS JOIN LATERAL (
        SELECT regexp_match(coalesce(o.titel, ''), '(?:^|[ ,])([0-9]{5})(?:[ ,)]|$)') AS m5
      ) r
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND btrim(coalesce(o.plz, '')) !~ '^[0-9]{5}$';

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_plz', 'OBJ', 'warnung',
      v_geprueft, v_treffer, 'PLZ fehlt oder ist nicht fünfstellig');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_plz', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * O3. PLZ im Titel passt nicht zum Feld.
   * Zwei Faelle: Der Titel nennt eine fuenfstellige PLZ, die vom gueltigen
   * Feld abweicht (Germering: 82210 gegen 82110). Oder der Titel nennt eine
   * VIERSTELLIGE Zahl direkt vor dem Ortsnamen des Feldes (Delitzsch: "0409
   * Delitzsch"). Die zweite Bedingung verlangt den Ortsnamen, damit eine
   * Jahreszahl wie "2026 Neubau" nicht anschlaegt.
   */
  BEGIN
    SELECT count(*) INTO v_geprueft
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             CASE
               WHEN r.m5 IS NOT NULL AND btrim(coalesce(o.plz, '')) ~ '^[0-9]{5}$' AND r.m5[1] <> btrim(o.plz)
                 THEN 'Titel nennt PLZ ' || r.m5[1] || ', im Feld steht ' || btrim(o.plz)
               ELSE 'Titel nennt „' || r.m4[1] || '“ vor dem Ort, nur vierstellig. Im Feld steht '
                    || coalesce(nullif(btrim(o.plz), ''), 'keine PLZ')
             END)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      CROSS JOIN LATERAL (
        SELECT regexp_match(coalesce(o.titel, ''), '(?:^|[ ,])([0-9]{5})(?:[ ,)]|$)') AS m5,
               regexp_match(coalesce(o.titel, ''), '(?:^|[ ,])([0-9]{4}) +([^ ,/()0-9][^ ,/()]*)') AS m4
      ) r
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND (
         (r.m5 IS NOT NULL AND btrim(coalesce(o.plz, '')) ~ '^[0-9]{5}$' AND r.m5[1] <> btrim(o.plz))
         OR (r.m4 IS NOT NULL AND btrim(coalesce(o.ort, '')) <> ''
             AND lower(r.m4[2]) = lower(split_part(btrim(o.ort), ' ', 1)))
       );

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_titel_plz', 'OBJ', 'warnung',
      v_geprueft, v_treffer, 'PLZ im Titel weicht vom Feld ab');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_titel_plz', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * O4. Ort im Titel passt nicht zum Feld.
   * Verglichen wird das Wort direkt hinter einer fuenfstelligen PLZ im
   * Titel. Zusaetze wie "Halle (Saale)" oder "Storkow (Mark)" zaehlen als
   * gleich, weil der Vergleich in beide Richtungen auf Enthaltensein prueft.
   */
  BEGIN
    SELECT count(*) INTO v_geprueft
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             'Titel nennt den Ort „' || r.m[1] || '“, im Feld steht „' || btrim(o.ort) || '“')), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      CROSS JOIN LATERAL (
        SELECT regexp_match(coalesce(o.titel, ''), '(?:^|[ ,])[0-9]{5} +([^ ,/()0-9][^ ,/()]*)') AS m
      ) r
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND r.m IS NOT NULL
       AND btrim(coalesce(o.ort, '')) <> ''
       AND strpos(lower(btrim(o.ort)), lower(r.m[1])) = 0
       AND strpos(lower(r.m[1]), lower(split_part(btrim(o.ort), ' ', 1))) = 0;

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_titel_ort', 'OBJ', 'warnung',
      v_geprueft, v_treffer, 'Ort im Titel weicht vom Feld ab');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_titel_ort', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * O5. Baujahr fehlt oder ist unplausibel.
   * `global_baujahr` ist das einzige Baujahrfeld, auch bei Einzelwohnungen
   * (src/lib/objekteStore.ts:700). Unplausibel: vor 1800 oder mehr als fuenf
   * Jahre in der Zukunft. Das Baujahr traegt die AfA und die Restnutzungsdauer.
   */
  BEGIN
    SELECT count(*) INTO v_geprueft
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             CASE WHEN coalesce(o.global_baujahr, 0) = 0 THEN 'Baujahr fehlt'
                  ELSE 'Baujahr ' || o.global_baujahr || ' ist unplausibel' END)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND (coalesce(o.global_baujahr, 0) = 0
            OR o.global_baujahr < 1800
            OR o.global_baujahr > v_jahr + 5);

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_baujahr', 'OBJ', 'warnung',
      v_geprueft, v_treffer, 'Baujahr fehlt oder ist unplausibel');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_baujahr', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * O6. Einheiten zum Verkauf ohne Flaeche oder ohne Kaufpreis.
   * Ohne beides gibt es keinen Quadratmeterpreis, keine Rendite und keine
   * Kalkulation. Verkaufte Einheiten und die Summenzeile bleiben draussen.
   */
  BEGIN
    SELECT count(DISTINCT o.id) INTO v_geprueft
      FROM public.objekte o
      JOIN public.wohnungen w ON w.objekt_id::text = o.id::text
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta);

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             concat_ws(', ',
               CASE WHEN x.ohne_flaeche > 0 THEN x.ohne_flaeche || ' ohne Fläche' END,
               CASE WHEN x.ohne_preis > 0 THEN x.ohne_preis || ' ohne Kaufpreis' END),
             x.nummern)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      JOIN LATERAL (
        SELECT count(*) AS anzahl,
               count(*) FILTER (WHERE coalesce(w.groesse, 0) <= 0) AS ohne_flaeche,
               count(*) FILTER (WHERE coalesce(w.vk_gesamt, 0) <= 0) AS ohne_preis,
               array_agg(coalesce(nullif(btrim(w.we_nr), ''), 'ohne Nummer') ORDER BY w.we_nr) AS nummern
          FROM public.wohnungen w
         WHERE w.objekt_id::text = o.id::text
           AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
           AND lower(coalesce(w.status, '')) <> 'verkauft'
           AND (coalesce(w.groesse, 0) <= 0 OR coalesce(w.vk_gesamt, 0) <= 0)
      ) x ON x.anzahl > 0
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_einheit_kerndaten', 'OBJ', 'warnung',
      v_geprueft, v_treffer, 'Einheiten ohne Fläche oder Kaufpreis');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_einheit_kerndaten', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * O7. Einheiten zum Verkauf ohne Miete.
   * Ohne Miete keine Rendite und keine Kalkulation. Auch Neubau hat hier
   * eine geplante oder garantierte Miete (Stichprobe Crailsheim). Verkaufte
   * Einheiten ohne Miete meldet Aftersales (A1).
   */
  BEGIN
    SELECT count(DISTINCT o.id) INTO v_geprueft
      FROM public.objekte o
      JOIN public.wohnungen w ON w.objekt_id::text = o.id::text
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
       AND lower(coalesce(w.status, '')) <> 'verkauft';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             x.anzahl || ' Einheit' || CASE WHEN x.anzahl = 1 THEN '' ELSE 'en' END || ' zum Verkauf ohne Miete',
             x.nummern)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      JOIN LATERAL (
        SELECT count(*) AS anzahl,
               array_agg(coalesce(nullif(btrim(w.we_nr), ''), 'ohne Nummer') ORDER BY w.we_nr) AS nummern
          FROM public.wohnungen w
         WHERE w.objekt_id::text = o.id::text
           AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
           AND lower(coalesce(w.status, '')) <> 'verkauft'
           AND coalesce(w.miete_gesamt, 0) <= 0
      ) x ON x.anzahl > 0
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_einheit_miete', 'OBJ', 'warnung',
      v_geprueft, v_treffer, 'Einheiten zum Verkauf ohne Miete');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_einheit_miete', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * O8. Rendite fehlt oder passt nicht zu Miete und Kaufpreis.
   * Die Rendite einer Einheit ist ueberall Miete mal zwoelf durch Kaufpreis
   * (Import: investagon-import/index.ts:2009, Handanlage: ObjektNeu.tsx:209).
   * Angeschlagen wird bei 0, bei mehr als 15 Prozent oder bei mehr als einem
   * halben Prozentpunkt Abstand zur Rechnung. Das halbe Prozent faengt die
   * Rundung ab, die bei einer von Hand eingegebenen Rendite entsteht.
   */
  BEGIN
    SELECT count(DISTINCT o.id) INTO v_geprueft
      FROM public.objekte o
      JOIN public.wohnungen w ON w.objekt_id::text = o.id::text
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
       AND coalesce(w.vk_gesamt, 0) > 0 AND coalesce(w.miete_gesamt, 0) > 0;

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             x.anzahl || ' Einheit' || CASE WHEN x.anzahl = 1 THEN '' ELSE 'en' END
               || ' mit Rendite, die fehlt oder nicht zu Miete mal zwölf durch Kaufpreis passt',
             x.nummern)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      JOIN LATERAL (
        SELECT count(*) AS anzahl,
               array_agg(coalesce(nullif(btrim(w.we_nr), ''), 'ohne Nummer') ORDER BY w.we_nr) AS nummern
          FROM public.wohnungen w
         WHERE w.objekt_id::text = o.id::text
           AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
           AND coalesce(w.vk_gesamt, 0) > 0
           AND coalesce(w.miete_gesamt, 0) > 0
           AND (coalesce(w.rendite, 0) <= 0
                OR w.rendite > 15
                OR abs(w.rendite - (w.miete_gesamt * 1200.0 / w.vk_gesamt)) > 0.5)
      ) x ON x.anzahl > 0
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_rendite', 'OBJ', 'warnung',
      v_geprueft, v_treffer, 'Rendite fehlt oder ist unplausibel');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_rendite', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * O9. Preisspanne am Objekt passt nicht zu den Einheiten.
   * Import (investagon-import/index.ts:695) und Handanlage
   * (ObjektNeu.tsx:2094) setzen die Spanne als kleinsten und groessten
   * Kaufpreis aller Einheiten mit Preis. Abweichung ab 1 Prozent, mindestens
   * 1.000 Euro. Globalobjekte bleiben draussen, dort ist die Spanne der
   * Gesamtpreis.
   */
  BEGIN
    SELECT count(*) INTO v_geprueft
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT coalesce(o.global_objekt, false)
       AND EXISTS (SELECT 1 FROM public.wohnungen w
                    WHERE w.objekt_id::text = o.id::text AND coalesce(w.vk_gesamt, 0) > 0);

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             'Objekt nennt ' || replace(to_char(round(coalesce(o.preis_von, 0)), 'FM999,999,999'), ',', '.')
               || ' bis ' || replace(to_char(round(coalesce(o.preis_bis, 0)), 'FM999,999,999'), ',', '.')
               || ' Euro, die Einheiten liegen bei '
               || replace(to_char(round(x.pmin), 'FM999,999,999'), ',', '.')
               || ' bis ' || replace(to_char(round(x.pmax), 'FM999,999,999'), ',', '.') || ' Euro')), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      JOIN LATERAL (
        SELECT count(*) AS n, min(w.vk_gesamt) AS pmin, max(w.vk_gesamt) AS pmax
          FROM public.wohnungen w
         WHERE w.objekt_id::text = o.id::text AND coalesce(w.vk_gesamt, 0) > 0
      ) x ON x.n > 0
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT coalesce(o.global_objekt, false)
       AND (coalesce(o.preis_von, 0) <= 0
            OR coalesce(o.preis_bis, 0) <= 0
            OR abs(o.preis_von - x.pmin) > greatest(1000, x.pmin * 0.01)
            OR abs(o.preis_bis - x.pmax) > greatest(1000, x.pmax * 0.01));

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_preisspanne', 'OBJ', 'hinweis',
      v_geprueft, v_treffer, 'Preisspanne am Objekt passt nicht zu den Einheiten');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_preisspanne', 'OBJ', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  -- ═════════════════════════════════════════════════════════════════════
  -- FIN: was eine Bank braucht
  -- ═════════════════════════════════════════════════════════════════════

  /*
   * F1. Einheiten zum Verkauf ohne jede Hausgeldangabe.
   * Gezaehlt wird jede Stelle, aus der das CRM ein Hausgeld liest
   * (`getHausgeldMonatForWohnung` und `getHausgeldNichtUmlegbarForWohnung`,
   * src/lib/objekteStore.ts:243 und :288): an der Einheit `hausgeldMonat`
   * oder `hausgeldNichtUmlagefaehigEuro` (das liefert Investagon als
   * operation_cost_landlord_apartment), am Objekt `global_hausgeld_monat`
   * oder die Werte in `meta.kalkulation` beziehungsweise `meta.kalk`. Erst
   * wenn keine davon etwas traegt, fehlt das Hausgeld wirklich.
   */
  BEGIN
    SELECT count(DISTINCT o.id) INTO v_geprueft
      FROM public.objekte o
      JOIN public.wohnungen w ON w.objekt_id::text = o.id::text
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
       AND lower(coalesce(w.status, '')) <> 'verkauft';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             x.anzahl || ' Einheit' || CASE WHEN x.anzahl = 1 THEN '' ELSE 'en' END
               || ' zum Verkauf ohne Hausgeld, weder an der Einheit noch am Objekt',
             x.nummern, 'ergaenzen')), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      JOIN LATERAL (
        SELECT count(*) AS anzahl,
               array_agg(coalesce(nullif(btrim(w.we_nr), ''), 'ohne Nummer') ORDER BY w.we_nr) AS nummern
          FROM public.wohnungen w
         WHERE w.objekt_id::text = o.id::text
           AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
           AND lower(coalesce(w.status, '')) <> 'verkauft'
           AND coalesce(public.kennzahl_zahl(w.meta->>'hausgeldMonat'), 0) <= 0
           AND coalesce(public.kennzahl_zahl(w.meta->>'hausgeldNichtUmlagefaehigEuro'), 0) <= 0
      ) x ON x.anzahl > 0
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND coalesce(o.global_hausgeld_monat, 0) <= 0
       AND coalesce(public.kennzahl_zahl(o.meta->'kalkulation'->>'hausgeldMonat'), 0) <= 0
       AND coalesce(public.kennzahl_zahl(o.meta->'kalk'->>'hausgeldMonat'), 0) <= 0
       AND coalesce(public.kennzahl_zahl(o.meta->'kalkulation'->>'hausgeldNichtUmlagefaehigEuro'), 0) <= 0
       AND coalesce(public.kennzahl_zahl(o.meta->'kalk'->>'hausgeldNichtUmlagefaehigEuro'), 0) <= 0;

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_hausgeld', 'FIN', 'warnung',
      v_geprueft, v_treffer, 'Hausgeld fehlt');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_hausgeld', 'FIN', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * F2. Keine Instandhaltungsruecklage hinterlegt.
   * Weder `meta.ruecklageWeg` am Objekt noch `meta.ruecklageWohnung` an einer
   * Einheit (Pflegedialog ObjektNeu.tsx:2126 und :2020). Investagon liefert
   * dieses Feld nicht (investagon-import/mapping.ts, `einheitMeta`: "Monats-
   * ruecklagen sind kein Ruecklagenbestand"). Wenn es bei fast allen fehlt,
   * wird daraus der Sammelbefund.
   */
  BEGIN
    SELECT count(DISTINCT o.id) INTO v_geprueft
      FROM public.objekte o
      JOIN public.wohnungen w ON w.objekt_id::text = o.id::text
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta);

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             'Keine Instandhaltungsrücklage, weder am Objekt noch an einer Einheit', NULL, 'crm')), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND EXISTS (SELECT 1 FROM public.wohnungen w
                    WHERE w.objekt_id::text = o.id::text
                      AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta))
       AND coalesce(public.kennzahl_zahl(o.meta->>'ruecklageWeg'), 0) <= 0
       AND NOT EXISTS (SELECT 1 FROM public.wohnungen w
                        WHERE w.objekt_id::text = o.id::text
                          AND coalesce(public.kennzahl_zahl(w.meta->>'ruecklageWohnung'), 0) > 0);

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_ruecklage', 'FIN', 'hinweis',
      v_geprueft, v_treffer, 'Rücklage fehlt');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_ruecklage', 'FIN', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * F3. Pflichtunterlagen fuer die Bank fehlen.
   *
   * Vier Gruppen aus supabase/functions/_shared/dokument-gruppen.ts:
   * Teilungserklaerung, Energie (Energieausweis), Flaechen
   * (Wohnflaechenberechnung), WEG und Hausgeld (Wirtschaftsplan, Abrechnung,
   * Protokoll). Eine Gruppe gilt als vorhanden, wenn
   *   - eine Unterlage mit hinterlegter Datei (url nicht leer) am Objekt oder
   *     an einer seiner Einheiten ein Stichwort der Gruppe im Titel nennt
   *     (`STICHWORT_REGELN`, woertlich uebernommen; wie
   *     `titelNenntOberbegriff` irgendwo im Titel, nicht nur als erster
   *     Treffer), oder
   *   - die Investagon-Rohdaten des Objekts oder einer Einheit eine Datei mit
   *     der passenden Kategorie fuehren (`OBERBEGRIFF_JE_KATEGORIE`). So
   *     zaehlen auch "2025-2009-TE" und "WE01 WFLB", die kein Stichwort
   *     tragen, aber von Investagon eingeordnet sind.
   * Die zehn leeren Platzhalter jedes neuen Objekts (url = '',
   * src/lib/objekteStore.ts:310) zaehlen nicht.
   *
   * Bei Neubau entfaellt die WEG-Gruppe: Eine neue Gemeinschaft hat noch
   * keine Abrechnung und kein Protokoll. Neubau heisst: Zustand oder Badge
   * nennt "Neubau", oder das Baujahr ist das laufende Jahr oder spaeter.
   *
   * WER IN dokument-gruppen.ts EIN STICHWORT ODER EINE KATEGORIE AENDERT,
   * AENDERT ES HIER MIT.
   */
  BEGIN
    SELECT count(*) INTO v_geprueft
      FROM public.objekte o
     WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben';

    WITH namen AS (
      SELECT d.objekt_id::text AS oid, public.nachtpruefung_normtext(d.name) AS n
        FROM public.objekt_dokumente d
       WHERE coalesce(d.url, '') <> ''
      UNION ALL
      SELECT w.objekt_id::text, public.nachtpruefung_normtext(wd.name)
        FROM public.wohnungs_dokumente wd
        JOIN public.wohnungen w ON w.id::text = wd.wohnung_id::text
       WHERE coalesce(wd.url, '') <> ''
    ),
    kategorien AS (
      SELECT o.id::text AS oid, f->>'category' AS k
        FROM public.objekte o
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(o.meta->'investagonRaw'->'files') = 'array'
               THEN o.meta->'investagonRaw'->'files' ELSE '[]'::jsonb END) AS f
       WHERE coalesce(f->>'filename', '') <> ''
      UNION ALL
      SELECT w.objekt_id::text, f->>'category'
        FROM public.wohnungen w
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(w.meta->'investagonRaw'->'files') = 'array'
               THEN w.meta->'investagonRaw'->'files' ELSE '[]'::jsonb END) AS f
       WHERE coalesce(f->>'filename', '') <> ''
    ),
    stand AS (
      SELECT o.id, o.titel, o.meta,
             (EXISTS (SELECT 1 FROM namen x WHERE x.oid = o.id::text
                        AND x.n ~ '(teilungserklaerung|aufteilungsplan|abgeschlossenheit|gemeinschaftsordnung)')
              OR EXISTS (SELECT 1 FROM kategorien k WHERE k.oid = o.id::text
                           AND k.k = 'declaration_of_division')) AS hat_te,
             (EXISTS (SELECT 1 FROM namen x WHERE x.oid = o.id::text
                        AND x.n ~ '(energieausweis|energiepass|energiebedarf|energieverbrauch|energieeffizienz)')
              OR EXISTS (SELECT 1 FROM kategorien k WHERE k.oid = o.id::text
                           AND k.k = 'energy_certificate')) AS hat_energie,
             (EXISTS (SELECT 1 FROM namen x WHERE x.oid = o.id::text
                        AND (x.n ~ '(wohnflaeche|flaechenberechnung|flaechenaufstellung|nutzflaeche)'
                             OR x.n ~ '(^| )wfl( |$|[0-9])'))
              OR EXISTS (SELECT 1 FROM kategorien k WHERE k.oid = o.id::text
                           AND k.k = 'living_area_calculation')) AS hat_flaeche,
             (EXISTS (SELECT 1 FROM namen x WHERE x.oid = o.id::text
                        AND (x.n ~ '(wirtschaftsplan|hausgeld|jahresabrechnung|eigentuemerversammlung|beschluss|ruecklage|verwaltervertrag|betriebskosten|nebenkosten|weg protokoll|weg abrechnung)'
                             OR x.n ~ '(^| )etv( |$|[0-9])'))
              OR EXISTS (SELECT 1 FROM kategorien k WHERE k.oid = o.id::text
                           AND k.k IN ('economic_plan', 'settlements'))) AS hat_weg,
             (lower(coalesce(o.global_zustand, '') || ' ' || coalesce(o.badge, '')) LIKE '%neubau%'
              OR coalesce(o.global_baujahr, 0) >= v_jahr) AS neubau
        FROM public.objekte o
       WHERE coalesce(o.sichtbar, false) AND coalesce(o.status, 'freigegeben') = 'freigegeben'
    )
    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(s.id, s.titel, s.meta,
             'Es fehlt: ' || array_to_string(array_remove(ARRAY[
               CASE WHEN NOT s.hat_te THEN 'Teilungserklärung' END,
               CASE WHEN NOT s.hat_energie THEN 'Energieausweis' END,
               CASE WHEN NOT s.hat_flaeche THEN 'Wohnflächenberechnung' END,
               CASE WHEN NOT s.hat_weg AND NOT s.neubau THEN 'WEG-Unterlagen (Wirtschaftsplan, Abrechnung oder Protokoll)' END
             ], NULL), ', '),
             NULL, 'unterlage')), '[]'::jsonb)
      INTO v_treffer
      FROM stand s
     WHERE NOT s.hat_te OR NOT s.hat_energie OR NOT s.hat_flaeche OR (NOT s.hat_weg AND NOT s.neubau);

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_unterlagen', 'FIN', 'warnung',
      v_geprueft, v_treffer, 'Pflichtunterlagen für die Bank fehlen');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_unterlagen', 'FIN', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  -- ═════════════════════════════════════════════════════════════════════
  -- AS: Bestand und Vermietung
  -- ═════════════════════════════════════════════════════════════════════

  /*
   * A1. Verkaufte Einheiten ohne Miete.
   * Nach dem Kauf braucht der Kunde die Miete fuer Anlage V, Quartals-Check
   * und jede Aftersales-Beratung. Umfang: alle freigegebenen Objekte, auch
   * ausgeblendete.
   */
  BEGIN
    SELECT count(DISTINCT o.id) INTO v_geprueft
      FROM public.objekte o
      JOIN public.wohnungen w ON w.objekt_id::text = o.id::text
     WHERE coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
       AND lower(coalesce(w.status, '')) = 'verkauft';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             x.anzahl || ' verkaufte Einheit' || CASE WHEN x.anzahl = 1 THEN '' ELSE 'en' END || ' ohne Miete',
             x.nummern)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      JOIN LATERAL (
        SELECT count(*) AS anzahl,
               array_agg(coalesce(nullif(btrim(w.we_nr), ''), 'ohne Nummer') ORDER BY w.we_nr) AS nummern
          FROM public.wohnungen w
         WHERE w.objekt_id::text = o.id::text
           AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
           AND lower(coalesce(w.status, '')) = 'verkauft'
           AND coalesce(w.miete_gesamt, 0) <= 0
      ) x ON x.anzahl > 0
     WHERE coalesce(o.status, 'freigegeben') = 'freigegeben';

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_verkauft_ohne_miete', 'AS', 'warnung',
      v_geprueft, v_treffer, 'Verkaufte Einheiten ohne Miete');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_verkauft_ohne_miete', 'AS', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * A2. Als vermietet markiert, aber ohne Miete.
   * Ein Widerspruch in sich. Verkaufte Einheiten stehen schon unter A1 und
   * werden hier nicht doppelt gezaehlt.
   */
  BEGIN
    SELECT count(DISTINCT o.id) INTO v_geprueft
      FROM public.objekte o
      JOIN public.wohnungen w ON w.objekt_id::text = o.id::text
     WHERE coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
       AND coalesce(w.vermietet, false)
       AND lower(coalesce(w.status, '')) <> 'verkauft';

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             x.anzahl || ' Einheit' || CASE WHEN x.anzahl = 1 THEN '' ELSE 'en' END || ' als vermietet markiert, aber ohne Miete',
             x.nummern)), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
      JOIN LATERAL (
        SELECT count(*) AS anzahl,
               array_agg(coalesce(nullif(btrim(w.we_nr), ''), 'ohne Nummer') ORDER BY w.we_nr) AS nummern
          FROM public.wohnungen w
         WHERE w.objekt_id::text = o.id::text
           AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
           AND coalesce(w.vermietet, false)
           AND lower(coalesce(w.status, '')) <> 'verkauft'
           AND coalesce(w.miete_gesamt, 0) <= 0
      ) x ON x.anzahl > 0
     WHERE coalesce(o.status, 'freigegeben') = 'freigegeben';

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_vermietet_ohne_miete', 'AS', 'warnung',
      v_geprueft, v_treffer, 'Vermietet, aber ohne Miete');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_vermietet_ohne_miete', 'AS', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  /*
   * A3. Keine Verwaltung hinterlegt, bei Objekten mit verkauften Einheiten.
   * Weder `meta.verwaltungsart` (ObjektNeu.tsx:2122; "keine" ist eine
   * bewusste Angabe und zaehlt als gepflegt) noch Verwaltungskosten fuer WEG
   * oder SEV am Objekt (`verwaltungskostenWeg`, `verwaltungskostenSev`) oder
   * an einer Einheit (`verwaltungWegMonat`, `verwaltungSevMonat`, die zweite
   * liefert Investagon als property_management_fee_sev). Ohne Verwaltung
   * weiss der Bestandskunde nicht, an wen er sich wendet.
   */
  BEGIN
    SELECT count(*) INTO v_geprueft
      FROM public.objekte o
     WHERE coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND EXISTS (SELECT 1 FROM public.wohnungen w
                    WHERE w.objekt_id::text = o.id::text
                      AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
                      AND lower(coalesce(w.status, '')) = 'verkauft');

    SELECT coalesce(jsonb_agg(public.nachtpruefung_objektdaten_eintrag(o.id, o.titel, o.meta,
             'Keine Verwaltung hinterlegt, weder Verwaltungsart noch Kosten für WEG oder SEV', NULL, 'crm')), '[]'::jsonb)
      INTO v_treffer
      FROM public.objekte o
     WHERE coalesce(o.status, 'freigegeben') = 'freigegeben'
       AND EXISTS (SELECT 1 FROM public.wohnungen w
                    WHERE w.objekt_id::text = o.id::text
                      AND NOT public.nachtpruefung_globalzeile(w.we_nr, w.etage, w.meta)
                      AND lower(coalesce(w.status, '')) = 'verkauft')
       AND btrim(coalesce(o.meta->>'verwaltungsart', '')) = ''
       AND coalesce(public.kennzahl_zahl(o.meta->>'verwaltungskostenWeg'), 0) <= 0
       AND coalesce(public.kennzahl_zahl(o.meta->>'verwaltungskostenSev'), 0) <= 0
       AND NOT EXISTS (SELECT 1 FROM public.wohnungen w
                        WHERE w.objekt_id::text = o.id::text
                          AND (coalesce(public.kennzahl_zahl(w.meta->>'verwaltungWegMonat'), 0) > 0
                               OR coalesce(public.kennzahl_zahl(w.meta->>'verwaltungSevMonat'), 0) > 0));

    PERFORM public.nachtpruefung_objektdaten_schreiben(_lauf, 'objektdaten_verwaltung', 'AS', 'warnung',
      v_geprueft, v_treffer, 'Verwaltung fehlt');
    v_regeln := v_regeln + 1;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.nachtpruefung_objektdaten_ausfall(_lauf, 'objektdaten_verwaltung', 'AS', SQLERRM);
    v_regeln := v_regeln + 1;
  END;

  RETURN v_regeln;
END;
$fn$;

REVOKE ALL ON FUNCTION public.nachtpruefung_objektdaten(timestamptz) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.nachtpruefung_objektdaten(timestamptz) IS
  'Teilpruefung des Nachtwaechters: fuenfzehn Regeln zu Unstimmigkeiten in den '
  'Objektdaten, je Bereich OBJ, FIN, AS. Jede Regel schreibt eine Zeile mit '
  'Bereich; Treffer tragen neu gegen bestehend. Ohne Personendaten.';

-- ---------------------------------------------------------------------------
-- 4) Der Nachtlauf, neue Fassung
-- ---------------------------------------------------------------------------
--
-- Bloecke 1 bis 10 WORTGETREU aus 20260806143342_5bc80311-...sql, der bis
-- heute juengsten Fassung. Neu ist allein Block 11 vor dem RETURN.

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

  -- 11. Unstimmigkeiten in den Objektdaten, je Bereich OBJ, FIN, AS.
  -- Jede der fuenfzehn Regeln faengt ihre eigenen Fehler ab. Dieser Block
  -- faengt nur den Fall, dass die Teilpruefung selbst fehlt oder schon beim
  -- Start scheitert, etwa weil die Spalte `bereich` noch nicht angelegt ist.
  BEGIN
    v_befunde := v_befunde + public.nachtpruefung_objektdaten(v_lauf);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
    VALUES (v_lauf, 'objektdaten', 'fehler', 1,
            'Die Prüfung der Objektdaten ist ausgefallen: ' || SQLERRM);
    v_befunde := v_befunde + 1;
  END;

  RETURN v_befunde;
END;
$fn$;

-- Auch PUBLIC: Ohne diese Angabe behielte jede Rolle das voreingestellte
-- Ausfuehrungsrecht, und der Lauf liesse sich von aussen beliebig oft starten.
REVOKE ALL ON FUNCTION public.nachtpruefung_lauf() FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Kennzahlen je Bereich fuer das 8-Uhr-Briefing
-- ---------------------------------------------------------------------------
--
-- Zwei Zahlen je Bereich OBJ, FIN und AS, beide aus dem juengsten Lauf der
-- Objektpruefung:
--   objektdaten_unstimmig  wie viele verschiedene Objekte einzeln benannt sind
--   objektdaten_neu        wie viele Treffer seit dem vorigen Lauf neu sind
-- Sammelbefunde haben keine Einzelliste und zaehlen deshalb nicht mit. Ist der
-- juengste Lauf aelter als 26 Stunden, wird NICHTS geschrieben: Eine alte Zahl
-- saehe aus wie eine heutige. Das Briefing sagt dann "keine Daten".
--
-- Eigene Funktion statt Erweiterung von `kennzahlen_tagesstand_zusatz`, aus
-- demselben Grund, aus dem jene neben `kennzahlen_tagesstand_lauf` steht:
-- tausend Zeilen abzuschreiben, um einen Block anzuhaengen, ist das groessere
-- Risiko.

CREATE OR REPLACE FUNCTION public.kennzahlen_tagesstand_objektdaten()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_lauf timestamptz;
  v_bereich text;
  v_zahl bigint;
  v_neu bigint;
  v_geschrieben integer := 0;
BEGIN
  SELECT max(b.lauf_at) INTO v_lauf
    FROM public.nachtpruefung_befunde b
   WHERE left(b.pruefung, 12) = 'objektdaten_';

  IF v_lauf IS NULL OR v_lauf < now() - interval '26 hours' THEN
    RAISE NOTICE 'Objektdaten: kein Lauf der letzten 26 Stunden, keine Kennzahl geschrieben.';
    RETURN 0;
  END IF;

  FOREACH v_bereich IN ARRAY ARRAY['OBJ', 'FIN', 'AS'] LOOP
    BEGIN
      SELECT count(DISTINCT e->>'objekt_id'),
             count(*) FILTER (WHERE (e->>'neu')::boolean)
        INTO v_zahl, v_neu
        FROM public.nachtpruefung_befunde b
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(b.beispiele) = 'array' THEN b.beispiele ELSE '[]'::jsonb END) AS e
       WHERE b.lauf_at = v_lauf
         AND b.bereich = v_bereich
         AND left(b.pruefung, 12) = 'objektdaten_'
         AND b.schwere <> 'fehler';

      PERFORM public.kennzahl_schreiben(v_tag, v_bereich, 'objektdaten_unstimmig', coalesce(v_zahl, 0));
      PERFORM public.kennzahl_schreiben(v_tag, v_bereich, 'objektdaten_neu', coalesce(v_neu, 0));
      v_geschrieben := v_geschrieben + 2;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '%.objektdaten uebersprungen: %', v_bereich, SQLERRM;
    END;
  END LOOP;

  /*
    Miriams Zahl ohne die Objektdaten. OPS.nachtpruefung_befunde_offen zaehlt
    im ersten Teil des Laufs jede Pruefzeile mit Treffern. Die Objektbefunde
    gehoeren aber zu OBJ, FIN und AS und stehen dort schon als eigene Zahl;
    bei Miriam haetten sie ihren Wert einmalig um bis zu 15 erhoeht, ohne dass
    ein Ablauf haengt. Entschieden von Christian am 24.09.2026. Dieser dritte
    Teil laeuft nach dem ersten und ueberschreibt die Zahl desselben Tages.
  */
  BEGIN
    SELECT count(*) INTO v_zahl
      FROM public.nachtpruefung_befunde b
     WHERE b.lauf_at = (SELECT max(lauf_at) FROM public.nachtpruefung_befunde)
       AND b.anzahl > 0
       AND b.bereich IS NULL;
    PERFORM public.kennzahl_schreiben(v_tag, 'OPS', 'nachtpruefung_befunde_offen', coalesce(v_zahl, 0));
    v_geschrieben := v_geschrieben + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'OPS.nachtpruefung_befunde_offen ohne Objektdaten uebersprungen: %', SQLERRM;
  END;

  RETURN v_geschrieben;
END;
$$;

REVOKE ALL ON FUNCTION public.kennzahlen_tagesstand_objektdaten() FROM public, anon, authenticated;

COMMENT ON FUNCTION public.kennzahlen_tagesstand_objektdaten() IS
  'Dritter Teil des naechtlichen Kennzahlenlaufs: je Bereich OBJ, FIN, AS die '
  'Zahl der Objekte mit unstimmigen Daten und der neuen Treffer, gelesen aus '
  'dem juengsten Lauf von nachtpruefung_objektdaten.';

-- Der Zeitplan ruft jetzt drei Teile. Uhrzeit unveraendert 04:10 UTC, also
-- nach dem Nachtwaechter (03:00 UTC). pg_cron fuehrt die Anweisungen
-- nacheinander aus.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kennzahlen-tagesstand') THEN
      PERFORM cron.unschedule('kennzahlen-tagesstand');
    END IF;
    PERFORM cron.schedule(
      'kennzahlen-tagesstand',
      '10 4 * * *',
      'SELECT public.kennzahlen_tagesstand_lauf(); SELECT public.kennzahlen_tagesstand_zusatz(); SELECT public.kennzahlen_tagesstand_objektdaten();'
    );
  ELSE
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer den Kennzahlen-Tagesstand nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Einmal laufen lassen
-- ---------------------------------------------------------------------------
--
-- Ein voller Nachtlauf, damit gleich ein Stand vorliegt und sich zeigt, ob
-- alle Regeln mit dem echten Schema zurechtkommen. Danach die Kennzahlen des
-- heutigen Tages. Beim naechsten Nachtlauf vergleicht "neu" schon mit
-- diesem Lauf, die erste Morgenmail nennt also nur echte Neuzugaenge.

SELECT public.nachtpruefung_lauf() AS pruefungen_geschrieben;
SELECT public.kennzahlen_tagesstand_objektdaten() AS kennzahlen_geschrieben;

-- ---------------------------------------------------------------------------
-- 7) Pruefabfrage, nur lesend
-- ---------------------------------------------------------------------------
--
-- Erwartet: fuenfzehn Zeilen, je Regel eine, mit Bereich OBJ (9), FIN (3)
-- oder AS (3). Steht bei einer Schwere "fehler", ist die Regel am echten
-- Schema gescheitert; der Grund steht in der Meldung. Die letzte Spalte zeigt
-- die ersten drei Objekttitel.

SELECT b.bereich,
       b.pruefung,
       b.schwere,
       b.anzahl,
       (SELECT count(*) FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(b.beispiele) = 'array' THEN b.beispiele ELSE '[]'::jsonb END) e
         WHERE (e->>'neu')::boolean) AS neu,
       b.meldung,
       (SELECT string_agg(e->>'titel', ' | ')
          FROM (SELECT e FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(b.beispiele) = 'array' THEN b.beispiele ELSE '[]'::jsonb END) e
                LIMIT 3) t) AS erste_objekte
  FROM public.nachtpruefung_befunde b
 WHERE b.lauf_at = (SELECT max(lauf_at) FROM public.nachtpruefung_befunde)
   AND (left(b.pruefung, 11) = 'objektdaten' OR b.bereich IS NOT NULL)
 ORDER BY b.bereich, b.pruefung;
