-- ===========================================================================
-- Absicherung Lesen: Kundendokumente, Hausverwaltung, Name zur Aktivierung
-- ===========================================================================
--
-- REIHENFOLGE:
--   1. Push nach main.
--   2. In Lovable ausrollen: redeem-activation-token (liefert den Vornamen
--      zur Aktivierung jetzt selbst).
--   3. Publish in Lovable.
--   4. Dann diese Migration ausfuehren.
-- Laeuft sie vor dem Ausrollen, fehlt auf der Aktivierungsseite nur der
-- Vorname in der Begruessung. Laeuft sie vor dem Publish, zeigt die alte
-- Startseite der Vertriebsleitung die Karte Hausverwaltung mit Nullen.
-- Gespeichert wird in beiden Faellen alles wie bisher.
--
-- WAS VORHER GALT (Stand der Datenbank am 04.10.2026)
--
--   Eimer `unterlagen`: „Internal read unterlagen“ liess jede interne Rolle
--   jede Datei lesen (ausser Chat), also auch Vertriebspartner fremder
--   Kunden, Marketing, HR, Objektpartner, Hausverwaltung und
--   Versicherungsexperte. Eimer `selbstauskunft-pdfs` ebenso
--   („SA-PDFs: internal or owner read“).
--   Hausverwaltung: mieter, eigentuemer, vermietungen, kautionen,
--   versicherungen, zaehlerstaende, betriebskosten und hv_tickets las jede
--   interne Rolle.
--   `lookup_activation_name(text)`: jeder ohne Anmeldung bekam zu einer
--   E-Mail-Adresse den Vornamen des Kontos, also auch die Auskunft, ob es
--   das Konto gibt.
--
-- WAS DIESE MIGRATION TUT
--
--   1. Kundendokumente lesen (`darf_unterlage_lesen`), fuer beide Eimer:
--        Admin und Inhaber: alles, auch Chat-Anhaenge wie bisher.
--        Chat-Anhaenge sonst nur ueber die eigene Teilnehmerregel.
--        Nur interne Rollen; Kunden lesen ueber ihre eigenen Regeln, die
--        bleiben unveraendert.
--        Wer jeden Kunden sieht (`darf_alle_kunden_sehen`: Vertriebsleitung,
--        Backoffice, Finanzierungspartner, Buchhaltung, Setterin,
--        individuell, Testkonto): alles. Das ist dieselbe Grenze wie bei
--        `kontakte`, und es ist auch der Rueckfall fuer Pfade, die keinem
--        Kunden zuzuordnen sind.
--        Eigener Arbeitsordner (erster Ordner = eigene Kennung): ja.
--        Sonst der zustaendige Partner des Kunden samt laufender Vertretung
--        (`is_vp_owner_of_kontakt`).
--      Der Kunde des Pfads kommt aus `unterlagen_pfad_kontakt` (unveraendert),
--      dazu drei Ordner, die sie nicht kennt: `aftersales/<kontakt>/`,
--      `mobile-scans/<token>/` (Kunde nur ueber die Scan-Sitzung mit genau
--      diesem Token; ist sie geloescht, lesen nur Admin, Inhaber und die
--      Gesamtsicht) und `externe-investments/<id>/` (jeder Kontakt, dessen
--      Portalkonto das Investment gehoert).
--      Bewusst NICHT ueber `investments.meta.docFileUrls`: Dort traegt
--      `register_unterlage_upload` jeden Pfad ein, den ein Partner angibt,
--      auch einen fremden. Am 04.10.2026 hingen 7 von 43 Scan-Dateien nur
--      dort, alle bei Kunden, deren Zustaendige ohnehin alles sehen.
--   2. Hausverwaltung lesen nur Rolle hausverwaltung, Admin, Inhaber
--      (`darf_hausverwaltung_lesen`), an acht Tabellen. `dienstleister`
--      bleibt fuer interne Rollen lesbar, die Marketingseite liest sie.
--   3. `lookup_activation_name(text)`: niemand ausser der Dienstrolle darf sie
--      aufrufen. Die Aktivierungsseite bekommt den Vornamen ueber das Token
--      (redeem-activation-token, Aktion info).
--   4. Scan-Sitzungen bleiben stehen: `cleanup_expired_tokens()` loeschte
--      `mobile_scan_sessions` zwei Tage nach Ablauf. Ohne Sitzung fehlt aber
--      die Zuordnung der Scan-Dateien zum Kunden, und der zustaendige Partner
--      verloere den Zugriff. Ein abgelaufenes Token ist trotzdem nutzlos:
--      Jede Token-Regel und jeder Token-Weg (is_mobile_scan_token_valid,
--      is_mobile_scan_token_open, get_mobile_scan_session,
--      update_mobile_scan_session, get_mobile_scan_uploaded_docs) prueft
--      `expires_at > now()`, direktes Lesen der Tabelle ist gesperrt. Die
--      DSGVO-Loeschung eines Kontakts nimmt seine Sitzungen weiter mit. Der
--      Rest der Funktion ist wortgleich zu 20260611210510, Zeitplan und
--      Rechte bleiben.
--
-- NICHT BETROFFEN
--
--   Dienstrolle (Edge Functions lesen und signieren alle Dateien mit dem
--   Dienstschluessel), SECURITY-DEFINER-Funktionen, nicht angemeldete Wege
--   (Mobil-Scan mit gueltigem Token, Unterschriftslinks), alle Schreibregeln
--   (Finanzierungspartner und Buchhaltung behalten ihre Rechte), die
--   Leseregeln der Kunden und der Chat-Teilnehmer.
--
-- WIEDERHOLBAR
--
--   CREATE OR REPLACE und DROP POLICY IF EXISTS.
--
-- ZURUECK (falls noetig, im SQL-Editor)
--
--   Die alten Regeln stehen unten in den Waechtern mit Namen, ihr Wortlaut in
--   20260517090103 und 20260930120000.
--
-- Pruefzeilen 59.1 bis 59.4 in `99_PRUEFUNG.sql`.

BEGIN;

-- Vorab: Eine unbekannte erlaubende Leseregel fuer die beiden Eimer wuerde
-- die neue Grenze aushebeln, ebenso eine Leseregel ohne Eimerbezug, die fuer
-- den ganzen Speicher gilt (etwa USING (true)). Am 04.10.2026 gab es keine
-- solche. Abbruch mit Meldung statt blind entfernen.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT policyname, cmd
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('SELECT', 'ALL')
       AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '''(unterlagen|selbstauskunft-pdfs)'''
       AND policyname NOT IN (
         'Chat participants read unterlagen', 'Externe Investments owner read',
         'Kunde liest eigene Reservierungsvereinbarung', 'Kunde read unterlagen',
         'Mobile scan read by valid token', 'Mobile scan read via token',
         'Person 2 liest Kundenunterlagen',
         -- fallen unten weg bzw. kommen neu
         'Internal read unterlagen', 'SA-PDFs: internal or owner read',
         'Unterlagen lesen nur zustaendig', 'SA-PDFs intern lesen nur zustaendig',
         'SA-PDFs: owner read'
       )
  LOOP
    RAISE EXCEPTION 'Unerwartete erlaubende Leseregel "%" (%) fuer unterlagen oder selbstauskunft-pdfs. Bitte ansehen und in diese Liste aufnehmen oder entfernen, dann diese Migration erneut ausfuehren.',
      regel.policyname, regel.cmd;
  END LOOP;

  FOR regel IN
    SELECT policyname, cmd
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('SELECT', 'ALL')
       AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%bucket_id%'
  LOOP
    RAISE EXCEPTION 'Erlaubende Leseregel "%" (%) auf storage.objects ohne Eimerbezug gefunden. Sie gilt fuer alle Dateien und hebelt die Grenze aus. Bitte ansehen und entfernen oder auf Eimer begrenzen, dann diese Migration erneut ausfuehren.',
      regel.policyname, regel.cmd;
  END LOOP;

  FOR regel IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                         'zaehlerstaende', 'betriebskosten', 'hv_tickets')
       AND permissive = 'PERMISSIVE'
       AND cmd = 'ALL'
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE EXCEPTION 'Erlaubende ALL-Regel %.% gefunden. Bitte zuerst in eine Lese- und eine Schreibregel aufteilen, dann diese Migration erneut ausfuehren.',
      regel.tablename, regel.policyname;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 1) Kundendokumente lesen
-- ---------------------------------------------------------------------------

-- Zu welchem Kontakt gehoert ein Pfad beim Lesen? Wie
-- `unterlagen_pfad_kontakt`, dazu Aftersales und Mobil-Scan. Externe
-- Investments prueft `darf_unterlage_lesen` selbst, dort koennen mehrere
-- Kontakte passen. Nur intern aufgerufen, nicht ueber die Schnittstelle.
CREATE OR REPLACE FUNCTION public.unterlagen_lese_kontakt(_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  teile text[] := storage.foldername(_name);
  uuid_muster constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  treffer uuid;
BEGIN
  IF teile IS NULL OR cardinality(teile) = 0 THEN
    RETURN NULL;
  END IF;

  IF teile[1] = 'aftersales' THEN
    IF teile[2] !~* uuid_muster THEN
      RETURN NULL;
    END IF;
    SELECT k.id INTO treffer FROM public.kontakte k WHERE k.id = teile[2]::uuid;
    RETURN treffer;
  END IF;

  -- Nur die Scan-Sitzung mit genau diesem Token zaehlt. Ohne Sitzung kein
  -- Kunde, siehe Kopf.
  IF teile[1] = 'mobile-scans' THEN
    IF teile[2] IS NULL OR teile[2] = '' THEN
      RETURN NULL;
    END IF;
    SELECT s.kontakt_id INTO treffer FROM public.mobile_scan_sessions s WHERE s.token = teile[2];
    RETURN treffer;
  END IF;

  IF teile[1] = 'externe-investments' THEN
    RETURN NULL;
  END IF;

  RETURN public.unterlagen_pfad_kontakt(_name);
END;
$$;

-- Darf diese interne Person die Datei unter diesem Pfad lesen? Gilt fuer die
-- Eimer `unterlagen` und `selbstauskunft-pdfs`. Kunden haben eigene Regeln.
CREATE OR REPLACE FUNCTION public.darf_unterlage_lesen(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kontakt uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_admin_role(_user_id) THEN
    RETURN true;
  END IF;
  -- Chat-Anhaenge: nur die Teilnehmerregel, wie bisher.
  IF (storage.foldername(_name))[1] = 'chat' THEN
    RETURN false;
  END IF;
  IF NOT public.is_internal_role(_user_id) THEN
    RETURN false;
  END IF;
  -- Wer jeden Kunden sieht, sieht auch jede Unterlage. Darin stecken
  -- Vertriebsleitung, Backoffice und Finanzierungspartner.
  IF public.darf_alle_kunden_sehen(_user_id) THEN
    RETURN true;
  END IF;
  IF (storage.foldername(_name))[1] = _user_id::text THEN
    RETURN true;
  END IF;

  -- Externe Investments: Das Portalkonto kann an mehreren Kontakten haengen
  -- (Hauptperson, Person 2). Jeder davon zaehlt.
  IF (storage.foldername(_name))[1] = 'externe-investments' THEN
    IF coalesce((storage.foldername(_name))[2], '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.externe_investments ei
        JOIN public.kontakte k
          ON (k.meta ->> 'authUserId') = ei.user_id::text
          OR (k.meta -> 'person2' ->> 'authUserId') = ei.user_id::text
       WHERE ei.id = ((storage.foldername(_name))[2])::uuid
         AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
    );
  END IF;

  kontakt := public.unterlagen_lese_kontakt(_name);
  IF kontakt IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.kontakte k
     WHERE k.id = kontakt
       AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
  );
END;
$$;

DROP POLICY IF EXISTS "Internal read unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Unterlagen lesen nur zustaendig" ON storage.objects;
CREATE POLICY "Unterlagen lesen nur zustaendig" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'unterlagen' AND public.darf_unterlage_lesen(auth.uid(), name));

-- Die alte Regel trug interne Rollen und Kunden zugleich. Der Kundenteil
-- bleibt wortgleich als eigene Regel stehen.
DROP POLICY IF EXISTS "SA-PDFs: internal or owner read" ON storage.objects;
DROP POLICY IF EXISTS "SA-PDFs intern lesen nur zustaendig" ON storage.objects;
CREATE POLICY "SA-PDFs intern lesen nur zustaendig" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'selbstauskunft-pdfs' AND public.darf_unterlage_lesen(auth.uid(), name));
DROP POLICY IF EXISTS "SA-PDFs: owner read" ON storage.objects;
CREATE POLICY "SA-PDFs: owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'selbstauskunft-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.kontakte k
       WHERE k.id::text = (storage.foldername(objects.name))[1]
         AND ((k.meta ->> 'authUserId') = auth.uid()::text
              OR (k.meta -> 'person2' ->> 'authUserId') = auth.uid()::text)
    )
  );


-- ---------------------------------------------------------------------------
-- 2) Hausverwaltung lesen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.darf_hausverwaltung_lesen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    _user_id IS NOT NULL
    AND (public.is_admin_role(_user_id)
         OR public.has_role(_user_id, 'hausverwaltung'::public.app_role)),
    false)
$$;

DO $$
DECLARE
  regel RECORD;
  tabelle text;
BEGIN
  FOR regel IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                         'zaehlerstaende', 'betriebskosten', 'hv_tickets')
       AND permissive = 'PERMISSIVE'
       AND cmd = 'SELECT'
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE NOTICE 'Leseregel entfernt: %.%', regel.tablename, regel.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', regel.policyname, regel.tablename);
  END LOOP;

  FOREACH tabelle IN ARRAY ARRAY['mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                                 'zaehlerstaende', 'betriebskosten', 'hv_tickets'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING ((SELECT public.darf_hausverwaltung_lesen(auth.uid())))',
      'Hausverwaltung liest', tabelle);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 3) Scan-Sitzungen nicht mehr loeschen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation int := 0;
  v_sa int := 0;
  v_unsub int := 0;
  v_sig int := 0;
BEGIN
  DELETE FROM public.activation_tokens
   WHERE (expires_at IS NOT NULL AND expires_at < now() - interval '7 days')
      OR (used_at   IS NOT NULL AND used_at   < now() - interval '30 days');
  GET DIAGNOSTICS v_activation = ROW_COUNT;

  DELETE FROM public.sa_fill_tokens
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v_sa = ROW_COUNT;

  DELETE FROM public.email_unsubscribe_tokens
   WHERE used_at IS NOT NULL AND used_at < now() - interval '90 days';
  GET DIAGNOSTICS v_unsub = ROW_COUNT;

  -- mobile_scan_sessions bleiben stehen, siehe Kopf Punkt 4.

  DELETE FROM public.signature_requests
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '180 days';
  GET DIAGNOSTICS v_sig = ROW_COUNT;

  RETURN jsonb_build_object(
    'activation_tokens', v_activation,
    'sa_fill_tokens', v_sa,
    'email_unsubscribe_tokens', v_unsub,
    'mobile_scan_sessions', 0,
    'signature_requests', v_sig,
    'ran_at', now()
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 4) Rechte
-- ---------------------------------------------------------------------------

-- Nur aus `darf_unterlage_lesen` heraus (laeuft als Eigentuemer), nicht
-- ueber die Schnittstelle: Sonst liesse sich zu jedem Pfad der Kunde abfragen.
REVOKE ALL ON FUNCTION public.unterlagen_lese_kontakt(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.darf_unterlage_lesen(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_unterlage_lesen(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.darf_hausverwaltung_lesen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_hausverwaltung_lesen(uuid) TO authenticated;

-- Kein Aufrufer mehr im Browser. Die Dienstrolle behaelt das Recht.
REVOKE ALL ON FUNCTION public.lookup_activation_name(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_activation_name(text) TO service_role;

COMMIT;
