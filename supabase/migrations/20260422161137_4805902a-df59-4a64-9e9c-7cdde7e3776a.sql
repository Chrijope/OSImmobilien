CREATE OR REPLACE FUNCTION public.admin_force_activate_user(_user_id uuid, _new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(_new_password, extensions.gen_salt('bf', 10)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = _user_id;
END;
$$;

SELECT public.admin_force_activate_user('d39b400d-0293-4e70-a0e7-ff0f81fed37f', '1v!OAT4lSfA!aKg0jluO');
SELECT public.admin_force_activate_user('9f814176-fcf2-42c6-9347-380754abcca2', 'oO+YHbE$iYeT3DipbDE5');

DROP FUNCTION public.admin_force_activate_user(uuid, text);