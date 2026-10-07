
-- Fix remaining permissive policies on wohnungs_bilder
DROP POLICY IF EXISTS "Auth bearbeiten WohnungsBilder" ON public.wohnungs_bilder;
DROP POLICY IF EXISTS "Auth erstellen WohnungsBilder" ON public.wohnungs_bilder;
DROP POLICY IF EXISTS "Auth loeschen WohnungsBilder" ON public.wohnungs_bilder;

-- Fix remaining permissive policies on wohnungs_dokumente
DROP POLICY IF EXISTS "Auth bearbeiten WohnungsDokumente" ON public.wohnungs_dokumente;
DROP POLICY IF EXISTS "Auth erstellen WohnungsDokumente" ON public.wohnungs_dokumente;
DROP POLICY IF EXISTS "Auth loeschen WohnungsDokumente" ON public.wohnungs_dokumente;

-- Bewerbungen INSERT true is OK - public application form
