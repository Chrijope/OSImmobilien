-- OSImmobilien: nur wenn die Funktion existiert (wird nicht per Migration angelegt)
DO $osi$ BEGIN IF to_regprocedure('public.get_onboarding_token(text)') IS NOT NULL THEN EXECUTE $q$REVOKE EXECUTE ON FUNCTION public.get_onboarding_token(text) FROM anon, public$q$; END IF; END $osi$;
-- OSImmobilien: nur wenn die Funktion existiert (wird nicht per Migration angelegt)
DO $osi$ BEGIN IF to_regprocedure('public.update_onboarding_fortschritt(text,jsonb,text)') IS NOT NULL THEN EXECUTE $q$REVOKE EXECUTE ON FUNCTION public.update_onboarding_fortschritt(text,jsonb,text) FROM anon, public$q$; END IF; END $osi$;
-- OSImmobilien: nur wenn die Tabelle existiert (wird nicht per Migration angelegt)
DO $osi$ BEGIN IF to_regclass('public.onboarding_tokens') IS NOT NULL THEN EXECUTE $q$REVOKE ALL ON public.onboarding_tokens FROM anon$q$; END IF; END $osi$;