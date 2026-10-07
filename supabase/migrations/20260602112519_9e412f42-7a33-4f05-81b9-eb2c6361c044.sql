GRANT EXECUTE ON FUNCTION public.is_internal_role(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_role(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon, service_role;