-- Meta Conversion-API: eigenes Zugriffs-Token je Vertriebspartner.
--
-- Die Pixel-ID bleibt bewusst im user_settings-JSON (marketing.metaPixelId),
-- sie ist kein Geheimnis und wird von get-vp-microsite ohnehin von dort
-- gelesen. Das Conversion-API-Token ist dagegen ein Geheimnis und bekommt
-- eine eigene, eng abgesicherte Tabelle: user_settings.einstellungen wird
-- per Realtime verteilt und an vielen Stellen komplett geladen, dort hat ein
-- Token nichts verloren.
--
-- Zugriff: jeder Nutzer nur auf die eigene Zeile, zusaetzlich Admin und
-- Inhaber. Kein Zugriff fuer anon. Die Edge Function submit-lead liest per
-- Service-Role und schickt damit das Lead-Ereignis an Meta.

CREATE TABLE IF NOT EXISTS public.vp_marketing_einstellungen (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_capi_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vp_marketing_einstellungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Marketing-Einstellungen lesen" ON public.vp_marketing_einstellungen;
CREATE POLICY "Marketing-Einstellungen lesen"
ON public.vp_marketing_einstellungen FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'inhaber'::app_role))
);

DROP POLICY IF EXISTS "Marketing-Einstellungen anlegen" ON public.vp_marketing_einstellungen;
CREATE POLICY "Marketing-Einstellungen anlegen"
ON public.vp_marketing_einstellungen FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'inhaber'::app_role))
);

DROP POLICY IF EXISTS "Marketing-Einstellungen aendern" ON public.vp_marketing_einstellungen;
CREATE POLICY "Marketing-Einstellungen aendern"
ON public.vp_marketing_einstellungen FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'inhaber'::app_role))
)
WITH CHECK (
  auth.uid() = user_id
  OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'inhaber'::app_role))
);

-- Kein anonymer Zugriff, auch nicht versehentlich ueber Default-Grants.
REVOKE ALL ON TABLE public.vp_marketing_einstellungen FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vp_marketing_einstellungen TO authenticated;
