-- ===========================================================================
-- Selbstauskunft: ein fester Link je Investment und Person
-- ===========================================================================
--
-- WARUM
--
-- Kunden oeffnen Links aus aelteren Mails (Einladung, Erinnerung). Jeder
-- Versand erzeugte einen neuen Link, jeder lief nach sieben Tagen ab, und der
-- naechtliche Lauf `cleanup_expired_tokens()` loeschte ihn sieben Tage
-- spaeter. Die Seite sagte dann "Ungueltiger Link", obwohl der Kunde laengst
-- einen neueren, gueltigen Link fuer dasselbe Investment hatte.
--
-- Freigabe der Geschaeftsfuehrung vom 07.10.2026: ein fester Link je
-- Kontakt, Investment und Person, 30 Tage gueltig ab der letzten Aktivitaet.
--
-- WAS DIESE MIGRATION TUT
--
-- 1. Bestand: Jeder offene, noch gueltige Link (`pending`, nicht abgelaufen)
--    gilt mindestens bis heute plus 30 Tage, damit laufende Kunden nicht
--    heute ablaufen. Bereits abgelaufene bleiben abgelaufen; ein Neuversand
--    durch den Berater macht sie wieder gueltig. Eine Wiederholung setzt nur
--    Links, die weniger als 30 Tage Rest haben, wieder auf 30 Tage; laengere
--    bleiben, wie sie sind.
--
-- 2. Ausstellen: `sa_link_ausstellen` (nur fuer `send-sa-invitation`, nicht
--    fuer Besucher oder angemeldete Nutzer). In einer Transaktion und unter
--    einer Sperre je Kontakt, Investment und Person:
--      - offene Links an eine ANDERE Adresse werden widerrufen (Status
--        `widerrufen`): Ging der erste Link an eine vertippte oder fremde
--        Adresse, darf deren Empfaenger nicht weiterarbeiten;
--      - der neueste offene Link an DIESELBE Adresse wird wiederverwendet und
--        gilt wieder 30 Tage, auch wenn er schon abgelaufen war; seine Kopie
--        bleibt, nur eine leere bekommt die neue Vorbelegung;
--      - sonst entsteht ein neuer Link.
--    Handbuch-Links (`nur_am_link`) werden nie wiederverwendet, ihr Stand
--    geht erst beim Abschicken ans Investment.
--
-- 3. Gueltigkeit nach Aktivitaet: Oeffnen (`mark_sa_link_opened`) und
--    Speichern (`update_sa_fill_token_data`) setzen den Ablauf auf mindestens
--    jetzt plus 30 Tage, Versand und Erinnerung ebenso. Nur ein offener, noch
--    gueltiger Link wird verlaengert; ein abgelaufener wird durch Oeffnen
--    nicht wieder lebendig. `greatest` verkuerzt nie einen laengeren Ablauf.
--
-- 4. Immer der aktuelle Stand: `get_sa_fill_token` gibt bei offenem Link den
--    Stand am Investment heraus (`investments.meta.saData`), die Kopie am
--    Link ist Rueckfall. Gelesen wird nur das Investment dieses Links und nur,
--    wenn es zum Kontakt des Links gehoert.
--
-- 5. Person 2: Ein Link fuer Person 2 sieht und schreibt nur `person2Data`.
--    Die Angaben von Person 1 (Einkommen, Steuer-ID, Bankverbindung) bekommt
--    er nicht heraus, und sein Speichern ersetzt nicht mehr `saData`, sondern
--    traegt nur `person2Data` in den vorhandenen Stand ein. Der Link fuer
--    Person 1 sieht weiter alles: Die Selbstauskunft ist ein gemeinsamer
--    Antrag, Person 1 fuellt die Angaben von Person 2 mit aus. Derzeit legt
--    kein Weg im CRM einen Link fuer Person 2 an; der Filter sichert alte
--    Zeilen und jeden kuenftigen Weg ab.
--
-- 6. Schreiben nur, was zusammengehoert: `update_sa_fill_token_data` sperrt
--    die Zeile (FOR UPDATE) und prueft Status und Ablauf unter der Sperre. Die
--    Abschlusswege setzen `used` mit einem UPDATE auf dieselbe Zeile und
--    warten damit auf die Sperre; danach sieht jeder weitere Speicherversuch
--    `used` und schreibt nichts. Ausserdem muss das Investment zum Kontakt
--    des Links gehoeren, sonst wird nichts geschrieben.
--
-- 7. Aufraeumen nur abgeschlossener Links. Entscheidung vom 07.10.2026: Bei
--    einer noch nicht abgeschlossenen Selbstauskunft (`pending`) wird nie
--    etwas geleert oder geloescht, auch nicht nach Ablauf. Ein
--    abgeschlossener Link (`used`) verliert 30 Tage nach dem Abschluss seine
--    Kopie (gespeicherter Stand, E-Mail, Name, die drei Zeitpunkte zu Mail,
--    Link und Erinnerung). Datenminimierung: Nach dem Abschluss liegen die
--    Angaben am Investment und im unterschriebenen PDF, die Kopie am Link
--    braucht niemand mehr. Es bleiben nur Kennungen, damit die Seite weiter
--    "Bereits ausgefuellt" sagt statt "unbekannt". 180 Tage nach Ablauf wird
--    ein abgeschlossener Link geloescht, wie bei `signature_requests`. Der
--    Abschluss wird an `updated_at` gemessen, das beim Setzen auf `used`
--    mitlaeuft (Trigger aus 20260623050816). Widerrufene Links bleiben
--    stehen wie offene; ihr Stand gehoert zu einem nicht abgeschlossenen
--    Vorgang.
--
-- 8. `sa_link_nachfolger(_token)`: Der Token des neuesten offenen und
--    gueltigen Links fuer denselben Kontakt, dasselbe Investment, dieselbe
--    Person und dieselbe Adresse, wenn der aufgerufene Link offen und aelter
--    ist; sonst NULL. Abgeschlossene und widerrufene Links haben keinen
--    Nachfolger. Ein gueltiger Handbuch-Link bleibt, sein Stand liegt an ihm.
--    Wer den alten Link hat, hatte Zugriff auf genau dieses Postfach; gleiche
--    Adresse heisst derselbe Empfaenger. Die Funktion gibt nur den Token
--    heraus.
--
-- 9. `sa_neuen_link_anfordern(_token)`: Knopf "Neuen Link anfordern" auf der
--    Seite eines abgelaufenen Links. Eine Glocke an den aktuell Zustaendigen
--    des Kontakts, ohne Zustaendigen an Admin, Inhaber und Vertriebsleitung
--    (Glocken-Regel vom 28.09.2026). Hoechstens einmal in 24 Stunden je
--    Kontakt und Investment, egal ueber welchen alten Link, unter einer
--    Sperre gegen gleichzeitige Klicks. Antwort: 'angefordert',
--    'schon_angefordert' oder 'nicht_moeglich'.
--
-- 10. `sa_link_abschliessen` (nur fuer `submit-sa-signature`): Abschicken
--    unter der Sperre des Links in einer Transaktion. Prueft Status, Ablauf,
--    Kontaktzuordnung und dass jede Unterschrift zur Person des Links passt
--    (Link fuer Person 2 nur `person2`), legt die Unterschriften an (je
--    Fassung und Person hoechstens eine), traegt den Stand gegen den Stand
--    am Investment in genau diesem Augenblick ein (Person 2 nur
--    `person2Data`) und setzt den Link nur von `pending` auf `used`. Ein
--    widerrufener Link wird nie `used`. Ein zweiter Aufruf nach einem
--    Netzaussetzer bekommt 'schon_abgeschlossen' und schreibt nichts.
--    Neue Spalten: `abgeschlossen_am` (danach darf der Link nur noch zwei
--    Stunden lang Angaben und Unterschriften seiner eigenen Fassung abholen,
--    `finalize-selbstauskunft`) und `p2_nachforderung_am` (die Mail an
--    Person 2 ging hinaus; leer heisst, ein Wiederholungsaufruf holt sie
--    nach).
--
-- Status: `pending` offen, `used` abgeschlossen, neu `widerrufen`. Alles, was
-- nicht `pending` ist, gilt in allen Funktionen als geschlossen: keine Daten,
-- keine Verlaengerung, kein Nachfolger.
--
-- Alle Funktionen laufen als SECURITY DEFINER mit `search_path = public,
-- pg_temp`; erst wird PUBLIC alles entzogen, dann bekommen nur die noetigen
-- Rollen das Aufrufrecht.
--
-- REIHENFOLGE
--
-- Nach 20261004130000_absicherung_lesen.sql: `cleanup_expired_tokens()` ist
-- hier deren Fassung (Scan-Sitzungen bleiben stehen), nur der Teil zu
-- `sa_fill_tokens` ist neu. Liefe 20261004130000 danach, loeschte der Lauf
-- wieder offene Links sieben Tage nach Ablauf. Danach `send-sa-invitation`,
-- `send-sa-abbrecher-reminder`, `submit-sa-signature` und
-- `finalize-selbstauskunft` ausrollen.
--
-- Ohne diese Migration: Die Seite zeigt fuer geloeschte Links "Dieser Link
-- ist nicht bekannt", bietet weder Weiterleitung noch Knopf an und liest die
-- Kopie am Link; `send-sa-invitation` legt wie bisher je Versand einen neuen
-- Link an, der 30 Tage gilt.
-- ===========================================================================

BEGIN;

ALTER TABLE public.sa_fill_tokens
  ADD COLUMN IF NOT EXISTS neuer_link_angefordert_am timestamptz,
  ADD COLUMN IF NOT EXISTS abgeschlossen_am timestamptz,
  ADD COLUMN IF NOT EXISTS p2_nachforderung_am timestamptz;

COMMENT ON COLUMN public.sa_fill_tokens.abgeschlossen_am IS
  'Wann dieser Link ueber sa_link_abschliessen abgeschickt wurde. finalize-selbstauskunft laesst ihn danach nur zwei Stunden lang Angaben abholen. Migration 20261007100000.';
COMMENT ON COLUMN public.sa_fill_tokens.p2_nachforderung_am IS
  'Wann die Mail an Person 2 zu dieser Fassung erfolgreich versendet wurde (submit-sa-signature). Leer heisst: beim naechsten Aufruf nachholen. Migration 20261007100000.';

COMMENT ON COLUMN public.sa_fill_tokens.neuer_link_angefordert_am IS
  'Wann der Kunde auf der Seite des abgelaufenen Links einen neuen angefordert hat (sa_neuen_link_anfordern). Migration 20261007100000.';

-- ---------------------------------------------------------------------------
-- 1) Bestand: offene Links mindestens 30 Tage
-- ---------------------------------------------------------------------------

UPDATE public.sa_fill_tokens
   SET expires_at = now() + interval '30 days'
 WHERE status = 'pending'
   AND expires_at > now()
   AND expires_at < now() + interval '30 days';

-- ---------------------------------------------------------------------------
-- 2) Helfer: was ein Link fuer Person 2 sehen und schreiben darf
-- ---------------------------------------------------------------------------

-- Lesen: Person 1 alles, Person 2 nur ihr eigener Teil.
CREATE OR REPLACE FUNCTION public.sa_daten_sicht(_person_nr integer, _daten jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _daten IS NULL OR jsonb_typeof(_daten) <> 'object' THEN NULL
    WHEN _person_nr = 2 THEN jsonb_build_object(
      'person2', true,
      'person2Data', CASE WHEN jsonb_typeof(_daten -> 'person2Data') = 'object' THEN _daten -> 'person2Data' ELSE '{}'::jsonb END)
    ELSE _daten
  END
$$;

-- Schreiben: Person 1 ersetzt den Stand, Person 2 traegt nur ihren Teil ein.
CREATE OR REPLACE FUNCTION public.sa_daten_fuer_person(_person_nr integer, _eingabe jsonb, _bestand jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _person_nr = 2 THEN
      (CASE WHEN jsonb_typeof(_bestand) = 'object' THEN _bestand ELSE '{}'::jsonb END)
      || jsonb_build_object(
           'person2', true,
           'person2Data', CASE WHEN jsonb_typeof(_eingabe -> 'person2Data') = 'object' THEN _eingabe -> 'person2Data' ELSE '{}'::jsonb END)
    ELSE _eingabe
  END
$$;

-- Kennung als uuid, oder NULL, wenn sie keine ist. So trifft der Vergleich
-- den Index auf investments.id, und eine kaputte Kennung bricht nichts ab.
CREATE OR REPLACE FUNCTION public.sa_als_uuid(_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN _text::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

-- Darf ein Link dieser Person diese Unterschrift einreichen? Person 2 nur
-- die eigene, Person 1 wie bisher (sie unterschreibt im selben Fenster auch
-- fuer Person 2).
CREATE OR REPLACE FUNCTION public.sa_signatur_passt(_person_nr integer, _person_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN _person_nr = 2 THEN lower(btrim(coalesce(_person_type, ''))) = 'person2' ELSE true END
$$;

REVOKE ALL ON FUNCTION public.sa_signatur_passt(integer, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sa_als_uuid(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sa_daten_sicht(integer, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sa_daten_fuer_person(integer, jsonb, jsonb) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Ausstellen: ein fester Link je Kontakt, Investment und Person
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sa_link_ausstellen(
  _kontakt_id text,
  _investment_id text,
  _person_nr integer,
  _email text,
  _name text,
  _created_by uuid,
  _prefill jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _vorhanden public.sa_fill_tokens%ROWTYPE;
  _widerrufen int := 0;
  _token text;
  _kopie jsonb := public.sa_daten_sicht(_person_nr, _prefill);
BEGIN
  IF coalesce(btrim(_kontakt_id), '') = '' OR coalesce(btrim(_investment_id), '') = ''
     OR _person_nr NOT IN (1, 2) OR coalesce(btrim(_email), '') = '' THEN
    RAISE EXCEPTION 'sa_link_ausstellen: Kontakt, Investment, Person (1 oder 2) und E-Mail sind Pflicht'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Zwei Versaende gleichzeitig duerfen nicht zwei Links anlegen.
  PERFORM pg_advisory_xact_lock(hashtext('sa_link:' || _kontakt_id || ':' || _investment_id || ':' || _person_nr));

  UPDATE public.sa_fill_tokens
     SET status = 'widerrufen'
   WHERE kontakt_id = _kontakt_id
     AND investment_id = _investment_id
     AND person_nr = _person_nr
     AND status = 'pending'
     AND lower(btrim(email)) <> lower(btrim(_email));
  GET DIAGNOSTICS _widerrufen = ROW_COUNT;

  SELECT * INTO _vorhanden
    FROM public.sa_fill_tokens
   WHERE kontakt_id = _kontakt_id
     AND investment_id = _investment_id
     AND person_nr = _person_nr
     AND status = 'pending'
     AND NOT coalesce(nur_am_link, false)
     AND lower(btrim(email)) = lower(btrim(_email))
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.sa_fill_tokens
       SET name = coalesce(nullif(btrim(_name), ''), name),
           expires_at = greatest(expires_at, now() + interval '30 days'),
           reminder_sent_at = NULL,
           prefill_data = CASE
             WHEN prefill_data IS NULL OR prefill_data = '{}'::jsonb THEN _kopie
             ELSE prefill_data END
     WHERE id = _vorhanden.id;
    RETURN jsonb_build_object('token', _vorhanden.token, 'wiederverwendet', true, 'widerrufen', _widerrufen);
  END IF;

  INSERT INTO public.sa_fill_tokens (kontakt_id, investment_id, person_nr, email, name, created_by, prefill_data, expires_at)
  VALUES (_kontakt_id, _investment_id, _person_nr, btrim(_email), coalesce(_name, ''), _created_by,
          coalesce(_kopie, '{}'::jsonb), now() + interval '30 days')
  RETURNING token INTO _token;

  RETURN jsonb_build_object('token', _token, 'wiederverwendet', false, 'widerrufen', _widerrufen);
END;
$$;

REVOKE ALL ON FUNCTION public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb) IS
  'Fester Selbstauskunfts-Link: andere Adresse widerrufen, gleiche Adresse wiederverwenden und 30 Tage verlaengern, sonst neu. Nur send-sa-invitation (service_role). Migration 20261007100000.';

-- ---------------------------------------------------------------------------
-- 4) Aufraeumen: offene Links nie, abgeschlossene nach 30 und 180 Tagen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_activation int := 0;
  v_sa int := 0;
  v_sa_geleert int := 0;
  v_unsub int := 0;
  v_sig int := 0;
BEGIN
  DELETE FROM public.activation_tokens
   WHERE (expires_at IS NOT NULL AND expires_at < now() - interval '7 days')
      OR (used_at   IS NOT NULL AND used_at   < now() - interval '30 days');
  GET DIAGNOSTICS v_activation = ROW_COUNT;

  -- Selbstauskunfts-Links: nur abgeschlossene (`used`). Offene bleiben ganz,
  -- auch nach Ablauf (Kopf Punkt 7). Geleert wird nur, was noch etwas
  -- traegt, damit der Lauf nicht jede Nacht dieselben Zeilen anfasst.
  UPDATE public.sa_fill_tokens
     SET prefill_data     = NULL,
         email            = '',
         name             = '',
         email_opened_at  = NULL,
         link_opened_at   = NULL,
         reminder_sent_at = NULL
   WHERE status = 'used'
     AND updated_at < now() - interval '30 days'
     AND (prefill_data IS NOT NULL OR email <> '' OR name <> ''
          OR email_opened_at IS NOT NULL OR link_opened_at IS NOT NULL OR reminder_sent_at IS NOT NULL);
  GET DIAGNOSTICS v_sa_geleert = ROW_COUNT;

  DELETE FROM public.sa_fill_tokens
   WHERE status = 'used'
     AND expires_at IS NOT NULL AND expires_at < now() - interval '180 days';
  GET DIAGNOSTICS v_sa = ROW_COUNT;

  DELETE FROM public.email_unsubscribe_tokens
   WHERE used_at IS NOT NULL AND used_at < now() - interval '90 days';
  GET DIAGNOSTICS v_unsub = ROW_COUNT;

  -- mobile_scan_sessions bleiben stehen, siehe 20261004130000 Kopf Punkt 4.

  DELETE FROM public.signature_requests
   WHERE expires_at IS NOT NULL AND expires_at < now() - interval '180 days';
  GET DIAGNOSTICS v_sig = ROW_COUNT;

  RETURN jsonb_build_object(
    'activation_tokens', v_activation,
    'sa_fill_tokens', v_sa,
    'sa_fill_tokens_geleert', v_sa_geleert,
    'email_unsubscribe_tokens', v_unsub,
    'mobile_scan_sessions', 0,
    'signature_requests', v_sig,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_tokens() FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Link lesen: der Stand kommt vom Investment, Person 2 nur ihr Teil
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sa_fill_token(_token text)
RETURNS public.sa_fill_tokens
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _zeile public.sa_fill_tokens%ROWTYPE;
  _stand jsonb;
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

  -- Abgeschickt, widerrufen oder abgelaufen: nur Status, Ablauf und Sprache (seit 20260928220000).
  IF NOT coalesce(_zeile.status = 'pending' AND _zeile.expires_at > now(), false) THEN
    _zeile.prefill_data := NULL;
    _zeile.email := '';
    _zeile.name := '';
    _zeile.kontakt_id := NULL;
    _zeile.investment_id := NULL;
    _zeile.created_by := NULL;
    _zeile.email_opened_at := NULL;
    _zeile.link_opened_at := NULL;
    _zeile.reminder_sent_at := NULL;
    RETURN _zeile;
  END IF;

  IF NOT coalesce(_zeile.nur_am_link, false) THEN
    -- Offen: der Stand am Investment geht vor der Kopie am Link (Kopf Punkt 4).
    -- Nur das Investment dieses Links, und nur, wenn es zum Kontakt gehoert.
    SELECT i.meta -> 'saData'
      INTO _stand
      FROM public.investments i
     WHERE i.id = public.sa_als_uuid(_zeile.investment_id)
       AND i.kunde_id = public.sa_als_uuid(_zeile.kontakt_id)
     LIMIT 1;
    IF jsonb_typeof(_stand) = 'object' AND _stand <> '{}'::jsonb THEN
      _zeile.prefill_data := _stand;
    END IF;
  END IF;

  -- Person 2 bekommt nur ihren eigenen Teil heraus, auch aus der Kopie (Kopf Punkt 5).
  _zeile.prefill_data := public.sa_daten_sicht(_zeile.person_nr, _zeile.prefill_data);

  RETURN _zeile;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sa_fill_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sa_fill_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_sa_fill_token(text) IS
  'Selbstauskunfts-Link lesen: bei offenem Link der Stand am Investment (sonst die Kopie am Link), fuer Person 2 nur person2Data; sonst nur Status, Ablauf und Sprache. Migrationen 20260928220000 und 20261007100000.';

-- ---------------------------------------------------------------------------
-- 6) Oeffnen und Speichern verlaengern den Link
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_sa_link_opened(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.sa_fill_tokens
     SET link_opened_at  = COALESCE(link_opened_at, now()),
         email_opened_at = COALESCE(email_opened_at, now()),
         expires_at      = greatest(expires_at, now() + interval '30 days')
   WHERE token = _token
     AND status = 'pending'
     AND expires_at > now();
$$;

REVOKE ALL ON FUNCTION public.mark_sa_link_opened(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_sa_link_opened(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_sa_fill_token_data(_token text, _data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_row public.sa_fill_tokens%ROWTYPE;
BEGIN
  -- Unter der Sperre pruefen: Ein Abschluss (`used`) wartet auf sie, und
  -- danach schreibt kein Speicherversuch mehr (Kopf Punkt 6).
  SELECT * INTO v_token_row FROM public.sa_fill_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_token_row.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;
  IF v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  -- Das Investment muss zum Kontakt des Links gehoeren, wie beim Lesen.
  IF NOT EXISTS (
    SELECT 1 FROM public.investments i
     WHERE i.id = public.sa_als_uuid(v_token_row.investment_id)
       AND i.kunde_id = public.sa_als_uuid(v_token_row.kontakt_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'zuordnung');
  END IF;

  -- Speichern ist Aktivitaet: der Link gilt wieder 30 Tage (20261007100000).
  -- Die Kopie am Link traegt fuer Person 2 nur deren Teil.
  UPDATE public.sa_fill_tokens
     SET prefill_data = public.sa_daten_sicht(v_token_row.person_nr, _data),
         expires_at = greatest(expires_at, now() + interval '30 days'),
         updated_at = now()
   WHERE id = v_token_row.id;

  IF NOT v_token_row.nur_am_link THEN
    -- Person 1 ersetzt den Stand, Person 2 traegt nur person2Data ein.
    UPDATE public.investments
       SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
             'saData', public.sa_daten_fuer_person(v_token_row.person_nr, _data, meta -> 'saData')),
           updated_at = now()
     WHERE id = public.sa_als_uuid(v_token_row.investment_id)
       AND COALESCE((meta->>'abgeschlossen')::boolean, false) = false;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_sa_fill_token_data(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.update_sa_fill_token_data(text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Nachfolger: alte Links leiten auf den festen Link weiter
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sa_link_nachfolger(_token text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _alt public.sa_fill_tokens%ROWTYPE;
  _neu text;
BEGIN
  SELECT * INTO _alt FROM public.sa_fill_tokens WHERE token = _token LIMIT 1;
  IF NOT FOUND OR _alt.status <> 'pending' THEN
    -- Unbekannt, abgeschlossen oder widerrufen: nichts weiterzuleiten.
    RETURN NULL;
  END IF;

  -- Ein gueltiger Handbuch-Link traegt seinen Stand selbst, er bleibt.
  IF coalesce(_alt.nur_am_link, false) AND coalesce(_alt.expires_at > now(), false) THEN
    RETURN NULL;
  END IF;

  -- Ohne Adresse am alten Link laesst sich der Empfaenger nicht vergleichen.
  IF btrim(coalesce(_alt.email, '')) = '' THEN
    RETURN NULL;
  END IF;

  SELECT n.token INTO _neu
    FROM public.sa_fill_tokens n
   WHERE n.kontakt_id = _alt.kontakt_id
     AND n.investment_id = _alt.investment_id
     AND n.person_nr = _alt.person_nr
     AND lower(btrim(n.email)) = lower(btrim(_alt.email))
     AND n.token <> _alt.token
     AND n.created_at > _alt.created_at
     AND n.status = 'pending'
     AND n.expires_at > now()
   ORDER BY n.created_at DESC
   LIMIT 1;

  RETURN _neu;
END;
$$;

REVOKE ALL ON FUNCTION public.sa_link_nachfolger(text) FROM public;
GRANT EXECUTE ON FUNCTION public.sa_link_nachfolger(text) TO anon, authenticated;

COMMENT ON FUNCTION public.sa_link_nachfolger(text) IS
  'Selbstauskunfts-Link: Token des neueren offenen Links fuer denselben Kontakt, dasselbe Investment, dieselbe Person und dieselbe E-Mail, sonst NULL. Migration 20261007100000.';

-- ---------------------------------------------------------------------------
-- 8) Neuen Link anfordern (Glocke an den Zustaendigen)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sa_neuen_link_anfordern(_token text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _z public.sa_fill_tokens%ROWTYPE;
  _kontakt_id uuid;
  _zustaendig uuid;
  _kunde text;
  _titel text := 'Selbstauskunft: neuer Link angefordert';
  _nachricht text;
  _empfaenger uuid;
BEGIN
  SELECT * INTO _z FROM public.sa_fill_tokens WHERE token = _token LIMIT 1;
  IF NOT FOUND OR _z.status <> 'pending' OR coalesce(_z.expires_at > now(), false) THEN
    RETURN 'nicht_moeglich';
  END IF;

  -- Bremse je Kontakt und Investment, nicht je Link: Mehrere alte Links
  -- desselben Vorgangs loesen zusammen hoechstens eine Glocke am Tag aus.
  PERFORM pg_advisory_xact_lock(hashtext('sa_neuer_link:' || _z.kontakt_id || ':' || _z.investment_id));
  IF EXISTS (
    SELECT 1 FROM public.sa_fill_tokens t
     WHERE t.kontakt_id = _z.kontakt_id
       AND t.investment_id = _z.investment_id
       AND t.neuer_link_angefordert_am > now() - interval '24 hours'
  ) THEN
    RETURN 'schon_angefordert';
  END IF;

  SELECT k.id, k.zustaendig_id, btrim(coalesce(k.vorname, '') || ' ' || coalesce(k.nachname, ''))
    INTO _kontakt_id, _zustaendig, _kunde
    FROM public.kontakte k
   WHERE k.id::text = _z.kontakt_id
     AND coalesce(k.geloescht, false) = false;
  IF _kontakt_id IS NULL THEN
    RETURN 'nicht_moeglich';
  END IF;

  _nachricht := coalesce(nullif(_kunde, ''), 'Ein Kunde')
    || CASE WHEN _z.person_nr = 2 THEN ' (Person 2)' ELSE '' END
    || ' hat den abgelaufenen Link zur Selbstauskunft geöffnet und bittet um einen neuen. '
    || 'Sende die Einladung im Kundenprofil erneut, dann gilt derselbe Link wieder und der Stand bleibt erhalten.';

  -- Glocke nur an den aktuell Zustaendigen, ohne ihn an die Leitung.
  IF _zustaendig IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (_zustaendig, _titel, _nachricht, '/kunden/' || _kontakt_id::text);
  ELSE
    FOR _empfaenger IN
      SELECT DISTINCT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (_empfaenger, _titel, _nachricht, '/kunden/' || _kontakt_id::text);
    END LOOP;
  END IF;

  UPDATE public.sa_fill_tokens SET neuer_link_angefordert_am = now() WHERE id = _z.id;
  RETURN 'angefordert';
END;
$$;

REVOKE ALL ON FUNCTION public.sa_neuen_link_anfordern(text) FROM public;
GRANT EXECUTE ON FUNCTION public.sa_neuen_link_anfordern(text) TO anon, authenticated;

COMMENT ON FUNCTION public.sa_neuen_link_anfordern(text) IS
  'Abgelaufener Selbstauskunfts-Link: Glocke an den Zustaendigen (ohne ihn an Admin, Inhaber, Vertriebsleitung), hoechstens einmal je Kontakt und Investment in 24 Stunden. Migration 20261007100000.';

-- ---------------------------------------------------------------------------
-- 9) Abschicken: Status, Unterschriften, Stand und Abschluss unter einer Sperre
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sa_link_abschliessen(
  _token text,
  _sa_data jsonb,
  _signaturen jsonb,
  _signiert_am timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _z public.sa_fill_tokens%ROWTYPE;
  _sig jsonb;
  _kontakt uuid;
  _inv uuid;
  _stand jsonb;
  _fassung text;
BEGIN
  SELECT * INTO _z FROM public.sa_fill_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ergebnis', 'unbekannt');
  END IF;
  -- Derselbe Abschluss noch einmal (Netzaussetzer): Erfolg, nichts schreiben.
  IF _z.status = 'used' THEN
    RETURN jsonb_build_object('ergebnis', 'schon_abgeschlossen');
  END IF;
  IF _z.status <> 'pending' OR NOT coalesce(_z.expires_at > now(), false) THEN
    RETURN jsonb_build_object('ergebnis', 'abgelehnt');
  END IF;

  IF jsonb_typeof(_signaturen) <> 'array' OR jsonb_array_length(_signaturen) = 0 THEN
    RETURN jsonb_build_object('ergebnis', 'abgelehnt');
  END IF;
  FOR _sig IN SELECT value FROM jsonb_array_elements(_signaturen) LOOP
    IF NOT public.sa_signatur_passt(_z.person_nr, _sig ->> 'personType') THEN
      RETURN jsonb_build_object('ergebnis', 'falsche_person');
    END IF;
  END LOOP;

  _kontakt := public.sa_als_uuid(_z.kontakt_id);
  _inv := public.sa_als_uuid(_z.investment_id);
  IF _kontakt IS NULL OR (_inv IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.investments i WHERE i.id = _inv AND i.kunde_id = _kontakt
  )) THEN
    RETURN jsonb_build_object('ergebnis', 'zuordnung');
  END IF;

  -- Stand gegen den Stand am Investment in diesem Augenblick (Zeilensperre
  -- des UPDATE): Person 2 traegt nur person2Data ein.
  IF _inv IS NOT NULL THEN
    UPDATE public.investments
       SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
             'saData', public.sa_daten_fuer_person(_z.person_nr, _sa_data, meta -> 'saData'),
             'saEditStatus', 'none'),
           updated_at = now()
     WHERE id = _inv
     RETURNING meta -> 'saData' INTO _stand;
  END IF;
  _stand := coalesce(_stand, public.sa_daten_fuer_person(_z.person_nr, _sa_data, NULL));

  -- Je Fassung und Person hoechstens eine Unterschrift.
  _fassung := _z.id::text;
  FOR _sig IN SELECT value FROM jsonb_array_elements(_signaturen) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.signature_requests r
       WHERE r.kontakt_id = _kontakt
         AND r.person_type = _sig ->> 'personType'
         AND r.status = 'signed'
         AND r.meta ->> 'saFassung' = _fassung
         AND r.investment_id IS NOT DISTINCT FROM _z.investment_id
    ) THEN
      INSERT INTO public.signature_requests (
        kontakt_id, investment_id, person_type, name, email, token, status, signed_at,
        signature_data, sa_data, consent_text, user_agent, expires_at, meta)
      VALUES (
        _kontakt, _z.investment_id, _sig ->> 'personType', coalesce(_sig ->> 'name', ''),
        coalesce(_sig ->> 'email', ''), gen_random_uuid()::text, 'signed', coalesce(_signiert_am, now()),
        _sig ->> 'signatureData', _stand, _sig ->> 'consentText', _sig ->> 'userAgent',
        now() + interval '7 days', jsonb_build_object('saFassung', _fassung));
    END IF;
  END LOOP;

  UPDATE public.sa_fill_tokens
     SET status = 'used', abgeschlossen_am = now()
   WHERE id = _z.id AND status = 'pending';
  RETURN jsonb_build_object('ergebnis', 'ok', 'saData', _stand);
END;
$$;

REVOKE ALL ON FUNCTION public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz) TO service_role;

COMMENT ON FUNCTION public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz) IS
  'Selbstauskunft abschicken unter der Sperre des Links: Status, Person, Unterschriften, Stand und pending zu used in einer Transaktion. Nur submit-sa-signature (service_role). Migration 20261007100000.';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 91.1 bis 91.7 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
