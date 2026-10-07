-- ===========================================================================
-- Handbuch-Seite: Stand je Lead, Vertriebsleitung mit Gesamtsicht,
-- Kennzahlen nur für den Firmenlink
-- ===========================================================================
--
-- Auftrag vom 26.09.2026 (zweite Runde zur Handbuch-Seite). Baut auf
-- 20260926170000_handbuch_seite.sql auf und muss DANACH laufen.
--
-- WAS DIESE MIGRATION TUT
--
--   1. `handbuch_anforderungen` bekommt die Spalte `pdf_gespeichert_am`, und
--      die neue Funktion `handbuch_pdf_gespeichert(_token)` setzt sie. Wie
--      `handbuch_abrufen` arbeitet sie nur mit dem persönlichen Token.
--   2. Die Vertriebsleitung (Rolle `vertriebsleiter`) liest die Tabelle wie
--      Admin und Inhaber und bekommt in `handbuch_kennzahlen` die
--      Gesamtsicht.
--   3. `handbuch_kennzahlen` bekommt den dritten Parameter `p_nur_firma`
--      (Vorgabe `false`): nur Anfragen und Ereignisse ohne Partner. Die alte
--      Fassung mit zwei Parametern wird ersetzt; ein Aufruf mit zwei
--      Parametern funktioniert weiter, weil der dritte eine Vorgabe hat.
--      Dazu zählt die Übersicht jetzt auch „PDF gespeichert“ aus der Tabelle.
--   4. Neue Funktion `handbuch_lead_staende(p_kontakt_ids)`: je Kontakt der
--      Stand im Trichter (Handbuch gelesen, PDF gespeichert, Selbstauskunft
--      begonnen, Selbstauskunft liegt vor, PDF im Investment). Für die
--      Lead-Verwaltung und das Kundenprofil. Sie gibt nur Zeiten und
--      Merkmale heraus, keine Kontaktdaten, und nur für Kontakte, die der
--      Aufrufer sehen darf: Admin, Inhaber, Vertriebsleitung und Setterin
--      alle (sie verteilen die Leads), sonst nur eigene (zuständig oder über
--      den eigenen Link).
--
-- OHNE DIESE MIGRATION
--
-- Alles läuft weiter: Die Lead-Verwaltung zeigt dann den Stand aus dem
-- Kontakt (höchstens „Handbuch erhalten“) mit einem Hinweis, die Verwaltung
-- blendet „Nur Firmenlink“ mit einem Hinweis aus, die Vertriebsleitung sieht
-- die Übersicht nur mit ihren eigenen Zahlen, und „PDF gespeichert“ zählt
-- nur der Zähler im Browser.
--
-- Wiederholbar: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public.handbuch_anforderungen') IS NULL THEN
    RAISE EXCEPTION 'Zuerst 20260926170000_handbuch_seite.sql ausfuehren, diese Migration baut darauf auf.';
  END IF;
END;
$$;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PDF gespeichert
-- ---------------------------------------------------------------------------
ALTER TABLE public.handbuch_anforderungen
  ADD COLUMN IF NOT EXISTS pdf_gespeichert_am timestamptz;

CREATE OR REPLACE FUNCTION public.handbuch_pdf_gespeichert(_token text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;
  UPDATE public.handbuch_anforderungen
     SET pdf_gespeichert_am = coalesce(pdf_gespeichert_am, now())
   WHERE token = _token
     AND gueltig_bis > now();
END;
$$;

REVOKE ALL ON FUNCTION public.handbuch_pdf_gespeichert(text) FROM public;
GRANT EXECUTE ON FUNCTION public.handbuch_pdf_gespeichert(text) TO anon, authenticated;

COMMENT ON FUNCTION public.handbuch_pdf_gespeichert(text) IS
  'Handbuch-Seite: vermerkt am Handbuch zum Token, dass das PDF geladen wurde (Stand in der Lead-Verwaltung). Nur mit gueltigem Token, gibt nichts zurueck. Migration 20260926180000.';

-- ---------------------------------------------------------------------------
-- 2. Lesen: auch die Vertriebsleitung
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
    OR berater_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3. Kennzahlen: Vertriebsleitung mit Gesamtsicht, dazu „nur Firmenlink“
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.handbuch_kennzahlen(integer, uuid);

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
  'Handbuch-Seite: Trichter und Anforderungen der letzten Tage. Admin, Inhaber, Vertriebsleitung alles, je Partner oder nur Firmenlink; alle anderen nur die eigenen. Migration 20260926180000.';

-- ---------------------------------------------------------------------------
-- 4. Stand je Lead
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handbuch_lead_staende(p_kontakt_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ich uuid := auth.uid();
  _alles boolean;
  _ergebnis jsonb;
BEGIN
  IF _ich IS NULL OR p_kontakt_ids IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  _alles := public.has_role(_ich, 'admin'::public.app_role)
         OR public.has_role(_ich, 'inhaber'::public.app_role)
         OR public.has_role(_ich, 'vertriebsleiter'::public.app_role)
         OR public.has_role(_ich, 'setterin'::public.app_role);

  SELECT coalesce(jsonb_agg(zeile), '[]'::jsonb) INTO _ergebnis
    FROM (
      SELECT jsonb_build_object(
               'kontaktId', k.id,
               'handbuchAm', h.erstellt_am,
               'geoeffnetAm', h.geoeffnet_am,
               'pdfAm', h.pdf_gespeichert_am,
               'saGeoeffnetAm', (
                 SELECT max(coalesce(t.link_opened_at, CASE WHEN t.status = 'used' THEN t.updated_at END))
                   FROM public.sa_fill_tokens t
                  WHERE t.kontakt_id::text = k.id::text   -- Spalte ist text, beide Seiten als Text
               ),
               'saUnterschrieben', EXISTS (
                 SELECT 1 FROM public.investments i
                  WHERE i.kunde_id = k.id
                    AND i.meta->'saSigned' = 'true'::jsonb
               ),
               'saPdfImInvestment', EXISTS (
                 SELECT 1 FROM public.investments i
                  WHERE i.kunde_id = k.id
                    AND i.meta->'saSigned' = 'true'::jsonb
                    AND coalesce(i.meta->>'saPdfPath', '') <> ''
               )
             ) AS zeile
        FROM (SELECT DISTINCT unnest(p_kontakt_ids[1:500]) AS id) ids
        JOIN public.kontakte k ON k.id = ids.id
        LEFT JOIN LATERAL (
          SELECT a.erstellt_am, a.geoeffnet_am, a.pdf_gespeichert_am, a.berater_id
            FROM public.handbuch_anforderungen a
           WHERE a.kontakt_id = k.id
           ORDER BY a.erstellt_am DESC
           LIMIT 1
        ) h ON true
       WHERE _alles
          OR k.zustaendig_id = _ich
          OR h.berater_id = _ich
    ) x;

  RETURN _ergebnis;
END;
$$;

REVOKE ALL ON FUNCTION public.handbuch_lead_staende(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.handbuch_lead_staende(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.handbuch_lead_staende(uuid[]) IS
  'Handbuch-Seite: je Kontakt der Stand im Trichter (gelesen, PDF, Selbstauskunft begonnen, liegt vor, PDF im Investment). Keine Kontaktdaten. Admin, Inhaber, Vertriebsleitung, Setterin alle, sonst nur eigene. Hoechstens 500 Kontakte je Aufruf. Migration 20260926180000.';

COMMIT;

-- ---------------------------------------------------------------------------
-- PRUEFEN (Lesen, aendert nichts)
-- ---------------------------------------------------------------------------
--   select to_regprocedure('public.handbuch_kennzahlen(integer,uuid,boolean)') is not null as kennzahlen,
--          to_regprocedure('public.handbuch_lead_staende(uuid[])') is not null as staende,
--          to_regprocedure('public.handbuch_pdf_gespeichert(text)') is not null as pdf;
