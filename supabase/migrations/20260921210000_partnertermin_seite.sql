-- Die eigene Terminseite des Vertriebspartners, drei Schritte
--
-- ## Warum es diese Seite gibt
--
-- Jeder Vertriebspartner terminiert ueber seinen eigenen Kalenderdienst, in der
-- Regel Calendly. Dieser Dienst meldet uns nichts zurueck: Der Kunde bucht, und
-- im CRM steht nichts. Der Partner trug den Termin bisher von Hand nach, oder
-- er vergass es.
--
-- Christian hat am 21.09.2026 dieselbe Loesung wie beim Bewerber bestellt: eine
-- eigene Seite im Hausstil, in der der fremde Kalender eingebettet steckt, und
-- darunter bestaetigt der Kunde die Zeit, die er gerade gebucht hat. Damit steht
-- der Termin sofort in der Kundenakte.
--
-- Drei Schritte:
--   1. Anliegen waehlen, aus den vier Gespraechsarten
--   2. Zeit im Kalender des Partners aussuchen
--   3. Datum und Uhrzeit bestaetigen
--
-- ## Warum kein neuer Link und keine neue Tabelle
--
-- Der Zugang laeuft ueber denselben persoenlichen Buchungslink, den der Partner
-- heute schon im Kundenprofil erzeugt (`buchung_links`). Nur die Adresse ist eine
-- andere: `/termin/<token>` ist unsere eigene Buchungsstrecke mit unseren Zeiten,
-- `/terminwahl/<token>` ist diese Seite mit dem fremden Kalender. Ein zweites
-- Linksystem daneben waere dieselbe Sache zweimal.
--
-- Der Termin landet in denselben Tabellen wie jede andere Buchung: `buchungen`
-- plus eine Aktivitaet der Art `meeting` in der Kundenakte. Damit zaehlt er in
-- der Historie, in der Ampel und in der Belegung mit.
--
-- ## Was bewusst NICHT passiert
--
--   * Kein Videoraum. Den Zugang verschickt der Kalenderdienst des Partners
--     selbst, zusammen mit seiner eigenen Terminbestaetigung. Ein zweiter Link
--     von uns wuerde den Kunden nur in zwei verschiedene Raeume schicken.
--   * Kein neuer Lead. Die Seite ist ueber einen persoenlichen Link erreichbar,
--     der Kontakt steht also fest. Ohne Kontakt gibt es keinen Zugang.
--   * Keine Pruefung gegen unsere Verfuegbarkeiten. Die Zeit kommt aus einem
--     fremden Kalender, den wir nicht kennen. Wir koennten sie nur zu Unrecht
--     ablehnen.

-- ── Die beiden zusaetzlichen Buchungslinks, falls noch nicht vorhanden ──────
--
-- Sie stammen aus 20260921170000_buchungslinks_objekt_finanzierung.sql. Die
-- Wiederholung steht hier, damit diese Migration fuer sich allein laeuft: Die
-- Funktionen darunter lesen die vier Spalten, und eine fehlende Spalte waere ein
-- Fehler zur Laufzeit statt beim Einspielen.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS objektlink text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS finanzierungslink text;


-- ── 1) Was der Kunde auf der Seite zu sehen bekommt ────────────────────────
--
-- Der Link wird hier absichtlich selbst aufgeloest und nicht ueber
-- `buchung_zugang_aufloesen`. Jene Funktion sperrt einen einmaligen Link, sobald
-- ein Termin darueber steht. Fuer unsere Buchungsstrecke ist das richtig; hier
-- waere es falsch, denn genau dann soll der Kunde beim Neuladen seine
-- Bestaetigung wiedersehen und nicht vor einem toten Link stehen. Die Sperre
-- greift stattdessen beim Schreiben, siehe Funktion 2.

CREATE OR REPLACE FUNCTION public.partnertermin_zugang(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.buchung_links;
  /*
   * Bewusst einzelne, typisierte Variablen statt eines `record`.
   *
   * Die Felder eines `record` haben in PL/pgSQL erst zur Laufzeit einen Typ.
   * In der VALUES-Liste weiter unten muss Postgres den Typ aber schon beim
   * Planen kennen, sonst bricht die Abfrage mit "could not determine data
   * type" ab. Mit `text` steht er fest.
   */
  _name text;
  _email text;
  _telefon text;
  _bild text;
  _stellung text;
  _ort text;
  _zitat text;
  _erstlink text;
  _beratungslink text;
  _objektlink text;
  _finanzierungslink text;
  _zone text;
  _anlaesse jsonb;
  _termin jsonb;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT l.* INTO _l
  FROM public.buchung_links l
  WHERE l.token = _token
    AND l.aktiv
    AND (l.gueltig_bis IS NULL OR l.gueltig_bis > now())
  LIMIT 1;

  -- Ohne Kontakt kein Zugang: Diese Seite gehoert immer zu genau einem Kunden.
  IF NOT FOUND OR _l.kontakt_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.name, p.email, p.telefon, p.avatar_url,
         us.einstellungen -> 'profil'    ->> 'position',
         us.einstellungen -> 'videocall' ->> 'ort',
         us.einstellungen -> 'videocall' ->> 'zitat',
         p.buchungslink, p.beratungslink, p.objektlink, p.finanzierungslink
  INTO _name, _email, _telefon, _bild, _stellung, _ort, _zitat,
       _erstlink, _beratungslink, _objektlink, _finanzierungslink
  FROM public.profiles p
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE p.id = _l.mitarbeiter_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _l.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  /*
   * Die vier Gespraechsarten, aber nur die, fuer die der Partner wirklich einen
   * Kalender hinterlegt hat. Ein Feld ohne Link waere ein Knopf, der ins Leere
   * fuehrt.
   *
   * Die Dauer kommt aus der eigenen Terminart desselben Anlasses, wenn es sie
   * gibt. So steht auf der Seite dieselbe Zahl wie ueberall sonst im System.
   * Hat der Partner keine Terminarten gepflegt, und das ist bei jemandem, der
   * Calendly benutzt, der Normalfall, gilt der Wert aus der Liste.
   */
  SELECT COALESCE(jsonb_agg(z.eintrag ORDER BY z.sortierung), '[]'::jsonb)
  INTO _anlaesse
  FROM (
    SELECT a.sortierung,
           jsonb_build_object(
             'anlass', a.anlass,
             'bezeichnung', a.bezeichnung,
             'beschreibung', a.beschreibung,
             'dauer_minuten', COALESCE(t.dauer_minuten, a.dauer),
             'url', btrim(a.url)
           ) AS eintrag
    FROM (VALUES
      -- Die Typen stehen an der ersten Zeile, damit Postgres sie nicht raten
      -- muss. Ohne sie bliebe `anlass` "unknown" und der Vergleich mit der
      -- Spalte `buchung_terminarten.anlass` haenge von der Aufloesung ab.
      ('erstgespraech'::text, 1::integer, 'Erstgespraech'::text, 30::integer,
       'Kurzes Kennenlernen am Telefon. Wir klaeren, worum es dir geht und ob wir zueinander passen.'::text,
       _erstlink::text),
      ('beratung', 2, 'Beratungsgespraech', 60,
       'Das ausfuehrliche Gespraech zu deiner Situation, deinen Zielen und dem passenden Weg dorthin.',
       _beratungslink),
      ('objektvorstellung', 3, 'Objektgespraech', 60,
       'Wir gehen ein konkretes Objekt gemeinsam durch, von der Lage bis zur Rechnung.',
       _objektlink),
      ('finanzierungsgespraech', 4, 'Finanzierungsgespraech', 60,
       'Alles rund um die Finanzierung: Unterlagen, Ablauf und die naechsten Schritte mit der Bank.',
       _finanzierungslink)
    ) AS a(anlass, sortierung, bezeichnung, dauer, beschreibung, url)
    LEFT JOIN LATERAL (
      SELECT tt.dauer_minuten
      FROM public.buchung_terminarten tt
      WHERE tt.mitarbeiter_id = _l.mitarbeiter_id
        AND tt.anlass = a.anlass
        AND tt.aktiv
      ORDER BY tt.sortierung, tt.created_at
      LIMIT 1
    ) t ON true
    -- Nur https. Ein Kalenderlink ohne Verschluesselung waere im eingebetteten
    -- Rahmen ohnehin blockiert und saehe fuer den Kunden wie ein Fehler aus.
    WHERE a.url IS NOT NULL
      AND btrim(a.url) <> ''
      AND btrim(a.url) ~* '^https://'
  ) z;

  -- Steht ueber diesen Link schon ein Termin, zeigt die Seite ihn wieder an.
  SELECT jsonb_build_object(
    'datum', to_char(b.start_at AT TIME ZONE _zone, 'YYYY-MM-DD'),
    'uhrzeit', to_char(b.start_at AT TIME ZONE _zone, 'HH24:MI'),
    'anlass', b.anlass,
    'bezeichnung', b.bezeichnung,
    'dauer_minuten', b.dauer_minuten
  )
  INTO _termin
  FROM public.buchungen b
  WHERE b.link_id = _l.id
    AND b.status <> 'abgesagt'
  ORDER BY b.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'berater', jsonb_strip_nulls(jsonb_build_object(
      'name', COALESCE(_name, 'Dein Ansprechpartner'),
      'email', _email,
      'telefon', _telefon,
      'bild', _bild,
      'position', _stellung,
      'ort', _ort,
      'zitat', _zitat
    )),
    'zeitzone', _zone,
    -- Nur der Vorname fuer die Anrede. Mehr braucht die Seite nicht, und mehr
    -- soll ein Link, der per Mail unterwegs ist, auch nicht herausgeben.
    'vorname', COALESCE(split_part(btrim(COALESCE(_l.kontakt_snapshot ->> 'name', '')), ' ', 1), ''),
    'anlaesse', _anlaesse,
    'termin', _termin
  );
END;
$$;

COMMENT ON FUNCTION public.partnertermin_zugang(text) IS
  'Oeffentlicher Zugang der Partner-Terminseite: Berater, die vier Gespraechsarten mit hinterlegtem Kalenderlink und der bereits bestaetigte Termin.';

REVOKE ALL ON FUNCTION public.partnertermin_zugang(text) FROM public;
GRANT EXECUTE ON FUNCTION public.partnertermin_zugang(text) TO anon, authenticated;


-- ── 2) Den gebuchten Termin bestaetigen ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.partnertermin_bestaetigen(
  _token text,
  _anlass text,
  _datum text,
  _uhrzeit text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.buchung_links;
  _zone text;
  _start timestamptz;
  _ende timestamptz;
  _bezeichnung text;
  _dauer integer;
  _dauer_eigene integer;
  _url text;
  _beraterName text;
  _kundeName text;
  _kundeEmail text;
  _stufe text;
  _alt public.buchungen;
  _buchung public.buchungen;
  _aktivitaet_id uuid;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RAISE EXCEPTION 'Kein Zugang';
  END IF;

  SELECT l.* INTO _l
  FROM public.buchung_links l
  WHERE l.token = _token
    AND l.aktiv
    AND (l.gueltig_bis IS NULL OR l.gueltig_bis > now())
  LIMIT 1;

  IF NOT FOUND OR _l.kontakt_id IS NULL THEN
    RAISE EXCEPTION 'Kein Zugang';
  END IF;

  /*
   * Die Gespraechsart muss eine der vier sein, UND der Partner muss dafuer
   * einen Kalender hinterlegt haben. Ohne die zweite Bedingung liesse sich ein
   * Termin zu einem Anlass bestaetigen, den es bei diesem Partner gar nicht
   * gibt. Die Seite zeigt ihn nicht an, aber was im Browser laeuft, laesst sich
   * umgehen.
   */
  SELECT a.bezeichnung, a.dauer, btrim(a.url)
  INTO _bezeichnung, _dauer, _url
  FROM public.profiles p
  CROSS JOIN LATERAL (VALUES
    ('erstgespraech'::text, 'Erstgespraech'::text, 30::integer, p.buchungslink::text),
    ('beratung', 'Beratungsgespraech', 60, p.beratungslink),
    ('objektvorstellung', 'Objektgespraech', 60, p.objektlink),
    ('finanzierungsgespraech', 'Finanzierungsgespraech', 60, p.finanzierungslink)
  ) AS a(anlass, bezeichnung, dauer, url)
  WHERE p.id = _l.mitarbeiter_id
    AND a.anlass = _anlass
    AND a.url IS NOT NULL
    AND btrim(a.url) ~* '^https://';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diese Gespraechsart steht nicht zur Verfuegung';
  END IF;

  /*
   * Die eigene Terminart desselben Anlasses gibt die Dauer vor, wenn es sie
   * gibt. Bewusst ueber eine zweite Variable: Ein SELECT INTO ohne Treffer
   * setzt das Ziel auf NULL, und damit waere der Wert aus der Liste oben
   * ausgerechnet dann verloren, wenn er gebraucht wird.
   */
  SELECT tt.dauer_minuten INTO _dauer_eigene
  FROM public.buchung_terminarten tt
  WHERE tt.mitarbeiter_id = _l.mitarbeiter_id
    AND tt.anlass = _anlass
    AND tt.aktiv
  ORDER BY tt.sortierung, tt.created_at
  LIMIT 1;
  _dauer := COALESCE(_dauer_eigene, _dauer, 60);

  IF _datum !~ '^\d{4}-\d{2}-\d{2}$' OR _uhrzeit !~ '^\d{2}:\d{2}$' THEN
    RAISE EXCEPTION 'Bitte Datum und Uhrzeit angeben';
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _l.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _start := (_datum || ' ' || _uhrzeit)::timestamp AT TIME ZONE _zone;
  _ende  := _start + make_interval(mins => _dauer);

  -- Eine Stunde Nachsicht: Wer direkt nach einem gerade gelaufenen Termin
  -- bestaetigt, soll nicht abgewiesen werden.
  IF _start < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'Der Termin liegt in der Vergangenheit';
  END IF;
  IF _start > now() + interval '1 year' THEN
    RAISE EXCEPTION 'Der Termin liegt zu weit in der Zukunft';
  END IF;

  -- Bremse gegen automatisiertes Zumuellen, wortgleich zu buchung_anlegen.
  IF (SELECT count(*) FROM public.buchungen b
      WHERE b.mitarbeiter_id = _l.mitarbeiter_id
        AND b.created_at > now() - interval '1 hour') > 20 THEN
    RAISE EXCEPTION 'Zu viele Buchungen, bitte spaeter erneut versuchen';
  END IF;

  SELECT COALESCE(p.name, 'System') INTO _beraterName
  FROM public.profiles p WHERE p.id = _l.mitarbeiter_id;

  _kundeName  := left(NULLIF(btrim(COALESCE(_l.kontakt_snapshot ->> 'name', '')), ''), 120);
  _kundeEmail := left(lower(NULLIF(btrim(COALESCE(_l.kontakt_snapshot ->> 'email', '')), '')), 200);

  -- Der Abzug am Link kann leer sein, etwa bei einem sehr alten Link. Dann
  -- ergaenzt der Kontakt selbst, was fehlt. Die Tabelle verlangt beide Felder.
  IF _kundeName IS NULL OR _kundeEmail IS NULL THEN
    SELECT COALESCE(_kundeName, btrim(COALESCE(k.vorname, '') || ' ' || COALESCE(k.nachname, ''))),
           COALESCE(_kundeEmail, lower(btrim(COALESCE(k.email, ''))))
    INTO _kundeName, _kundeEmail
    FROM public.kontakte k WHERE k.id = _l.kontakt_id;
  END IF;
  _kundeName  := NULLIF(btrim(COALESCE(_kundeName, '')), '');
  _kundeEmail := NULLIF(btrim(COALESCE(_kundeEmail, '')), '');
  IF _kundeName IS NULL THEN _kundeName := 'Kunde'; END IF;
  IF _kundeEmail IS NULL THEN _kundeEmail := ''; END IF;

  /*
   * Steht ueber diesen Link schon ein Termin, wird er verschoben statt ein
   * zweiter angelegt. Genau das passiert, wenn der Kunde auf der Seite "Zeit
   * korrigieren" nimmt. Ohne diesen Zweig staenden zwei Termine in der Akte und
   * niemand wuesste, welcher gilt.
   *
   * Ein einmaliger Link ist die Ausnahme: Er ist mit dem ersten Termin
   * verbraucht, und dann darf auch nicht mehr korrigiert werden.
   */
  SELECT b.* INTO _alt
  FROM public.buchungen b
  WHERE b.link_id = _l.id AND b.status <> 'abgesagt'
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF FOUND AND _l.einmalig THEN
    RAISE EXCEPTION 'Ueber diesen Link steht bereits ein Termin';
  END IF;

  IF FOUND THEN
    UPDATE public.buchungen b
    SET start_at = _start,
        ende_at = _ende,
        dauer_minuten = _dauer,
        bezeichnung = _bezeichnung,
        anlass = _anlass,
        updated_at = now()
    WHERE b.id = _alt.id
    RETURNING * INTO _buchung;

    IF _alt.aktivitaet_id IS NOT NULL THEN
      UPDATE public.aktivitaeten a
      SET beschreibung = _bezeichnung,
          faellig_am = (_start AT TIME ZONE _zone)::date::text,
          uhrzeit = to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
          dauer = _dauer::text
      WHERE a.id = _alt.aktivitaet_id;
    END IF;
  ELSE
    INSERT INTO public.buchungen (
      mitarbeiter_id, terminart_id, link_id, quelle, kontakt_id,
      name, email, telefon, nachricht,
      start_at, ende_at, dauer_minuten, puffer_vor_minuten, puffer_nach_minuten,
      bezeichnung, anlass, status, absage_token
    ) VALUES (
      _l.mitarbeiter_id, NULL, _l.id, 'persoenlich', _l.kontakt_id,
      _kundeName, _kundeEmail, NULL,
      'Vom Kunden im eigenen Kalender des Partners gebucht und hier bestaetigt.',
      _start, _ende, _dauer, 0, 0,
      _bezeichnung, _anlass, 'offen', public.buchung_token()
    ) RETURNING * INTO _buchung;

    INSERT INTO public.aktivitaeten (
      kunde_id, art, beschreibung, details, von, datum,
      prioritaet, faellig_am, uhrzeit, dauer, teilnehmer, benutzer_id
    ) VALUES (
      _l.kontakt_id,
      'meeting',
      _bezeichnung,
      'Vom Kunden ueber die Terminseite bestaetigt. Den Zugang verschickt der '
        || 'Kalender des Beraters.',
      _beraterName,
      now(),
      'mittel',
      (_start AT TIME ZONE _zone)::date::text,
      to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
      _dauer::text,
      _kundeName,
      _l.mitarbeiter_id
    ) RETURNING id INTO _aktivitaet_id;

    UPDATE public.buchungen SET aktivitaet_id = _aktivitaet_id WHERE id = _buchung.id;
  END IF;

  -- Die Pipeline zieht mit, genau wie bei einer Buchung ueber unsere eigene
  -- Strecke. Nur nach vorne, nie zurueck.
  _stufe := CASE _anlass
    WHEN 'erstgespraech'     THEN 'erstgespraech_geplant'
    WHEN 'beratung'          THEN 'beratungsgespraech'
    WHEN 'objektvorstellung' THEN 'objektauswahl'
    ELSE NULL
  END;
  IF _stufe IS NOT NULL THEN
    PERFORM public.buchung_pipeline_vorwaerts(_l.kontakt_id, _stufe);
    PERFORM public.buchung_investment_vorwaerts(_l.kontakt_id, _stufe);
  END IF;

  RETURN jsonb_build_object(
    'datum', to_char(_buchung.start_at AT TIME ZONE _zone, 'YYYY-MM-DD'),
    'uhrzeit', to_char(_buchung.start_at AT TIME ZONE _zone, 'HH24:MI'),
    'anlass', _buchung.anlass,
    'bezeichnung', _buchung.bezeichnung,
    'dauer_minuten', _buchung.dauer_minuten
  );
END;
$$;

COMMENT ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text) IS
  'Traegt den im fremden Kalender gebuchten Termin als Buchung und Aktivitaet ein. Ein zweiter Aufruf verschiebt den vorhandenen Termin, statt einen weiteren anzulegen.';

REVOKE ALL ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text) TO anon, authenticated;
