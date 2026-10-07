-- Absagen und Verschieben ziehen Akte, Videoraum und Sperrzeit mit.
DROP FUNCTION IF EXISTS public.buchung_termin_belegt(uuid, timestamptz, timestamptz, text);

CREATE OR REPLACE FUNCTION public.buchung_termin_belegt(
  _mitarbeiter uuid,
  _von timestamptz,
  _bis timestamptz,
  _zone text DEFAULT 'Europe/Berlin',
  _ohne_aktivitaet uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH termine AS (
    SELECT
      make_timestamp(
        EXTRACT(year  FROM a.faellig_am::date)::int,
        EXTRACT(month FROM a.faellig_am::date)::int,
        EXTRACT(day   FROM a.faellig_am::date)::int,
        LEAST(23, GREATEST(0, COALESCE((substring(a.uhrzeit from '^([0-9]{1,2}):'))::int, 9))),
        LEAST(59, GREATEST(0, COALESCE((substring(a.uhrzeit from '^[0-9]{1,2}:([0-9]{2})'))::int, 0))),
        0
      ) AT TIME ZONE COALESCE(_zone, 'Europe/Berlin') AS beginnt,
      GREATEST(5, COALESCE(
        NULLIF(regexp_replace(COALESCE(a.dauer, ''), '[^0-9]', '', 'g'), '')::int,
        60
      )) AS dauer
    FROM public.aktivitaeten a
    LEFT JOIN public.kontakte k
      ON a.kunde_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     AND k.id = a.kunde_id::uuid
    WHERE a.art = 'meeting'
      AND a.faellig_am IS NOT NULL
      AND a.faellig_am ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      AND COALESCE(a.benutzer_id, k.zustaendig_id) = _mitarbeiter
      AND COALESCE(k.geloescht, false) = false
      AND (_ohne_aktivitaet IS NULL OR a.id <> _ohne_aktivitaet)
      AND NOT EXISTS (
        SELECT 1 FROM public.buchungen b
        WHERE b.aktivitaet_id = a.id AND b.status = 'abgesagt'
      )
  )
  SELECT EXISTS (
    SELECT 1 FROM termine t
    WHERE t.beginnt < _bis
      AND t.beginnt + make_interval(mins => t.dauer) > _von
  )
$$;

REVOKE ALL ON FUNCTION public.buchung_termin_belegt(uuid, timestamptz, timestamptz, text, uuid) FROM public;

CREATE OR REPLACE FUNCTION public.buchung_absagen(
  _absage_token text,
  _grund text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _buchung public.buchungen;
BEGIN
  UPDATE public.buchungen b
  SET status = 'abgesagt',
      absage_grund = left(btrim(COALESCE(_grund, '')), 500),
      abgesagt_at = now()
  WHERE b.absage_token = _absage_token
    AND b.status = 'offen'
  RETURNING * INTO _buchung;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieser Termin laesst sich nicht mehr absagen';
  END IF;

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
        details = COALESCE(a.details, '')
          || CASE WHEN btrim(COALESCE(_grund, '')) <> ''
                  THEN E'\nVom Kunden abgesagt. Grund: ' || left(btrim(_grund), 500)
                  ELSE E'\nVom Kunden abgesagt.' END
    WHERE a.id = _buchung.aktivitaet_id;
  END IF;

  RETURN jsonb_build_object('id', _buchung.id, 'status', _buchung.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.buchung_verschieben(
  _absage_token text,
  _start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alt public.buchungen;
  _art public.buchung_terminarten;
  _vorlauf integer;
  _vorausschau integer;
  _zone text;
  _tag date;
  _ende timestamptz;
  _neu public.buchungen;
BEGIN
  SELECT * INTO _alt FROM public.buchungen WHERE absage_token = _absage_token AND status = 'offen';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieser Termin laesst sich nicht mehr verschieben';
  END IF;

  SELECT * INTO _art FROM public.buchung_terminarten WHERE id = _alt.terminart_id;

  _vorlauf := COALESCE(_art.vorlauf_minuten, 240);
  _vorausschau := COALESCE(_art.vorausschau_tage, 60);

  IF _start IS NULL THEN
    RAISE EXCEPTION 'Bitte eine Startzeit angeben';
  END IF;
  IF _start < now() + make_interval(mins => _vorlauf) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu kurzfristig';
  END IF;
  IF _start > now() + make_interval(days => _vorausschau) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu weit in der Zukunft';
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _alt.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _ende := _start + make_interval(mins => _alt.dauer_minuten);
  _tag := (_start AT TIME ZONE _zone)::date;

  IF NOT EXISTS (
    WITH fenster AS (
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _alt.mitarbeiter_id AND v.datum = _tag AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _alt.mitarbeiter_id
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _alt.mitarbeiter_id AND a.datum = _tag
        )
    )
    SELECT 1 FROM fenster f
    WHERE _start >= (_tag + f.von) AT TIME ZONE _zone
      AND _ende <= (_tag + f.bis) AT TIME ZONE _zone
  ) THEN
    RAISE EXCEPTION 'Zu dieser Zeit ist kein Termin moeglich';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('buchung:' || _alt.mitarbeiter_id::text));

  IF EXISTS (
    SELECT 1 FROM public.buchungen b
    WHERE b.mitarbeiter_id = _alt.mitarbeiter_id
      AND b.id <> _alt.id
      AND b.status <> 'abgesagt'
      AND b.start_at - make_interval(mins => b.puffer_vor_minuten)
          < _ende + make_interval(mins => _alt.puffer_nach_minuten)
      AND b.ende_at + make_interval(mins => b.puffer_nach_minuten)
          > _start - make_interval(mins => _alt.puffer_vor_minuten)
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  IF public.buchung_termin_belegt(
    _alt.mitarbeiter_id,
    _start - make_interval(mins => _alt.puffer_vor_minuten),
    _ende + make_interval(mins => _alt.puffer_nach_minuten),
    _zone,
    _alt.aktivitaet_id
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  UPDATE public.buchungen
  SET start_at = _start, ende_at = _ende
  WHERE id = _alt.id
  RETURNING * INTO _neu;

  IF _alt.aktivitaet_id IS NOT NULL THEN
    UPDATE public.aktivitaeten
    SET faellig_am = (_start AT TIME ZONE _zone)::date,
        uhrzeit = to_char(_start AT TIME ZONE _zone, 'HH24:MI')
    WHERE id = _alt.aktivitaet_id;
  END IF;

  IF _alt.videoraum_id IS NOT NULL THEN
    UPDATE public.videoraeume
    SET termin_at = _start
    WHERE id = _alt.videoraum_id;
  END IF;

  RETURN jsonb_build_object(
    'id', _neu.id,
    'start_at', _neu.start_at,
    'ende_at', _neu.ende_at,
    'zeitzone', _zone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_absagen(text, text) FROM public;
REVOKE ALL ON FUNCTION public.buchung_verschieben(text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_absagen(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buchung_verschieben(text, timestamptz) TO anon, authenticated;