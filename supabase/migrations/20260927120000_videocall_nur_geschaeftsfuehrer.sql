-- ===========================================================================
-- Videocall nur noch fuer den Geschaeftsfuehrer in der Rolle admin,
-- externer Kalender fuer alle getrennt davon
-- ===========================================================================
--
-- ENTSCHEIDUNG (GL, 27.09.2026)
--
-- Den internen Videocall (Videoraum, Buchungskalender mit eigenen Zeiten und
-- Terminarten, interne Buchungslinks) nutzt nur noch GL, und nur
-- in der Rolle admin. Niemand sonst: nicht Inhaber, nicht hr, nicht die
-- bisher einzeln freigeschalteten Personen. Bewerber buchen inzwischen ueber
-- einen externen Kalender, der Videoraum fuer Bewerber wird nicht gebraucht.
--
-- Der externe Kalender (Terminseite mit Calendly und Co.) bleibt fuer alle
-- wie bisher und haengt ab jetzt ausdruecklich NICHT am Videocall.
--
-- DIE TEILE
--
--   1. `darf_videocall`: nur die beiden Konten des Geschaeftsfuehrers mit der
--      Rolle admin. Die Datenbank kennt die aktive Rolle der Oberflaeche nicht,
--      deshalb `has_role`. `videocall_freigaben` wird nicht mehr gelesen, die
--      Eintraege bleiben stehen.
--   2. `buchung_links.ziel`: 'intern' (unsere Strecke mit Videoraum) oder
--      'extern' (Terminseite mit dem eigenen Kalender, nie ein Videoraum).
--      Nachbefuellt ueber das Praefix `terminwahl-`, mit dem die Oberflaeche
--      externe Links seit jeher anlegt. `terminart_id IS NULL` allein reicht
--      nicht: Beim Loeschen einer Terminart setzt die Datenbank sie auch bei
--      internen Links auf NULL.
--   3. `buchung_zugang_aufloesen`: loest nur noch interne Links und offene
--      Buchungsseiten auf, deren Gastgeber `darf_videocall` erfuellt. Daran
--      haengen `buchung_zugang`, `buchung_freie_zeiten` und `buchung_anlegen`.
--      Ein externer Link oder ein fremder Gastgeber wird damit neutral
--      abgelehnt ("Dieser Buchungslink ist nicht mehr gueltig"), schon beim
--      Oeffnen der Seite und nicht erst nach der Zeitwahl. Warum Ablehnen und
--      nicht Buchen ohne Raum: Die interne Strecke verspricht dem Kunden auf
--      der Seite und in der Bestaetigungsmail einen Videozugang. Ohne Raum
--      stuende ein Termin ohne jeden Weg zum Gespraech in der Akte.
--   4. `bewerber_termin_buchen`: Erfuellt der Gastgeber `darf_videocall`
--      nicht (fuer hr also immer), bricht die Buchung neutral ab ("Zurzeit
--      ist keine Terminbuchung moeglich") und legt nichts an. Die alte Seite
--      /kooperationsgespraech/:token verspricht einen Videocall; ein Termin
--      ohne Raum waere ein leeres Versprechen. Bewerber buchen inzwischen ueber
--      den externen Kalender in der Einladung.
--   5. Aktive interne Links von Gastgebern ohne `darf_videocall` werden auf
--      `aktiv = false` gesetzt. Externe Links bleiben unberuehrt. Nichts wird
--      geloescht.
--   6. Zeilenregeln: Die interne Raumverwaltung (Videoraeume samt Token und
--      `signal_geheimnis`, Teilnehmer, Buchungseinstellungen, Verfuegbarkeiten,
--      Terminarten) nur noch mit `darf_videocall`. Bisher kamen dort jeder
--      Admin und Inhaber, bei Terminarten auch hr und der Vertrieb heran.
--      Gastzugriffe laufen ueber Token-Funktionen mit SECURITY DEFINER und
--      bleiben, wie sie sind.
--      `buchung_links`: Externe Links darf jede interne Rolle fuer einen
--      Kontakt anlegen, den sie sieht (`kontakt_visible_to_internal`), und
--      Admin und Inhaber sehen externe Links wie bisher. Interne Links nur mit
--      `darf_videocall`. Ein Besitzer ohne Videocall kann einen alten internen
--      Link nicht wieder anschalten.
--      Beim Aendern gelten fuer externe Links dieselben Bedingungen wie beim
--      Anlegen. Zusaetzlich sperrt der Ausloeser
--      `trg_buchung_links_zuordnung` jede Aenderung von `kontakt_id` und
--      `mitarbeiter_id` ueber die Schnittstelle. Sonst liesse sich ein eigener
--      Link nachtraeglich auf einen fremden Kontakt umhaengen, und die
--      Terminseite zeigte und beschriebe dessen Akte.
--      `buchungen` bleiben unveraendert: Sie tragen keinen Raumzugang (nur
--      `videoraum_id`), und die Termine aus dem externen Kalender stehen dort.
--   7. `partnertermin_zugang` und `partnertermin_bestaetigen` (Terminseite mit
--      dem externen Kalender) nehmen nur noch Links mit `ziel = 'extern'` an.
--      Uebernommen aus 20260921250000 bzw. 20260921240000, ergaenzt ist allein
--      diese Bedingung.
--
-- Wiederholbar: Funktionen werden ersetzt, Regeln entfernt und neu angelegt,
-- die Spalte nur angelegt, wenn sie fehlt.
-- ===========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. darf_videocall
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.darf_videocall(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL
     -- Kennungen des Ursprungsprojekts entfernt (OSImmobilien). Eigene
     -- Geschaeftsfuehrer-Kennungen hier eintragen.
     AND _uid = ANY (ARRAY[]::uuid[])
     AND public.has_role(_uid, 'admin')
$$;

REVOKE ALL ON FUNCTION public.darf_videocall(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.darf_videocall(uuid) TO authenticated;

COMMENT ON FUNCTION public.darf_videocall(uuid) IS
  'Seit 27.09.2026: nur die Konten des Geschaeftsfuehrers mit der Rolle admin. videocall_freigaben wird nicht mehr gelesen.';

COMMENT ON TABLE public.videocall_freigaben IS
  'Seit 27.09.2026 ohne Wirkung: darf_videocall liest diese Tabelle nicht mehr. Eintraege bleiben als Historie stehen.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. buchung_links.ziel
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.buchung_links
  ADD COLUMN IF NOT EXISTS ziel text NOT NULL DEFAULT 'intern';

UPDATE public.buchung_links
   SET ziel = 'extern'
 WHERE ziel = 'intern'
   AND terminart_id IS NULL
   AND token LIKE 'terminwahl-%';

ALTER TABLE public.buchung_links DROP CONSTRAINT IF EXISTS buchung_links_ziel_chk;
ALTER TABLE public.buchung_links
  ADD CONSTRAINT buchung_links_ziel_chk
  CHECK (ziel IN ('intern', 'extern') AND (ziel = 'intern' OR terminart_id IS NULL));

COMMENT ON COLUMN public.buchung_links.ziel IS
  'intern: unsere Buchungsstrecke mit Videoraum (nur mit darf_videocall). extern: Terminseite mit dem eigenen Kalender des Partners, nie ein Videoraum.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. buchung_zugang_aufloesen: nur interne Links von Gastgebern mit Videocall
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.buchung_zugang_aufloesen(_token text)
RETURNS TABLE (
  art text,
  mitarbeiter_id uuid,
  link_id uuid,
  kontakt_id uuid,
  terminart_id uuid,
  kontakt_snapshot jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 'persoenlich'::text, l.mitarbeiter_id, l.id, l.kontakt_id, l.terminart_id, l.kontakt_snapshot
  FROM public.buchung_links l
  WHERE l.token = _token
    AND l.aktiv
    AND (l.gueltig_bis IS NULL OR l.gueltig_bis > now())
    -- Ein einmaliger Link ist verbraucht, sobald ueber ihn ein Termin steht.
    AND (NOT l.einmalig OR NOT EXISTS (
      SELECT 1 FROM public.buchungen b
      WHERE b.link_id = l.id AND b.status <> 'abgesagt'
    ))
    -- Seit 27.09.2026: Ein externer Link fuehrt nie in die interne Strecke,
    -- und die interne Strecke gibt es nur fuer Gastgeber mit Videocall.
    AND l.ziel = 'intern'
    AND public.darf_videocall(l.mitarbeiter_id)
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 'offen'::text, e.mitarbeiter_id, NULL::uuid, NULL::uuid, NULL::uuid, '{}'::jsonb
  FROM public.buchung_einstellungen e
  WHERE e.slug = lower(btrim(_token))
    AND e.offen_aktiv
    AND public.darf_videocall(e.mitarbeiter_id)
  LIMIT 1;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. bewerber_termin_buchen: nur mit Videocall des Gastgebers
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Unveraendert aus 20260916210000 bis auf die Pruefung von darf_videocall
-- nach der Wahl des Gastgebers.

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
  _raum_id uuid;
  _raum_token text;
  _buchung public.buchungen;
  _name text;
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

  -- Seit 27.09.2026: Diese Strecke verspricht einen Videocall. Ohne
  -- Videocall-Freigabe des Gastgebers gibt es keinen Raum, also auch keine
  -- Buchung. Neutral abbrechen, nichts anlegen.
  IF NOT public.darf_videocall(_gastgeber) THEN
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
  ) RETURNING id, token INTO _raum_id, _raum_token;

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
    _titel, 'bewerbergespraech', 'offen', public.buchung_token(), _raum_id
  ) RETURNING * INTO _buchung;

  UPDATE public.bewerbungen
     SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'erstgespraechDatum', to_char(_start AT TIME ZONE _zone, 'YYYY-MM-DD'),
           'erstgespraechUhrzeit', to_char(_start AT TIME ZONE _zone, 'HH24:MI'),
           'erstgespraechBerater', COALESCE(_abzug ->> 'name', ''))
   WHERE id = _f.bewerbung_id;

  PERFORM public.bewerber_stufe_closing(_f.bewerbung_id);

  RETURN jsonb_build_object(
    'id', _buchung.id,
    'start_at', _buchung.start_at,
    'ende_at', _buchung.ende_at,
    'dauer_minuten', _buchung.dauer_minuten,
    'bezeichnung', _buchung.bezeichnung,
    'status', _buchung.status,
    'raum_token', _raum_token,
    'zeitzone', _zone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) TO anon, authenticated;

COMMENT ON FUNCTION public.bewerber_termin_buchen(text, timestamptz) IS
  'Terminbuchung des Bewerbers ueber den Kennenlern-Token. Verlangt eingereichten Bogen UND eine Einladung durch HR. Hebt die Stufe auf Closing. Seit 27.09.2026 nur, wenn der Gastgeber darf_videocall erfuellt, sonst neutraler Abbruch ohne Buchung.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Interne Links von Gastgebern ohne Videocall abschalten
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  _anzahl integer;
BEGIN
  UPDATE public.buchung_links l
     SET aktiv = false
   WHERE l.aktiv
     AND l.ziel = 'intern'
     AND NOT public.darf_videocall(l.mitarbeiter_id);
  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  RAISE NOTICE 'Interne Buchungslinks abgeschaltet: %', _anzahl;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Zeilenregeln
-- ─────────────────────────────────────────────────────────────────────────────

-- Videoraeume: Anlegen wie bisher, lesen, aendern, loeschen nur mit Videocall.
DROP POLICY IF EXISTS "Videoraum lesen" ON public.videoraeume;
CREATE POLICY "Videoraum lesen" ON public.videoraeume
  FOR SELECT TO authenticated
  USING (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Videoraum aendern" ON public.videoraeume;
CREATE POLICY "Videoraum aendern" ON public.videoraeume
  FOR UPDATE TO authenticated
  USING (public.darf_videocall(auth.uid()))
  WITH CHECK (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Videoraum loeschen" ON public.videoraeume;
CREATE POLICY "Videoraum loeschen" ON public.videoraeume
  FOR DELETE TO authenticated
  USING (public.darf_videocall(auth.uid()));

-- Teilnehmer: nur mit Videocall. Gaeste kommen ueber die Token-Funktionen.
DROP POLICY IF EXISTS "Videoraum Teilnehmer lesen" ON public.videoraum_teilnehmer;
CREATE POLICY "Videoraum Teilnehmer lesen" ON public.videoraum_teilnehmer
  FOR SELECT TO authenticated
  USING (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Videoraum Teilnehmer aendern" ON public.videoraum_teilnehmer;
CREATE POLICY "Videoraum Teilnehmer aendern" ON public.videoraum_teilnehmer
  FOR UPDATE TO authenticated
  USING (public.darf_videocall(auth.uid()))
  WITH CHECK (public.darf_videocall(auth.uid()));

-- Buchungseinstellungen, Verfuegbarkeiten, Terminarten: der interne
-- Buchungskalender. Der externe Kalender braucht keine dieser Tabellen im
-- Browser, die Terminseite liest sie ueber SECURITY-DEFINER-Funktionen.
DROP POLICY IF EXISTS "Buchung Einstellungen lesen" ON public.buchung_einstellungen;
CREATE POLICY "Buchung Einstellungen lesen" ON public.buchung_einstellungen
  FOR SELECT TO authenticated
  USING (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Einstellungen aendern" ON public.buchung_einstellungen;
CREATE POLICY "Buchung Einstellungen aendern" ON public.buchung_einstellungen
  FOR UPDATE TO authenticated
  USING (public.darf_videocall(auth.uid()))
  WITH CHECK (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Verfuegbarkeit lesen" ON public.buchung_verfuegbarkeiten;
CREATE POLICY "Buchung Verfuegbarkeit lesen" ON public.buchung_verfuegbarkeiten
  FOR SELECT TO authenticated
  USING (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Verfuegbarkeit aendern" ON public.buchung_verfuegbarkeiten;
CREATE POLICY "Buchung Verfuegbarkeit aendern" ON public.buchung_verfuegbarkeiten
  FOR UPDATE TO authenticated
  USING (public.darf_videocall(auth.uid()))
  WITH CHECK (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Verfuegbarkeit loeschen" ON public.buchung_verfuegbarkeiten;
CREATE POLICY "Buchung Verfuegbarkeit loeschen" ON public.buchung_verfuegbarkeiten
  FOR DELETE TO authenticated
  USING (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Terminarten lesen" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten lesen" ON public.buchung_terminarten
  FOR SELECT TO authenticated
  USING (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Terminarten anlegen" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten anlegen" ON public.buchung_terminarten
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Terminarten aendern" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten aendern" ON public.buchung_terminarten
  FOR UPDATE TO authenticated
  USING (public.darf_videocall(auth.uid()))
  WITH CHECK (public.darf_videocall(auth.uid()));

DROP POLICY IF EXISTS "Buchung Terminarten loeschen" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten loeschen" ON public.buchung_terminarten
  FOR DELETE TO authenticated
  USING (public.darf_videocall(auth.uid()));

-- Buchungslinks: extern fuer alle internen Rollen, intern nur mit Videocall.
DROP POLICY IF EXISTS "Buchung Links lesen" ON public.buchung_links;
CREATE POLICY "Buchung Links lesen" ON public.buchung_links
  FOR SELECT TO authenticated
  USING (
    mitarbeiter_id = auth.uid()
    OR public.darf_videocall(auth.uid())
    OR (ziel = 'extern' AND public.is_admin_role(auth.uid()))
  );

DROP POLICY IF EXISTS "Buchung Links anlegen" ON public.buchung_links;
CREATE POLICY "Buchung Links anlegen" ON public.buchung_links
  FOR INSERT TO authenticated
  WITH CHECK (
    mitarbeiter_id = auth.uid()
    AND (
      public.darf_videocall(auth.uid())
      OR (
        ziel = 'extern'
        AND terminart_id IS NULL
        AND kontakt_id IS NOT NULL
        AND public.is_internal_role(auth.uid())
        AND public.kontakt_visible_to_internal(auth.uid(), kontakt_id::text)
      )
    )
  );

DROP POLICY IF EXISTS "Buchung Links aendern" ON public.buchung_links;
CREATE POLICY "Buchung Links aendern" ON public.buchung_links
  FOR UPDATE TO authenticated
  USING (
    mitarbeiter_id = auth.uid()
    OR public.darf_videocall(auth.uid())
    OR (ziel = 'extern' AND public.is_admin_role(auth.uid()))
  )
  WITH CHECK (
    public.darf_videocall(auth.uid())
    OR (
      ziel = 'extern'
      AND terminart_id IS NULL
      AND kontakt_id IS NOT NULL
      AND public.is_internal_role(auth.uid())
      AND public.kontakt_visible_to_internal(auth.uid(), kontakt_id::text)
      AND (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Buchung Links loeschen" ON public.buchung_links;
CREATE POLICY "Buchung Links loeschen" ON public.buchung_links
  FOR DELETE TO authenticated
  USING (
    mitarbeiter_id = auth.uid()
    OR public.darf_videocall(auth.uid())
    OR (ziel = 'extern' AND public.is_admin_role(auth.uid()))
  );

-- Kontakt und Besitzer eines Links aendern sich ueber die Schnittstelle nie.
-- Bewusst ueber `current_user` und nicht ueber `auth.uid()`: Direkte Aufrufe
-- laufen als `authenticated` bzw. `anon`, der Dienstschluessel und Funktionen
-- mit SECURITY DEFINER nicht. So bleibt `kontakte_zusammenfuehren` moeglich,
-- das die Links eines zusammengefuehrten Kontakts umhaengt und dabei mit
-- gesetztem `auth.uid()` laeuft. Die Funktion selbst ist deshalb bewusst
-- KEIN SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.buchung_links_zuordnung_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.kontakt_id IS DISTINCT FROM OLD.kontakt_id
      OR NEW.mitarbeiter_id IS DISTINCT FROM OLD.mitarbeiter_id)
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Kontakt und Besitzer eines Buchungslinks lassen sich nicht aendern'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_links_zuordnung_schuetzen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_buchung_links_zuordnung ON public.buchung_links;
CREATE TRIGGER trg_buchung_links_zuordnung
  BEFORE UPDATE ON public.buchung_links
  FOR EACH ROW EXECUTE FUNCTION public.buchung_links_zuordnung_schuetzen();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Terminseite mit dem externen Kalender: nur Links mit ziel = 'extern'
-- ─────────────────────────────────────────────────────────────────────────────

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

DROP FUNCTION IF EXISTS public.partnertermin_bestaetigen(text, text, text, text);

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
    RAISE EXCEPTION 'Zu viele Buchungen, bitte spaeter erneut versuchen';
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
      'Vom Kunden ueber die Terminseite bestaetigt.',
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
