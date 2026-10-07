-- Admin und Vertriebsleiter müssen jeden Aktivitätseintrag lesen können.
--
-- Gemeldeter Fall: Ein Vertriebspartner legt Follow-ups und Notizen an einem
-- Kunden an. Er sieht sie, die Leitung sieht sie nicht.
--
-- Ursache in der Datenbank: Die Zeitleiste im Kundenprofil speist sich aus
-- zwei Quellen, aus public.aktivitaeten und aus public.activity_log. Für
-- aktivitaeten ist die Sichtbarkeit über kontakt_visible_to_internal geregelt,
-- das Admin, Inhaber und Vertriebsleiter ausdrücklich einschliesst. Für
-- activity_log gilt dagegen bis heute:
--
--   has_role(admin) OR has_role(inhaber) OR actor_id = auth.uid()
--   OR EXISTS (kontakte k WHERE k.id = kontakt_id AND k.zustaendig_id = auth.uid())
--
-- Der Vertriebsleiter fehlt darin vollständig. Er sieht aus dieser Quelle nur,
-- was er selbst geschrieben hat oder wofür er persönlich zuständig ist.
-- Backoffice, Buchhaltung und Hausverwaltung fehlen ebenso.
--
-- Zweiter Unterschied: activity_log prüft die Zuständigkeit nur über
-- k.zustaendig_id, während aktivitaeten und follow_ups über
-- is_vp_owner_of_kontakt zusätzlich meta.erstelltVonId und
-- meta.empfehlungsgeberVpId anerkennen. Dieselbe Zeitleiste zeigte deshalb je
-- nach Quelle unterschiedlich viel. Beides wird hier angeglichen.

DROP POLICY IF EXISTS "activity_log_select_visible" ON public.activity_log;

CREATE POLICY "activity_log_select_visible"
ON public.activity_log
FOR SELECT
TO authenticated
USING (
  -- Leitung und die internen Fachrollen sehen alles. Genau dieselbe Regel,
  -- die kontakt_visible_to_internal für aktivitaeten und follow_ups anwendet.
  public.is_admin_role(auth.uid())
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
  OR public.has_role(auth.uid(), 'backoffice'::app_role)
  OR public.has_role(auth.uid(), 'buchhaltung'::app_role)
  OR public.has_role(auth.uid(), 'hausverwaltung'::app_role)
  -- Wer den Eintrag selbst erzeugt hat, sieht ihn weiterhin.
  OR activity_log.actor_id = auth.uid()
  -- Ein Vertriebspartner sieht die Einträge an seinen eigenen Kunden, nach
  -- derselben Eigentumsregel wie überall sonst.
  OR EXISTS (
    SELECT 1
    FROM public.kontakte k
    WHERE k.id = activity_log.kontakt_id
      AND public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta)
  )
);

-- Beim Schreiben fehlte die Klammerung. Durch die Vorrangregel von OR vor AND
-- las sich die Bedingung als "actor_id IS NULL ODER ...", womit jeder
-- angemeldete Nutzer einen Eintrag mit leerem Urheber anlegen konnte. Ein
-- Eintrag ohne Urheber ist in einem Protokoll wertlos.
DROP POLICY IF EXISTS "activity_log_insert_own" ON public.activity_log;

CREATE POLICY "activity_log_insert_own"
ON public.activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_internal_role(auth.uid())
  AND (
    activity_log.actor_id = auth.uid()
    OR public.is_admin_role(auth.uid())
  )
);

-- Die INSERT-Regeln für aktivitaeten und follow_ups prüfen bisher nur, ob der
-- Schreibende überhaupt eine interne Rolle hat. Damit kann jeder interne
-- Nutzer einen Eintrag an einen beliebigen fremden Kontakt hängen, auch an
-- einen, den er selbst nie zu sehen bekommt. Gelesen werden darf er dann
-- nicht, geschrieben schon. Das wird an die Leseregel angeglichen.
DROP POLICY IF EXISTS "Interne erstellen Aktivitaeten" ON public.aktivitaeten;

CREATE POLICY "Interne erstellen Aktivitaeten (scoped)"
ON public.aktivitaeten
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_internal_role(auth.uid())
  AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
);

DROP POLICY IF EXISTS "Interne erstellen FollowUps" ON public.follow_ups;

CREATE POLICY "Interne erstellen FollowUps (scoped)"
ON public.follow_ups
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_internal_role(auth.uid())
  AND public.kontakt_visible_to_internal(auth.uid(), follow_ups.kunde_id)
);

-- Ohne Index läuft die Zeitleiste eines Kunden bei wachsendem Protokoll in
-- einen Sequential Scan.
CREATE INDEX IF NOT EXISTS idx_activity_log_kontakt_zeit
  ON public.activity_log (kontakt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aktivitaeten_kunde_datum
  ON public.aktivitaeten (kunde_id, datum DESC);
