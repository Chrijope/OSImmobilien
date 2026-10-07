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


-- Datenanweisung des Ursprungsprojekts entfernt (OSImmobilien)

DROP FUNCTION public.admin_force_activate_user(uuid, text);