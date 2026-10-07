-- Defense-in-depth: explicitly deny direct SELECT on mobile_scan_sessions
-- Access only via SECURITY DEFINER RPC get_mobile_scan_session.
CREATE POLICY "Deny direct select on mobile_scan_sessions"
  ON public.mobile_scan_sessions
  FOR SELECT
  USING (false);