-- ===========================================================================
-- Kunde darf seine unterschriebene Reservierungsvereinbarung lesen
-- ===========================================================================
--
-- AUSGANGSLAGE
--
-- `finalize-reservierung` legt die unterschriebene Vereinbarung unter
-- `reservierung/<kontaktId>/<investmentId>/` im Eimer `unterlagen` ab und
-- traegt den Pfad am Investment ein (docFileUrls.Reservierungsvertrag,
-- rvPdfPath, Kundenordner). Die Leseregel "Kunde read unterlagen"
-- (20260517104329) kennt fuer Kunden aber nur `<kontaktId>/`,
-- `finanzierung/<kontaktId>/` und `kundenordner/<kontaktId>/`. Den Ordner
-- `reservierung/` darf die Rolle Kunde nicht lesen. Der Knopf
-- "Reservierungsvertrag herunterladen" im Kundenportal tat deshalb still
-- gar nichts, auch fuer alle schon abgelegten Vereinbarungen.
--
-- Person 2 (zweite Kaeuferin, zweiter Kaeufer) war doppelt ausgesperrt:
-- "Kunde read unterlagen" prueft nur `meta.authUserId`, nicht
-- `meta.person2.authUserId`. Die Investments darf sie laut
-- "Kunden sehen eigene Investments" lesen, den Pfad sieht sie also, die
-- Datei nicht. Die Vereinbarung hat sie aber selbst mitunterschrieben.
--
-- WAS DIESE MIGRATION TUT
--
-- Eine zusaetzliche, eng gefasste Leseregel. Sonst nichts:
--   * nur Lesen (SELECT). Hochladen, Ersetzen und Loeschen bleiben unter
--     `reservierung/` den internen Rollen vorbehalten, wie bisher;
--   * nur der Ordner `reservierung/`;
--   * nur der eigene Kontakt: Die zweite Ordnerebene muss die Kennung des
--     Kontakts sein, bei dem der angemeldete Nutzer als Person 1 oder
--     Person 2 hinterlegt ist. Dasselbe Muster wie "Kunde upload unterlagen"
--     (20260818130000) und "Kunde loescht unterlagen" (20260901121000).
--
-- Der Bestand ist damit ohne jede Datenaenderung erfasst: Es wird nichts
-- umkopiert, die Regel gilt fuer alle Dateien, die schon dort liegen.
--
-- BEWUSST NICHT TEIL DAVON
--
-- `kundenordner/` fuer Person 2. Dort liegen auch Dateien, die Mitarbeiter
-- hochladen und im Kundenordner erst einzeln freigeben (`freigegeben`).
-- Diese Freigabe prueft heute nur die Oberflaeche, nicht die Leseregel. Sie
-- auf eine weitere Person auszudehnen, waere eine eigene Entscheidung.
--
-- WARUM KEINE EDGE FUNCTION MIT SIGNIERTER ADRESSE
--
-- Waere ebenso sicher, aber mehr bewegliche Teile: eine neue oeffentlich
-- erreichbare Function mit eigener Berechtigungspruefung, die erst
-- ausgerollt werden muss. Die Leseregel prueft dasselbe in der Datenbank,
-- dort, wo auch alle anderen Kundenpfade geprueft werden.
--
-- SOLANGE SIE NICHT GELAUFEN IST
--
-- Es stuerzt nichts ab. Der Knopf im Portal erzeugt das PDF wie frueher aus
-- den Angaben und Unterschriften am Investment
-- (src/lib/reservierungsvereinbarungKunde.ts), statt still nichts zu tun.
--
-- OB SIE GELAUFEN IST
--
--   select exists (select 1 from pg_policies
--                   where schemaname = 'storage' and tablename = 'objects'
--                     and policyname = 'Kunde liest eigene Reservierungsvereinbarung'
--                     and cmd = 'SELECT') as gelaufen;
--
-- Mehrfach ausfuehrbar.
-- ===========================================================================

DROP POLICY IF EXISTS "Kunde liest eigene Reservierungsvereinbarung" ON storage.objects;
CREATE POLICY "Kunde liest eigene Reservierungsvereinbarung"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'reservierung'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id::text = (storage.foldername(name))[2]
      AND (
        (k.meta ->> 'authUserId') = (SELECT auth.uid()::text)
        OR ((k.meta -> 'person2') ->> 'authUserId') = (SELECT auth.uid()::text)
      )
  )
);
