-- ===========================================================================
-- Exposés lesen nur, solange man den Kunden noch sehen darf
-- ===========================================================================
--
-- Prüfung Codex vom 05.10.2026: Seit Vertriebspartner Kundenlinks senden und
-- das interne Exposé öffnen, liest der Ersteller eine Zeile aus
-- `objekt_exposes` dauerhaft (Regel aus 20260902200000), auch wenn der Kunde
-- längst an einen anderen Partner übergeben ist. Die Zeile trägt Annahmen,
-- Token und Versanddaten zu genau diesem Kunden.
--
-- Neu:
--   - Admin und Inhaber lesen alles, wie bisher.
--   - Ohne Kundenbezug (neutrale Vorschau) liest nur der Ersteller.
--   - Mit Kundenbezug lesen der Zuständige wie bisher und der Ersteller nur,
--     solange er den Kontakt sehen darf: `darf_alle_kunden_sehen` oder
--     `is_vp_owner_of_kontakt` (eigene und vertretene Kunden).
--
-- Unberührt: die Dienstrolle. `get-expose`, `get-kundenansicht` und
-- `send-kunden-expose` lesen mit dem Dienstschlüssel, Kundenlinks bleiben
-- also erreichbar. Anlegen, Ändern und Löschen bleiben, wie sie sind.
--
-- Ändert keine Daten, wiederholbar. Ohne sie gilt die alte Regel weiter.
-- ===========================================================================

DO $$
BEGIN
  IF to_regprocedure('public.darf_alle_kunden_sehen(uuid)') IS NULL
     OR to_regprocedure('public.is_vp_owner_of_kontakt(uuid, uuid, jsonb)') IS NULL
     OR to_regprocedure('public.is_admin_role(uuid)') IS NULL THEN
    RAISE EXCEPTION 'darf_alle_kunden_sehen, is_vp_owner_of_kontakt oder is_admin_role fehlt, bitte zuerst 20260916190000 und 20260807150000 ausfuehren.';
  END IF;
  IF to_regclass('public.objekt_exposes') IS NULL THEN
    RAISE EXCEPTION 'Tabelle objekt_exposes fehlt, bitte zuerst 20260902200000 ausfuehren.';
  END IF;
END $$;

DROP POLICY IF EXISTS "Exposes lesen" ON public.objekt_exposes;
CREATE POLICY "Exposes lesen"
  ON public.objekt_exposes FOR SELECT TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR (
      objekt_exposes.kontakt_id IS NULL
      AND objekt_exposes.erstellt_von = auth.uid()
    )
    OR (
      objekt_exposes.kontakt_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.kontakte k
        WHERE k.id = objekt_exposes.kontakt_id
          AND (
            k.zustaendig_id = auth.uid()
            OR (
              objekt_exposes.erstellt_von = auth.uid()
              AND (
                COALESCE(public.darf_alle_kunden_sehen(auth.uid()), false)
                OR COALESCE(public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta), false)
              )
            )
          )
      )
    )
  );

-- Zum Schluss: der Stand danach. Erwartet: true.
SELECT EXISTS (
  SELECT 1 FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'objekt_exposes' AND policyname = 'Exposes lesen'
     AND qual LIKE '%darf_alle_kunden_sehen%' AND qual LIKE '%is_vp_owner_of_kontakt%'
) AS leseregel_nach_kundenzugriff;

-- Nachsehen (aendert nichts): Pruefzeile 86.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
