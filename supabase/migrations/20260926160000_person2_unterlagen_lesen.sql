-- ===========================================================================
-- Person 2 darf im Kundenportal dieselben Unterlagen lesen wie Person 1
-- ===========================================================================
--
-- AUSGANGSLAGE
--
-- Die Leseregel "Kunde read unterlagen" (20260517104329) prueft nur
-- `kontakte.meta.authUserId`, also Person 1. Person 2 (zweite Kaeuferin,
-- zweiter Kaeufer) hat ihren Zugang unter `kontakte.meta.person2.authUserId`
-- und bekam im Kundenportal keine einzige Datei aus dem Eimer `unterlagen`
-- zu sehen: weder ihre eigenen Uploads unter `<kontaktId>/` noch die
-- unterschriebene Selbstauskunft unter `kundenordner/<kontaktId>/`.
-- Hochladen und Loeschen durfte sie schon (20260818130000, 20260901121000),
-- nur das Lesen fehlte.
--
-- WAS DIESE MIGRATION TUT
--
-- Eine zusaetzliche Leseregel, die fuer Person 2 genau die drei Ordner
-- oeffnet, die "Kunde read unterlagen" fuer Person 1 oeffnet. Nicht mehr:
--   * nur Lesen (SELECT). Hochladen, Ersetzen und Loeschen bleiben, wie sie
--     sind;
--   * `<kontaktId>/`, `finanzierung/<kontaktId>/` und
--     `kundenordner/<kontaktId>/`, jeweils nur der eigene Kontakt: der
--     Kontakt, bei dem der angemeldete Nutzer als Person 2 hinterlegt ist.
--
-- "Kunde read unterlagen" selbst bleibt unangetastet. Fuer Person 1 aendert
-- sich also nichts.
--
-- ZUR FREIGABE IM KUNDENORDNER
--
-- Im `kundenordner/` liegen auch Dateien, die Mitarbeiter hochladen und dem
-- Kunden erst einzeln freigeben (Merker `freigegeben` in
-- `kontakte.meta.kundenordner`). Diese Freigabe prueft heute nur die
-- Oberflaeche (src/pages/KundeKundenordner.tsx zeigt nur Freigegebenes),
-- nicht die Leseregel: Person 1 darf im Speicher den ganzen eigenen
-- Kundenordner lesen. Person 2 bekommt mit dieser Regel exakt dasselbe, nicht
-- mehr. Die Dokumenten-Ampel (20260923170000) betrifft Objekt- und
-- Wohnungsunterlagen, nicht diesen Ordner.
--
-- Den Ordner `reservierung/` regelt bereits 20260926150000 fuer beide.
--
-- Der Bestand ist ohne jede Datenaenderung erfasst: Es wird nichts
-- umkopiert, die Regel gilt fuer alle Dateien, die schon dort liegen.
--
-- SOLANGE SIE NICHT GELAUFEN IST
--
-- Es stuerzt nichts ab. Person 2 bekommt wie bisher keine Datei geoeffnet,
-- Person 1 ist nicht betroffen.
--
-- OB SIE GELAUFEN IST
--
--   select exists (select 1 from pg_policies
--                   where schemaname = 'storage' and tablename = 'objects'
--                     and policyname = 'Person 2 liest Kundenunterlagen'
--                     and cmd = 'SELECT') as gelaufen;
--
-- Mehrfach ausfuehrbar.
-- ===========================================================================

DROP POLICY IF EXISTS "Person 2 liest Kundenunterlagen" ON storage.objects;
CREATE POLICY "Person 2 liest Kundenunterlagen"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'unterlagen'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE ((k.meta -> 'person2') ->> 'authUserId') = (SELECT auth.uid()::text)
      AND (
        (storage.foldername(name))[1] = k.id::text
        OR (
          (storage.foldername(name))[1] = 'finanzierung'
          AND (storage.foldername(name))[2] = k.id::text
        )
        OR (
          (storage.foldername(name))[1] = 'kundenordner'
          AND (storage.foldername(name))[2] = k.id::text
        )
      )
  )
);
