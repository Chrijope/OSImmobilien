REVOKE EXECUTE ON FUNCTION public.consume_mfa_recovery_code(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mfa_recovery_code(UUID, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mfa_recovery_codes_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_recovery_codes_status(UUID) TO authenticated, service_role;