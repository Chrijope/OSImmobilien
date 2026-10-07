-- Abrechnung: Provisionsbescheide dauerhaft speichern, Buchhaltung und
-- Vertriebsleitung die noetigen Stammdaten lesen lassen.
--
-- Zwei getrennte Befunde aus der Analyse der Seite "Abrechnungen".
--
-- 1. Die monatlichen Provisionsabrechnungen lagen ausschliesslich im
--    localStorage des Browsers, in dem sie erzeugt wurden. Die Buchhaltung
--    erstellte einen Bescheid, der Vertriebspartner sah ihn nie: die Daten
--    verliessen den Rechner der Buchhaltung nicht. Ein Wechsel des Browsers
--    oder ein geleerter Cache loeschte saemtliche Abrechnungen ersatzlos.
--    Sie bekommen deshalb eine eigene Tabelle.
--
-- 2. Die Buchhaltung darf public.user_settings bisher nur fuer die eigene
--    Zeile lesen. Karrierestufe, individueller Provisionssatz und
--    Teamleiter-Zuordnung stehen aber genau dort. Fuer die Buchhaltung war
--    jede Zeile leer, also rechnete die Seite jeden Partner still mit den
--    Grundwerten (3 Prozent, kein Overhead). Der Vertriebsleiter hatte
--    dasselbe Problem.

-- ── 1. Provisionsabrechnungen ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provisionsabrechnungen (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monat         text NOT NULL,                      -- YYYY-MM
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name     text NOT NULL DEFAULT '',
  karrierestufe text,
  -- Die Einzelposten bleiben als JSON erhalten. Sie sind ein Beleg fuer einen
  -- abgerechneten Monat und duerfen sich nicht mehr aendern, wenn spaeter ein
  -- Kaufpreis am Kontakt korrigiert wird.
  eigene_deals          jsonb NOT NULL DEFAULT '[]'::jsonb,
  overrides_erhalten    jsonb NOT NULL DEFAULT '[]'::jsonb,
  overheads_abgezogen   jsonb NOT NULL DEFAULT '[]'::jsonb,
  summe_eigen               numeric NOT NULL DEFAULT 0,
  summe_overrides_erhalten  numeric NOT NULL DEFAULT 0,
  summe_overhead            numeric NOT NULL DEFAULT 0,
  netto                     numeric NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'offen'
                CHECK (status IN ('offen', 'freigegeben', 'ausgezahlt')),
  freigegeben_am  timestamptz,
  freigegeben_von text,
  ausgezahlt_am   timestamptz,
  ausgezahlt_von  text,
  pdf_erstellt_am timestamptz,
  -- Zahlungsbeleg der Buchhaltung. Lag bisher in der Einstellungszeile der
  -- Buchhaltung selbst, war fuer den Partner also unsichtbar.
  beleg_name      text,
  beleg_hochgeladen_am timestamptz,
  gutschrift_ueberwiesen boolean NOT NULL DEFAULT false,
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  -- Pro Partner und Monat genau ein Bescheid.
  CONSTRAINT provisionsabrechnungen_user_monat_uniq UNIQUE (user_id, monat)
);

CREATE INDEX IF NOT EXISTS idx_provisionsabrechnungen_user_monat
  ON public.provisionsabrechnungen (user_id, monat DESC);

ALTER TABLE public.provisionsabrechnungen ENABLE ROW LEVEL SECURITY;

-- Lesen: die eigene Abrechnung, Leitung und Buchhaltung alle.
DROP POLICY IF EXISTS "provisionsabrechnungen_select" ON public.provisionsabrechnungen;
CREATE POLICY "provisionsabrechnungen_select"
ON public.provisionsabrechnungen
FOR SELECT
TO authenticated
USING (
  provisionsabrechnungen.user_id = auth.uid()
  OR public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
  OR public.has_role(auth.uid(), 'buchhaltung'::app_role)
);

-- Schreiben: ausschliesslich Buchhaltung und Leitung. Ein Vertriebspartner
-- darf seine eigene Abrechnung sehen, aber nicht anfassen.
DROP POLICY IF EXISTS "provisionsabrechnungen_insert" ON public.provisionsabrechnungen;
CREATE POLICY "provisionsabrechnungen_insert"
ON public.provisionsabrechnungen
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'buchhaltung'::app_role)
);

DROP POLICY IF EXISTS "provisionsabrechnungen_update" ON public.provisionsabrechnungen;
CREATE POLICY "provisionsabrechnungen_update"
ON public.provisionsabrechnungen
FOR UPDATE
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'buchhaltung'::app_role)
)
WITH CHECK (
  public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'buchhaltung'::app_role)
);

DROP POLICY IF EXISTS "provisionsabrechnungen_delete" ON public.provisionsabrechnungen;
CREATE POLICY "provisionsabrechnungen_delete"
ON public.provisionsabrechnungen
FOR DELETE
TO authenticated
USING (public.is_admin_role(auth.uid()));

-- Kein Eintrag in die Realtime-Publikation.
--
-- Beim ersten Lauf hat genau diese Zeile die Migration abgebrochen:
--
--   ERROR: 40P01: deadlock detected
--
-- ALTER PUBLICATION nimmt eine ausschliessliche Sperre auf die Tabelle,
-- waehrend der Realtime-Dienst zeitgleich eine Lesesperre auf den
-- Publikationskatalog haelt. Beide warten aufeinander, Postgres loest es auf,
-- indem es die ganze Transaktion zurueckrollt. Die Tabelle waere danach nicht
-- angelegt gewesen.
--
-- Es ist ohnehin nicht noetig: Der Client abonniert diese Tabelle bewusst
-- nicht (siehe den Kommentar in src/lib/dataCache.ts), die Seite
-- Provisionsabrechnung laedt beim Oeffnen selbst nach. REPLICA IDENTITY setzen
-- wir trotzdem, das ist unkritisch und schadet spaeter nicht.
ALTER TABLE public.provisionsabrechnungen REPLICA IDENTITY FULL;

-- ── 2. Stammdaten fuer Buchhaltung und Vertriebsleitung ──────────────────

DROP POLICY IF EXISTS "Buchhaltung und Leitung lesen user_settings" ON public.user_settings;
CREATE POLICY "Buchhaltung und Leitung lesen user_settings"
ON public.user_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'buchhaltung'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
);
