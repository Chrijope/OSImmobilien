
DO $$
DECLARE _bad int;
BEGIN
  SELECT COUNT(*) INTO _bad FROM public.investments
    WHERE kunde_id IS NULL
       OR kunde_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM public.kontakte k WHERE k.id::text = investments.kunde_id);
  IF _bad > 0 THEN
    RAISE EXCEPTION 'Migration abgebrochen: % ungültige investments.kunde_id Werte', _bad;
  END IF;
END $$;

DROP POLICY IF EXISTS "Kunden sehen eigene Investments" ON public.investments;
DROP POLICY IF EXISTS "Kunden sehen eigene Finanzierungen" ON public.finanzierungen;
DROP INDEX IF EXISTS public.idx_investments_kunde_id;

ALTER TABLE public.investments
  ALTER COLUMN kunde_id TYPE uuid USING kunde_id::uuid,
  ALTER COLUMN kunde_id SET NOT NULL;

ALTER TABLE public.investments
  ADD CONSTRAINT investments_kunde_id_fkey
  FOREIGN KEY (kunde_id) REFERENCES public.kontakte(id) ON DELETE CASCADE;

CREATE INDEX idx_investments_kunde_id ON public.investments (kunde_id);

CREATE POLICY "Kunden sehen eigene Investments"
ON public.investments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = investments.kunde_id
      AND (
        (k.meta ->> 'authUserId') = auth.uid()::text
        OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
      )
  )
);

CREATE POLICY "Kunden sehen eigene Finanzierungen"
ON public.finanzierungen
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.investments i
    JOIN public.kontakte k ON k.id = i.kunde_id
    WHERE i.id::text = finanzierungen.kunde_id
      AND (
        (k.meta ->> 'authUserId') = auth.uid()::text
        OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
      )
  )
);

CREATE OR REPLACE FUNCTION public.cascade_delete_investments_on_kontakt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.investments WHERE kunde_id = OLD.id;
  RETURN OLD;
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.confirm_notar_termin(_investment_id uuid, _datum text, _uhrzeit text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_notar_data jsonb;
  bestaetigt jsonb;
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
  current_notar_data := COALESCE(current_meta -> 'notarData', '{}'::jsonb);
  current_notar_data := jsonb_set(current_notar_data, '{datum}', to_jsonb(_datum), true);
  current_notar_data := jsonb_set(current_notar_data, '{uhrzeit}', to_jsonb(_uhrzeit), true);

  bestaetigt := jsonb_build_object(
    'datum', _datum,
    'uhrzeit', _uhrzeit,
    'bestaetigtAm', to_jsonb(now())
  );

  current_meta := current_meta
    || jsonb_build_object(
      'notarData', current_notar_data,
      'notarTermin', _datum,
      'notarUhrzeit', _uhrzeit,
      'notarTerminBestaetigt', bestaetigt,
      'notarTerminPortalFreigabe', true
    );

  UPDATE public.investments SET meta = current_meta WHERE id = _investment_id;
  RETURN current_meta;
END;
$function$;
