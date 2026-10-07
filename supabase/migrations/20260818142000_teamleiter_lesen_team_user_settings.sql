-- ===========================================================================
-- Teamleiter duerfen die user_settings ihrer Teampartner LESEN
-- ===========================================================================
--
-- Hintergrund: Die Anzeige der Provisionssaetze (getEffectiveRateInfoForKontakt
-- in src/lib/karriereStufeHelper.ts) liest custom_provision_rate*,
-- karriere_override und provision_locked aus dem user_settings-Cache. Lesen
-- fremder Zeilen duerfen bisher nur der Nutzer selbst, Admin/Inhaber
-- (20260404083625) sowie die App-Rollen buchhaltung und vertriebsleiter
-- pauschal (20260729080000).
--
-- Ein Team Lead oder Lizenzpartner ist aber eine KARRIERESTUFE
-- (karriere_override 'manager' bzw. 'vertriebsfirma'), keine App-Rolle. Wer
-- als App-Rolle nur 'vertriebspartner' hat, sah die Settings seiner
-- Teampartner nicht. Folge: Der Browser rechnete deren Saetze mit dem stillen
-- Fallback, und beim Anlegen eines Investments fuer einen Teampartner wurden
-- faelschlich 3 % eingefroren. Das Einfrieren macht inzwischen die Datenbank
-- selbst (20260818140000), aber auch die ANZEIGE beim Teamleiter braucht die
-- echten Saetze.
--
-- Wer zum Team gehoert, beantwortet public.team_mitglieder aus
-- 20260807160000_team_zuordnung.sql, der einzigen Wahrheit fuer
-- Team-Abfragen (Quellen: user_settings.teamleader_id, geworben_von_user_id
-- und die Bewerberzeile). Damit lesen auch Werber die Settings der von ihnen
-- geworbenen Partner; das ist gewollt, denn die Junior-Override-Anzeige
-- (src/lib/juniorOverrideLogic.ts) rechnet fuer genau diese Leute mit genau
-- diesen Saetzen.
--
-- Nur SELECT. Schreiben laeuft weiterhin ausschliesslich ueber
-- merge_user_settings mit dessen Lock- und Admin-Pruefung.
--
-- VORAUSSETZUNG: 20260807160000_team_zuordnung.sql (liefert
-- public.team_mitglieder). Ohne sie bricht diese Migration mit einer klaren
-- Meldung ab, statt eine kaputte Policy anzulegen.

DO $$
BEGIN
  IF to_regprocedure('public.team_mitglieder(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Zuerst 20260807160000_team_zuordnung.sql ausfuehren, diese Migration braucht public.team_mitglieder.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Teamleiter lesen user_settings ihres Teams" ON public.user_settings;
CREATE POLICY "Teamleiter lesen user_settings ihres Teams"
ON public.user_settings
FOR SELECT
TO authenticated
USING (
  user_id IN (SELECT m.mitglied_id FROM public.team_mitglieder(auth.uid()) m)
);
