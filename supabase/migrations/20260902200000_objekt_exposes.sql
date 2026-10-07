-- ===========================================================================
-- Exposé je Wohneinheit: ein Datensatz je Kunde und Wohnung
-- ===========================================================================
--
-- Das Exposé (zwölf Abschnitte mit Rechner, Etappe E3 des Konzepts
-- „Objektseite und persönliches Exposé") bekommt einen eigenen Datensatz:
-- welche Wohnung, für welchen Kunden, mit welchen Annahmen im Rechner, und
-- ob der Kunde die Annahmen später verschieben darf.
--
--   token                 32 Byte Zufall als Hex. Grundlage des Kundenlinks
--                         in Etappe E5. Bis dahin wird er nur vergeben.
--   kontakt_id            optional. Ohne Kunde ist das Exposé eine neutrale
--                         Vorschau mit Standardannahmen.
--   annahmen              die Rechnerannahmen als JSON (ExposeAnnahmen in
--                         src/lib/exposeAnnahmen.ts). Bewusst nicht in der
--                         URL: Einkommen und Familienstand gehören nicht in
--                         Browserverläufe und Server-Logs.
--   annahmen_gesperrt     true heißt: Der Kunde sieht die Regler, kann sie
--                         aber nicht bewegen.
--   sichtbare_abschnitte  Liste der Abschnittskennungen, die der Kunde
--                         sieht. Leer bedeutet alle.
--   preisstand            Kaufpreis der Wohnung zum Zeitpunkt des Speicherns
--                         samt Datum. Ändert sich der Preis in Investagon,
--                         zeigt die Seite „Preis hat sich geändert".
--   gueltig_bis           Ablauf des Kundenlinks. Danach zeigt die Seite
--                         einen Hinweis statt Daten (E5).
--   aufrufe               Zähler ohne Cookie und ohne IP, wie bei den
--                         Objektvorstellungen.
--
-- Zugriffsschutz nach dem Muster der Objektvorstellungen (20260709103340):
-- Admin und Inhaber alles; sonst der Ersteller und der Vertriebspartner,
-- der für den Kunden zuständig ist. Anlegen dürfen nur interne Rollen, und
-- nur mit sich selbst als Ersteller. Kein Zugriff für anon: Der Kundenlink
-- kommt in E5 über eine Security-Definer-Funktion, die nur das Nötige
-- herausgibt.

CREATE TABLE IF NOT EXISTS public.objekt_exposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wohnung_id uuid NOT NULL REFERENCES public.wohnungen(id) ON DELETE CASCADE,
  objekt_id uuid NOT NULL REFERENCES public.objekte(id) ON DELETE CASCADE,
  kontakt_id uuid REFERENCES public.kontakte(id) ON DELETE SET NULL,
  erstellt_von uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  annahmen jsonb NOT NULL DEFAULT '{}'::jsonb,
  annahmen_gesperrt boolean NOT NULL DEFAULT false,
  sichtbare_abschnitte jsonb NOT NULL DEFAULT '[]'::jsonb,
  preisstand numeric,
  preisstand_am timestamptz,
  gueltig_bis timestamptz,
  aufrufe integer NOT NULL DEFAULT 0,
  zuletzt_aufgerufen_am timestamptz,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS objekt_exposes_wohnung_idx ON public.objekt_exposes (wohnung_id);
CREATE INDEX IF NOT EXISTS objekt_exposes_kontakt_idx ON public.objekt_exposes (kontakt_id);
CREATE INDEX IF NOT EXISTS objekt_exposes_token_idx ON public.objekt_exposes (token);

COMMENT ON TABLE public.objekt_exposes IS
  'Exposé je Kunde und Wohneinheit: Token für den Kundenlink, Rechnerannahmen, Sperre, Preisstand, Aufrufe. Kein anon-Zugriff; der Kundenlink kommt über eine Security-Definer-Funktion (E5).';

-- ── aktualisiert_am automatisch pflegen ──

CREATE OR REPLACE FUNCTION public.tg_objekt_exposes_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.aktualisiert_am = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS objekt_exposes_touch ON public.objekt_exposes;
CREATE TRIGGER objekt_exposes_touch
  BEFORE UPDATE ON public.objekt_exposes
  FOR EACH ROW EXECUTE FUNCTION public.tg_objekt_exposes_touch();

-- ── Rechte ──

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objekt_exposes TO authenticated;
GRANT ALL ON public.objekt_exposes TO service_role;
REVOKE ALL ON public.objekt_exposes FROM anon;

ALTER TABLE public.objekt_exposes ENABLE ROW LEVEL SECURITY;

-- Wer ein Exposé sehen und ändern darf: Admin und Inhaber, der Ersteller,
-- und der Vertriebspartner, der für den Kunden zuständig ist.
DROP POLICY IF EXISTS "Exposes lesen" ON public.objekt_exposes;
CREATE POLICY "Exposes lesen"
  ON public.objekt_exposes FOR SELECT TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR objekt_exposes.erstellt_von = auth.uid()
    OR (
      objekt_exposes.kontakt_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.kontakte k
        WHERE k.id = objekt_exposes.kontakt_id AND k.zustaendig_id = auth.uid()
      )
    )
  );

-- Anlegen: nur interne Rollen, nur als eigener Ersteller, und ein Kunde nur,
-- wenn man für ihn zuständig ist (Admin und Inhaber für jeden Kunden).
DROP POLICY IF EXISTS "Exposes anlegen" ON public.objekt_exposes;
CREATE POLICY "Exposes anlegen"
  ON public.objekt_exposes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_internal_role(auth.uid())
    AND objekt_exposes.erstellt_von = auth.uid()
    AND (
      objekt_exposes.kontakt_id IS NULL
      OR public.is_admin_role(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.kontakte k
        WHERE k.id = objekt_exposes.kontakt_id AND k.zustaendig_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Exposes aendern" ON public.objekt_exposes;
CREATE POLICY "Exposes aendern"
  ON public.objekt_exposes FOR UPDATE TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR objekt_exposes.erstellt_von = auth.uid()
    OR (
      objekt_exposes.kontakt_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.kontakte k
        WHERE k.id = objekt_exposes.kontakt_id AND k.zustaendig_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Exposes loeschen" ON public.objekt_exposes;
CREATE POLICY "Exposes loeschen"
  ON public.objekt_exposes FOR DELETE TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR objekt_exposes.erstellt_von = auth.uid()
  );
