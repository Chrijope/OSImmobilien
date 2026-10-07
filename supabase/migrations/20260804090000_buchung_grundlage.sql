-- Eigenes Buchungssystem, Grundlage.
--
-- Ziel ist, den fremden Buchungslink in `profiles.buchungslink` (heute
-- Calendly) langfristig zu ersetzen. Diese Migration legt ausschliesslich das
-- Datenmodell und den Zugang an, es gibt noch keine Oberflaeche.
--
-- Fuenf Tabellen:
--   buchung_einstellungen   je Mitarbeiter: offener Link an/aus, Kuerzel, Zone
--   buchung_terminarten     je Mitarbeiter: Bezeichnung, Dauer, Puffer, Fristen
--   buchung_verfuegbarkeiten  Wochenregeln und Ausnahmen (auch Urlaub)
--   buchung_links           persoenlicher Link, gilt fuer genau einen Kontakt
--   buchungen               der gebuchte Termin selbst
--
-- Der Buchende hat kein Konto. Er liest und schreibt deshalb ausschliesslich
-- ueber die SECURITY-DEFINER-Funktionen weiter unten, die Tabellen selbst sind
-- fuer `anon` vollstaendig gesperrt. Das ist dasselbe Muster wie bei
-- `videoraeume` und `mobile_scan_sessions`.
--
-- Bewusst noch eng gefasst: anlegen darf vorerst nur, wer `is_admin_role`
-- erfuellt (admin oder inhaber). Der bestehende `buchungslink` bleibt
-- unangetastet die Loesung fuer alle anderen. Sobald das Buchungssystem
-- freigegeben ist, werden genau diese INSERT-Policies erweitert.
--
-- Zufallstoken entstehen aus `gen_random_uuid()`, nicht aus
-- `gen_random_bytes()`. Die Erweiterung pgcrypto ist in diesem Projekt nicht
-- aktiv, siehe 20260803233000_videoraum_gasttoken_ohne_pgcrypto.sql.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.buchung_einstellungen (
  mitarbeiter_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Kuerzel des offenen Links, etwa "christian-peetz". Nur gesetzt, wenn der
  -- Mitarbeiter einen oeffentlichen Link haben will.
  slug text UNIQUE,
  -- Der offene Link muss abschaltbar sein. Ist er aus, fuehrt das Kuerzel ins
  -- Leere, die persoenlichen Links des Mitarbeiters bleiben aber gueltig.
  offen_aktiv boolean NOT NULL DEFAULT false,
  -- Alle Uhrzeiten der Verfuegbarkeiten sind Ortszeit in dieser Zone. Ohne sie
  -- waere "9 Uhr" mehrdeutig, sobald Sommerzeit oder ein Kunde im Ausland
  -- ins Spiel kommt.
  zeitzone text NOT NULL DEFAULT 'Europe/Berlin',
  begruessung text,
  hinweis text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buchung_einstellungen_slug_chk
    CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'),
  -- Ein offener Link ohne Kuerzel waere nicht erreichbar.
  CONSTRAINT buchung_einstellungen_offen_chk
    CHECK (NOT offen_aktiv OR slug IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.buchung_terminarten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bezeichnung text NOT NULL,
  beschreibung text,
  -- Ein Beratungsgespraech dauert standardmaessig 60 Minuten.
  dauer_minuten integer NOT NULL DEFAULT 60,
  -- Sperrzeit unmittelbar vor und nach dem Termin, etwa fuer Vorbereitung
  -- und Nachbereitung. Sie blockiert den Kalender, gehoert aber nicht zum
  -- Termin selbst.
  puffer_vor_minuten integer NOT NULL DEFAULT 0,
  puffer_nach_minuten integer NOT NULL DEFAULT 15,
  -- Vorlaufzeit: wie kurzfristig darf gebucht werden. Standard vier Stunden.
  vorlauf_minuten integer NOT NULL DEFAULT 240,
  -- Vorausschau: wie weit im Voraus darf gebucht werden.
  vorausschau_tage integer NOT NULL DEFAULT 60,
  -- Raster der angebotenen Startzeiten, etwa alle 15 Minuten.
  raster_minuten integer NOT NULL DEFAULT 15,
  aktiv boolean NOT NULL DEFAULT true,
  -- Ob die Terminart auch am offenen Link erscheint. Manche Terminart soll es
  -- nur ueber einen persoenlichen Link geben.
  oeffentlich boolean NOT NULL DEFAULT true,
  anlass text NOT NULL DEFAULT 'beratung',
  sortierung integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buchung_terminarten_anlass_chk
    CHECK (anlass IN ('beratung', 'objektvorstellung', 'sonstiges')),
  CONSTRAINT buchung_terminarten_dauer_chk
    CHECK (dauer_minuten BETWEEN 5 AND 600),
  CONSTRAINT buchung_terminarten_puffer_chk
    CHECK (puffer_vor_minuten BETWEEN 0 AND 240 AND puffer_nach_minuten BETWEEN 0 AND 240),
  CONSTRAINT buchung_terminarten_fristen_chk
    CHECK (vorlauf_minuten BETWEEN 0 AND 20160 AND vorausschau_tage BETWEEN 1 AND 365),
  CONSTRAINT buchung_terminarten_raster_chk
    CHECK (raster_minuten BETWEEN 5 AND 240)
);

CREATE INDEX IF NOT EXISTS buchung_terminarten_mitarbeiter_idx
  ON public.buchung_terminarten (mitarbeiter_id, sortierung);

-- Verfuegbarkeit in zwei Auspraegungen in einer Tabelle:
--   Wochenregel: `wochentag` gesetzt, `datum` leer. Gilt jede Woche.
--   Ausnahme:    `datum` gesetzt, `wochentag` leer. Gilt nur an diesem Tag und
--                ersetzt die Wochenregel vollstaendig. Mit `geschlossen = true`
--                ist das der Urlaubstag, ohne Uhrzeiten.
-- So kommen Urlaub und abweichende Einzeltage spaeter ohne neue Tabelle dazu.
CREATE TABLE IF NOT EXISTS public.buchung_verfuegbarkeiten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 0 = Sonntag bis 6 = Samstag, wie `getDay()` in JavaScript und wie
  -- `extract(dow ...)` in Postgres. Zwei Zaehlweisen waeren eine Fehlerquelle.
  wochentag smallint,
  datum date,
  von time,
  bis time,
  geschlossen boolean NOT NULL DEFAULT false,
  bemerkung text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buchung_verfuegbarkeiten_zuordnung_chk
    CHECK ((wochentag IS NULL) <> (datum IS NULL)),
  CONSTRAINT buchung_verfuegbarkeiten_wochentag_chk
    CHECK (wochentag IS NULL OR wochentag BETWEEN 0 AND 6),
  -- Ein geschlossener Tag braucht keine Uhrzeiten, ein offener schon.
  CONSTRAINT buchung_verfuegbarkeiten_zeiten_chk
    CHECK (geschlossen OR (von IS NOT NULL AND bis IS NOT NULL AND bis > von)),
  -- Geschlossen gibt es nur als Ausnahme an einem konkreten Tag. Ein ganzer
  -- Wochentag ohne Verfuegbarkeit entsteht dadurch, dass es fuer ihn keine
  -- Zeile gibt.
  CONSTRAINT buchung_verfuegbarkeiten_geschlossen_chk
    CHECK (NOT geschlossen OR datum IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS buchung_verfuegbarkeiten_mitarbeiter_idx
  ON public.buchung_verfuegbarkeiten (mitarbeiter_id, wochentag);
CREATE INDEX IF NOT EXISTS buchung_verfuegbarkeiten_datum_idx
  ON public.buchung_verfuegbarkeiten (mitarbeiter_id, datum)
  WHERE datum IS NOT NULL;

-- Persoenlicher Link je Kunde. Er gilt fuer genau diesen einen Kontakt, die
-- Zuordnung ist damit eindeutig und muss nicht aus Name oder E-Mail geraten
-- werden.
CREATE TABLE IF NOT EXISTS public.buchung_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  mitarbeiter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Ohne Fremdschluessel, wie bei `videoraeume.kontakt_id`: der Link soll
  -- einen geloeschten Kontakt ueberleben und nicht stillschweigend mitgehen.
  kontakt_id uuid NOT NULL,
  -- Abzug von Name und E-Mail zum Zeitpunkt der Anlage. So muss die
  -- oeffentliche Ansicht die Tabelle `kontakte` nicht aufmachen.
  kontakt_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Optional auf eine Terminart eingeschraenkt. Leer heisst: alle aktiven.
  terminart_id uuid REFERENCES public.buchung_terminarten(id) ON DELETE SET NULL,
  aktiv boolean NOT NULL DEFAULT true,
  -- Nur einmal buchbar. Fuer die Einladung zu genau einem Erstgespraech.
  einmalig boolean NOT NULL DEFAULT false,
  gueltig_bis timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buchung_links_mitarbeiter_idx
  ON public.buchung_links (mitarbeiter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS buchung_links_kontakt_idx
  ON public.buchung_links (kontakt_id);

CREATE TABLE IF NOT EXISTS public.buchungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitarbeiter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terminart_id uuid REFERENCES public.buchung_terminarten(id) ON DELETE SET NULL,
  link_id uuid REFERENCES public.buchung_links(id) ON DELETE SET NULL,
  -- Woher die Buchung kam. Bestimmt spaeter auch, ob ein Lead angelegt wird.
  quelle text NOT NULL DEFAULT 'offen',
  -- Der Kontakt, zu dem die Buchung gehoert. Beim persoenlichen Link sofort
  -- gesetzt, beim offenen Link erst, wenn der Buchende als Lead angelegt
  -- wurde. Ohne Fremdschluessel, siehe buchung_links.
  kontakt_id uuid,
  -- Die Aktivitaet, die aus dieser Buchung entstanden ist (art 'meeting').
  -- Damit haengt die Buchung an derselben Kette wie ein von Hand angelegter
  -- Termin: Kundenhistorie, naechster Kontakt, Pipeline-Ampel. Das Eintragen
  -- kommt in einem spaeteren Schritt, das Feld ist die Vorbereitung dafuer.
  aktivitaet_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  telefon text,
  nachricht text,
  start_at timestamptz NOT NULL,
  ende_at timestamptz NOT NULL,
  -- Abzug der Terminart zum Zeitpunkt der Buchung. Aendert der Mitarbeiter
  -- spaeter Dauer oder Puffer, verschiebt sich kein bereits gebuchter Termin
  -- und keine bereits blockierte Zeit.
  dauer_minuten integer NOT NULL,
  puffer_vor_minuten integer NOT NULL DEFAULT 0,
  puffer_nach_minuten integer NOT NULL DEFAULT 0,
  bezeichnung text,
  anlass text NOT NULL DEFAULT 'beratung',
  status text NOT NULL DEFAULT 'offen',
  -- Geheimnis des Buchenden. Damit kann er ohne Konto absagen und verschieben,
  -- aber nur seinen eigenen Termin.
  absage_token text NOT NULL UNIQUE,
  absage_grund text,
  abgesagt_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buchungen_quelle_chk CHECK (quelle IN ('persoenlich', 'offen', 'intern')),
  CONSTRAINT buchungen_status_chk CHECK (status IN ('offen', 'abgesagt', 'wahrgenommen')),
  CONSTRAINT buchungen_anlass_chk CHECK (anlass IN ('beratung', 'objektvorstellung', 'sonstiges')),
  CONSTRAINT buchungen_zeitraum_chk CHECK (ende_at > start_at)
);

-- Die Hauptabfrage: was liegt bei diesem Mitarbeiter in diesem Zeitraum.
CREATE INDEX IF NOT EXISTS buchungen_mitarbeiter_zeit_idx
  ON public.buchungen (mitarbeiter_id, start_at);
CREATE INDEX IF NOT EXISTS buchungen_kontakt_idx
  ON public.buchungen (kontakt_id) WHERE kontakt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS buchungen_link_idx
  ON public.buchungen (link_id) WHERE link_id IS NOT NULL;

DROP TRIGGER IF EXISTS buchung_einstellungen_set_updated_at ON public.buchung_einstellungen;
CREATE TRIGGER buchung_einstellungen_set_updated_at
  BEFORE UPDATE ON public.buchung_einstellungen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS buchung_terminarten_set_updated_at ON public.buchung_terminarten;
CREATE TRIGGER buchung_terminarten_set_updated_at
  BEFORE UPDATE ON public.buchung_terminarten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS buchung_verfuegbarkeiten_set_updated_at ON public.buchung_verfuegbarkeiten;
CREATE TRIGGER buchung_verfuegbarkeiten_set_updated_at
  BEFORE UPDATE ON public.buchung_verfuegbarkeiten
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS buchung_links_set_updated_at ON public.buchung_links;
CREATE TRIGGER buchung_links_set_updated_at
  BEFORE UPDATE ON public.buchung_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS buchungen_set_updated_at ON public.buchungen;
CREATE TRIGGER buchungen_set_updated_at
  BEFORE UPDATE ON public.buchungen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Zugriffskontrolle
--
-- Grundsatz ueberall gleich: Ein Mitarbeiter sieht und aendert nur sein
-- Eigenes, `is_admin_role` darf alles. Anlegen darf bis zur Freigabe nur
-- admin oder inhaber.
-- ---------------------------------------------------------------------------

ALTER TABLE public.buchung_einstellungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buchung_terminarten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buchung_verfuegbarkeiten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buchung_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buchungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buchung Einstellungen lesen" ON public.buchung_einstellungen;
CREATE POLICY "Buchung Einstellungen lesen" ON public.buchung_einstellungen
  FOR SELECT TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Einstellungen anlegen" ON public.buchung_einstellungen;
CREATE POLICY "Buchung Einstellungen anlegen" ON public.buchung_einstellungen
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Einstellungen aendern" ON public.buchung_einstellungen;
CREATE POLICY "Buchung Einstellungen aendern" ON public.buchung_einstellungen
  FOR UPDATE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()))
  WITH CHECK (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Terminarten lesen" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten lesen" ON public.buchung_terminarten
  FOR SELECT TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Terminarten anlegen" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten anlegen" ON public.buchung_terminarten
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Terminarten aendern" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten aendern" ON public.buchung_terminarten
  FOR UPDATE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()))
  WITH CHECK (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Terminarten loeschen" ON public.buchung_terminarten;
CREATE POLICY "Buchung Terminarten loeschen" ON public.buchung_terminarten
  FOR DELETE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Verfuegbarkeit lesen" ON public.buchung_verfuegbarkeiten;
CREATE POLICY "Buchung Verfuegbarkeit lesen" ON public.buchung_verfuegbarkeiten
  FOR SELECT TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Verfuegbarkeit anlegen" ON public.buchung_verfuegbarkeiten;
CREATE POLICY "Buchung Verfuegbarkeit anlegen" ON public.buchung_verfuegbarkeiten
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Verfuegbarkeit aendern" ON public.buchung_verfuegbarkeiten;
CREATE POLICY "Buchung Verfuegbarkeit aendern" ON public.buchung_verfuegbarkeiten
  FOR UPDATE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()))
  WITH CHECK (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Verfuegbarkeit loeschen" ON public.buchung_verfuegbarkeiten;
CREATE POLICY "Buchung Verfuegbarkeit loeschen" ON public.buchung_verfuegbarkeiten
  FOR DELETE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Links lesen" ON public.buchung_links;
CREATE POLICY "Buchung Links lesen" ON public.buchung_links
  FOR SELECT TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Links anlegen" ON public.buchung_links;
CREATE POLICY "Buchung Links anlegen" ON public.buchung_links
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Links aendern" ON public.buchung_links;
CREATE POLICY "Buchung Links aendern" ON public.buchung_links
  FOR UPDATE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()))
  WITH CHECK (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchung Links loeschen" ON public.buchung_links;
CREATE POLICY "Buchung Links loeschen" ON public.buchung_links
  FOR DELETE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchungen lesen" ON public.buchungen;
CREATE POLICY "Buchungen lesen" ON public.buchungen
  FOR SELECT TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

-- Von Hand angelegte Buchungen sind bis zur Freigabe ebenfalls admin/inhaber
-- vorbehalten. Der Buchende ohne Konto laeuft ohnehin nicht ueber diese
-- Policy, sondern ueber `buchung_anlegen`.
DROP POLICY IF EXISTS "Buchungen anlegen" ON public.buchungen;
CREATE POLICY "Buchungen anlegen" ON public.buchungen
  FOR INSERT TO authenticated
  WITH CHECK (mitarbeiter_id = auth.uid() AND public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchungen aendern" ON public.buchungen;
CREATE POLICY "Buchungen aendern" ON public.buchungen
  FOR UPDATE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()))
  WITH CHECK (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Buchungen loeschen" ON public.buchungen;
CREATE POLICY "Buchungen loeschen" ON public.buchungen
  FOR DELETE TO authenticated
  USING (mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid()));

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen, nur intern
-- ---------------------------------------------------------------------------

-- Ein Token, das sich nicht erraten laesst: 64 Hexzeichen aus zwei UUIDs.
CREATE OR REPLACE FUNCTION public.buchung_token()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '')
$$;

-- Loest einen Zugangstoken auf: entweder ein persoenlicher Link oder das
-- Kuerzel eines offenen Links. Gibt nur Kennungen zurueck, keine Daten, und
-- ist deshalb bewusst nicht fuer `anon` freigegeben.
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
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 'offen'::text, e.mitarbeiter_id, NULL::uuid, NULL::uuid, NULL::uuid, '{}'::jsonb
  FROM public.buchung_einstellungen e
  WHERE e.slug = lower(btrim(_token))
    AND e.offen_aktiv
  LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- Oeffentlicher Zugang des Buchenden, ausschliesslich ueber diese Funktionen
-- ---------------------------------------------------------------------------

-- 1) Was der Buchende ueberhaupt zu sehen bekommt: der Berater und seine
--    buchbaren Terminarten. Keine internen Notizen, keine fremden Termine.
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

-- 2) Die freien Zeitfenster. Herzstueck des Ganzen.
--
--    Beruecksichtigt Wochenregeln, Ausnahmen und Urlaub, die Vorlaufzeit, die
--    Vorausschau sowie alle bereits gebuchten Termine samt ihrer Puffer. Ein
--    Vorschlag belegt dabei nicht nur seine Dauer, sondern auch seinen eigenen
--    Puffer davor und dahinter.
--
--    Die Rechenweise ist absichtlich dieselbe wie in
--    src/lib/buchungZeitfenster.ts. Wer eine der beiden aendert, muss die
--    andere mitaendern.
CREATE OR REPLACE FUNCTION public.buchung_freie_zeiten(
  _token text,
  _terminart_id uuid,
  _von date,
  _bis date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z record;
  _art public.buchung_terminarten;
  _zone text;
  _tag date;
  _letzter_tag date;
  _fenster record;
  _start timestamptz;
  _ende timestamptz;
  _block_von timestamptz;
  _block_bis timestamptz;
  _frueheste timestamptz;
  _spaeteste timestamptz;
  _treffer jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO _z FROM public.buchung_zugang_aufloesen(_token);
  IF _z.mitarbeiter_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO _art
  FROM public.buchung_terminarten t
  WHERE t.id = _terminart_id
    AND t.mitarbeiter_id = _z.mitarbeiter_id
    AND t.aktiv
    AND (_z.art = 'persoenlich' OR t.oeffentlich)
    AND (_z.terminart_id IS NULL OR t.id = _z.terminart_id);
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _z.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  _frueheste := now() + make_interval(mins => _art.vorlauf_minuten);
  _spaeteste := now() + make_interval(days => _art.vorausschau_tage);

  _tag := GREATEST(COALESCE(_von, (now() AT TIME ZONE _zone)::date),
                   (now() AT TIME ZONE _zone)::date);
  _letzter_tag := LEAST(COALESCE(_bis, _tag + 31), (_spaeteste AT TIME ZONE _zone)::date);
  -- Deckel gegen zu grosse Abfragen ueber den oeffentlichen Zugang.
  _letzter_tag := LEAST(_letzter_tag, _tag + 62);

  WHILE _tag <= _letzter_tag LOOP
    FOR _fenster IN
      -- Eine Ausnahme fuer diesen Tag ersetzt die Wochenregel vollstaendig.
      -- Ist sie als geschlossen hinterlegt, bleibt gar nichts uebrig.
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _z.mitarbeiter_id
        AND v.datum = _tag
        AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _z.mitarbeiter_id
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _z.mitarbeiter_id AND a.datum = _tag
        )
      ORDER BY 1
    LOOP
      _start := (_tag + _fenster.von) AT TIME ZONE _zone;
      LOOP
        _ende := _start + make_interval(mins => _art.dauer_minuten);
        EXIT WHEN _ende > ((_tag + _fenster.bis) AT TIME ZONE _zone);

        IF _start >= _frueheste AND _start <= _spaeteste THEN
          _block_von := _start - make_interval(mins => _art.puffer_vor_minuten);
          _block_bis := _ende + make_interval(mins => _art.puffer_nach_minuten);

          IF NOT EXISTS (
            SELECT 1 FROM public.buchungen b
            WHERE b.mitarbeiter_id = _z.mitarbeiter_id
              AND b.status <> 'abgesagt'
              AND b.start_at - make_interval(mins => b.puffer_vor_minuten) < _block_bis
              AND b.ende_at + make_interval(mins => b.puffer_nach_minuten) > _block_von
          ) THEN
            _treffer := _treffer || to_jsonb(to_char(_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
          END IF;
        END IF;

        _start := _start + make_interval(mins => _art.raster_minuten);
      END LOOP;
    END LOOP;
    _tag := _tag + 1;
  END LOOP;

  RETURN _treffer;
END;
$$;

-- 3) Buchen. Prueft die Regeln noch einmal vollstaendig nach, denn was die
--    Oberflaeche anbietet, ist nur ein Vorschlag.
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

  -- Bremse gegen automatisiertes Zumuellen eines bekannten offenen Links.
  IF (SELECT count(*) FROM public.buchungen b
      WHERE b.mitarbeiter_id = _z.mitarbeiter_id
        AND b.created_at > now() - interval '1 hour') > 20 THEN
    RAISE EXCEPTION 'Zu viele Buchungen, bitte spaeter erneut versuchen';
  END IF;

  INSERT INTO public.buchungen (
    mitarbeiter_id, terminart_id, link_id, quelle, kontakt_id,
    name, email, telefon, nachricht,
    start_at, ende_at, dauer_minuten, puffer_vor_minuten, puffer_nach_minuten,
    bezeichnung, anlass, status, absage_token
  ) VALUES (
    _z.mitarbeiter_id, _art.id, _z.link_id, _z.art, _z.kontakt_id,
    _name_sauber, _email_sauber, left(btrim(COALESCE(_telefon, '')), 40),
    left(btrim(COALESCE(_nachricht, '')), 2000),
    _start, _ende, _art.dauer_minuten, _art.puffer_vor_minuten, _art.puffer_nach_minuten,
    _art.bezeichnung, _art.anlass, 'offen', public.buchung_token()
  ) RETURNING * INTO _buchung;

  RETURN jsonb_build_object(
    'id', _buchung.id,
    'absage_token', _buchung.absage_token,
    'start_at', _buchung.start_at,
    'ende_at', _buchung.ende_at,
    'bezeichnung', _buchung.bezeichnung,
    'dauer_minuten', _buchung.dauer_minuten,
    'zeitzone', _zone
  );
END;
$$;

-- 4) Was der Buchende von seinem eigenen Termin sehen darf.
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

-- 5) Absagen. Der Termin bleibt stehen, damit die Historie vollstaendig ist.
CREATE OR REPLACE FUNCTION public.buchung_absagen(
  _absage_token text,
  _grund text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _buchung public.buchungen;
BEGIN
  UPDATE public.buchungen b
  SET status = 'abgesagt',
      absage_grund = left(btrim(COALESCE(_grund, '')), 500),
      abgesagt_at = now()
  WHERE b.absage_token = _absage_token
    AND b.status = 'offen'
  RETURNING * INTO _buchung;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieser Termin laesst sich nicht mehr absagen';
  END IF;

  RETURN jsonb_build_object('id', _buchung.id, 'status', _buchung.status);
END;
$$;

-- 6) Verschieben. Derselbe Termin, neue Zeit, gleicher Token. Die Pruefungen
--    sind dieselben wie beim Anlegen.
CREATE OR REPLACE FUNCTION public.buchung_verschieben(
  _absage_token text,
  _start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alt public.buchungen;
  _art public.buchung_terminarten;
  _zone text;
  _tag date;
  _ende timestamptz;
  _neu public.buchungen;
BEGIN
  SELECT * INTO _alt FROM public.buchungen WHERE absage_token = _absage_token AND status = 'offen';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieser Termin laesst sich nicht mehr verschieben';
  END IF;

  SELECT * INTO _art FROM public.buchung_terminarten WHERE id = _alt.terminart_id;

  IF _start IS NULL THEN
    RAISE EXCEPTION 'Bitte eine Startzeit angeben';
  END IF;
  IF _start < now() + make_interval(mins => COALESCE(_art.vorlauf_minuten, 0)) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu kurzfristig';
  END IF;
  IF _start > now() + make_interval(days => COALESCE(_art.vorausschau_tage, 60)) THEN
    RAISE EXCEPTION 'Dieser Termin liegt zu weit in der Zukunft';
  END IF;

  SELECT COALESCE(e.zeitzone, 'Europe/Berlin') INTO _zone
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _alt.mitarbeiter_id;
  _zone := COALESCE(_zone, 'Europe/Berlin');

  -- Dauer und Puffer bleiben die der urspruenglichen Buchung.
  _ende := _start + make_interval(mins => _alt.dauer_minuten);
  _tag := (_start AT TIME ZONE _zone)::date;

  IF NOT EXISTS (
    WITH fenster AS (
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _alt.mitarbeiter_id AND v.datum = _tag AND NOT v.geschlossen
      UNION ALL
      SELECT v.von, v.bis
      FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = _alt.mitarbeiter_id
        AND v.wochentag = EXTRACT(dow FROM _tag)::smallint
        AND NOT EXISTS (
          SELECT 1 FROM public.buchung_verfuegbarkeiten a
          WHERE a.mitarbeiter_id = _alt.mitarbeiter_id AND a.datum = _tag
        )
    )
    SELECT 1 FROM fenster f
    WHERE _start >= (_tag + f.von) AT TIME ZONE _zone
      AND _ende <= (_tag + f.bis) AT TIME ZONE _zone
  ) THEN
    RAISE EXCEPTION 'Zu dieser Zeit ist kein Termin moeglich';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('buchung:' || _alt.mitarbeiter_id::text));

  -- Der eigene Termin darf sich selbst nicht im Weg stehen.
  IF EXISTS (
    SELECT 1 FROM public.buchungen b
    WHERE b.mitarbeiter_id = _alt.mitarbeiter_id
      AND b.id <> _alt.id
      AND b.status <> 'abgesagt'
      AND b.start_at - make_interval(mins => b.puffer_vor_minuten)
          < _ende + make_interval(mins => _alt.puffer_nach_minuten)
      AND b.ende_at + make_interval(mins => b.puffer_nach_minuten)
          > _start - make_interval(mins => _alt.puffer_vor_minuten)
  ) THEN
    RAISE EXCEPTION 'Diese Zeit ist inzwischen vergeben';
  END IF;

  UPDATE public.buchungen
  SET start_at = _start, ende_at = _ende
  WHERE id = _alt.id
  RETURNING * INTO _neu;

  RETURN jsonb_build_object(
    'id', _neu.id,
    'start_at', _neu.start_at,
    'ende_at', _neu.ende_at,
    'zeitzone', _zone
  );
END;
$$;

-- Die Tabellen bleiben fuer `anon` gesperrt, offen ist nur dieser schmale
-- Ausschnitt. `buchung_zugang_aufloesen` und `buchung_token` sind reine
-- Hilfsfunktionen und ausdruecklich nicht dabei.
REVOKE ALL ON FUNCTION public.buchung_token() FROM public;
REVOKE ALL ON FUNCTION public.buchung_zugang_aufloesen(text) FROM public;
REVOKE ALL ON FUNCTION public.buchung_zugang(text) FROM public;
REVOKE ALL ON FUNCTION public.buchung_freie_zeiten(text, uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.buchung_ansicht(text) FROM public;
REVOKE ALL ON FUNCTION public.buchung_absagen(text, text) FROM public;
REVOKE ALL ON FUNCTION public.buchung_verschieben(text, timestamptz) FROM public;

GRANT EXECUTE ON FUNCTION public.buchung_zugang(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buchung_freie_zeiten(text, uuid, date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buchung_anlegen(text, uuid, timestamptz, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buchung_ansicht(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buchung_absagen(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buchung_verschieben(text, timestamptz) TO anon, authenticated;
