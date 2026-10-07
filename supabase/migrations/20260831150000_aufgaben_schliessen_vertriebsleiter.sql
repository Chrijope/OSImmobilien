-- Aufgaben am Kunden: auch der Vertriebsleiter darf fremde Aufgaben aendern.
--
-- Der Papierkorb der Zeitleiste (admin, inhaber, vertriebsleiter) schliesst
-- beim Entfernen eines Aufgaben-Eintrags jetzt auch die echte Aufgabe in der
-- Tabelle aufgaben (Status erledigt, ein UPDATE). Die Policy aus
-- 20260831120000 kannte nur admin und inhaber; beim Vertriebsleiter waere der
-- Aktivitaetseintrag weg, die Aufgabe bliebe aber offen und bestimmte weiter
-- die Anzeige hinter dem Kundennamen.
--
-- DROP + CREATE statt IF NOT EXISTS, damit die Erweiterung auch greift, wenn
-- die Policy aus 20260831120000 bereits angelegt wurde.
DROP POLICY IF EXISTS "Leitung bearbeitet Aufgaben am Kunden" ON public.aufgaben;
CREATE POLICY "Leitung bearbeitet Aufgaben am Kunden"
  ON public.aufgaben FOR UPDATE TO authenticated
  USING (
    kontakt_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'inhaber'::public.app_role)
      OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
    )
  );
