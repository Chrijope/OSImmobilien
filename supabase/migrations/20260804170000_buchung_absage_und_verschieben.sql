-- Absagen und Verschieben ziehen Akte, Videoraum und Sperrzeit mit.
--
-- Beim Buchen entstehen drei Dinge in einer Transaktion: die Buchung, ein
-- Videoraum und ein Termin in der Kundenakte (20260804110000, erweitert in
-- 20260804160000). Absagen und Verschieben stammen aber noch aus der
-- Grundlagenmigration 20260804090000 und kennen nur die Buchung selbst. Damit
-- liefen drei Dinge auseinander:
--
--   1. Nach einer Absage blieb der Termin in `aktivitaeten` stehen. Weil
--      `buchung_termin_belegt` jedes Meeting des Mitarbeiters sperrt, war die
--      Zeit danach dauerhaft belegt. Auf der Absageseite steht woertlich
--      "die Zeit wird wieder frei". Sie wurde es nicht.
--   2. Beim Verschieben wanderte nur `buchungen`. Der Termin in der Akte und
--      der Videoraum blieben auf der alten Uhrzeit stehen. Der Partner sah im
--      Kalender die alte Zeit, der Kunde im Warteraum ebenfalls, und die alte
--      Zeit blieb zusaetzlich gesperrt.
--   3. `buchung_verschieben` prueft die Termine aus dem CRM nicht. Die
--      Pruefung kam in 20260804130000 dazu, aber nur fuer `buchung_anlegen`.
--      Ueber den oeffentlichen Zugang liess sich also auf ein von Hand
--      angelegtes Meeting verschieben.
--
-- Diese Migration setzt vorher 20260804110000 bis 20260804160000 voraus, sie
-- braucht `buchungen.videoraum_id` und `buchungen.aktivitaet_id`.

-- ---------------------------------------------------------------------------
-- 1) Belegte CRM-Termine: abgesagte Buchungen zaehlen nicht mehr mit
-- ---------------------------------------------------------------------------
--
-- Der Termin bleibt in der Akte stehen, die Historie soll vollstaendig sein.
-- Er darf danach aber keine Zeit mehr sperren. Zusaetzlich laesst sich ein
-- einzelner Termin ausnehmen: Beim Verschieben darf sich der eigene Termin
-- nicht selbst im Weg stehen.
--
-- Die alte Fassung wird ausdruecklich entfernt, weil ein weiterer Parameter
-- sonst eine zweite, mehrdeutige Ueberladung ergaebe. Die vier bisherigen
-- Aufrufstellen uebergeben weiterhin vier Werte und treffen ueber den
-- Standardwert dieselbe Funktion.
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
      AND (_ohne_aktivitaet IS NULL OR a.id <> _ohne_aktivitaet)
      -- Ein Termin, dessen Buchung abgesagt ist, findet nicht statt und darf
      -- die Zeit nicht weiter sperren.
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
-- Bewusst nicht fuer `anon` freigegeben. Sie wird nur aus den Buchungs-
-- funktionen heraus aufgerufen, die selbst SECURITY DEFINER sind.

-- ---------------------------------------------------------------------------
-- 2) Absagen raeumt hinter sich auf
-- ---------------------------------------------------------------------------
--
-- Die Buchung bleibt stehen und behaelt ihre Zeit, damit die Historie
-- vollstaendig ist. Der Videoraum wird geschlossen, sonst koennte der Kunde
-- ihn zum abgesagten Termin trotzdem betreten. Der Termin in der Akte wird als
-- erledigt gekennzeichnet und der Betreff vorangestellt mit "Abgesagt:", damit
-- er nicht laenger als naechster Termin des Kunden gilt und beim Blick in die
-- Akte sofort klar ist, was mit ihm ist.
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

-- ---------------------------------------------------------------------------
-- 3) Verschieben nimmt Akte und Videoraum mit
-- ---------------------------------------------------------------------------
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

  -- Wurde die Terminart inzwischen geloescht, steht `terminart_id` auf NULL.
  -- Dann gelten die Standardfristen und nicht etwa gar keine: ohne Vorlauf
  -- liesse sich ein Termin auf die naechste Minute schieben.
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

  -- Dauer und Puffer bleiben die der urspruenglichen Buchung.
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

  -- Der eigene Termin darf sich selbst nicht im Weg stehen.
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

  -- Dieselbe Pruefung gegen die Termine im CRM wie beim Anlegen. Der eigene
  -- Termin in der Akte wird ausgenommen, er wird weiter unten selbst bewegt.
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

  -- Der Termin in der Kundenakte gehoert zur selben Sache und muss mit. Sonst
  -- steht im Kalender des Partners weiter die alte Zeit, und die alte Zeit
  -- bleibt zusaetzlich gesperrt.
  IF _alt.aktivitaet_id IS NOT NULL THEN
    UPDATE public.aktivitaeten
    SET faellig_am = (_start AT TIME ZONE _zone)::date,
        uhrzeit = to_char(_start AT TIME ZONE _zone, 'HH24:MI')
    WHERE id = _alt.aktivitaet_id;
  END IF;

  -- Der Videoraum zeigt dem Kunden den Beginn des Gespraechs an.
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
