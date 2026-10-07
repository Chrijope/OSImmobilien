-- ════════════════════════════════════════════════════════════════════════════
-- Eine gebuchte Objektvorstellung hebt auch das Investment auf Objektauswahl
-- ════════════════════════════════════════════════════════════════════════════
--
-- WARUM
--
-- Bucht ein Kunde über den Buchungslink eine Objektvorstellung, hob das System
-- bisher nur die Stufe am KONTAKT. Die Pipeline zeigt aber die Stufe des
-- INVESTMENTS, sobald es eines gibt (siehe getEffectivePipelineStufe in
-- src/lib/kontaktPipeline.ts). Der Kunde saß also im Termin zur
-- Objektvorstellung, und sein Vorgang stand weiter auf einer früheren Stufe.
--
-- Christian hat am 21.09.2026 entschieden, dass das Investment mitspringen
-- soll.
--
-- WARUM NUR BEI GENAU EINEM INVESTMENT
--
-- Die Buchung hängt am Kontakt, nicht am Investment. Hat ein Kunde mehrere
-- laufende Vorgänge, sagt die Buchung nicht, welcher gemeint ist. Eines zu
-- raten wäre schlimmer als nichts zu tun: Der falsche Vorgang stünde dann in
-- der Objektauswahl, und beim richtigen fehlte der Schritt trotzdem.
--
-- Deshalb greift die Automatik nur, wenn es genau ein Investment gibt, das
-- nicht beendet ist. Bei mehreren bleibt es beim Kontakt, und der Berater
-- entscheidet selbst.
--
-- WAS BEWUSST NICHT GEPRÜFT WIRD
--
-- Die Selbstauskunft. Im Anwendungscode gibt es seit dem 21.09.2026 einen
-- Wächter, der das Vorrücken auf Objektauswahl ohne unterschriebene
-- Selbstauskunft verhindert (src/lib/objektauswahlWaechter.ts). Hier gilt er
-- nicht, und das ist Absicht: Wer einen Termin zur Objektvorstellung bucht,
-- ist bei der Objektauswahl, ob die Unterlagen vollständig sind oder nicht.
-- Christian hat das ausdrücklich so entschieden.
--
-- Die Folge gehört dazu: Ein solcher Vorgang kann in der Objektauswahl stehen,
-- ohne dass eine Selbstauskunft unterschrieben ist. Die Karte für die
-- Objektdaten bleibt trotzdem gesperrt, dafür sorgt die Freischaltung im
-- Kundenprofil.

CREATE OR REPLACE FUNCTION public.buchung_investment_vorwaerts(_kontakt uuid, _stufe text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv_id uuid;
  _anzahl int;
  _jetzige text;
BEGIN
  IF _kontakt IS NULL OR NULLIF(btrim(COALESCE(_stufe, '')), '') IS NULL THEN
    RETURN false;
  END IF;

  -- Beendete Vorgänge zählen nicht mit: Ein verlorener Kunde neben einem
  -- laufenden darf nicht dazu führen, dass gar nichts passiert.
  SELECT count(*), min(i.id)
  INTO _anzahl, _inv_id
  FROM public.investments i
  WHERE i.kunde_id = _kontakt
    AND COALESCE(i.meta ->> 'pipelineStufe', '')
        NOT IN ('verloren', 'archiviert', 'bestandsimport');

  IF _anzahl <> 1 THEN
    RETURN false;
  END IF;

  SELECT NULLIF(btrim(COALESCE(i.meta ->> 'pipelineStufe', '')), '')
  INTO _jetzige
  FROM public.investments i
  WHERE i.id = _inv_id;

  -- Nur nach vorne, nie zurück. Dieselbe Regel wie am Kontakt.
  IF public.buchung_pipeline_rang(_stufe) <= public.buchung_pipeline_rang(_jetzige) THEN
    RETURN false;
  END IF;

  UPDATE public.investments
  SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('pipelineStufe', _stufe)
  WHERE id = _inv_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_investment_vorwaerts(uuid, text) FROM public;

COMMENT ON FUNCTION public.buchung_investment_vorwaerts(uuid, text) IS
  'Hebt die Stufe des einzigen laufenden Investments eines Kontakts, nur nach vorne. Bei mehreren Investments passiert nichts, weil die Buchung nicht sagt, welches gemeint ist.';


-- ── Die Buchungsfunktion ruft die neue Funktion zusaetzlich auf ──
--
-- Wortgleich uebernommen aus 20260827160000_buchung_begleitung.sql, ergaenzt
-- ist ausschliesslich die eine PERFORM-Zeile. Postgres kennt kein "eine Zeile
-- in eine Funktion einfuegen", eine Funktion wird immer als Ganzes ersetzt.

CREATE OR REPLACE FUNCTION public.buchung_anlegen(
  _token text,
  _terminart_id uuid,
  _start timestamptz,
  _name text,
  _email text,
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
  _z record;
  _art public.buchung_terminarten;
  _zone text;
  _tag date;
  _name_sauber text;
  _email_sauber text;
  _begl_name text;
  _begl_email text;
  _begleitung_sauber jsonb;
  _ende timestamptz;
  _buchung public.buchungen;
  _raum public.videoraeume;
  _abzug jsonb;
  _aktivitaet_id uuid;
  _kontakt_id uuid;
  _stufe text;
  _vorname text;
  _nachname text;
BEGIN
  SELECT * INTO _z FROM public.buchung_zugang_aufloesen(_token);
  IF _z.mitarbeiter_id IS NULL THEN
    RAISE EXCEPTION 'Dieser Buchungslink ist nicht mehr gueltig';
  END IF;

  SELECT * INTO _art
  FROM public.buchung_terminarten t
  WHERE t.id = _terminart_id
    AND t.mitarbeiter_id = _z.mitarbeiter_id
    AND t.aktiv
    AND (_z.art = 'persoenlich' OR t.oeffentlich)
    AND (_z.terminart_id IS NULL OR t.id = _z.terminart_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diese Terminart steht nicht zur Verfuegung';
  END IF;

  _name_sauber := left(NULLIF(btrim(COALESCE(_name, '')), ''), 120);
  IF _name_sauber IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Namen angeben';
  END IF;

  _email_sauber := left(lower(NULLIF(btrim(COALESCE(_email, '')), '')), 200);
  IF _email_sauber IS NULL OR _email_sauber !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Bitte eine gueltige E-Mail-Adresse angeben';
  END IF;

  -- Optionale Begleitperson: entweder gar nicht, oder Name UND gueltige
  -- E-Mail. Halbe Angaben werden abgewiesen statt still verworfen, sonst
  -- glaubte der Kunde, seine Begleitung sei eingeladen, und sie ist es nicht.
  IF _begleitung IS NOT NULL AND jsonb_typeof(_begleitung) = 'object' THEN
    _begl_name := left(NULLIF(btrim(COALESCE(_begleitung ->> 'name', '')), ''), 120);
    _begl_email := left(lower(NULLIF(btrim(COALESCE(_begleitung ->> 'email', '')), '')), 200);
    IF _begl_name IS NOT NULL OR _begl_email IS NOT NULL THEN
      IF _begl_name IS NULL THEN
        RAISE EXCEPTION 'Bitte den Namen der Begleitperson angeben';
      END IF;
      IF _begl_email IS NULL OR _begl_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RAISE EXCEPTION 'Bitte eine gueltige E-Mail-Adresse der Begleitperson angeben';
      END IF;
      _begleitung_sauber := jsonb_build_object('name', _begl_name, 'email', _begl_email);
    END IF;
  END IF;

  IF _start IS NULL THEN
    RAISE EXCEPTION 'Bitte eine Startzeit angeben';
  END IF;

  -- Vorlaufzeit und Vorausschau
  IF _start < now() + make_interval(mins => _art.vorlauf_minuten) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu kurzfristig';
  END IF;
  IF _start > now() + make_interval(days => _art.vorausschau_tage) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu weit in der Zukunft';
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _z.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _ende := _start + make_interval(mins => _art.dauer_minuten);
  _tag := (_start AT TIME ZONE _zone)::date;

  -- Liegt der Termin vollstaendig in einem verfuegbaren Fenster dieses Tages?
  IF NOT EXISTS (
    WITH fenster AS (
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _z.mitarbeiter_id AND v.datum = _tag AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _z.mitarbeiter_id
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _z.mitarbeiter_id AND a.datum = _tag
        )
    )
    SELECT 1 FROM fenster f
    WHERE _start >= (_tag + f.von) AT TIME ZONE _zone
      AND _ende <= (_tag + f.bis) AT TIME ZONE _zone
  ) THEN
    RAISE EXCEPTION 'Zu dieser Zeit ist kein Termin moeglich';
  END IF;

  -- Zwei Buchende koennen im selben Augenblick auf dieselbe Zeit klicken.
  -- Die Sperre serialisiert das je Mitarbeiter, damit die Pruefung darunter
  -- nicht ins Leere laeuft.
  PERFORM pg_advisory_xact_lock(hashtext('buchung:' || _z.mitarbeiter_id::text));

  IF EXISTS (
    SELECT 1 FROM public.buchungen b
    WHERE b.mitarbeiter_id = _z.mitarbeiter_id
      AND b.status <> 'abgesagt'
      AND b.start_at - make_interval(mins => b.puffer_vor_minuten)
          < _ende + make_interval(mins => _art.puffer_nach_minuten)
      AND b.ende_at + make_interval(mins => b.puffer_nach_minuten)
          > _start - make_interval(mins => _art.puffer_vor_minuten)
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  -- Dieselbe Pruefung gegen die Termine im CRM. Ohne sie liesse sich eine
  -- Zeit buchen, in der laengst ein von Hand angelegtes Meeting steht.
  IF public.buchung_termin_belegt(
    _z.mitarbeiter_id,
    _start - make_interval(mins => _art.puffer_vor_minuten),
    _ende + make_interval(mins => _art.puffer_nach_minuten),
    _zone
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  -- Bremse gegen automatisiertes Zumuellen eines bekannten offenen Links.
  IF (SELECT count(*) FROM public.buchungen b
      WHERE b.mitarbeiter_id = _z.mitarbeiter_id
        AND b.created_at > now() - interval '1 hour') > 20 THEN
    RAISE EXCEPTION 'Zu viele Buchungen, bitte spaeter erneut versuchen';
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', COALESCE(p.name, 'Ihr Ansprechpartner'),
    'email', p.email,
    'telefon', p.telefon,
    'bild', p.avatar_url,
    'position', us.einstellungen -> 'profil' ->> 'position',
    'ort', us.einstellungen -> 'videocall' ->> 'ort',
    'zitat', us.einstellungen -> 'videocall' ->> 'zitat'
  ))
  INTO _abzug
  FROM public.profiles p
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE p.id = _z.mitarbeiter_id;

  -- Beim persoenlichen Link steht der Kontakt am Link. Beim offenen Link ist
  -- er hier noch leer.
  _kontakt_id := _z.kontakt_id;

  _stufe := CASE _art.anlass
    WHEN 'erstgespraech'     THEN 'erstgespraech_geplant'
    WHEN 'beratung'          THEN 'beratungsgespraech'
    WHEN 'objektvorstellung' THEN 'objektauswahl'
    ELSE 'neuer_lead'
  END;

  /*
   * Wiederbucher am offenen Link.
   *
   * Gesucht wird ausdruecklich NICHT im Kontaktbestand, sondern in den
   * frueheren Buchungen desselben offenen Zugangs. Nur ein Kontakt, der selbst
   * ueber diesen Weg entstanden ist, kommt in Frage. Sonst genuegte die
   * Kenntnis einer fremden E-Mail-Adresse, um in eine gewachsene Kundenakte zu
   * schreiben.
   *
   * Die zusaetzliche Bedingung auf `quelle` haelt auch Altdaten fern: Vor
   * dieser Migration konnte eine offene Buchung an einem beliebigen Kontakt
   * haengen.
   */
  IF _kontakt_id IS NULL THEN
    SELECT b.kontakt_id INTO _kontakt_id
    FROM public.buchungen b
    JOIN public.kontakte k ON k.id = b.kontakt_id
    WHERE b.mitarbeiter_id = _z.mitarbeiter_id
      AND b.quelle = 'offen'
      AND b.kontakt_id IS NOT NULL
      AND lower(btrim(COALESCE(b.email, ''))) = _email_sauber
      AND COALESCE(k.geloescht, false) = false
      AND k.quelle = 'Buchungslink'
    ORDER BY b.created_at DESC
    LIMIT 1;
  END IF;

  /*
   * Ist niemand da, entsteht ein Lead. Sonst laege der Termin neben der
   * Pipeline und niemand wuerde ihn dort finden. Die Stufe richtet sich nach
   * dem Anlass der Terminart, damit der Lead gleich in der richtigen Spalte
   * steht.
   */
  IF _kontakt_id IS NULL THEN
    _vorname := split_part(_name_sauber, ' ', 1);
    _nachname := btrim(substr(_name_sauber, length(_vorname) + 1));

    INSERT INTO public.kontakte (
      vorname, nachname, email, telefon, quelle, status,
      berater, zustaendig_id, notizen, meta
    ) VALUES (
      _vorname,
      _nachname,
      _email_sauber,
      left(btrim(COALESCE(_telefon, '')), 40),
      'Buchungslink',
      'neu',
      COALESCE(_abzug ->> 'name', ''),
      _z.mitarbeiter_id,
      CASE WHEN btrim(COALESCE(_nachricht, '')) <> ''
           THEN 'Nachricht aus der Buchung: ' || left(btrim(_nachricht), 2000)
           ELSE '' END,
      jsonb_build_object('pipelineStufe', _stufe)
    ) RETURNING id INTO _kontakt_id;
  ELSE
    -- Bestehender Kontakt: die Stufe darf nur nach vorne.
    PERFORM public.buchung_pipeline_vorwaerts(_kontakt_id, _stufe);
    -- Seit dem 21.09.2026 zieht das Investment mit. Die Pipeline zeigt dessen
    -- Stufe, sobald es eines gibt; ohne diese Zeile sass der Kunde im Termin
    -- zur Objektvorstellung und sein Vorgang stand weiter davor.
    PERFORM public.buchung_investment_vorwaerts(_kontakt_id, _stufe);
  END IF;

  -- ── Videoraum, damit der Kunde nicht auf einen Link warten muss ──
  --
  -- Der Abzug der Beraterdaten entsteht hier genauso wie beim Anlegen von
  -- Hand: Name, Bild und Erreichbarkeit aus dem Profil, Ort und der Satz an
  -- den Kunden aus den Videocall-Einstellungen.
  INSERT INTO public.videoraeume (
    token, art, titel, gastgeber_id, gastgeber_snapshot,
    kontakt_id, termin_at, dauer_minuten, transkript_angeboten
  ) VALUES (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    _art.anlass,
    _art.bezeichnung,
    _z.mitarbeiter_id,
    COALESCE(_abzug, '{}'::jsonb),
    _kontakt_id,
    _start,
    _art.dauer_minuten,
    true
  ) RETURNING * INTO _raum;

  INSERT INTO public.buchungen (
    mitarbeiter_id, terminart_id, link_id, quelle, kontakt_id,
    name, email, telefon, nachricht, begleitung,
    start_at, ende_at, dauer_minuten, puffer_vor_minuten, puffer_nach_minuten,
    bezeichnung, anlass, status, absage_token, videoraum_id
  ) VALUES (
    _z.mitarbeiter_id, _art.id, _z.link_id, _z.art, _kontakt_id,
    _name_sauber, _email_sauber, left(btrim(COALESCE(_telefon, '')), 40),
    left(btrim(COALESCE(_nachricht, '')), 2000), _begleitung_sauber,
    _start, _ende, _art.dauer_minuten, _art.puffer_vor_minuten, _art.puffer_nach_minuten,
    _art.bezeichnung, _art.anlass, 'offen', public.buchung_token(), _raum.id
  ) RETURNING * INTO _buchung;

  -- ── Termin in der Kundenakte, sobald der Kontakt bekannt ist ──
  IF _kontakt_id IS NOT NULL THEN
    INSERT INTO public.aktivitaeten (
      kunde_id, art, beschreibung, details, von, datum,
      prioritaet, faellig_am, uhrzeit, dauer, teilnehmer, zoom_link,
      -- Ohne das gehoert der Termin niemandem, und die Berechnung der freien
      -- Zeiten wuerde ihn dem zustaendigen Berater des Kontakts zurechnen,
      -- nicht dem Gastgeber des Buchungslinks.
      benutzer_id
    ) VALUES (
      _kontakt_id,
      'meeting',
      _art.bezeichnung,
      CASE WHEN btrim(COALESCE(_nachricht, '')) <> ''
           THEN 'Vom Kunden gebucht. Nachricht: ' || left(btrim(_nachricht), 2000)
           ELSE 'Vom Kunden ueber den Buchungslink gebucht.' END
      -- Die Begleitung gehoert in die Akte: Der Berater soll vor dem Termin
      -- wissen, dass eine zweite Person dabei ist.
      || CASE WHEN _begleitung_sauber IS NOT NULL
              THEN E'\nBegleitung: ' || _begl_name || ' <' || _begl_email || '>'
              ELSE '' END,
      COALESCE(_abzug ->> 'name', 'System'),
      now(),
      'mittel',
      (_start AT TIME ZONE _zone)::date,
      to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
      _art.dauer_minuten::text,
      _name_sauber,
      -- Bewusst als Pfad: Die Datenbank kennt die oeffentliche Adresse der
      -- Anwendung nicht, der Browser loest ihn gegen die eigene auf.
      '/raum/' || _raum.token,
      _z.mitarbeiter_id
    ) RETURNING id INTO _aktivitaet_id;

    UPDATE public.buchungen SET aktivitaet_id = _aktivitaet_id WHERE id = _buchung.id;
  END IF;

  RETURN jsonb_build_object(
    'id', _buchung.id,
    'absage_token', _buchung.absage_token,
    'start_at', _buchung.start_at,
    'ende_at', _buchung.ende_at,
    'bezeichnung', _buchung.bezeichnung,
    'dauer_minuten', _buchung.dauer_minuten,
    'zeitzone', _zone,
    'raum_token', _raum.token,
    'anlass', _art.anlass,
    'kontakt_id', _kontakt_id
  );
END;
$$;
