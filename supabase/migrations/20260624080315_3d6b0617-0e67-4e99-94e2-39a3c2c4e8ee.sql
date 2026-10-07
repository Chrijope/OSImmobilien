UPDATE auth.users
SET encrypted_password = crypt('NicoleHerb2026!', gen_salt('bf')),
    updated_at = now()
WHERE email = 'nicoleherb26@googlemail.com';