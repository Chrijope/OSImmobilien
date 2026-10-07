-- ===========================================================================
-- Bewerbungen nur noch für HR, Admin, Inhaber und Backoffice
-- ===========================================================================
--
-- WORUM ES GEHT
--
-- GL hat am 27.09.2026 entschieden: Bewerbungen und der
-- Bewerberprozess sind nur noch für die Rollen hr, admin, inhaber und
-- backoffice zugänglich. Bisher durfte jede interne Rolle
-- (`is_internal_role`, darunter Vertriebspartner, Vertriebsleitung,
-- Setterin, Buchhaltung, Marketing, Testaccount) alle Bewerbungen lesen und
-- ändern, die Antworten der Fragebögen lesen, das Mail-Tracking lesen und die
-- Dateien in der Ablage `bewerbungen` öffnen und löschen.
--
-- Die Regel steht an einer Stelle, in `darf_bewerberbereich(uid)`. Dieselben
-- vier Rollen stehen im Browser in `BEWERBERPROZESS_ROLLEN`
-- (`src/lib/bewerberprozessFreigabe.ts`) und in den Edge Functions in
-- `supabase/functions/_shared/bewerber-rollen.ts`.
--
-- WAS SICH ÄNDERT
--
--   bewerbungen             lesen, anlegen, ändern, löschen: die vier Rollen.
--                           Lesen zusätzlich der Bewerber selbst, wenn die
--                           Zeile sein Konto trägt (benutzer_id).
--   bewerber_formular       lesen: die vier Rollen. Schreiben weiter nur die
--                           Edge Functions mit der Service-Rolle.
--   bewerber_mail_tracking  lesen und anlegen: die vier Rollen.
--   Ablage `bewerbungen`    öffnen und löschen: die vier Rollen. Hochladen
--                           in `vertrag/`, `paket-uebersicht/` und
--                           `muster-vertrag/`: die vier Rollen.
--   signature_requests      Die Signaturanfragen der Partnerverträge
--                           (`person_type` `vertrag` und `vertrag_kurz`)
--                           sehen und schreiben nur noch die vier Rollen.
--                           Eine zusätzliche, einschränkende Regel; die
--                           übrigen Regeln der Tabelle bleiben Wort für Wort.
--
-- Unverändert:
--   * Die öffentlichen Wege des Bewerbers ohne Konto (Fragebogen,
--     Kennenlernen, Terminbuchung, Bewerberseite, Abmeldung, Signatur) laufen
--     über SECURITY-DEFINER-Funktionen und Edge Functions mit der
--     Service-Rolle. Sie brauchen keine Regel und bleiben, wie sie sind.
--   * `bewerber_seite` und `bewerber_abmeldung` haben weiterhin keine einzige
--     Regel. Dort liest und schreibt nur die Service-Rolle.
--   * Die Team-Zuordnung in der Datenbank (`team_zuordnung`,
--     `team_mitglieder`) liest die Bewerberzeile als SECURITY DEFINER und
--     bleibt davon unberührt.
--   * Die persönlichen Freigaben aus `bewerberprozessFreigabe.ts` betreffen
--     nur den Videocall-Bereich. Der liest keine Bewerbertabelle, deshalb
--     bekommt hier keine Person eine Ausnahme per Kennung.
--
-- ALLE ALTEN REGELN WEG
--
-- Auf den drei Tabellen werden alle bestehenden Regeln entfernt, nicht nur
-- die namentlich bekannten. In Lovable kann eine Regel ohne Migration
-- entstanden sein, und eine übrig gebliebene Regel mit `is_internal_role`
-- würde die neue Grenze stillschweigend wieder öffnen, denn Regeln derselben
-- Art werden mit ODER verknüpft. In der Ablage gilt dasselbe für jede Regel,
-- deren Bedingung den Eimer `bewerbungen` nennt.
--
-- WIEDERHOLBAR: CREATE OR REPLACE, DROP POLICY IF EXISTS vor jedem CREATE.
-- Ein zweiter Lauf ändert nichts.
--
-- SICHERUNG: heutigen Stand vorher festhalten (ändert nichts)
--
--   select tablename, policyname, cmd, qual, with_check from pg_policies
--    where (schemaname = 'public' and tablename in
--           ('bewerbungen','bewerber_formular','bewerber_mail_tracking'))
--       or (schemaname = 'storage' and tablename = 'objects'
--           and (coalesce(qual,'') || coalesce(with_check,'')) like '%''bewerbungen''%')
--    order by tablename, cmd, policyname;
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Die eine Regel: wer darf in den Bewerberbereich?
-- ---------------------------------------------------------------------------
--
-- Maßgeblich ist jede zugewiesene Rolle in `user_roles`, so wie bei
-- `has_role` im ganzen Projekt. SECURITY DEFINER, damit die Prüfung nicht an
-- der Zeilensicherheit von `user_roles` hängt.

CREATE OR REPLACE FUNCTION public.darf_bewerberbereich(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.user_roles r
     WHERE r.user_id = _uid
       AND r.role::text IN ('hr', 'admin', 'inhaber', 'backoffice')
  );
$$;

COMMENT ON FUNCTION public.darf_bewerberbereich(uuid) IS
  'Bewerbungen und Bewerberprozess: nur hr, admin, inhaber und backoffice '
  '(Entscheidung vom 27.09.2026). Dieselbe Liste steht in '
  'src/lib/bewerberprozessFreigabe.ts und supabase/functions/_shared/bewerber-rollen.ts.';

REVOKE ALL ON FUNCTION public.darf_bewerberbereich(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.darf_bewerberbereich(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Alle bisherigen Regeln der drei Tabellen entfernen
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('bewerbungen', 'bewerber_formular', 'bewerber_mail_tracking')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    RAISE NOTICE 'Regel entfernt: %.%', pol.tablename, pol.policyname;
  END LOOP;
END;
$$;

ALTER TABLE public.bewerbungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bewerber_formular ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bewerber_mail_tracking ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) bewerbungen
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Bewerberbereich sieht Bewerbungen" ON public.bewerbungen;
CREATE POLICY "Bewerberbereich sieht Bewerbungen"
  ON public.bewerbungen
  FOR SELECT
  TO authenticated
  USING (
    (select public.darf_bewerberbereich(auth.uid()))
    OR benutzer_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Bewerberbereich legt Bewerbungen an" ON public.bewerbungen;
CREATE POLICY "Bewerberbereich legt Bewerbungen an"
  ON public.bewerbungen
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.darf_bewerberbereich(auth.uid())));

DROP POLICY IF EXISTS "Bewerberbereich bearbeitet Bewerbungen" ON public.bewerbungen;
CREATE POLICY "Bewerberbereich bearbeitet Bewerbungen"
  ON public.bewerbungen
  FOR UPDATE
  TO authenticated
  USING ((select public.darf_bewerberbereich(auth.uid())))
  WITH CHECK ((select public.darf_bewerberbereich(auth.uid())));

DROP POLICY IF EXISTS "Bewerberbereich loescht Bewerbungen" ON public.bewerbungen;
CREATE POLICY "Bewerberbereich loescht Bewerbungen"
  ON public.bewerbungen
  FOR DELETE
  TO authenticated
  USING ((select public.darf_bewerberbereich(auth.uid())));

-- Das Anlegen und Löschen war bisher ohne Regel und damit im Browser zu. Die
-- Rechte auf Tabellenebene dafür werden ausdrücklich gesetzt, die Regeln oben
-- entscheiden über die Zeilen. `anon` bleibt draußen (20260531131300).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bewerbungen TO authenticated;
REVOKE ALL ON public.bewerbungen FROM anon;

-- ---------------------------------------------------------------------------
-- 4) bewerber_formular (Antworten der Fragebögen)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Bewerberbereich liest Bewerberformulare" ON public.bewerber_formular;
CREATE POLICY "Bewerberbereich liest Bewerberformulare"
  ON public.bewerber_formular
  FOR SELECT
  TO authenticated
  USING ((select public.darf_bewerberbereich(auth.uid())));

-- ---------------------------------------------------------------------------
-- 5) bewerber_mail_tracking
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Bewerberbereich liest Mail-Tracking" ON public.bewerber_mail_tracking;
CREATE POLICY "Bewerberbereich liest Mail-Tracking"
  ON public.bewerber_mail_tracking
  FOR SELECT
  TO authenticated
  USING ((select public.darf_bewerberbereich(auth.uid())));

DROP POLICY IF EXISTS "Bewerberbereich legt Mail-Tracking an" ON public.bewerber_mail_tracking;
CREATE POLICY "Bewerberbereich legt Mail-Tracking an"
  ON public.bewerber_mail_tracking
  FOR INSERT
  TO authenticated
  WITH CHECK ((select public.darf_bewerberbereich(auth.uid())));

-- ---------------------------------------------------------------------------
-- 6) Ablage `bewerbungen` (Vertrags-PDFs, Paketübersicht, Mustervertrag)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%''bewerbungen''%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    RAISE NOTICE 'Ablage-Regel entfernt: %', pol.policyname;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Bewerberbereich liest Bewerbungsdateien" ON storage.objects;
CREATE POLICY "Bewerberbereich liest Bewerbungsdateien"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'bewerbungen'
    AND (select public.darf_bewerberbereich(auth.uid()))
  );

DROP POLICY IF EXISTS "Bewerberbereich laedt Bewerbungsdateien hoch" ON storage.objects;
CREATE POLICY "Bewerberbereich laedt Bewerbungsdateien hoch"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'bewerbungen'
    AND (storage.foldername(name))[1] IN ('vertrag', 'paket-uebersicht', 'muster-vertrag')
    AND (select public.darf_bewerberbereich(auth.uid()))
  );

DROP POLICY IF EXISTS "Bewerberbereich loescht Bewerbungsdateien" ON storage.objects;
CREATE POLICY "Bewerberbereich loescht Bewerbungsdateien"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bewerbungen'
    AND (select public.darf_bewerberbereich(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 7) Signaturanfragen der Partnerverträge
-- ---------------------------------------------------------------------------
--
-- Einschränkend (RESTRICTIVE): Sie wird mit UND an die bestehenden Regeln
-- gehängt und nimmt nur Zeilen der Partnerverträge heraus. Alle anderen
-- Zeilen (Selbstauskunft, Reservierung, Aftersales) gehen unverändert durch.
-- Die Signaturseite ohne Anmeldung und `finalize-vertrag` laufen über
-- SECURITY-DEFINER-Funktionen und die Service-Rolle und sind nicht betroffen.

DROP POLICY IF EXISTS "Partnervertraege nur Bewerberbereich" ON public.signature_requests;
CREATE POLICY "Partnervertraege nur Bewerberbereich"
  ON public.signature_requests
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    coalesce(person_type, '') NOT IN ('vertrag', 'vertrag_kurz')
    OR (select public.darf_bewerberbereich(auth.uid()))
  )
  WITH CHECK (
    coalesce(person_type, '') NOT IN ('vertrag', 'vertrag_kurz')
    OR (select public.darf_bewerberbereich(auth.uid()))
  );

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (ändert nichts): keine Regel der Bewerbertabellen nennt noch
-- is_internal_role. Erwartet: keine Zeile.
--   select tablename, policyname from pg_policies
--    where ((schemaname = 'public' and tablename in
--            ('bewerbungen','bewerber_formular','bewerber_mail_tracking'))
--        or (schemaname = 'storage' and tablename = 'objects'
--            and (coalesce(qual,'') || coalesce(with_check,'')) like '%''bewerbungen''%'))
--      and (coalesce(qual,'') || coalesce(with_check,'')) like '%is_internal_role%';
