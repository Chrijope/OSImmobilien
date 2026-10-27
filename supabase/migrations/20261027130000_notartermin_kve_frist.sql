-- ===========================================================================
-- Notartermin erst 14 Tage nach dem Kaufvertragsentwurf (Christian, 27.10.2026)
-- ===========================================================================
--
-- WARUM
--
--   Christian: „Bevor ein Notartermin gesetzt werden kann, muss 14 Tage zuvor
--   der Kaufvertragsentwurf an den Kunden gesendet worden sein. Erst dann kann
--   man den Notartermin vereinbaren.“
--
--   Die Oberfläche prüft das (src/lib/notarFristen.ts). Gesetzt wird der
--   Termin aber auf zwei Wegen in investments.meta.notarTermin: aus dem CRM
--   über merge_investment_meta und aus dem Kundenportal über
--   confirm_notar_termin. Statt beide Funktionsrümpfe neu zu schreiben, prüft
--   ein Wächter vor UPDATE die fertige Zeile, egal woher sie kommt.
--
-- REGEL (wie notarFristen.ts)
--
--   Versand = Freigabe eines Dokuments der Kategorie „Kaufvertragsentwurf“ im
--   Kundenordner (meta.kundenordner[].freigegeben), Zeitpunkt freigegebenAm,
--   bei älteren Freigaben ersatzweise uploadedAt. Bei mehreren Fassungen die
--   neueste. Frühester Notartermin = Versandtag in Berlin + 14 Kalendertage.
--
--   Geprüft wird nur, wenn sich notarTermin auf ein Datum ab heute ändert.
--   Nicht geprüft: Leeren, Uhrzeit oder Notar ändern, Tage vor heute
--   (Nachtrag für einen schon gelaufenen Verkauf), unlesbares Datum, der
--   Server ohne Nutzer (auth.uid() IS NULL), admin und inhaber (dürfen die
--   Frist übergehen, etwa bei Altfällen; Christian, 27.10.2026).
--
--   Ändert keine Daten, wiederholbar. Der Name trg_zzz_ sorgt dafür, dass der
--   Wächter nach trg_zz_kundendaten_nur_lesend läuft (Reihenfolge nach Name).

CREATE OR REPLACE FUNCTION public.notartermin_kve_frist_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _neu text := CASE WHEN jsonb_typeof(NEW.meta) = 'object' THEN NEW.meta ->> 'notarTermin' END;
  _alt text := CASE WHEN jsonb_typeof(OLD.meta) = 'object' THEN OLD.meta ->> 'notarTermin' END;
  _notar date;
  _versand timestamptz;
  _frueh date;
BEGIN
  IF auth.uid() IS NULL OR coalesce(_neu, '') = '' OR _neu IS NOT DISTINCT FROM _alt
     OR public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF _neu ~ '^\d{4}-\d{2}-\d{2}' THEN
    _notar := left(_neu, 10)::date;
  ELSIF _neu ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' THEN
    _notar := to_date(_neu, 'DD.MM.YYYY');
  ELSE
    RETURN NEW;
  END IF;

  IF _notar < (now() AT TIME ZONE 'Europe/Berlin')::date THEN
    RETURN NEW;
  END IF;

  SELECT max(coalesce(nullif(d ->> 'freigegebenAm', ''), d ->> 'uploadedAt')::timestamptz)
    INTO _versand
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(NEW.meta -> 'kundenordner') = 'array'
                THEN NEW.meta -> 'kundenordner' ELSE '[]'::jsonb END) AS d
   WHERE d ->> 'kategorie' = 'Kaufvertragsentwurf'
     AND d -> 'freigegeben' = 'true'::jsonb
     AND coalesce(nullif(d ->> 'freigegebenAm', ''), d ->> 'uploadedAt', '') ~ '^\d{4}-\d{2}-\d{2}T';

  IF _versand IS NULL THEN
    RAISE EXCEPTION 'Der Kaufvertragsentwurf ist noch nicht beim Kunden.' USING ERRCODE = '23514';
  END IF;

  _frueh := (_versand AT TIME ZONE 'Europe/Berlin')::date + 14;
  IF _notar < _frueh THEN
    RAISE EXCEPTION 'Frühestmöglicher Notartermin: % (14 Tage nach Versand des Kaufvertragsentwurfs am %).',
      to_char(_frueh, 'DD.MM.YYYY'),
      to_char((_versand AT TIME ZONE 'Europe/Berlin')::date, 'DD.MM.YYYY')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notartermin_kve_frist_pruefen() IS
  'Notartermin frühestens 14 Tage nach Freigabe des Kaufvertragsentwurfs im Kundenordner (Christian, 27.10.2026).';

DROP TRIGGER IF EXISTS trg_zzz_notartermin_kve_frist ON public.investments;
CREATE TRIGGER trg_zzz_notartermin_kve_frist
  BEFORE UPDATE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.notartermin_kve_frist_pruefen();
