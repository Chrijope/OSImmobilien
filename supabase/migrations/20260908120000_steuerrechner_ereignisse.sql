-- Der Zähler zählt jetzt zwei Werkzeuge
--
-- Neben dem Analysetool gibt es den Steuerrechner, ebenfalls öffentlich und
-- ebenfalls mit persönlichem Link je Vertriebspartner. Beide sollen ihren
-- eigenen Trichter haben.
--
-- Warum eine Spalte und nicht neue Werte in `typ`: Die vier Werte in `typ`
-- beschreiben die Stufe im Trichter, nicht das Werkzeug. Schriebe der
-- Steuerrechner in dieselben vier Werte, wären die Zahlen des Analysetools ab
-- sofort still verfälscht, ohne dass es jemandem auffiele. Die Trennung gehört
-- deshalb in eine eigene Spalte.
--
-- **Diese Datei legt die Tabelle notfalls selbst an.** Beim ersten Versuch im
-- SQL-Editor am 08.09.2026 brach sie ab mit „relation
-- public.analysetool_ereignisse does not exist": Die ursprüngliche Migration
-- 20260727120000 war in der Datenbank nie gelaufen, obwohl sie in der Historie
-- steht. Die Zählung des Analysetools schrieb seither ins Leere, der Fehler
-- wird im Browser stillschweigend verschluckt. Eine Migration, die auf einer
-- Tabelle aufsetzt, die es vielleicht nicht gibt, ist deshalb keine gute
-- Migration. Sie baut jetzt von unten auf und ist von Anfang bis Ende
-- wiederholbar.

-- ---------------------------------------------------------------------------
-- 1) Die Tabelle, falls sie fehlt (Inhalt aus 20260727120000)
-- ---------------------------------------------------------------------------
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
-- Seiten. Ohne Personenbezug ist das unkritisch.
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

-- ---------------------------------------------------------------------------
-- 2) Die neue Spalte für das Werkzeug
-- ---------------------------------------------------------------------------
--
-- Der Vorgabewert 'analysetool' sorgt dafür, dass alle bisherigen Zeilen dem
-- Analysetool zugeordnet bleiben und der bestehende Aufruf unverändert
-- weiterläuft.

ALTER TABLE public.analysetool_ereignisse
  ADD COLUMN IF NOT EXISTS werkzeug text NOT NULL DEFAULT 'analysetool';

-- Die Prüfbedingung als eigener Schritt, damit ein zweiter Durchlauf nicht
-- an einer bereits vorhandenen Bedingung scheitert.
ALTER TABLE public.analysetool_ereignisse
  DROP CONSTRAINT IF EXISTS analysetool_ereignisse_werkzeug_check;
ALTER TABLE public.analysetool_ereignisse
  ADD CONSTRAINT analysetool_ereignisse_werkzeug_check
  CHECK (werkzeug IN ('analysetool', 'steuerrechner'));

CREATE INDEX IF NOT EXISTS analysetool_ereignisse_werkzeug_idx
  ON public.analysetool_ereignisse (werkzeug, typ, erstellt_am DESC);

-- ---------------------------------------------------------------------------
-- 3) Die Auswertung, mit dem Werkzeug als drittem Parameter
-- ---------------------------------------------------------------------------
--
-- Wichtig: Eine vorhandene Fassung muss vorher weg. Ein `CREATE OR REPLACE`
-- mit einem zusätzlichen Parameter ersetzt die vorhandene Funktion nicht,
-- sondern legt eine zweite daneben. Der bestehende Aufruf mit zwei Argumenten
-- wäre dann mehrdeutig, und Postgres bricht ihn mit einem Fehler ab. Die
-- Auswertung im CRM würde also genau durch die Migration kaputtgehen, die sie
-- erweitern soll.

DROP FUNCTION IF EXISTS public.analysetool_trichter(integer, uuid);
DROP FUNCTION IF EXISTS public.analysetool_trichter(integer, uuid, text);

CREATE FUNCTION public.analysetool_trichter(
  p_tage integer DEFAULT 90,
  p_berater_id uuid DEFAULT NULL,
  p_werkzeug text DEFAULT 'analysetool'
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
    AND werkzeug = coalesce(p_werkzeug, 'analysetool');
$$;

REVOKE EXECUTE ON FUNCTION public.analysetool_trichter(integer, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.analysetool_trichter(integer, uuid, text) TO authenticated;
