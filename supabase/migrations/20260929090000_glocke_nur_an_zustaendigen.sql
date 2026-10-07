-- ===========================================================================
-- Glocke nur an den Zustaendigen (Teil 2 zur Regel vom 29.09.2026)
-- ===========================================================================
--
-- GL-Regel vom 29.09.2026: Jede Rolle bekommt Glocken nur zu Leads
-- und Kontakten, die ihr tatsaechlich zugewiesen sind. Massgeblich ist der
-- aktuell hinterlegte Zustaendige (kontakte.zustaendig_id).
--
-- In der Datenbank verletzen zwei Stellen die Regel.
--
-- 1) create_empfehlung_kontakt (Kunde empfiehlt im Portal jemanden). Findet die
-- Funktion zur Empfehlung einen bestehenden Kontakt mit gleicher E-Mail oder
-- Telefonnummer (Dublette), legt sie keinen neuen an, schickt die Glocke aber
-- trotzdem an den Partner des Empfehlenden, mit Namen und Link des
-- bestehenden Kontakts. Der kann einem anderen Partner gehoeren oder keinem.
--
-- Jetzt: Gehoert die Dublette nicht dem Partner des Empfehlenden, geht die
-- Glocke an die Leitung (admin, inhaber, vertriebsleiter, jede Person
-- einmal), Titel "Neue Empfehlung: Dublette prüfen". Ohne Dublette, oder wenn
-- sie demselben Partner gehoert, aendert sich nichts.
--
-- 2) Die Vertretung bleibt, wie sie ist: Der Trigger
-- trg_benachrichtigung_an_vertretung kopiert Glocken zu Kundenprofilen weiter
-- an die Vertretung eines abwesenden Partners. Die Vertretung kann den Lead
-- oeffnen (GL-Entscheidung vom 29.09.2026, zuerst war das Entfernen
-- geplant). Diese Migration fasst den Trigger deshalb nicht an.
--
-- Zu 1: Der uebrige Rumpf ist wortgleich zur Fassung aus 20260928230000 (Teil 1 im
-- Eingangskorb, muss vorher laufen oder schon gelaufen sein; sie aendert
-- dieselbe Funktion, und diese Fassung enthaelt ihre Aenderung schon).
-- Signatur, SECURITY DEFINER, search_path und Rechte bleiben gleich.
-- create_tippgeber_lead bleibt unberuehrt, dort gibt es keine Dublettensuche.
--
-- Keine Daten. Nur CREATE OR REPLACE, beliebig oft wiederholbar. Ohne diese
-- Migration laeuft alles weiter, nur geht die Dubletten-Glocke wie bisher an
-- den Partner des Empfehlenden.
--
-- Voraussetzung: berater_name_normal aus 20260918220000.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.berater_name_normal(text)') IS NULL THEN
    RAISE EXCEPTION 'berater_name_normal fehlt. Zuerst 20260918220000_partnersuche_kennung_vor_name.sql ausfuehren.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_empfehlung_kontakt(
  _referrer_kontakt_id uuid,
  _vorname text,
  _nachname text,
  _email text,
  _telefon text,
  _quelle text,
  _berater text,
  _beziehung text,
  _anmerkungen text DEFAULT ''::text,
  _programm_id text DEFAULT ''::text,
  _investment_id text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer public.kontakte%ROWTYPE;
  _kontakt_id uuid;
  _emp_id uuid;
  _vp_id uuid;
  _vp_name text;
  _referrer_name text;
  _duplicate_id uuid;
  _duplicate_name text;
  _duplicate_zustaendig uuid;
  _glocke_an uuid;
  _norm_tel text;
  _fallback_user uuid;
  _notify_msg text;
BEGIN
  SELECT * INTO _referrer
  FROM public.kontakte
  WHERE id = _referrer_kontakt_id
    AND (
      (meta ->> 'authUserId') = auth.uid()::text
      OR ((meta -> 'person2') ->> 'authUserId') = auth.uid()::text
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _vp_id := _referrer.zustaendig_id;
  _vp_name := COALESCE(NULLIF(_referrer.berater, ''), NULLIF(_berater, ''));
  _referrer_name := trim(_referrer.vorname || ' ' || _referrer.nachname);

  -- Neu am 28.09.2026: Der Name zaehlt nur, wenn genau ein Profil so heisst.
  -- Vorher gewann bei zwei Gleichnamigen das neuere Profil, geraten. Ohne
  -- eindeutigen Treffer bleibt der Kontakt ohne Zustaendigkeit, und die
  -- Glocke geht unten wie bei jedem Kontakt ohne Partner an Admin und Inhaber.
  IF _vp_id IS NULL AND _vp_name IS NOT NULL THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(p.id))[1] END INTO _vp_id
    FROM public.profiles p
    WHERE public.berater_name_normal(p.name) = public.berater_name_normal(_vp_name);
    IF _vp_id IS NULL THEN
      RAISE WARNING 'Partnername nicht eindeutig oder unbekannt, Kontakt ohne Zustaendigkeit angelegt';
    END IF;
  END IF;

  _norm_tel := regexp_replace(COALESCE(_telefon, ''), '[^0-9]', '', 'g');

  SELECT id, trim(vorname || ' ' || nachname), zustaendig_id INTO _duplicate_id, _duplicate_name, _duplicate_zustaendig
  FROM public.kontakte
  WHERE (
      (NULLIF(_email, '') IS NOT NULL AND lower(email) = lower(_email))
      OR (length(_norm_tel) >= 6 AND regexp_replace(COALESCE(telefon, ''), '[^0-9]', '', 'g') = _norm_tel)
    )
  LIMIT 1;

  _kontakt_id := gen_random_uuid();
  _emp_id := gen_random_uuid();

  IF _duplicate_id IS NOT NULL THEN
    _kontakt_id := _duplicate_id;
  ELSE
    INSERT INTO public.kontakte (id, vorname, nachname, email, telefon, quelle, berater, zustaendig_id, status, meta)
    VALUES (
      _kontakt_id,
      NULLIF(_vorname, ''),
      NULLIF(_nachname, ''),
      NULLIF(_email, ''),
      NULLIF(_telefon, ''),
      COALESCE(NULLIF(_quelle, ''), 'Empfehlung von ' || _referrer_name),
      _vp_name,
      _vp_id,
      'kontaktiert',
      jsonb_build_object(
        'pipelineStufe', 'erstgespraech',
        'leadTyp', 'empfehlung',
        'zugewiesenAm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'empfehlungsgeber', true,
        'empfehlungsgeberName', _referrer_name,
        'empfehlungsgeberKontaktId', _referrer_kontakt_id::text,
        'empfehlungsgeberBeziehung', COALESCE(_beziehung, ''),
        'empfehlungsgeberVpId', COALESCE(_vp_id::text, ''),
        'empfehlungId', _emp_id::text,
        'empfehlungAnmerkungen', COALESCE(_anmerkungen, ''),
        'empfehlungEmail', COALESCE(_email, ''),
        'empfehlungTelefon', COALESCE(_telefon, '')
      )
    );
  END IF;

  INSERT INTO public.empfehlungen (id, empfohlen_name, empfohlen_email, empfohlen_telefon, empfohlen_von, status, kontakt_id, meta)
  VALUES (
    _emp_id,
    trim(_vorname || ' ' || _nachname),
    NULLIF(_email, ''),
    NULLIF(_telefon, ''),
    _referrer_name,
    CASE WHEN _duplicate_id IS NOT NULL THEN 'dublette' ELSE 'neu' END,
    _kontakt_id,
    jsonb_build_object(
      'programmId', COALESCE(_programm_id, ''),
      'investmentId', COALESCE(_investment_id, ''),
      'kontaktId', _referrer_kontakt_id::text,
      'kontaktName', _referrer_name,
      'empfehlenderKundeId', _referrer_kontakt_id::text,
      'empfehlenderName', _referrer_name,
      'beziehung', COALESCE(_beziehung, ''),
      'anmerkungen', COALESCE(_anmerkungen, ''),
      'berater', COALESCE(_vp_name, ''),
      'vpId', COALESCE(_vp_id::text, ''),
      'praemieStatus', 'ausstehend',
      'neuerKontaktId', _kontakt_id::text,
      'dublette', (_duplicate_id IS NOT NULL),
      'dubletteVon', COALESCE(_duplicate_name, '')
    )
  );

  _notify_msg := 'Ihr Kunde ' || _referrer_name || ' hat eine neue Empfehlung gesendet: '
    || trim(_vorname || ' ' || _nachname)
    || COALESCE(' (' || NULLIF(_telefon, '') || ')', '')
    || CASE WHEN _duplicate_id IS NOT NULL
            THEN ' — ACHTUNG: Dublette zu bestehendem Kontakt "' || COALESCE(_duplicate_name, '') || '". Bitte prüfen.'
            ELSE '. Der Kontakt wurde automatisch in Kontakte angelegt.'
       END;

  -- Neu am 29.09.2026: Die Glocke nennt den bestehenden Kontakt und verlinkt
  -- ihn. Gehoert er nicht dem Partner des Empfehlenden, erfuhr dieser bisher
  -- von einem fremden Kontakt. Dann geht die Glocke an die Leitung.
  _glocke_an := _vp_id;
  IF _duplicate_id IS NOT NULL AND _duplicate_zustaendig IS DISTINCT FROM _vp_id THEN
    _glocke_an := NULL;
  END IF;

  IF _glocke_an IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _glocke_an,
      'Neue Empfehlung von ' || _referrer_name,
      _notify_msg,
      '/kunden/' || _kontakt_id::text
    );
  ELSE
    FOR _fallback_user IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (
        _fallback_user,
        CASE WHEN _vp_id IS NOT NULL THEN 'Neue Empfehlung: Dublette prüfen'
             ELSE 'Neue Empfehlung ohne Zuständigkeit' END,
        _notify_msg,
        '/kunden/' || _kontakt_id::text
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'kontakt_id', _kontakt_id,
    'empfehlung_id', _emp_id,
    'vp_id', _vp_id,
    'duplicate', (_duplicate_id IS NOT NULL),
    'duplicate_name', COALESCE(_duplicate_name, '')
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 40.1 und 40.2 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
