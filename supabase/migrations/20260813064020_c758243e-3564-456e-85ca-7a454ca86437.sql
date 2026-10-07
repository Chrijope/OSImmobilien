DROP POLICY IF EXISTS "Admins loeschen Investments" ON public.investments;

CREATE POLICY "Admins und zustaendige VP loeschen Investments"
ON public.investments
FOR DELETE
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = investments.kunde_id
      AND public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta)
  )
);