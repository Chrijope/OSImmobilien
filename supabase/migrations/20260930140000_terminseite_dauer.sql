-- ===========================================================================
-- Terminseite: feste Dauer fuer Erstgespraech und Beratungsgespraech
-- ===========================================================================
--
-- FREIGABE (Christian, 29.09.2026)
--
-- Auf der Terminseite /terminwahl/:token stand beim Erstgespraech 30 Minuten
-- und beim Beratungsgespraech bei einem Partner 15 Minuten. Die 30 waren der
-- Standard in beiden Funktionen, die 15 kamen aus einer eigenen Terminart des
-- Partners (`buchung_terminarten`), die den Standard uebersteuerte.
-- Richtig ist: Erstgespraech 15 bis 20 Minuten, Beratungsgespraech 45 Minuten.
--
-- WAS SICH AENDERT
--
-- 1. `partnertermin_zugang(text)` liefert je Anlass `dauer_minuten` 20 fuer
--    'erstgespraech' und 45 fuer 'beratung', fest, ohne Blick auf
--    `buchung_terminarten`. Die Seite zeigt dafuer die festen Texte
--    "15 bis 20 Minuten" und "45 Minuten".
-- 2. `partnertermin_bestaetigen(...)` speichert Buchung, Aktivitaet und
--    Aufgabe mit denselben Dauern: 20 und 45 Minuten, ebenfalls ohne Blick
--    auf `buchung_terminarten`.
-- 3. Objektgespraech und Finanzierungsgespraech bleiben wie bisher: eigene
--    Terminart des Partners, sonst 60 Minuten.
--
-- WAS BLEIBT
--
-- Rumpf wortgleich zu 20260929130000_partnertermin_nur_partner.sql (die
-- Fassung, die seit dem 29.09.2026 in der Datenbank laeuft), nur die Dauern
-- sind anders. Signaturen, SECURITY DEFINER, search_path und Rechte
-- unveraendert. Mehrfach ausfuehrbar, aendert keine vorhandenen Daten:
-- Bereits eingetragene Termine behalten ihre Dauer, bis ihre Zeit ueber die
-- Seite korrigiert wird.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.partnertermin_zugang(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _l public.buchung_links;
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
  _termine jsonb;
  _investments jsonb;
  _link_investment uuid;
  _kunde jsonb;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT l.* INTO _l
  FROM public.buchung_links l
  WHERE l.token = _token
    AND l.aktiv
    AND (l.gueltig_bis IS NULL OR l.gueltig_bis > now())
    -- Seit 27.09.2026: nur Links auf den externen Kalender.
    AND l.ziel = 'extern'
  LIMIT 1;

  IF NOT FOUND OR _l.kontakt_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Seit 29.09.2026: nur der angemeldete Besitzer des Links. Fremde bekommen
  -- dieselbe Antwort wie bei einem unbekannten Link.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _l.mitarbeiter_id THEN
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

  SELECT COALESCE(jsonb_agg(z.eintrag ORDER BY z.sortierung), '[]'::jsonb)
  INTO _anlaesse
  FROM (
    SELECT a.sortierung,
           jsonb_build_object(
             'anlass', a.anlass,
             'bezeichnung', a.bezeichnung,
             'beschreibung', a.beschreibung,
             -- Seit 30.09.2026: Erstgespraech und Beratung fest, ohne eigene Terminart.
             'dauer_minuten', CASE WHEN a.anlass IN ('erstgespraech', 'beratung')
                                   THEN a.dauer
                                   ELSE COALESCE(t.dauer_minuten, a.dauer) END,
             'url', btrim(a.url)
           ) AS eintrag
    FROM (VALUES
      ('erstgespraech'::text, 1::integer, 'Erstgespräch'::text, 20::integer,
       'Kurzes Kennenlernen am Telefon. Wir klären, worum es dir geht und ob wir zueinander passen.'::text,
       _erstlink::text),
      ('beratung', 2, 'Beratungsgespräch', 45,
       'Das ausführliche Gespräch zu deiner Situation, deinen Zielen und dem passenden Weg dorthin.',
       _beratungslink),
      ('objektvorstellung', 3, 'Objektgespräch', 60,
       'Wir gehen ein konkretes Objekt gemeinsam durch, von der Lage bis zur Rechnung.',
       _objektlink),
      ('finanzierungsgespraech', 4, 'Finanzierungsgespräch', 60,
       'Alles rund um die Finanzierung: Unterlagen, Ablauf und die nächsten Schritte mit der Bank.',
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
    WHERE a.url IS NOT NULL
      AND btrim(a.url) <> ''
      AND btrim(a.url) ~* '^https://'
  ) z;

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

  /*
   * Seit 29.09.2026: je Gespraechsart der zuletzt eingetragene Termin. Jede
   * Gespraechsart bekommt eine eigene Buchung; die Seite braucht je Anlass,
   * ob es einen Termin gibt, ob er sich noch korrigieren laesst (nicht mehr
   * als eine Stunde vorbei, dieselbe Grenze wie beim Eintragen) und zu
   * welchem Investment er gehoert (ueber die Aufgabe, die das Investment
   * traegt).
   */
  SELECT COALESCE(jsonb_agg(t.eintrag ORDER BY t.start_at), '[]'::jsonb)
  INTO _termine
  FROM (
    SELECT DISTINCT ON (b.anlass)
           b.start_at,
           jsonb_build_object(
             'datum', to_char(b.start_at AT TIME ZONE _zone, 'YYYY-MM-DD'),
             'uhrzeit', to_char(b.start_at AT TIME ZONE _zone, 'HH24:MI'),
             'anlass', b.anlass,
             'bezeichnung', b.bezeichnung,
             'dauer_minuten', b.dauer_minuten,
             'korrigierbar', b.start_at >= now() - interval '1 hour',
             'investment_id', (
               SELECT g.investment_id
               FROM public.aufgaben g
               WHERE b.aktivitaet_id IS NOT NULL
                 AND g.meeting_aktivitaet_id = b.aktivitaet_id
               ORDER BY g.erstellt_am DESC
               LIMIT 1
             )
           ) AS eintrag
    FROM public.buchungen b
    WHERE b.link_id = _l.id
      AND b.status <> 'abgesagt'
    ORDER BY b.anlass, b.created_at DESC
  ) t;

  /*
   * Seit 29.09.2026: Das Investment am Link zaehlt nur, wenn es zu diesem
   * Kontakt gehoert und noch laeuft. Sonst bleibt es leer, und die Seite
   * fragt "Gehoert zu". uuid gegen uuid, ohne Umwandlung.
   */
  SELECT i.id INTO _link_investment
  FROM public.investments i
  WHERE i.id = _l.investment_id
    AND i.kunde_id = _l.kontakt_id
    AND COALESCE(i.status, 'aktiv') NOT IN ('abgeschlossen', 'abgesagt', 'storniert');

  /*
   * `investments.kunde_id` ist seit dem 17.05.2026 eine uuid, siehe
   * 20260517094425. Verglichen wird deshalb uuid gegen uuid, ohne Umwandlung.
   * Ein `::text` an dieser Stelle laesst die ganze Funktion mit SQLSTATE 42883
   * abbrechen, siehe 20260921240000.
   */
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('id', x.id, 'bezeichnung', x.bezeichnung)
           ORDER BY x.erstellt_am
         ), '[]'::jsonb)
  INTO _investments
  FROM (
    SELECT i.id,
           i.erstellt_am,
           NULLIF(btrim(
             COALESCE(i.objekt, '') ||
             CASE WHEN COALESCE(btrim(i.wohnung), '') <> ''
                  THEN ', ' || btrim(i.wohnung) ELSE '' END
           ), '') AS bezeichnung
    FROM public.investments i
    WHERE i.kunde_id = _l.kontakt_id
      AND COALESCE(i.status, 'aktiv') NOT IN ('abgeschlossen', 'abgesagt', 'storniert')
  ) x;

  /*
   * Der Kunde, aber nur fuer den Partner.
   *
   * `auth.uid()` ist die Kennung des angemeldeten Nutzers, oder NULL ohne
   * Anmeldung. Die Daten kommen ausschliesslich dann, wenn diese Kennung dem
   * Besitzer des Links entspricht. Ein weitergeleiteter Link gibt damit nichts
   * preis, und auch ein angemeldeter Kunde mit fremdem Token sieht nichts.
   */
  IF auth.uid() IS NOT NULL AND auth.uid() = _l.mitarbeiter_id THEN
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'name', NULLIF(btrim(COALESCE(k.vorname, '') || ' ' || COALESCE(k.nachname, '')), ''),
      'email', NULLIF(btrim(COALESCE(k.email, '')), ''),
      'telefon', NULLIF(btrim(COALESCE(k.telefon, '')), '')
    ))
    INTO _kunde
    FROM public.kontakte k
    WHERE k.id = _l.kontakt_id;

    -- Ohne Kontaktzeile bleibt der Abzug am Link die letzte Quelle.
    IF _kunde IS NULL OR _kunde = '{}'::jsonb THEN
      _kunde := jsonb_strip_nulls(jsonb_build_object(
        'name', NULLIF(btrim(COALESCE(_l.kontakt_snapshot ->> 'name', '')), ''),
        'email', NULLIF(btrim(COALESCE(_l.kontakt_snapshot ->> 'email', '')), '')
      ));
    END IF;
  END IF;

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
    'vorname', COALESCE(split_part(btrim(COALESCE(_l.kontakt_snapshot ->> 'name', '')), ' ', 1), ''),
    'anlaesse', _anlaesse,
    'termin', _termin,
    'termine', _termine,
    'investment_id', _link_investment,
    'investments', _investments,
    'kunde', _kunde
  );
END;
$$;

COMMENT ON FUNCTION public.partnertermin_zugang(text) IS
  'Zugang der Partner-Terminseite, nur fuer den angemeldeten Besitzer des Links (seit 29.09.2026).';

REVOKE ALL ON FUNCTION public.partnertermin_zugang(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partnertermin_zugang(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.partnertermin_bestaetigen(
  _token text,
  _anlass text,
  _datum text,
  _uhrzeit text,
  _investment_id uuid
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
  _investment uuid;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RAISE EXCEPTION 'Kein Zugang';
  END IF;

  SELECT l.* INTO _l
  FROM public.buchung_links l
  WHERE l.token = _token
    AND l.aktiv
    AND (l.gueltig_bis IS NULL OR l.gueltig_bis > now())
    -- Seit 27.09.2026: nur Links auf den externen Kalender.
    AND l.ziel = 'extern'
  LIMIT 1;

  IF NOT FOUND OR _l.kontakt_id IS NULL THEN
    RAISE EXCEPTION 'Kein Zugang';
  END IF;

  -- Seit 29.09.2026: nur der angemeldete Besitzer des Links.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _l.mitarbeiter_id THEN
    RAISE EXCEPTION 'Kein Zugang';
  END IF;

  SELECT a.bezeichnung, a.dauer, btrim(a.url)
  INTO _bezeichnung, _dauer, _url
  FROM public.profiles p
  CROSS JOIN LATERAL (VALUES
    ('erstgespraech'::text, 'Erstgespräch'::text, 20::integer, p.buchungslink::text),
    ('beratung', 'Beratungsgespräch', 45, p.beratungslink),
    ('objektvorstellung', 'Objektgespräch', 60, p.objektlink),
    ('finanzierungsgespraech', 'Finanzierungsgespräch', 60, p.finanzierungslink)
  ) AS a(anlass, bezeichnung, dauer, url)
  WHERE p.id = _l.mitarbeiter_id
    AND a.anlass = _anlass
    AND a.url IS NOT NULL
    AND btrim(a.url) ~* '^https://';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diese Gesprächsart steht nicht zur Verfügung';
  END IF;

  SELECT tt.dauer_minuten INTO _dauer_eigene
  FROM public.buchung_terminarten tt
  WHERE tt.mitarbeiter_id = _l.mitarbeiter_id
    AND tt.anlass = _anlass
    AND tt.aktiv
  ORDER BY tt.sortierung, tt.created_at
  LIMIT 1;
  -- Seit 30.09.2026: Erstgespraech 20 und Beratung 45 Minuten fest, ohne eigene Terminart.
  _dauer := CASE WHEN _anlass IN ('erstgespraech', 'beratung')
                 THEN _dauer
                 ELSE COALESCE(_dauer_eigene, _dauer, 60) END;

  IF _datum !~ '^\d{4}-\d{2}-\d{2}$' OR _uhrzeit !~ '^\d{2}:\d{2}$' THEN
    RAISE EXCEPTION 'Bitte Datum und Uhrzeit angeben';
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _l.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _start := (_datum || ' ' || _uhrzeit)::timestamp AT TIME ZONE _zone;
  _ende  := _start + make_interval(mins => _dauer);

  IF _start < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'Der Termin liegt in der Vergangenheit';
  END IF;
  IF _start > now() + interval '1 year' THEN
    RAISE EXCEPTION 'Der Termin liegt zu weit in der Zukunft';
  END IF;

  IF (SELECT count(*) FROM public.buchungen b
      WHERE b.mitarbeiter_id = _l.mitarbeiter_id
        AND b.created_at > now() - interval '1 hour') > 20 THEN
    RAISE EXCEPTION 'Zu viele Buchungen, bitte später erneut versuchen';
  END IF;

  /*
   * Das Investment, drei Quellen in dieser Reihenfolge: am Link, von der
   * Seite gewaehlt, das einzige laufende. Die ersten beiden zaehlen nur, wenn
   * sie zu diesem Kontakt gehoeren und noch laufen, sonst werden sie
   * verworfen. Seit 29.09.2026 gilt das auch fuer das Investment am Link: Ein
   * Partner koennte seinen eigenen Link sonst per direktem Aufruf auf ein
   * fremdes Investment setzen und es vorruecken lassen. uuid gegen uuid,
   * ohne Umwandlung.
   */
  SELECT i.id INTO _investment
  FROM public.investments i
  WHERE i.id = _l.investment_id
    AND i.kunde_id = _l.kontakt_id
    AND COALESCE(i.status, 'aktiv') NOT IN ('abgeschlossen', 'abgesagt', 'storniert');

  IF _investment IS NULL AND _investment_id IS NOT NULL THEN
    SELECT i.id INTO _investment
    FROM public.investments i
    WHERE i.id = _investment_id
      AND i.kunde_id = _l.kontakt_id
      AND COALESCE(i.status, 'aktiv') NOT IN ('abgeschlossen', 'abgesagt', 'storniert');
  END IF;

  IF _investment IS NULL THEN
    SELECT i.id INTO _investment
    FROM public.investments i
    WHERE i.kunde_id = _l.kontakt_id
      AND COALESCE(i.status, 'aktiv') NOT IN ('abgeschlossen', 'abgesagt', 'storniert')
    LIMIT 2;
    -- Genau eines: dann ist die Frage keine Frage. Mehrere: lieber keines als
    -- das falsche, sonst haengt der Termin am Vorgang eines anderen Objekts.
    IF (SELECT count(*) FROM public.investments i
        WHERE i.kunde_id = _l.kontakt_id
          AND COALESCE(i.status, 'aktiv') NOT IN ('abgeschlossen', 'abgesagt', 'storniert')) <> 1 THEN
      _investment := NULL;
    END IF;
  END IF;

  SELECT COALESCE(p.name, 'System') INTO _beraterName
  FROM public.profiles p WHERE p.id = _l.mitarbeiter_id;

  _kundeName  := left(NULLIF(btrim(COALESCE(_l.kontakt_snapshot ->> 'name', '')), ''), 120);
  _kundeEmail := left(lower(NULLIF(btrim(COALESCE(_l.kontakt_snapshot ->> 'email', '')), '')), 200);

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

  -- Seit 29.09.2026: Zwei gleichzeitige Aufrufe zum selben Link warten
  -- aufeinander, sonst legten beide eine neue Buchung an.
  PERFORM pg_advisory_xact_lock(hashtext(_l.id::text));

  -- Ein einmaliger Link traegt genau eine Buchung, wie bisher.
  IF _l.einmalig AND EXISTS (
       SELECT 1 FROM public.buchungen b
       WHERE b.link_id = _l.id AND b.status <> 'abgesagt'
     ) THEN
    RAISE EXCEPTION 'Über diesen Link steht bereits ein Termin';
  END IF;

  /*
   * Seit 29.09.2026 je Gespraechsart eine eigene Buchung. Derselbe Link wird
   * je Kunde wiederverwendet; bisher ueberschrieb ein Beratungsgespraech die
   * Buchung des Erstgespraechs samt Aktivitaet. Aktualisiert wird nur eine
   * Buchung derselben Gespraechsart, deren Termin noch nicht mehr als eine
   * Stunde vorbei ist ("Zeit korrigieren", und eine stille Wiederholung nach
   * verlorener Antwort). Sonst entsteht eine neue Buchung samt Aktivitaet und
   * Aufgabe.
   */
  SELECT b.* INTO _alt
  FROM public.buchungen b
  WHERE b.link_id = _l.id
    AND b.status <> 'abgesagt'
    AND b.anlass = _anlass
    AND b.start_at >= now() - interval '1 hour'
  ORDER BY b.created_at DESC
  LIMIT 1;

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

      -- Die Aufgabe zieht mit, sonst stuende im Investment die alte Zeit.
      UPDATE public.aufgaben g
      SET titel = _bezeichnung || ' mit ' || _kundeName,
          faellig_am = _start,
          uhrzeit = (_uhrzeit || ':00')::time,
          investment_id = COALESCE(_investment, g.investment_id),
          aktualisiert_am = now()
      WHERE g.meeting_aktivitaet_id = _alt.aktivitaet_id
        AND g.status <> 'erledigt';
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
      'Im eigenen Kalender des Partners gebucht und über die Terminseite eingetragen.',
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
      'Über die Terminseite eingetragen. Den Zugang verschickt der '
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

    /*
     * Die Aufgabe ist das Bindeglied zum Investment: `aktivitaeten` hat keine
     * Investment-Spalte, `aufgaben` schon. Ohne sie blieben im Investment die
     * Kaesten "Naechste Aktion" und "Naechster Schritt" leer.
     */
    INSERT INTO public.aufgaben (
      benutzer_id, kontakt_id, typ, prioritaet, status,
      titel, beschreibung, faellig_am, uhrzeit, zugewiesen_an,
      investment_id, meeting_aktivitaet_id, erstellt_von_name
    ) VALUES (
      _l.mitarbeiter_id,
      _l.kontakt_id,
      -- 'meeting', nicht 'termin': Der Aufzaehlungstyp `aufgabe_typ` kennt
      -- anruf, meeting, follow_up, aufgabe und deadline. Ein falscher Wert
      -- laesst den ganzen Aufruf scheitern.
      'meeting',
      'mittel',
      'offen',
      _bezeichnung || ' mit ' || _kundeName,
      'Über die Terminseite eingetragen.',
      _start,
      (_uhrzeit || ':00')::time,
      _l.mitarbeiter_id,
      _investment,
      _aktivitaet_id,
      _beraterName
    );
  END IF;

  _stufe := CASE _anlass
    WHEN 'erstgespraech'     THEN 'erstgespraech_geplant'
    WHEN 'beratung'          THEN 'beratungsgespraech'
    WHEN 'objektvorstellung' THEN 'objektauswahl'
    ELSE NULL
  END;
  IF _stufe IS NOT NULL THEN
    PERFORM public.buchung_pipeline_vorwaerts(_l.kontakt_id, _stufe);
    /*
     * Seit 29.09.2026: Steht das Investment fest, rueckt genau dieses vor.
     * `buchung_investment_vorwaerts` tut das nur, wenn der Kunde genau ein
     * Investment hat; bei mehreren blieb das gewaehlte stehen. Nur vorwaerts,
     * mit demselben Rang-Vergleich. `||` ergaenzt nur pipelineStufe, der Rest
     * von meta bleibt. Trigger auf `investments` (auch BEFORE UPDATE OF meta)
     * laufen dabei wie bei jeder anderen Stufenaenderung mit.
     */
    IF _investment IS NOT NULL THEN
      UPDATE public.investments i
      SET meta = COALESCE(i.meta, '{}'::jsonb) || jsonb_build_object('pipelineStufe', _stufe)
      WHERE i.id = _investment
        AND i.kunde_id = _l.kontakt_id
        AND public.buchung_pipeline_rang(_stufe)
            > public.buchung_pipeline_rang(NULLIF(btrim(COALESCE(i.meta ->> 'pipelineStufe', '')), ''));
    ELSE
      PERFORM public.buchung_investment_vorwaerts(_l.kontakt_id, _stufe);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'datum', to_char(_buchung.start_at AT TIME ZONE _zone, 'YYYY-MM-DD'),
    'uhrzeit', to_char(_buchung.start_at AT TIME ZONE _zone, 'HH24:MI'),
    'anlass', _buchung.anlass,
    'bezeichnung', _buchung.bezeichnung,
    'dauer_minuten', _buchung.dauer_minuten,
    'korrigierbar', true,
    'investment_id', _investment
  );
END;
$$;

COMMENT ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) IS
  'Traegt den im fremden Kalender gebuchten Termin als Buchung, Aktivitaet und Aufgabe ein. Die Aufgabe traegt das Investment, damit der Termin im Vorgang erscheint.';

REVOKE ALL ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) TO authenticated;

COMMIT;
