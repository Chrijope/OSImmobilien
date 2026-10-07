-- Aktivitaeten-Ladefehler bei Vertriebspartnern beheben (Partnermeldung, 27.08.2026).
--
-- Die Sichtbarkeitsfunktion kontakt_visible_to_internal (Migration 20260517090623)
-- verglich bisher `k.id::text = _kunde_id_text`. Der Cast auf der Spaltenseite
-- verhindert den Primaerschluessel-Index: Postgres liest fuer JEDE Aktivitaetszeile
-- die komplette Kontakttabelle durch. Bei rund 20000 Aktivitaeten und mehreren
-- tausend Kontakten laeuft die Abfrage fuer Vertriebspartner damit in die
-- 8-Sekunden-Zeitgrenze und der Cache meldet "Aktivitaet konnte nicht geladen
-- werden".
--
-- Fix: den Cast auf die Parameterseite drehen (`k.id = _kunde_id_text::uuid`),
-- dann greift der Index und die Pruefung kostet einen Indexzugriff je Zeile.
-- Der Regex-Wachposten davor stellt sicher, dass der Cast nie fehlschlaegt.
-- Inhaltlich ist die Funktion unveraendert (Stand 20260517090623, keine
-- spaetere Redefinition; die Vertretungslogik aus 20260807150000 steckt in
-- is_vp_owner_of_kontakt und bleibt unberuehrt).

CREATE OR REPLACE FUNCTION public.kontakt_visible_to_internal(_user_id uuid, _kunde_id_text text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Broad-Access Rollen sehen alles
    public.is_admin_role(_user_id)
    OR public.has_role(_user_id, 'hausverwaltung'::app_role)
    OR public.has_role(_user_id, 'buchhaltung'::app_role)
    OR public.has_role(_user_id, 'backoffice'::app_role)
    OR public.has_role(_user_id, 'vertriebsleiter'::app_role)
    OR (
      -- VP-/Setter-Scope: nur wenn kunde_id zu einem eigenen Kontakt zeigt
      _kunde_id_text IS NOT NULL
      AND _kunde_id_text <> ''
      AND _kunde_id_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM public.kontakte k
        WHERE k.id = _kunde_id_text::uuid
          AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
      )
    )
$$;
