ALTER TABLE public.benachrichtigungen
  DROP CONSTRAINT IF EXISTS benachrichtigungen_benutzer_id_fkey,
  ADD CONSTRAINT benachrichtigungen_benutzer_id_fkey
    FOREIGN KEY (benutzer_id) REFERENCES auth.users(id) ON DELETE CASCADE;