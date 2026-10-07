
REVOKE EXECUTE ON FUNCTION public.check_auth_lockout(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_auth_attempt(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_auth_lockout(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_auth_attempt(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
