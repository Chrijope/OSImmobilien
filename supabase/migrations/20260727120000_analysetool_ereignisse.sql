-- Zähler für das Analysetool
--
-- Beantwortet eine Frage, die sich bisher nicht beantworten ließ: Wie viele
-- Interessenten kommen bis zur Eintragung, und wie viele senden ab? Erst
-- daraus lässt sich sagen, ob die Hürde vor dem Ergebnis zu hoch ist.
--
-- Bewusst ohne jeden Personenbezug: gespeichert werden nur die Art des
-- Ereignisses, der Vertriebspartner, über dessen Link der Aufruf kam, und der
-- Zeitpunkt. Keine Namen, keine Kontaktdaten, keine Kennung des Besuchers.

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

CREATE INDEX IF NOT EXISTS analysetool_ereignisse_typ_zeit_idx
  ON public.analysetool_ereignisse (typ, erstellt_am DESC);
CREATE INDEX IF NOT EXISTS analysetool_ereignisse_berater_idx
  ON public.analysetool_ereignisse (berater_id, erstellt_am DESC);

ALTER TABLE public.analysetool_ereignisse ENABLE ROW LEVEL SECURITY;

-- Schreiben darf jeder, auch nicht angemeldete Besucher der öffentlichen
-- Analyseseite. Ohne Personenbezug ist das unkritisch.
DROP POLICY IF EXISTS analysetool_ereignisse_insert ON public.analysetool_ereignisse;
CREATE POLICY analysetool_ereignisse_insert
  ON public.analysetool_ereignisse FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Lesen nur angemeldete Nutzer, für die Auswertung im CRM.
DROP POLICY IF EXISTS analysetool_ereignisse_select ON public.analysetool_ereignisse;
CREATE POLICY analysetool_ereignisse_select
  ON public.analysetool_ereignisse FOR SELECT
  TO authenticated
  USING (true);

-- Ändern und Löschen bleibt der Service-Rolle vorbehalten, es gibt dafür
-- bewusst keine Richtlinie.

-- Auswertung: Wie viele haben die Eintragung gesehen, wie viele abgesendet?
CREATE OR REPLACE FUNCTION public.analysetool_trichter(
  p_tage integer DEFAULT 90,
  p_berater_id uuid DEFAULT NULL
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
    AND (p_berater_id IS NULL OR berater_id = p_berater_id);
$$;

REVOKE EXECUTE ON FUNCTION public.analysetool_trichter(integer, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.analysetool_trichter(integer, uuid) TO authenticated;
