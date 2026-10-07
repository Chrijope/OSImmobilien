-- ===========================================================================
-- Buchung: der neue Kontakt bekommt die Sprache der Buchungsseite
-- ===========================================================================
--
-- Befund vom 04.10.2026: Wer die Terminseite auf Englisch nutzt
-- (`?lang=en`), bekam Bestaetigung und Erinnerungen auf Deutsch. Die Mails
-- richten sich nach der Kundensprache am Kontakt (`_shared/buchung-kontext.ts`),
-- und `buchung_anlegen` legte den Kontakt ohne Sprache an, also Deutsch.
--
-- Neu ist eine zweite Fassung von `buchung_anlegen` mit dem Pflichtparameter
-- `_sprache`. Sie ruft die bestehende Fassung unveraendert auf und traegt
-- danach die Sprache ein, aber nur bei einem Kontakt, den genau diese Buchung
-- angelegt hat (Quelle Buchungslink, erstellt in derselben Transaktion) und
-- der noch keine Sprache hat. Ein bestehender Kontakt behaelt seine Sprache;
-- sie fuehrt das Kundenprofil. Eingetragen wird wie beim Lead aus einem
-- Formular (`submit-lead`): Sprache, Zeitpunkt, Quelle "buchung:Terminseite".
--
-- Alte Aufrufer ohne `_sprache` treffen weiter die bestehende Fassung, deren
-- Rumpf hier nicht angefasst wird. Die Seite schickt `_sprache` nur mit, wenn
-- die Sprache ausdruecklich in der Adresse steht, und faellt ohne diese
-- Migration auf den Aufruf ohne Sprache zurueck.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.buchung_anlegen(
  _token text,
  _terminart_id uuid,
  _start timestamptz,
  _name text,
  _email text,
  _sprache text,
  _telefon text DEFAULT NULL,
  _nachricht text DEFAULT NULL,
  _begleitung jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ergebnis jsonb;
  _kontakt_id uuid;
BEGIN
  _ergebnis := public.buchung_anlegen(
    _token => _token,
    _terminart_id => _terminart_id,
    _start => _start,
    _name => _name,
    _email => _email,
    _telefon => _telefon,
    _nachricht => _nachricht,
    _begleitung => _begleitung
  );

  IF lower(btrim(coalesce(_sprache, ''))) IN ('de', 'en') AND (_ergebnis ->> 'id') IS NOT NULL THEN
    SELECT b.kontakt_id INTO _kontakt_id
      FROM public.buchungen b
     WHERE b.id = (_ergebnis ->> 'id')::uuid;

    UPDATE public.kontakte k
       SET meta = coalesce(k.meta, '{}'::jsonb) || jsonb_build_object(
             'kundenSprache', lower(btrim(_sprache)),
             'kundenSpracheGesetztAm', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'kundenSpracheGesetztVon', 'buchung:Terminseite'
           )
     WHERE k.id = _kontakt_id
       AND k.quelle = 'Buchungslink'
       AND k.erstellt_am = now()
       AND NOT (coalesce(k.meta, '{}'::jsonb) ? 'kundenSprache');
  END IF;

  RETURN _ergebnis;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 77.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
