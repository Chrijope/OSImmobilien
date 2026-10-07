-- ===========================================================================
-- Wer sich selbst einen Gespraechstermin bucht, steht danach im Closing
-- ===========================================================================
--
-- WARUM
--
-- Im heutigen Bewerberprozess gibt es genau **einen** regulaeren Termin, das
-- persoenliche Gespraech als Videocall. So steht es in `bewerberArbeitsplatz.ts`
-- ("ein Videocall statt zwei Terminen"), und so rechnet auch das Closing:
-- `closingFortschritt.ts` verweist fuer Schritt 1 ausdruecklich auf den selbst
-- gebuchten Termin, weil es "im neuen Ablauf keinen Termin gibt, den jemand im
-- Reiter von Hand setzt".
--
-- Nur die Stufe wusste davon nichts. `bewerber_termin_buchen` schrieb Datum
-- und Uhrzeit an den Bewerber und liess die Pipelinestufe unberuehrt. Der
-- Bewerber blieb also im Eingang oder im Erstgespraech stehen, obwohl sein
-- Termin feststand. Aufgefallen am 16.09.2026 an Berat Kilapia: Termin
-- gebucht, Stufe unveraendert, und in der Spalte "Closing-Gespraech" ein
-- Strich.
--
-- Der Weg ueber das CRM tut das Richtige laengst: Die Termin-Karte im
-- Bewerberprofil (`src/components/bewerbung/ClosingTerminKarte.tsx`) setzt die
-- Stufe beim Speichern auf "Closing". Nur der Weg ueber den Bewerber selbst
-- tat es nicht. Dieselbe Luecke, dieselbe Stelle wie am 12.09.2026 beim
-- Erinnerungszaehler.
--
-- WAS SICH AENDERT
--
-- 1. Neue Hilfsfunktion `bewerber_stufe_closing`. Sie hebt die Stufe an, und
--    zwar **nur nach vorn**: aus dem Eingang und aus dem Erstgespraech. Wer
--    schon weiter ist (Closing, FollowUp, Bedenkzeit, Paketwahl, Vertrag,
--    Rechnung, Nutzer_anlegen, Aktiv) oder ausgeschieden ist (Abgelehnt,
--    KeinInteresse), bleibt unberuehrt. Eine Buchung darf niemanden
--    zurueckwerfen.
--
--    Der leere Wert und das alte 'eingegangen' stehen mit in der Liste: Das
--    ist der Spaltenvorgabewert aus der ersten Fassung der Tabelle, und
--    `migrateStatus` in `src/lib/bewerbungStore.ts` liest beides als
--    "Eingang".
--
-- 2. `bewerber_termin_buchen` und `bewerber_termin_verschieben` rufen sie.
--    Beide bestaetigen denselben Termin.
--
-- 3. Nachtrag fuer die Altfaelle: Bewerber, die vor dieser Migration gebucht
--    haben, deren Termin noch offen ist und noch bevorsteht. Ein Termin, der
--    laengst vorbei ist, wird bewusst NICHT nachgetragen: Steht dort noch
--    "Erstgespraech", hat HR den Bewerber nach dem Gespraech absichtlich dort
--    gelassen oder er ist nicht erschienen. Das nachtraeglich umzuschreiben
--    waere eine Behauptung ueber die Vergangenheit.
--
-- WAS SICH NICHT AENDERT
--
-- Datum und Uhrzeit bleiben, wo sie sind: in `meta.erstgespraechDatum` und
-- `meta.erstgespraechUhrzeit`. Sie werden NICHT zusaetzlich nach
-- `closingTerminDatum` kopiert. Zwei Gruende:
--
--   - Der Termin stuende zweimal in der Akte, und beim naechsten Verschieben
--     waere eine der beiden Angaben veraltet.
--   - Die Erinnerungskette haengt an den Feldern. `send-bewerber-erstgespraech-
--     reminders` liest `erstgespraechDatum`, `send-bewerber-closing-reminders`
--     liest `closingTerminDatum`. Stuende der Termin in beiden, bekaeme der
--     Bewerber zwei Staffeln Erinnerungsmails zum selben Gespraech.
--
-- Die Anzeige liest deshalb aus beiden Quellen, siehe `closingGespraechTermin`
-- in `src/lib/bewerberTermine.ts`. Das wirkt ohne diese Migration und auch fuer
-- jeden Altfall.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Die Stufe anheben, niemals senken
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bewerber_stufe_closing(_bewerbung uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bewerbungen
     SET status = 'Closing'
   WHERE id = _bewerbung
     AND COALESCE(status, '') IN ('', 'eingegangen', 'Eingang', 'Erstgespraech');
$$;

REVOKE ALL ON FUNCTION public.bewerber_stufe_closing(uuid) FROM public;

COMMENT ON FUNCTION public.bewerber_stufe_closing(uuid) IS
  'Hebt die Pipelinestufe eines Bewerbers auf Closing, aber nur aus Eingang und Erstgespraech. Wer weiter ist oder ausgeschieden, bleibt unberuehrt.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Die Buchung hebt die Stufe
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Die Bezeichnung, die ein Mensch liest: "Persoenliches Gespraech · Max Mustermann".
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

  /*
    Die Einladung durch HR, neu seit dem 12.09.2026.

    Sie steht als Zeitstempel `meta.kennenlernen.einladungAm` in der Bewerbung
    und wird von `src/lib/bewerberEinladung.ts` gesetzt. Bis dahin las keine
    der Buchungsfunktionen diesen Vermerk: Wer seinen Kennenlern-Token aus der
    Eingangsmail hatte, konnte die Buchungsseite direkt aufrufen und buchen,
    sobald er den Bogen abgeschickt hatte. Ob HR ihn je einladen wollte,
    spielte keine Rolle.

    Der Text ist bewusst keine Fehlermeldung, sondern eine Auskunft. Der
    Bewerber hat alles richtig gemacht, er ist nur noch nicht an der Reihe.
  */
  IF NOT COALESCE(
       (SELECT (b.meta -> 'kennenlernen' ->> 'einladungAm') IS NOT NULL
          FROM public.bewerbungen b
         WHERE b.id = _f.bewerbung_id),
       false)
  THEN
    RAISE EXCEPTION 'Deine Antworten sind angekommen. Sobald wir dich zum Gespräch einladen, kannst du hier deinen Termin wählen.';
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
  _titel := CASE
              WHEN _name <> '' THEN 'Persönliches Gespräch · ' || left(_name, 120)
              ELSE 'Persönliches Gespräch'
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
   * Nach `closingTerminDatum` wird bewusst NICHT zusaetzlich geschrieben,
   * siehe Kopf dieser Datei: Der Termin stuende zweimal in der Akte, und die
   * Erinnerungskette ginge zweimal hinaus.
   */
  UPDATE public.bewerbungen
     SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'erstgespraechDatum', to_char(_start AT TIME ZONE _zone, 'YYYY-MM-DD'),
           'erstgespraechUhrzeit', to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
           'erstgespraechBerater', COALESCE(_abzug ->> 'name', ''))
   WHERE id = _f.bewerbung_id;

  -- Neu am 16.09.2026: Mit dem Termin steht der Bewerber im Closing. Nur nach
  -- vorn, siehe `bewerber_stufe_closing`.
  PERFORM public.bewerber_stufe_closing(_f.bewerbung_id);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Das Verschieben bestaetigt denselben Termin
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bewerber_termin_verschieben(
  _token text,
  _start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bewerbung uuid;
  _absage text;
  _zone text;
  _ergebnis jsonb;
BEGIN
  SELECT f.bewerbung_id INTO _bewerbung
    FROM public.bewerber_formular f
   WHERE f.token = _token AND f.status = 'eingereicht'
   LIMIT 1;
  IF _bewerbung IS NULL THEN
    RAISE EXCEPTION 'Dieser Link ist uns unbekannt';
  END IF;

  SELECT b.absage_token INTO _absage
    FROM public.buchungen b
   WHERE b.bewerbung_id = _bewerbung AND b.status = 'offen'
   ORDER BY b.start_at DESC
   LIMIT 1;
  IF _absage IS NULL THEN
    RAISE EXCEPTION 'Dieser Termin laesst sich nicht mehr verschieben';
  END IF;

  _ergebnis := public.buchung_verschieben(_absage, _start);
  _zone := COALESCE(_ergebnis ->> 'zeitzone', 'Europe/Berlin');

  /*
    Neuer Zeitpunkt, und der Erinnerungszaehler faellt weg.

    Ohne das Entfernen sieht `send-bewerber-erstgespraech-reminders` den
    Vermerk `erstgespraechRemindersSent`, haelt den Anstoss fuer erledigt und
    schweigt zum neuen Termin. Der Weg ueber das CRM setzt ihn laengst zurueck
    (`src/components/bewerbung/ClosingTerminKarte.tsx`), nur der Weg ueber den
    Bewerber selbst tat es nicht.

    Entfernt statt auf null gesetzt, weil der Lauf auf Vorhandensein prueft.
  */
  UPDATE public.bewerbungen
     SET meta = (COALESCE(meta, '{}'::jsonb) - 'erstgespraechRemindersSent')
                || jsonb_build_object(
                     'erstgespraechDatum', to_char(_start AT TIME ZONE _zone, 'YYYY-MM-DD'),
                     'erstgespraechUhrzeit', to_char(_start AT TIME ZONE _zone, 'HH24:MI'))
   WHERE id = _bewerbung;

  -- Wie bei der Buchung: Ein verschobener Termin ist derselbe Termin. Wer
  -- noch im Eingang oder im Erstgespraech steht, kommt damit ins Closing.
  PERFORM public.bewerber_stufe_closing(_bewerbung);

  RETURN _ergebnis;
END;
$$;

-- Die Rechte bleiben wie gehabt; CREATE OR REPLACE laesst sie unberuehrt,
-- hier nur zur Sicherheit noch einmal ausdruecklich.
REVOKE ALL ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.bewerber_termin_verschieben(text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_verschieben(text, timestamptz) TO anon, authenticated;

COMMENT ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) IS
  'Terminbuchung des Bewerbers ueber den Kennenlern-Token. Verlangt eingereichten Bogen UND eine Einladung durch HR. Hebt die Stufe auf Closing.';
COMMENT ON FUNCTION public.bewerber_termin_verschieben(text, timestamptz) IS
  'Verschiebt den Gespraechstermin, setzt den Erinnerungszaehler zurueck und hebt die Stufe auf Closing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Nachtrag fuer die Altfaelle
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Zaehler vorher: Wie viele Bewerber haben einen offenen, noch bevorstehenden
-- Gespraechstermin und stehen trotzdem noch im Eingang oder im Erstgespraech?
--
--   select count(*)
--     from public.bewerbungen b
--    where coalesce(b.status, '') in ('', 'eingegangen', 'Eingang', 'Erstgespraech')
--      and exists (
--        select 1 from public.buchungen u
--         where u.bewerbung_id = b.id
--           and u.status = 'offen'
--           and u.start_at >= now());

UPDATE public.bewerbungen b
   SET status = 'Closing'
 WHERE COALESCE(b.status, '') IN ('', 'eingegangen', 'Eingang', 'Erstgespraech')
   AND EXISTS (
     SELECT 1 FROM public.buchungen u
      WHERE u.bewerbung_id = b.id
        AND u.status = 'offen'
        AND u.start_at >= now()
   );

-- Prueflauf: Dieselbe Zaehlung noch einmal. Sie muss jetzt 0 ergeben.
--
--   select count(*)
--     from public.bewerbungen b
--    where coalesce(b.status, '') in ('', 'eingegangen', 'Eingang', 'Erstgespraech')
--      and exists (
--        select 1 from public.buchungen u
--         where u.bewerbung_id = b.id
--           and u.status = 'offen'
--           and u.start_at >= now());
--
-- Und zur Kontrolle, wen es betroffen hat:
--
--   select b.vorname, b.nachname, b.status,
--          b.meta ->> 'erstgespraechDatum'  as termin_datum,
--          b.meta ->> 'erstgespraechUhrzeit' as termin_uhrzeit
--     from public.bewerbungen b
--     join public.buchungen u on u.bewerbung_id = b.id and u.status = 'offen'
--    where b.status = 'Closing'
--    order by u.start_at;
