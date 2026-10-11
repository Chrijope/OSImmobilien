-- ===========================================================================
-- Namen des Ursprungsprojekts in Datenbankfunktionen ersetzen (11.10.2026)
--
-- 1. support_ticket_nachricht_anhaengen: Antworten des Supports tragen den
--    Absender "OS Immobilien Support" statt "MOREImmo Support".
-- 2. get_bewerber_seite: beendet_durch liefert 'osimmobilien' statt
--    'moreimmo' (die Bewerberseite vergleicht nur mit 'bewerber').
--
-- Beide Funktionen sind unveraendert aus ihren letzten Fassungen uebernommen
-- (20260928130000_support_antworten_melden.sql, 20260906140000_bewerber_seite.sql),
-- nur die Zeichenketten sind getauscht. CREATE OR REPLACE behaelt die Rechte.
-- ===========================================================================

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
    v_absender_name := CASE WHEN v_vorname <> '' THEN 'OS Immobilien Support (' || v_vorname || ')'
                            ELSE 'OS Immobilien Support' END;
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

CREATE OR REPLACE FUNCTION public.get_bewerber_seite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bewerbung uuid;
  _vorname text;
  _status text;
  _meta jsonb;
  _kennen jsonb;
  -- Bewusst einzelne Variablen statt eines record: Findet die Abfrage keinen
  -- Bogen, bleiben sie schlicht NULL. Ein record ohne Zeile ist eine Falle,
  -- die erst zur Laufzeit auffaellt.
  _bogen_token text;
  _bogen_status text;
  _bogen_ablauf timestamptz;
  _bogen_eingereicht timestamptz;
  _bogen_antworten jsonb;
  _freigabe text;
BEGIN
  -- Formfehler früh abweisen, damit ein Tippfehler keine Abfrage auslöst.
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT s.bewerbung_id INTO _bewerbung
    FROM public.bewerber_seite s
   WHERE s.token = _token
     AND s.expires_at > now();

  /*
   * Der zweite gültige Zugang: das Token des Kennenlernens.
   *
   * Es ist genauso lang und genauso zufällig, es gehört demselben Menschen,
   * und es steht in einer Mail, die er schon hat. Ohne diesen Weg müsste jeder
   * Bewerber aus der Zeit vor dieser Migration auf eine neue Mail warten, um
   * seine Seite überhaupt zu finden.
   */
  IF _bewerbung IS NULL THEN
    SELECT f.bewerbung_id INTO _bewerbung
      FROM public.bewerber_formular f
     WHERE f.token = _token;
  END IF;

  IF _bewerbung IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT b.vorname, COALESCE(b.status, ''), COALESCE(b.meta, '{}'::jsonb)
    INTO _vorname, _status, _meta
    FROM public.bewerbungen b
   WHERE b.id = _bewerbung;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Ein Lebenszeichen, nur für das Aufräumen. Best-Effort, ohne eigene Zeile
  -- schlägt nichts fehl.
  UPDATE public.bewerber_seite
     SET letzter_zugriff_am = now()
   WHERE bewerbung_id = _bewerbung;

  _kennen := COALESCE(_meta -> 'kennenlernen', '{}'::jsonb);

  /*
   * Der Bogen: der offene zuerst, sonst der jüngste. Ein eingereichter Bogen
   * hat keinen offenen Nachfolger, deshalb greift die zweite Bedingung.
   */
  SELECT f.token, f.status, f.expires_at, f.eingereicht_am, COALESCE(f.antworten, '{}'::jsonb)
    INTO _bogen_token, _bogen_status, _bogen_ablauf, _bogen_eingereicht, _bogen_antworten
    FROM public.bewerber_formular f
   WHERE f.bewerbung_id = _bewerbung
   ORDER BY (f.status = 'offen') DESC, f.created_at DESC
   LIMIT 1;

  _freigabe := COALESCE(_kennen ->> 'zusammenfassungFreigabeAm', '');

  RETURN jsonb_build_object(
    'vorname', COALESCE(_vorname, ''),
    'beworben_am', COALESCE(_meta ->> 'beworben', ''),

    /*
     * Drei grobe Merkmale statt der Pipelinestufe. Die Seite zeigt keine
     * Stufe, und was sie nicht zeigt, braucht sie auch nicht zu bekommen.
     */
    'beendet', (_status IN ('KeinInteresse', 'Abgelehnt')),
    'beendet_durch', CASE
      WHEN _status NOT IN ('KeinInteresse', 'Abgelehnt') THEN ''
      WHEN COALESCE(_meta ->> 'selbstAbgemeldetAm', '') <> ''
        OR COALESCE(_kennen ->> 'ausstiegAm', '') <> '' THEN 'bewerber'
      ELSE 'osimmobilien'
    END,
    'zugesagt', (_status IN ('Vertrag', 'Rechnung', 'Nutzer_anlegen', 'Aktiv')),

    'kennenlernen', jsonb_build_object(
      'token', COALESCE(_bogen_token, ''),
      'status', COALESCE(_bogen_status, ''),
      'laeuft_ab_am', _bogen_ablauf,
      'eingereicht_am', _bogen_eingereicht,
      -- „Angefangen" heißt: im Bogen steht mehr als das Kennzeichen, das
      -- `send-bewerber-kennenlernen` beim Anlegen hineinschreibt.
      'angefangen', (COALESCE(_bogen_antworten, '{}'::jsonb) - 'bogen') <> '{}'::jsonb,
      'gesendet_am', COALESCE(_kennen ->> 'gesendetAm', '')
    ),

    'termin', jsonb_build_object(
      'datum', COALESCE(_meta ->> 'erstgespraechDatum', ''),
      'uhrzeit', COALESCE(_meta ->> 'erstgespraechUhrzeit', ''),
      'berater', COALESCE(_meta ->> 'erstgespraechBerater', ''),
      'gefuehrt_am', COALESCE(_meta -> 'erstgespraechSkript' ->> 'durchgefuehrtAm', '')
    ),

    /*
     * Ohne Freigabe geht nichts raus. Das ist keine Vorsicht, sondern die
     * Regel aus Moment 7: „Ohne Freigabe geht keine maschinell erzeugte
     * Zusammenfassung raus." Solange im CRM niemand freigegeben hat, bleibt
     * dieser Block leer, und die Seite zeigt nur, dass das Gespräch lief.
     */
    'entscheidung', CASE WHEN _freigabe = '' THEN '{}'::jsonb ELSE jsonb_build_object(
      'freigegeben_am', _freigabe,
      'text', COALESCE(_kennen ->> 'zusammenfassungText', ''),
      'einschaetzung', COALESCE(_kennen ->> 'einschaetzung', ''),
      'offener_punkt', COALESCE(_kennen -> 'offenerPunkt', '{}'::jsonb)
    ) END,

    'start', jsonb_build_object(
      'vertrag_status', COALESCE(_meta ->> 'vertragStatus', ''),
      'vertrag_unterschrieben_am', COALESCE(_meta ->> 'vertragSignedAt', ''),
      'aktiv_am', COALESCE(_meta ->> 'aktivAm', ''),
      'servicevereinbarung', COALESCE(_meta ->> 'paketwahl', '')
    ),

    'pause', COALESCE(_kennen -> 'pause', '{}'::jsonb),
    'frage', COALESCE(_kennen -> 'frage', '{}'::jsonb),
    'anruf_widersprochen', COALESCE((_kennen ->> 'anrufWidersprochen')::boolean, false)
  );
END $$;
