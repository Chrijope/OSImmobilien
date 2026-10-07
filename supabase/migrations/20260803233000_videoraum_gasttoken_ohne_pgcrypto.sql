-- Beitreten scheiterte mit "function gen_random_bytes(integer) does not exist".
--
-- `gen_random_bytes` steckt in der Erweiterung `pgcrypto`, die in diesem
-- Projekt nicht aktiv ist. `gen_random_uuid()` dagegen bringt Postgres seit
-- Version 13 selbst mit und wird hier ohnehin schon als Standardwert benutzt.
--
-- Zwei zusammengesetzte UUIDs ergeben 64 Hexzeichen. Das ist mindestens so
-- schwer zu erraten wie die 16 Zufallsbytes vorher, und es kommt ohne eine
-- zusaetzliche Erweiterung aus, die erst jemand in Supabase einschalten
-- muesste.

CREATE OR REPLACE FUNCTION public.videoraum_beitreten(
  _token text,
  _name text,
  _transkript boolean DEFAULT false,
  _technik jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _raum public.videoraeume;
  _gast_token text;
  _teilnehmer public.videoraum_teilnehmer;
  _name_sauber text;
BEGIN
  SELECT * INTO _raum
  FROM public.videoraeume
  WHERE token = _token AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Raum nicht gefunden oder abgelaufen';
  END IF;

  IF _raum.status = 'beendet' THEN
    RAISE EXCEPTION 'Das Gespraech ist bereits beendet';
  END IF;

  _name_sauber := NULLIF(btrim(COALESCE(_name, '')), '');
  IF _name_sauber IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Namen angeben';
  END IF;
  _name_sauber := left(_name_sauber, 80);

  -- Bremse gegen automatisiertes Zumuellen eines bekannten Raumlinks.
  IF (SELECT count(*) FROM public.videoraum_teilnehmer
      WHERE raum_id = _raum.id AND beigetreten_at > now() - interval '1 hour') > 40 THEN
    RAISE EXCEPTION 'Zu viele Beitritte, bitte spaeter erneut versuchen';
  END IF;

  _gast_token := replace(gen_random_uuid()::text, '-', '')
              || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.videoraum_teilnehmer (raum_id, gast_token, name, rolle, status, transkript_zustimmung, technik)
  VALUES (_raum.id, _gast_token, _name_sauber, 'gast', 'wartet', COALESCE(_transkript, false), COALESCE(_technik, '{}'::jsonb))
  RETURNING * INTO _teilnehmer;

  RETURN jsonb_build_object(
    'gast_token', _teilnehmer.gast_token,
    'teilnehmer_id', _teilnehmer.id,
    'name', _teilnehmer.name,
    'status', _teilnehmer.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.videoraum_beitreten(text, text, boolean, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.videoraum_beitreten(text, text, boolean, jsonb) TO anon, authenticated;
