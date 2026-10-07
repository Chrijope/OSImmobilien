-- Hard-Delete Kontakt Ralf Nergin (DSGVO/Bereinigung)
-- Kontakt-ID: 08504c3a-152d-48f7-b865-a945f5390395
DO $$
DECLARE
  _kid uuid := '08504c3a-152d-48f7-b865-a945f5390395';
BEGIN
  DELETE FROM public.aktivitaeten WHERE kunde_id = _kid::text;
  DELETE FROM public.benachrichtigungen WHERE link LIKE '%' || _kid::text || '%';
  DELETE FROM public.follow_ups WHERE kunde_id = _kid::text;
  DELETE FROM public.aufgaben WHERE kontakt_id = _kid;
  DELETE FROM public.anrufe WHERE kontakt_id = _kid;
  DELETE FROM public.emails WHERE kontakt_id = _kid;
  DELETE FROM public.finanzierungen WHERE kunde_id IN (SELECT id::text FROM public.investments WHERE kunde_id = _kid);
  DELETE FROM public.investments WHERE kunde_id = _kid;
  DELETE FROM public.sa_fill_tokens WHERE kontakt_id = _kid;
  DELETE FROM public.activation_tokens WHERE kontakt_id = _kid;
  DELETE FROM public.kontakte WHERE id = _kid;
END $$;
