-- ===========================================================================
-- Teamleiter sehen und bearbeiten die Kunden ihrer Struktur
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (29.10.2026)
--
--   Jeder Vertriebspartner sieht die Kunden aller Partner unter sich, ueber
--   beliebig viele Ebenen (A ueber B ueber C: A sieht die Kunden von B und C,
--   B die von C). Lesen und bearbeiten. Massgeblich ist der Zustaendige des
--   Kunden, nicht Ersteller oder Empfehler. Damit ist die Regel vom
--   16.10.2026 („Kunden der Struktur bleiben fuer den Teamleiter
--   unsichtbar“, 20261016100000) aufgehoben.
--
-- WAS DIESE MIGRATION TUT
--
--   1. ist_in_teamkette(nutzer, partner): steht der Nutzer in der Kette ueber
--      dem Partner (struktur_kette, hoechstens 20 Ebenen, Kreise brechen ab)?
--   2. is_vp_owner_of_kontakt (sehen und bearbeiten) bekommt die Teamkette
--      ueber dem Zustaendigen dazu. Darueber laufen die Lese- und
--      Bearbeitungsregeln fuer Kontakte, Investments und die Kundendaten.
--   3. meine_teamkette(): die Teamleiter ueber dem angemeldeten Nutzer, nur
--      Kennungen. Fuer die Bildreihe „Wer hat Einblick“ im CRM; die
--      user_settings der Upline (mit Provisionssaetzen) bleiben verborgen.
--
-- WAS SICH NICHT AENDERT
--
--   - is_vp_eigentuemer_of_kontakt bleibt: Loeschen eines Kontakts und das
--     Verschieben der Zustaendigkeit bleiben beim Zustaendigen (daran haengt
--     die Provision, kontakt_zustaendigkeit_schuetzen).
--   - Keine Daten. Mehrfach ausfuehrbar. Voraussetzung: 20261016100000.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.struktur_kette(uuid)') IS NULL
     OR to_regprocedure('public.is_vp_eigentuemer_of_kontakt(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.ist_aktive_vertretung(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20261016100000 und 20260807150000 ausfuehren.';
  END IF;
END;
$$;

-- 1) Steht _nutzer in der Teamkette ueber _partner?
CREATE OR REPLACE FUNCTION public.ist_in_teamkette(_nutzer uuid, _partner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _nutzer IS NOT NULL AND _partner IS NOT NULL AND _nutzer <> _partner
     AND EXISTS (SELECT 1 FROM public.struktur_kette(_partner) k WHERE k.leiter_id = _nutzer);
$$;

COMMENT ON FUNCTION public.ist_in_teamkette(uuid, uuid) IS
  'Steht der Nutzer in der Teamkette ueber dem Partner (teamleader_id, '
  'hoechstens 20 Ebenen)? Nur Server.';

REVOKE ALL ON FUNCTION public.ist_in_teamkette(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2) Sehen und bearbeiten: Eigentum, Vertretung oder Teamkette ueber dem Zustaendigen.
-- ponytail: Die Kette wird je Zeile gefragt (wenige Ebenen, Primaerschluessel);
-- bei sehr vielen Kontakten je Vertriebspartner auf eine Menge je Abfrage umstellen.
CREATE OR REPLACE FUNCTION public.is_vp_owner_of_kontakt(_user_id uuid, _zustaendig_id uuid, _meta jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_vp_eigentuemer_of_kontakt(_user_id, _zustaendig_id, _meta)
    OR public.ist_aktive_vertretung(_user_id, _zustaendig_id)
    OR public.ist_in_teamkette(_user_id, _zustaendig_id)
$$;

COMMENT ON FUNCTION public.is_vp_owner_of_kontakt(uuid, uuid, jsonb) IS
  'Darf dieser Nutzer den Kontakt sehen und bearbeiten? Eigentum, eine heute '
  'laufende Vertretung oder (seit 29.10.2026) die Teamkette ueber dem '
  'Zustaendigen. Loeschen richtet sich bewusst nach '
  'is_vp_eigentuemer_of_kontakt, nicht hiernach.';

-- 3) Die eigene Teamkette, nur Kennungen.
CREATE OR REPLACE FUNCTION public.meine_teamkette()
RETURNS TABLE(ebene integer, leiter_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.ebene, k.leiter_id FROM public.struktur_kette(auth.uid()) k WHERE auth.uid() IS NOT NULL;
$$;

COMMENT ON FUNCTION public.meine_teamkette() IS
  'Die Teamleiter ueber dem angemeldeten Nutzer, von unten nach oben, nur '
  'Kennungen (Bildreihe „Wer hat Einblick“).';

REVOKE ALL ON FUNCTION public.meine_teamkette() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meine_teamkette() TO authenticated;

COMMIT;
