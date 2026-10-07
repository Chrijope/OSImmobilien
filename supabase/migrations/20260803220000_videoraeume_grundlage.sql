-- Eigener Videoraum, Grundlage.
--
-- Zwei Tabellen: der Raum selbst und seine Teilnehmer. Der Kunde hat kein
-- Konto, er kommt ueber einen Link mit Zufallstoken. Deshalb liest und
-- schreibt er ausschliesslich ueber die vier RPCs weiter unten, die Tabellen
-- selbst sind fuer `anon` vollstaendig gesperrt. Das ist dasselbe Muster wie
-- bei `mobile_scan_sessions`.
--
-- Bewusst noch eng gefasst: anlegen darf einen Raum vorerst nur, wer
-- `is_admin_role` erfuellt (admin oder inhaber). Zoom bleibt unangetastet
-- die Rueckfallloesung fuer alle anderen. Sobald der Videoraum freigegeben
-- ist, wird genau diese eine Policy erweitert.

CREATE TABLE IF NOT EXISTS public.videoraeume (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  art text NOT NULL DEFAULT 'beratung',
  titel text,
  gastgeber_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Abzug der Beraterdaten zum Zeitpunkt der Anlage (Name, Position, Bild,
  -- Telefon, E-Mail). So muss die oeffentliche Ansicht weder `profiles` noch
  -- `user_settings` aufmachen und es kann nichts durchsickern, was der Kunde
  -- nicht sehen soll.
  gastgeber_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  kontakt_id uuid,
  investment_id uuid,
  objekt_id uuid,
  wohnung_id uuid,
  termin_at timestamptz,
  dauer_minuten integer NOT NULL DEFAULT 45,
  agenda jsonb NOT NULL DEFAULT '[]'::jsonb,
  hinweis text,
  status text NOT NULL DEFAULT 'offen',
  transkript_angeboten boolean NOT NULL DEFAULT true,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT videoraeume_art_chk CHECK (art IN ('beratung', 'objektvorstellung', 'sonstiges')),
  CONSTRAINT videoraeume_status_chk CHECK (status IN ('offen', 'laufend', 'beendet'))
);

CREATE INDEX IF NOT EXISTS videoraeume_gastgeber_idx ON public.videoraeume (gastgeber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS videoraeume_kontakt_idx ON public.videoraeume (kontakt_id);

CREATE TABLE IF NOT EXISTS public.videoraum_teilnehmer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raum_id uuid NOT NULL REFERENCES public.videoraeume(id) ON DELETE CASCADE,
  -- Eigenes Geheimnis je Gast. Damit kann ein Gast nur seinen eigenen
  -- Eintrag aendern, auch wenn er den Raumtoken kennt.
  gast_token text NOT NULL UNIQUE,
  name text NOT NULL,
  rolle text NOT NULL DEFAULT 'gast',
  status text NOT NULL DEFAULT 'wartet',
  transkript_zustimmung boolean NOT NULL DEFAULT false,
  technik jsonb NOT NULL DEFAULT '{}'::jsonb,
  beigetreten_at timestamptz NOT NULL DEFAULT now(),
  eingelassen_at timestamptz,
  verlassen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT videoraum_teilnehmer_status_chk
    CHECK (status IN ('wartet', 'eingelassen', 'im_gespraech', 'beendet', 'abgewiesen'))
);

CREATE INDEX IF NOT EXISTS videoraum_teilnehmer_raum_idx ON public.videoraum_teilnehmer (raum_id, beigetreten_at);

DROP TRIGGER IF EXISTS videoraeume_set_updated_at ON public.videoraeume;
CREATE TRIGGER videoraeume_set_updated_at
  BEFORE UPDATE ON public.videoraeume
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS videoraum_teilnehmer_set_updated_at ON public.videoraum_teilnehmer;
CREATE TRIGGER videoraum_teilnehmer_set_updated_at
  BEFORE UPDATE ON public.videoraum_teilnehmer
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Zugriffskontrolle
-- ---------------------------------------------------------------------------

ALTER TABLE public.videoraeume ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videoraum_teilnehmer ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Videoraum lesen" ON public.videoraeume;
CREATE POLICY "Videoraum lesen" ON public.videoraeume
  FOR SELECT TO authenticated
  USING (gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()));

-- Bewusst eng: bis zur Freigabe legt nur admin/inhaber Raeume an.
DROP POLICY IF EXISTS "Videoraum anlegen" ON public.videoraeume;
CREATE POLICY "Videoraum anlegen" ON public.videoraeume
  FOR INSERT TO authenticated
  WITH CHECK (gastgeber_id = auth.uid() AND public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Videoraum aendern" ON public.videoraeume;
CREATE POLICY "Videoraum aendern" ON public.videoraeume
  FOR UPDATE TO authenticated
  USING (gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()))
  WITH CHECK (gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Videoraum loeschen" ON public.videoraeume;
CREATE POLICY "Videoraum loeschen" ON public.videoraeume
  FOR DELETE TO authenticated
  USING (gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Videoraum Teilnehmer lesen" ON public.videoraum_teilnehmer;
CREATE POLICY "Videoraum Teilnehmer lesen" ON public.videoraum_teilnehmer
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.videoraeume r
    WHERE r.id = videoraum_teilnehmer.raum_id
      AND (r.gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()))
  ));

DROP POLICY IF EXISTS "Videoraum Teilnehmer aendern" ON public.videoraum_teilnehmer;
CREATE POLICY "Videoraum Teilnehmer aendern" ON public.videoraum_teilnehmer
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.videoraeume r
    WHERE r.id = videoraum_teilnehmer.raum_id
      AND (r.gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.videoraeume r
    WHERE r.id = videoraum_teilnehmer.raum_id
      AND (r.gastgeber_id = auth.uid() OR public.is_admin_role(auth.uid()))
  ));

-- ---------------------------------------------------------------------------
-- Oeffentlicher Zugang des Gastes, ausschliesslich ueber diese vier Funktionen
-- ---------------------------------------------------------------------------

-- 1) Was der Gast vom Raum sehen darf. Kein Kontaktbezug, keine internen Notizen.
CREATE OR REPLACE FUNCTION public.videoraum_ansicht(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'art', r.art,
    'titel', r.titel,
    'status', r.status,
    'termin_at', r.termin_at,
    'dauer_minuten', r.dauer_minuten,
    'agenda', r.agenda,
    'hinweis', r.hinweis,
    'transkript_angeboten', r.transkript_angeboten,
    'gastgeber', r.gastgeber_snapshot,
    'objekt', COALESCE(r.meta -> 'objekt', '{}'::jsonb)
  )
  FROM public.videoraeume r
  WHERE r.token = _token
    AND r.expires_at > now()
  LIMIT 1
$$;

-- 2) Beitreten. Legt den Teilnehmer an und gibt sein Geheimnis zurueck.
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

  _gast_token := encode(gen_random_bytes(16), 'hex');

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

-- 3) Statusabfrage des Gastes. Dient als Notnagel, falls Realtime klemmt.
CREATE OR REPLACE FUNCTION public.videoraum_gast_status(_gast_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', t.status,
    'raum_status', r.status,
    'name', t.name,
    'teilnehmer_id', t.id
  )
  FROM public.videoraum_teilnehmer t
  JOIN public.videoraeume r ON r.id = t.raum_id
  WHERE t.gast_token = _gast_token
  LIMIT 1
$$;

-- 4) Der Gast verlaesst den Raum oder aktualisiert seinen Technikstand.
CREATE OR REPLACE FUNCTION public.videoraum_gast_melden(
  _gast_token text,
  _status text DEFAULT NULL,
  _technik jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _teilnehmer public.videoraum_teilnehmer;
BEGIN
  -- Der Gast darf sich selbst nur abmelden oder als aktiv melden. Einlassen
  -- ist ausdruecklich nicht dabei, das entscheidet allein der Gastgeber.
  IF _status IS NOT NULL AND _status NOT IN ('wartet', 'im_gespraech', 'beendet') THEN
    RAISE EXCEPTION 'Unzulaessiger Status';
  END IF;

  UPDATE public.videoraum_teilnehmer t
  SET status = COALESCE(_status, t.status),
      technik = COALESCE(_technik, t.technik),
      verlassen_at = CASE WHEN _status = 'beendet' THEN now() ELSE t.verlassen_at END
  WHERE t.gast_token = _gast_token
    -- Ein bereits abgewiesener Gast kann sich nicht selbst zurueckholen.
    AND t.status <> 'abgewiesen'
  RETURNING * INTO _teilnehmer;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Teilnehmer nicht gefunden';
  END IF;

  RETURN jsonb_build_object('status', _teilnehmer.status);
END;
$$;

REVOKE ALL ON FUNCTION public.videoraum_ansicht(text) FROM public;
REVOKE ALL ON FUNCTION public.videoraum_beitreten(text, text, boolean, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.videoraum_gast_status(text) FROM public;
REVOKE ALL ON FUNCTION public.videoraum_gast_melden(text, text, jsonb) FROM public;

GRANT EXECUTE ON FUNCTION public.videoraum_ansicht(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.videoraum_beitreten(text, text, boolean, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.videoraum_gast_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.videoraum_gast_melden(text, text, jsonb) TO anon, authenticated;

-- Der Gastgeber sieht die Warteliste ohne Nachladen.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.videoraum_teilnehmer;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.videoraeume;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
