-- ===========================================================================
-- Tippgeber-Portal: Einverständnis der empfohlenen Person nachweisbar speichern
-- ===========================================================================
--
-- WORUM ES GEHT
--
-- Im Formular „Neuen Kontakt empfehlen“ bestätigt der Tippgeber jetzt per
-- Pflicht-Häkchen, dass die empfohlene Person mit der Weitergabe ihrer
-- Kontaktdaten an MOREImmo einverstanden ist (GL, 27.09.2026). Bisher
-- stand darunter nur ein Satz „Mit dem Absenden bestätigst du …“, und
-- gespeichert wurde nichts.
--
-- `create_tippgeber_lead` bekommt drei neue Parameter:
--   _einverstaendnis           boolean  (true, wenn der Haken gesetzt ist)
--   _einverstaendnis_fassung   text     (z. B. 2026-09-tippgeber-einverstaendnis-v1)
--   _einverstaendnis_wortlaut  text     (der Satz, wie er am Haken stand)
-- und legt am neuen Kontakt ab:
--   meta.tippgeberEinverstaendnis = {
--     bestaetigt: true, bestaetigtAm: <Serverzeit UTC>, fassung, wortlaut,
--     bestaetigtVon: <auth.uid() des Tippgebers>
--   }
-- Den Zeitpunkt setzt die Datenbank, nicht der Browser.
--
-- ABLEHNEN UND ÜBERGANG
--
-- Kommt einer der neuen Parameter mit, muss _einverstaendnis = true und eine
-- Fassung gesetzt sein, sonst bricht die Funktion ab und legt nichts an.
-- Aufrufe ganz ohne die neuen Parameter (Browser mit altem Stand, auch die
-- Fünf-Parameter-Fassung) gehen wie bisher durch, nur ohne Nachweis. Diese
-- Übergangslücke lässt sich später schließen, indem die Prüfung auf
-- „_einverstaendnis IS NOT TRUE“ ohne Vorbedingung umgestellt wird.
--
-- WARUM DROP
--
-- Die bisherige Fassung mit elf Textparametern wird entfernt und durch die
-- mit vierzehn ersetzt (die drei neuen mit DEFAULT NULL). Blieben beide
-- stehen, fände die Schnittstelle bei einem alten Aufruf mit elf Namen zwei
-- passende Funktionen und bräche mit „Could not choose the best candidate“
-- ab. Die Fünf-Parameter-Fassung ruft intern mit elf Werten auf und landet
-- danach bei der neuen, sie bleibt unverändert.
--
-- WIEDERHOLBAR: DROP IF EXISTS, CREATE OR REPLACE, REVOKE/GRANT.
-- ===========================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_tippgeber_lead(text, text, text, text, text, text, text, text, text, text, text);

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

  IF _vp_id IS NULL AND _vp_name IS NOT NULL THEN
    SELECT p.id INTO _vp_id
    FROM public.profiles p
    WHERE lower(trim(p.name)) = lower(trim(_vp_name))
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;
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

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (ändert nichts): die letzten Tippgeber-Leads mit Nachweis.
--   select id, erstellt_am, meta -> 'tippgeberEinverstaendnis'
--     from public.kontakte where meta ? 'tippgeberEinverstaendnis'
--    order by erstellt_am desc limit 5;
