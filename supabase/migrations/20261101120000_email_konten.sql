-- ---------------------------------------------------------------------------
-- E-Mail-Konten, Zuordnung zu Kontakten, automatisches Abholen (01.11.2026)
-- ---------------------------------------------------------------------------
--
-- Bisher lagen Mailkonten samt Passwort im Klartext in
-- user_settings.einstellungen.email.zusatzKonten und waren im Browser lesbar.
-- Jetzt:
--   * public.email_konten: ein Konto je Zeile, das Passwort im Tresor
--     (Supabase Vault). Der Browser sieht nur, dass es eins gibt.
--   * public.emails bekommt Konto, IMAP-Ordner und -UID (eindeutig, keine
--     Dubletten mehr), Message-ID und Empfänger.
--   * Mails werden über die Adresse einem Kontakt zugeordnet, auch
--     nachträglich, wenn ein Kontakt die Adresse später bekommt.
--   * Abgeholt wird alle 5 Minuten (sync-emails, aktion "alle").
--   * Sehen darf eine Mail nur der Inhaber des Postfachs (RLS auf emails wie
--     bisher: benutzer_id = auth.uid()), auch im Kundenprofil.
--
-- Nur hinzufügen, nichts entfernen: Die alte Oberfläche läuft weiter, bis die
-- neue ausgeliefert ist (CLAUDE.md, „erst hinzufügen, später entfernen“).

-- 1) Konten -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_konten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benutzer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  art text NOT NULL DEFAULT 'imap' CHECK (art IN ('imap', 'google', 'microsoft')),
  adresse text NOT NULL,
  anzeigename text,
  imap_host text,
  imap_port integer NOT NULL DEFAULT 993,
  smtp_host text,
  smtp_port integer NOT NULL DEFAULT 465,
  benutzername text,
  -- Kennung des Eintrags in vault.secrets; ohne Tresorzugriff wertlos.
  geheimnis_id uuid,
  -- Je IMAP-Ordner: {"INBOX": {"validity": 123, "uid": 456}}
  ordner_stand jsonb NOT NULL DEFAULT '{}'::jsonb,
  aktiv boolean NOT NULL DEFAULT true,
  zuletzt_abgeholt timestamptz,
  letzter_fehler text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (benutzer_id, adresse)
);

ALTER TABLE public.email_konten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene Mailkonten lesen" ON public.email_konten;
CREATE POLICY "Eigene Mailkonten lesen" ON public.email_konten
  FOR SELECT TO authenticated USING (benutzer_id = auth.uid());

DROP POLICY IF EXISTS "Eigene Mailkonten entfernen" ON public.email_konten;
CREATE POLICY "Eigene Mailkonten entfernen" ON public.email_konten
  FOR DELETE TO authenticated USING (benutzer_id = auth.uid());

-- Anlegen und Ändern nur über die Function email-konten (Dienstrolle), die
-- vorher die Anmeldung am Mailserver prüft. Lesen nur ohne Tresorkennung.
REVOKE ALL ON public.email_konten FROM anon, authenticated;
GRANT DELETE ON public.email_konten TO authenticated;
GRANT SELECT (id, benutzer_id, art, adresse, anzeigename, imap_host, imap_port,
              smtp_host, smtp_port, benutzername, aktiv, zuletzt_abgeholt,
              letzter_fehler, erstellt_am)
  ON public.email_konten TO authenticated;

-- 2) Tresor -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.email_geheimnis_setzen(_konto uuid, _wert text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT geheimnis_id INTO _id FROM public.email_konten WHERE id = _konto;
  IF _id IS NULL THEN
    _id := vault.create_secret(_wert, 'email_konto_' || _konto::text, 'Zugang E-Mail-Konto');
    UPDATE public.email_konten SET geheimnis_id = _id WHERE id = _konto;
  ELSE
    PERFORM vault.update_secret(_id, _wert);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_geheimnis_lesen(_konto uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT s.decrypted_secret
    FROM public.email_konten k
    JOIN vault.decrypted_secrets s ON s.id = k.geheimnis_id
   WHERE k.id = _konto;
$$;

REVOKE ALL ON FUNCTION public.email_geheimnis_setzen(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_geheimnis_lesen(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_geheimnis_setzen(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_geheimnis_lesen(uuid) TO service_role;

-- Wird ein Konto entfernt, verschwindet sein Passwort aus dem Tresor.
CREATE OR REPLACE FUNCTION public.email_konto_geheimnis_loeschen()
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
REVOKE ALL ON FUNCTION public.email_konto_geheimnis_loeschen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_email_konto_geheimnis_loeschen ON public.email_konten;
CREATE TRIGGER trg_email_konto_geheimnis_loeschen
  AFTER DELETE ON public.email_konten
  FOR EACH ROW EXECUTE FUNCTION public.email_konto_geheimnis_loeschen();

-- 3) Mails ------------------------------------------------------------------

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS konto_id uuid REFERENCES public.email_konten(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS imap_ordner text,
  ADD COLUMN IF NOT EXISTS imap_uid bigint,
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS empfaenger text[] NOT NULL DEFAULT '{}';

-- Voll statt teilweise, damit das Einfügen mit ON CONFLICT ihn nutzen kann.
-- Ältere Zeilen ohne Konto stören nicht: NULL gilt als verschieden.
CREATE UNIQUE INDEX IF NOT EXISTS emails_konto_ordner_uid
  ON public.emails (konto_id, imap_ordner, imap_uid);
CREATE INDEX IF NOT EXISTS emails_kontakt_zeit
  ON public.emails (kontakt_id, empfangen_am DESC)
  WHERE kontakt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS emails_benutzer_ungelesen
  ON public.emails (benutzer_id)
  WHERE NOT gelesen;
CREATE INDEX IF NOT EXISTS emails_absender_klein
  ON public.emails (lower(absender_email));

-- 4) Zuordnung zu Kontakten ---------------------------------------------------

-- Der Kontakt zu einer der Adressen. Bei mehreren Treffern zuerst der, für
-- den der Postfach-Inhaber zuständig ist, dann der jüngste. Gelöschte zählen
-- nicht. Gesehen wird die Mail ohnehin nur vom Postfach-Inhaber.
CREATE OR REPLACE FUNCTION public.email_kontakt_finden(_benutzer uuid, _adressen text[])
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.id
    FROM public.kontakte k
   WHERE coalesce(k.geloescht, false) = false
     AND nullif(trim(k.email), '') IS NOT NULL
     AND lower(trim(k.email)) = ANY (SELECT lower(trim(a)) FROM unnest(_adressen) a)
   ORDER BY (k.zustaendig_id = _benutzer) DESC NULLS LAST, k.erstellt_am DESC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.email_kontakt_finden(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_kontakt_finden(uuid, text[]) TO service_role;

-- Bekommt ein Kontakt (neu oder später) eine Adresse, werden ältere Mails
-- mit dieser Adresse ihm zugeordnet.
CREATE OR REPLACE FUNCTION public.email_kontakt_nachtragen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _adresse text := lower(trim(coalesce(NEW.email, '')));
BEGIN
  IF _adresse = '' OR coalesce(NEW.geloescht, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND lower(trim(coalesce(OLD.email, ''))) = _adresse THEN
    RETURN NEW;
  END IF;
  UPDATE public.emails e
     SET kontakt_id = NEW.id
   WHERE e.kontakt_id IS NULL
     AND (lower(e.absender_email) = _adresse OR _adresse = ANY (e.empfaenger));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_kontakt_nachtragen: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.email_kontakt_nachtragen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_email_kontakt_nachtragen ON public.kontakte;
CREATE TRIGGER trg_email_kontakt_nachtragen
  AFTER INSERT OR UPDATE OF email ON public.kontakte
  FOR EACH ROW EXECUTE FUNCTION public.email_kontakt_nachtragen();

-- Schon abgeholte Mails einmal nachträglich zuordnen.
UPDATE public.emails e
   SET kontakt_id = public.email_kontakt_finden(e.benutzer_id, ARRAY[e.absender_email])
 WHERE e.kontakt_id IS NULL
   AND nullif(trim(e.absender_email), '') IS NOT NULL;

-- 5) Vorhandene Konten aus den Einstellungen übernehmen ------------------------

-- Passwörter wandern in den Tresor und verschwinden aus user_settings.
-- Fehler brechen die Migration ab (kein stilles Weiter): Sonst blieben die
-- Klartext-Passwörter stehen, und die neue Oberfläche fände keine Konten.
-- Eine Portangabe im alten Serverfeld („imap.firma.de:143“) wird übernommen.
DO $umzug$
DECLARE
  _zeile record;
  _konto jsonb;
  _id uuid;
  _adresse text;
  _imap text;
  _smtp text;
BEGIN
  FOR _zeile IN
    SELECT user_id, einstellungen
      FROM public.user_settings
     WHERE jsonb_typeof(einstellungen -> 'email' -> 'zusatzKonten') = 'array'
       AND jsonb_array_length(einstellungen -> 'email' -> 'zusatzKonten') > 0
  LOOP
    FOR _konto IN SELECT * FROM jsonb_array_elements(_zeile.einstellungen -> 'email' -> 'zusatzKonten') LOOP
      _adresse := lower(trim(coalesce(_konto ->> 'email', '')));
      CONTINUE WHEN _adresse = '';
      _imap := lower(trim(coalesce(_konto ->> 'imapServer', '')));
      _smtp := lower(trim(coalesce(_konto ->> 'smtpServer', '')));
      INSERT INTO public.email_konten (benutzer_id, art, adresse, imap_host, imap_port, smtp_host, smtp_port, benutzername)
      VALUES (
        _zeile.user_id,
        'imap',
        _adresse,
        nullif(split_part(_imap, ':', 1), ''),
        CASE WHEN split_part(_imap, ':', 2) IN ('993', '143') THEN split_part(_imap, ':', 2)::int ELSE 993 END,
        nullif(split_part(_smtp, ':', 1), ''),
        CASE WHEN split_part(_smtp, ':', 2) IN ('465', '587') THEN split_part(_smtp, ':', 2)::int ELSE 465 END,
        coalesce(nullif(trim(_konto ->> 'benutzername'), ''), _adresse)
      )
      ON CONFLICT (benutzer_id, adresse) DO NOTHING;
      -- Auch bei einer Dublette das vorhandene Konto nehmen.
      SELECT id INTO _id FROM public.email_konten WHERE benutzer_id = _zeile.user_id AND adresse = _adresse;
      IF nullif(_konto ->> 'passwort', '') IS NOT NULL
         AND (SELECT geheimnis_id FROM public.email_konten WHERE id = _id) IS NULL THEN
        PERFORM public.email_geheimnis_setzen(_id, _konto ->> 'passwort');
      END IF;
    END LOOP;
    UPDATE public.user_settings
       SET einstellungen = jsonb_set(einstellungen #- '{email,passwort}', '{email,zusatzKonten}', '[]'::jsonb)
     WHERE user_id = _zeile.user_id;
  END LOOP;
END
$umzug$;

-- 6) Alle 5 Minuten abholen ----------------------------------------------------

-- Wie die anderen Automatiken: öffentlicher Schlüssel aus einem vorhandenen
-- Zeitplan, Geheimwort aus dem Tresor zur Laufzeit (automatik_geheimnis()).
-- Fehlt das Geheimwort, läuft sync-emails im Übergang trotzdem (automatik-
-- schutz.ts) und liefert nur Zähler zurück, keine Inhalte.
DO $zeitplan$
DECLARE
  _url text := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/sync-emails';
  _anon text;
  _kandidat text;
  _teil text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'pg_cron oder pg_net fehlt. Es wurde kein Zeitplan fuer sync-emails angelegt.';
    RETURN;
  END IF;

  FOR _kandidat IN
    SELECT (regexp_match(command, 'apikey[^e]{1,8}(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)'))[1]
      FROM cron.job
     ORDER BY jobid
  LOOP
    CONTINUE WHEN _kandidat IS NULL;
    BEGIN
      _teil := translate(split_part(_kandidat, '.', 2), '-_', '+/');
      _teil := rpad(_teil, ((length(_teil) + 3) / 4) * 4, '=');
      IF convert_from(decode(_teil, 'base64'), 'UTF8')::jsonb ->> 'role' = 'anon' THEN
        _anon := _kandidat;
        EXIT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  IF _anon IS NULL THEN
    RAISE WARNING 'In keinem vorhandenen Zeitplan steht ein oeffentlicher Schluessel. Kein Zeitplan fuer sync-emails angelegt.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'emails-abholen') THEN
    PERFORM cron.unschedule('emails-abholen');
  END IF;

  PERFORM cron.schedule(
    'emails-abholen',
    '*/5 * * * *',
    format(
      $befehl$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L, 'Authorization', %L, 'x-internal-secret', public.automatik_geheimnis()), body := '{"aktion":"alle"}'::jsonb, timeout_milliseconds := 150000);$befehl$,
      _url,
      _anon,
      'Bearer ' || _anon
    )
  );
END
$zeitplan$;
