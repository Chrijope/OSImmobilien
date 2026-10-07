-- Der Zähler zählt jetzt auch je Kampagne
--
-- Der öffentliche Steuerrechner läuft ohne Kürzel in bezahlter Werbung. Damit
-- sich eine Anzeige bewerten lässt, genügt die Zahl der Leads am Ende nicht:
-- Man sieht dann nicht, ob die Anzeige zu wenige Leute bringt oder die Seite
-- sie verliert. Dafür braucht der Trichter eine dritte Achse neben Werkzeug
-- und Vertriebspartner, nämlich die Kampagne.
--
-- Der Wert kommt aus `utm_campaign` in der Adresse, gesäubert und gekappt im
-- Browser (`src/lib/kampagnenKennung.ts`). Ein Aufruf ohne Kampagne, also der
-- Normalfall über den persönlichen Partnerlink, lässt die Spalte leer.
--
-- Diese Datei setzt auf 20260908120000 auf, ist aber wie diese von Anfang bis
-- Ende wiederholbar und legt fehlende Teile selbst an. Sie darf auch dann
-- laufen, wenn 20260908120000 noch nicht gelaufen ist.

-- ---------------------------------------------------------------------------
-- 1) Die Tabelle, falls sie fehlt (Inhalt aus 20260727120000)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analysetool_ereignisse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ text NOT NULL CHECK (typ IN (
    'analyse_gestartet',
    'analyse_beendet',
    'eintragung_gesehen',
    'eintragung_abgesendet'
  )),
  berater_id uuid,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analysetool_ereignisse
  ADD COLUMN IF NOT EXISTS werkzeug text NOT NULL DEFAULT 'analysetool';

-- Die Zeilensicherheit gehört mit dazu. Legte diese Datei die Tabelle an und
-- ließe die Richtlinien weg, stünde sie bis zum Lauf von 20260908120000 offen.
ALTER TABLE public.analysetool_ereignisse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analysetool_ereignisse_insert ON public.analysetool_ereignisse;
CREATE POLICY analysetool_ereignisse_insert
  ON public.analysetool_ereignisse FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS analysetool_ereignisse_select ON public.analysetool_ereignisse;
CREATE POLICY analysetool_ereignisse_select
  ON public.analysetool_ereignisse FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2) Die neue Spalte für die Kampagne
-- ---------------------------------------------------------------------------
--
-- Ohne Vorgabewert und ohne NOT NULL: Ein Aufruf ohne Kampagne hat schlicht
-- keine, und ein erfundener Vorgabewert würde in der Auswertung wie eine
-- echte Kampagne aussehen. NULL heißt hier ehrlich „ohne Kampagne".
--
-- Die Länge ist begrenzt, weil der Wert aus der Adresse stammt und damit von
-- außen kommt. 120 Zeichen sind dieselbe Grenze wie im Browser.

ALTER TABLE public.analysetool_ereignisse
  ADD COLUMN IF NOT EXISTS kampagne text;

ALTER TABLE public.analysetool_ereignisse
  DROP CONSTRAINT IF EXISTS analysetool_ereignisse_kampagne_check;
ALTER TABLE public.analysetool_ereignisse
  ADD CONSTRAINT analysetool_ereignisse_kampagne_check
  CHECK (kampagne IS NULL OR length(kampagne) <= 120);

CREATE INDEX IF NOT EXISTS analysetool_ereignisse_kampagne_idx
  ON public.analysetool_ereignisse (werkzeug, kampagne, typ, erstellt_am DESC);

-- ---------------------------------------------------------------------------
-- 3) Die Auswertung, jetzt mit der Kampagne als viertem Parameter
-- ---------------------------------------------------------------------------
--
-- Wieder der Hinweis aus 20260908120000, und er gilt hier genauso: Ein
-- `CREATE OR REPLACE` mit einem zusätzlichen Parameter ersetzt die vorhandene
-- Funktion NICHT, sondern legt eine zweite daneben. Der bestehende Aufruf mit
-- zwei oder drei Argumenten wäre danach mehrdeutig, und Postgres bricht ihn
-- ab. Die Auswertung im CRM ginge also genau durch die Migration kaputt, die
-- sie erweitern soll. Deshalb müssen alle bisherigen Fassungen vorher weg.
--
-- `p_kampagne` filtert nur, wenn es gesetzt ist. Die vorhandenen Aufrufe mit
-- zwei und drei benannten Argumenten laufen unverändert weiter.

DROP FUNCTION IF EXISTS public.analysetool_trichter(integer, uuid);
DROP FUNCTION IF EXISTS public.analysetool_trichter(integer, uuid, text);
DROP FUNCTION IF EXISTS public.analysetool_trichter(integer, uuid, text, text);

CREATE FUNCTION public.analysetool_trichter(
  p_tage integer DEFAULT 90,
  p_berater_id uuid DEFAULT NULL,
  p_werkzeug text DEFAULT 'analysetool',
  p_kampagne text DEFAULT NULL
)
RETURNS TABLE (
  gestartet bigint,
  beendet bigint,
  eintragung_gesehen bigint,
  eintragung_abgesendet bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    count(*) FILTER (WHERE typ = 'analyse_gestartet'),
    count(*) FILTER (WHERE typ = 'analyse_beendet'),
    count(*) FILTER (WHERE typ = 'eintragung_gesehen'),
    count(*) FILTER (WHERE typ = 'eintragung_abgesendet')
  FROM public.analysetool_ereignisse
  WHERE erstellt_am >= now() - make_interval(days => greatest(p_tage, 1))
    AND (p_berater_id IS NULL OR berater_id = p_berater_id)
    AND werkzeug = coalesce(p_werkzeug, 'analysetool')
    AND (p_kampagne IS NULL OR kampagne = p_kampagne);
$$;

REVOKE EXECUTE ON FUNCTION public.analysetool_trichter(integer, uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.analysetool_trichter(integer, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Der Trichter je Kampagne, eine Zeile pro Anzeige
-- ---------------------------------------------------------------------------
--
-- Eine eigene Funktion und keine Erweiterung der oberen: Die obere beantwortet
-- „wie läuft dieser eine Trichter", diese beantwortet „welche Kampagne bringt
-- wie viel". Zwei Fragen, zwei Ergebnisformen.
--
-- Aufrufe ohne Kampagne verschwinden nicht, sie kommen als Zeile mit
-- `kampagne IS NULL` zurück. Die Oberfläche beschriftet sie mit „Ohne
-- Kampagne". Alle Ereignisse aus der Zeit vor dieser Migration stehen dort,
-- weil sie keine Kennung tragen.
--
-- Sortiert nach den Startern, damit die größte Kampagne oben steht. Die
-- Obergrenze verhindert, dass ein von außen gebauter Link mit tausend
-- erfundenen Kampagnennamen die Auswertung unlesbar macht.

DROP FUNCTION IF EXISTS public.analysetool_trichter_kampagnen(integer, text, integer);

CREATE FUNCTION public.analysetool_trichter_kampagnen(
  p_tage integer DEFAULT 90,
  p_werkzeug text DEFAULT 'steuerrechner',
  p_grenze integer DEFAULT 50
)
RETURNS TABLE (
  kampagne text,
  gestartet bigint,
  beendet bigint,
  eintragung_gesehen bigint,
  eintragung_abgesendet bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    e.kampagne,
    count(*) FILTER (WHERE e.typ = 'analyse_gestartet'),
    count(*) FILTER (WHERE e.typ = 'analyse_beendet'),
    count(*) FILTER (WHERE e.typ = 'eintragung_gesehen'),
    count(*) FILTER (WHERE e.typ = 'eintragung_abgesendet')
  FROM public.analysetool_ereignisse e
  WHERE e.erstellt_am >= now() - make_interval(days => greatest(p_tage, 1))
    AND e.werkzeug = coalesce(p_werkzeug, 'steuerrechner')
  GROUP BY e.kampagne
  ORDER BY count(*) FILTER (WHERE e.typ = 'analyse_gestartet') DESC, e.kampagne NULLS LAST
  LIMIT greatest(coalesce(p_grenze, 50), 1);
$$;

REVOKE EXECUTE ON FUNCTION public.analysetool_trichter_kampagnen(integer, text, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.analysetool_trichter_kampagnen(integer, text, integer) TO authenticated;
