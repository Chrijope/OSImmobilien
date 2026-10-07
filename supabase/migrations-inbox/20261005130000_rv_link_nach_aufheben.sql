-- ===========================================================================
-- Reservierungslink nach dem Aufheben ungültig
-- ===========================================================================
--
-- Seit dem 05.10.2026 setzt „Reservierung aufheben“ im Kundenprofil am
-- Investment `meta.rvZuletztAufgehobenAm`. Offene Unterschriftslinks der
-- aufgehobenen Vereinbarung kann der Browser aber nicht löschen (seit
-- 20260929200000 nur der Server). Damit sie nicht mehr unterschrieben werden
-- können:
--
--   - `rv_anfrage_aufgehoben`: liegt eine rv-Anfrage vor dem letzten Aufheben?
--     Nicht öffentlich, nur für die beiden Funktionen darunter.
--   - `get_signature_request` markiert eine solche Anfrage als überholt
--     (offene: Status `ueberholt`; beide: `meta.rvUeberholtAm`) und liefert
--     sie mit Status `ueberholt` und `meta.rvAufgehoben = true`. Die
--     Signaturseite zeigt dann „Diese Reservierung wurde aufgehoben, der Link
--     ist nicht mehr gültig.“ Deshalb ist sie jetzt VOLATILE statt STABLE.
--   - `sign_signature_request` nimmt eine solche Anfrage nicht mehr an.
--
-- Alles andere bleibt wortgleich zu 20260925180000 und 20260517145512.
-- Ändert keine Daten beim Ausführen, wiederholbar.

BEGIN;

CREATE OR REPLACE FUNCTION public.rv_anfrage_aufgehoben(_person_type text, _investment_id text, _created_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wert text;
  _am timestamptz;
BEGIN
  IF _person_type IS NULL OR _person_type NOT LIKE 'rv\_%' OR _investment_id IS NULL OR _created_at IS NULL THEN
    RETURN false;
  END IF;

  -- investments.id ist uuid, signature_requests.investment_id ist text.
  SELECT i.meta->>'rvZuletztAufgehobenAm'
    INTO _wert
    FROM public.investments i
   WHERE i.id::text = _investment_id;

  IF _wert IS NULL OR btrim(_wert) = '' THEN
    RETURN false;
  END IF;

  BEGIN
    _am := _wert::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN _created_at < _am;
END;
$$;

REVOKE ALL ON FUNCTION public.rv_anfrage_aufgehoben(text, text, timestamptz) FROM public;
REVOKE ALL ON FUNCTION public.rv_anfrage_aufgehoben(text, text, timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.rv_anfrage_aufgehoben(text, text, timestamptz) IS
  'Liegt diese rv-Anfrage vor investments.meta.rvZuletztAufgehobenAm? Nur fuer get_signature_request und sign_signature_request. 05.10.2026.';

CREATE OR REPLACE FUNCTION public.get_signature_request(_token text)
RETURNS public.signature_requests
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _zeile public.signature_requests%ROWTYPE;
  _aufgehoben boolean := false;
BEGIN
  SELECT *
    INTO _zeile
    FROM public.signature_requests
   WHERE token = _token
     AND COALESCE(expires_at > now(), false)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF public.rv_anfrage_aufgehoben(_zeile.person_type, _zeile.investment_id, _zeile.created_at) THEN
    _aufgehoben := true;
    UPDATE public.signature_requests
       SET status = CASE WHEN status = 'pending' THEN 'ueberholt' ELSE status END,
           meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('rvUeberholtAm', now())
     WHERE id = _zeile.id
       AND (status = 'pending' OR NOT (COALESCE(meta, '{}'::jsonb) ? 'rvUeberholtAm'));
    _zeile.status := 'ueberholt';
  END IF;

  _zeile.ip_address := NULL;
  _zeile.user_agent := NULL;
  _zeile.signature_data := NULL;
  _zeile.meta := jsonb_build_object('sprache', public.kontakt_sprache(_zeile.kontakt_id::text))
    || CASE WHEN _aufgehoben THEN jsonb_build_object('rvAufgehoben', true) ELSE '{}'::jsonb END;

  RETURN _zeile;
END;
$$;

COMMENT ON FUNCTION public.get_signature_request(text) IS
  'Oeffentlicher Lesezugriff auf eine Signaturanfrage per Token. Gibt zu abgelaufenen Links nichts heraus und liefert ip_address, user_agent und signature_data immer leer. meta enthaelt nur {"sprache": "de"|"en"} und bei aufgehobener Reservierung {"rvAufgehoben": true}; eine solche rv-Anfrage wird als ueberholt markiert (05.10.2026). Audit-Befund F10 vom 15.09.2026.';

CREATE OR REPLACE FUNCTION public.sign_signature_request(
  _token text,
  _signature_data text,
  _consent_text text,
  _user_agent text DEFAULT NULL
)
RETURNS public.signature_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.signature_requests;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.signature_requests s
     WHERE s.token = _token
       AND public.rv_anfrage_aufgehoben(s.person_type, s.investment_id, s.created_at)
  ) THEN
    RAISE EXCEPTION 'Diese Reservierung wurde aufgehoben, der Link ist nicht mehr gültig.';
  END IF;

  UPDATE public.signature_requests
  SET status = 'signed',
      signed_at = now(),
      signature_data = _signature_data,
      consent_text = _consent_text,
      user_agent = COALESCE(_user_agent, user_agent)
  WHERE token = _token
    AND expires_at > now()
    AND status = 'pending'
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired or already-signed signature request';
  END IF;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_signature_request(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_signature_request(text, text, text, text) TO anon, authenticated;

COMMIT;

-- Zum Schluss: der Stand danach. Erwartet: true, true.
SELECT
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'rv_anfrage_aufgehoben') AS pruefung_da,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'sign_signature_request'
             AND pg_get_functiondef(p.oid) LIKE '%rv_anfrage_aufgehoben%') AS unterschreiben_geprueft;

-- Nachsehen (aendert nichts): Pruefzeile 87.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
