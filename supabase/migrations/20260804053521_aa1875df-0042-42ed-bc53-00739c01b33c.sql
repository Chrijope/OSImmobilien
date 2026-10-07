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

ALTER TABLE public.aktivitaeten
  ADD COLUMN IF NOT EXISTS kalender_typ text,
  ADD COLUMN IF NOT EXISTS kalender_event_id text,
  ADD COLUMN IF NOT EXISTS kalender_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aktivitaeten_kalender_typ_chk'
  ) THEN
    ALTER TABLE public.aktivitaeten
      ADD CONSTRAINT aktivitaeten_kalender_typ_chk
      CHECK (kalender_typ IS NULL OR kalender_typ IN ('google', 'apple'));
  END IF;
END $$;

-- Fuer das Aufraeumen: welche Termine haengen ueberhaupt an einem Kalender?
CREATE INDEX IF NOT EXISTS aktivitaeten_kalender_idx
  ON public.aktivitaeten (kalender_typ, kalender_event_id)
  WHERE kalender_event_id IS NOT NULL;