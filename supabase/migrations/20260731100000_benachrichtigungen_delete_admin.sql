-- Benachrichtigungen: Löschen für Admin und Inhaber erlauben
--
-- Auf `benachrichtigungen` gab es bisher überhaupt keine DELETE-Policy. Bei
-- aktivem RLS bedeutet das: Löschen ist für jeden blockiert, auch für Admins.
-- Zwei Stellen im CRM räumen aber beim Löschen eines Nutzers dessen
-- Benachrichtigungen mit auf:
--   src/pages/Nutzerverwaltung.tsx   (Nutzer löschen)
--   src/pages/TeampartnerProfil.tsx  (Teampartner löschen)
-- Beide Löschversuche liefen still ins Leere. Zurück blieben Zeilen mit
-- personenbezogenen Texten zu einem Nutzer, den es nicht mehr gibt. Bei einer
-- Löschung nach Art. 17 DSGVO ist das der falsche Zustand.
--
-- Bewusst eng gefasst: Nur Admin und Inhaber dürfen löschen. Normale Nutzer und
-- Kunden brauchen kein Löschrecht, sie markieren Benachrichtigungen lediglich
-- als gelesen (UPDATE auf `gelesen`), was die bestehende Policy schon abdeckt.
--
-- Mehrfach ausführbar: Der DROP davor macht die Migration wiederholbar.

DROP POLICY IF EXISTS "Admins loeschen Benachrichtigungen" ON public.benachrichtigungen;

CREATE POLICY "Admins loeschen Benachrichtigungen"
ON public.benachrichtigungen
FOR DELETE
TO authenticated
USING (public.is_admin_role(auth.uid()));
