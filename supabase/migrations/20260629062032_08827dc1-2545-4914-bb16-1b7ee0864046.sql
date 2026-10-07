
DO $$
DECLARE
  _new_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    _new_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'lukaswillach@willach-media.de',
    crypt('LukasWillach2026!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name','Lukas Willach','role','vertriebsleiter'),
    false, '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), _new_id,
    jsonb_build_object('sub', _new_id::text, 'email', 'lukaswillach@willach-media.de', 'email_verified', true),
    'email', _new_id::text, now(), now(), now()
  );
END $$;
