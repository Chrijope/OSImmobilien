-- ===========================================================================
-- Die Partnersuche nimmt die Kennung, nicht den Namen
-- ===========================================================================
--
-- `investment_partner_id` sucht den zustaendigen Partner bisher zuerst ueber
-- den Freitext `kontakte.berater`, und zwar exakt:
--
--     SELECT p.id INTO _partner FROM public.profiles p
--      WHERE p.name = _berater LIMIT 1;
--
-- Findet das nichts, faellt die Funktion auf `kontakte.zustaendig_id`
-- zurueck. Ist das eine andere Person, wird der Partner am Investment falsch
-- gesetzt, und an diesem Partner haengt der festgeschriebene Provisionssatz.
--
-- Das ist derselbe Fehler zum dritten Mal. Er traf schon die Suche nach
-- Hermann Vogl (gesucht wurde "hermann vogel") und die Einladungsmail, die
-- Nutzer ueber `u.name === e.berater` zuordnete. Beides ist behoben. Ein
-- Kontakt traegt den Partner zweimal: als Text in `berater` und als echte
-- Kennung in `zustaendig_id`. Die Kennung ist verlaesslich, der Name nicht.
--
-- WAS SICH AENDERT
--
--   1. Die Reihenfolge dreht sich um. Zuerst `zustaendig_id`, der Name ist
--      nur noch der Rueckfall fuer Kontakte ohne Kennung.
--   2. Der Namensvergleich wird tolerant: Gross- und Kleinschreibung egal,
--      Randleerzeichen weg, mehrfache Leerzeichen im Namen auf eines
--      zusammengezogen.
--   3. Passt der Name auf MEHRERE Profile, gilt er als nicht gefunden. Kein
--      `LIMIT 1` mehr. Begruendung: Bei Zustaendigkeiten ist ein falscher
--      Treffer schlimmer als kein Treffer. Wer geraten zugeordnet wird,
--      bekommt still den Provisionssatz eines Fremden festgeschrieben, und
--      das faellt erst bei der Abrechnung auf. Kein Treffer dagegen heisst
--      nur, dass der Satz nicht festgeschrieben wird, und das vermerkt der
--      Trigger sichtbar als `kein_zustaendiger_partner`. Genau so haelt es
--      `findeBeraterNachName` in
--      `supabase/functions/_shared/berater-namensabgleich.ts` schon fuer die
--      Leadzuordnung. Die Regel steht damit an beiden Orten gleich.
--
-- WAS SICH NICHT AENDERT
--
-- Diese Migration ruehrt KEINE Daten an. Sie ersetzt nur Funktionen und ist
-- beliebig oft wiederholbar. Bereits festgeschriebene Provisionssaetze
-- bleiben unveraendert stehen; der Trigger wirkt nur beim Anlegen eines
-- Investments. Ob im Altbestand etwas rueckwirkend zu berichtigen ist,
-- entscheidet Christian nach dem Ergebnis von
-- `supabase/migrations-inbox/95_BERATERNAMEN_PRUEFEN.sql`.
--
-- Diese Datei setzt die uuid-Fassung aus 20260909120000 voraus und ersetzt
-- deren `investment_partner_id`. Der Trigger selbst bleibt unberuehrt.

-- ---------------------------------------------------------------------------
-- 1) Die Vergleichsform eines Namens, an einer Stelle festgelegt
-- ---------------------------------------------------------------------------
--
-- SQL-Abbild von `normalisiereBeraterName` aus
-- `supabase/functions/_shared/berater-namensabgleich.ts`. Aendert sich die
-- Regel dort, muss eine Migration diese Funktion nachziehen, sonst gleichen
-- Anwendung und Datenbank Namen verschieden ab.

CREATE OR REPLACE FUNCTION public.berater_name_normal(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(btrim(coalesce(_name, ''))), '\s+', ' ', 'g');
$$;

COMMENT ON FUNCTION public.berater_name_normal(text) IS
  'Vergleichsform eines Berater-Namens: ohne Randleerzeichen, klein, '
  'einfache Leerzeichen. Abbild von normalisiereBeraterName in '
  'supabase/functions/_shared/berater-namensabgleich.ts.';

-- ---------------------------------------------------------------------------
-- 2) Zustaendiger Partner eines Investments, Kennung zuerst
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investment_partner_id(_kunde_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _berater text;
  _zustaendig uuid;
  _gesucht text;
  _anzahl integer;
  _partner uuid;
BEGIN
  IF _kunde_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT k.berater, k.zustaendig_id
    INTO _berater, _zustaendig
    FROM public.kontakte k
   WHERE k.id = _kunde_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 1. Die Kennung. Sie ist die Wahrheit, an ihr haengt auch die
  --    Sichtbarkeit des Kontakts. Sie muss allerdings auf ein Profil
  --    zeigen, das es noch gibt: Eine verwaiste Kennung waere sonst
  --    schlechter als der Name, den wir vorher zuerst geprueft haben.
  IF _zustaendig IS NOT NULL THEN
    PERFORM 1 FROM public.profiles p WHERE p.id = _zustaendig;
    IF FOUND THEN
      RETURN _zustaendig;
    END IF;
  END IF;

  -- 2. Rueckfall: der Freitext. Tolerant im Vergleich, aber nur bei einem
  --    einzigen Treffer. Zwei Gleichnamige gelten bewusst als nicht
  --    gefunden, siehe Kopf dieser Datei.
  _gesucht := public.berater_name_normal(_berater);
  IF _gesucht = '' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO _anzahl
    FROM public.profiles p
   WHERE public.berater_name_normal(p.name) = _gesucht;

  IF _anzahl <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT p.id INTO _partner
    FROM public.profiles p
   WHERE public.berater_name_normal(p.name) = _gesucht;

  RETURN _partner;
END;
$$;

COMMENT ON FUNCTION public.investment_partner_id(uuid) IS
  'Zustaendiger Vertriebspartner zu einer investments.kunde_id: zuerst '
  'kontakte.zustaendig_id, nur als Rueckfall der Freitext kontakte.berater. '
  'Der Namensvergleich ist tolerant gegenueber Schreibweise und '
  'Leerzeichen und liefert bei mehreren Gleichnamigen NULL statt zu raten.';

-- ---------------------------------------------------------------------------
-- 3) Rechte, unveraendert zu 20260909120000
-- ---------------------------------------------------------------------------
--
-- `investment_partner_id` liest als SECURITY DEFINER an RLS vorbei fremde
-- Zuordnungen. Deshalb: nur der Server (der Trigger laeuft als
-- Tabellenbesitzer) und service_role duerfen sie rufen.

REVOKE ALL ON FUNCTION public.investment_partner_id(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.investment_partner_id(uuid) TO service_role;

-- `berater_name_normal` rechnet nur auf dem uebergebenen Text und liest
-- nichts. Sie darf jeder Angemeldete rufen, anon nicht.
REVOKE ALL ON FUNCTION public.berater_name_normal(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.berater_name_normal(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Wachposten: genau eine Fassung von investment_partner_id
-- ---------------------------------------------------------------------------
--
-- Uebernommen aus 20260909120000. Stuenden zwei Fassungen da (uuid und die
-- alte text-Fassung aus 20260818140000), waere der Aufruf mehrdeutig.

DROP FUNCTION IF EXISTS public.investment_partner_id(text);

DO $$
DECLARE
  _anzahl integer;
BEGIN
  SELECT count(*) INTO _anzahl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'investment_partner_id';

  IF _anzahl <> 1 THEN
    RAISE EXCEPTION
      'investment_partner_id existiert % mal. Genau eine Fassung (uuid) darf dastehen, sonst ist der Aufruf mehrdeutig.',
      _anzahl;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Erwartet: eine Zeile, Rueckgabetyp uuid, und im Quelltext steht die
-- Kennung vor dem Namen.
--
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumente
--     FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'investment_partner_id';
--
--   SELECT public.berater_name_normal('  Hermann   VOGL ') = 'hermann vogl'
--          AS normalisierung_greift;
--
-- Danach lohnt der Prueflauf `95_BERATERNAMEN_PRUEFEN.sql` ein zweites Mal:
-- Zeile 3 ("es gaebe genau ein Profil bei toleranter Suche") beschreibt jetzt
-- die Faelle, die die Funktion neu findet.
