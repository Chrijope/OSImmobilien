-- ===========================================================================
-- Ein Bewerbergespraech ueber den Buchungslink legt keinen Lead mehr an
-- ===========================================================================
--
-- DER BEFUND
--
-- Andreas Bachmeier liegt seit dem 16.09.2026 doppelt im System: als
-- BEWERBUNG vom 03.09.2026 und zusaetzlich als KONTAKT in der Kundenpipeline,
-- Quelle "Buchungslink", zustaendig die HR-Managerin. Entstanden ist der
-- zweite Datensatz, als er sich ueber den Buchungslink einen Termin gebucht
-- hat. Die Buchung traegt den Anlass 'bewerbergespraech' und haengt trotzdem
-- an einem Kontakt.
--
-- Folgen, alle am 16.09.2026 gemeldet:
--   - Der Bewerber steht unter "Alle Kontakte", wo er nicht hingehoert.
--   - Sein Termin fehlt im Bewerberprozess unter "Videocall-Termin".
--   - Er rutscht nicht ins Closing, obwohl sein Termin feststeht.
--
-- DIE URSACHE
--
-- `buchung_anlegen` ist der Weg fuer Buchungslinks, den offenen wie den
-- persoenlichen. Sie legt zu jeder Buchung einen Kontakt an und setzt ihm eine
-- Pipelinestufe nach dem Anlass der Terminart. Der Bewerberprozess kommt darin
-- nicht vor: 'bewerbergespraech' faellt in den Zweig ELSE und wird zu
-- 'neuer_lead'.
--
-- Der Bewerber-Weg `bewerber_termin_buchen` (20260906120000, zuletzt
-- 20260916210000) macht es laengst richtig. Er laesst `kontakt_id`
-- ausdruecklich leer, mit dem Kommentar "Ein Bewerber ist kein Kontakt",
-- schreibt Datum und Uhrzeit an die Bewerbung und hebt die Stufe ueber
-- `bewerber_stufe_closing`. Nur der Weg ueber den Buchungslink tat nichts
-- davon. Dieselbe Luecke, dieselbe Stelle wie gestern bei der Stufe und am
-- 12.09.2026 beim Erinnerungszaehler.
--
-- WORAN DIE DATENBANK EIN BEWERBERGESPRAECH ERKENNT
--
-- Am Anlass der Terminart, `buchung_terminarten.anlass = 'bewerbergespraech'`,
-- und an nichts sonst.
--
-- Bewusst NICHT an der Rolle des Gastgebers. Die Rolle `hr` ist seit dem
-- 10.09.2026 Bedingung dafuer, wer Gastgeberin der Selbstbuchung ist
-- (`bewerber_termin_gastgeber`), aber sie ist keine Bedingung dafuer, wer eine
-- Terminart mit diesem Anlass besitzt: Die Terminart "Bewerbergespräch" wurde
-- am 06.09.2026 an die Rolle `hr` UND an die Administratoren verteilt, damit
-- der Ablauf durchgespielt werden kann. Wuerde hier zusaetzlich `hr` verlangt,
-- bekaeme ein Bewerber, der bei einem Administrator bucht, wieder einen Lead.
-- Genau der Fehler, den diese Migration behebt, nur seltener und damit noch
-- schwerer zu finden.
--
-- Bewusst NICHT an der E-Mail-Adresse. Ob es zu einer Adresse eine Bewerbung
-- gibt, entscheidet nicht, was fuer ein Termin das ist. Die E-Mail wird nur
-- gebraucht, um die passende Bewerbung zu FINDEN, nicht um den Termin
-- einzuordnen.
--
-- Der Anlass haengt am Termin selbst, er ist eine Angabe und keine Vermutung
-- ueber Personen, und er gilt fuer jeden Weg gleich: offener Link,
-- persoenlicher Link, jeder Gastgeber.
--
-- WAS SICH AENDERT
--
-- 1. `buchung_anlegen` erkennt den Anlass 'bewerbergespraech'. Dann gilt:
--    - Es entsteht KEIN Kontakt, und ein am persoenlichen Link haengender
--      Kontakt wird bewusst nicht uebernommen. `buchungen.kontakt_id` bleibt
--      leer, ebenso `videoraeume.kontakt_id`. Es entsteht auch kein Eintrag in
--      `aktivitaeten`, denn ein Termineintrag braucht eine Kundenakte.
--    - Ueber die E-Mail wird die passende Bewerbung gesucht und als
--      `buchungen.bewerbung_id` gesetzt.
--    - Datum, Uhrzeit und Beraterin gehen an die Bewerbung, in genau die drei
--      Felder, die auch `bewerber_termin_buchen` schreibt:
--      `meta.erstgespraechDatum`, `meta.erstgespraechUhrzeit`,
--      `meta.erstgespraechBerater`. Kein viertes Feld, damit nicht zwei Wege
--      verschiedene Stellen fuellen.
--    - `bewerber_stufe_closing` hebt die Stufe, und zwar nur nach vorn.
--
-- 2. Ein Nachtrag haengt die Altfaelle um, siehe Abschnitt 3.
--
-- WENN ES ZU DER E-MAIL KEINE BEWERBUNG GIBT
--
-- Dann entsteht der Termin trotzdem, aber ohne Kontakt UND ohne Bewerbung. Er
-- steht im Kalender der Gastgeberin und in ihrer Terminliste, sonst nirgends.
--
-- Die drei Moeglichkeiten und warum es diese geworden ist:
--
--   - Wie bisher einen Lead anlegen: Das ist genau der Fehler. Ein Bewerber
--     gehoert nie in die Kundenpipeline, auch dann nicht, wenn seine Bewerbung
--     gerade nicht auffindbar ist.
--   - Die Buchung abweisen: Zu hart. Wer von HR von Hand eingeladen wurde und
--     den Kennenlernbogen nie ausgefuellt hat, hat keine Zeile in
--     `bewerbungen`. Er saehe eine Fehlermeldung, haette keinen Termin, und HR
--     erfuehre nichts davon.
--   - Eine Bewerbung selbst anlegen: Damit waere der offene Link ein
--     Schreibzugang in den Bewerbertrichter. Wer ihn kennt, koennte Bewerbungen
--     erfinden. Ausserdem stuende dort eine Bewerbung ohne ausgefuellten Bogen,
--     mit der weder die Einladung noch die Dauerberechnung etwas anfangen kann.
--
-- Der Termin bleibt also stehen, weil er wirklich gebucht wurde, und er bleibt
-- dort sichtbar, wo ihn jemand sieht: bei der Gastgeberin.
--
-- WAS SICH NICHT AENDERT
--
-- `bewerber_stufe_closing` wird hier NICHT neu angelegt. Am 16.09.2026 haben
-- zwei Migrationen dieselbe Funktion per CREATE OR REPLACE geschrieben, mit
-- verschiedenen Statuslisten; in falscher Reihenfolge haette die eine die
-- andere still ueberschrieben. Diese Migration ruft sie nur.
--
-- Die Terminart "Bewerbergespräch" bleibt, wie sie ist. Ob sie im offenen Link
-- auftaucht, entscheidet weiterhin ihr Feld `oeffentlich`. Diese Migration
-- sperrt keinen Weg, sie ordnet nur richtig zu. Das ist der Auftrag: Alles,
-- was ueber den Buchungslink als Bewerbergespraech laeuft, gehoert dem
-- Bewerber.
--
-- Die Dauer richtet sich beim Buchungslink weiter nach der Terminart. Die
-- verkuerzte Dauer aus den Antworten des Bogens (`bewerber_termin_dauer`)
-- gibt es nur beim Bewerber-Weg, denn nur dort ist der Bogen bekannt.
--
-- Wiederholbar: Die Funktion wird ersetzt, der Nachtrag findet beim zweiten
-- Lauf nichts mehr. Bricht nicht ab, wenn eine Tabelle fehlt.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Nachsehen, ob das Werkzeug da ist
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Nur ein Hinweis, kein Abbruch, wie in 20260916220000. Fehlt eines der
-- beiden Stuecke, wirkt diese Migration nur halb, und zwar lautlos.

DO $$
BEGIN
  IF to_regprocedure('public.bewerber_stufe_closing(uuid)') IS NULL THEN
    RAISE NOTICE 'bewerber_stufe_closing fehlt. Bitte zuerst 20260916210000_bewerber_selbstbuchung_ins_closing.sql ausfuehren, sonst hebt keine Buchung ueber den Buchungslink die Stufe.';
  END IF;

  IF to_regclass('public.buchungen') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'buchungen'
         AND column_name = 'bewerbung_id'
     ) THEN
    RAISE NOTICE 'Die Spalte buchungen.bewerbung_id fehlt. Bitte zuerst 20260906120000_bewerber_terminbuchung.sql ausfuehren.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Die Buchung ueber den Link kennt jetzt den Bewerberprozess
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Fassung von 20260827190000 (schoene Termin-Links), unveraendert bis auf die
-- markierten Stellen. Die Signatur bleibt gleich, deshalb genuegt CREATE OR
-- REPLACE ohne vorheriges DROP.

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
  -- Neu: Ist das ein Bewerbergespraech, und zu welcher Bewerbung gehoert es?
  _ist_bewerbergespraech boolean;
  _bewerbung_id uuid;
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

  /*
   * Das eine Merkmal, an dem alles Weitere haengt.
   *
   * COALESCE, weil `anlass` leer sein kann: `'' = 'bewerbergespraech'` ist
   * false, `NULL = 'bewerbergespraech'` waere NULL, und ein IF auf NULL wird
   * uebersprungen. Der Zweig fiele damit stillschweigend aus.
   */
  _ist_bewerbergespraech := COALESCE(_art.anlass, '') = 'bewerbergespraech';

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

  IF _ist_bewerbergespraech THEN
    /*
     * ── Der Bewerberzweig, neu am 16.09.2026 ──
     *
     * Kein Kontakt. Auch dann nicht, wenn am persoenlichen Link einer haengt:
     * Ein Bewerbergespraech gehoert dem Bewerber, und zwar auf jedem Weg. Das
     * ist die Anweisung vom 16.09.2026, wortwoertlich "alles, was ueber
     * Sarahs Buchungslink laeuft, immer dem Bewerber im Bewerberprozess
     * zugeordnet".
     *
     * Gesucht wird ueber die E-Mail. Sind es mehrere Bewerbungen zur selben
     * Adresse, gewinnt die juengste, die noch im Rennen ist: Eine abgelehnte
     * Bewerbung oder eine ohne Interesse steht hinten an, sonst haengte ein
     * neuer Termin an einer abgeschlossenen Akte.
     *
     * Findet sich keine, bleibt `_bewerbung_id` leer. Der Termin entsteht
     * trotzdem, ohne Kontakt und ohne Bewerbung. Warum, steht im Kopf dieser
     * Datei.
     */
    _kontakt_id := NULL;

    SELECT b.id INTO _bewerbung_id
    FROM public.bewerbungen b
    WHERE lower(btrim(COALESCE(b.email, ''))) = _email_sauber
    ORDER BY (COALESCE(b.status, '') IN ('Abgelehnt', 'KeinInteresse')),
             b.erstellt_am DESC NULLS LAST
    LIMIT 1;
  ELSE
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
  END IF;

  -- ── Videoraum, damit der Kunde nicht auf einen Link warten muss ──
  --
  -- Der Abzug der Beraterdaten entsteht hier genauso wie beim Anlegen von
  -- Hand: Name, Bild und Erreichbarkeit aus dem Profil, Ort und der Satz an
  -- den Kunden aus den Videocall-Einstellungen.
  --
  -- `kontakt_id` ist beim Bewerbergespraech leer, genau wie in
  -- `bewerber_termin_buchen`. Ein Bewerber ist kein Kontakt.
  INSERT INTO public.videoraeume (
    token, art, titel, gastgeber_id, gastgeber_snapshot,
    kontakt_id, termin_at, dauer_minuten, transkript_angeboten
  ) VALUES (
    -- Lesbarer Raumlink: Terminereignis plus kurzer Schluessel. Der
    -- Zufallsteil (16 Hexzeichen) bleibt der eigentliche Schutz, das
    -- Ereignis davor macht den Link fuer den Kunden verstaendlich.
    -- Bewusst ohne Kundennamen, Namen gehoeren nicht in Adressen.
    lower(regexp_replace(
      CASE _art.anlass WHEN 'beratung' THEN 'beratungsgespraech' ELSE _art.anlass END,
      '[^a-z]', '', 'g'))
      || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
    _art.anlass,
    _art.bezeichnung,
    _z.mitarbeiter_id,
    COALESCE(_abzug, '{}'::jsonb),
    _kontakt_id,
    _start,
    _art.dauer_minuten,
    true
  ) RETURNING * INTO _raum;

  -- Neu: `bewerbung_id` steht mit in der Buchung. Beim Kundentermin ist sie
  -- leer, beim Bewerbergespraech traegt sie den Bezug, den sonst `kontakt_id`
  -- traegt.
  INSERT INTO public.buchungen (
    mitarbeiter_id, terminart_id, link_id, quelle, kontakt_id, bewerbung_id,
    name, email, telefon, nachricht, begleitung,
    start_at, ende_at, dauer_minuten, puffer_vor_minuten, puffer_nach_minuten,
    bezeichnung, anlass, status, absage_token, videoraum_id
  ) VALUES (
    _z.mitarbeiter_id, _art.id, _z.link_id, _z.art, _kontakt_id, _bewerbung_id,
    _name_sauber, _email_sauber, left(btrim(COALESCE(_telefon, '')), 40),
    left(btrim(COALESCE(_nachricht, '')), 2000), _begleitung_sauber,
    _start, _ende, _art.dauer_minuten, _art.puffer_vor_minuten, _art.puffer_nach_minuten,
    _art.bezeichnung, _art.anlass, 'offen', public.buchung_token(), _raum.id
  ) RETURNING * INTO _buchung;

  -- ── Termin in der Kundenakte, sobald der Kontakt bekannt ist ──
  --
  -- Beim Bewerbergespraech ist `_kontakt_id` leer, es entsteht also kein
  -- Eintrag. Das ist gewollt: Ein Termineintrag braucht eine Kundenakte, und
  -- der Bewerberprozess fuehrt seine Termine selbst.
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

  /*
   * ── Der Termin gehoert an die Bewerbung ──
   *
   * Genau die drei Felder, die `bewerber_termin_buchen` schreibt, und kein
   * viertes: `bewerberToDb` in src/lib/bewerbungStore.ts baut `meta` bei jedem
   * Speichern aus den bekannten Feldern neu auf. Ein Schluessel daneben waere
   * beim naechsten Speichern in der Akte verschwunden.
   *
   * Nach `closingTerminDatum` wird bewusst NICHT zusaetzlich geschrieben,
   * sonst stuende der Termin zweimal in der Akte und die Erinnerungskette
   * ginge zweimal hinaus. Siehe den Kopf von 20260916210000.
   *
   * `erstgespraechRemindersSent` faellt weg, wie beim Verschieben: Hatte der
   * Bewerber schon einen Termin und bucht ueber den Link einen weiteren, haelt
   * der Zaehler sonst die Anstoesse fuer erledigt und der neue Termin bliebe
   * ohne Erinnerung.
   */
  IF _ist_bewerbergespraech AND _bewerbung_id IS NOT NULL THEN
    UPDATE public.bewerbungen
       SET meta = (COALESCE(meta, '{}'::jsonb) - 'erstgespraechRemindersSent')
                  || jsonb_build_object(
                       'erstgespraechDatum', to_char(_start AT TIME ZONE _zone, 'YYYY-MM-DD'),
                       'erstgespraechUhrzeit', to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
                       'erstgespraechBerater', COALESCE(_abzug ->> 'name', ''))
     WHERE id = _bewerbung_id;

    -- Mit dem Termin steht der Bewerber im Closing. Nur nach vorn, das
    -- entscheidet `bewerber_stufe_closing` selbst. Hinter der Pruefung, damit
    -- eine Buchung nicht scheitert, solange 20260916210000 nicht gelaufen ist.
    IF to_regprocedure('public.bewerber_stufe_closing(uuid)') IS NOT NULL THEN
      PERFORM public.bewerber_stufe_closing(_bewerbung_id);
    END IF;
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
    'kontakt_id', _kontakt_id,
    -- Neu, damit der Aufrufer sieht, ob der Termin im Bewerberprozess
    -- angekommen ist. Leer trotz Bewerbergespraech heisst: zu dieser Adresse
    -- gibt es keine Bewerbung.
    'bewerbung_id', _bewerbung_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text, jsonb) IS
  'Buchung ueber einen Buchungslink. Beim Anlass bewerbergespraech entsteht kein Kontakt: Der Termin haengt ueber die E-Mail an der Bewerbung und hebt die Stufe auf Closing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Nachtrag: die Altfaelle umhaengen
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Gesucht sind Buchungen mit dem Anlass 'bewerbergespraech', die an einem
-- Kontakt haengen statt an einer Bewerbung. Mindestens Andreas Bachmeier,
-- moeglicherweise mehr.
--
-- WAS DER NACHTRAG TUT
--
--   - Er setzt `bewerbung_id` auf die ueber die E-Mail gefundene Bewerbung und
--     loest `kontakt_id`. Ebenso am Videoraum.
--   - Er loest `aktivitaet_id`: Der Termin gehoert nicht mehr in die
--     Kundenakte. Der Termineintrag dort bleibt stehen, er wird nur nicht mehr
--     von der Buchung gefuehrt.
--   - Datum, Uhrzeit und Beraterin gehen an die Bewerbung, und die Stufe wird
--     gehoben, aber NUR bei offenen, noch bevorstehenden Terminen. Ein Termin,
--     der laengst vorbei ist, wird nicht nachgetragen: Steht der Bewerber noch
--     im Eingang, hat HR ihn nach dem Gespraech absichtlich dort gelassen, oder
--     er ist nicht erschienen. Das nachtraeglich umzuschreiben waere eine
--     Behauptung ueber die Vergangenheit. Dieselbe Regel wie in 20260916210000.
--
-- WAS DER NACHTRAG NICHT TUT
--
-- Er loescht keinen Kontakt. Die falsch angelegten Kontakte bleiben stehen und
-- werden am Ende als Hinweis ausgegeben. An ihnen koennen inzwischen
-- Aktivitaeten, Aufgaben oder Notizen haengen, und ein geloeschter Kontakt
-- laesst sich nicht zurueckholen. Ueber jeden einzelnen entscheidet Christian.
--
-- Findet sich zu einer Buchung keine Bewerbung, bleibt sie unangetastet und
-- wird ebenfalls gemeldet. Ihren Kontakt zu loesen waere hier schlimmer als
-- ihn zu lassen: Der Termin haette dann gar keinen Bezug mehr.

DO $$
DECLARE
  _vorher integer := 0;
  _nachher integer := 0;
  _umgehaengt integer := 0;
  _ohne_bewerbung integer := 0;
  _zeile record;
BEGIN
  -- Fehlt eine der Tabellen, ist hier nichts zu tun. Kein Abbruch: Eine
  -- Migration darf nicht voraussetzen, dass jede fremde Tabelle schon da ist.
  IF to_regclass('public.buchungen') IS NULL
     OR to_regclass('public.bewerbungen') IS NULL THEN
    RAISE NOTICE 'Nachtrag uebersprungen: buchungen oder bewerbungen fehlt.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'buchungen'
      AND column_name = 'bewerbung_id'
  ) THEN
    RAISE NOTICE 'Nachtrag uebersprungen: die Spalte buchungen.bewerbung_id fehlt.';
    RETURN;
  END IF;

  -- Zaehler vorher
  SELECT count(*) INTO _vorher
  FROM public.buchungen b
  WHERE COALESCE(b.anlass, '') = 'bewerbergespraech'
    AND b.kontakt_id IS NOT NULL
    AND b.bewerbung_id IS NULL;

  RAISE NOTICE 'Vorher: % Bewerbergespraech(e) haengen an einem Kontakt statt an einer Bewerbung.', _vorher;

  -- Eine Zeile je betroffener Buchung, mit der gefundenen Bewerbung.
  -- Gesucht wird ueber die E-Mail der Buchung, ersatzweise ueber die des
  -- Kontakts: Bei einer Buchung aus der Zeit vor der E-Mail-Pflicht kann sie
  -- leer sein.
  FOR _zeile IN
    SELECT b.id AS buchung_id,
           b.kontakt_id,
           b.videoraum_id,
           b.status,
           b.start_at,
           (SELECT p.name FROM public.profiles p WHERE p.id = b.mitarbeiter_id) AS gastgeber_name,
           -- Beide Adressen leer ergibt NULL, und ein Vergleich gegen NULL
           -- liefert NULL, also keine Zeile. Ohne das NULLIF stuende hier ein
           -- leerer Text, und der faende jede Bewerbung ohne E-Mail.
           (SELECT w.id
              FROM public.bewerbungen w
             WHERE lower(btrim(COALESCE(w.email, ''))) = COALESCE(
                     NULLIF(lower(btrim(COALESCE(b.email, ''))), ''),
                     NULLIF(lower(btrim(COALESCE(k.email, ''))), ''))
             ORDER BY (COALESCE(w.status, '') IN ('Abgelehnt', 'KeinInteresse')),
                      w.erstellt_am DESC NULLS LAST
             LIMIT 1) AS bewerbung_id
      FROM public.buchungen b
      LEFT JOIN public.kontakte k ON k.id = b.kontakt_id
     WHERE COALESCE(b.anlass, '') = 'bewerbergespraech'
       AND b.kontakt_id IS NOT NULL
       AND b.bewerbung_id IS NULL
     ORDER BY b.start_at
  LOOP
    IF _zeile.bewerbung_id IS NULL THEN
      _ohne_bewerbung := _ohne_bewerbung + 1;
      RAISE NOTICE 'Buchung % vom % bleibt unangetastet: zu ihrer E-Mail gibt es keine Bewerbung.',
        _zeile.buchung_id, _zeile.start_at;
      CONTINUE;
    END IF;

    UPDATE public.buchungen
       SET bewerbung_id = _zeile.bewerbung_id,
           kontakt_id = NULL,
           aktivitaet_id = NULL
     WHERE id = _zeile.buchung_id;

    IF to_regclass('public.videoraeume') IS NOT NULL AND _zeile.videoraum_id IS NOT NULL THEN
      UPDATE public.videoraeume SET kontakt_id = NULL WHERE id = _zeile.videoraum_id;
    END IF;

    -- Nur der offene, noch bevorstehende Termin traegt sich in die Akte ein
    -- und hebt die Stufe. Beide Bedingungen in COALESCE: Ein leerer Wert
    -- ergaebe NULL, und ein IF auf NULL wird uebersprungen. Hier faellt das
    -- zwar auf die sichere Seite, aber es soll nicht vom Zufall abhaengen.
    --
    -- Die Zeitzone steht fest auf Europe/Berlin statt aus den Einstellungen
    -- der Gastgeberin gelesen zu werden. Es ist ein einmaliger Nachtrag ueber
    -- wenige Zeilen, und alle Gastgeber sitzen in Deutschland.
    IF COALESCE(_zeile.status, '') = 'offen'
       AND COALESCE(_zeile.start_at >= now(), false) THEN
      UPDATE public.bewerbungen w
         SET meta = (COALESCE(w.meta, '{}'::jsonb) - 'erstgespraechRemindersSent')
                    || jsonb_build_object(
                         'erstgespraechDatum',
                         to_char(_zeile.start_at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD'),
                         'erstgespraechUhrzeit',
                         to_char(_zeile.start_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI'),
                         'erstgespraechBerater', COALESCE(_zeile.gastgeber_name, ''))
       WHERE w.id = _zeile.bewerbung_id;

      IF to_regprocedure('public.bewerber_stufe_closing(uuid)') IS NOT NULL THEN
        PERFORM public.bewerber_stufe_closing(_zeile.bewerbung_id);
      END IF;
    END IF;

    _umgehaengt := _umgehaengt + 1;

    RAISE NOTICE 'Buchung % umgehaengt auf Bewerbung %. Der Kontakt % ist dadurch ohne Termin und will angesehen werden.',
      _zeile.buchung_id, _zeile.bewerbung_id, _zeile.kontakt_id;
  END LOOP;

  -- Zaehler nachher
  SELECT count(*) INTO _nachher
  FROM public.buchungen b
  WHERE COALESCE(b.anlass, '') = 'bewerbergespraech'
    AND b.kontakt_id IS NOT NULL
    AND b.bewerbung_id IS NULL;

  RAISE NOTICE 'Nachher: % umgehaengt, % ohne passende Bewerbung liegen geblieben, % offen.',
    _umgehaengt, _ohne_bewerbung, _nachher;
  RAISE NOTICE 'Kein Kontakt wurde geloescht. Die oben genannten Kontakte pruefst du bitte von Hand.';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Zum Nachsehen von Hand
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Welche Kontakte sind durch den Nachtrag ohne Bewerbergespraech geblieben?
-- Sie stammen aus dem Buchungslink, tragen dieselbe E-Mail wie eine Bewerbung
-- und haengen an keiner Buchung mehr:
--
--   select k.id, k.vorname, k.nachname, k.email, k.erstellt_am,
--          k.meta ->> 'pipelineStufe' as stufe,
--          (select count(*) from public.aktivitaeten a where a.kunde_id = k.id::text) as eintraege
--     from public.kontakte k
--    where k.quelle = 'Buchungslink'
--      and coalesce(k.geloescht, false) = false
--      and exists (select 1 from public.bewerbungen w
--                   where lower(btrim(coalesce(w.email, ''))) = lower(btrim(coalesce(k.email, ''))))
--      and not exists (select 1 from public.buchungen b where b.kontakt_id = k.id)
--    order by k.erstellt_am desc;
--
-- Und die Gegenprobe im Bewerberprozess:
--
--   select w.vorname, w.nachname, w.status,
--          w.meta ->> 'erstgespraechDatum' as termin_datum,
--          w.meta ->> 'erstgespraechUhrzeit' as termin_uhrzeit,
--          b.start_at, b.status as buchung
--     from public.bewerbungen w
--     join public.buchungen b on b.bewerbung_id = w.id
--    where coalesce(b.anlass, '') = 'bewerbergespraech'
--    order by b.start_at desc;
