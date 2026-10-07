-- ===========================================================================
-- Handbuch-Seite: Partner-Schalter auch auf dem Server, gesperrte Kürzel
-- ===========================================================================
--
-- Zwei Befunde der Codex-Prüfung vom 26.09.2026, von GL freigegeben.
-- Baut auf 20260926180000_handbuch_stand_und_leitung.sql auf und muss
-- DANACH laufen.
--
-- HB-008  Der Schalter „Handbuch-Seite für Vertriebspartner freigeschaltet“
--         wirkte nur im Browser. Jetzt steht er in `app_config` unter
--         `handbuch_partner_freigeschaltet` als {"aktiv": false}, und der
--         Server hält sich daran:
--           - Leseregel `handbuch_anforderungen_lesen`: Admin, Inhaber und
--             Vertriebsleitung wie bisher; Partner lesen ihre eigenen Zeilen
--             nur, wenn der Schalter an ist (Setterin ausgenommen).
--           - `handbuch_kennzahlen`: ohne Gesamtsicht und ohne Schalter
--             kommt NULL zurück, die Verwaltung zeigt dann „nicht verfügbar“.
--             Die Seite ist für Partner vorher ohnehin nicht erreichbar.
--         NICHT gesperrt wird `handbuch_lead_staende`: Sie füllt im
--         Kundenprofil den Kasten „Aus dem Konfigurator“, und den braucht der
--         Partner für seine eigenen Kunden, freigeschaltet oder nicht. Sie
--         gibt nur Zeiten und Merkmale heraus, keine Kontaktdaten.
--
--         Freischalten später mit einer Zeile:
--           update public.app_config set wert = '{"aktiv": true}'::jsonb
--            where schluessel = 'handbuch_partner_freigeschaltet';
--
-- HB-013  Kürzel, die unter /handbuch/ eine eigene Seite sind
--         (konfigurator, selbstauskunft, ergebnis), darf kein Partner als
--         `profiles.vp_slug` bekommen. Die Edge Functions vergeben sie schon
--         nicht mehr (`_shared/vp-slug.ts`). Hier zusätzlich eine Sperre in
--         der Datenbank, als Trigger statt CHECK: Ein CHECK prüft bei JEDER
--         Änderung der Zeile neu, auch bei einer Namensänderung; ein Partner
--         mit einem alten, schon gesperrten Kürzel könnte dann sein Profil
--         nicht mehr speichern. Der Trigger greift nur, wenn das Kürzel neu
--         gesetzt oder geändert wird. Bestehende Zeilen bleiben unberührt,
--         die Lese-SQL im Bericht listet sie auf.
--
-- OHNE DIESE MIGRATION
--
-- Alles läuft wie bisher: Der Browser findet den Eintrag in `app_config`
-- nicht und nimmt die Konstante im Code (aus), der Server lässt Partner ihre
-- eigenen Zeilen lesen wie vorher, und neue Kürzel kommen nur noch aus den
-- Edge Functions, die die gesperrten schon kennen.
--
-- Wiederholbar: ON CONFLICT DO NOTHING, CREATE OR REPLACE, DROP ... IF EXISTS.
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public.handbuch_anforderungen') IS NULL
     OR to_regprocedure('public.handbuch_kennzahlen(integer,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Zuerst 20260926170000_handbuch_seite.sql und 20260926180000_handbuch_stand_und_leitung.sql ausfuehren, diese Migration baut darauf auf.';
  END IF;
END;
$$;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Der Schalter
-- ---------------------------------------------------------------------------
-- DO NOTHING: Ist er schon freigeschaltet, setzt ein zweiter Lauf ihn nicht
-- wieder aus.
INSERT INTO public.app_config (schluessel, wert)
VALUES ('handbuch_partner_freigeschaltet', '{"aktiv": false}'::jsonb)
ON CONFLICT (schluessel) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handbuch_partner_freigeschaltet()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Nur ein echtes true zählt; fehlt der Eintrag oder steht etwas anderes
  -- darin, bleibt es aus.
  SELECT coalesce(
    (SELECT c.wert -> 'aktiv' = 'true'::jsonb
       FROM public.app_config c
      WHERE c.schluessel = 'handbuch_partner_freigeschaltet'
      LIMIT 1),
    false);
$$;

REVOKE ALL ON FUNCTION public.handbuch_partner_freigeschaltet() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.handbuch_partner_freigeschaltet() TO authenticated;

COMMENT ON FUNCTION public.handbuch_partner_freigeschaltet() IS
  'Handbuch-Seite: ist die Verwaltung fuer Vertriebspartner freigeschaltet? Liest app_config.handbuch_partner_freigeschaltet {"aktiv": bool}, ohne Eintrag false. Migration 20260926220000.';

-- ---------------------------------------------------------------------------
-- 2. Lesen der Anforderungen: Partner nur mit Schalter
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS handbuch_anforderungen_lesen ON public.handbuch_anforderungen;
CREATE POLICY handbuch_anforderungen_lesen
  ON public.handbuch_anforderungen
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'inhaber'::public.app_role)
    OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
    OR (
      berater_id = auth.uid()
      AND (
        public.handbuch_partner_freigeschaltet()
        OR public.has_role(auth.uid(), 'setterin'::public.app_role)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Kennzahlen: identisch mit 20260926180000, dazu der Schalter
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handbuch_kennzahlen(
  p_tage integer DEFAULT 90,
  p_berater_id uuid DEFAULT NULL,
  p_nur_firma boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ich uuid := auth.uid();
  _alles boolean;
  _berater uuid;
  _nur_firma boolean;
  _seit timestamptz := now() - make_interval(days => greatest(coalesce(p_tage, 90), 1));
  _ereignisse jsonb;
  _anforderungen jsonb;
BEGIN
  IF _ich IS NULL THEN
    RETURN NULL;
  END IF;

  _alles := public.has_role(_ich, 'admin'::public.app_role)
         OR public.has_role(_ich, 'inhaber'::public.app_role)
         OR public.has_role(_ich, 'vertriebsleiter'::public.app_role);

  -- HB-008: Ohne Gesamtsicht nur mit Schalter (Setterin ausgenommen).
  IF NOT _alles
     AND NOT public.handbuch_partner_freigeschaltet()
     AND NOT public.has_role(_ich, 'setterin'::public.app_role) THEN
    RETURN NULL;
  END IF;

  -- Wer keine Gesamtsicht hat, sieht nur die eigenen Zahlen, egal was als
  -- Parameter kommt. „Nur Firmenlink“ gibt es nur mit Gesamtsicht.
  _berater := CASE WHEN _alles THEN p_berater_id ELSE _ich END;
  _nur_firma := _alles AND coalesce(p_nur_firma, false);

  SELECT coalesce(jsonb_object_agg(typ, anzahl), '{}'::jsonb) INTO _ereignisse
    FROM (
      SELECT e.typ, count(*) AS anzahl
        FROM public.analysetool_ereignisse e
       WHERE e.werkzeug = 'handbuch'
         AND e.erstellt_am >= _seit
         AND (
           (_nur_firma AND e.berater_id IS NULL)
           OR (NOT _nur_firma AND (_berater IS NULL OR e.berater_id = _berater))
         )
       GROUP BY e.typ
    ) x;

  SELECT jsonb_build_object(
           'gesamt', count(*),
           'passt', count(*) FILTER (WHERE h.ausgang = 'passt'),
           'vielleicht', count(*) FILTER (WHERE h.ausgang = 'vielleicht'),
           'nochNicht', count(*) FILTER (WHERE h.ausgang = 'noch_nicht'),
           'geoeffnet', count(*) FILTER (WHERE h.geoeffnet_am IS NOT NULL),
           'pdfGespeichert', count(*) FILTER (WHERE h.pdf_gespeichert_am IS NOT NULL),
           'ueberPartner', count(*) FILTER (WHERE h.berater_id IS NOT NULL),
           'ueberFirma', count(*) FILTER (WHERE h.berater_id IS NULL),
           'saAusgefuellt', count(*) FILTER (WHERE t.status = 'used')
         )
    INTO _anforderungen
    FROM public.handbuch_anforderungen h
    LEFT JOIN public.sa_fill_tokens t ON t.token = h.sa_token
   WHERE h.erstellt_am >= _seit
     AND (
       (_nur_firma AND h.berater_id IS NULL)
       OR (NOT _nur_firma AND (_berater IS NULL OR h.berater_id = _berater))
     );

  RETURN jsonb_build_object(
    'ereignisse', _ereignisse,
    'anforderungen', _anforderungen,
    'tage', greatest(coalesce(p_tage, 90), 1),
    'nurFirma', _nur_firma
  );
END;
$$;

REVOKE ALL ON FUNCTION public.handbuch_kennzahlen(integer, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.handbuch_kennzahlen(integer, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.handbuch_kennzahlen(integer, uuid, boolean) IS
  'Handbuch-Seite: Trichter und Anforderungen der letzten Tage. Admin, Inhaber, Vertriebsleitung alles, je Partner oder nur Firmenlink; alle anderen nur die eigenen, und nur wenn app_config.handbuch_partner_freigeschaltet aktiv ist (Setterin ausgenommen). Migrationen 20260926180000 und 20260926220000.';

-- ---------------------------------------------------------------------------
-- 4. Gesperrte Kürzel (HB-013)
-- ---------------------------------------------------------------------------
-- Dieselbe Liste wie RESERVIERTE_KUERZEL in supabase/functions/_shared/vp-slug.ts.
CREATE OR REPLACE FUNCTION public.vp_slug_gesperrt(_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(coalesce(_slug, ''))) = ANY (ARRAY['konfigurator', 'selbstauskunft', 'ergebnis']);
$$;

CREATE OR REPLACE FUNCTION public.vp_slug_sperre_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vp_slug IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.vp_slug IS DISTINCT FROM OLD.vp_slug)
     AND public.vp_slug_gesperrt(NEW.vp_slug) THEN
    RAISE EXCEPTION 'Das Kuerzel "%" ist gesperrt, es ist eine feste Adresse unter /handbuch/.', NEW.vp_slug
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vp_slug_sperre ON public.profiles;
CREATE TRIGGER trg_vp_slug_sperre
  BEFORE INSERT OR UPDATE OF vp_slug ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.vp_slug_sperre_pruefen();

COMMENT ON FUNCTION public.vp_slug_sperre_pruefen() IS
  'Sperrt gesperrte Kuerzel (konfigurator, selbstauskunft, ergebnis) als neues oder geaendertes profiles.vp_slug. Bestehende Zeilen bleiben unberuehrt. Migration 20260926220000.';

COMMIT;

-- ---------------------------------------------------------------------------
-- PRUEFEN (Lesen, aendert nichts)
-- ---------------------------------------------------------------------------
--   select public.handbuch_partner_freigeschaltet() as partner_frei,
--          (select wert from public.app_config where schluessel = 'handbuch_partner_freigeschaltet') as eintrag,
--          exists (select 1 from pg_trigger where tgname = 'trg_vp_slug_sperre' and not tgisinternal) as kuerzel_sperre;
