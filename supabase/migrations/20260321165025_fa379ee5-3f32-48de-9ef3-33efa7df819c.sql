-- Assign all roles to test admin (f89c9ecd-b4bb-4e71-a31f-22e955e16281)
INSERT INTO public.user_roles (user_id, role)
SELECT 'f89c9ecd-b4bb-4e71-a31f-22e955e16281'::uuid, r.role
FROM (SELECT unnest(enum_range(NULL::app_role)) AS role) r
WHERE r.role != 'admin' -- admin already exists
ON CONFLICT (user_id, role) DO NOTHING;