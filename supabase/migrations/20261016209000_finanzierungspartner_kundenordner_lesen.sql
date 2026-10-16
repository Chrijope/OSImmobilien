-- ===========================================================================
-- Finanzierungspartner lesen den Kundenordner eines Investments
-- ===========================================================================
--
-- ANLASS (16.10.2026)
--
--   Der Finanzierungspartner lädt im Kundenprofil, Abschnitt Finanzierung,
--   die Kundenunterlagen als ZIP. Die Dateien im Eimer `unterlagen` darf er
--   schon lesen (`darf_unterlage_lesen` über `darf_alle_kunden_sehen`). Die
--   Zeilen in `kunde_dokumente`, also welche Dateien im Kundenordner liegen,
--   gab `can_manage_kunde_dokumente` aber nur Admin, Inhaber und dem
--   zuständigen Partner heraus. Ohne diese Regel fehlte der Kundenordner im
--   ZIP still.
--
-- WAS DIESE MIGRATION TUT
--
--   Eine zusätzliche, nur lesende Regel: Rolle finanzierungspartner liest
--   Zeilen, die an einem Investment hängen (`investment_id` gesetzt). Kein
--   Anlegen, Ändern oder Löschen, keine anderen Rollen, keine Ordner ohne
--   Investment.
--
-- WIEDERHOLBAR: DROP POLICY IF EXISTS.
--
-- ZURUECK (im SQL-Editor):
--   DROP POLICY IF EXISTS "kunde_dokumente_select_finanzierungspartner" ON public.kunde_dokumente;

DROP POLICY IF EXISTS "kunde_dokumente_select_finanzierungspartner" ON public.kunde_dokumente;
CREATE POLICY "kunde_dokumente_select_finanzierungspartner" ON public.kunde_dokumente
  FOR SELECT TO authenticated
  USING (
    investment_id IS NOT NULL
    AND public.has_role(auth.uid(), 'finanzierungspartner'::public.app_role)
  );
