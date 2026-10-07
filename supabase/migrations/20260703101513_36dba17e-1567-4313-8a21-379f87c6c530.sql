-- 1) kontakt_view_log Tabelle
CREATE TABLE public.kontakt_view_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kontakt_id uuid NOT NULL,
  feld text NOT NULL DEFAULT 'profil',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kontakt_view_log_user_time ON public.kontakt_view_log(user_id, created_at DESC);
CREATE INDEX idx_kontakt_view_log_kontakt ON public.kontakt_view_log(kontakt_id);

GRANT SELECT, INSERT ON public.kontakt_view_log TO authenticated;
GRANT ALL ON public.kontakt_view_log TO service_role;

ALTER TABLE public.kontakt_view_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own view log"
  ON public.kontakt_view_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

CREATE POLICY "Users insert own view log"
  ON public.kontakt_view_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2) log_kontakt_view RPC (schreibt + prüft Bulk-Alert)
CREATE OR REPLACE FUNCTION public.log_kontakt_view(_kontakt_id uuid, _feld text DEFAULT 'profil')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _recent_count int;
  _admin record;
  _user_name text;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.kontakt_view_log (user_id, kontakt_id, feld)
  VALUES (_uid, _kontakt_id, COALESCE(_feld, 'profil'));

  -- Bulk-Alert prüfen: >50 unterschiedliche Kontakte in 5 Minuten
  SELECT COUNT(DISTINCT kontakt_id) INTO _recent_count
  FROM public.kontakt_view_log
  WHERE user_id = _uid
    AND feld = 'profil'
    AND created_at > now() - interval '5 minutes';

  IF _recent_count > 50 THEN
    -- Dedupe: nur einmal pro Stunde alarmieren
    IF NOT EXISTS (
      SELECT 1 FROM public.benachrichtigungen
      WHERE typ = 'bulk_view_alert'
        AND meta->>'user_id' = _uid::text
        AND created_at > now() - interval '1 hour'
    ) THEN
      SELECT COALESCE(display_name, email, _uid::text) INTO _user_name
      FROM public.profiles WHERE id = _uid;

      FOR _admin IN
        SELECT ur.user_id FROM public.user_roles ur
        WHERE ur.role IN ('admin','inhaber')
      LOOP
        INSERT INTO public.benachrichtigungen (user_id, typ, titel, nachricht, meta)
        VALUES (
          _admin.user_id,
          'bulk_view_alert',
          'Bulk-Zugriff auf Kontakte',
          COALESCE(_user_name,'Ein Nutzer') || ' hat in 5 Minuten ' || _recent_count || ' Kontakte geöffnet.',
          jsonb_build_object('user_id', _uid, 'count', _recent_count, 'window', '5min')
        );
      END LOOP;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_kontakt_view(uuid, text) TO authenticated;

-- 3) gekuendigt_am für Bewerbungen
ALTER TABLE public.bewerbungen
  ADD COLUMN IF NOT EXISTS gekuendigt_am timestamptz NULL;