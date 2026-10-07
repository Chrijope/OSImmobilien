-- Buchungsweg: fremde Akten schuetzen, Stufe vorwaerts schieben, Fristen
-- herausgeben, Wochenplan atomar speichern.
--
-- Diese Migration setzt 20260804090000 bis 20260804170000 voraus.
--
-- Sieben Aenderungen, jede mit ihrer eigenen Begruendung weiter unten:
--
--   1. `buchung_anlegen` haengt eine Buchung ueber den OFFENEN Link nicht mehr
--      an einen bestehenden Kontakt.
--   2. Eine Buchung schiebt die Pipelinestufe auch bei bestehenden Kontakten,
--      aber nur vorwaerts.
--   3. `buchung_zugang` gibt `vorausschau_tage` je Terminart heraus.
--   4. `buchung_ansicht` gibt `terminart_id` heraus.
--   5. `buchung_wochenplan_setzen`: loeschen und einfuegen in einer
--      Transaktion.
--   6. `buchung_status_setzen`: der Mitarbeiter kann absagen und als
--      wahrgenommen kennzeichnen, mit derselben Aufraeumarbeit wie bei der
--      Absage durch den Kunden.
--   7. Ein gesperrter Tag laesst sich nicht mehr doppelt anlegen.

-- ---------------------------------------------------------------------------
-- 1) Pipelinestufen als Rangfolge
-- ---------------------------------------------------------------------------
--
-- Die Reihenfolge ist dieselbe wie in `src/lib/pipelineStufen.ts`, in genau
-- deren Anordnung. Sie steht hier ein zweites Mal, weil die Datenbank sie beim
-- Buchen braucht und der Buchende keinen Browser mit geladenem CRM hat.
-- `src/lib/buchungPipelineRang.test.ts` liest diese Datei und vergleicht die
-- Liste mit `PIPELINE_STUFEN`, damit die beiden Stellen nicht auseinander
-- laufen.
--
-- Zwei bewusste Abweichungen von der reinen Listenposition:
--
--   * Die drei Legacy-Aliase am Ende von `PIPELINE_STUFEN` sind keine spaeten
--     Stufen, sondern alte Namen frueher Stufen. Sie bekommen den Rang ihrer
--     heutigen Entsprechung. Mit ihrer Listenposition waere ein Altkontakt in
--     "zugewiesen" fuer immer eingefroren.
--   * Eine unbekannte oder leere Stufe ergibt -1. Damit gilt jede bekannte
--     Stufe als Fortschritt, ein Kontakt ohne gepflegte Stufe bekommt also
--     eine.
CREATE OR REPLACE FUNCTION public.buchung_pipeline_rang(_stufe text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(COALESCE(_stufe, '')))
    WHEN 'neuer_lead'            THEN 0
    WHEN 'nicht_erreicht'        THEN 1
    WHEN 'erreicht'              THEN 2
    WHEN 'follow_up'             THEN 3
    WHEN 'erstgespraech_geplant' THEN 4
    WHEN 'erstgespraech'         THEN 5
    WHEN 'eg_noshow'             THEN 6
    WHEN 'beratungsgespraech'    THEN 7
    WHEN 'bg_noshow'             THEN 8
    WHEN 'selbstauskunft'        THEN 9
    WHEN 'bonitaetsunterlagen'   THEN 10
    WHEN 'objektauswahl'         THEN 11
    WHEN 'reservierung'          THEN 12
    WHEN 'finanzierung'          THEN 13
    WHEN 'notar'                 THEN 14
    WHEN 'faelligkeit'           THEN 15
    WHEN 'abrechnung'            THEN 16
    WHEN 'abgeschlossen'         THEN 17
    WHEN 'bestandsimport'        THEN 18
    WHEN 'archiviert'            THEN 19
    WHEN 'verloren'              THEN 20
    -- Legacy-Aliase, auf ihre heutige Entsprechung abgebildet.
    WHEN 'zugewiesen'            THEN 0
    WHEN 'kontaktversuche'       THEN 2
    WHEN 'vermoegensaufbau'      THEN 3
    ELSE -1
  END
$$;

-- Die Stufe eines Kontakts setzen, aber nur nach vorne.
--
-- Ein Kunde, der in "Finanzierung" steht und noch ein Erstgespraech bucht,
-- weil er einen Bekannten mitbringt, darf dadurch nicht auf "Erstgespraech
-- geplant" zurueckfallen. Die Pipeline ist die Arbeitsliste des Vertriebs, ein
-- Rueckfall dort kostet echte Zeit.
CREATE OR REPLACE FUNCTION public.buchung_pipeline_vorwaerts(_kontakt uuid, _stufe text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _jetzige text;
BEGIN
  IF _kontakt IS NULL OR NULLIF(btrim(COALESCE(_stufe, '')), '') IS NULL THEN
    RETURN false;
  END IF;

  SELECT NULLIF(btrim(COALESCE(k.meta ->> 'pipelineStufe', '')), '')
  INTO _jetzige
  FROM public.kontakte k
  WHERE k.id = _kontakt;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.buchung_pipeline_rang(_stufe) <= public.buchung_pipeline_rang(_jetzige) THEN
    RETURN false;
  END IF;

  UPDATE public.kontakte
  SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('pipelineStufe', _stufe)
  WHERE id = _kontakt;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_pipeline_rang(text) FROM public;
REVOKE ALL ON FUNCTION public.buchung_pipeline_vorwaerts(uuid, text) FROM public;
-- Beide sind reine Hilfsfunktionen der Buchungsstrecke. Sie werden nur aus
-- `buchung_anlegen` heraus aufgerufen, das selbst SECURITY DEFINER ist.

-- ---------------------------------------------------------------------------
-- 2) Buchen: fremde Akten schuetzen, Stufe vorwaerts schieben
-- ---------------------------------------------------------------------------
--
-- Bisher suchte `buchung_anlegen` bei jeder Buchung ueber den offenen Link
-- nach der eingegebenen E-Mail im Kontaktbestand des Mitarbeiters und haengte
-- den Termin an den gefundenen Kontakt. Der offene Link ist aber genau das:
-- offen. Wer ihn kennt und die E-Mail-Adresse eines Kunden kennt, konnte damit
-- einen Termin in dessen Akte legen, den Kalender des Partners blockieren und
-- den "naechsten Termin" des Kunden faelschen. Die E-Mail-Adresse ist kein
-- Geheimnis, sie taugt nicht als Ausweis.
--
-- Neu gilt am offenen Link: Die Buchung legt entweder einen neuen Lead an oder
-- haengt an einem Kontakt, der bereits ueber denselben offenen Link gebucht
-- hat und dadurch selbst erst entstanden ist. Wer zum zweiten Mal bucht,
-- bekommt also weiterhin keinen zweiten Datensatz, aber eine gewachsene
-- Kundenakte bleibt unerreichbar.
--
-- Am persoenlichen Link aendert sich nichts. Dort steht der Kontakt von
-- vornherein am Link, und der Token ist das Geheimnis.
--
-- Zweite Aenderung: Die Pipelinestufe wird jetzt in beiden Faellen gesetzt,
-- nicht mehr nur beim frisch angelegten Lead. Bisher blieb ein Kunde, der
-- ueber seinen persoenlichen Link ein Beratungsgespraech buchte, in seiner
-- alten Stufe stehen. Geschoben wird ausschliesslich nach vorne, siehe
-- `buchung_pipeline_vorwaerts`.
--
-- Der Rest der Funktion ist unveraendert aus 20260804160000 uebernommen.
CREATE OR REPLACE FUNCTION public.buchung_anlegen(
  _token text,
  _terminart_id uuid,
  _start timestamptz,
  _name text,
  _email text,
  _telefon text DEFAULT NULL,
  _nachricht text DEFAULT NULL
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
    name, email, telefon, nachricht,
    start_at, ende_at, dauer_minuten, puffer_vor_minuten, puffer_nach_minuten,
    bezeichnung, anlass, status, absage_token, videoraum_id
  ) VALUES (
    _z.mitarbeiter_id, _art.id, _z.link_id, _z.art, _kontakt_id,
    _name_sauber, _email_sauber, left(btrim(COALESCE(_telefon, '')), 40),
    left(btrim(COALESCE(_nachricht, '')), 2000),
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
           ELSE 'Vom Kunden ueber den Buchungslink gebucht.' END,
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

REVOKE ALL ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Zugang: die eingestellte Vorausschau mit herausgeben
-- ---------------------------------------------------------------------------
--
-- `vorausschau_tage` steht je Terminart in der Datenbank, kam aber nie beim
-- Browser an. Die Buchungsseite zeigte deshalb immer 60 Tage, gleich was
-- eingestellt war. Wer 14 Tage eingestellt hatte, dessen Kunden blaetterten in
-- leeren Wochen; wer 180 Tage wollte, bekam sie nicht.
CREATE OR REPLACE FUNCTION public.buchung_zugang(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z record;
  _profil record;
  _einst record;
  _arten jsonb;
BEGIN
  SELECT * INTO _z FROM public.buchung_zugang_aufloesen(_token);
  IF _z.mitarbeiter_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.name, p.email, p.telefon, p.avatar_url INTO _profil
  FROM public.profiles p WHERE p.id = _z.mitarbeiter_id;

  SELECT e.zeitzone, e.begruessung, e.hinweis INTO _einst
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _z.mitarbeiter_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'bezeichnung', t.bezeichnung,
           'beschreibung', t.beschreibung,
           'dauer_minuten', t.dauer_minuten,
           'vorausschau_tage', t.vorausschau_tage,
           'anlass', t.anlass
         ) ORDER BY t.sortierung, t.bezeichnung), '[]'::jsonb)
  INTO _arten
  FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = _z.mitarbeiter_id
    AND t.aktiv
    -- Am offenen Link erscheinen nur die oeffentlichen Terminarten.
    AND (_z.art = 'persoenlich' OR t.oeffentlich)
    -- Ist der Link auf eine Terminart festgelegt, gibt es nur diese.
    AND (_z.terminart_id IS NULL OR t.id = _z.terminart_id);

  RETURN jsonb_build_object(
    'art', _z.art,
    'berater', jsonb_build_object(
      'name', COALESCE(_profil.name, ''),
      'email', _profil.email,
      'telefon', _profil.telefon,
      'bild', _profil.avatar_url
    ),
    'zeitzone', COALESCE(_einst.zeitzone, 'Europe/Berlin'),
    'begruessung', _einst.begruessung,
    'hinweis', _einst.hinweis,
    'kontakt_bekannt', _z.kontakt_id IS NOT NULL,
    'vorbelegung', CASE WHEN _z.art = 'persoenlich'
                        THEN COALESCE(_z.kontakt_snapshot, '{}'::jsonb)
                        ELSE '{}'::jsonb END,
    'terminarten', _arten
  );
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_zugang(text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_zugang(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Ansicht: die Kennung der Terminart mit herausgeben
-- ---------------------------------------------------------------------------
--
-- Zum Verschieben braucht die Verwaltungsseite die Terminart des Termins.
-- Weil `buchung_ansicht` ihre Kennung nicht herausgab, musste der Browser sie
-- ueber Bezeichnung und Dauer erraten. Nach einer Umbenennung der Terminart
-- ging das Raten schief und der Knopf "Termin verschieben" blieb gesperrt,
-- ohne dass der Kunde erfahren haette, warum.
--
-- Die Kennung ist kein Geheimnis: Sie steht ohnehin in jeder Antwort von
-- `buchung_zugang`, und ohne gueltigen Zugangstoken laesst sich mit ihr
-- nichts anfangen.
CREATE OR REPLACE FUNCTION public.buchung_ansicht(_absage_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'status', b.status,
    'start_at', b.start_at,
    'ende_at', b.ende_at,
    'dauer_minuten', b.dauer_minuten,
    'bezeichnung', b.bezeichnung,
    'anlass', b.anlass,
    'terminart_id', b.terminart_id,
    'name', b.name,
    'email', b.email,
    'berater', jsonb_build_object('name', COALESCE(p.name, ''), 'email', p.email, 'telefon', p.telefon),
    'zeitzone', COALESCE(e.zeitzone, 'Europe/Berlin')
  )
  FROM public.buchungen b
  LEFT JOIN public.profiles p ON p.id = b.mitarbeiter_id
  LEFT JOIN public.buchung_einstellungen e ON e.mitarbeiter_id = b.mitarbeiter_id
  WHERE b.absage_token = _absage_token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.buchung_ansicht(text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_ansicht(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Wochenplan in einem Stueck speichern
-- ---------------------------------------------------------------------------
--
-- Der Browser hat den Wochenplan bisher in zwei Schritten ersetzt: erst alle
-- Wochenregeln loeschen, dann die neuen einfuegen. Scheiterte der zweite
-- Schritt, etwa weil das Netz wegbrach, blieb der Mitarbeiter ohne jede
-- Verfuegbarkeit zurueck und niemand konnte mehr bei ihm buchen. Ausgerechnet
-- der stille Fehlerfall war der schlimmste.
--
-- Als Funktion laeuft beides in einer Transaktion: geht das Einfuegen schief,
-- ist auch das Loeschen zurueckgenommen und der alte Plan steht noch.
--
-- Bewusst OHNE SECURITY DEFINER. Der Aufrufer ist ein angemeldeter
-- Mitarbeiter, es sollen genau seine RLS-Regeln greifen. Geschrieben wird
-- ohnehin nur fuer `auth.uid()`.
CREATE OR REPLACE FUNCTION public.buchung_wochenplan_setzen(_zeilen jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _ich uuid := auth.uid();
  _anzahl integer := 0;
BEGIN
  IF _ich IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;
  IF _zeilen IS NULL OR jsonb_typeof(_zeilen) <> 'array' THEN
    RAISE EXCEPTION 'Der Wochenplan muss eine Liste sein';
  END IF;

  -- Ausnahmen und Urlaub bleiben unberuehrt, die haben ein `datum`.
  DELETE FROM public.buchung_verfuegbarkeiten
  WHERE mitarbeiter_id = _ich AND datum IS NULL;

  INSERT INTO public.buchung_verfuegbarkeiten (mitarbeiter_id, wochentag, von, bis)
  SELECT _ich,
         (z ->> 'wochentag')::smallint,
         (z ->> 'von')::time,
         (z ->> 'bis')::time
  FROM jsonb_array_elements(_zeilen) AS z;

  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  RETURN _anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_wochenplan_setzen(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_wochenplan_setzen(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Der Mitarbeiter sagt ab oder hakt ab
-- ---------------------------------------------------------------------------
--
-- Eine Buchung liess sich bisher nur vom Kunden absagen, ueber
-- `buchung_absagen` mit seinem Absagetoken. Der Partner selbst hatte keinen
-- Weg. Ein schlichtes UPDATE auf `buchungen.status` waere zwar durch RLS
-- gedeckt, wuerde aber den Videoraum offen und den Termin in der Kundenakte
-- stehen lassen, und die Zeit bliebe gesperrt. Deshalb dieselbe
-- Aufraeumarbeit wie in 20260804170000, nur mit einer anderen Tuer.
--
-- SECURITY DEFINER, weil die Funktion in `videoraeume` und `aktivitaeten`
-- schreibt. Die Berechtigung wird gleich zu Beginn selbst geprueft und
-- entspricht der UPDATE-Policy auf `buchungen`.
CREATE OR REPLACE FUNCTION public.buchung_status_setzen(_buchung_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _buchung public.buchungen;
BEGIN
  IF _status NOT IN ('offen', 'abgesagt', 'wahrgenommen') THEN
    RAISE EXCEPTION 'Unbekannter Status';
  END IF;

  SELECT * INTO _buchung FROM public.buchungen WHERE id = _buchung_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diese Buchung gibt es nicht';
  END IF;

  IF NOT (_buchung.mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid())) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diese Buchung';
  END IF;

  IF _buchung.status = _status THEN
    RETURN jsonb_build_object('id', _buchung.id, 'status', _buchung.status);
  END IF;

  UPDATE public.buchungen b
  SET status = _status,
      abgesagt_at = CASE WHEN _status = 'abgesagt' THEN now() ELSE b.abgesagt_at END
  WHERE b.id = _buchung.id
  RETURNING * INTO _buchung;

  IF _status = 'abgesagt' THEN
    IF _buchung.videoraum_id IS NOT NULL THEN
      UPDATE public.videoraeume
      SET status = 'beendet'
      WHERE id = _buchung.videoraum_id
        AND status <> 'beendet';
    END IF;

    IF _buchung.aktivitaet_id IS NOT NULL THEN
      UPDATE public.aktivitaeten a
      SET erledigt_am = COALESCE(a.erledigt_am, now()),
          beschreibung = CASE
            WHEN COALESCE(a.beschreibung, '') LIKE 'Abgesagt:%' THEN a.beschreibung
            ELSE 'Abgesagt: ' || COALESCE(NULLIF(btrim(a.beschreibung), ''), 'Termin')
          END,
          details = COALESCE(a.details, '') || E'\nVom Ansprechpartner abgesagt.'
      WHERE a.id = _buchung.aktivitaet_id;
    END IF;
  END IF;

  -- Ein wahrgenommener Termin ist vorbei. Bliebe er in der Akte offen, waere
  -- er dort weiterhin der "naechste Termin" des Kunden.
  IF _status = 'wahrgenommen' AND _buchung.aktivitaet_id IS NOT NULL THEN
    UPDATE public.aktivitaeten a
    SET erledigt_am = COALESCE(a.erledigt_am, now())
    WHERE a.id = _buchung.aktivitaet_id;
  END IF;

  RETURN jsonb_build_object('id', _buchung.id, 'status', _buchung.status);
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_status_setzen(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_status_setzen(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Ein gesperrter Tag nur einmal
-- ---------------------------------------------------------------------------
--
-- Derselbe Urlaubstag liess sich beliebig oft anlegen. In der Liste stand er
-- dann mehrfach, und wer ihn entfernte, hob nur eine der Zeilen auf: Der Tag
-- blieb gesperrt, ohne dass sichtbar war warum.
--
-- Der eindeutige Index gilt fuer alle Zeilen mit `datum`, nicht nur fuer die
-- geschlossenen. Ein Tag ist entweder ausgenommen oder nicht, zwei
-- Ausnahmezeilen fuer denselben Tag waeren auch dann mehrdeutig, wenn eine
-- davon Uhrzeiten traegt: `buchung_freie_zeiten` nimmt die offenen Fenster und
-- ignoriert die geschlossene Zeile, der Tag waere also trotz Sperre buchbar.
--
-- Vorher wird entdoppelt, sonst laesst sich der Index nicht anlegen. Behalten
-- wird je Mitarbeiter und Tag die aelteste Zeile, das ist die zuerst gesetzte
-- Absicht. Geloescht werden ausschliesslich Zeilen, die es fachlich gar nicht
-- geben durfte.
DELETE FROM public.buchung_verfuegbarkeiten v
WHERE v.datum IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.buchung_verfuegbarkeiten a
    WHERE a.mitarbeiter_id = v.mitarbeiter_id
      AND a.datum = v.datum
      AND (a.created_at, a.id) < (v.created_at, v.id)
  );

-- Ersetzt den bisherigen, nicht eindeutigen Index ueber dieselben Spalten mit
-- derselben Bedingung.
DROP INDEX IF EXISTS public.buchung_verfuegbarkeiten_datum_idx;

CREATE UNIQUE INDEX IF NOT EXISTS buchung_verfuegbarkeiten_datum_uniq
  ON public.buchung_verfuegbarkeiten (mitarbeiter_id, datum)
  WHERE datum IS NOT NULL;
