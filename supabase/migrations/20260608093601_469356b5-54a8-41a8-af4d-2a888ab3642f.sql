DROP POLICY IF EXISTS "Interne (non-VP) sehen Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Interne (non-VP) bearbeiten Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Interne (non-VP) loeschen Kontakte" ON public.kontakte;

CREATE POLICY "Admin und interne Rollen sehen Kontakte"
ON public.kontakte
FOR SELECT
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR (
    public.is_internal_role(auth.uid())
    AND NOT public.has_role(auth.uid(), 'vertriebspartner'::app_role)
  )
);

CREATE POLICY "Admin und interne Rollen bearbeiten Kontakte"
ON public.kontakte
FOR UPDATE
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR (
    public.is_internal_role(auth.uid())
    AND NOT public.has_role(auth.uid(), 'vertriebspartner'::app_role)
  )
)
WITH CHECK (
  public.is_admin_role(auth.uid())
  OR (
    public.is_internal_role(auth.uid())
    AND NOT public.has_role(auth.uid(), 'vertriebspartner'::app_role)
  )
);

CREATE POLICY "Admin und interne Rollen loeschen Kontakte"
ON public.kontakte
FOR DELETE
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR (
    public.is_internal_role(auth.uid())
    AND NOT public.has_role(auth.uid(), 'vertriebspartner'::app_role)
  )
);