CREATE TABLE public.investagon_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  art text NOT NULL CHECK (art IN ('property','projekt','reservierung')),
  kennung text NOT NULL,
  ereignis text NOT NULL,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','laeuft','fertig','fehler')),
  versuche integer NOT NULL DEFAULT 0,
  naechster_versuch timestamptz NOT NULL DEFAULT now(),
  letzter_fehler text,
  nutzlast jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX investagon_sync_queue_offen_uniq
  ON public.investagon_sync_queue (art, kennung)
  WHERE status IN ('offen','laeuft');

CREATE INDEX investagon_sync_queue_faellig
  ON public.investagon_sync_queue (status, naechster_versuch);

GRANT SELECT ON public.investagon_sync_queue TO authenticated;
GRANT ALL ON public.investagon_sync_queue TO service_role;

ALTER TABLE public.investagon_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins sehen die Investagon-Warteschlange"
  ON public.investagon_sync_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));

CREATE TRIGGER investagon_sync_queue_updated_at
  BEFORE UPDATE ON public.investagon_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.aktualisiere_zeitstempel();