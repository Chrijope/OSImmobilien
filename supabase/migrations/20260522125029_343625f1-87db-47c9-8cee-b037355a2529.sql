-- ============================================================
-- 1) merge_investment_meta: atomares Meta-Update (analog merge_kontakt_meta)
-- ============================================================
CREATE OR REPLACE FUNCTION public.merge_investment_meta(_investment_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _kunde_id uuid;
  _kontakt_meta jsonb;
BEGIN
  -- Berechtigungs-Check: Caller muss internal sein ODER Eigentümer des Kontakts
  SELECT kunde_id INTO _kunde_id FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT meta INTO _kontakt_meta FROM public.kontakte WHERE id = _kunde_id;

  IF NOT (
    public.is_internal_role(auth.uid())
    OR (_kontakt_meta ->> 'authUserId') = auth.uid()::text
    OR ((_kontakt_meta -> 'person2') ->> 'authUserId') = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.investments
  SET meta = COALESCE(meta, '{}'::jsonb) || _updates
  WHERE id = _investment_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

-- ============================================================
-- 2) clear_unterlagen_freigabe_on_rejection
--    Wenn auf irgendeinem Investment ein Pflicht-Bonitätsdoc auf 'rejected' steht,
--    wird das Freigabe-Datum des Kontakts geleert.
-- ============================================================
CREATE OR REPLACE FUNCTION public.clear_unterlagen_freigabe_on_rejection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _old_statuses jsonb;
  _new_statuses jsonb;
  _doc text;
  _doc_names text[] := ARRAY[
    'Selbstauskunft',
    'Personalausweis',
    'Letzter Gehaltsnachweis',
    'Vorletzter Gehaltsnachweis',
    'Vorvorletzter Gehaltsnachweis',
    'Gehaltsnachweis Dezember Vorjahr'
  ];
  _any_rejected boolean := false;
BEGIN
  _old_statuses := COALESCE(OLD.meta -> 'docStatuses', '{}'::jsonb);
  _new_statuses := COALESCE(NEW.meta -> 'docStatuses', '{}'::jsonb);

  -- Prüfen: Hat sich irgendein Pflichtdoc auf 'rejected' geändert?
  FOREACH _doc IN ARRAY _doc_names LOOP
    IF (_new_statuses ->> _doc) = 'rejected'
       AND COALESCE(_old_statuses ->> _doc, '') <> 'rejected' THEN
      _any_rejected := true;
      EXIT;
    END IF;
  END LOOP;

  IF _any_rejected THEN
    UPDATE public.kontakte
    SET meta = meta - 'unterlagenFreigegebenAm' - 'unterlagenFreigegebenVon'
    WHERE id = NEW.kunde_id
      AND meta ? 'unterlagenFreigegebenAm';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_unterlagen_freigabe ON public.investments;
CREATE TRIGGER trg_clear_unterlagen_freigabe
AFTER UPDATE ON public.investments
FOR EACH ROW
WHEN (OLD.meta IS DISTINCT FROM NEW.meta)
EXECUTE FUNCTION public.clear_unterlagen_freigabe_on_rejection();

-- ============================================================
-- 3) bulk_recompute_pipeline: tägliche Korrektur-Routine
--    - Notartermin vorbei → faelligkeit
--    - 4+ Kontaktversuche & letzter Versuch > 3 Tage her → verloren
-- ============================================================
CREATE OR REPLACE FUNCTION public.bulk_recompute_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv_row RECORD;
  _k_row RECORD;
  _notar_dt timestamptz;
  _notar_advanced int := 0;
  _lost_advanced int := 0;
  _versuche int;
  _last_versuch timestamptz;
BEGIN
  -- A) Notartermin vorbei → faelligkeit
  FOR _inv_row IN
    SELECT id, kunde_id, meta
    FROM public.investments
    WHERE (meta ->> 'pipelineStufe') = 'notar'
      AND (meta ->> 'notarTermin') IS NOT NULL
      AND (meta ->> 'notarUhrzeit') IS NOT NULL
  LOOP
    BEGIN
      _notar_dt := (
        CASE
          WHEN (_inv_row.meta ->> 'notarTermin') ~ '^\d{4}-\d{2}-\d{2}$'
            THEN ((_inv_row.meta ->> 'notarTermin') || 'T' || (_inv_row.meta ->> 'notarUhrzeit') || ':00')::timestamptz
          WHEN (_inv_row.meta ->> 'notarTermin') ~ '^\d{2}\.\d{2}\.\d{4}$'
            THEN to_timestamp(
              (_inv_row.meta ->> 'notarTermin') || ' ' || (_inv_row.meta ->> 'notarUhrzeit'),
              'DD.MM.YYYY HH24:MI'
            )
          ELSE NULL
        END
      );
    EXCEPTION WHEN OTHERS THEN
      _notar_dt := NULL;
    END;

    IF _notar_dt IS NOT NULL AND _notar_dt < now() THEN
      UPDATE public.investments
      SET meta = meta || jsonb_build_object('pipelineStufe', 'faelligkeit')
      WHERE id = _inv_row.id;
      UPDATE public.kontakte
      SET meta = meta || jsonb_build_object('pipelineStufe', 'faelligkeit')
      WHERE id = _inv_row.kunde_id;
      _notar_advanced := _notar_advanced + 1;
    END IF;
  END LOOP;

  -- B) 4+ Kontaktversuche & letzter Versuch > 3 Tage her → verloren
  FOR _k_row IN
    SELECT id, vorname, nachname, meta
    FROM public.kontakte
    WHERE (meta ->> 'pipelineStufe') IN ('neuer_lead', 'kontaktversuche')
      AND NOT COALESCE((meta ->> 'archiviert')::boolean, false)
      AND COALESCE(meta -> 'kontaktversuche', '[]'::jsonb) <> '[]'::jsonb
      AND jsonb_array_length(COALESCE(meta -> 'kontaktversuche', '[]'::jsonb)) >= 4
  LOOP
    BEGIN
      _versuche := jsonb_array_length(_k_row.meta -> 'kontaktversuche');
      _last_versuch := ((_k_row.meta -> 'kontaktversuche' -> (_versuche - 1)) ->> 'zeitpunkt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      _last_versuch := NULL;
    END;

    IF _last_versuch IS NOT NULL AND _last_versuch < now() - interval '3 days' THEN
      UPDATE public.kontakte
      SET meta = meta || jsonb_build_object(
        'pipelineStufe', 'verloren',
        'verlorenAm', to_jsonb(now()),
        'verlorenGrund', 'Nach 4 Versuchen nicht erreicht (automatisch)'
      ),
      status = 'verloren'
      WHERE id = _k_row.id;

      -- Benachrichtigung an Setter (falls bekannt)
      IF (_k_row.meta ->> 'setterId') IS NOT NULL THEN
        BEGIN
          INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
          VALUES (
            ((_k_row.meta ->> 'setterId')::uuid),
            'Lead automatisch verloren',
            _k_row.vorname || ' ' || _k_row.nachname || ' wurde nach 4 Kontaktversuchen automatisch als verloren markiert.',
            '/kunden/' || _k_row.id::text
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      _lost_advanced := _lost_advanced + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'notar_advanced', _notar_advanced,
    'lost_advanced', _lost_advanced,
    'run_at', now()
  );
END;
$$;