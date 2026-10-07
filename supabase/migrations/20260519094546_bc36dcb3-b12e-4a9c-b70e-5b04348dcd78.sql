-- User darf seinen eigenen AI-Rate-Limit-Zähler sehen
CREATE POLICY "Users can view own ai_rate_limits"
ON public.ai_rate_limits FOR SELECT
TO authenticated
USING (user_key = auth.uid()::text);