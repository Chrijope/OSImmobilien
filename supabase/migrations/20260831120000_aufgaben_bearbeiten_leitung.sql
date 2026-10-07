-- Aufgaben am Kunden: Admin und Inhaber duerfen bestehende Aufgaben aendern.
--
-- Die UPDATE-Policy aus 20260306134740 erlaubt das Aendern nur dem Ersteller
-- und dem Empfaenger (benutzer_id bzw. zugewiesen_an). Seit Aufgaben im
-- Kundenprofil nachtraeglich bearbeitet werden koennen, soll auch die Leitung
-- eine fremde Aufgabe korrigieren duerfen, etwa wenn der Ersteller im Urlaub
-- ist. Ohne diese Policy laeuft ein solches Update still ins Leere: RLS
-- filtert die Zeile, es gibt keinen Fehler, aber auch keine Aenderung.
--
-- Bewusst nur Aufgaben mit Kontaktbezug: Private Aufgaben ohne kontakt_id
-- bleiben allein beim Ersteller und Empfaenger.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'aufgaben'
      AND policyname = 'Leitung bearbeitet Aufgaben am Kunden'
  ) THEN
    CREATE POLICY "Leitung bearbeitet Aufgaben am Kunden"
      ON public.aufgaben FOR UPDATE TO authenticated
      USING (
        kontakt_id IS NOT NULL
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'inhaber'::public.app_role)
        )
      );
  END IF;
END $$;
