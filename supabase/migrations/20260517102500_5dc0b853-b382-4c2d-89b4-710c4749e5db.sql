-- =========================================================
-- Block 1 / Schritt 1: Storage hardening
-- =========================================================
-- 1) Neuer public Bucket für Marketing-Medien (Exposés, Objektfotos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('objekt-medien', 'objekt-medien', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) Sensible Buckets auf privat schalten
UPDATE storage.buckets SET public = false WHERE id IN ('unterlagen', 'academy', 'avatars');

-- =========================================================
-- RLS Policies
-- =========================================================
-- objekt-medien (public read, internal write)
DROP POLICY IF EXISTS "objekt_medien_public_read" ON storage.objects;
CREATE POLICY "objekt_medien_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'objekt-medien');

DROP POLICY IF EXISTS "objekt_medien_internal_write" ON storage.objects;
CREATE POLICY "objekt_medien_internal_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'objekt-medien' AND public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "objekt_medien_internal_update" ON storage.objects;
CREATE POLICY "objekt_medien_internal_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'objekt-medien' AND public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "objekt_medien_internal_delete" ON storage.objects;
CREATE POLICY "objekt_medien_internal_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'objekt-medien' AND public.is_internal_role(auth.uid()));

-- unterlagen (privat): authenticated users dürfen lesen (RLS schützt durch Auth);
-- feinere Pfad-Trennung kommt in Schritt 6 (IDOR-Fix portal).
DROP POLICY IF EXISTS "unterlagen_auth_read" ON storage.objects;
CREATE POLICY "unterlagen_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'unterlagen');

DROP POLICY IF EXISTS "unterlagen_auth_write" ON storage.objects;
CREATE POLICY "unterlagen_auth_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'unterlagen');

DROP POLICY IF EXISTS "unterlagen_auth_update" ON storage.objects;
CREATE POLICY "unterlagen_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'unterlagen');

DROP POLICY IF EXISTS "unterlagen_internal_delete" ON storage.objects;
CREATE POLICY "unterlagen_internal_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'unterlagen' AND public.is_internal_role(auth.uid()));

-- academy (privat): nur authenticated read
DROP POLICY IF EXISTS "academy_auth_read" ON storage.objects;
CREATE POLICY "academy_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'academy');

DROP POLICY IF EXISTS "academy_admin_write" ON storage.objects;
CREATE POLICY "academy_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'academy' AND public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "academy_admin_update" ON storage.objects;
CREATE POLICY "academy_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'academy' AND public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "academy_admin_delete" ON storage.objects;
CREATE POLICY "academy_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'academy' AND public.is_admin_role(auth.uid()));

-- avatars (privat): jeder authenticated darf lesen, aber nur Owner schreiben (Pfad: {user_id}/...)
DROP POLICY IF EXISTS "avatars_auth_read" ON storage.objects;
CREATE POLICY "avatars_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_write" ON storage.objects;
CREATE POLICY "avatars_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin_role(auth.uid())));