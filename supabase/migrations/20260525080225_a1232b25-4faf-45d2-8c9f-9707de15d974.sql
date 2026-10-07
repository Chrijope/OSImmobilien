-- 1. objekt_einreichungen: öffentliche INSERT-Policy entfernen
DROP POLICY IF EXISTS "Oeffentliche Einreichungen erstellen" ON public.objekt_einreichungen;

-- 2a. Storage: ansprechpartner – broad auth Policies durch interne ersetzen
DROP POLICY IF EXISTS "Auth upload Ansprechpartner-Bilder" ON storage.objects;
DROP POLICY IF EXISTS "Auth update Ansprechpartner-Bilder" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete Ansprechpartner-Bilder" ON storage.objects;

CREATE POLICY "Interne upload Ansprechpartner"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ansprechpartner' AND public.is_internal_role(auth.uid()));

CREATE POLICY "Interne update Ansprechpartner"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ansprechpartner' AND public.is_internal_role(auth.uid()))
WITH CHECK (bucket_id = 'ansprechpartner' AND public.is_internal_role(auth.uid()));

CREATE POLICY "Interne delete Ansprechpartner"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ansprechpartner' AND public.is_internal_role(auth.uid()));

CREATE POLICY "Interne list Ansprechpartner"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ansprechpartner' AND public.is_internal_role(auth.uid()));

-- 2b. Storage: academy – pauschale Auth-Policies entfernen, Admin-Only behalten + Listing einschränken
DROP POLICY IF EXISTS "Authenticated upload academy" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update academy" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete academy" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated list academy" ON storage.objects;

CREATE POLICY "Admins list academy"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'academy' AND public.is_admin_role(auth.uid()));

-- 2c. Storage: rechnung-logos – Listing nur Owner-Ordner
CREATE POLICY "Nutzer listen eigene Logos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'rechnung-logos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 3. Functions: search_path setzen
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- 4. REVOKE EXECUTE FROM anon auf interne SECURITY-DEFINER-RPCs
REVOKE EXECUTE ON FUNCTION public.bulk_recompute_pipeline()              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_email_artifacts()              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cleanup_ai_rate_limits()               FROM anon, public;
-- OSImmobilien: nur wenn die Funktion existiert (wird nicht per Migration angelegt)
DO $osi$ BEGIN IF to_regprocedure('public.purge_email_queue(text)') IS NOT NULL THEN EXECUTE $q$REVOKE EXECUTE ON FUNCTION public.purge_email_queue(text)                FROM anon, public$q$; END IF; END $osi$;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)             FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)             FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb, jsonb, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text, text, text, jsonb, jsonb, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_kontakt_meta(uuid, jsonb)        FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_user_settings(uuid, jsonb)       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_investment_meta(uuid, jsonb)     FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_empfehlung_kontakt(uuid, text, text, text, text, text, text, text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_notar_termin(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.increment_ai_rate_limit(text, integer) FROM anon, public;

-- Explizit für authenticated freigeben (REVOKE FROM public hätte das auch entzogen)
GRANT EXECUTE ON FUNCTION public.merge_kontakt_meta(uuid, jsonb)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_user_settings(uuid, jsonb)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_investment_meta(uuid, jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_empfehlung_kontakt(uuid, text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_notar_termin(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_rate_limit(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_recompute_pipeline() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_email_artifacts() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_ai_rate_limits() TO service_role;
-- OSImmobilien: nur wenn die Funktion existiert (wird nicht per Migration angelegt)
DO $osi$ BEGIN IF to_regprocedure('public.purge_email_queue(text)') IS NOT NULL THEN EXECUTE $q$GRANT EXECUTE ON FUNCTION public.purge_email_queue(text)  TO service_role$q$; END IF; END $osi$;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)             TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint)             TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;