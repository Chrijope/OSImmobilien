-- ===========================================================================
-- Berechnungen des Investmentrechners, gespeichert am Investment
-- ===========================================================================
--
-- Bisher hat der Investmentrechner nichts gespeichert. Alles lebte im
-- Arbeitsspeicher der Seite; wer sie verließ, fing beim nächsten Mal von vorn
-- an. Diese Tabelle hält den Stand fest, und zwar mehrfach je Investment:
-- Eine zweite Variante mit mehr Eigenkapital soll neben der ersten stehen und
-- sie nicht ersetzen.
--
--   investment_id   das Investment, zu dem die Berechnung gehört. Verschwindet
--                   das Investment, verschwinden auch seine Berechnungen.
--   kontakt_id      der Kunde. Er steht hier noch einmal, obwohl er am
--                   Investment hängt: Die Zugriffsregeln fragen nach ihm, und
--                   sie sollen dafür nicht bei jeder Zeile über eine zweite
--                   Tabelle gehen müssen.
--   wohnung_id      die Einheit, falls die Berechnung zu einer gehört.
--   name            was in der Liste steht, etwa „Musterstraße 12, WE 7“ oder
--                   „Variante mit mehr Eigenkapital“.
--   eingabe         die Felder des Rechners (InvestmentEingabe).
--   knk             Weg und Bundesland der Kaufnebenkosten.
--   unterlagen      Energieausweis, Rücklage und Sanierungen, soweit bekannt.
--   kennzahlen      Kaufpreis, Eigenkapital, monatlicher Cashflow nach Steuern
--                   im ersten Jahr, Bruttorendite und IRR. Damit die Liste im
--                   Kundenprofil nicht jede Berechnung nachrechnen muss.
--   herkunft        je Feld, woher der Wert stammt (Selbstauskunft,
--                   Objektunterlagen, Objekt oder eigene Eingabe). Daraus wird
--                   im Rechner die kleine graue Zeile unter dem Feld.
--
-- Rechte: Wer den Kunden bearbeiten darf, darf dessen Berechnungen sehen,
-- anlegen, ändern und löschen. Das ist kein neues Rechtekonzept, sondern
-- genau die Bedingung der UPDATE-Policies auf `kontakte` (20260608093601 für
-- Leitung und Fachrollen, 20260517073534 für Vertriebspartner). Sie steht
-- unten einmal als Funktion, damit die vier Policies nicht auseinanderlaufen.
--
-- Die Migration ist wiederholbar: Sie legt nur an, was fehlt, und ersetzt
-- Funktion, Trigger und Policies jedes Mal.

-- ---------------------------------------------------------------------------
-- 1) Darf dieser Nutzer den Kontakt bearbeiten?
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER, weil die Bedingung selbst in `kontakte` nachsieht. Ohne
-- das griffe innerhalb der Policy wieder die RLS von `kontakte`, und ein
-- Vertriebspartner sähe die Kontaktzeile eines fremden Kunden gar nicht: Die
-- Prüfung liefe dann nicht auf „darf nicht“, sondern auf „gibt es nicht“
-- hinaus, was dasselbe Ergebnis hat, aber aus dem falschen Grund.

-- ---------------------------------------------------------------------------
-- Wer darf die Berechnungen eines Kunden sehen und ändern?
-- ---------------------------------------------------------------------------
--
-- Bewusst enger als `darf_kontakt_bearbeiten`. Jene Regel bildet die
-- Änderungsregel auf `kontakte` ab, und die ist für jede interne Rolle wahr:
-- auch für Buchhaltung, Marketing, Hausverwaltung und HR. Für einen Namen und
-- eine Telefonnummer mag das tragen. Hier liegen Jahresbrutto, Steuerklasse,
-- zu versteuerndes Einkommen und Eigenkapital, und die Oberfläche bietet das
-- Anlegen und Löschen ohnehin nur vier Rollen an. Wäre die Datenbank breiter
-- als die Oberfläche, wäre der ausgeblendete Knopf die einzige Sperre, und
-- genau das ist in diesem Projekt keine Zugriffskontrolle.
--
-- Erlaubt sind deshalb: Admin und Inhaber, der Vertriebsleiter, und der
-- Vertriebspartner für die Kunden, für die er zuständig ist.
CREATE OR REPLACE FUNCTION public.darf_investment_berechnung(_user_id uuid, _kontakt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kontakte k
    WHERE k.id = _kontakt_id
      AND (
        public.is_admin_role(_user_id)
        OR public.has_role(_user_id, 'vertriebsleiter'::app_role)
        OR (
          public.has_role(_user_id, 'vertriebspartner'::app_role)
          AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.darf_investment_berechnung(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.darf_investment_berechnung(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.darf_kontakt_bearbeiten(_user_id uuid, _kontakt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kontakte k
    WHERE k.id = _kontakt_id
      AND (
        public.is_admin_role(_user_id)
        OR (
          public.is_internal_role(_user_id)
          AND NOT public.has_role(_user_id, 'vertriebspartner'::app_role)
        )
        OR (
          public.has_role(_user_id, 'vertriebspartner'::app_role)
          AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
        )
      )
  )
$$;

COMMENT ON FUNCTION public.darf_kontakt_bearbeiten(uuid, uuid) IS
  'Darf dieser Nutzer diesen Kontakt bearbeiten? Ausgeschriebene Fassung der '
  'UPDATE-Policies auf public.kontakte, damit abhaengige Tabellen dieselbe '
  'Regel verwenden statt eine eigene zu erfinden.';

REVOKE ALL ON FUNCTION public.darf_kontakt_bearbeiten(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.darf_kontakt_bearbeiten(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Die Tabelle
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.investment_berechnungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  kontakt_id uuid NOT NULL,
  wohnung_id uuid,
  name text NOT NULL,
  eingabe jsonb NOT NULL DEFAULT '{}'::jsonb,
  knk jsonb NOT NULL DEFAULT '{}'::jsonb,
  unterlagen jsonb,
  kennzahlen jsonb NOT NULL DEFAULT '{}'::jsonb,
  herkunft jsonb,
  erstellt_von uuid NOT NULL DEFAULT auth.uid(),
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  geaendert_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_berechnungen_investment_idx
  ON public.investment_berechnungen (investment_id);
CREATE INDEX IF NOT EXISTS investment_berechnungen_kontakt_idx
  ON public.investment_berechnungen (kontakt_id);

COMMENT ON TABLE public.investment_berechnungen IS
  'Gespeicherte Staende des Investmentrechners, mehrere je Investment. Sehen '
  'und schreiben darf, wer den zugehoerigen Kontakt bearbeiten darf.';

-- ---------------------------------------------------------------------------
-- 3) geaendert_am automatisch pflegen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_investment_berechnungen_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.geaendert_am = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS investment_berechnungen_touch ON public.investment_berechnungen;
CREATE TRIGGER investment_berechnungen_touch
  BEFORE UPDATE ON public.investment_berechnungen
  FOR EACH ROW EXECUTE FUNCTION public.tg_investment_berechnungen_touch();

-- ---------------------------------------------------------------------------
-- 4) Rechte
-- ---------------------------------------------------------------------------

-- Erst sperren, dann Rechte vergeben. Bricht das Skript im SQL-Editor
-- mittendrin ab, steht die Tabelle sonst kurz für alle Angemeldeten offen.
ALTER TABLE public.investment_berechnungen ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_berechnungen TO authenticated;
GRANT ALL ON public.investment_berechnungen TO service_role;
REVOKE ALL ON public.investment_berechnungen FROM anon;

DROP POLICY IF EXISTS "Berechnungen lesen" ON public.investment_berechnungen;
CREATE POLICY "Berechnungen lesen"
  ON public.investment_berechnungen FOR SELECT TO authenticated
  USING (public.darf_investment_berechnung(auth.uid(), investment_berechnungen.kontakt_id));

-- Beim Anlegen kommt eine zweite Bedingung dazu: Investment und Kontakt
-- muessen zusammenpassen. Sonst liesse sich eine Berechnung unter dem eigenen
-- Kunden anlegen und an das Investment eines fremden haengen; sie tauchte
-- dann in dessen Kundenprofil auf.
DROP POLICY IF EXISTS "Berechnungen anlegen" ON public.investment_berechnungen;
CREATE POLICY "Berechnungen anlegen"
  ON public.investment_berechnungen FOR INSERT TO authenticated
  WITH CHECK (
    public.darf_investment_berechnung(auth.uid(), investment_berechnungen.kontakt_id)
    AND investment_berechnungen.erstellt_von = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.investments i
      WHERE i.id = investment_berechnungen.investment_id
        AND i.kunde_id = investment_berechnungen.kontakt_id
    )
  );

DROP POLICY IF EXISTS "Berechnungen aendern" ON public.investment_berechnungen;
CREATE POLICY "Berechnungen aendern"
  ON public.investment_berechnungen FOR UPDATE TO authenticated
  USING (public.darf_investment_berechnung(auth.uid(), investment_berechnungen.kontakt_id))
  WITH CHECK (
    public.darf_investment_berechnung(auth.uid(), investment_berechnungen.kontakt_id)
    AND EXISTS (
      SELECT 1 FROM public.investments i
      WHERE i.id = investment_berechnungen.investment_id
        AND i.kunde_id = investment_berechnungen.kontakt_id
    )
  );

DROP POLICY IF EXISTS "Berechnungen loeschen" ON public.investment_berechnungen;
CREATE POLICY "Berechnungen loeschen"
  ON public.investment_berechnungen FOR DELETE TO authenticated
  USING (public.darf_investment_berechnung(auth.uid(), investment_berechnungen.kontakt_id));
