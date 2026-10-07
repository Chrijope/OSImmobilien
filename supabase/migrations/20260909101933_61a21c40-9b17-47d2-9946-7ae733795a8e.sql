DROP POLICY IF EXISTS "Investagon Dokumente intern lesen" ON storage.objects;
CREATE POLICY "Investagon Dokumente intern lesen" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'investagon-dokumente'
  AND public.is_internal_role(auth.uid())
  AND (
    EXISTS (SELECT 1 FROM public.objekt_dokumente d WHERE d.url = '/investagon-dokument/' || storage.objects.name)
    OR EXISTS (SELECT 1 FROM public.wohnungs_dokumente d WHERE d.url = '/investagon-dokument/' || storage.objects.name)
  )
);

CREATE TABLE IF NOT EXISTS public.investagon_import_details (
  schluessel text PRIMARY KEY,
  version text NOT NULL,
  roh jsonb NOT NULL,
  geladen_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.investagon_import_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investagon_import_details FROM anon, authenticated;
GRANT ALL ON public.investagon_import_details TO service_role;