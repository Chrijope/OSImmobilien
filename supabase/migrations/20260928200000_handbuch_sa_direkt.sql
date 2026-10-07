-- ===========================================================================
-- Handbuch: Selbstauskunft direkt aus Ergebnisseite und PDF, ohne Lesezugriff
-- ===========================================================================
--
-- Auftrag vom 28.09.2026: Wer sein Handbuch hat, soll ohne zweites
-- Kontaktformular in die Selbstauskunft springen, auch aus dem PDF. Die
-- Selbstauskunft aktualisiert den Lead aus dem Handbuch, keinen neuen.
--
-- WAS DIESE MIGRATION TUT
--
--   1. Neue Funktion `handbuch_sa_starten(_token)`: Zum Token eines
--      gespeicherten Handbuchs legt sie einen FRISCHEN Ausfuell-Link
--      (`sa_fill_tokens`) fuer genau diesen Lead und dieses Investment an und
--      gibt nur dessen Token zurueck. Vorbelegt werden allein Vor- und
--      Nachname und zwei Konfigurator-Antworten (Beschaeftigung, Ziel), die
--      ohnehin im PDF stehen. Nie E-Mail, Telefon, ein angefangener Stand oder
--      Angaben aus einer frueheren Selbstauskunft. Damit erlaubt ein
--      weitergegebenes PDF nur das Ausfuellen, nie das Lesen.
--      Kein Link (`liegt_vor`), wenn die Selbstauskunft am Investment schon
--      unterschrieben ist, auf die Unterschrift von Person 2 wartet
--      (`saSignaturePartial`) oder schon ueber einen Link abgeschickt wurde:
--      Eine neue Fassung erklaerte sonst die offene Anfrage an Person 2 fuer
--      ueberholt. Hoechstens zehn neue Links je Kontakt und Tag, gezaehlt unter
--      einer Sperre je Kontakt. Der neue Link gilt sieben Tage, schickt keine
--      Erinnerung (er hat keine Adresse) und loest deshalb auch keine
--      Abbrecher-Glocke aus.
--   2. Neue Spalte `sa_fill_tokens.nur_am_link` (Vorgabe false) und
--      `update_sa_fill_token_data` beachtet sie: Links aus Funktion 1 halten
--      den Zwischenstand nur am Link. Am Investment landet er erst beim
--      Abschicken (`submit-sa-signature` schreibt `saData` ohnehin). Sonst
--      ersetzte schon das Zwischenspeichern eines weitergegebenen PDF-Links
--      den angefangenen Stand am Investment. Alle anderen Links arbeiten wie
--      bisher.
--   3. `handbuch_abrufen` gibt den gespeicherten Selbstauskunft-Link nicht
--      mehr heraus (`saToken` entfaellt, `saStatus` bleibt). Bisher bekam
--      jeder mit dem Handbuch-Link auch diesen Link und darueber mit
--      `get_sa_fill_token` den angefangenen Stand der Selbstauskunft. Die
--      Ergebnisseite nimmt jetzt Funktion 1. Den eigenen Link behaelt der
--      Kunde in seiner E-Mail.
--
-- Dazu im Browser (gleicher Commit): Das Formular speichert automatisch erst,
-- wenn der Kunde etwas geaendert hat, fuer alle Links.
--
-- WAS SICH FUER ANON AENDERT
--
-- Keine Erweiterung: Wer ein Handbuch-Token hatte, bekam schon bisher ueber
-- `handbuch_abrufen` einen gueltigen Ausfuell-Link fuer diesen Lead, dazu den
-- Lesezugriff auf dessen Stand. Jetzt bekommt er einen neuen Link ohne den
-- Stand. Ein Handbuch-Token erhaelt nur, wer den Lead selbst angelegt hat
-- (Browser) oder das Postfach der gespeicherten Adresse liest (Mail); bei
-- einer Dublette bekommt der Browser nie ein Token (`submit-lead`).
--
-- OHNE DIESE MIGRATION
--
-- Die Startseite `/handbuch/ergebnis/:token/selbstauskunft` merkt, dass die
-- Funktion fehlt, und nimmt den bisherigen Weg: den gespeicherten Link aus
-- `handbuch_abrufen`, sonst die offene Selbstauskunft.
--
-- Wiederholbar: CREATE OR REPLACE, REVOKE/GRANT.
-- ===========================================================================

DO $$
BEGIN
  IF to_regclass('public.handbuch_anforderungen') IS NULL THEN
    RAISE EXCEPTION 'Zuerst 20260926170000_handbuch_seite.sql ausfuehren, diese Migration baut darauf auf.';
  END IF;
END;
$$;

BEGIN;

ALTER TABLE public.sa_fill_tokens
  ADD COLUMN IF NOT EXISTS nur_am_link boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sa_fill_tokens.nur_am_link IS
  'true: Zwischenstand bleibt am Link, investments.meta.saData erst beim Abschicken (Links aus handbuch_sa_starten). Migration 20260928200000.';

-- ---------------------------------------------------------------------------
-- 1. Frischer Ausfuell-Link zum Handbuch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handbuch_sa_starten(_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z public.handbuch_anforderungen%ROWTYPE;
  _meta jsonb;
  _kunde uuid;
  _geloescht boolean;
  _anzahl integer;
  _vorbelegung jsonb;
  _neu text;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'unbekannt');
  END IF;

  SELECT * INTO _z FROM public.handbuch_anforderungen WHERE token = _token LIMIT 1;
  IF NOT FOUND OR _z.investment_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unbekannt');
  END IF;

  IF _z.gueltig_bis < now() THEN
    RETURN jsonb_build_object('status', 'abgelaufen');
  END IF;

  SELECT coalesce(k.geloescht, false) INTO _geloescht
    FROM public.kontakte k
   WHERE k.id = _z.kontakt_id;
  IF NOT FOUND OR _geloescht THEN
    RETURN jsonb_build_object('status', 'unbekannt');
  END IF;

  -- Das Investment muss zum Lead gehoeren (kunde_id ist uuid, kein ::text).
  SELECT i.meta, i.kunde_id INTO _meta, _kunde
    FROM public.investments i
   WHERE i.id = _z.investment_id;
  IF NOT FOUND OR _kunde IS DISTINCT FROM _z.kontakt_id THEN
    RETURN jsonb_build_object('status', 'unbekannt');
  END IF;

  -- Eine fertige oder schon abgeschickte Selbstauskunft wird ueber diesen Weg
  -- nicht ueberschrieben, auch nicht waehrend Person 2 noch unterschreibt.
  IF coalesce(_meta->>'saSigned', '') = 'true'
     OR coalesce(_meta->>'abgeschlossen', '') = 'true'
     OR coalesce(_meta->>'saSignaturePartial', '') = 'true'
     OR EXISTS (SELECT 1 FROM public.sa_fill_tokens t
                 WHERE t.investment_id = _z.investment_id::text
                   AND t.status = 'used') THEN
    RETURN jsonb_build_object('status', 'liegt_vor');
  END IF;

  -- Bremse gegen massenhaft angelegte Links aus einem weitergegebenen PDF.
  -- Die Sperre je Kontakt verhindert, dass gleichzeitige Aufrufe alle unter
  -- der Grenze zaehlen.
  PERFORM pg_advisory_xact_lock(hashtext(_z.kontakt_id::text));
  SELECT count(*) INTO _anzahl
    FROM public.sa_fill_tokens t
   WHERE t.kontakt_id = _z.kontakt_id::text
     AND t.created_at > now() - interval '1 day';
  IF _anzahl >= 10 THEN
    RETURN jsonb_build_object('status', 'zu_oft');
  END IF;

  -- Dieselbe Zuordnung wie `saVorbelegung` in
  -- supabase/functions/_shared/handbuch-funnel.ts. Aendert sich eine, die
  -- andere mit aendern.
  _vorbelegung := jsonb_strip_nulls(jsonb_build_object(
    'vorname', nullif(btrim(_z.vorname), ''),
    'nachname', nullif(btrim(_z.nachname), ''),
    'beschaeftigungsart', CASE _z.antworten->>'beruf'
                            WHEN 'angestellt' THEN 'angestellt'
                            WHEN 'beamter' THEN 'angestellt'
                            WHEN 'selbststaendig' THEN 'selbstaendig'
                          END,
    'wuenscheZiele', CASE _z.antworten->>'ziel'
                       WHEN 'vermoegen' THEN jsonb_build_array('vermoegen')
                       WHEN 'alter' THEN jsonb_build_array('rente')
                       WHEN 'steuer' THEN jsonb_build_array('steuer')
                     END
  ));

  -- E-Mail bewusst leer: `get_sa_fill_token` gibt sie an den Browser weiter.
  -- `reminder_sent_at` gesetzt: Ohne Adresse keine Erinnerung, und mehrere
  -- Klicks auf das PDF sollen keine Abbrecher-Glocken ausloesen.
  INSERT INTO public.sa_fill_tokens
    (kontakt_id, investment_id, email, name, created_by, prefill_data, person_nr, expires_at, reminder_sent_at, nur_am_link)
  VALUES
    (_z.kontakt_id::text, _z.investment_id::text, '', btrim(_z.vorname || ' ' || _z.nachname), NULL,
     _vorbelegung, 1, now() + interval '7 days', now(), true)
  RETURNING token INTO _neu;

  RETURN jsonb_build_object('status', 'ok', 'saToken', _neu);
END;
$$;

REVOKE ALL ON FUNCTION public.handbuch_sa_starten(text) FROM public;
GRANT EXECUTE ON FUNCTION public.handbuch_sa_starten(text) TO anon, authenticated;

COMMENT ON FUNCTION public.handbuch_sa_starten(text) IS
  'Handbuch-Seite: legt zum gueltigen Handbuch-Token einen frischen Ausfuell-Link fuer diesen Lead an, vorbelegt nur mit Name und zwei Antworten. Kein Lesen gespeicherter Angaben, nichts bei unterschriebener Selbstauskunft, hoechstens zehn je Kontakt und Tag. Migration 20260928200000.';

-- ---------------------------------------------------------------------------
-- 2. Zwischenspeichern: Links mit `nur_am_link` schreiben nicht ans Investment
--    Sonst wortgleich mit 20260623103559.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_sa_fill_token_data(_token text, _data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token_row sa_fill_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token_row FROM sa_fill_tokens WHERE token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_token_row.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;
  IF v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  UPDATE sa_fill_tokens
     SET prefill_data = _data,
         updated_at = now()
   WHERE token = _token;

  IF NOT v_token_row.nur_am_link
     AND v_token_row.investment_id IS NOT NULL AND v_token_row.investment_id <> '' THEN
    BEGIN
      UPDATE investments
         SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('saData', _data),
             updated_at = now()
       WHERE id = v_token_row.investment_id::uuid
         AND COALESCE((meta->>'abgeschlossen')::boolean, false) = false;
    EXCEPTION WHEN invalid_text_representation THEN
      -- investment_id ist keine gültige UUID -> ignorieren, Token-Update bleibt bestehen
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_sa_fill_token_data(text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. handbuch_abrufen ohne den gespeicherten Selbstauskunft-Link
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handbuch_abrufen(_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z public.handbuch_anforderungen%ROWTYPE;
  _slug text;
  _sa_status text;
  _sa_ablauf timestamptz;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO _z FROM public.handbuch_anforderungen WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF _z.gueltig_bis < now() THEN
    RETURN jsonb_build_object('abgelaufen', true, 'vorname', _z.vorname);
  END IF;

  UPDATE public.handbuch_anforderungen
     SET geoeffnet_am = coalesce(geoeffnet_am, now()),
         zuletzt_geoeffnet_am = now(),
         geoeffnet_anzahl = geoeffnet_anzahl + 1
   WHERE id = _z.id;

  IF _z.berater_id IS NOT NULL THEN
    SELECT p.vp_slug INTO _slug
      FROM public.profiles p
     WHERE p.id = _z.berater_id
       AND coalesce(p.gesperrt, false) = false;
  END IF;

  IF _z.sa_token IS NOT NULL THEN
    SELECT t.status, t.expires_at INTO _sa_status, _sa_ablauf
      FROM public.sa_fill_tokens t
     WHERE t.token = _z.sa_token
     LIMIT 1;
  END IF;

  -- Kein `saToken` mehr (Migration 20260928200000): Der gespeicherte Link
  -- oeffnete den angefangenen Stand der Selbstauskunft. Die Ergebnisseite
  -- holt sich einen frischen ueber `handbuch_sa_starten`.
  RETURN jsonb_build_object(
    'abgelaufen', false,
    'vorname', _z.vorname,
    'nachname', _z.nachname,
    'antworten', _z.antworten,
    'ausgang', _z.ausgang,
    'erstelltAm', _z.erstellt_am,
    'gueltigBis', _z.gueltig_bis,
    'beraterSlug', _slug,
    'saStatus', CASE
                  WHEN _z.sa_token IS NULL THEN NULL
                  WHEN _sa_status = 'used' THEN 'ausgefuellt'
                  WHEN _sa_ablauf IS NOT NULL AND _sa_ablauf <= now() THEN 'abgelaufen'
                  WHEN _sa_status = 'pending' THEN 'offen'
                  ELSE NULL
                END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.handbuch_abrufen(text) FROM public;
GRANT EXECUTE ON FUNCTION public.handbuch_abrufen(text) TO anon, authenticated;

COMMENT ON FUNCTION public.handbuch_abrufen(text) IS
  'Handbuch-Seite: liefert zu einem gueltigen Token Vorname, Antworten, Ausgang, Partnerkuerzel und den Stand der Selbstauskunft (ohne deren Link, seit 20260928200000); zaehlt das Oeffnen. Einzige Tuer fuer Besucher. Migration 20260926170000.';

COMMIT;

-- ---------------------------------------------------------------------------
-- PRUEFEN (Lesen, aendert nichts): Zeilen 37.1 bis 37.3 in 99_PRUEFUNG.sql
-- ---------------------------------------------------------------------------
