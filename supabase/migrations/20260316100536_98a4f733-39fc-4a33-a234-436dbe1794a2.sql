
-- Tighten RLS: batch 1 (kontakte, finanzierungen, mieter, investments, aktivitaeten, follow_ups, follow_up_ketten)
DROP POLICY IF EXISTS "Nutzer sehen zugewiesene Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Nutzer bearbeiten zugewiesene Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Nutzer erstellen Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Auth loeschen Kontakte" ON public.kontakte;
CREATE POLICY "Interne sehen Kontakte" ON public.kontakte FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Kontakte" ON public.kontakte FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Kontakte" ON public.kontakte FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));
CREATE POLICY "Admins loeschen Kontakte" ON public.kontakte FOR DELETE TO authenticated USING (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Finanzierungen" ON public.finanzierungen;
DROP POLICY IF EXISTS "Auth bearbeiten Finanzierungen" ON public.finanzierungen;
DROP POLICY IF EXISTS "Auth erstellen Finanzierungen" ON public.finanzierungen;
CREATE POLICY "Interne sehen Finanzierungen" ON public.finanzierungen FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Finanzierungen" ON public.finanzierungen FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Finanzierungen" ON public.finanzierungen FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Mieter" ON public.mieter;
DROP POLICY IF EXISTS "Auth bearbeiten Mieter" ON public.mieter;
DROP POLICY IF EXISTS "Auth erstellen Mieter" ON public.mieter;
DROP POLICY IF EXISTS "Auth loeschen Mieter" ON public.mieter;
CREATE POLICY "Interne sehen Mieter" ON public.mieter FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Mieter" ON public.mieter FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Mieter" ON public.mieter FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));
CREATE POLICY "Admins loeschen Mieter" ON public.mieter FOR DELETE TO authenticated USING (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Investments" ON public.investments;
DROP POLICY IF EXISTS "Auth bearbeiten Investments" ON public.investments;
DROP POLICY IF EXISTS "Auth erstellen Investments" ON public.investments;
CREATE POLICY "Interne sehen Investments" ON public.investments FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Investments" ON public.investments FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Investments" ON public.investments FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Aktivitaeten" ON public.aktivitaeten;
DROP POLICY IF EXISTS "Auth bearbeiten Aktivitaeten" ON public.aktivitaeten;
DROP POLICY IF EXISTS "Auth erstellen Aktivitaeten" ON public.aktivitaeten;
DROP POLICY IF EXISTS "Auth loeschen Aktivitaeten" ON public.aktivitaeten;
CREATE POLICY "Interne sehen Aktivitaeten" ON public.aktivitaeten FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Aktivitaeten" ON public.aktivitaeten FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Aktivitaeten" ON public.aktivitaeten FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne loeschen Aktivitaeten" ON public.aktivitaeten FOR DELETE TO authenticated USING (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen FollowUps" ON public.follow_ups;
DROP POLICY IF EXISTS "Auth bearbeiten FollowUps" ON public.follow_ups;
DROP POLICY IF EXISTS "Auth erstellen FollowUps" ON public.follow_ups;
DROP POLICY IF EXISTS "Auth loeschen FollowUps" ON public.follow_ups;
CREATE POLICY "Interne sehen FollowUps" ON public.follow_ups FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten FollowUps" ON public.follow_ups FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen FollowUps" ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne loeschen FollowUps" ON public.follow_ups FOR DELETE TO authenticated USING (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Ketten" ON public.follow_up_ketten;
DROP POLICY IF EXISTS "Auth bearbeiten Ketten" ON public.follow_up_ketten;
DROP POLICY IF EXISTS "Auth erstellen Ketten" ON public.follow_up_ketten;
DROP POLICY IF EXISTS "Auth loeschen Ketten" ON public.follow_up_ketten;
CREATE POLICY "Interne sehen Ketten" ON public.follow_up_ketten FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Ketten" ON public.follow_up_ketten FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Ketten" ON public.follow_up_ketten FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne loeschen Ketten" ON public.follow_up_ketten FOR DELETE TO authenticated USING (public.is_internal_role(auth.uid()));
