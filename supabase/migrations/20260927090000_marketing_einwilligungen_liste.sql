-- ===========================================================================
-- Pixel-Nachweise bei wiederholten Anfragen: geschuetzte Liste am Kontakt
-- ===========================================================================
--
-- AUSGANGSLAGE (Christian, 27.09.2026, Punkt 9; Codex-Pruefung DS-002)
--
-- Kommt eine Anfrage zu einem bestehenden Kontakt (Dublette), legte
-- `submit-lead` den Nachweis der Pixel-Einwilligung bisher nur unter
-- `meta.weitereAnfragen[].angaben.meta.marketingEinwilligung` ab. Dort ist
-- er nicht geschuetzt, und nach 25 Anfragen faellt er heraus.
--
-- Seit dem 27.09.2026 steht jeder solche Nachweis zusaetzlich in
-- `meta.marketingEinwilligungen`, einer Liste auf oberster Ebene, die nur
-- waechst. Angehaengt wird ausschliesslich ueber die neue Funktion
-- `kontakt_marketing_nachweis_anhaengen`, atomar in einer Anweisung. So
-- verlieren zwei gleichzeitige Anfragen keinen Eintrag, und kein Weg, der
-- das ganze `meta` mit einem veralteten Stand schreibt (etwa invite-user),
-- kann die Liste ueberschreiben.
--
-- WAS SIE TUT
--
-- 1. `kontakt_marketing_nachweis_anhaengen(p_kontakt_id, p_nachweis)`,
--    nur fuer die Service-Rolle. Setzt fuer die Dauer der Anweisung die
--    Markierung `app.marketing_nachweis_anhaengen` und haengt den Nachweis an.
--
-- 2. Der Ausloeser `trg_kontakt_marketing_nachweis` schuetzt
--    `meta.marketingEinwilligungen` fuer ALLE Schreibwege, auch fuer den
--    Dienstschluessel:
--      ohne Markierung              der alte Wert bleibt stehen
--      mit Markierung (nur Dienst-  die Liste darf nur wachsen: der alte
--      schluessel)                  Inhalt muss Anfang des neuen sein,
--                                   sonst bleibt der alte Wert
--    `meta.marketingEinwilligung` (der einzelne Nachweis) bleibt wie in
--    20260927070000: nur der Dienstschluessel schreibt ihn.
--    Ein `meta`, das kein Objekt ist (NULL, JSON null, [], Zahl, Text),
--    behaelt wie bisher das alte `meta`, wenn dort ein geschuetzter Nachweis
--    stand.
--
-- Zurueckgesetzt statt abgebrochen, damit Speichern aus dem CRM,
-- `merge_kontakt_meta`, `kontakte_zusammenfuehren` und invite-user nie
-- daran scheitern. Beim Zusammenfuehren behaelt der aeltere Kontakt seine
-- Liste; die Liste des juengeren bleibt an ihm im Papierkorb.
--
-- Entfernen laesst sich die Liste damit nur zusammen mit dem Kontakt
-- (DELETE). Braucht es das einmal ohne Loeschen, im SQL-Editor den
-- Ausloeser fuer die Dauer der Aenderung abschalten.
--
-- Wiederholbar: CREATE OR REPLACE und DROP TRIGGER IF EXISTS. Setzt
-- 20260927070000 nicht voraus, legt den Ausloeser selbst an.
-- Ohne diese Migration haengt submit-lead auf dem bisherigen Weg an, ohne
-- Schutz der Liste.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.kontakt_marketing_nachweis_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dienst boolean := auth.uid() IS NULL;
  anhaengen boolean := coalesce(current_setting('app.marketing_nachweis_anhaengen', true), '') = 'an';
  alt_ist_objekt boolean := false;
  neu_meta jsonb;
  alt_liste jsonb;
  neu_liste jsonb;
  waechst boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    alt_ist_objekt := jsonb_typeof(OLD.meta) = 'object';
  END IF;

  -- Ein meta, das kein Objekt ist (NULL, JSON null, [], Zahl, Text), wuerde
  -- die Nachweise still mitnehmen. Hatte die Zeile einen geschuetzten
  -- Nachweis, bleibt das alte meta stehen (NB-06).
  IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN
    IF alt_ist_objekt
       AND ((NOT dienst AND OLD.meta ? 'marketingEinwilligung') OR OLD.meta ? 'marketingEinwilligungen') THEN
      NEW.meta := OLD.meta;
    END IF;
    RETURN NEW;
  END IF;

  neu_meta := NEW.meta;

  -- Der einzelne Nachweis: nur der Dienstschluessel schreibt ihn (wie 20260927070000).
  IF NOT dienst THEN
    IF TG_OP = 'INSERT' THEN
      neu_meta := neu_meta - 'marketingEinwilligung';
    ELSIF (neu_meta -> 'marketingEinwilligung') IS DISTINCT FROM
          (CASE WHEN alt_ist_objekt THEN OLD.meta -> 'marketingEinwilligung' END) THEN
      IF alt_ist_objekt AND OLD.meta ? 'marketingEinwilligung' THEN
        neu_meta := jsonb_set(neu_meta, '{marketingEinwilligung}', OLD.meta -> 'marketingEinwilligung', true);
      ELSE
        neu_meta := neu_meta - 'marketingEinwilligung';
      END IF;
    END IF;
  END IF;

  -- Die Liste: fuer alle Schreibwege, auch den Dienstschluessel. Aendern
  -- darf sie nur die Anhaenge-Funktion, und nur, indem sie waechst.
  alt_liste := CASE WHEN alt_ist_objekt THEN OLD.meta -> 'marketingEinwilligungen' END;
  neu_liste := neu_meta -> 'marketingEinwilligungen';
  IF neu_liste IS DISTINCT FROM alt_liste THEN
    waechst := dienst AND anhaengen
      AND jsonb_typeof(neu_liste) = 'array'
      AND (
        alt_liste IS NULL
        OR (
          jsonb_typeof(alt_liste) = 'array'
          AND jsonb_array_length(neu_liste) > jsonb_array_length(alt_liste)
          AND (SELECT coalesce(jsonb_agg(t.eintrag ORDER BY t.nr), '[]'::jsonb)
                 FROM jsonb_array_elements(neu_liste) WITH ORDINALITY AS t(eintrag, nr)
                WHERE t.nr <= jsonb_array_length(alt_liste)) = alt_liste
        )
      );
    IF NOT coalesce(waechst, false) THEN
      IF alt_liste IS NULL THEN
        neu_meta := neu_meta - 'marketingEinwilligungen';
      ELSE
        neu_meta := jsonb_set(neu_meta, '{marketingEinwilligungen}', alt_liste, true);
      END IF;
    END IF;
  END IF;

  NEW.meta := neu_meta;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kontakt_marketing_nachweis_schuetzen() IS
  'kontakte.meta.marketingEinwilligung schreibt nur der Dienstschluessel. '
  'kontakte.meta.marketingEinwilligungen aendert nur kontakt_marketing_nachweis_anhaengen, und nur wachsend. '
  'Andere Aenderungen werden still zurueckgesetzt. Migrationen 20260927070000 und 20260927090000.';

REVOKE ALL ON FUNCTION public.kontakt_marketing_nachweis_schuetzen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kontakt_marketing_nachweis ON public.kontakte;
CREATE TRIGGER trg_kontakt_marketing_nachweis
  BEFORE INSERT OR UPDATE OF meta ON public.kontakte
  FOR EACH ROW
  EXECUTE FUNCTION public.kontakt_marketing_nachweis_schuetzen();

CREATE OR REPLACE FUNCTION public.kontakt_marketing_nachweis_anhaengen(p_kontakt_id uuid, p_nachweis jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  geaendert integer;
BEGIN
  IF p_nachweis IS NULL OR jsonb_typeof(p_nachweis) <> 'object' THEN
    RAISE EXCEPTION 'kontakt_marketing_nachweis_anhaengen: Nachweis muss ein Objekt sein';
  END IF;
  -- Nur fuer diese Anweisung: Der Ausloeser laesst die Liste wachsen.
  PERFORM set_config('app.marketing_nachweis_anhaengen', 'an', true);
  UPDATE public.kontakte
     SET meta = jsonb_set(
           CASE WHEN jsonb_typeof(meta) = 'object' THEN meta ELSE '{}'::jsonb END,
           '{marketingEinwilligungen}',
           CASE WHEN jsonb_typeof(meta -> 'marketingEinwilligungen') = 'array'
                THEN meta -> 'marketingEinwilligungen' ELSE '[]'::jsonb END
             || jsonb_build_array(p_nachweis),
           true)
   WHERE id = p_kontakt_id;
  GET DIAGNOSTICS geaendert = ROW_COUNT;
  PERFORM set_config('app.marketing_nachweis_anhaengen', '', true);
  RETURN geaendert > 0;
END;
$$;

COMMENT ON FUNCTION public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb) IS
  'Haengt einen Nachweis der Pixel-Einwilligung atomar an kontakte.meta.marketingEinwilligungen an. '
  'Nur fuer die Service-Rolle (submit-lead). Migration 20260927090000.';

REVOKE ALL ON FUNCTION public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb) TO service_role;

COMMIT;
