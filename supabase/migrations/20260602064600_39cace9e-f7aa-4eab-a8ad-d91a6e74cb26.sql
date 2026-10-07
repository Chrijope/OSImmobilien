CREATE POLICY "Loeschen SupportTickets"
ON public.support_tickets
FOR DELETE
TO authenticated
USING (
  public.is_admin_role(auth.uid())
  OR benutzer_id = auth.uid()
);

GRANT DELETE ON public.support_tickets TO authenticated;