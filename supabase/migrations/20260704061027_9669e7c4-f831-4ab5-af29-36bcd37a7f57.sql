
-- Vertriebsakademie: Fortschritt & Antworten pro Partner
CREATE TABLE IF NOT EXISTS public.va_partner_antworten (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kapitel_slug TEXT NOT NULL,
  uebung_id TEXT NOT NULL,
  uebung_titel TEXT,
  antwort TEXT NOT NULL DEFAULT '',
  erledigt BOOLEAN NOT NULL DEFAULT false,
  xp INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kapitel_slug, uebung_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.va_partner_antworten TO authenticated;
GRANT ALL ON public.va_partner_antworten TO service_role;

ALTER TABLE public.va_partner_antworten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "va_ant_own_select" ON public.va_partner_antworten
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'inhaber'::public.app_role)
    OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
  );

CREATE POLICY "va_ant_own_insert" ON public.va_partner_antworten
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "va_ant_own_update" ON public.va_partner_antworten
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "va_ant_own_delete" ON public.va_partner_antworten
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_va_ant_updated_at
  BEFORE UPDATE ON public.va_partner_antworten
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_timestamp();

-- Kapitel-Fortschritt aggregiert
CREATE TABLE IF NOT EXISTS public.va_partner_fortschritt (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kapitel_slug TEXT NOT NULL,
  checks_done INT NOT NULL DEFAULT 0,
  uebungen_done INT NOT NULL DEFAULT 0,
  xp_total INT NOT NULL DEFAULT 0,
  pct INT NOT NULL DEFAULT 0,
  kapitel_abgeschlossen BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kapitel_slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.va_partner_fortschritt TO authenticated;
GRANT ALL ON public.va_partner_fortschritt TO service_role;

ALTER TABLE public.va_partner_fortschritt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "va_fort_own_select" ON public.va_partner_fortschritt
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'inhaber'::public.app_role)
    OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
  );

CREATE POLICY "va_fort_own_insert" ON public.va_partner_fortschritt
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "va_fort_own_update" ON public.va_partner_fortschritt
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_va_fort_updated_at
  BEFORE UPDATE ON public.va_partner_fortschritt
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_timestamp();
