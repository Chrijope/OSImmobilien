-- ===========================================================================
-- MORE Lotse, Stufe 1: Zustimmung, Verlauf, Unterlagenauszüge, Aufräumen
-- ===========================================================================
--
-- Freigegeben von GL am 28.09.2026 (Bauplan MORE Lotse, Stufe 1). Der
-- Lotse ist ein KI-Chat auf der Einheitenseite (Edge Function
-- `objekt-lotse`). Diese Migration legt vier Tabellen, zwei Funktionen
-- und einen Zeitplan an:
--
-- 1. `lotse_zustimmung`: je Nutzer eine Zeile. Wer den Hinweis „Umgang mit
--    KI“ bestätigt hat und in welcher Fassung. Jeder liest und schreibt nur
--    seine eigene Zeile. Den Zeitpunkt setzt immer die Datenbank, damit der
--    Nachweis nicht vordatiert werden kann.
-- 2. `lotse_nachrichten`: Fragen und Antworten. Lesen und löschen nur die
--    eigenen Zeilen, auch Admin und Inhaber sehen keine fremden Verläufe.
--    Schreiben nur die Function mit dem Dienstschlüssel. Nach 90 Tagen löscht
--    der Zeitplan (Punkt 5) jede Nachricht.
-- 3. `lotse_unterlagen_auszug`: je Unterlage einmal der Auszug, den der
--    Lotse liest: grüne als Sachauszug, rote (Mietvertrag, Grundbuch) nur als
--    geprüfter Faktenauszug ohne Personen. Ohne Regel für normale Nutzer,
--    lesen und schreiben nur die Function mit dem Dienstschlüssel.
-- 4. `lotse_kontingent` und `lotse_kontingent_reservieren(uuid, integer)`:
--    das Tageskontingent je Nutzer (60 Fragen, Tag nach deutscher Zeit). Die
--    Function reserviert atomar, bevor sie irgendetwas lädt. Gezählt wird
--    nicht mehr am Verlauf, den jeder selbst löschen darf (Befund LOTSE-005).
--    Tabelle ohne Regel für Nutzer, Funktion nur für die Service-Rolle.
-- 5. pg_cron-Job `lotse-verlauf-aufraeumen`, täglich um 03:15 UTC, über
--    `lotse_aufraeumen()`: Nachrichten und Kontingentzeilen älter als 90 Tage.
--
-- Zweite Runde (ebenfalls 28.09.2026, vor dem ersten Lauf ergänzt): Punkt 4,
-- die Spalte `schema_fassung` an den Auszügen (Befund LOTSE-004) und
-- `lotse_aufraeumen()`. Wer die erste Fassung schon ausgeführt hat, führt die
-- Datei einfach noch einmal aus.
--
-- Ohne diese Migration zeigt der Reiter „MORE Lotse“ „Der Lotse wird gerade
-- eingerichtet“, und die Function antwortet mit dem Code `migration_fehlt`.
-- Sonst ändert sich nichts.
--
-- Mehrfach ausführbar: IF NOT EXISTS, DROP POLICY IF EXISTS, der Zeitplan wird
-- vor dem Anlegen entfernt.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Zustimmung zum Hinweis
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lotse_zustimmung (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fassung integer NOT NULL CHECK (fassung > 0),
  akzeptiert_am timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lotse_zustimmung ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lotse_zustimmung FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE ON public.lotse_zustimmung TO authenticated;
GRANT ALL ON public.lotse_zustimmung TO service_role;

DROP POLICY IF EXISTS lotse_zustimmung_lesen ON public.lotse_zustimmung;
CREATE POLICY lotse_zustimmung_lesen ON public.lotse_zustimmung
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS lotse_zustimmung_anlegen ON public.lotse_zustimmung;
CREATE POLICY lotse_zustimmung_anlegen ON public.lotse_zustimmung
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS lotse_zustimmung_aendern ON public.lotse_zustimmung;
CREATE POLICY lotse_zustimmung_aendern ON public.lotse_zustimmung
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Der Zeitpunkt der Zustimmung kommt immer von der Datenbank.
CREATE OR REPLACE FUNCTION public.lotse_zustimmung_zeitpunkt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.akzeptiert_am := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lotse_zustimmung_zeitpunkt() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lotse_zustimmung_zeitpunkt ON public.lotse_zustimmung;
CREATE TRIGGER trg_lotse_zustimmung_zeitpunkt
  BEFORE INSERT OR UPDATE ON public.lotse_zustimmung
  FOR EACH ROW EXECUTE FUNCTION public.lotse_zustimmung_zeitpunkt();

-- ---------------------------------------------------------------------------
-- 2) Verlauf: Fragen und Antworten
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lotse_nachrichten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  objekt_id uuid NOT NULL REFERENCES public.objekte(id) ON DELETE CASCADE,
  wohnung_id uuid NULL REFERENCES public.wohnungen(id) ON DELETE CASCADE,
  rolle text NOT NULL CHECK (rolle IN ('user', 'assistant')),
  inhalt text NOT NULL CHECK (char_length(inhalt) BETWEEN 1 AND 20000),
  quellen jsonb,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lotse_nachrichten_verlauf_idx
  ON public.lotse_nachrichten (user_id, wohnung_id, erstellt_am);
CREATE INDEX IF NOT EXISTS lotse_nachrichten_alter_idx
  ON public.lotse_nachrichten (erstellt_am);

ALTER TABLE public.lotse_nachrichten ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lotse_nachrichten FROM anon, authenticated, public;
GRANT SELECT, DELETE ON public.lotse_nachrichten TO authenticated;
GRANT ALL ON public.lotse_nachrichten TO service_role;

DROP POLICY IF EXISTS lotse_nachrichten_lesen ON public.lotse_nachrichten;
CREATE POLICY lotse_nachrichten_lesen ON public.lotse_nachrichten
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS lotse_nachrichten_loeschen ON public.lotse_nachrichten;
CREATE POLICY lotse_nachrichten_loeschen ON public.lotse_nachrichten
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Auszüge aus den Unterlagen, nur für die Function
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lotse_unterlagen_auszug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objekt_id uuid NOT NULL REFERENCES public.objekte(id) ON DELETE CASCADE,
  wohnung_id uuid NULL REFERENCES public.wohnungen(id) ON DELETE CASCADE,
  dokument_schluessel text NOT NULL UNIQUE,
  dokument_name text,
  ampel text NOT NULL CHECK (ampel IN ('gruen', 'rot')),
  art text,
  auszug jsonb NOT NULL,
  modell text,
  schema_fassung integer,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
-- Für eine schon angelegte Tabelle aus der ersten Fassung.
ALTER TABLE public.lotse_unterlagen_auszug ADD COLUMN IF NOT EXISTS schema_fassung integer;

CREATE INDEX IF NOT EXISTS lotse_unterlagen_auszug_objekt_idx
  ON public.lotse_unterlagen_auszug (objekt_id, wohnung_id);

ALTER TABLE public.lotse_unterlagen_auszug ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lotse_unterlagen_auszug FROM anon, authenticated, public;
GRANT ALL ON public.lotse_unterlagen_auszug TO service_role;
-- Bewusst keine Regel: Normale Nutzer lesen und schreiben hier nichts.

-- ---------------------------------------------------------------------------
-- 4) Tageskontingent, atomar
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lotse_kontingent (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag date NOT NULL,
  anzahl integer NOT NULL DEFAULT 0 CHECK (anzahl >= 0),
  PRIMARY KEY (user_id, tag)
);

ALTER TABLE public.lotse_kontingent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lotse_kontingent FROM anon, authenticated, public;
GRANT ALL ON public.lotse_kontingent TO service_role;
-- Bewusst keine Regel: Niemand außer der Function zählt hier.

-- Eine Frage reservieren: true, solange heute (deutsche Zeit) weniger als
-- p_limit reserviert sind. Einfügen und Hochzählen in einem Schritt, damit
-- zwei gleichzeitige Fragen das Limit nicht gemeinsam überschreiten.
CREATE OR REPLACE FUNCTION public.lotse_kontingent_reservieren(p_user uuid, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anzahl integer;
BEGIN
  IF p_user IS NULL OR p_limit IS NULL OR p_limit < 1 THEN
    RETURN false;
  END IF;
  INSERT INTO public.lotse_kontingent AS k (user_id, tag, anzahl)
  VALUES (p_user, (now() AT TIME ZONE 'Europe/Berlin')::date, 1)
  ON CONFLICT (user_id, tag) DO UPDATE SET anzahl = k.anzahl + 1
    WHERE k.anzahl < p_limit
  RETURNING k.anzahl INTO v_anzahl;
  RETURN v_anzahl IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.lotse_kontingent_reservieren(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lotse_kontingent_reservieren(uuid, integer) TO service_role;

-- Aufräumen für den Zeitplan: Nachrichten und Kontingent älter als 90 Tage.
CREATE OR REPLACE FUNCTION public.lotse_aufraeumen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.lotse_nachrichten WHERE erstellt_am < now() - interval '90 days';
  DELETE FROM public.lotse_kontingent WHERE tag < (now() AT TIME ZONE 'Europe/Berlin')::date - 90;
END;
$$;
REVOKE ALL ON FUNCTION public.lotse_aufraeumen() FROM public, anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- 5) Zeitplan: Nachrichten und Kontingent älter als 90 Tage löschen, täglich 03:15 UTC
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lotse-verlauf-aufraeumen') THEN
    PERFORM cron.unschedule('lotse-verlauf-aufraeumen');
  END IF;
  PERFORM cron.schedule(
    'lotse-verlauf-aufraeumen',
    '15 3 * * *',
    'SELECT public.lotse_aufraeumen();'
  );
  RAISE NOTICE 'Zeitplan "lotse-verlauf-aufraeumen" gesetzt: taeglich 03:15 UTC.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer den Lotse-Verlauf nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Nachsehen, erwartet wird eine Zeile mit '15 3 * * *':
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'lotse-verlauf-aufraeumen';
