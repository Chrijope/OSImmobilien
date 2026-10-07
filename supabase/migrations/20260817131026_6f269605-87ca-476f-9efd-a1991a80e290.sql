-- Fortlaufende Kundennummer zentral in der Datenbank vergeben.
-- Bisher rechnete der Browser `max(moreId) + 1` aus dem Cache. Beim
-- Bulk-Import waeren dabei zwangslaeufig Doubletten entstanden.
CREATE SEQUENCE IF NOT EXISTS public.kontakt_more_id_seq AS bigint START 1;

-- Sequenz auf den heutigen Hoechstwert setzen, damit keine Nummer doppelt kommt.
SELECT setval(
  'public.kontakt_more_id_seq',
  GREATEST(
    (SELECT COALESCE(MAX((meta ->> 'moreId')::bigint), 0) FROM public.kontakte
      WHERE (meta ->> 'moreId') ~ '^[0-9]+$'),
    1
  )
);

CREATE OR REPLACE FUNCTION public.kontakt_more_id_vergeben()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.meta IS NULL THEN
    NEW.meta := '{}'::jsonb;
  END IF;
  -- Nur setzen, wenn keine gueltige Nummer mitgeliefert wurde.
  IF NOT ((NEW.meta ->> 'moreId') ~ '^[0-9]+$') OR COALESCE((NEW.meta ->> 'moreId')::bigint, 0) = 0 THEN
    NEW.meta := NEW.meta || jsonb_build_object('moreId', nextval('public.kontakt_more_id_seq'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kontakt_more_id_trigger ON public.kontakte;
CREATE TRIGGER kontakt_more_id_trigger
  BEFORE INSERT ON public.kontakte
  FOR EACH ROW EXECUTE FUNCTION public.kontakt_more_id_vergeben();

-- Nur aktive Kontakte werden in Listen geladen. Der Teilindex haelt die
-- seitenweise Abfrage auch bei zehntausenden geloeschten Altzeilen schnell.
CREATE INDEX IF NOT EXISTS idx_kontakte_aktiv_erstellt
  ON public.kontakte (erstellt_am DESC, id)
  WHERE geloescht IS NOT TRUE;

-- Import-Stapel: fuer "Import zuruecknehmen" und fuer die Idempotenzpruefung.
CREATE INDEX IF NOT EXISTS idx_kontakte_meta_import_batch
  ON public.kontakte ((meta ->> 'importBatchId'))
  WHERE (meta ->> 'importBatchId') IS NOT NULL;

-- Dublettenpruefung beim Import laeuft ueber E-Mail und Telefon.
CREATE INDEX IF NOT EXISTS idx_kontakte_email_lower
  ON public.kontakte (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_kontakte_telefon
  ON public.kontakte (telefon)
  WHERE telefon IS NOT NULL AND telefon <> '';