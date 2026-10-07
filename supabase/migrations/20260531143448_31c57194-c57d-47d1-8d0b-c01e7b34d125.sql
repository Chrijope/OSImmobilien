DROP POLICY IF EXISTS "sca_select_team" ON public.sales_coach_aufnahmen;

CREATE POLICY "sca_select_team"
ON public.sales_coach_aufnahmen
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_internal_role(auth.uid())
);