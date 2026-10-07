-- ============================================================
-- PUNKT 1: Realtime-Channel — Substring-Match durch exakten Match ersetzen
-- ============================================================
DROP POLICY IF EXISTS "realtime_internal_or_own_topic" ON realtime.messages;

CREATE POLICY "realtime_internal_or_own_topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_internal_role(auth.uid())
  OR realtime.topic() = 'user:' || auth.uid()::text
  OR realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
);

-- ============================================================
-- PUNKT 2: Bewerbungen Storage-Bucket — anonyme Uploads sperren
-- ============================================================
DROP POLICY IF EXISTS "Public can upload bewerbung vertrag pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Public can read bewerbung vertrag pdfs" ON storage.objects;

-- Nur interne Rollen (Admin/Inhaber/HR/Backoffice) dürfen Vertrags-PDFs hochladen
CREATE POLICY "Internal roles can upload bewerbung vertrag pdfs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bewerbungen'
  AND (storage.foldername(name))[1] = 'vertrag'
  AND (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'backoffice'::app_role)
  )
);

CREATE POLICY "Internal roles can read bewerbung vertrag pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'bewerbungen'
  AND (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'backoffice'::app_role)
  )
);