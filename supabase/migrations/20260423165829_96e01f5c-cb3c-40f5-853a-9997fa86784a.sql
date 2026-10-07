-- Trigger-Funktion für aktualisiert_am (deutsche Spaltennamen)
CREATE OR REPLACE FUNCTION public.update_aktualisiert_am_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.aktualisiert_am = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Tabelle für Wissenswelt-Artikel-Feedback (Hilfreich / Nicht hilfreich)
CREATE TABLE public.wissenswelt_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  slug TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  erstellt_am TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX idx_wissenswelt_feedback_slug ON public.wissenswelt_feedback(slug);

ALTER TABLE public.wissenswelt_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutzer erstellen eigenes Feedback"
ON public.wissenswelt_feedback
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Nutzer aktualisieren eigenes Feedback"
ON public.wissenswelt_feedback
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Nutzer sehen eigenes Feedback"
ON public.wissenswelt_feedback
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins sehen alles Feedback"
ON public.wissenswelt_feedback
FOR SELECT
TO authenticated
USING (is_admin_role(auth.uid()));

CREATE TRIGGER update_wissenswelt_feedback_aktualisiert_am
BEFORE UPDATE ON public.wissenswelt_feedback
FOR EACH ROW
EXECUTE FUNCTION public.update_aktualisiert_am_column();