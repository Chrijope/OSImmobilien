
-- Re-create the trigger for new auth users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill: insert profile + inhaber role for existing user
INSERT INTO public.profiles (id, name, email)
SELECT id, COALESCE(raw_user_meta_data ->> 'name', email), email
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, COALESCE((raw_user_meta_data ->> 'role')::app_role, 'kunde'::app_role)
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_roles)
ON CONFLICT (user_id, role) DO NOTHING;
