-- Vergleichslink: zwei bis drei Kunden-Exposés in einem Link (25.10.2026).
--
-- Rein additiv: eine neue Tabelle, nichts an bestehenden Tabellen geändert.
--
-- Ein Vergleich bündelt bereits gesendete Kunden-Exposés (`objekt_exposes`)
-- desselben Kunden und Investments. Die Einheiten, Fristen und Glocken der
-- einzelnen Exposés bleiben, wie sie sind; der Vergleich verweist nur auf sie.
--
--   token          32 Byte Zufall als Hex, wie beim Exposé. Grundlage des Links
--                  /vergleich/<token>.
--   expose_ids     die gebündelten Exposés, zwei bis drei.
--   gueltig_bis    beim Anlegen die früheste Frist der gebündelten Exposés.
--   aufrufe ...    nur Anzahl und Zeitpunkte, nichts über den Betrachter.
--
-- Anlegen und Zählen nur über die Edge Function `kunden-vergleich` mit dem
-- Dienstschlüssel. Deshalb gibt es hier nur Leserechte, dieselben wie bei
-- `objekt_exposes`: Admin und Inhaber, der Ersteller, der zuständige Partner.

CREATE TABLE IF NOT EXISTS public.expose_vergleiche (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  kontakt_id uuid NOT NULL REFERENCES public.kontakte(id) ON DELETE CASCADE,
  investment_id uuid,
  expose_ids uuid[] NOT NULL,
  erstellt_von uuid NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  gueltig_bis timestamptz NOT NULL,
  zurueckgezogen_am timestamptz,
  aufrufe integer NOT NULL DEFAULT 0,
  erstmals_aufgerufen_am timestamptz,
  zuletzt_aufgerufen_am timestamptz,
  CONSTRAINT expose_vergleiche_anzahl CHECK (cardinality(expose_ids) BETWEEN 2 AND 3)
);

CREATE INDEX IF NOT EXISTS expose_vergleiche_kontakt_idx ON public.expose_vergleiche (kontakt_id, investment_id);

ALTER TABLE public.expose_vergleiche ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vergleiche lesen" ON public.expose_vergleiche;
CREATE POLICY "Vergleiche lesen"
  ON public.expose_vergleiche FOR SELECT TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR expose_vergleiche.erstellt_von = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.kontakte k
      WHERE k.id = expose_vergleiche.kontakt_id AND k.zustaendig_id = auth.uid()
    )
  );
