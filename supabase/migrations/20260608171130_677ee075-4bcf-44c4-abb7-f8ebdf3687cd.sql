UPDATE public.profiles
SET avatar_url = 'https://DEIN-SUPABASE-PROJEKT.supabase.co/storage/v1/object/public/avatars/1d6f60b0-71a5-4649-aa94-8ef0302ee3d3/avatar.jpg?t=' || extract(epoch from now())::bigint
WHERE id = '1d6f60b0-71a5-4649-aa94-8ef0302ee3d3';