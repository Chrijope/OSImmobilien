
-- =========================================================
-- 1. profiles: sensible Felder verstecken
-- =========================================================
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT id, name, avatar_url, vp_slug, buchungslink, more_id, created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

DROP POLICY IF EXISTS "Auth sehen Profile" ON public.profiles;
DROP POLICY IF EXISTS "Nutzer sehen alle Profile" ON public.profiles;

CREATE POLICY "Eigenes oder internes Profil sichtbar"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR public.is_internal_role(auth.uid())
);

-- =========================================================
-- 2. wohnungen: kunden-spezifische Felder verstecken
-- =========================================================
CREATE OR REPLACE VIEW public.wohnungen_public
WITH (security_invoker = on) AS
SELECT
  id, objekt_id, we_nr, etage, lage, groesse, zimmer,
  miete_gesamt, vk_gesamt, qm_preis, rendite, vermietet,
  status, erstellt_am, meta
FROM public.wohnungen;

GRANT SELECT ON public.wohnungen_public TO anon, authenticated;

DROP POLICY IF EXISTS "Alle sehen Wohnungen" ON public.wohnungen;

CREATE POLICY "Nur Interne sehen Wohnungen direkt"
ON public.wohnungen
FOR SELECT
TO authenticated
USING (public.is_internal_role(auth.uid()));

-- =========================================================
-- 3. wohnungs_dokumente: nur interne + public view
-- =========================================================
CREATE OR REPLACE VIEW public.wohnungs_dokumente_public
WITH (security_invoker = on) AS
SELECT id, wohnung_id, name, url, kategorie, erstellt_am
FROM public.wohnungs_dokumente;

GRANT SELECT ON public.wohnungs_dokumente_public TO anon, authenticated;

DROP POLICY IF EXISTS "Alle sehen WDokumente" ON public.wohnungs_dokumente;
DROP POLICY IF EXISTS "Alle sehen WohnungsDokumente" ON public.wohnungs_dokumente;

CREATE POLICY "Nur Interne sehen WohnungsDokumente direkt"
ON public.wohnungs_dokumente
FOR SELECT
TO authenticated
USING (public.is_internal_role(auth.uid()));
