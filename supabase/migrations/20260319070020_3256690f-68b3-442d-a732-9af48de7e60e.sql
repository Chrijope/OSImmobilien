-- Create a helper function to check if user can manage objects
CREATE OR REPLACE FUNCTION public.is_objekt_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'inhaber', 'objektpartner')
  )
$$;

-- objekte: update INSERT policy to include objektpartner
DROP POLICY IF EXISTS "Admins erstellen Objekte" ON public.objekte;
CREATE POLICY "Objekt-Manager erstellen Objekte"
ON public.objekte FOR INSERT TO authenticated
WITH CHECK (public.is_objekt_manager(auth.uid()));

-- objekte: update DELETE policy to include objektpartner
DROP POLICY IF EXISTS "Admins loeschen Objekte" ON public.objekte;
CREATE POLICY "Objekt-Manager loeschen Objekte"
ON public.objekte FOR DELETE TO authenticated
USING (public.is_objekt_manager(auth.uid()));

-- objekt_bilder: update INSERT policy
DROP POLICY IF EXISTS "Admins erstellen Bilder" ON public.objekt_bilder;
CREATE POLICY "Objekt-Manager erstellen Bilder"
ON public.objekt_bilder FOR INSERT TO authenticated
WITH CHECK (public.is_objekt_manager(auth.uid()));

-- objekt_bilder: update UPDATE policy
DROP POLICY IF EXISTS "Admins bearbeiten Bilder" ON public.objekt_bilder;
CREATE POLICY "Objekt-Manager bearbeiten Bilder"
ON public.objekt_bilder FOR UPDATE TO authenticated
USING (public.is_objekt_manager(auth.uid()));

-- objekt_bilder: update DELETE policy
DROP POLICY IF EXISTS "Admins loeschen Bilder" ON public.objekt_bilder;
CREATE POLICY "Objekt-Manager loeschen Bilder"
ON public.objekt_bilder FOR DELETE TO authenticated
USING (public.is_objekt_manager(auth.uid()));

-- objekt_dokumente: update INSERT policy
DROP POLICY IF EXISTS "Admins erstellen Dokumente" ON public.objekt_dokumente;
CREATE POLICY "Objekt-Manager erstellen Dokumente"
ON public.objekt_dokumente FOR INSERT TO authenticated
WITH CHECK (public.is_objekt_manager(auth.uid()));

-- objekt_dokumente: update UPDATE policy
DROP POLICY IF EXISTS "Admins bearbeiten Dokumente" ON public.objekt_dokumente;
CREATE POLICY "Objekt-Manager bearbeiten Dokumente"
ON public.objekt_dokumente FOR UPDATE TO authenticated
USING (public.is_objekt_manager(auth.uid()));

-- objekt_dokumente: update DELETE policy
DROP POLICY IF EXISTS "Admins loeschen Dokumente" ON public.objekt_dokumente;
CREATE POLICY "Objekt-Manager loeschen Dokumente"
ON public.objekt_dokumente FOR DELETE TO authenticated
USING (public.is_objekt_manager(auth.uid()));

-- wohnungen: update DELETE policy to include objektpartner
DROP POLICY IF EXISTS "Admins loeschen Wohnungen" ON public.wohnungen;
CREATE POLICY "Objekt-Manager loeschen Wohnungen"
ON public.wohnungen FOR DELETE TO authenticated
USING (public.is_objekt_manager(auth.uid()));