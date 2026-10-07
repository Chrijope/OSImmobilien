-- Vertriebsakademie: Ergebnisse prüfbarer Aufgaben und Abwägungsfälle
--
-- Neu gegenüber va_partner_antworten: Hier steht nicht der Freitext eines
-- Partners, sondern ein Ergebnis, das richtig oder falsch sein kann. Punkte
-- werden ausschließlich für richtige Lösungen vergeben.

CREATE TABLE IF NOT EXISTS public.va_aufgaben_ergebnisse (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kapitel_slug TEXT NOT NULL,
  aufgabe_id TEXT NOT NULL,
  versuche INT NOT NULL DEFAULT 0,
  geloest BOOLEAN NOT NULL DEFAULT false,
  punkte INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kapitel_slug, aufgabe_id)
);

CREATE INDEX IF NOT EXISTS idx_va_aufgaben_user ON public.va_aufgaben_ergebnisse (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.va_aufgaben_ergebnisse TO authenticated;
GRANT ALL ON public.va_aufgaben_ergebnisse TO service_role;

ALTER TABLE public.va_aufgaben_ergebnisse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "va_aufg_select" ON public.va_aufgaben_ergebnisse
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'inhaber'::public.app_role)
    OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
  );

CREATE POLICY "va_aufg_insert" ON public.va_aufgaben_ergebnisse
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "va_aufg_update" ON public.va_aufgaben_ergebnisse
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "va_aufg_delete" ON public.va_aufgaben_ergebnisse
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_va_aufg_updated_at
  BEFORE UPDATE ON public.va_aufgaben_ergebnisse
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_timestamp();


-- Abwägungsfälle im Profi-Pfad
--
-- Hier gibt es keine richtige Antwort. Gespeichert wird nur, welchen Weg der
-- Partner gewählt hat, damit die anonyme Verteilung im Team berechnet werden
-- kann. Die eigene Zeile darf jeder sehen, fremde Zeilen niemand: Die
-- Verteilung kommt ausschließlich aus der Funktion unten, die reine Zählwerte
-- liefert und erst ab acht Antworten überhaupt etwas zurückgibt.

CREATE TABLE IF NOT EXISTS public.va_abwaegung_antworten (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kapitel_slug TEXT NOT NULL,
  fall_id TEXT NOT NULL,
  weg_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kapitel_slug, fall_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.va_abwaegung_antworten TO authenticated;
GRANT ALL ON public.va_abwaegung_antworten TO service_role;

ALTER TABLE public.va_abwaegung_antworten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "va_abw_own_select" ON public.va_abwaegung_antworten
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "va_abw_own_insert" ON public.va_abwaegung_antworten
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "va_abw_own_update" ON public.va_abwaegung_antworten
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "va_abw_own_delete" ON public.va_abwaegung_antworten
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_va_abw_updated_at
  BEFORE UPDATE ON public.va_abwaegung_antworten
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_timestamp();


-- Anonyme Verteilung eines Abwägungsfalls.
--
-- Gibt nichts zurück, solange weniger als die geforderte Zahl an Antworten
-- vorliegt. Damit lässt sich aus dem Ergebnis nicht auf eine einzelne Person
-- schließen, auch nicht bei einem kleinen Team.
CREATE OR REPLACE FUNCTION public.va_abwaegung_verteilung(
  p_kapitel_slug TEXT,
  p_fall_id TEXT,
  p_mindest INT DEFAULT 8
)
RETURNS TABLE (weg_id TEXT, anzahl BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gesamt BIGINT;
BEGIN
  SELECT count(*) INTO v_gesamt
  FROM public.va_abwaegung_antworten a
  WHERE a.kapitel_slug = p_kapitel_slug AND a.fall_id = p_fall_id;

  IF v_gesamt < p_mindest THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.weg_id, count(*)::BIGINT
  FROM public.va_abwaegung_antworten a
  WHERE a.kapitel_slug = p_kapitel_slug AND a.fall_id = p_fall_id
  GROUP BY a.weg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.va_abwaegung_verteilung(TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.va_abwaegung_verteilung(TEXT, TEXT, INT) TO authenticated;
