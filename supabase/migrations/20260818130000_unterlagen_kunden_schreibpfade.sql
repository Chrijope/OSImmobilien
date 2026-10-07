-- Storage-Haertung fuer den Bucket "unterlagen": Kunden-Schreibzugriff nur
-- noch auf die eigenen Pfade (Stufe 4 der Kundenportal-Sanierung).
--
-- Ausgangslage: Die Policy "unterlagen_auth_write" (Migration 20260517102500)
-- erlaubte jedem eingeloggten Nutzer INSERT auf beliebige Pfade im Bucket.
-- Migration 20260517142705 enthaelt bereits den DROP; er wird hier zur
-- Sicherheit wiederholt, falls die Policy in der Datenbank noch existiert.
-- Ebenso werden zwei noch aeltere Breitband-Policies entsorgt, falls sie
-- den Policy-Wechsel vom Maerz ueberlebt haben.
--
-- Real genutzte Kunden-Schreibpfade laut Frontend-Code:
--   externe-investments/<investmentId>/...   EigeneInvestmentsTab (Belege)
--   <kontaktId>/...                          KundeInvestments (Bonitaetsunterlagen)
--   finanzierung/<kontaktId>/...             Finanzierungsunterlagen (Lesepfad, vorsorglich auch Schreiben)
--   finanzierung/eigen/<kontaktId>/...       Kundenprofilseite (Eigenfinanzierung)
--   chat/<chatId>/...                        KundeChat (Dateianhaenge)
--   mobile-scans/<token>/...                 Mobile-Scan (eigene Token-Policy, bleibt unveraendert)
--
-- Interne Rollen schreiben weiterhin ueberall ("Internal upload unterlagen").
-- Neu ist ausserdem DELETE fuer Kunden auf den eigenen
-- externe-investments-Pfaden, damit der Papierkorb im Portal die Datei
-- wirklich entfernt (bisher blieb sie verwaist im Bucket liegen).

-- 1) Breite Alt-Policies entfernen (falls noch vorhanden)
DROP POLICY IF EXISTS "unterlagen_auth_write" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Unterlagen upload" ON storage.objects;

-- 2) Interne Rollen: ueberall im Bucket schreiben
--    (bestand seit 20260322162011, hier idempotent neu angelegt)
DROP POLICY IF EXISTS "Internal upload unterlagen" ON storage.objects;
CREATE POLICY "Internal upload unterlagen"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'unterlagen' AND public.is_internal_role(auth.uid()));

-- 3) Kunden: eigener Kontaktordner plus Finanzierungs-Pfade.
--    Ersetzt "Kunde upload unterlagen" (bisher nur <kontaktId>/...).
--    person2 wird wie beim Login-Mapping mitgeprueft, damit die zweite
--    Person eines Doppel-Profils weiter hochladen kann.
DROP POLICY IF EXISTS "Kunde upload unterlagen" ON storage.objects;
CREATE POLICY "Kunde upload unterlagen"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'unterlagen'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE (
      (k.meta ->> 'authUserId') = auth.uid()::text
      OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
    )
    AND (
      (storage.foldername(name))[1] = k.id::text
      OR (
        (storage.foldername(name))[1] = 'finanzierung'
        AND (storage.foldername(name))[2] = k.id::text
      )
      OR (
        (storage.foldername(name))[1] = 'finanzierung'
        AND (storage.foldername(name))[2] = 'eigen'
        AND (storage.foldername(name))[3] = k.id::text
      )
    )
  )
);

-- 4) Kunden: Belege zu eigenen externen Investments hochladen
DROP POLICY IF EXISTS "Kunde upload externe Investments" ON storage.objects;
CREATE POLICY "Kunde upload externe Investments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'externe-investments'
  AND EXISTS (
    SELECT 1 FROM public.externe_investments ei
    WHERE ei.id::text = (storage.foldername(name))[2]
      AND ei.user_id = auth.uid()
  )
);

-- 5) Kunden: Belege zu eigenen externen Investments auch loeschen
DROP POLICY IF EXISTS "Kunde loescht externe Investment Unterlagen" ON storage.objects;
CREATE POLICY "Kunde loescht externe Investment Unterlagen"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'externe-investments'
  AND EXISTS (
    SELECT 1 FROM public.externe_investments ei
    WHERE ei.id::text = (storage.foldername(name))[2]
      AND ei.user_id = auth.uid()
  )
);

-- 6) Chat-Anhaenge: Teilnehmer des Chats duerfen hochladen.
--    Gleiches Pfadmuster wie die bestehende Lese-Policy
--    "Chat participants read unterlagen" (20260517104329).
DROP POLICY IF EXISTS "Chat participants upload unterlagen" ON storage.objects;
CREATE POLICY "Chat participants upload unterlagen"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'chat'
  AND public.is_chat_participant(auth.uid(), ((storage.foldername(name))[2])::uuid)
);
