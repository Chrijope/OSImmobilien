UPDATE auth.users
SET email = 'info@peetz-ventures.de',
    encrypted_password = crypt('Test123!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = 'e81f0a13-0578-4456-9960-07be014d869c';

UPDATE public.profiles
SET email = 'info@peetz-ventures.de'
WHERE id = 'e81f0a13-0578-4456-9960-07be014d869c';