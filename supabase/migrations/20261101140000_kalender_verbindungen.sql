-- ---------------------------------------------------------------------------
-- Kalender: mehrere Verbindungen, Zugang im Tresor, eigener Abo-Link (01.11.2026)
-- ---------------------------------------------------------------------------
--
-- Bisher: genau ein Kalender (Google oder iCloud), Zugangsdaten im Klartext
-- in user_settings (Google-Tokens im jsonb, Apple-App-Passwort in der Spalte
-- apple_calendar), beides im Browser lesbar.
-- Jetzt:
--   * public.kalender_verbindungen: beliebig viele je Nutzer, Arten google,
--     microsoft (Outlook/Microsoft 365), caldav (iCloud und jeder andere
--     CalDAV-Server) und abo (Kalenderlink, nur lesen).
--   * Zugang (Tokens, Passwort, privater Abo-Link) im Tresor.
--   * Höchstens eine Verbindung je Nutzer ist Ziel für neue CRM-Termine.
--   * public.kalender_feed: Kennung für den eigenen Abo-Link mit den
--     CRM-Terminen, nur als Hash gespeichert.

CREATE TABLE IF NOT EXISTS public.kalender_verbindungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benutzer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  art text NOT NULL CHECK (art IN ('google', 'microsoft', 'caldav', 'abo')),
  -- Was angezeigt wird: Adresse, Apple-ID oder ein Name.
  konto text NOT NULL,
  server_url text,
  benutzername text,
  -- [{"id": "...", "name": "...", "url": "...", "primary": true}]
  kalender jsonb NOT NULL DEFAULT '[]'::jsonb,
  schreibziel boolean NOT NULL DEFAULT false,
  geheimnis_id uuid,
  letzter_fehler text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (benutzer_id, art, konto)
);

CREATE UNIQUE INDEX IF NOT EXISTS kalender_verbindungen_ein_schreibziel
  ON public.kalender_verbindungen (benutzer_id) WHERE schreibziel;

ALTER TABLE public.kalender_verbindungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene Kalender lesen" ON public.kalender_verbindungen;
CREATE POLICY "Eigene Kalender lesen" ON public.kalender_verbindungen
  FOR SELECT TO authenticated USING (benutzer_id = auth.uid());
DROP POLICY IF EXISTS "Eigene Kalender entfernen" ON public.kalender_verbindungen;
CREATE POLICY "Eigene Kalender entfernen" ON public.kalender_verbindungen
  FOR DELETE TO authenticated USING (benutzer_id = auth.uid());

REVOKE ALL ON public.kalender_verbindungen FROM anon, authenticated;
GRANT DELETE ON public.kalender_verbindungen TO authenticated;
GRANT SELECT (id, benutzer_id, art, konto, server_url, benutzername, kalender,
              schreibziel, letzter_fehler, erstellt_am)
  ON public.kalender_verbindungen TO authenticated;

CREATE OR REPLACE FUNCTION public.kalender_geheimnis_setzen(_verbindung uuid, _wert text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT geheimnis_id INTO _id FROM public.kalender_verbindungen WHERE id = _verbindung;
  IF _id IS NULL THEN
    _id := vault.create_secret(_wert, 'kalender_' || _verbindung::text, 'Zugang Kalender');
    UPDATE public.kalender_verbindungen SET geheimnis_id = _id WHERE id = _verbindung;
  ELSE
    PERFORM vault.update_secret(_id, _wert);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.kalender_geheimnis_lesen(_verbindung uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT s.decrypted_secret
    FROM public.kalender_verbindungen k
    JOIN vault.decrypted_secrets s ON s.id = k.geheimnis_id
   WHERE k.id = _verbindung;
$$;

REVOKE ALL ON FUNCTION public.kalender_geheimnis_setzen(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kalender_geheimnis_lesen(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kalender_geheimnis_setzen(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kalender_geheimnis_lesen(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.kalender_geheimnis_loeschen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF OLD.geheimnis_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.geheimnis_id;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.kalender_geheimnis_loeschen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kalender_geheimnis_loeschen ON public.kalender_verbindungen;
CREATE TRIGGER trg_kalender_geheimnis_loeschen
  AFTER DELETE ON public.kalender_verbindungen
  FOR EACH ROW EXECUTE FUNCTION public.kalender_geheimnis_loeschen();

-- Eigener Abo-Link: Nur der Hash der Kennung liegt hier. Wer den Link hat,
-- sieht die eigenen CRM-Termine; ein neuer Link macht den alten ungültig.
CREATE TABLE IF NOT EXISTS public.kalender_feed (
  benutzer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  kennung_hash text NOT NULL UNIQUE,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kalender_feed ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kalender_feed FROM anon, authenticated;
DROP POLICY IF EXISTS "Eigenen Abo-Link sehen" ON public.kalender_feed;
CREATE POLICY "Eigenen Abo-Link sehen" ON public.kalender_feed
  FOR SELECT TO authenticated USING (benutzer_id = auth.uid());
GRANT SELECT (benutzer_id, erstellt_am) ON public.kalender_feed TO authenticated;
DROP POLICY IF EXISTS "Eigenen Abo-Link entfernen" ON public.kalender_feed;
CREATE POLICY "Eigenen Abo-Link entfernen" ON public.kalender_feed
  FOR DELETE TO authenticated USING (benutzer_id = auth.uid());
GRANT DELETE ON public.kalender_feed TO authenticated;

-- Termine im CRM merken sich, in welcher Art Kalender sie stehen; neu dazu
-- kommen Microsoft und CalDAV („apple“ bleibt für ältere iCloud-Einträge).
ALTER TABLE public.aktivitaeten DROP CONSTRAINT IF EXISTS aktivitaeten_kalender_typ_chk;
ALTER TABLE public.aktivitaeten ADD CONSTRAINT aktivitaeten_kalender_typ_chk
  CHECK (kalender_typ IS NULL OR kalender_typ IN ('google', 'apple', 'microsoft', 'caldav'));

-- In welcher Verbindung ein CRM-Termin steht, damit Ändern und Löschen auch
-- nach einem Wechsel des Ziels den richtigen Kalender treffen.
ALTER TABLE public.aktivitaeten
  ADD COLUMN IF NOT EXISTS kalender_verbindung_id uuid REFERENCES public.kalender_verbindungen(id) ON DELETE SET NULL;

-- Vorhandene Verbindungen übernehmen, Klartext entfernen. Fehler brechen ab.
DO $umzug$
DECLARE
  _zeile record;
  _id uuid;
  _apple jsonb;
  _google jsonb;
BEGIN
  -- iCloud aus der Spalte apple_calendar
  FOR _zeile IN
    SELECT user_id, apple_calendar FROM public.user_settings
     WHERE apple_calendar IS NOT NULL AND nullif(apple_calendar ->> 'app_password', '') IS NOT NULL
  LOOP
    _apple := _zeile.apple_calendar;
    INSERT INTO public.kalender_verbindungen (benutzer_id, art, konto, server_url, benutzername, kalender)
    VALUES (
      _zeile.user_id, 'caldav', coalesce(nullif(_apple ->> 'apple_id', ''), 'iCloud'),
      'https://caldav.icloud.com', _apple ->> 'apple_id',
      -- Die alte Anbindung speicherte Pfade ohne Server; sie gehören zu iCloud.
      coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'id', CASE WHEN c ->> 'url' LIKE '/%' THEN 'https://caldav.icloud.com' || (c ->> 'url') ELSE c ->> 'url' END,
                  'name', c ->> 'name',
                  'url', CASE WHEN c ->> 'url' LIKE '/%' THEN 'https://caldav.icloud.com' || (c ->> 'url') ELSE c ->> 'url' END))
                  FROM jsonb_array_elements(coalesce(_apple -> 'calendars', '[]'::jsonb)) c), '[]'::jsonb)
    )
    ON CONFLICT (benutzer_id, art, konto) DO NOTHING;
    SELECT id INTO _id FROM public.kalender_verbindungen
     WHERE benutzer_id = _zeile.user_id AND art = 'caldav' AND konto = coalesce(nullif(_apple ->> 'apple_id', ''), 'iCloud');
    IF (SELECT geheimnis_id FROM public.kalender_verbindungen WHERE id = _id) IS NULL THEN
      PERFORM public.kalender_geheimnis_setzen(_id, jsonb_build_object('passwort', _apple ->> 'app_password')::text);
    END IF;
    UPDATE public.user_settings SET apple_calendar = apple_calendar - 'app_password' WHERE user_id = _zeile.user_id;
  END LOOP;

  -- Google aus einstellungen.google_calendar
  FOR _zeile IN
    SELECT user_id, einstellungen FROM public.user_settings
     WHERE nullif(einstellungen -> 'google_calendar' ->> 'refresh_token', '') IS NOT NULL
  LOOP
    _google := _zeile.einstellungen -> 'google_calendar';
    INSERT INTO public.kalender_verbindungen (benutzer_id, art, konto, kalender)
    VALUES (_zeile.user_id, 'google', coalesce(nullif(_google ->> 'email', ''), 'Google'), coalesce(_google -> 'calendars', '[]'::jsonb))
    ON CONFLICT (benutzer_id, art, konto) DO NOTHING;
    SELECT id INTO _id FROM public.kalender_verbindungen
     WHERE benutzer_id = _zeile.user_id AND art = 'google' AND konto = coalesce(nullif(_google ->> 'email', ''), 'Google');
    IF (SELECT geheimnis_id FROM public.kalender_verbindungen WHERE id = _id) IS NULL THEN
      PERFORM public.kalender_geheimnis_setzen(_id, jsonb_build_object(
        'access_token', _google ->> 'access_token',
        'refresh_token', _google ->> 'refresh_token',
        'expires_at', _google -> 'expires_at')::text);
    END IF;
    UPDATE public.user_settings
       SET einstellungen = jsonb_set(einstellungen, '{google_calendar}',
             (einstellungen -> 'google_calendar') - 'access_token' - 'refresh_token' - 'expires_at')
     WHERE user_id = _zeile.user_id;
  END LOOP;

  -- Wer genau eine Verbindung hat, schreibt CRM-Termine dorthin wie bisher.
  UPDATE public.kalender_verbindungen k SET schreibziel = true
   WHERE k.art IN ('google', 'caldav')
     AND NOT EXISTS (SELECT 1 FROM public.kalender_verbindungen x WHERE x.benutzer_id = k.benutzer_id AND x.schreibziel)
     AND k.id = (SELECT id FROM public.kalender_verbindungen y WHERE y.benutzer_id = k.benutzer_id AND y.art IN ('google', 'caldav')
                 ORDER BY (y.art = 'google') DESC, y.erstellt_am LIMIT 1);
END
$umzug$;
