-- wohnungs_bilder: Leseluecke schliessen
--
-- Befund: Die ursprünglichen SELECT-Policies "Alle sehen WBilder" und
-- "Alle sehen WohnungsBilder" (Migrationen 20260314101936 / 20260314155343)
-- haben USING (true). Die spaeteren Aufraeum-Migrationen 20260316192547 und
-- 20260316192611 haben nur INSERT/UPDATE/DELETE ersetzt, das SELECT blieb offen.
-- Damit kann jeder eingeloggte Nutzer inklusive Kundenrolle alle Wohnungsbilder
-- lesen. Die Migration 20260517150506 hat wohnungen und wohnungs_dokumente
-- bereits auf interne Rollen begrenzt, wohnungs_bilder wurde dabei vergessen.
--
-- Entscheidung: intern-only, kein gescopter Kundenzugriff noetig.
-- Geprueft wurde die Code-Nutzung von wohnungs_bilder:
--   - Interne Seiten (ObjektDetail, WohnungDetail, objekteStore) lesen direkt,
--     die Nutzer haben eine interne Rolle.
--   - Die oeffentlichen und kundenseitigen Ansichten (ExposePublic,
--     ExposePublicV2, KundenansichtObjekt, KundenansichtWohnung,
--     SteuerCockpitCard) beziehen ihre Bilder ueber die Edge Functions
--     get-expose bzw. get-objektvorstellung. Diese laufen mit dem
--     Service-Role-Key und umgehen RLS, sind also nicht betroffen.
--   - Der direkte Supabase-Fallback in KundenansichtWohnung greift zusaetzlich
--     auf wohnungen und objekt_dokumente zu, die schon intern-only sind. Er
--     funktioniert also ohnehin nur fuer interne Nutzer.

DROP POLICY IF EXISTS "Alle sehen WBilder" ON public.wohnungs_bilder;
DROP POLICY IF EXISTS "Alle sehen WohnungsBilder" ON public.wohnungs_bilder;
DROP POLICY IF EXISTS "Nur Interne sehen WohnungsBilder direkt" ON public.wohnungs_bilder;

CREATE POLICY "Nur Interne sehen WohnungsBilder direkt"
ON public.wohnungs_bilder
FOR SELECT
TO authenticated
USING (public.is_internal_role(auth.uid()));
