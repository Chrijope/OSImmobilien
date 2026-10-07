-- ===========================================================================
-- Kennung statt Name: drei Datenbankfunktionen raten nicht mehr
-- ===========================================================================
--
-- Auftrag vom 28.09.2026: Kunden und Personen werden ueber die Kennung
-- zugeordnet, der Name ist nur noch Rueckfall fuer alte Datensaetze, und auch
-- das nur, wenn er eindeutig ist. Zwei Konten mit demselben Namen gibt es im
-- Projekt schon; jede Namenssuche mit LIMIT 1 ordnet dann geraten zu.
--
-- Die Pruefung aller SQL-Funktionen, Trigger und Regeln (jeweils juengste
-- Fassung) hat drei Stellen gefunden, die ueber den Namen zuordnen:
--
--   1. create_empfehlung_kontakt (Kunde empfiehlt im Portal jemanden): Hat
--      der empfehlende Kunde keine zustaendig_id, wird der Partner ueber den
--      Namen gesucht, bei mehreren Treffern das neueste Profil.
--   2. create_tippgeber_lead (Tippgeber empfiehlt): dasselbe mit
--      tippgeber.zugeordnet_name, wenn zugeordnet_id fehlt.
--   3. investments_provisionssatz_festschreiben (Trigger beim Anlegen eines
--      Investments): Ohne erstelltVonId entscheidet der Namensvergleich
--      Ersteller gegen Berater ueber "eigen" oder "zugewiesen", also ueber
--      den Provisionssatz.
--
-- WAS SICH AENDERT
--
-- Die Kennung entscheidet weiter zuerst, daran aendert sich nichts. Nur der
-- Namensrueckfall greift in 1 und 2 nur noch bei genau einem Profil, und in 3
-- nur, wenn der Name genau ein Profil meint und dieses der ermittelte Partner
-- ist. Verglichen wird mit `berater_name_normal` (Gross- und Kleinschreibung,
-- Leerzeichen egal), wie in investment_partner_id seit 20260918220000.
-- Die uebrigen Rumpfteile sind wortgleich zu den Vorlagen:
--   create_empfehlung_kontakt           aus 20260818160000
--   create_tippgeber_lead (14 Param.)   aus 20260927020000
--   investments_provisionssatz_festschreiben aus 20260909120000
-- Der Trigger selbst bleibt unberuehrt, Signaturen und Rechte bleiben gleich.
--
-- Nicht angefasst, weil parallel offen: 20260928150000 und 20260928160000.
--
-- WAS SICH NICHT AENDERT
--
-- Keine Daten. Nur CREATE OR REPLACE, beliebig oft wiederholbar. Bereits
-- festgeschriebene Provisionssaetze bleiben stehen. Die Anwendung laeuft auch
-- ohne diese Migration; dann raten nur diese drei Funktionen weiter.
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

-- ---------------------------------------------------------------------------
-- 1) Empfehlung aus dem Kundenportal
-- ---------------------------------------------------------------------------

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

  SELECT id, trim(vorname || ' ' || nachname) INTO _duplicate_id, _duplicate_name
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

  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neue Empfehlung von ' || _referrer_name,
      _notify_msg,
      '/kunden/' || _kontakt_id::text
    );
  ELSE
    FOR _fallback_user IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role)
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (
        _fallback_user,
        'Neue Empfehlung ohne Zuständigkeit',
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

-- ---------------------------------------------------------------------------
-- 2) Empfehlung aus dem Tippgeber-Portal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_tippgeber_lead(
  _vorname text,
  _nachname text,
  _email text,
  _telefon text,
  _anliegen text DEFAULT '',
  _ziel text DEFAULT '',
  _einkommen text DEFAULT '',
  _eigenkapital text DEFAULT '',
  _berufliche_situation text DEFAULT '',
  _schufa_sauber text DEFAULT '',
  _investitions_zeitpunkt text DEFAULT '',
  _einverstaendnis boolean DEFAULT NULL,
  _einverstaendnis_fassung text DEFAULT NULL,
  _einverstaendnis_wortlaut text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tipp public.tippgeber%ROWTYPE;
  _vp_id uuid;
  _vp_name text;
  _kontakt_id uuid;
  _tipp_name text;
  _fallback_user uuid;
  _notify_msg text;
  _einverstaendnis_meta jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tippgeber'::public.app_role) THEN
    RAISE EXCEPTION 'Nur Tippgeber dürfen diese Funktion nutzen';
  END IF;

  -- Neuer Browser: ohne bestätigtes Einverständnis wird nichts angelegt.
  -- Alter Browser (keiner der drei Parameter): Übergang, siehe Kopf.
  IF _einverstaendnis IS NOT NULL OR _einverstaendnis_fassung IS NOT NULL OR _einverstaendnis_wortlaut IS NOT NULL THEN
    IF _einverstaendnis IS NOT TRUE OR NULLIF(trim(COALESCE(_einverstaendnis_fassung, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Bitte bestätige, dass die empfohlene Person mit der Weitergabe ihrer Kontaktdaten einverstanden ist.'
        USING ERRCODE = '22023';
    END IF;
    _einverstaendnis_meta := jsonb_build_object(
      'tippgeberEinverstaendnis', jsonb_build_object(
        'bestaetigt', true,
        'bestaetigtAm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'fassung', left(trim(_einverstaendnis_fassung), 100),
        'wortlaut', NULLIF(left(trim(COALESCE(_einverstaendnis_wortlaut, '')), 1000), ''),
        'bestaetigtVon', auth.uid()::text
      )
    );
  END IF;

  SELECT * INTO _tipp FROM public.tippgeber WHERE benutzer_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kein Tippgeber-Profil gefunden';
  END IF;

  _vp_id := _tipp.zugeordnet_id;
  _vp_name := NULLIF(_tipp.zugeordnet_name, '');
  _tipp_name := trim(_tipp.vorname || ' ' || _tipp.nachname);

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

  _kontakt_id := gen_random_uuid();

  INSERT INTO public.kontakte (id, vorname, nachname, email, telefon, quelle, berater, zustaendig_id, status, meta)
  VALUES (
    _kontakt_id,
    NULLIF(_vorname, ''),
    NULLIF(_nachname, ''),
    NULLIF(_email, ''),
    NULLIF(_telefon, ''),
    'Empfehlung von Tippgeber ' || _tipp_name,
    _vp_name,
    _vp_id,
    'kontaktiert',
    jsonb_build_object(
      'pipelineStufe', 'erstgespraech',
      'leadTyp', 'empfehlung',
      'zugewiesenAm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'empfehlungsgeber', true,
      'empfehlungsgeberName', _tipp_name,
      'empfehlungsgeberBeziehung', 'Tippgeber',
      'tippgeberId', _tipp.id::text,
      'tippgeberName', _tipp_name,
      'tippgeberBenutzerId', auth.uid()::text,
      'tippgeberAnliegen', COALESCE(_anliegen, ''),
      'erstelltVonId', auth.uid()::text,
      'erstelltVonName', _tipp_name,
      'qualZiel', NULLIF(_ziel, ''),
      'qualEinkommen', NULLIF(_einkommen, ''),
      'qualEigenkapital', NULLIF(_eigenkapital, ''),
      'qualBeruflicheSituation', NULLIF(_berufliche_situation, ''),
      'tippgeberSchufaSauber', NULLIF(_schufa_sauber, ''),
      'tippgeberInvestitionsZeitpunkt', NULLIF(_investitions_zeitpunkt, '')
    ) || _einverstaendnis_meta
  );

  _notify_msg := _tipp_name || ' hat einen neuen Lead empfohlen: '
    || trim(_vorname || ' ' || _nachname)
    || COALESCE(' (' || NULLIF(_telefon, '') || ')', '')
    || '. Der Kontakt wurde automatisch in Kontakte angelegt.';

  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neuer Lead von Tippgeber ' || _tipp_name,
      _notify_msg,
      '/kunden/' || _kontakt_id::text
    );
  ELSE
    FOR _fallback_user IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role)
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (
        _fallback_user,
        'Tippgeber-Lead ohne Zuständigkeit',
        _notify_msg,
        '/kunden/' || _kontakt_id::text
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('kontakt_id', _kontakt_id, 'vp_id', _vp_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_tippgeber_lead(text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tippgeber_lead(text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Provisionssatz beim Anlegen eines Investments: eigen oder zugewiesen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investments_provisionssatz_festschreiben()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt record;
  _partner uuid;
  _eigen boolean := false;
  _setter text;
  _ersteller_id text;
  _ersteller_name text;
  _berater_name text;
  _rate numeric;
  _jetzt text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  _grund text;
  _meldung text;
  _code text;
BEGIN
  -- Aeusseres Sicherheitsnetz: Ein Fehler hier darf NIE das Anlegen eines
  -- Investments verhindern. Neu ist nur, dass er nicht mehr spurlos bleibt.
  BEGIN

    -- Ermittlung. Was hier schiefgeht, wird zu einem Grund, nicht zu einem
    -- Abbruch.
    BEGIN
      -- HIER LAG DER FEHLER: `k.id::text = NEW.kunde_id` verglich Text mit
      -- uuid. Beide Seiten sind uuid, der Cast war falsch und teuer zugleich.
      SELECT k.zustaendig_id, k.berater, coalesce(k.meta, '{}'::jsonb) AS meta
        INTO _kontakt
        FROM public.kontakte k
       WHERE k.id = NEW.kunde_id
       LIMIT 1;

      IF NOT FOUND THEN
        _grund := 'kontakt_nicht_gefunden';
      ELSE
        _partner := public.investment_partner_id(NEW.kunde_id);

        IF _partner IS NULL THEN
          _grund := 'kein_zustaendiger_partner';
        ELSE
          -- Eigen oder zugewiesen? Spiegel von istEigenKontakt im Frontend:
          -- ein eingetragener Setter bedeutet immer zugewiesen; sonst zaehlt,
          -- wer den Kontakt angelegt hat (erstelltVonId, notfalls der Name);
          -- ohne beides gilt die vorsichtigere Annahme "zugewiesen".
          _setter := nullif(trim(coalesce(_kontakt.meta ->> 'setter', '')), '');
          IF _setter IS NOT NULL THEN
            _eigen := false;
          ELSE
            _ersteller_id := nullif(trim(coalesce(_kontakt.meta ->> 'erstelltVonId', '')), '');
            IF _ersteller_id IS NOT NULL THEN
              _eigen := (_ersteller_id = _partner::text);
            ELSE
              _ersteller_name := lower(trim(coalesce(_kontakt.meta ->> 'erstelltVonName', '')));
              _berater_name := lower(trim(coalesce(_kontakt.berater, '')));
              _eigen := _ersteller_name <> '' AND _berater_name <> '' AND _ersteller_name = _berater_name;
              -- Neu am 28.09.2026: Der Name zaehlt nur, wenn er genau ein
              -- Profil meint und dieses der oben ermittelte Partner ist. Bei
              -- zwei Gleichnamigen gilt die vorsichtigere Annahme "zugewiesen".
              IF _eigen THEN
                SELECT count(*) = 1 AND bool_and(p.id = _partner) INTO _eigen
                  FROM public.profiles p
                 WHERE public.berater_name_normal(p.name) = public.berater_name_normal(_ersteller_name);
              END IF;
            END IF;
          END IF;

          _rate := public.provisionssatz_fuer_partner(_partner, _eigen);
          IF _rate IS NULL OR _rate <= 0 THEN
            _grund := 'kein_satz_ermittelbar';
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      _grund := 'ausnahme';
      _meldung := SQLERRM;
      _code := SQLSTATE;
      RAISE WARNING 'Provisionssatz konnte fuer Investment % nicht festgeschrieben werden: % (%)',
        NEW.id, SQLERRM, SQLSTATE;
    END;

    IF _grund IS NULL THEN
      -- Der Server ist die einzige Wahrheit: ein eventuell vom Client
      -- mitgeschickter Wert wird ueberschrieben. Ein alter Fehlervermerk
      -- faellt dabei weg, sonst behauptete er weiter einen Ausfall.
      NEW.meta := (coalesce(NEW.meta, '{}'::jsonb) - 'lockedProvisionRateFehler')
        || jsonb_build_object(
             'lockedProvisionRate', _rate,
             'lockedProvisionRateAt', _jetzt,
             'lockedProvisionRateQuelle', 'serverseitig'
           );
    ELSE
      -- Der Ausfall steht ab jetzt in den Daten. Ohne diesen Vermerk sieht ein
      -- fehlgeschlagener Trigger genauso aus wie ein Investment, bei dem es
      -- nichts festzuschreiben gab. Genau das hat den Ausfall seit dem
      -- 18.08.2026 verdeckt.
      NEW.meta := coalesce(NEW.meta, '{}'::jsonb) || jsonb_build_object(
        'lockedProvisionRateFehler', jsonb_strip_nulls(jsonb_build_object(
          'zeitpunkt', _jetzt,
          'grund', _grund,
          'meldung', _meldung,
          'code', _code
        ))
      );
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Selbst das Schreiben des Vermerks darf das Anlegen nicht kosten.
    RAISE WARNING 'Provisionsvermerk konnte fuer Investment % nicht gesetzt werden: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.investments_provisionssatz_festschreiben() FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 34.1 bis 34.4 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
