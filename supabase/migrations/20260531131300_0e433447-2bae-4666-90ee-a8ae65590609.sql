-- Entfernt die offene anonyme INSERT-Policy auf bewerbungen.
-- Bewerbungen werden ab sofort ausschließlich über die Edge Function
-- `submit-bewerbung` (Service-Role + Honeypot + Math-Captcha) eingefügt.

DROP POLICY IF EXISTS "Alle erstellen Bewerbungen" ON public.bewerbungen;

-- anon darf nicht mehr direkt inserten (Service-Role umgeht RLS ohnehin)
REVOKE INSERT ON public.bewerbungen FROM anon;