-- ===========================================================================
-- Die Glocke gegen gefaelschte Meldungen abdichten
-- ===========================================================================
--
-- Freigegeben von GL am 28.09.2026.
--
-- WARUM
--
-- Die Einfuegeregel "Nutzer erstellen eigene Benachrichtigungen"
-- (20260915141000) liess jede interne Rolle ueber `is_internal_role` Glocken
-- an JEDEN Nutzer anlegen, mit beliebigem Titel, Text und Link. Ein
-- Vertriebspartner konnte dem Inhaber also eine gefaelschte Meldung mit einem
-- Link auf eine fremde Seite in die Glocke legen (Phishing), oder dem Kunden
-- eines anderen Partners eine Meldung schicken.
--
-- Dasselbe ging auf Umwegen ueber die Warteschlange `scheduled_notifications`:
-- Dort durfte jeder Angemeldete, auch ein Kunde, Zeilen mit beliebigem
-- Empfaenger, beliebiger Rolle und beliebigem Link anlegen. Die Function
-- `process-scheduled-notifications` schreibt sie mit dem Dienstschluessel in
-- die Glocke, an keiner Regel vorbei.
--
-- WAS SICH AENDERT
--
--   1) Der Link einer Glocke muss ein Pfad im CRM sein: genau ein "/" am
--      Anfang, kein "//", kein "/\", keine Steuerzeichen. Oder leer. Das
--      erzwingt ein Ausloeser auf beiden Tabellen, fuer ALLE Schreibwege,
--      auch fuer den Dienstschluessel und die SECURITY-DEFINER-Funktionen.
--
--   2) Glocken an andere Nutzer nur noch, wenn die Datenbank einen Grund
--      kennt (Funktion `darf_glocke_senden`):
--        a) an sich selbst, immer;
--        b) admin, inhaber, vertriebsleiter und backoffice an alle;
--        c) jede interne Rolle an die Stellen im Haus (admin, inhaber,
--           vertriebsleiter, backoffice, hr, buchhaltung, marketing,
--           finanzierungspartner, versicherungsexperte) und an
--           Vertriebspartner;
--        d) an jemanden, mit dem man in einem Chat sitzt (wie bisher);
--        e) interne Rollen an den Zustaendigen und an das Kundenkonto eines
--           Kontakts, den sie betreuen oder sehen duerfen;
--        f) ein Kunde an den Zustaendigen seines eigenen Kontakts.
--      In der Warteschlange geht eine ganze Rolle nur fuer (b), fuer interne
--      Rollen an die Rollen aus (c) ohne die Vertriebspartner, und fuer
--      Kunden allein an den Finanzierungspartner und nur zum eigenen Kontakt
--      (Hinweis aus dem Portal, bonitaetNachFreigabe.ts).
--
--   3) Die Glocke merkt sich, wer sie ausgeloest hat: neue Spalte
--      `absender_id`, vorbelegt mit auth.uid(). Aus dem Browser muss sie
--      gleich dem angemeldeten Nutzer sein, faelschen geht nicht.
--
--   4) Portalzugang und Eigentum am Kontakt (Abschnitt 6). Den Zugang
--      (`meta.authUserId`, `meta.person2.authUserId`) und die
--      Eigentumsschluessel (`erstelltVonId`, `empfehlungsgeberVpId`,
--      `tippgeberBenutzerId`, `setterId`) aendern nur noch Admin und Inhaber,
--      der Dienstschluessel nur an bestehenden Kontakten. Die Regeln e) und
--      f) oben vertrauen diesen Feldern, ebenso alle Kunden- und
--      Partnerregeln. Bisher konnte ein Partner an einem eigenen Kontakt jede
--      Nutzerkennung als Zugang eintragen (und dem Konto damit Glocken
--      schicken und den Kontakt im Portal zeigen), ein Kunde ueber
--      "Kunden erstellen Empfehlungs-Leads" sich selbst als Zugang eines
--      neuen Kontakts, und ein oeffentliches Formular ueber submit-lead
--      beides zugleich.
--
--   5) merge_kontakt_meta (Abschnitt 7) prueft fuer Rollen ohne Blick auf
--      alle Kunden, ob sie den Kontakt betreuen. Bisher setzte jede interne
--      Rolle jedes meta an jedem Kontakt, etwa `erstelltVonId` auf sich
--      selbst, und uebernahm damit fremde Kontakte samt Provision.
--
-- WARUM PARTNER AN PARTNER ERLAUBT BLEIBT
--
-- Ein Vertriebspartner darf jeden Lead an jeden anderen Vertriebspartner
-- abgeben (20260918140000). Die Glocke "Neuer Lead" an den neuen Partner
-- gehoert zu genau diesem Schritt. Sie haengt am Kontakt, dessen
-- Zustaendigkeit gerade wechselt; ob die Glocke vor oder nach dem Speichern
-- ankommt, ist nicht festgelegt. Eine Pruefung ueber den Kontakt wuerde
-- deshalb zufaellig scheitern. Setterin und Finanzierungspartner melden dem
-- Partner ebenso (Termin gebucht, Finanzierung). Gesperrt bleiben fuer
-- Partner: Kunden fremder Partner, Tippgeber, Setterinnen, Objektpartner,
-- Hausverwaltung und alle Konten ohne Rolle.
--
-- WARUM KEINE NEUE FUNKTION "glocke_senden" FUER DEN BROWSER
--
-- Rund 35 Stellen im Browser schreiben Glocken, direkt oder ueber
-- `notifyUser`. Die Regel steht hier in der Einfuegeregel selbst. Damit gilt
-- sie fuer jede dieser Stellen, ohne dass eine davon umgebaut werden muss,
-- und der Browser laeuft vor und nach dieser Migration unveraendert.
--
-- BESTEHENDE ZEILEN
--
-- Werden nicht geloescht und nicht geaendert. Der Ausloeser prueft den Link
-- nur beim Anlegen und wenn der Link selbst geaendert wird. Eine alte Zeile
-- mit fremdem Link laesst sich also weiter als gelesen markieren. (Ein
-- CHECK mit NOT VALID haette das verhindert: Postgres prueft ihn bei jeder
-- Aenderung der Zeile, "Alle gelesen" waere an einer einzigen alten Zeile
-- gescheitert.)
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Der Link zeigt ins CRM
-- ---------------------------------------------------------------------------
--
-- "/\" und Steuerzeichen stehen mit drin, weil der Browser beides zu "//"
-- umdeutet: "/\fremd.example" und "/<Tab>/fremd.example" fuehren sonst auf
-- eine fremde Seite.

CREATE OR REPLACE FUNCTION public.glocke_link_ist_intern(_link text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _link IS NULL
      OR _link = ''
      OR (_link ~ '^/([^/\\]|$)' AND _link !~ '[[:cntrl:]]')
$$;

COMMENT ON FUNCTION public.glocke_link_ist_intern(text) IS
  'Ist dieser Link ein Pfad im CRM? Leer, oder genau ein Schraegstrich am '
  'Anfang, danach kein zweiter und kein Rueckstrich, keine Steuerzeichen. '
  'Migration 20260928160000.';

CREATE OR REPLACE FUNCTION public.glocke_link_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.link IS DISTINCT FROM OLD.link)
     AND NOT public.glocke_link_ist_intern(NEW.link) THEN
    RAISE EXCEPTION 'Eine Glocke darf nur auf eine Seite im CRM zeigen, der Link muss mit einem Schraegstrich beginnen: %', left(NEW.link, 80)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.glocke_link_pruefen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_glocke_link_pruefen ON public.benachrichtigungen;
CREATE TRIGGER trg_glocke_link_pruefen
  BEFORE INSERT OR UPDATE OF link ON public.benachrichtigungen
  FOR EACH ROW EXECUTE FUNCTION public.glocke_link_pruefen();

DROP TRIGGER IF EXISTS trg_glocke_link_pruefen ON public.scheduled_notifications;
CREATE TRIGGER trg_glocke_link_pruefen
  BEFORE INSERT OR UPDATE OF link ON public.scheduled_notifications
  FOR EACH ROW EXECUTE FUNCTION public.glocke_link_pruefen();


-- ---------------------------------------------------------------------------
-- 2) Wer die Glocke ausgeloest hat
-- ---------------------------------------------------------------------------
--
-- Erst die Spalte, dann die Vorbelegung: So bleiben alte Zeilen leer und die
-- Tabelle wird nicht neu geschrieben. Leer heisst auch kuenftig: Server,
-- Zeitplan oder Datenbankfunktion ohne angemeldeten Nutzer.

ALTER TABLE public.benachrichtigungen
  ADD COLUMN IF NOT EXISTS absender_id uuid;

ALTER TABLE public.benachrichtigungen
  ALTER COLUMN absender_id SET DEFAULT auth.uid();

COMMENT ON COLUMN public.benachrichtigungen.absender_id IS
  'Wer die Glocke ausgeloest hat (auth.uid() beim Anlegen). Leer bei Server, '
  'Zeitplan und bei Zeilen vor dem 28.09.2026. Aus dem Browser erzwingt die '
  'Einfuegeregel, dass hier der angemeldete Nutzer steht.';


-- ---------------------------------------------------------------------------
-- 3a) Eine aeltere Fassung dieser Migration aufraeumen
-- ---------------------------------------------------------------------------
--
-- Ein Entwurf hatte `darf_glocke_senden(uuid, text)` ohne Kontakt. Stuende
-- er noch in der Datenbank, waere der Aufruf mit einem Argument mehrdeutig.
-- Erst die Regeln, die ihn nennen koennten, dann die Funktion. Beide Regeln
-- entstehen unten neu.

DROP POLICY IF EXISTS "Glocke nur an erlaubte Empfaenger" ON public.benachrichtigungen;
DROP POLICY IF EXISTS "auth_insert_scheduled_notifications" ON public.scheduled_notifications;
DROP FUNCTION IF EXISTS public.darf_glocke_senden(uuid, text);
DROP TRIGGER IF EXISTS trg_kontakt_portalzugang ON public.kontakte;
DROP FUNCTION IF EXISTS public.kontakt_portalzugang_schuetzen();


-- ---------------------------------------------------------------------------
-- 3) Wer wem eine Glocke schicken darf
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER, weil die Pruefung Rollen und Kontakte fremder Nutzer
-- lesen muss, die der Absender selbst nicht sehen darf. Die Funktion gibt nur
-- ja oder nein zurueck.
--
-- `_ziel_rolle` nur fuer die Warteschlange, die eine ganze Rolle bedienen
-- kann (`target_role`). Dann zaehlt `_empfaenger` nicht, und fuer einen
-- Kunden muss `_kontakt_id` sein eigener Kontakt sein.

CREATE OR REPLACE FUNCTION public.darf_glocke_senden(_empfaenger uuid, _ziel_rolle text DEFAULT NULL, _kontakt_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_intern boolean;
  v_breit boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- b) Leitung und Backoffice melden an alle.
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.role::text IN ('admin', 'inhaber', 'vertriebsleiter', 'backoffice')
  ) THEN
    RETURN true;
  END IF;

  v_intern := COALESCE(public.is_internal_role(v_uid), false);

  -- Ganze Rolle, nur aus der Warteschlange.
  IF _ziel_rolle IS NOT NULL THEN
    -- Nie an alle Vertriebspartner (seit 28.09.2026 gehen Glocken ohne
    -- Zustaendigen an die Zentrale, siehe process-scheduled-notifications).
    IF v_intern THEN
      RETURN _ziel_rolle IN ('admin', 'inhaber', 'vertriebsleiter', 'backoffice', 'hr',
                             'buchhaltung', 'marketing', 'finanzierungspartner',
                             'versicherungsexperte');
    END IF;
    -- Kunde aus dem Portal: Bonitaetsunterlage nach der Freigabe geaendert.
    -- Nur zum eigenen Kontakt.
    RETURN _ziel_rolle = 'finanzierungspartner'
       AND _kontakt_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.kontakte k
          WHERE k.id = _kontakt_id
            AND (k.meta ->> 'authUserId' = v_uid::text
                 OR k.meta -> 'person2' ->> 'authUserId' = v_uid::text)
       );
  END IF;

  IF _empfaenger IS NULL THEN
    RETURN false;
  END IF;

  -- a) An sich selbst.
  IF _empfaenger = v_uid THEN
    RETURN true;
  END IF;

  -- c) Interne an die Stellen im Haus und an Vertriebspartner.
  IF v_intern AND EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _empfaenger
       AND ur.role::text IN ('admin', 'inhaber', 'vertriebsleiter', 'backoffice', 'hr',
                             'buchhaltung', 'marketing', 'finanzierungspartner',
                             'versicherungsexperte', 'vertriebspartner')
  ) THEN
    RETURN true;
  END IF;

  -- d) Gemeinsamer Chat, wie in der bisherigen Regel.
  IF EXISTS (
    SELECT 1
      FROM public.chat_teilnehmer ct1
      JOIN public.chat_teilnehmer ct2 ON ct1.chat_id = ct2.chat_id
     WHERE ct1.benutzer_id = v_uid
       AND ct2.benutzer_id = _empfaenger
  ) THEN
    RETURN true;
  END IF;

  -- e) Interne an Zustaendigen und Kundenkonto eines Kontakts, den sie sehen.
  IF v_intern THEN
    v_breit := COALESCE(public.darf_alle_kunden_sehen(v_uid), false);
    IF EXISTS (
      SELECT 1 FROM public.kontakte k
       WHERE (k.zustaendig_id = _empfaenger
              OR k.meta ->> 'authUserId' = _empfaenger::text
              OR k.meta -> 'person2' ->> 'authUserId' = _empfaenger::text)
         AND (v_breit OR public.is_vp_owner_of_kontakt(v_uid, k.zustaendig_id, k.meta))
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- f) Kunde an den Zustaendigen seines eigenen Kontakts.
  IF EXISTS (
    SELECT 1 FROM public.kontakte k
     WHERE (k.meta ->> 'authUserId' = v_uid::text
            OR k.meta -> 'person2' ->> 'authUserId' = v_uid::text)
       AND (k.zustaendig_id = _empfaenger OR k.berater = _empfaenger::text)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.darf_glocke_senden(uuid, text, uuid) IS
  'Darf der angemeldete Nutzer diesem Empfaenger (oder dieser Rolle) eine '
  'Glocke schicken? Einfuegeregeln auf benachrichtigungen und '
  'scheduled_notifications. Migration 20260928160000.';

REVOKE ALL ON FUNCTION public.darf_glocke_senden(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_glocke_senden(uuid, text, uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) Einfuegeregel der Glocke
-- ---------------------------------------------------------------------------
--
-- Die beiden aeltesten Namen fallen mit, falls sie in der Datenbank noch
-- irgendwo stehen: Jede weitere Einfuegeregel wuerde die neue aushebeln,
-- denn Regeln fuer denselben Befehl gelten mit ODER.

DROP POLICY IF EXISTS "System erstellt Benachrichtigungen" ON public.benachrichtigungen;
DROP POLICY IF EXISTS "Auth erstellt Benachrichtigungen" ON public.benachrichtigungen;
DROP POLICY IF EXISTS "Nutzer erstellen eigene Benachrichtigungen" ON public.benachrichtigungen;
DROP POLICY IF EXISTS "Glocke nur an erlaubte Empfaenger" ON public.benachrichtigungen;
CREATE POLICY "Glocke nur an erlaubte Empfaenger"
  ON public.benachrichtigungen
  FOR INSERT
  TO authenticated
  WITH CHECK (
    absender_id IS NOT DISTINCT FROM (select auth.uid())
    AND public.darf_glocke_senden(benutzer_id)
  );


-- ---------------------------------------------------------------------------
-- 5) Einfuegeregel der Warteschlange
-- ---------------------------------------------------------------------------
--
-- Bisher genuegte `auth.uid() IS NOT NULL`. Ohne Rolle steht in
-- `target_user_id` der Empfaenger, mit Rolle die Nullkennung.

DROP POLICY IF EXISTS "auth_insert_scheduled_notifications" ON public.scheduled_notifications;
CREATE POLICY "auth_insert_scheduled_notifications"
  ON public.scheduled_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN target_role IS NULL THEN public.darf_glocke_senden(target_user_id)
      ELSE public.darf_glocke_senden(NULL, target_role, kontakt_id)
    END
  );


-- ---------------------------------------------------------------------------
-- 6) Portalzugang und Eigentum am Kontakt
-- ---------------------------------------------------------------------------
--
-- Geschuetzt sind zwei Gruppen von Schluesseln in `kontakte.meta`:
--
--   Portalzugang: `authUserId` und `person2.authUserId`. Auf sie verlassen
--   sich die Regeln e) und f) oben und alle Kundenregeln im Portal.
--
--   Eigentum: `erstelltVonId`, `empfehlungsgeberVpId`, `tippgeberBenutzerId`
--   und `setterId`. Die ersten beiden entscheiden ueber die Sichtbarkeit
--   fuer Vertriebspartner (is_vp_owner_of_kontakt), `erstelltVonId`
--   zusaetzlich ueber die Provision, der dritte ueber die Sichtbarkeit fuer
--   Tippgeber. Der Anzeigename `setter` bleibt frei: Die Setterin traegt ihn
--   im Skript an Leads ein, die ihr nicht gehoeren, und keine Regel liest ihn.
--
-- Admin und Inhaber (angemeldet) duerfen alles.
--
-- Dienstschluessel: aendert frei (invite-user schaltet das Portal frei),
-- legt aber keinen Kontakt mit Portalzugang an. submit-lead legt Kontakte
-- aus oeffentlichen Formularen an, und dort darf ein Aufrufer keinen Zugang
-- einschleusen. Das Eigentum setzt submit-lead selbst (Positivliste).
--
-- Alle anderen, auch innerhalb von SECURITY-DEFINER-Funktionen wie
-- merge_kontakt_meta und kontakte_zusammenfuehren (dort bleibt auth.uid()
-- der Aufrufer):
--   * Portalzugang: beim Anlegen entfernt, beim Aendern bleibt der alte
--     Wert. Ausnahmen: Beim Zusammenfuehren wandert ein Zugang von einem
--     Kontakt, den der Aufrufer betreut oder sehen darf, auf einen Kontakt
--     ohne Zugang, und die Dublette am aufgeloesten Kontakt faellt weg.
--     `person2` ausdruecklich auf null ("Person 2 ueberall entfernen")
--     nimmt den Zugang mit. Fehlt `person2` im gespeicherten meta ganz, etwa
--     weil der Zwischenspeicher im Browser aelter ist als Person 2, bleibt
--     die bisherige Person 2 samt Zugang stehen.
--   * Eigentum: beim Anlegen nur der Aufrufer selbst oder der Zustaendige
--     der neuen Zeile, sonst entfernt. So legen Partner, Setterin,
--     create_tippgeber_lead und create_empfehlung_kontakt weiter an wie
--     bisher. Beim Aendern bleibt der alte Wert. Beim Zusammenfuehren
--     behaelt der aeltere Kontakt damit seine eigenen Eintraege.
--
-- Still zuruecksetzen statt abbrechen, wie beim Nachweis der
-- Pixel-Einwilligung (20260927070000): Normales Speichern aus dem CRM,
-- merge_kontakt_meta und das Zusammenfuehren scheitern nie daran.
--
-- SECURITY DEFINER, damit der Blick auf den anderen Kontakt beim
-- Zusammenfuehren nicht von den Leseregeln des Aufrufers abhaengt.

CREATE OR REPLACE FUNCTION public.kontakt_zuordnung_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dienst boolean := auth.uid() IS NULL;
  v_breit boolean;
  alt_meta jsonb := '{}'::jsonb;
  neu_meta jsonb;
  pfad_text text;
  pfad text[];
  schluessel text;
  alt_wert text;
  neu_wert text;
  erlaubt boolean;
BEGIN
  -- Admin und Inhaber.
  IF NOT v_dienst AND COALESCE(public.is_admin_role(v_uid), false) THEN
    RETURN NEW;
  END IF;
  -- Dienstschluessel beim Aendern (invite-user).
  IF v_dienst AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.meta) = 'object' THEN
    alt_meta := OLD.meta;
  END IF;

  -- Ein meta, das kein Objekt ist, nimmt nichts Geschuetztes mit.
  IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN
    IF alt_meta ?| ARRAY['authUserId', 'person2', 'erstelltVonId', 'empfehlungsgeberVpId',
                         'tippgeberBenutzerId', 'setterId'] THEN
      NEW.meta := OLD.meta;
    END IF;
    RETURN NEW;
  END IF;

  neu_meta := NEW.meta;

  -- Portalzugang
  FOREACH pfad_text IN ARRAY ARRAY['{authUserId}', '{person2,authUserId}'] LOOP
    pfad := pfad_text::text[];
    alt_wert := nullif(alt_meta #>> pfad, '');
    neu_wert := nullif(neu_meta #>> pfad, '');
    CONTINUE WHEN alt_wert IS NOT DISTINCT FROM neu_wert;

    IF pfad[1] = 'person2' AND TG_OP = 'UPDATE'
       AND jsonb_typeof(neu_meta -> 'person2') IS DISTINCT FROM 'object' THEN
      -- Ausdruecklich null: "Person 2 ueberall entfernen".
      CONTINUE WHEN jsonb_typeof(neu_meta -> 'person2') = 'null';
      -- Fehlt ganz oder ist kein Objekt: Person 2 bleibt, wie sie war.
      neu_meta := jsonb_set(neu_meta, '{person2}', alt_meta -> 'person2', true);
      CONTINUE;
    END IF;

    IF v_breit IS NULL AND NOT v_dienst THEN
      v_breit := COALESCE(public.darf_alle_kunden_sehen(v_uid), false);
    END IF;

    erlaubt := TG_OP = 'UPDATE' AND (
      -- Zusammenfuehren, Schritt 1: Der Zugang wandert von einem anderen
      -- Kontakt herueber, den der Aufrufer betreut oder sehen darf, auf
      -- einen Kontakt ohne Zugang.
      (alt_wert IS NULL AND EXISTS (
         SELECT 1 FROM public.kontakte k
          WHERE k.id <> NEW.id
            AND (k.meta ->> 'authUserId' = neu_wert
                 OR k.meta -> 'person2' ->> 'authUserId' = neu_wert)
            AND (v_breit OR public.is_vp_owner_of_kontakt(v_uid, k.zustaendig_id, k.meta))))
      -- Zusammenfuehren, Schritt 2: Die Dublette am aufgeloesten Kontakt
      -- faellt weg, weil ein anderer Kontakt denselben Zugang schon traegt.
      OR (neu_wert IS NULL AND EXISTS (
         SELECT 1 FROM public.kontakte k
          WHERE k.id <> NEW.id
            AND (k.meta ->> 'authUserId' = alt_wert
                 OR k.meta -> 'person2' ->> 'authUserId' = alt_wert)))
    );

    IF NOT COALESCE(erlaubt, false) THEN
      IF alt_wert IS NULL THEN
        neu_meta := neu_meta #- pfad;
      ELSE
        neu_meta := jsonb_set(neu_meta, pfad, to_jsonb(alt_wert), true);
      END IF;
    END IF;
  END LOOP;

  -- Eigentum (der Dienstschluessel setzt es frei, siehe oben)
  IF NOT v_dienst THEN
    FOREACH schluessel IN ARRAY ARRAY['erstelltVonId', 'empfehlungsgeberVpId',
                                      'tippgeberBenutzerId', 'setterId'] LOOP
      alt_wert := nullif(alt_meta ->> schluessel, '');
      neu_wert := nullif(neu_meta ->> schluessel, '');
      CONTINUE WHEN alt_wert IS NOT DISTINCT FROM neu_wert;

      erlaubt := TG_OP = 'INSERT'
        AND (neu_wert = v_uid::text OR neu_wert = NEW.zustaendig_id::text);

      IF NOT COALESCE(erlaubt, false) THEN
        IF alt_meta ? schluessel THEN
          neu_meta := jsonb_set(neu_meta, ARRAY[schluessel], alt_meta -> schluessel, true);
        ELSE
          neu_meta := neu_meta - schluessel;
        END IF;
      END IF;
    END LOOP;
  END IF;

  NEW.meta := neu_meta;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kontakt_zuordnung_schuetzen() IS
  'Portalzugang (meta.authUserId, meta.person2.authUserId) und Eigentum '
  '(erstelltVonId, empfehlungsgeberVpId, tippgeberBenutzerId, setterId) an '
  'kontakte.meta: frei nur fuer Admin und Inhaber, Dienstschluessel beim '
  'Aendern. Sonst still zurueckgesetzt, Ausnahmen Zusammenfuehren, Person 2 '
  'entfernen und eigenes Anlegen. Migration 20260928160000.';

REVOKE ALL ON FUNCTION public.kontakt_zuordnung_schuetzen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kontakt_zuordnung ON public.kontakte;
CREATE TRIGGER trg_kontakt_zuordnung
  BEFORE INSERT OR UPDATE OF meta ON public.kontakte
  FOR EACH ROW
  EXECUTE FUNCTION public.kontakt_zuordnung_schuetzen();

-- Die Suche nach dem Portalzugang (Regeln oben, Kundenregeln im Portal)
-- laeuft ueber diese beiden Ausdruecke. Ohne CONCURRENTLY, damit es im
-- SQL-Editor in einem Lauf geht; bei einigen tausend Kontakten dauert das
-- Sekunden.
CREATE INDEX IF NOT EXISTS idx_kontakte_meta_auth_user
  ON public.kontakte ((meta ->> 'authUserId'));
CREATE INDEX IF NOT EXISTS idx_kontakte_meta_person2_auth_user
  ON public.kontakte ((meta -> 'person2' ->> 'authUserId'));


-- ---------------------------------------------------------------------------
-- 7) merge_kontakt_meta nur am Kontakt, den man betreut
-- ---------------------------------------------------------------------------
--
-- Bisher durfte jede interne Rolle ueber diese Funktion jedes meta an jedem
-- Kontakt setzen, auch an Kontakten, die sie nicht sehen darf. Jetzt gilt
-- fuer Rollen ohne Blick auf alle Kunden dieselbe Pruefung wie in der
-- Bearbeiten-Regel auf kontakte (is_vp_owner_of_kontakt, alter Stand).
-- Wer sie nicht besteht, wird wie ein Kunde behandelt: nur die freien
-- Schluessel und nur am eigenen Kontakt. Die Eigentumsschluessel schuetzt
-- zusaetzlich der Ausloeser aus 6), auch hier. Sonst unveraendert zur
-- Fassung 20260916100000.

CREATE OR REPLACE FUNCTION public.merge_kontakt_meta(_kontakt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Schluessel, die ein Kunde an seinem eigenen Kontakt setzen darf
  _erlaubte_schluessel text[] := ARRAY[
    'steuersatzManuell',
    'deletionRequestedAt',
    'deletionRequestedBy',
    'portalErstLogin',
    'portalAktiv',
    'portalFreigeschalten',
    'portalAktivAt'
  ];
  _kontakt_meta jsonb;
  _zustaendig uuid;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
  _result jsonb;
BEGIN
  SELECT meta, zustaendig_id INTO _kontakt_meta, _zustaendig FROM public.kontakte WHERE id = _kontakt_id;
  IF NOT FOUND THEN
    -- Neutrale Meldung: keine Auskunft darueber, ob die UUID existiert
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- auth.uid() IS NULL = Service-Role (Edge Functions), anon hat kein EXECUTE
  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  -- Neu am 28.09.2026: Interne Rollen ohne Blick auf alle Kunden nur am
  -- Kontakt, den sie betreuen (wie die Bearbeiten-Regel auf kontakte).
  IF auth.uid() IS NOT NULL AND COALESCE(_ist_intern, false)
     AND NOT COALESCE(public.darf_alle_kunden_sehen(auth.uid()), false)
     AND NOT COALESCE(public.is_vp_owner_of_kontakt(auth.uid(), _zustaendig, _kontakt_meta), false) THEN
    _ist_intern := false;
  END IF;

  -- Geaendert am 16.09.2026 (Audit F01): Jeder Vergleich einzeln in COALESCE,
  -- sonst wird aus einem fehlenden Schluessel ein unbekannt und die Sperre
  -- wird stillschweigend uebersprungen.
  IF NOT (
    COALESCE(_ist_intern, false)
    OR COALESCE((_kontakt_meta ->> 'authUserId') = auth.uid()::text, false)
    OR COALESCE(((_kontakt_meta -> 'person2') ->> 'authUserId') = auth.uid()::text, false)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _wirksam := COALESCE(_updates, '{}'::jsonb);

  IF NOT _ist_intern THEN
    _wirksam := '{}'::jsonb;
    FOR _schluessel IN SELECT jsonb_object_keys(COALESCE(_updates, '{}'::jsonb)) LOOP
      IF _schluessel = ANY(_erlaubte_schluessel) THEN
        _wirksam := _wirksam || jsonb_build_object(_schluessel, _updates -> _schluessel);
      ELSE
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;

    IF array_length(_verworfen, 1) > 0 THEN
      RAISE LOG 'merge_kontakt_meta: nicht erlaubte Schluessel verworfen (%)',
        array_to_string(_verworfen, ', ');
    END IF;
  END IF;

  -- Nichts Erlaubtes uebrig: unveraenderten Stand zurueckgeben, nicht schreiben
  IF _wirksam = '{}'::jsonb THEN
    RETURN COALESCE(_kontakt_meta, '{}'::jsonb);
  END IF;

  UPDATE kontakte
  SET meta = public.jsonb_deep_merge(COALESCE(meta, '{}'::jsonb), _wirksam),
      aktualisiert_am = now()
  WHERE id = _kontakt_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;


-- ---------------------------------------------------------------------------
-- NACHHER: Pruefabfragen (aendern nichts)
-- ---------------------------------------------------------------------------
--
-- Wie viele alte Glocken zeigen nicht ins CRM, nach Ziel:
--   select coalesce(substring(link from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)'), left(link, 30)) as ziel,
--          count(*) as anzahl
--     from public.benachrichtigungen
--    where not public.glocke_link_ist_intern(link)
--    group by 1 order by 2 desc;
--
-- Genau eine erlaubende Einfuegeregel je Tabelle (FOR ALL zaehlt mit; die
-- einschraenkenden Regeln wie Zwei-Faktor und Kundenportal-Sperre zaehlen
-- nicht, sie heben die Glocken-Regel nicht aus):
--   select tablename, policyname from pg_policies
--    where schemaname = 'public' and tablename in ('benachrichtigungen', 'scheduled_notifications')
--      and cmd in ('INSERT', 'ALL') and permissive = 'PERMISSIVE';
--
-- Kontakte, deren Portalzugang (Person 1 oder Person 2) auf ein Konto ohne
-- Kundenrolle zeigt oder an mehr als einem Kontakt haengt (Hinweis auf eine
-- frueher eingetragene fremde Kennung):
--   select k.id, k.zustaendig_id, z.person, z.zugang,
--          not exists (select 1 from public.user_roles ur
--                       where ur.user_id::text = z.zugang and ur.role = 'kunde') as ohne_kundenrolle,
--          (select count(*) from public.kontakte k2
--            where k2.meta ->> 'authUserId' = z.zugang
--               or k2.meta -> 'person2' ->> 'authUserId' = z.zugang) as anzahl_kontakte
--     from public.kontakte k
--     cross join lateral (values ('1', k.meta ->> 'authUserId'),
--                                ('2', k.meta -> 'person2' ->> 'authUserId')) as z(person, zugang)
--    where nullif(z.zugang, '') is not null
--      and (not exists (select 1 from public.user_roles ur
--                        where ur.user_id::text = z.zugang and ur.role = 'kunde')
--           or (select count(*) from public.kontakte k2
--                where k2.meta ->> 'authUserId' = z.zugang
--                   or k2.meta -> 'person2' ->> 'authUserId' = z.zugang) > 1);
