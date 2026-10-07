-- ===========================================================================
-- Eigene Terminarten duerfen selbst geloescht werden
-- ===========================================================================
--
-- Bisher durfte nur ein Administrator eine Terminart loeschen. Anlegen und
-- aendern darf sie dagegen jeder Gastgeber selbst (siehe die Regeln
-- "Buchung Terminarten anlegen" und "... aendern"). Sobald der Videocall fuer
-- alle Vertriebspartner offen ist, faellt das auf: Ein versehentlich
-- angelegtes Ereignis bleibt fuer immer im eigenen Buchungskalender stehen,
-- und jede Loeschung muesste ueber die Geschaeftsfuehrung laufen.
--
-- Neu gilt dieselbe Grenze wie beim Aendern: die eigenen Zeilen, und fuer
-- Administratoren alle.

DROP POLICY IF EXISTS "Buchung Terminarten loeschen" ON public.buchung_terminarten;

CREATE POLICY "Buchung Terminarten loeschen"
  ON public.buchung_terminarten
  FOR DELETE
  TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));
