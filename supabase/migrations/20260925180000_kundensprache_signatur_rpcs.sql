-- ===========================================================================
-- Kundensprache: Unterschriftsseite und Selbstauskunft-Link kennen die Sprache
-- ===========================================================================
--
-- WORUM ES GEHT (Plan Kundensprache vom 25.09.2026, Etappe 4, S9)
--
-- Die Sprache eines Kunden steht in `kontakte.meta.kundenSprache` ("de" oder
-- "en"). Die beiden oeffentlichen Seiten `/signatur?token=` und `/sa/:token`
-- laufen ohne Anmeldung und kommen an den Kontakt nicht heran. Sie brauchen
-- die Sprache deshalb von den beiden Token-Funktionen, ueber die sie ohnehin
-- laden:
--
--   public.get_signature_request(text)  liefert sie in `meta.sprache`
--   public.get_sa_fill_token(text)      liefert sie in der neuen Spalte `sprache`
--
-- WARUM SO UND NICHT MIT NEUEM RUECKGABETYP
--
-- Beide Funktionen geben eine ganze Tabellenzeile zurueck. Ein eigener
-- Rueckgabetyp haette den Vertrag zum Frontend geaendert und eine
-- Neuerzeugung von `src/integrations/supabase/types.ts` verlangt; dieselbe
-- Abwaegung steht schon in 20260916140000_signaturlink_ablauf.sql.
--
--   - `get_signature_request` leert `meta` seit dem 16.09.2026 (Audit F10),
--     weil dort interne Vermerke der Erinnerungslaeufe stehen. Das bleibt so:
--     Das Feld traegt jetzt ausschliesslich `{"sprache": "de"|"en"}` und
--     sonst nichts. Kein interner Vermerk kommt zurueck.
--   - `sa_fill_tokens` hat kein solches Feld. Es bekommt eine Spalte
--     `sprache`, die in der Tabelle leer bleibt; die Funktion fuellt sie beim
--     Lesen aus dem Kontakt. Setzt spaeter jemand beim Anlegen des Links eine
--     Sprache, hat diese Vorrang.
--
-- Die Sprache selbst ist keine schuetzenswerte Angabe, sie ist genau die
-- Information, die die Seite zum Anzeigen braucht. Die Hilfsfunktion
-- `kontakt_sprache` ist trotzdem nicht fuer `anon` freigegeben, damit niemand
-- sie mit fremden Kennungen abfragt; sie laeuft nur innerhalb der beiden
-- SECURITY-DEFINER-Funktionen.
--
-- OHNE DIESE MIGRATION
--
-- Fehlt das Feld, zeigen beide Seiten Deutsch, wie bisher. Die Reservierung
-- bringt ihre Sprache ausserdem im eigenen Datensatz mit
-- (`rvData.vertragssprache`) und wird auch ohne Migration zweisprachig.
--
-- Wiederholbar: CREATE OR REPLACE und ADD COLUMN IF NOT EXISTS.
--
-- SICHERUNG vorher (Lesen, aendert nichts):
--
--   select pg_get_functiondef('public.get_signature_request(text)'::regprocedure);
--   select pg_get_functiondef('public.get_sa_fill_token(text)'::regprocedure);
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Hilfsfunktion: die Sprache zu einer Kontaktkennung
-- ---------------------------------------------------------------------------
-- Nimmt Text, weil `sa_fill_tokens.kontakt_id` Text ist und
-- `signature_requests.kontakt_id` uuid. plpgsql statt sql, damit die
-- Umwandlung in uuid erst nach der Formpruefung geschieht; eine SQL-Funktion
-- koennte beim Einbetten den Cast vorziehen und an einer fremden Kennung
-- scheitern. Unbekannt, leer oder fremd: 'de'.
CREATE OR REPLACE FUNCTION public.kontakt_sprache(_kontakt_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _wert text;
BEGIN
  IF _kontakt_id IS NULL
     OR _kontakt_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN 'de';
  END IF;

  SELECT k.meta->>'kundenSprache'
    INTO _wert
    FROM public.kontakte k
   WHERE k.id = _kontakt_id::uuid;

  -- Dieselbe Nachsicht wie `normalisiereSprache` im Code: "en", "EN",
  -- "en-GB", "English". Alles andere ist Deutsch.
  IF lower(btrim(coalesce(_wert, ''))) ~ '^(en([-_].*)?|english|englisch)$' THEN
    RETURN 'en';
  END IF;
  RETURN 'de';
END;
$$;

REVOKE ALL ON FUNCTION public.kontakt_sprache(text) FROM public;
REVOKE ALL ON FUNCTION public.kontakt_sprache(text) FROM anon, authenticated;

COMMENT ON FUNCTION public.kontakt_sprache(text) IS
  'Kundensprache (de|en) aus kontakte.meta.kundenSprache, Rueckfall de. Nur fuer SECURITY-DEFINER-Funktionen, nicht oeffentlich. Plan Kundensprache 25.09.2026.';

-- ---------------------------------------------------------------------------
-- 2. get_signature_request: Sprache in meta
-- ---------------------------------------------------------------------------
-- Unveraendert gegenueber 20260916140000 bis auf die eine Zeile zu `meta`.
CREATE OR REPLACE FUNCTION public.get_signature_request(_token text)
RETURNS public.signature_requests
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _zeile public.signature_requests%ROWTYPE;
BEGIN
  SELECT *
    INTO _zeile
    FROM public.signature_requests
   WHERE token = _token
     -- Seit dem 16.09.2026 (Audit F10): abgelaufene Links geben nichts
     -- mehr heraus. COALESCE, damit aus einem unbekannt kein Durchlass wird.
     AND COALESCE(expires_at > now(), false)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Nachweise fuer den Streitfall bleiben drin (Audit F10).
  _zeile.ip_address := NULL;
  _zeile.user_agent := NULL;
  _zeile.signature_data := NULL;
  -- Seit dem 25.09.2026: `meta` traegt nur die Kundensprache, keine internen
  -- Vermerke. Die Seite zeigt sich damit in der Sprache des Kunden.
  _zeile.meta := jsonb_build_object('sprache', public.kontakt_sprache(_zeile.kontakt_id::text));

  RETURN _zeile;
END;
$$;

COMMENT ON FUNCTION public.get_signature_request(text) IS
  'Oeffentlicher Lesezugriff auf eine Signaturanfrage per Token. Gibt zu abgelaufenen Links nichts heraus und liefert ip_address, user_agent und signature_data immer leer. meta enthaelt nur {"sprache": "de"|"en"} (Kundensprache, seit 25.09.2026). Audit-Befund F10 vom 15.09.2026.';

-- ---------------------------------------------------------------------------
-- 3. get_sa_fill_token: Spalte sprache
-- ---------------------------------------------------------------------------
ALTER TABLE public.sa_fill_tokens
  ADD COLUMN IF NOT EXISTS sprache text;

COMMENT ON COLUMN public.sa_fill_tokens.sprache IS
  'Sprache des Selbstauskunft-Links (de|en). In der Regel leer; get_sa_fill_token fuellt sie beim Lesen aus kontakte.meta.kundenSprache. Ein gesetzter Wert hat Vorrang. Plan Kundensprache 25.09.2026.';

-- Bisher eine SQL-Funktion mit SELECT *. Jetzt plpgsql, damit die Sprache
-- gesetzt werden kann; Name, Signatur, Rueckgabetyp, SECURITY DEFINER und
-- search_path bleiben, die GRANTs ebenso. Das Verhalten sonst ist gleich:
-- Auch abgelaufene oder benutzte Links kommen zurueck, die Seite prueft
-- Ablauf und Status selbst und zeigt dazu ihre eigenen Hinweise.
CREATE OR REPLACE FUNCTION public.get_sa_fill_token(_token text)
RETURNS public.sa_fill_tokens
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _zeile public.sa_fill_tokens%ROWTYPE;
BEGIN
  SELECT *
    INTO _zeile
    FROM public.sa_fill_tokens
   WHERE token = _token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _zeile.sprache := CASE
    WHEN lower(btrim(coalesce(_zeile.sprache, ''))) IN ('de', 'en') THEN lower(btrim(_zeile.sprache))
    ELSE public.kontakt_sprache(_zeile.kontakt_id)
  END;

  RETURN _zeile;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sa_fill_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sa_fill_token(text) TO anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- PRUEFEN (Lesen, aendert nichts)
-- ---------------------------------------------------------------------------
--   select proname from pg_proc
--    where proname in ('kontakt_sprache', 'get_signature_request', 'get_sa_fill_token');
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'sa_fill_tokens' and column_name = 'sprache';
--   select public.kontakt_sprache(null);   -- ergibt 'de'
