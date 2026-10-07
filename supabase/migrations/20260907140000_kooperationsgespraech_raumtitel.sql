-- ===========================================================================
-- Der Videoraum heisst "Kooperationsgespräch · Vorname Nachname"
-- ===========================================================================
--
-- Bucht ein Bewerber am Ende des Kennenlernens seinen Termin, legt
-- `bewerber_termin_buchen` einen Videoraum an. Der erscheint in der Sidebar
-- unter Videocall, "Meine Gespräche". Bisher trug er die Bezeichnung der
-- Terminart, also fuer jeden Bewerber dasselbe Wort. Wer zwei Termine an einem
-- Tag hatte, sah zweimal denselben Eintrag und konnte sie nicht auseinander
-- halten.
--
-- Diese Migration ersetzt die Funktion und setzt statt der Terminart:
--
--     titel = 'Kooperationsgespräch · ' || Vorname Nachname
--
-- Dasselbe Wort bekommt `buchungen.bezeichnung`, damit Liste und Raum
-- uebereinstimmen, und die Anzeige der Terminart selbst. Ihr Schluessel
-- (`anlass = 'bewerbergespraech'`) bleibt unveraendert: Ueber ihn findet
-- `bewerber_termin_gastgeber` die Gastgeberin, und ein geaenderter Schluessel
-- wuerde die Buchung stillschweigend abschalten.
--
-- Wiederholbar: CREATE OR REPLACE, und alle UPDATE sind idempotent.
--
-- Noch bevorstehende Termine werden mitbenannt (Abschnitt 3). Gelaufene bleiben
-- unberuehrt: Ein Raum, in dem schon gesprochen wurde, ist ein Beleg und wird
-- nachtraeglich nicht umgeschrieben.
--
-- Voraussetzung: 20260906120000_bewerber_terminbuchung.sql.

-- ---------------------------------------------------------------------------
-- 1) Die Anzeige der Terminart
-- ---------------------------------------------------------------------------

UPDATE public.buchung_terminarten
   SET bezeichnung = 'Kooperationsgespräch'
 WHERE anlass = 'bewerbergespraech'
   AND bezeichnung <> 'Kooperationsgespräch';

-- ---------------------------------------------------------------------------
-- 2) Die Buchungsfunktion, mit Namen im Titel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bewerber_termin_buchen(
  _token text,
  _start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f record;
  _bewerber record;
  _gastgeber uuid;
  _art public.buchung_terminarten;
  _zone text;
  _dauer integer;
  _tag date;
  _ende timestamptz;
  _abzug jsonb;
  _raum public.videoraeume;
  _buchung public.buchungen;
  -- Der Name des Bewerbers, wie er im Raumtitel und in der Buchung steht.
  _name text;
  -- Die Bezeichnung, die ein Mensch liest: "Kooperationsgespraech · Max Mustermann".
  _titel text;
BEGIN
  SELECT f.bewerbung_id, f.status, f.antworten
    INTO _f
    FROM public.bewerber_formular f
   WHERE f.token = _token
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieser Link ist uns unbekannt';
  END IF;
  IF _f.status <> 'eingereicht' THEN
    RAISE EXCEPTION 'Bitte sende zuerst deine Angaben ab';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.buchungen b
    WHERE b.bewerbung_id = _f.bewerbung_id AND b.status = 'offen'
  ) THEN
    RAISE EXCEPTION 'Du hast bereits einen Termin. Verschiebe ihn oder sage ihn ab.';
  END IF;

  SELECT b.vorname, b.nachname, b.email, b.telefon
    INTO _bewerber
    FROM public.bewerbungen b
   WHERE b.id = _f.bewerbung_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieser Link ist uns unbekannt';
  END IF;

  _name := btrim(COALESCE(_bewerber.vorname, '') || ' ' || COALESCE(_bewerber.nachname, ''));
  /*
   * Der Titel des Raums und die Bezeichnung der Buchung.
   *
   * Bisher stand hier die Bezeichnung der Terminart, also fuer jeden Bewerber
   * dasselbe Wort. In "Meine Gespraeche" liessen sich mehrere Raeume damit
   * nicht auseinanderhalten. Ohne Namen bleibt es bei der Terminart, damit nie
   * ein Titel mit einem baumelnden Mitteltrenner entsteht.
   */
  _titel := CASE
              WHEN _name <> '' THEN 'Kooperationsgespräch · ' || left(_name, 120)
              ELSE 'Kooperationsgespräch'
            END;

  _gastgeber := public.bewerber_termin_gastgeber();
  IF _gastgeber IS NULL THEN
    RAISE EXCEPTION 'Zurzeit ist keine Terminbuchung moeglich';
  END IF;

  SELECT * INTO _art
  FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = _gastgeber AND t.anlass = 'bewerbergespraech' AND t.aktiv
  ORDER BY t.sortierung, t.bezeichnung
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zurzeit ist keine Terminbuchung moeglich';
  END IF;

  IF _start IS NULL THEN
    RAISE EXCEPTION 'Bitte eine Startzeit angeben';
  END IF;
  IF _start < now() + make_interval(mins => _art.vorlauf_minuten) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu kurzfristig';
  END IF;
  IF _start > now() + make_interval(days => _art.vorausschau_tage) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu weit in der Zukunft';
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _gastgeber;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _dauer := public.bewerber_termin_dauer(_f.antworten, _art.dauer_minuten);
  _ende := _start + make_interval(mins => _dauer);
  _tag := (_start AT TIME ZONE _zone)::date;

  -- Liegt der Termin vollstaendig in einem verfuegbaren Fenster dieses Tages?
  IF NOT EXISTS (
    WITH fenster AS (
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _gastgeber AND v.datum = _tag AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _gastgeber
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _gastgeber AND a.datum = _tag
        )
    )
    SELECT 1 FROM fenster f
    WHERE _start >= (_tag + f.von) AT TIME ZONE _zone
      AND _ende <= (_tag + f.bis) AT TIME ZONE _zone
  ) THEN
    RAISE EXCEPTION 'Zu dieser Zeit ist kein Termin moeglich';
  END IF;

  -- Zwei Buchende koennen im selben Augenblick auf dieselbe Zeit klicken.
  PERFORM pg_advisory_xact_lock(hashtext('buchung:' || _gastgeber::text));

  IF EXISTS (
    SELECT 1 FROM public.buchungen b
    WHERE b.mitarbeiter_id = _gastgeber
      AND b.status <> 'abgesagt'
      AND b.start_at - make_interval(mins => b.puffer_vor_minuten)
          < _ende + make_interval(mins => _art.puffer_nach_minuten)
      AND b.ende_at + make_interval(mins => b.puffer_nach_minuten)
          > _start - make_interval(mins => _art.puffer_vor_minuten)
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  IF public.buchung_termin_belegt(
    _gastgeber,
    _start - make_interval(mins => _art.puffer_vor_minuten),
    _ende + make_interval(mins => _art.puffer_nach_minuten),
    _zone
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', COALESCE(p.name, 'Deine Ansprechpartnerin'),
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
  WHERE p.id = _gastgeber;

  INSERT INTO public.videoraeume (
    token, art, titel, gastgeber_id, gastgeber_snapshot,
    -- kontakt_id bleibt leer: Ein Bewerber ist kein Kontakt.
    termin_at, dauer_minuten, transkript_angeboten
  ) VALUES (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    'bewerbergespraech',
    _titel,
    _gastgeber,
    COALESCE(_abzug, '{}'::jsonb),
    _start,
    _dauer,
    true
  ) RETURNING * INTO _raum;

  INSERT INTO public.buchungen (
    mitarbeiter_id, terminart_id, link_id, quelle, kontakt_id, bewerbung_id,
    name, email, telefon,
    start_at, ende_at, dauer_minuten, puffer_vor_minuten, puffer_nach_minuten,
    bezeichnung, anlass, status, absage_token, videoraum_id
  ) VALUES (
    _gastgeber, _art.id, NULL, 'persoenlich', NULL, _f.bewerbung_id,
    left(_name, 120),
    left(lower(btrim(COALESCE(_bewerber.email, ''))), 200),
    left(btrim(COALESCE(_bewerber.telefon, '')), 40),
    _start, _ende, _dauer, _art.puffer_vor_minuten, _art.puffer_nach_minuten,
    _titel, 'bewerbergespraech', 'offen', public.buchung_token(), _raum.id
  ) RETURNING * INTO _buchung;

  /*
   * Der Termin gehoert an den Bewerber.
   *
   * Bewusst genau diese drei Felder: `bewerberToDb` in
   * src/lib/bewerbungStore.ts baut `meta` bei jedem Speichern aus den bekannten
   * Feldern neu auf, und diese drei kennt es. Ein Schluessel daneben
   * verschwaende beim naechsten Speichern in der Akte.
   *
   * Damit erscheint der Termin ueberall dort, wo im Bewerbermanagement ohnehin
   * danach gesucht wird, und die vorhandene Erinnerungskette
   * `send-bewerber-erstgespraech-reminders` greift von selbst. Sie liest genau
   * diese Felder; ohne den Namen stuende in ihrer Mail kein Ansprechpartner.
   *
   * Das Datum im Format JJJJ-MM-TT, so wie `DateInput` es in der Akte
   * speichert.
   */
  UPDATE public.bewerbungen
     SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'erstgespraechDatum', to_char(_start AT TIME ZONE _zone, 'YYYY-MM-DD'),
           'erstgespraechUhrzeit', to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
           'erstgespraechBerater', COALESCE(_abzug ->> 'name', ''))
   WHERE id = _f.bewerbung_id;

  RETURN jsonb_build_object(
    'id', _buchung.id,
    'start_at', _buchung.start_at,
    'ende_at', _buchung.ende_at,
    'dauer_minuten', _buchung.dauer_minuten,
    'bezeichnung', _buchung.bezeichnung,
    'status', _buchung.status,
    'raum_token', _raum.token,
    'zeitzone', _zone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Die noch bevorstehenden Termine mitbenennen
-- ---------------------------------------------------------------------------
--
-- Wer heute schon gebucht hat, sieht seinen Raum sonst weiter unter dem alten
-- Wort, und in "Meine Gespraeche" stuenden zwei Benennungen nebeneinander.
-- Betroffen sind nur offene Bewerbertermine in der Zukunft.

UPDATE public.buchungen b
   SET bezeichnung = 'Kooperationsgespräch · ' || left(btrim(b.name), 120)
 WHERE b.anlass = 'bewerbergespraech'
   AND b.status = 'offen'
   AND b.start_at > now()
   AND btrim(COALESCE(b.name, '')) <> ''
   AND b.bezeichnung IS DISTINCT FROM 'Kooperationsgespräch · ' || left(btrim(b.name), 120);

UPDATE public.videoraeume r
   SET titel = b.bezeichnung
  FROM public.buchungen b
 WHERE b.videoraum_id = r.id
   AND b.anlass = 'bewerbergespraech'
   AND b.status = 'offen'
   AND b.start_at > now()
   AND r.titel IS DISTINCT FROM b.bezeichnung;
