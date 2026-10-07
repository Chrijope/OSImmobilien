REVOKE EXECUTE ON FUNCTION public.get_onboarding_token(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_onboarding_fortschritt(text,jsonb,text) FROM anon, public;
REVOKE ALL ON public.onboarding_tokens FROM anon;