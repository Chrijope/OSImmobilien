-- 1) Test-Account "Christian Peetz" (ottofrank@cuvox.de) komplett entfernen
DELETE FROM public.user_roles WHERE user_id = '665fd37c-f5ca-4e8a-8ec1-c57df89518aa';
DELETE FROM public.profiles WHERE id = '665fd37c-f5ca-4e8a-8ec1-c57df89518aa';
DELETE FROM auth.users WHERE id = '665fd37c-f5ca-4e8a-8ec1-c57df89518aa';

-- 2) Echte Berater-E-Mail von Christian Peetz korrigieren
UPDATE public.profiles
SET email = 'info@immowelten-consult.de',
    updated_at = now()
WHERE id = '27ccfbab-f949-4484-90b1-7dffca6a65c9';