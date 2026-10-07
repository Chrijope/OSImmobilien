-- ===========================================================================
-- Provisionsfelder aus Investagon nur für Admin, Inhaber und Buchhaltung
-- ===========================================================================
--
-- Vorgabe GL vom 05.10.2026: Vertriebspartner und alle anderen Rollen
-- sehen keine Provisionsangaben aus den Investagon-Objektdaten, weder in der
-- Oberfläche noch über die Datenbank. Lesen dürfen Admin, Inhaber und
-- Buchhaltung.
--
-- Befund: `objekte` und `wohnungen` liest jede interne Rolle samt `meta`, und
-- dort lag der ganze Investagon-Datensatz (`meta.investagonRaw`) mit
-- Provision, Provisionsvermerk, Käuferprovision und Vertriebsmakler.
--
-- Nicht betroffen (Korrektur GL vom selben Tag): Die
-- Eigenprovisionsvereinbarungen (Kategorie „intern“, 15 Unterlagen) gehören
-- dem Käufer und bleiben für alle Objektrollen sichtbar, samt Eintrag in
-- `meta.investagonRaw.files`. Ebenfalls nicht verlegt, weil Kaufpreis und
-- Miteigentumsanteil, die Exposé, Rechner und Kundenansicht brauchen:
-- `purchase_price_*`, `object_share_owner`. Keines der verlegten Felder ist
-- die Eigenprovision des Käufers (lesend geprüft am 05.10.2026).
--
-- Neu:
--   1. Tabelle `investagon_intern`, je Objekt beziehungsweise Einheit eine
--      Zeile mit den abgetrennten Feldern. Lesen nur Admin, Inhaber und
--      Buchhaltung, schreiben nur die Dienstrolle (über den Auslöser).
--   2. `investagon_roh_trennen(jsonb)` trennt einen Investagon-Datensatz in
--      den Teil für `meta` und die Provisionsfelder. Feldliste aus den echten
--      Daten (Stand 05.10.2026).
--   3. Auslöser auf `objekte` und `wohnungen`: Wer `meta` schreibt, bekommt
--      die Provisionsfelder abgetrennt. Schreibt die Dienstrolle (der
--      Import), landen sie in `investagon_intern` und ergänzen, was dort
--      steht; sonst werden sie verworfen. So schreibt auch ein noch nicht
--      neu ausgerollter Import oder ein alter Browser-Tab nichts mehr davon
--      in `meta`.
--   4. Bestand in einer Transaktion unter Sperre: kopieren, vergleichen
--      (bricht bei einer Abweichung ab, bevor etwas entfernt wird), Auslöser
--      setzen, aus `meta` entfernen. Die Sperre hält den Import an, bis
--      alles durch ist, damit dazwischen nichts unkopiert in `meta` landet.
--
-- Ändert Bestandsdaten (nur `meta.investagonRaw` von 97 Objekten und 618
-- Einheiten), vorher vollständige Kopie. Wiederholbar: Ein zweiter Lauf
-- findet nichts mehr zu kopieren und lässt die Kopie stehen.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_admin_role(uuid)') IS NULL
     OR to_regprocedure('public.has_role(uuid, public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'is_admin_role oder has_role fehlt, bitte zuerst die Rollenmigrationen ausfuehren.';
  END IF;
END $$;

LOCK TABLE public.objekte, public.wohnungen IN SHARE ROW EXCLUSIVE MODE;

-- 1. Die Tabelle --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.investagon_intern (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objekt_id uuid UNIQUE REFERENCES public.objekte(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  wohnung_id uuid UNIQUE REFERENCES public.wohnungen(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  felder jsonb NOT NULL DEFAULT '{}'::jsonb,
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investagon_intern_genau_ein_bezug CHECK ((objekt_id IS NULL) <> (wohnung_id IS NULL))
);

ALTER TABLE public.investagon_intern ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investagon_intern FROM anon, authenticated;
GRANT SELECT ON public.investagon_intern TO authenticated;

DROP POLICY IF EXISTS "Investagon intern nur Admin und Inhaber" ON public.investagon_intern;
DROP POLICY IF EXISTS "Investagon intern Admin Inhaber Buchhaltung" ON public.investagon_intern;
CREATE POLICY "Investagon intern Admin Inhaber Buchhaltung"
  ON public.investagon_intern FOR SELECT TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'buchhaltung'::public.app_role)
  );

-- 2. Die Trennung -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investagon_roh_trennen(roh jsonb, OUT oeffentlich jsonb, OUT intern jsonb)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH felder(k) AS (
    VALUES ('commission'), ('commission_comment'), ('userCommissions'),
           ('selling_price_commission'), ('selling_price_commission_manual'),
           ('sellingPriceCommission'), ('transaction_broker_rate'), ('listing_broker')
  )
  SELECT
    roh - ARRAY(SELECT k FROM felder),
    coalesce((SELECT jsonb_object_agg(k, roh -> k) FROM felder WHERE roh ? k), '{}'::jsonb)
$$;

-- 3. Der Auslöser -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investagon_intern_abtrennen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  teile record;
BEGIN
  IF jsonb_typeof(NEW.meta -> 'investagonRaw') IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO teile FROM public.investagon_roh_trennen(NEW.meta -> 'investagonRaw');
  IF teile.intern = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  NEW.meta := jsonb_set(NEW.meta, '{investagonRaw}', teile.oeffentlich);

  -- Nur die Dienstrolle (Import) pflegt die Kopie. Aus dem Browser kommt
  -- höchstens ein veralteter Stand, der wird nur verworfen.
  IF auth.uid() IS NULL THEN
    IF TG_TABLE_NAME = 'objekte' THEN
      INSERT INTO public.investagon_intern (objekt_id, felder) VALUES (NEW.id, teile.intern)
      ON CONFLICT (objekt_id) DO UPDATE SET felder = investagon_intern.felder || EXCLUDED.felder, aktualisiert_am = now()
        WHERE investagon_intern.felder || EXCLUDED.felder IS DISTINCT FROM investagon_intern.felder;
    ELSE
      INSERT INTO public.investagon_intern (wohnung_id, felder) VALUES (NEW.id, teile.intern)
      ON CONFLICT (wohnung_id) DO UPDATE SET felder = investagon_intern.felder || EXCLUDED.felder, aktualisiert_am = now()
        WHERE investagon_intern.felder || EXCLUDED.felder IS DISTINCT FROM investagon_intern.felder;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 4a. Bestand kopieren ----------------------------------------------------------

INSERT INTO public.investagon_intern (objekt_id, felder)
SELECT o.id, t.intern
  FROM public.objekte o, LATERAL public.investagon_roh_trennen(o.meta -> 'investagonRaw') t
 WHERE jsonb_typeof(o.meta -> 'investagonRaw') = 'object' AND t.intern <> '{}'::jsonb
ON CONFLICT (objekt_id) DO UPDATE SET felder = investagon_intern.felder || EXCLUDED.felder, aktualisiert_am = now();

INSERT INTO public.investagon_intern (wohnung_id, felder)
SELECT w.id, t.intern
  FROM public.wohnungen w, LATERAL public.investagon_roh_trennen(w.meta -> 'investagonRaw') t
 WHERE jsonb_typeof(w.meta -> 'investagonRaw') = 'object' AND t.intern <> '{}'::jsonb
ON CONFLICT (wohnung_id) DO UPDATE SET felder = investagon_intern.felder || EXCLUDED.felder, aktualisiert_am = now();

-- 4b. Vergleichen, bevor etwas entfernt wird ----------------------------------------

DO $$
DECLARE
  fehlt integer;
BEGIN
  SELECT
    (SELECT count(*) FROM public.objekte o, LATERAL public.investagon_roh_trennen(o.meta -> 'investagonRaw') t
      WHERE jsonb_typeof(o.meta -> 'investagonRaw') = 'object' AND t.intern <> '{}'::jsonb
        AND NOT EXISTS (SELECT 1 FROM public.investagon_intern i WHERE i.objekt_id = o.id AND i.felder @> t.intern))
  + (SELECT count(*) FROM public.wohnungen w, LATERAL public.investagon_roh_trennen(w.meta -> 'investagonRaw') t
      WHERE jsonb_typeof(w.meta -> 'investagonRaw') = 'object' AND t.intern <> '{}'::jsonb
        AND NOT EXISTS (SELECT 1 FROM public.investagon_intern i WHERE i.wohnung_id = w.id AND i.felder @> t.intern))
  INTO fehlt;
  IF fehlt > 0 THEN
    RAISE EXCEPTION 'Kopie unvollstaendig: % Zeilen weichen ab, nichts entfernt.', fehlt;
  END IF;
END $$;

-- 4c. Auslöser setzen, dann aus meta entfernen -------------------------------------

DROP TRIGGER IF EXISTS trg_investagon_intern_abtrennen ON public.objekte;
CREATE TRIGGER trg_investagon_intern_abtrennen
  BEFORE INSERT OR UPDATE OF meta ON public.objekte
  FOR EACH ROW EXECUTE FUNCTION public.investagon_intern_abtrennen();

DROP TRIGGER IF EXISTS trg_investagon_intern_abtrennen ON public.wohnungen;
CREATE TRIGGER trg_investagon_intern_abtrennen
  BEFORE INSERT OR UPDATE OF meta ON public.wohnungen
  FOR EACH ROW EXECUTE FUNCTION public.investagon_intern_abtrennen();

UPDATE public.objekte o
   SET meta = jsonb_set(o.meta, '{investagonRaw}', (public.investagon_roh_trennen(o.meta -> 'investagonRaw')).oeffentlich)
 WHERE jsonb_typeof(o.meta -> 'investagonRaw') = 'object'
   AND (public.investagon_roh_trennen(o.meta -> 'investagonRaw')).intern <> '{}'::jsonb;

UPDATE public.wohnungen w
   SET meta = jsonb_set(w.meta, '{investagonRaw}', (public.investagon_roh_trennen(w.meta -> 'investagonRaw')).oeffentlich)
 WHERE jsonb_typeof(w.meta -> 'investagonRaw') = 'object'
   AND (public.investagon_roh_trennen(w.meta -> 'investagonRaw')).intern <> '{}'::jsonb;

COMMIT;

-- Zum Schluss: der Stand danach. Erwartet: 0, 0, dann die Zahl der Objekte und
-- Einheiten mit Investagon-Datensatz (Stand 05.10.2026: 97 und 618).
SELECT
  (SELECT count(*) FROM public.objekte
    WHERE meta -> 'investagonRaw' ?| ARRAY['commission','commission_comment','userCommissions','selling_price_commission','selling_price_commission_manual','sellingPriceCommission','transaction_broker_rate','listing_broker']) AS objekte_mit_provision_in_meta,
  (SELECT count(*) FROM public.wohnungen
    WHERE meta -> 'investagonRaw' ?| ARRAY['commission','commission_comment','userCommissions','selling_price_commission','selling_price_commission_manual','sellingPriceCommission','transaction_broker_rate','listing_broker']) AS einheiten_mit_provision_in_meta,
  (SELECT count(*) FROM public.investagon_intern WHERE objekt_id IS NOT NULL) AS objekte_in_investagon_intern,
  (SELECT count(*) FROM public.investagon_intern WHERE wohnung_id IS NOT NULL) AS einheiten_in_investagon_intern;

-- Nachsehen (aendert nichts): Pruefzeilen 88.1 bis 88.4 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
