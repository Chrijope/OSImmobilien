-- Julians Aktivierungslink wurde durch fehlgeschlagenen HIBP-Passwortversuch gesperrt, aber updateUser lief nie durch. Token wieder freigeben.
UPDATE public.activation_tokens
SET used_at = NULL
WHERE email ILIKE 'julian98.meyer@gmail.com'
  AND used_at IS NOT NULL
  AND expires_at > now();