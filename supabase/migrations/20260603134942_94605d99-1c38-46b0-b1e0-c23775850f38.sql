
-- ============================================================
-- Security Fixes: Punkte 1, 2, 4, 5
-- ============================================================

-- ---------- Punkt 1: Realtime-Kanäle absichern ----------
-- Erlaube SELECT auf realtime.messages nur für interne Rollen
-- ODER wenn der Topic die eigene auth.uid() des Kunden enthält.
-- In der Supabase-Cloud gehört realtime.messages Supabase selbst, RLS ist
-- dort schon eingeschaltet. Ohne Eigentum darf die Migration das nicht
-- setzen, deshalb nur versuchen (OSImmobilien).
DO $realtime_rls$
BEGIN
  ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'realtime.messages: RLS wird von Supabase verwaltet';
END
$realtime_rls$;

DROP POLICY IF EXISTS "realtime_internal_or_own_topic" ON realtime.messages;
CREATE POLICY "realtime_internal_or_own_topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_internal_role(auth.uid())
  OR realtime.topic() LIKE '%' || auth.uid()::text || '%'
);

-- ---------- Punkt 2: activation_tokens explizit sperren ----------
-- Tabelle wird ausschließlich über SECURITY-DEFINER-Funktionen gelesen
-- (get_activation_token, consume_activation_token). Direkter Lesezugriff
-- über die Data API wird hart verweigert.
DROP POLICY IF EXISTS "activation_tokens_deny_select" ON public.activation_tokens;
CREATE POLICY "activation_tokens_deny_select"
ON public.activation_tokens
FOR SELECT
TO authenticated, anon
USING (false);

-- ---------- Punkt 4: Sales-Coach-Audio einschränken ----------
-- Nur Besitzer der Aufnahme oder Admin/Inhaber/Vertriebsleiter/
-- Vertriebspartner dürfen Audio-Dateien lesen.
DROP POLICY IF EXISTS "sca_audio_select_team" ON storage.objects;
CREATE POLICY "sca_audio_select_team"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'sales-coach-audio'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
    OR public.has_role(auth.uid(), 'vertriebspartner'::app_role)
  )
);

-- ---------- Punkt 5: RLS aktiv, aber keine Policy ----------
-- Betroffen: public.activation_tokens — durch Punkt 2 oben bereits
-- mit expliziter Deny-SELECT-Policy versehen. Damit ist Punkt 5
-- automatisch geschlossen.
