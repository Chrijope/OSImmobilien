
CREATE TABLE IF NOT EXISTS public.bewerber_mail_tracking (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bewerber_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('paket_uebersicht','muster_vertrag')),
  paket text,
  paket_titel text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  tracked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bewerber_mail_tracking_bewerber ON public.bewerber_mail_tracking(bewerber_id);

GRANT SELECT, INSERT ON public.bewerber_mail_tracking TO authenticated;
GRANT ALL ON public.bewerber_mail_tracking TO service_role;

ALTER TABLE public.bewerber_mail_tracking ENABLE ROW LEVEL SECURITY;

-- Interne Rollen dürfen alle Tracking-Einträge sehen/erstellen
CREATE POLICY "Interne lesen Tracking"
  ON public.bewerber_mail_tracking FOR SELECT
  TO authenticated
  USING (public.is_internal_role(auth.uid()));

CREATE POLICY "Interne erstellen Tracking"
  ON public.bewerber_mail_tracking FOR INSERT
  TO authenticated
  WITH CHECK (public.is_internal_role(auth.uid()));

-- RPCs zum Setzen von opened/clicked (über Service-Role aus Edge Function)
CREATE OR REPLACE FUNCTION public.mark_bewerber_mail_opened(_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bewerber_mail_tracking
     SET opened_at = COALESCE(opened_at, now())
   WHERE token = _token;
$$;

CREATE OR REPLACE FUNCTION public.mark_bewerber_mail_clicked(_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bewerber_mail_tracking
     SET clicked_at = COALESCE(clicked_at, now()),
         opened_at  = COALESCE(opened_at, now())
   WHERE token = _token;
$$;
