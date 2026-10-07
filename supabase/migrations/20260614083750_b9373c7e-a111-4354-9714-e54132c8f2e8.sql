
-- 1) Settings (Single-Row Tabelle)
CREATE TABLE public.team_call_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wochentag smallint NOT NULL DEFAULT 1,
  uhrzeit time NOT NULL DEFAULT '20:00',
  dauer_minuten int NOT NULL DEFAULT 60,
  zoom_url text,
  zoom_meeting_id text,
  zoom_kenncode text,
  zoom_telefon text,
  titel text NOT NULL DEFAULT 'Weekly Sales Call',
  beschreibung text DEFAULT '60-minütiger Sales Call: Wochenplanung, offene Fragen aus dem Team, Trainings- und Schulungseinheiten.',
  empfaenger_emails text[] NOT NULL DEFAULT '{}',
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.team_call_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.team_call_settings TO authenticated;
GRANT ALL ON public.team_call_settings TO service_role;

ALTER TABLE public.team_call_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_call_settings select all auth"
ON public.team_call_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "team_call_settings write leitung"
ON public.team_call_settings FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
);

CREATE TRIGGER trg_team_call_settings_ts
BEFORE UPDATE ON public.team_call_settings
FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();

-- Default-Zeile
INSERT INTO public.team_call_settings (titel, beschreibung)
VALUES (
  'Weekly Sales Call',
  '60-minütiger Sales Call: Wochenplanung, offene Fragen aus dem Team, Trainings- und Schulungseinheiten. Bitte tragen Sie Ihre Themen für den Call rechtzeitig ein.'
);

-- 2) Punkte
CREATE TABLE public.team_call_punkte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_datum date NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text,
  user_role text,
  punkte text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_datum, user_id)
);

CREATE INDEX idx_team_call_punkte_datum ON public.team_call_punkte (call_datum);
CREATE INDEX idx_team_call_punkte_user ON public.team_call_punkte (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_call_punkte TO authenticated;
GRANT ALL ON public.team_call_punkte TO service_role;

ALTER TABLE public.team_call_punkte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_call_punkte select own or leitung"
ON public.team_call_punkte FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
);

CREATE POLICY "team_call_punkte insert own"
ON public.team_call_punkte FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "team_call_punkte update own or leitung"
ON public.team_call_punkte FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
);

CREATE POLICY "team_call_punkte delete own or leitung"
ON public.team_call_punkte FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
);

CREATE TRIGGER trg_team_call_punkte_ts
BEFORE UPDATE ON public.team_call_punkte
FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();

-- 3) Protokolle
CREATE TABLE public.team_call_protokolle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_datum date NOT NULL,
  titel text NOT NULL,
  zusammenfassung text,
  transkript text,
  anhang_url text,
  erstellt_von uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  erstellt_von_name text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_call_protokolle_datum ON public.team_call_protokolle (call_datum DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_call_protokolle TO authenticated;
GRANT ALL ON public.team_call_protokolle TO service_role;

ALTER TABLE public.team_call_protokolle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_call_protokolle select all auth"
ON public.team_call_protokolle FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "team_call_protokolle write leitung"
ON public.team_call_protokolle FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'inhaber'::app_role)
  OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
);

CREATE TRIGGER trg_team_call_protokolle_ts
BEFORE UPDATE ON public.team_call_protokolle
FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();
