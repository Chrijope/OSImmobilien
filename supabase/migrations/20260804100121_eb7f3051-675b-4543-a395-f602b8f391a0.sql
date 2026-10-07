CREATE OR REPLACE FUNCTION public.buchung_pipeline_rang(_stufe text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(_stufe, '')))
    WHEN 'neuer_lead'            THEN 0
    WHEN 'nicht_erreicht'        THEN 1
    WHEN 'erreicht'              THEN 2
    WHEN 'follow_up'             THEN 3
    WHEN 'erstgespraech_geplant' THEN 4
    WHEN 'erstgespraech'         THEN 5
    WHEN 'eg_noshow'             THEN 6
    WHEN 'beratungsgespraech'    THEN 7
    WHEN 'bg_noshow'             THEN 8
    WHEN 'selbstauskunft'        THEN 9
    WHEN 'bonitaetsunterlagen'   THEN 10
    WHEN 'objektauswahl'         THEN 11
    WHEN 'reservierung'          THEN 12
    WHEN 'finanzierung'          THEN 13
    WHEN 'notar'                 THEN 14
    WHEN 'faelligkeit'           THEN 15
    WHEN 'abrechnung'            THEN 16
    WHEN 'abgeschlossen'         THEN 17
    WHEN 'bestandsimport'        THEN 18
    WHEN 'archiviert'            THEN 19
    WHEN 'verloren'              THEN 20
    WHEN 'zugewiesen'            THEN 0
    WHEN 'kontaktversuche'       THEN 2
    WHEN 'vermoegensaufbau'      THEN 3
    ELSE -1
  END
$$;

CREATE OR REPLACE FUNCTION public.buchung_pipeline_vorwaerts(_kontakt uuid, _stufe text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _jetzige text;
BEGIN
  IF _kontakt IS NULL OR NULLIF(btrim(COALESCE(_stufe, '')), '') IS NULL THEN
    RETURN false;
  END IF;

  SELECT NULLIF(btrim(COALESCE(k.meta ->> 'pipelineStufe', '')), '')
  INTO _jetzige
  FROM public.kontakte k
  WHERE k.id = _kontakt;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.buchung_pipeline_rang(_stufe) <= public.buchung_pipeline_rang(_jetzige) THEN
    RETURN false;
  END IF;

  UPDATE public.kontakte
  SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('pipelineStufe', _stufe)
  WHERE id = _kontakt;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_pipeline_rang(text) FROM public;
REVOKE ALL ON FUNCTION public.buchung_pipeline_vorwaerts(uuid, text) FROM public;

CREATE OR REPLACE FUNCTION public.buchung_anlegen(
  _token text,
  _terminart_id uuid,
  _start timestamptz,
  _name text,
  _email text,
  _telefon text DEFAULT NULL,
  _nachricht text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z record;
  _art public.buchung_terminarten;
  _zone text;
  _tag date;
  _name_sauber text;
  _email_sauber text;
  _ende timestamptz;
  _buchung public.buchungen;
  _raum public.videoraeume;
  _abzug jsonb;
  _aktivitaet_id uuid;
  _kontakt_id uuid;
  _stufe text;
  _vorname text;
  _nachname text;
BEGIN
  SELECT * INTO _z FROM public.buchung_zugang_aufloesen(_token);
  IF _z.mitarbeiter_id IS NULL THEN
    RAISE EXCEPTION 'Dieser Buchungslink ist nicht mehr gueltig';
  END IF;

  SELECT * INTO _art
  FROM public.buchung_terminarten t
  WHERE t.id = _terminart_id
    AND t.mitarbeiter_id = _z.mitarbeiter_id
    AND t.aktiv
    AND (_z.art = 'persoenlich' OR t.oeffentlich)
    AND (_z.terminart_id IS NULL OR t.id = _z.terminart_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diese Terminart steht nicht zur Verfuegung';
  END IF;

  _name_sauber := left(NULLIF(btrim(COALESCE(_name, '')), ''), 120);
  IF _name_sauber IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Namen angeben';
  END IF;

  _email_sauber := left(lower(NULLIF(btrim(COALESCE(_email, '')), '')), 200);
  IF _email_sauber IS NULL OR _email_sauber !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Bitte eine gueltige E-Mail-Adresse angeben';
  END IF;

  IF _start IS NULL THEN
    RAISE EXCEPTION 'Bitte eine Startzeit angeben';
  END IF;

  IF _start < now() + make_interval(mins => _art.vorlauf_minuten) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu kurzfristig';
  END IF;
  IF _start > now() + make_interval(days => _art.vorausschau_tage) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu weit in der Zukunft';
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _z.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _ende := _start + make_interval(mins => _art.dauer_minuten);
  _tag := (_start AT TIME ZONE _zone)::date;

  IF NOT EXISTS (
    WITH fenster AS (
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _z.mitarbeiter_id AND v.datum = _tag AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _z.mitarbeiter_id
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _z.mitarbeiter_id AND a.datum = _tag
        )
    )
    SELECT 1 FROM fenster f
    WHERE _start >= (_tag + f.von) AT TIME ZONE _zone
      AND _ende <= (_tag + f.bis) AT TIME ZONE _zone
  ) THEN
    RAISE EXCEPTION 'Zu dieser Zeit ist kein Termin moeglich';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('buchung:' || _z.mitarbeiter_id::text));

  IF EXISTS (
    SELECT 1 FROM public.buchungen b
    WHERE b.mitarbeiter_id = _z.mitarbeiter_id
      AND b.status <> 'abgesagt'
      AND b.start_at - make_interval(mins => b.puffer_vor_minuten)
          < _ende + make_interval(mins => _art.puffer_nach_minuten)
      AND b.ende_at + make_interval(mins => b.puffer_nach_minuten)
          > _start - make_interval(mins => _art.puffer_vor_minuten)
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  IF public.buchung_termin_belegt(
    _z.mitarbeiter_id,
    _start - make_interval(mins => _art.puffer_vor_minuten),
    _ende + make_interval(mins => _art.puffer_nach_minuten),
    _zone
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  IF (SELECT count(*) FROM public.buchungen b
      WHERE b.mitarbeiter_id = _z.mitarbeiter_id
        AND b.created_at > now() - interval '1 hour') > 20 THEN
    RAISE EXCEPTION 'Zu viele Buchungen, bitte spaeter erneut versuchen';
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', COALESCE(p.name, 'Ihr Ansprechpartner'),
    'email', p.email,
    'telefon', p.telefon,
    'bild', p.avatar_url,
    'position', us.einstellungen -> 'profil' ->> 'position',
    'ort', us.einstellungen -> 'videocall' ->> 'ort',
    'zitat', us.einstellungen -> 'videocall' ->> 'zitat'
  ))
  INTO _abzug
  FROM public.profiles p
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE p.id = _z.mitarbeiter_id;

  _kontakt_id := _z.kontakt_id;

  _stufe := CASE _art.anlass
    WHEN 'erstgespraech'     THEN 'erstgespraech_geplant'
    WHEN 'beratung'          THEN 'beratungsgespraech'
    WHEN 'objektvorstellung' THEN 'objektauswahl'
    ELSE 'neuer_lead'
  END;

  IF _kontakt_id IS NULL THEN
    SELECT b.kontakt_id INTO _kontakt_id
    FROM public.buchungen b
    JOIN public.kontakte k ON k.id = b.kontakt_id
    WHERE b.mitarbeiter_id = _z.mitarbeiter_id
      AND b.quelle = 'offen'
      AND b.kontakt_id IS NOT NULL
      AND lower(btrim(COALESCE(b.email, ''))) = _email_sauber
      AND COALESCE(k.geloescht, false) = false
      AND k.quelle = 'Buchungslink'
    ORDER BY b.created_at DESC
    LIMIT 1;
  END IF;

  IF _kontakt_id IS NULL THEN
    _vorname := split_part(_name_sauber, ' ', 1);
    _nachname := btrim(substr(_name_sauber, length(_vorname) + 1));

    INSERT INTO public.kontakte (
      vorname, nachname, email, telefon, quelle, status,
      berater, zustaendig_id, notizen, meta
    ) VALUES (
      _vorname,
      _nachname,
      _email_sauber,
      left(btrim(COALESCE(_telefon, '')), 40),
      'Buchungslink',
      'neu',
      COALESCE(_abzug ->> 'name', ''),
      _z.mitarbeiter_id,
      CASE WHEN btrim(COALESCE(_nachricht, '')) <> ''
           THEN 'Nachricht aus der Buchung: ' || left(btrim(_nachricht), 2000)
           ELSE '' END,
      jsonb_build_object('pipelineStufe', _stufe)
    ) RETURNING id INTO _kontakt_id;
  ELSE
    PERFORM public.buchung_pipeline_vorwaerts(_kontakt_id, _stufe);
  END IF;

  INSERT INTO public.videoraeume (
    token, art, titel, gastgeber_id, gastgeber_snapshot,
    kontakt_id, termin_at, dauer_minuten, transkript_angeboten
  ) VALUES (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    _art.anlass,
    _art.bezeichnung,
    _z.mitarbeiter_id,
    COALESCE(_abzug, '{}'::jsonb),
    _kontakt_id,
    _start,
    _art.dauer_minuten,
    true
  ) RETURNING * INTO _raum;

  INSERT INTO public.buchungen (
    mitarbeiter_id, terminart_id, link_id, quelle, kontakt_id,
    name, email, telefon, nachricht,
    start_at, ende_at, dauer_minuten, puffer_vor_minuten, puffer_nach_minuten,
    bezeichnung, anlass, status, absage_token, videoraum_id
  ) VALUES (
    _z.mitarbeiter_id, _art.id, _z.link_id, _z.art, _kontakt_id,
    _name_sauber, _email_sauber, left(btrim(COALESCE(_telefon, '')), 40),
    left(btrim(COALESCE(_nachricht, '')), 2000),
    _start, _ende, _art.dauer_minuten, _art.puffer_vor_minuten, _art.puffer_nach_minuten,
    _art.bezeichnung, _art.anlass, 'offen', public.buchung_token(), _raum.id
  ) RETURNING * INTO _buchung;

  IF _kontakt_id IS NOT NULL THEN
    INSERT INTO public.aktivitaeten (
      kunde_id, art, beschreibung, details, von, datum,
      prioritaet, faellig_am, uhrzeit, dauer, teilnehmer, zoom_link,
      benutzer_id
    ) VALUES (
      _kontakt_id,
      'meeting',
      _art.bezeichnung,
      CASE WHEN btrim(COALESCE(_nachricht, '')) <> ''
           THEN 'Vom Kunden gebucht. Nachricht: ' || left(btrim(_nachricht), 2000)
           ELSE 'Vom Kunden ueber den Buchungslink gebucht.' END,
      COALESCE(_abzug ->> 'name', 'System'),
      now(),
      'mittel',
      (_start AT TIME ZONE _zone)::date,
      to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
      _art.dauer_minuten::text,
      _name_sauber,
      '/raum/' || _raum.token,
      _z.mitarbeiter_id
    ) RETURNING id INTO _aktivitaet_id;

    UPDATE public.buchungen SET aktivitaet_id = _aktivitaet_id WHERE id = _buchung.id;
  END IF;

  RETURN jsonb_build_object(
    'id', _buchung.id,
    'absage_token', _buchung.absage_token,
    'start_at', _buchung.start_at,
    'ende_at', _buchung.ende_at,
    'bezeichnung', _buchung.bezeichnung,
    'dauer_minuten', _buchung.dauer_minuten,
    'zeitzone', _zone,
    'raum_token', _raum.token,
    'anlass', _art.anlass,
    'kontakt_id', _kontakt_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.buchung_zugang(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z record;
  _profil record;
  _einst record;
  _arten jsonb;
BEGIN
  SELECT * INTO _z FROM public.buchung_zugang_aufloesen(_token);
  IF _z.mitarbeiter_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.name, p.email, p.telefon, p.avatar_url INTO _profil
  FROM public.profiles p WHERE p.id = _z.mitarbeiter_id;

  SELECT e.zeitzone, e.begruessung, e.hinweis INTO _einst
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _z.mitarbeiter_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'bezeichnung', t.bezeichnung,
           'beschreibung', t.beschreibung,
           'dauer_minuten', t.dauer_minuten,
           'vorausschau_tage', t.vorausschau_tage,
           'anlass', t.anlass
         ) ORDER BY t.sortierung, t.bezeichnung), '[]'::jsonb)
  INTO _arten
  FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = _z.mitarbeiter_id
    AND t.aktiv
    AND (_z.art = 'persoenlich' OR t.oeffentlich)
    AND (_z.terminart_id IS NULL OR t.id = _z.terminart_id);

  RETURN jsonb_build_object(
    'art', _z.art,
    'berater', jsonb_build_object(
      'name', COALESCE(_profil.name, ''),
      'email', _profil.email,
      'telefon', _profil.telefon,
      'bild', _profil.avatar_url
    ),
    'zeitzone', COALESCE(_einst.zeitzone, 'Europe/Berlin'),
    'begruessung', _einst.begruessung,
    'hinweis', _einst.hinweis,
    'kontakt_bekannt', _z.kontakt_id IS NOT NULL,
    'vorbelegung', CASE WHEN _z.art = 'persoenlich'
                        THEN COALESCE(_z.kontakt_snapshot, '{}'::jsonb)
                        ELSE '{}'::jsonb END,
    'terminarten', _arten
  );
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_zugang(text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_zugang(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.buchung_ansicht(_absage_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'status', b.status,
    'start_at', b.start_at,
    'ende_at', b.ende_at,
    'dauer_minuten', b.dauer_minuten,
    'bezeichnung', b.bezeichnung,
    'anlass', b.anlass,
    'terminart_id', b.terminart_id,
    'name', b.name,
    'email', b.email,
    'berater', jsonb_build_object('name', COALESCE(p.name, ''), 'email', p.email, 'telefon', p.telefon),
    'zeitzone', COALESCE(e.zeitzone, 'Europe/Berlin')
  )
  FROM public.buchungen b
  LEFT JOIN public.profiles p ON p.id = b.mitarbeiter_id
  LEFT JOIN public.buchung_einstellungen e ON e.mitarbeiter_id = b.mitarbeiter_id
  WHERE b.absage_token = _absage_token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.buchung_ansicht(text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_ansicht(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.buchung_wochenplan_setzen(_zeilen jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _ich uuid := auth.uid();
  _anzahl integer := 0;
BEGIN
  IF _ich IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;
  IF _zeilen IS NULL OR jsonb_typeof(_zeilen) <> 'array' THEN
    RAISE EXCEPTION 'Der Wochenplan muss eine Liste sein';
  END IF;

  DELETE FROM public.buchung_verfuegbarkeiten
  WHERE mitarbeiter_id = _ich AND datum IS NULL;

  INSERT INTO public.buchung_verfuegbarkeiten (mitarbeiter_id, wochentag, von, bis)
  SELECT _ich,
         (z ->> 'wochentag')::smallint,
         (z ->> 'von')::time,
         (z ->> 'bis')::time
  FROM jsonb_array_elements(_zeilen) AS z;

  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  RETURN _anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_wochenplan_setzen(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_wochenplan_setzen(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.buchung_status_setzen(_buchung_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _buchung public.buchungen;
BEGIN
  IF _status NOT IN ('offen', 'abgesagt', 'wahrgenommen') THEN
    RAISE EXCEPTION 'Unbekannter Status';
  END IF;

  SELECT * INTO _buchung FROM public.buchungen WHERE id = _buchung_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diese Buchung gibt es nicht';
  END IF;

  IF NOT (_buchung.mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid())) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diese Buchung';
  END IF;

  IF _buchung.status = _status THEN
    RETURN jsonb_build_object('id', _buchung.id, 'status', _buchung.status);
  END IF;

  UPDATE public.buchungen b
  SET status = _status,
      abgesagt_at = CASE WHEN _status = 'abgesagt' THEN now() ELSE b.abgesagt_at END
  WHERE b.id = _buchung.id
  RETURNING * INTO _buchung;

  IF _status = 'abgesagt' THEN
    IF _buchung.videoraum_id IS NOT NULL THEN
      UPDATE public.videoraeume
      SET status = 'beendet'
      WHERE id = _buchung.videoraum_id
        AND status <> 'beendet';
    END IF;

    IF _buchung.aktivitaet_id IS NOT NULL THEN
      UPDATE public.aktivitaeten a
      SET erledigt_am = COALESCE(a.erledigt_am, now()),
          beschreibung = CASE
            WHEN COALESCE(a.beschreibung, '') LIKE 'Abgesagt:%' THEN a.beschreibung
            ELSE 'Abgesagt: ' || COALESCE(NULLIF(btrim(a.beschreibung), ''), 'Termin')
          END,
          details = COALESCE(a.details, '') || E'\nVom Ansprechpartner abgesagt.'
      WHERE a.id = _buchung.aktivitaet_id;
    END IF;
  END IF;

  IF _status = 'wahrgenommen' AND _buchung.aktivitaet_id IS NOT NULL THEN
    UPDATE public.aktivitaeten a
    SET erledigt_am = COALESCE(a.erledigt_am, now())
    WHERE a.id = _buchung.aktivitaet_id;
  END IF;

  RETURN jsonb_build_object('id', _buchung.id, 'status', _buchung.status);
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_status_setzen(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_status_setzen(uuid, text) TO authenticated;

DELETE FROM public.buchung_verfuegbarkeiten v
WHERE v.datum IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.buchung_verfuegbarkeiten a
    WHERE a.mitarbeiter_id = v.mitarbeiter_id
      AND a.datum = v.datum
      AND (a.created_at, a.id) < (v.created_at, v.id)
  );

DROP INDEX IF EXISTS public.buchung_verfuegbarkeiten_datum_idx;

CREATE UNIQUE INDEX IF NOT EXISTS buchung_verfuegbarkeiten_datum_uniq
  ON public.buchung_verfuegbarkeiten (mitarbeiter_id, datum)
  WHERE datum IS NOT NULL;