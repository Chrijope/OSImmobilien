-- Doppelbuchung verhindern: Termine aus dem CRM blockieren Buchungszeiten.
--
-- Die Berechnung der freien Zeiten sah bisher nur in `buchungen` nach. Ein von
-- Hand angelegtes Meeting um 10 Uhr blieb damit unsichtbar, und der
-- Buchungslink bot diese Zeit weiter an. Am ersten echten Tag waere das eine
-- Doppelbuchung gewesen.
--
-- Wem ein Termin gehoert, steht an zwei Stellen: `aktivitaeten.benutzer_id`,
-- sofern gesetzt, sonst `kontakte.zustaendig_id`. Beides wird beruecksichtigt,
-- damit auch Altbestand ohne `benutzer_id` mitzaehlt.
--
-- Die Uhrzeit wird bewusst nicht per Textumwandlung gecastet, sondern aus
-- Stunde und Minute zusammengesetzt und dabei in gueltige Grenzen gezwungen.
-- Ein einziger krummer Wert in `uhrzeit` haette sonst die gesamte
-- Buchungsseite mit einem Fehler stehen lassen.

CREATE OR REPLACE FUNCTION public.buchung_termin_belegt(
  _mitarbeiter uuid,
  _von timestamptz,
  _bis timestamptz,
  _zone text DEFAULT 'Europe/Berlin'
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
    -- `aktivitaeten.kunde_id` ist Text, `kontakte.id` eine UUID. Die
    -- Formatpruefung davor sorgt dafuer, dass ein einziger krummer Wert
    -- nicht die gesamte Abfrage mit einem Umwandlungsfehler abbricht.
    LEFT JOIN public.kontakte k
      ON a.kunde_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     AND k.id = a.kunde_id::uuid
    WHERE a.art = 'meeting'
      AND a.faellig_am IS NOT NULL
      -- Auch `faellig_am` ist Text. Gleiche Vorsicht wie oben.
      AND a.faellig_am ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      AND COALESCE(a.benutzer_id, k.zustaendig_id) = _mitarbeiter
      AND COALESCE(k.geloescht, false) = false
  )
  SELECT EXISTS (
    SELECT 1 FROM termine t
    WHERE t.beginnt < _bis
      AND t.beginnt + make_interval(mins => t.dauer) > _von
  )
$$;

REVOKE ALL ON FUNCTION public.buchung_termin_belegt(uuid, timestamptz, timestamptz, text) FROM public;
-- Bewusst nicht fuer `anon` freigegeben. Sie wird nur aus den beiden
-- Buchungsfunktionen heraus aufgerufen, die selbst SECURITY DEFINER sind.

CREATE OR REPLACE FUNCTION public.buchung_freie_zeiten(
  _token text,
  _terminart_id uuid,
  _von date,
  _bis date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z record;
  _art public.buchung_terminarten;
  _zone text;
  _tag date;
  _letzter_tag date;
  _fenster record;
  _start timestamptz;
  _ende timestamptz;
  _block_von timestamptz;
  _block_bis timestamptz;
  _frueheste timestamptz;
  _spaeteste timestamptz;
  _treffer jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO _z FROM public.buchung_zugang_aufloesen(_token);
  IF _z.mitarbeiter_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO _art
  FROM public.buchung_terminarten t
  WHERE t.id = _terminart_id
    AND t.mitarbeiter_id = _z.mitarbeiter_id
    AND t.aktiv
    AND (_z.art = 'persoenlich' OR t.oeffentlich)
    AND (_z.terminart_id IS NULL OR t.id = _z.terminart_id);
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _z.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _frueheste := now() + make_interval(mins => _art.vorlauf_minuten);
  _spaeteste := now() + make_interval(days => _art.vorausschau_tage);

  _tag := GREATEST(COALESCE(_von, (now() AT TIME ZONE _zone)::date),
                   (now() AT TIME ZONE _zone)::date);
  _letzter_tag := LEAST(COALESCE(_bis, _tag + 31), (_spaeteste AT TIME ZONE _zone)::date);
  -- Deckel gegen zu grosse Abfragen ueber den oeffentlichen Zugang.
  _letzter_tag := LEAST(_letzter_tag, _tag + 62);

  WHILE _tag <= _letzter_tag LOOP
    FOR _fenster IN
      -- Eine Ausnahme fuer diesen Tag ersetzt die Wochenregel vollstaendig.
      -- Ist sie als geschlossen hinterlegt, bleibt gar nichts uebrig.
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _z.mitarbeiter_id
        AND v.datum = _tag
        AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _z.mitarbeiter_id
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _z.mitarbeiter_id AND a.datum = _tag
        )
      ORDER BY 1
    LOOP
      _start := (_tag + _fenster.von) AT TIME ZONE _zone;
      LOOP
        _ende := _start + make_interval(mins => _art.dauer_minuten);
        EXIT WHEN _ende > ((_tag + _fenster.bis) AT TIME ZONE _zone);

        IF _start >= _frueheste AND _start <= _spaeteste THEN
          _block_von := _start - make_interval(mins => _art.puffer_vor_minuten);
          _block_bis := _ende + make_interval(mins => _art.puffer_nach_minuten);

          IF NOT EXISTS (
            SELECT 1 FROM public.buchungen b
            WHERE b.mitarbeiter_id = _z.mitarbeiter_id
              AND b.status <> 'abgesagt'
              AND b.start_at - make_interval(mins => b.puffer_vor_minuten) < _block_bis
              AND b.ende_at + make_interval(mins => b.puffer_nach_minuten) > _block_von
          ) AND NOT public.buchung_termin_belegt(
            _z.mitarbeiter_id, _block_von, _block_bis, _zone
          ) THEN
            _treffer := _treffer || to_jsonb(to_char(_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
          END IF;
        END IF;

        _start := _start + make_interval(mins => _art.raster_minuten);
      END LOOP;
    END LOOP;
    _tag := _tag + 1;
  END LOOP;

  RETURN _treffer;
END;
$$;

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

  -- Vorlaufzeit und Vorausschau
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

  -- Liegt der Termin vollstaendig in einem verfuegbaren Fenster dieses Tages?
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

  -- Zwei Buchende koennen im selben Augenblick auf dieselbe Zeit klicken.
  -- Die Sperre serialisiert das je Mitarbeiter, damit die Pruefung darunter
  -- nicht ins Leere laeuft.
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

  -- Dieselbe Pruefung gegen die Termine im CRM. Ohne sie liesse sich eine
  -- Zeit buchen, in der laengst ein von Hand angelegtes Meeting steht.
  IF public.buchung_termin_belegt(
    _z.mitarbeiter_id,
    _start - make_interval(mins => _art.puffer_vor_minuten),
    _ende + make_interval(mins => _art.puffer_nach_minuten),
    _zone
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  -- Bremse gegen automatisiertes Zumuellen eines bekannten offenen Links.
  IF (SELECT count(*) FROM public.buchungen b
      WHERE b.mitarbeiter_id = _z.mitarbeiter_id
        AND b.created_at > now() - interval '1 hour') > 20 THEN
    RAISE EXCEPTION 'Zu viele Buchungen, bitte spaeter erneut versuchen';
  END IF;

  -- ── Videoraum, damit der Kunde nicht auf einen Link warten muss ──
  --
  -- Der Abzug der Beraterdaten entsteht hier genauso wie beim Anlegen von
  -- Hand: Name, Bild und Erreichbarkeit aus dem Profil, Ort und der Satz an
  -- den Kunden aus den Videocall-Einstellungen.
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

  INSERT INTO public.videoraeume (
    token, art, titel, gastgeber_id, gastgeber_snapshot,
    kontakt_id, termin_at, dauer_minuten, transkript_angeboten
  ) VALUES (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    _art.anlass,
    _art.bezeichnung,
    _z.mitarbeiter_id,
    COALESCE(_abzug, '{}'::jsonb),
    _z.kontakt_id,
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
    _z.mitarbeiter_id, _art.id, _z.link_id, _z.art, _z.kontakt_id,
    _name_sauber, _email_sauber, left(btrim(COALESCE(_telefon, '')), 40),
    left(btrim(COALESCE(_nachricht, '')), 2000),
    _start, _ende, _art.dauer_minuten, _art.puffer_vor_minuten, _art.puffer_nach_minuten,
    _art.bezeichnung, _art.anlass, 'offen', public.buchung_token(), _raum.id
  ) RETURNING * INTO _buchung;

  -- ── Termin in der Kundenakte, sobald der Kontakt bekannt ist ──
  --
  -- Nur beim persoenlichen Link. Wer ueber den offenen Link bucht, ist noch
  -- kein Kontakt. Daraus einen Lead zu machen ist ein eigener Schritt und
  -- passiert bewusst nicht heimlich in dieser Funktion.
  IF _z.kontakt_id IS NOT NULL THEN
    INSERT INTO public.aktivitaeten (
      kunde_id, art, beschreibung, details, von, datum,
      prioritaet, faellig_am, uhrzeit, dauer, teilnehmer, zoom_link
    ) VALUES (
      _z.kontakt_id,
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
      -- Bewusst als Pfad: Die Datenbank kennt die oeffentliche Adresse der
      -- Anwendung nicht, der Browser loest ihn gegen die eigene auf.
      '/raum/' || _raum.token
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
    'anlass', _art.anlass
  );
END;
$$;
REVOKE ALL ON FUNCTION public.buchung_freie_zeiten(text, uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_freie_zeiten(text, uuid, date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text) TO anon, authenticated;
