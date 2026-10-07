
-- Drop the mismatched trigger
DROP TRIGGER IF EXISTS aktualisiere_profil_zeitstempel ON public.profiles;

-- Create correct trigger function for profiles
CREATE OR REPLACE FUNCTION public.update_profiles_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_timestamp
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profiles_timestamp();
