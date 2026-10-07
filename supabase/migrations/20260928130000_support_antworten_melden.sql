-- ===========================================================================
-- Support-Tickets: Antworten atomar anhaengen und dem Ersteller melden
-- ===========================================================================
--
-- WARUM
--
-- Freigegeben von Christian am 28.09.2026. Drei Befunde:
--
-- 1. Datenverlust. Der Browser las die Nachrichtenliste aus seinem
--    Zwischenspeicher, haengte an und schrieb die ganze Liste zurueck
--    (`supportTicketStore.addNachricht`). Schrieben Support und Ersteller
--    kurz nacheinander, gewann der Letzte, die andere Nachricht war weg.
-- 2. Der Ersteller erfuhr von einer Antwort nichts: keine Glocke, keine
--    Zahl in der Seitenleiste, keine Mail.
-- 3. Als Absender stand bei jeder Support-Antwort fest verdrahtet "Admin".
--
-- WAS SICH AENDERT
--
-- Vier Funktionen, alle SECURITY DEFINER mit festem search_path:
--
--   support_ticket_nachricht_anhaengen(uuid, text, text)
--       Haengt eine Nachricht in einer einzigen Aenderung an, unter
--       Zeilensperre (FOR UPDATE). Zwei gleichzeitige Antworten landen
--       beide. Prueft die Berechtigung selbst:
--         'nutzer'  nur der Ersteller des Tickets
--         'support' nur Administrator, Inhaber, Backoffice
--       Die Vertriebsleitung liest wie bisher nur. Absender und Name kommen
--       aus der Sitzung und dem Profil, nicht aus dem Browser. Bei einer
--       Support-Antwort: Status "neu" wird "in_bearbeitung", und der
--       Ersteller bekommt eine Glocke mit Link direkt auf das Ticket, ausser
--       er hat selbst geschrieben.
--
--   support_ticket_gelesen(uuid)
--       Der Ersteller setzt `meta.gelesen_am_ersteller` seines EIGENEN
--       Tickets auf jetzt. Nur dieses eine Feld, nur beim eigenen Ticket.
--
--   support_ticket_antwort_melden(uuid)
--       Knopf "Antwort erneut melden" im Helpdesk, fuer Antworten von vor
--       dieser Aenderung. Nur Administrator, Inhaber, Backoffice. Schreibt
--       die Glocke wie bei einer neuen Antwort und nimmt die Lesemarke des
--       Erstellers zurueck, damit das Ticket wieder als ungelesen zaehlt.
--       Legt keine Nachricht an.
--
--   support_ticket_mail_beanspruchen(uuid)
--       Die 15-Minuten-Bremse fuer die Mail. Nur die Service-Rolle (Edge
--       Function `support-antwort-mail`). Setzt `meta.support_mail_am` in
--       einer einzigen Aenderung, aber nur, wenn die letzte Mail zu diesem
--       Ticket 15 Minuten oder laenger her ist. Liefert dann den Zeitpunkt,
--       sonst NULL. Wer den Zeitpunkt bekommt, verschickt.
--
-- Alle Aenderungen an `meta` laufen als `meta || jsonb_build_object(...)`
-- bzw. `jsonb_set` in der Datenbank, nie als Rueckschreiben einer im Browser
-- gelesenen Fassung.
--
-- ZEITSTEMPEL
--
-- Die Zeitpunkte in `meta` stehen im selben Format, das der Browser mit
-- `toISOString()` schreibt (UTC, Millisekunden, "Z"). So bleiben alte und
-- neue Nachrichten vergleichbar.
--
-- OHNE DIESE MIGRATION
--
-- Der Browser erkennt die fehlende Funktion (PGRST202) und nimmt den alten
-- Weg: Nachricht wie bisher anhaengen, Glocke aus dem Browser, keine Mail,
-- Lesemarke nur im Browser.
--
-- Wiederholbar: CREATE OR REPLACE, Rechte werden jedes Mal neu gesetzt.
-- ===========================================================================


-- ── 1. Nachricht anhaengen ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.support_ticket_nachricht_anhaengen(
  p_ticket_id uuid,
  p_inhalt text,
  p_als text DEFAULT 'nutzer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.support_tickets%ROWTYPE;
  v_ist_support boolean;
  v_name text;
  v_vorname text;
  v_absender_name text;
  v_jetzt text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_liste jsonb;
  v_neu jsonb;
  v_bilder text;
  v_status text;
  v_meta jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;
  IF p_als IS NULL OR p_als NOT IN ('nutzer', 'support') THEN
    RAISE EXCEPTION 'Unbekannte Absenderart' USING ERRCODE = '22023';
  END IF;
  IF p_inhalt IS NULL OR btrim(p_inhalt) = '' THEN
    RAISE EXCEPTION 'Nachricht ist leer' USING ERRCODE = '22023';
  END IF;
  IF length(p_inhalt) > 20000 THEN
    RAISE EXCEPTION 'Nachricht ist zu lang' USING ERRCODE = '22023';
  END IF;

  -- Die Zeilensperre macht das Anhaengen atomar: Ein zweiter Aufruf wartet
  -- hier, bis der erste fertig ist, und liest dann dessen Stand.
  SELECT * INTO v_t FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  v_ist_support := COALESCE(public.is_admin_role(v_uid), false)
                OR COALESCE(public.has_role(v_uid, 'backoffice'::public.app_role), false);

  IF p_als = 'support' AND NOT v_ist_support THEN
    RAISE EXCEPTION 'Nur Support darf antworten' USING ERRCODE = '42501';
  END IF;
  IF p_als = 'nutzer' AND NOT COALESCE(v_t.benutzer_id = v_uid, false) THEN
    RAISE EXCEPTION 'Nur der Ersteller darf in sein Ticket schreiben' USING ERRCODE = '42501';
  END IF;

  SELECT btrim(COALESCE(p.name, '')) INTO v_name FROM public.profiles p WHERE p.id = v_uid;
  v_name := COALESCE(v_name, '');
  v_vorname := split_part(v_name, ' ', 1);

  IF p_als = 'support' THEN
    v_absender_name := CASE WHEN v_vorname <> '' THEN 'MOREImmo Support (' || v_vorname || ')'
                            ELSE 'MOREImmo Support' END;
  ELSE
    v_absender_name := CASE WHEN v_name <> '' THEN v_name
                            ELSE COALESCE(NULLIF(v_t.meta->>'erstellerName', ''), 'Nutzer') END;
  END IF;

  v_liste := COALESCE(v_t.meta->'nachrichten', '[]'::jsonb);
  IF jsonb_typeof(v_liste) <> 'array' THEN
    v_liste := '[]'::jsonb;
  END IF;

  -- Fehlermeldungen aus dem Warndreieck haben keine Nachrichtenliste, nur
  -- `nachricht` und `meta.bilder`. Der Browser zeigt daraus eine erste
  -- Nachricht an. Damit sie beim ersten Anhaengen nicht verschwindet, wird
  -- sie hier genauso angelegt (siehe `fromDb` in supportTicketStore.ts).
  IF jsonb_array_length(v_liste) = 0
     AND (COALESCE(v_t.nachricht, '') <> ''
          OR jsonb_typeof(v_t.meta->'bilder') = 'array') THEN
    SELECT string_agg('![Screenshot ' || b.nr || '](' || b.url || ')', E'\n' ORDER BY b.nr)
      INTO v_bilder
      FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(v_t.meta->'bilder') = 'array' THEN v_t.meta->'bilder' ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS b(url, nr);
    v_liste := jsonb_build_array(jsonb_build_object(
      'id', v_t.id::text || '-initial',
      'ticketId', v_t.id,
      'absender', 'nutzer',
      'absenderName', COALESCE(NULLIF(v_t.meta->>'reporterName', ''), NULLIF(v_t.meta->>'erstellerName', ''), 'Melder'),
      'inhalt', COALESCE(v_t.nachricht, '') || CASE WHEN v_bilder IS NOT NULL THEN E'\n\n' || v_bilder ELSE '' END,
      'timestamp', to_char(COALESCE(v_t.erstellt_am, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
  END IF;

  v_neu := jsonb_build_object(
    'id', gen_random_uuid(),
    'ticketId', v_t.id,
    'absender', CASE WHEN p_als = 'support' THEN 'backoffice' ELSE 'nutzer' END,
    'absenderName', v_absender_name,
    'absenderId', v_uid,
    'inhalt', btrim(p_inhalt),
    'timestamp', v_jetzt
  );

  v_status := CASE WHEN p_als = 'support' AND v_t.status = 'neu' THEN 'in_bearbeitung'
                   ELSE v_t.status END;

  UPDATE public.support_tickets
     SET meta = COALESCE(meta, '{}'::jsonb)
                || jsonb_build_object('nachrichten', v_liste || jsonb_build_array(v_neu),
                                      'aktualisiertAm', v_jetzt),
         status = v_status
   WHERE id = v_t.id
  RETURNING meta INTO v_meta;

  -- Glocke fuer den Ersteller, nur bei einer Antwort vom Support und nicht,
  -- wenn der Ersteller selbst schreibt. Nach einer DSGVO-Loeschung gibt es
  -- das Konto nicht mehr; dann landet die Antwort trotzdem, nur ohne Glocke
  -- (sonst scheitert die Verknuepfung auf auth.users und damit alles).
  IF p_als = 'support' AND v_t.benutzer_id IS NOT NULL AND v_t.benutzer_id <> v_uid
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_t.benutzer_id) THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      v_t.benutzer_id,
      'Antwort vom Support zu T-' || COALESCE(v_t.meta->>'nummer', '?'),
      COALESCE(NULLIF(v_t.betreff, ''), 'Dein Support-Ticket'),
      '/support-kontaktieren?ticket=' || v_t.id::text
    );
  END IF;

  RETURN jsonb_build_object('status', v_status, 'meta', v_meta, 'nachricht', v_neu);
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_nachricht_anhaengen(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_nachricht_anhaengen(uuid, text, text) TO authenticated;


-- ── 2. Gelesen setzen, nur das eigene Ticket ──────────────────────────────

CREATE OR REPLACE FUNCTION public.support_ticket_gelesen(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_treffer integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;

  UPDATE public.support_tickets
     SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{gelesen_am_ersteller}',
                          to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
   WHERE id = p_ticket_id
     AND benutzer_id = v_uid;
  GET DIAGNOSTICS v_treffer = ROW_COUNT;
  RETURN v_treffer > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_gelesen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_gelesen(uuid) TO authenticated;


-- ── 3. Antwort erneut melden (Nachholen) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.support_ticket_antwort_melden(p_ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.support_tickets%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;
  IF NOT (COALESCE(public.is_admin_role(v_uid), false)
          OR COALESCE(public.has_role(v_uid, 'backoffice'::public.app_role), false)) THEN
    RAISE EXCEPTION 'Nur Support darf Antworten melden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_t FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket nicht gefunden' USING ERRCODE = 'P0002';
  END IF;
  IF v_t.benutzer_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_t.benutzer_id) THEN
    RAISE EXCEPTION 'Das Konto des Erstellers gibt es nicht mehr' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_t.meta->'nachrichten') = 'array' THEN v_t.meta->'nachrichten' ELSE '[]'::jsonb END
           ) n
     WHERE n->>'absender' = 'backoffice'
  ) THEN
    RAISE EXCEPTION 'Im Ticket steht noch keine Antwort vom Support' USING ERRCODE = '22023';
  END IF;

  -- Lesemarke zuruecknehmen, damit das Ticket wieder als ungelesen zaehlt.
  UPDATE public.support_tickets
     SET meta = COALESCE(meta, '{}'::jsonb) - 'gelesen_am_ersteller'
   WHERE id = v_t.id;

  INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
  VALUES (
    v_t.benutzer_id,
    'Antwort vom Support zu T-' || COALESCE(v_t.meta->>'nummer', '?'),
    COALESCE(NULLIF(v_t.betreff, ''), 'Dein Support-Ticket'),
    '/support-kontaktieren?ticket=' || v_t.id::text
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_antwort_melden(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_antwort_melden(uuid) TO authenticated;


-- ── 4. Mail-Bremse, nur Service-Rolle ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.support_ticket_mail_beanspruchen(p_ticket_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jetzt text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_treffer integer;
BEGIN
  -- Eine einzige Aenderung mit Bedingung: Zwei gleichzeitige Aufrufe koennen
  -- nicht beide gewinnen, der zweite sieht die Marke des ersten.
  UPDATE public.support_tickets
     SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{support_mail_am}', to_jsonb(v_jetzt))
   WHERE id = p_ticket_id
     AND (meta->>'support_mail_am' IS NULL
          OR (meta->>'support_mail_am')::timestamptz <= now() - interval '15 minutes');
  GET DIAGNOSTICS v_treffer = ROW_COUNT;
  RETURN CASE WHEN v_treffer > 0 THEN v_jetzt ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.support_ticket_mail_beanspruchen(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_ticket_mail_beanspruchen(uuid) TO service_role;


-- ===========================================================================
-- PRUEFLAUF NACH DEM AUSFUEHREN (aendert nichts)
-- ===========================================================================
--
--   select p.proname, p.prosecdef,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as angemeldet,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') as dienst
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname like 'support_ticket_%'
--    order by 1;
--
-- Erwartet: vier Zeilen, alle prosecdef = true. `support_ticket_mail_beanspruchen`
-- mit angemeldet = false, die drei anderen mit angemeldet = true.
-- ===========================================================================
