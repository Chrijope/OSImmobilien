-- Pipeline am Investment, Etappe 2 (Server): nur noch das Investment schreiben
-- (Freigabe Christian, 11.10.2026). Setzt 20261011160000 voraus
-- (kontakt_stufe_nachfuehren fuehrt die Kontaktstufe aus den Investments nach).
--
-- 1. buchung_investment_vorwaerts: Bisher passierte bei mehr als einem
--    laufenden Investment nichts, die Buchung rueckte nur den Kontakt vor.
--    Jetzt rueckt das juengste laufende Investment vor, das noch vor der
--    gebuchten Stufe steht. Ein Termin fuer Erst- oder Beratungsgespraech
--    gehoert zu dem Vorgang, der dort noch nicht war; laufen mehrere frueh,
--    ist es der zuletzt angelegte.
-- 2. bulk_recompute_pipeline: Der Nachtlauf setzte nach einem vergangenen
--    Notartermin das Investment UND blind den Kontakt auf 'faelligkeit', auch
--    wenn ein anderes Investment weiter war. Jetzt nur das Investment; den
--    Kontakt fuehrt der Trigger nach.
-- Aendert keine Daten, wiederholbar. Rechte bleiben (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.buchung_investment_vorwaerts(_kontakt uuid, _stufe text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv_id uuid;
BEGIN
  IF _kontakt IS NULL OR NULLIF(btrim(COALESCE(_stufe, '')), '') IS NULL THEN
    RETURN false;
  END IF;

  -- Beendete Vorgaenge zaehlen nicht; nur nach vorne, nie zurueck.
  SELECT i.id
  INTO _inv_id
  FROM public.investments i
  WHERE i.kunde_id = _kontakt
    AND COALESCE(i.meta ->> 'pipelineStufe', '') NOT IN ('verloren', 'archiviert', 'bestandsimport')
    AND public.buchung_pipeline_rang(_stufe) > public.buchung_pipeline_rang(NULLIF(btrim(COALESCE(i.meta ->> 'pipelineStufe', '')), ''))
  ORDER BY COALESCE(NULLIF(i.meta ->> 'nummer', '')::int, 0) DESC, i.id
  LIMIT 1;

  IF _inv_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.investments
  SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('pipelineStufe', _stufe)
  WHERE id = _inv_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_investment_vorwaerts(uuid, text) FROM public;

COMMENT ON FUNCTION public.buchung_investment_vorwaerts(uuid, text) IS
  'Hebt das juengste laufende Investment eines Kontakts, das noch vor der gebuchten Stufe steht, nur nach vorne (seit 11.10.2026 auch bei mehreren Investments).';

CREATE OR REPLACE FUNCTION public.bulk_recompute_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv_row RECORD;
  _notar_dt timestamptz;
  _notar_advanced int := 0;
BEGIN
  -- A) Notartermin vorbei → faelligkeit, nur am Investment. Die Kontaktstufe
  --    fuehrt trg_kontakt_stufe_nachfuehren nach (seit 11.10.2026).
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
      _notar_advanced := _notar_advanced + 1;
    END IF;
  END LOOP;

  -- B) Der Zweig "nach X Kontaktversuchen automatisch verloren" ist bewusst
  --    entfernt (20260807180000). Die Regel liegt einzig in der Anwendung.

  RETURN jsonb_build_object(
    'notar_advanced', _notar_advanced,
    'lost_advanced', 0,
    'run_at', now()
  );
END;
$$;
