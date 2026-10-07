-- Kundenportal: Loeschen einer hochgeladenen Unterlage wirklich funktional.
--
-- Ausgangslage: Der Loeschen-Knopf im Kundenportal machte ein direktes UPDATE
-- auf public.investments. Kunden haben dort aber nur SELECT, das Update traf
-- null Zeilen OHNE Fehler, der Erfolgs-Toast erschien trotzdem, und nach dem
-- naechsten Laden war die Unterlage wieder da. Auch storage.remove scheiterte
-- still, weil es fuer den Kundenpfad <kontaktId>/... keine DELETE-Policy gab.
--
-- Diese Migration liefert beides:
-- 1. RPC unregister_unterlage_upload (Security Definer) mit derselben
--    Berechtigungspruefung wie register_unterlage_upload inklusive Person 2.
--    Sie entfernt den docStatuses- und den docFileUrls-Eintrag des Dokuments.
-- 2. Eine Storage-DELETE-Policy, damit der Kunde die Datei in seinem eigenen
--    Kontaktordner <kontaktId>/... auch aus dem Bucket entfernen darf
--    (Muster der INSERT-Policy "Kunde upload unterlagen", 20260818130000).

CREATE OR REPLACE FUNCTION public.unregister_unterlage_upload(_investment_id uuid, _doc_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_statuses jsonb;
  current_urls jsonb;
BEGIN
  SELECT * INTO inv_row FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT * INTO kontakt_row FROM public.kontakte WHERE id = inv_row.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  IF NOT (
    public.is_internal_role(auth.uid())
    OR (kontakt_row.meta ->> 'authUserId') = auth.uid()::text
    OR ((kontakt_row.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  current_meta := COALESCE(inv_row.meta, '{}'::jsonb);
  current_statuses := COALESCE(current_meta -> 'docStatuses', '{}'::jsonb) - _doc_name;
  current_urls := COALESCE(current_meta -> 'docFileUrls', '{}'::jsonb) - _doc_name;
  current_meta := jsonb_set(current_meta, '{docStatuses}', current_statuses, true);
  current_meta := jsonb_set(current_meta, '{docFileUrls}', current_urls, true);

  UPDATE public.investments SET meta = current_meta WHERE id = _investment_id;
  RETURN current_meta;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.unregister_unterlage_upload(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unregister_unterlage_upload(uuid, text) TO authenticated;

-- Kunden duerfen Dateien in ihrem eigenen Kontaktordner loeschen.
DROP POLICY IF EXISTS "Kunde loescht unterlagen" ON storage.objects;
CREATE POLICY "Kunde loescht unterlagen"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'unterlagen'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE (
      (k.meta ->> 'authUserId') = auth.uid()::text
      OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
    )
    AND (storage.foldername(name))[1] = k.id::text
  )
);
