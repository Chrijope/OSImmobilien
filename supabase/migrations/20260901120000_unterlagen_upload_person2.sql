-- Kundenportal: Person 2 darf Unterlagen-Uploads registrieren.
--
-- Ausgangslage: register_unterlage_upload (zuletzt Migration 20260517094425)
-- prueft nur meta->>authUserId, also Person 1. Die Storage-Policy
-- "Kunde upload unterlagen" und die RPC confirm_notar_termin pruefen dagegen
-- laengst auch meta->person2->>authUserId. Loggt sich Person 2 ein, geht der
-- Datei-Upload in den Bucket durch, die Registrierung im Investment-Meta
-- schlaegt aber mit "Not allowed" fehl: Die Datei liegt verwaist im Storage
-- und im Profil erscheint nichts.
--
-- Diese Migration zieht die Person-2-Pruefung nach dem Muster von
-- confirm_notar_termin nach. Sonst bleibt die Funktion unveraendert.

CREATE OR REPLACE FUNCTION public.register_unterlage_upload(_investment_id uuid, _doc_name text, _file_url text)
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
  current_statuses := COALESCE(current_meta -> 'docStatuses', '{}'::jsonb);
  current_urls := COALESCE(current_meta -> 'docFileUrls', '{}'::jsonb);

  current_statuses := jsonb_set(current_statuses, ARRAY[_doc_name], to_jsonb('uploaded'::text), true);
  current_urls := jsonb_set(current_urls, ARRAY[_doc_name], to_jsonb(_file_url), true);
  current_meta := jsonb_set(current_meta, '{docStatuses}', current_statuses, true);
  current_meta := jsonb_set(current_meta, '{docFileUrls}', current_urls, true);

  UPDATE public.investments SET meta = current_meta WHERE id = _investment_id;
  RETURN current_meta;
END;
$function$;

-- Rechte wie bisher: nur eingeloggte Nutzer, kein anon-Zugriff.
REVOKE EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) TO authenticated;
