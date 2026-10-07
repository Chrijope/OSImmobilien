-- ===========================================================================
-- Terminarten anlegen: auch HR, Vertriebsleitung und Vertriebspartner
-- ===========================================================================
--
-- AUSGANGSLAGE
--
-- Bisher durfte nur eine Adminrolle eine Terminart anlegen:
--
--   WITH CHECK (mitarbeiter_id = auth.uid() AND public.is_admin_role(auth.uid()))
--
-- Aendern und Loeschen der EIGENEN Terminarten war dagegen schon immer fuer
-- jeden erlaubt. Diese Asymmetrie hatte eine unangenehme Folge: Wer keine
-- Adminrolle hat, konnte seinen Buchungskalender nicht in Betrieb nehmen,
-- weil ihm die erste Terminart fehlte. Fuer die HR-Managerin heisst das
-- konkret: Ohne eine Terminart mit dem Anlass `bewerbergespraech` findet
-- `bewerber_termin_gastgeber()` sie nicht, und kein Bewerber kann buchen.
--
-- WARUM DAS GEFAHRLOS IST
--
-- Eine Terminart gehoert immer genau einer Person. `mitarbeiter_id` steht in
-- jeder Regel dieser Tabelle, `ladeTerminarten` filtert danach, und die
-- Buchungsstrecke fuehrt ueber den persoenlichen Link. Niemand sieht oder
-- aendert damit die Terminart eines anderen. Es gibt keinen gemeinsamen
-- Bestand, der beschaedigt werden koennte.
--
-- `mitarbeiter_id = auth.uid()` bleibt deshalb die tragende Bedingung. Sie
-- allein verhindert, dass jemand eine Terminart im Namen eines anderen
-- anlegt.
--
-- WARUM TROTZDEM NICHT JEDER
--
-- Die Rollen sind ausdruecklich benannt und nicht weggelassen. `kunde`,
-- `tippgeber` und `bewerber` haben im CRM keinen Buchungskalender; ohne die
-- Aufzaehlung stuende ihnen die Tabelle offen, sobald jemand die Route einmal
-- anders schuetzt. Zugriffskontrolle gehoert in die Datenbank, nicht in einen
-- ausgeblendeten Knopf.
--
-- Wiederholbar: die Regel wird ersetzt, nicht ergaenzt.
-- ===========================================================================

DROP POLICY IF EXISTS "Buchung Terminarten anlegen" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten anlegen" ON public.buchung_terminarten
  FOR INSERT TO authenticated
  WITH CHECK (
    mitarbeiter_id = auth.uid()
    AND (
      public.is_admin_role(auth.uid())
      OR public.has_role(auth.uid(), 'hr')
      OR public.has_role(auth.uid(), 'vertriebsleiter')
      OR public.has_role(auth.uid(), 'vertriebspartner')
    )
  );

-- Prueflauf: Wer darf jetzt anlegen?
--   select polname, pg_get_expr(polwithcheck, polrelid)
--     from pg_policy
--    where polrelid = 'public.buchung_terminarten'::regclass
--      and polname = 'Buchung Terminarten anlegen';
