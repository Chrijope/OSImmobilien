-- ===========================================================================
-- Terminseite: Gesprächsarten und Eintragungen mit echten Umlauten
-- ===========================================================================
--
-- FREIGABE (Christian, 29.09.2026)
--
-- `partnertermin_zugang` und `partnertermin_bestaetigen` (Terminseite
-- /terminwahl/:token) hatten die vier Gespraechsarten fest im Code, aber in
-- Ersatzschreibweise ("Erstgespraech", "klaeren", "naechsten"). Beim
-- Bestaetigen landeten diese Texte in Buchung, Aktivitaet und Aufgabentitel.
-- Die Seite selbst zeigt seit 2c268fc5 eigene Texte mit Umlauten
-- (partnerTerminTexte.ts), die Akte bekam aber weiter die Ersatzschreibweise.
--
-- WAS SICH AENDERT
--
-- Nur sichtbare Texte, jetzt mit echten Umlauten: Namen und Beschreibungen
-- der Gespraechsarten, der Hinweis an der Buchung, Beschreibung und Details
-- der Aktivitaet, Titel (ueber die Bezeichnung) und Beschreibung der Aufgabe,
-- dazu die drei Fehlermeldungen mit Ersatzumlaut. Die Seite erkennt die
-- Meldungen in beiden Schreibweisen (partnerterminStore.ts).
--
-- WAS BLEIBT
--
-- Rumpf sonst wortgleich zu 20260927120000_videocall_nur_geschaeftsfuehrer.sql
-- (die juengste Fassung beider Funktionen): Kennungen wie `erstgespraech`,
-- Logik, Signaturen, SECURITY DEFINER, search_path, Kommentare und Rechte.
-- Eine Glocke schreiben beide Funktionen nicht.
--
-- Bestehende Buchungen, Aktivitaeten und Aufgaben mit alter Schreibweise
-- bleiben unveraendert. Mehrfach ausfuehrbar, aendert keine Daten.
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
             'dauer_minuten', COALESCE(t.dauer_minuten, a.dauer),
             'url', btrim(a.url)
           ) AS eintrag
    FROM (VALUES
      ('erstgespraech'::text, 1::integer, 'Erstgespräch'::text, 30::integer,
       'Kurzes Kennenlernen am Telefon. Wir klären, worum es dir geht und ob wir zueinander passen.'::text,
       _erstlink::text),
      ('beratung', 2, 'Beratungsgespräch', 60,
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

  _link_investment := _l.investment_id;

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
    'investment_id', _link_investment,
    'investments', _investments,
    'kunde', _kunde
  );
END;
$$;

COMMENT ON FUNCTION public.partnertermin_zugang(text) IS
  'Oeffentlicher Zugang der Partner-Terminseite. Die Kundendaten kommen nur, wenn der Aufrufer als Besitzer des Links angemeldet ist.';

REVOKE ALL ON FUNCTION public.partnertermin_zugang(text) FROM public;
GRANT EXECUTE ON FUNCTION public.partnertermin_zugang(text) TO anon, authenticated;

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

  SELECT a.bezeichnung, a.dauer, btrim(a.url)
  INTO _bezeichnung, _dauer, _url
  FROM public.profiles p
  CROSS JOIN LATERAL (VALUES
    ('erstgespraech'::text, 'Erstgespräch'::text, 30::integer, p.buchungslink::text),
    ('beratung', 'Beratungsgespräch', 60, p.beratungslink),
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
  _dauer := COALESCE(_dauer_eigene, _dauer, 60);

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
   * Das Investment, drei Quellen in dieser Reihenfolge. Die Auswahl von der
   * Seite wird gegen die Investments dieses Kontakts geprueft: Ohne diese
   * Pruefung liesse sich von aussen ein fremdes Investment angeben.
   */
  _investment := _l.investment_id;

  IF _investment IS NULL AND _investment_id IS NOT NULL THEN
    SELECT i.id INTO _investment
    FROM public.investments i
    WHERE i.id = _investment_id
      AND i.kunde_id = _l.kontakt_id;
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

  SELECT b.* INTO _alt
  FROM public.buchungen b
  WHERE b.link_id = _l.id AND b.status <> 'abgesagt'
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF FOUND AND _l.einmalig THEN
    RAISE EXCEPTION 'Über diesen Link steht bereits ein Termin';
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
      'Vom Kunden im eigenen Kalender des Partners gebucht und hier bestätigt.',
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
      'Vom Kunden über die Terminseite bestätigt. Den Zugang verschickt der '
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
      'Vom Kunden über die Terminseite bestätigt.',
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
    PERFORM public.buchung_investment_vorwaerts(_l.kontakt_id, _stufe);
  END IF;

  RETURN jsonb_build_object(
    'datum', to_char(_buchung.start_at AT TIME ZONE _zone, 'YYYY-MM-DD'),
    'uhrzeit', to_char(_buchung.start_at AT TIME ZONE _zone, 'HH24:MI'),
    'anlass', _buchung.anlass,
    'bezeichnung', _buchung.bezeichnung,
    'dauer_minuten', _buchung.dauer_minuten,
    'investment_id', _investment
  );
END;
$$;

COMMENT ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) IS
  'Traegt den im fremden Kalender gebuchten Termin als Buchung, Aktivitaet und Aufgabe ein. Die Aufgabe traegt das Investment, damit der Termin im Vorgang erscheint.';

REVOKE ALL ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) TO anon, authenticated;

COMMIT;
