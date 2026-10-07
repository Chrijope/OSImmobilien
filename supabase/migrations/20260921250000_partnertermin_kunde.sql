-- Die Terminseite nennt dem Partner den Kunden
--
-- GL am 21.09.2026: In der Partneransicht steht links die Karte "Dein
-- Ansprechpartner" mit dem eigenen Bild. Fuer den Partner ist das sinnlos, er
-- kennt sich selbst. Dort soll stattdessen stehen, mit wem er den Termin macht:
-- Name, E-Mail und Telefon des Kunden, ohne Bild.
--
-- ## Warum das nicht einfach mitgeliefert werden darf
--
-- Die Terminseite ist ohne Anmeldung erreichbar, und der Link geht per Mail an
-- den Kunden. Wer ihn weiterleitet, gibt sonst Telefonnummer und Adresse eines
-- Dritten mit heraus. Ein Merkmal in der Adresse (`?intern=1`) taugt dafuer
-- nicht: Was im Browser steht, laesst sich aendern.
--
-- Deshalb entscheidet die Datenbank, nicht die Oberflaeche. Die Kundendaten
-- kommen nur zurueck, wenn der Aufrufer **als der Besitzer des Links
-- angemeldet ist**, also genau der Partner, der ihn erzeugt hat. Fuer alle
-- anderen, auch fuer den Kunden selbst, bleibt das Feld leer. Das ist eine
-- technisch erzwungene Grenze und keine ausgeblendete Schaltflaeche.
--
-- Die uebrige Antwort bleibt unveraendert. Auch die vier Vergleiche stehen
-- weiter als uuid gegen uuid, siehe 20260921240000.

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
