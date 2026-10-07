-- ===========================================================================
-- Abwesenheit mit Vertretung
-- ===========================================================================
--
-- Ausgangslage: Ein Lead haengt an genau einer Person, naemlich an
-- `kontakte.zustaendig_id`. Faellt die Person aus, faellt der Lead mit aus.
-- Es gibt bisher keinen Abwesenheitsschalter und keine Vertretung.
--
-- Bewusste Entscheidung: Die Zustaendigkeit wechselt NICHT. An ihr haengt die
-- Provision, ein automatischer Eigentuemerwechsel waere ein Eingriff in die
-- Verguetung. Die Vertretung bekommt Zugriff und die Meldungen, mehr nicht.
-- Ein Umhaengen bleibt eine bewusste Handlung und gibt es bereits.
--
-- Diese Migration bringt:
--   1. Tabelle public.abwesenheiten (wer, von wann bis wann, wer vertritt)
--   2. Helfer public.ist_aktive_vertretung
--   3. Die vorhandene Eigentumspruefung is_vp_owner_of_kontakt kennt jetzt
--      zusaetzlich den Vertretungsfall. Damit greift die Vertretung ueberall
--      dort, wo die Eigentumsregel heute schon greift: kontakte,
--      aktivitaeten, follow_ups, activity_log, kunde_dokumente.
--   4. Loeschen bleibt dem Eigentuemer vorbehalten, die Vertretung darf nicht
--      loeschen.
--   5. Die Vertretung kann die Zustaendigkeit nicht auf sich selbst ziehen.
--   6. Benachrichtigungen zu Leads des Abwesenden bekommt die Vertretung als
--      Kopie.

-- ---------------------------------------------------------------------------
-- 1) Tabelle
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.abwesenheiten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Wer ist abwesend.
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Beide Tage zaehlen mit, der Zeitraum ist einschliesslich.
  von date NOT NULL,
  bis date NOT NULL,
  -- Wer vertritt. Darf leer bleiben, dann ist die Abwesenheit nur vermerkt
  -- und es aendert sich an Zugriff und Meldungen nichts.
  vertretung_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notiz text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT abwesenheiten_zeitraum_gueltig CHECK (bis >= von),
  CONSTRAINT abwesenheiten_nicht_selbst CHECK (vertretung_id IS DISTINCT FROM user_id)
);

COMMENT ON TABLE public.abwesenheiten IS
  'Abwesenheit eines Nutzers mit optionaler Vertretung. Waehrend des Zeitraums '
  'sieht die Vertretung die Leads des Abwesenden und bekommt dessen '
  'Lead-Benachrichtigungen als Kopie. Die Zustaendigkeit selbst bleibt '
  'unveraendert, weil an ihr die Provision haengt.';

CREATE INDEX IF NOT EXISTS idx_abwesenheiten_user_zeitraum
  ON public.abwesenheiten (user_id, von, bis);

CREATE INDEX IF NOT EXISTS idx_abwesenheiten_vertretung_zeitraum
  ON public.abwesenheiten (vertretung_id, von, bis)
  WHERE vertretung_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Pruefung beim Schreiben
-- ---------------------------------------------------------------------------
--
-- Zwei ueberlappende Eintraege derselben Person waeren nicht falsch, aber
-- unlesbar: Welche Vertretung gilt dann? Deshalb wird die Ueberschneidung
-- verhindert, statt sie spaeter irgendwie aufzuloesen.

CREATE OR REPLACE FUNCTION public.abwesenheit_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vertretung_id IS NOT NULL
     AND NOT public.is_internal_role(NEW.vertretung_id) THEN
    RAISE EXCEPTION 'Die Vertretung muss ein interner Nutzer sein.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.abwesenheiten a
     WHERE a.user_id = NEW.user_id
       AND a.id <> NEW.id
       AND a.von <= NEW.bis
       AND a.bis >= NEW.von
  ) THEN
    RAISE EXCEPTION 'Für diesen Zeitraum ist bereits eine Abwesenheit eingetragen.';
  END IF;

  NEW.aktualisiert_am := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abwesenheit_pruefen ON public.abwesenheiten;
CREATE TRIGGER trg_abwesenheit_pruefen
  BEFORE INSERT OR UPDATE ON public.abwesenheiten
  FOR EACH ROW EXECUTE FUNCTION public.abwesenheit_pruefen();

-- ---------------------------------------------------------------------------
-- 3) RLS auf der Tabelle selbst
-- ---------------------------------------------------------------------------

ALTER TABLE public.abwesenheiten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Interne sehen Abwesenheiten" ON public.abwesenheiten;
CREATE POLICY "Interne sehen Abwesenheiten"
ON public.abwesenheiten FOR SELECT TO authenticated
USING (public.is_internal_role(auth.uid()));

-- Eintragen darf jeder fuer sich selbst, ausserdem die Leitung fuer andere.
DROP POLICY IF EXISTS "Eigene Abwesenheit eintragen" ON public.abwesenheiten;
CREATE POLICY "Eigene Abwesenheit eintragen"
ON public.abwesenheiten FOR INSERT TO authenticated
WITH CHECK (
  (user_id = auth.uid() AND public.is_internal_role(auth.uid()))
  OR public.is_admin_role(auth.uid())
);

DROP POLICY IF EXISTS "Eigene Abwesenheit aendern" ON public.abwesenheiten;
CREATE POLICY "Eigene Abwesenheit aendern"
ON public.abwesenheiten FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_admin_role(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Eigene Abwesenheit loeschen" ON public.abwesenheiten;
CREATE POLICY "Eigene Abwesenheit loeschen"
ON public.abwesenheiten FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_admin_role(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4) Helfer: vertritt _user_id gerade den _zustaendig_id?
-- ---------------------------------------------------------------------------
--
-- Zeitlich begrenzt auf den eingetragenen Zeitraum, beide Tage zaehlen mit.
-- Massgeblich ist der Kalendertag in Europe/Berlin, nicht UTC: Sonst waere
-- eine Vertretung, die "bis heute" laeuft, nach deutscher Zeit schon am
-- Vorabend um 22 Uhr beendet oder umgekehrt einen Tag zu lang aktiv.

CREATE OR REPLACE FUNCTION public.ist_aktive_vertretung(_user_id uuid, _zustaendig_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
     AND _zustaendig_id IS NOT NULL
     AND _user_id <> _zustaendig_id
     AND EXISTS (
       SELECT 1
         FROM public.abwesenheiten a
        WHERE a.user_id = _zustaendig_id
          AND a.vertretung_id = _user_id
          AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN a.von AND a.bis
     )
$$;

COMMENT ON FUNCTION public.ist_aktive_vertretung(uuid, uuid) IS
  'Wahr, wenn _user_id die Person _zustaendig_id heute laut Tabelle '
  'abwesenheiten vertritt. Grundlage aller Vertretungsrechte.';

-- ---------------------------------------------------------------------------
-- 5) Eigentum und Vertretung sauber trennen
-- ---------------------------------------------------------------------------
--
-- Bisher gab es nur is_vp_owner_of_kontakt. Sie wird an vielen Stellen
-- benutzt (kontakte, kontakt_visible_to_internal, can_manage_kunde_dokumente,
-- activity_log). Statt jede dieser Stellen anzufassen, bekommt die eine
-- Funktion den Vertretungsfall dazu. Das echte Eigentum steht ab jetzt in
-- is_vp_eigentuemer_of_kontakt und wird dort gebraucht, wo eine Vertretung
-- ausdruecklich nicht reichen soll.

CREATE OR REPLACE FUNCTION public.is_vp_eigentuemer_of_kontakt(_user_id uuid, _zustaendig_id uuid, _meta jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _zustaendig_id = _user_id
    OR (_meta ->> 'erstelltVonId') = _user_id::text
    OR (_meta ->> 'empfehlungsgeberVpId') = _user_id::text
$$;

COMMENT ON FUNCTION public.is_vp_eigentuemer_of_kontakt(uuid, uuid, jsonb) IS
  'Echtes Eigentum an einem Kontakt, ohne Vertretung. Genau der Rumpf, den '
  'is_vp_owner_of_kontakt bis zur Vertretungs-Migration hatte.';

CREATE OR REPLACE FUNCTION public.is_vp_owner_of_kontakt(_user_id uuid, _zustaendig_id uuid, _meta jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_vp_eigentuemer_of_kontakt(_user_id, _zustaendig_id, _meta)
    OR public.ist_aktive_vertretung(_user_id, _zustaendig_id)
$$;

COMMENT ON FUNCTION public.is_vp_owner_of_kontakt(uuid, uuid, jsonb) IS
  'Darf dieser Nutzer den Kontakt sehen und bearbeiten? Eigentum oder eine '
  'heute laufende Vertretung. Loeschen richtet sich bewusst nach '
  'is_vp_eigentuemer_of_kontakt, nicht hiernach.';

-- Loeschen bleibt beim Eigentuemer. Eine Vertretung soll aushelfen, nicht
-- aufraeumen.
DROP POLICY IF EXISTS "Vertriebspartner loeschen eigene Kontakte" ON public.kontakte;
CREATE POLICY "Vertriebspartner loeschen eigene Kontakte"
ON public.kontakte FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'vertriebspartner')
  AND public.is_vp_eigentuemer_of_kontakt(auth.uid(), zustaendig_id, meta)
);

-- ---------------------------------------------------------------------------
-- 6) Die Vertretung darf die Zustaendigkeit nicht verschieben
-- ---------------------------------------------------------------------------
--
-- Die UPDATE-Policy auf kontakte hat keine eigene WITH-CHECK-Klausel, es gilt
-- also die USING-Bedingung auch fuer die neue Zeile. Eine Vertretung koennte
-- damit zustaendig_id auf sich selbst setzen und waere danach Eigentuemerin.
-- An der Zustaendigkeit haengt die Provision, deshalb wird das hier hart
-- unterbunden. Umhaengen bleibt der Leitung und dem Eigentuemer moeglich.

CREATE OR REPLACE FUNCTION public.kontakt_zustaendigkeit_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Frueh aussteigen, damit der haeufige Fall (Zustaendigkeit unveraendert)
  -- keine einzige Rollenabfrage kostet.
  IF NEW.zustaendig_id IS NOT DISTINCT FROM OLD.zustaendig_id THEN
    RETURN NEW;
  END IF;
  -- Ohne angemeldeten Nutzer laeuft ein Cron oder eine Edge Function mit dem
  -- Service-Key. Die haben ohnehin volle Rechte.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin_role(auth.uid())
     AND public.ist_aktive_vertretung(auth.uid(), OLD.zustaendig_id)
     AND NOT public.is_vp_eigentuemer_of_kontakt(auth.uid(), OLD.zustaendig_id, OLD.meta)
  THEN
    RAISE EXCEPTION 'Als Vertretung kannst du die Zuständigkeit nicht ändern. An ihr hängt die Provision.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kontakt_zustaendigkeit_schuetzen ON public.kontakte;
CREATE TRIGGER trg_kontakt_zustaendigkeit_schuetzen
  BEFORE UPDATE ON public.kontakte
  FOR EACH ROW EXECUTE FUNCTION public.kontakt_zustaendigkeit_schuetzen();

-- ---------------------------------------------------------------------------
-- 7) Benachrichtigungen an die Vertretung
-- ---------------------------------------------------------------------------
--
-- Warum genau hier: Jeder Meldeweg im Projekt endet in einem INSERT auf
-- public.benachrichtigungen. Der Client ueber bellNotifications, die
-- Datenbank-Trigger, die Warteschlange scheduled_notifications und die Edge
-- Functions schreiben alle in dieselbe Tabelle. Ein Trigger darauf ist die
-- einzige Stelle, an der alle Wege zusammenlaufen. Jeden Weg einzeln
-- umzubauen waere dieselbe Regel an einem Dutzend Stellen.
--
-- Die Vertretung bekommt eine Kopie, keine Umleitung. Das Original bleibt beim
-- Abwesenden, damit nach der Rueckkehr nichts fehlt.

ALTER TABLE public.benachrichtigungen
  ADD COLUMN IF NOT EXISTS vertretung_fuer uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.benachrichtigungen.vertretung_fuer IS
  'Gesetzt, wenn diese Zeile die Kopie einer Meldung an eine Vertretung ist. '
  'Enthaelt die abwesende Person. Verhindert zugleich, dass die Kopie selbst '
  'wieder kopiert wird.';

CREATE OR REPLACE FUNCTION public.benachrichtigung_an_vertretung()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kontakt_id uuid;
  v_vertretung uuid;
  v_name text;
BEGIN
  -- Eine Kopie wird nicht noch einmal kopiert. Sonst entstuende bei zwei sich
  -- gegenseitig vertretenden Personen eine Endlosschleife.
  IF NEW.vertretung_fuer IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Nur Meldungen zu einem Lead werden weitergereicht. Alles andere
  -- (Abrechnung, Sicherheit, persoenliche Hinweise) bleibt privat. Erkennbar
  -- ist eine Lead-Meldung am Ziel-Link.
  v_kontakt_id := (substring(coalesce(NEW.link, '') from '^/kunden/([0-9a-fA-F-]{36})'))::uuid;
  IF v_kontakt_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT a.vertretung_id INTO v_vertretung
    FROM public.abwesenheiten a
   WHERE a.user_id = NEW.benutzer_id
     AND a.vertretung_id IS NOT NULL
     AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN a.von AND a.bis
   ORDER BY a.von DESC
   LIMIT 1;

  IF v_vertretung IS NULL OR v_vertretung = NEW.benutzer_id THEN
    RETURN NULL;
  END IF;

  -- Nur, wenn der Lead wirklich dem Abwesenden gehoert. Eine Meldung zu einem
  -- fremden Kontakt geht die Vertretung nichts an.
  IF NOT EXISTS (
    SELECT 1 FROM public.kontakte k
     WHERE k.id = v_kontakt_id AND k.zustaendig_id = NEW.benutzer_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT p.name INTO v_name FROM public.profiles p WHERE p.id = NEW.benutzer_id;

  INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link, vertretung_fuer)
  VALUES (
    v_vertretung,
    NEW.titel,
    btrim(coalesce(NEW.nachricht, '') || ' (Vertretung für ' || coalesce(v_name, 'einen Kollegen') || ')'),
    NEW.link,
    NEW.benutzer_id
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Eine Kopie darf niemals die urspruengliche Meldung verhindern. Der Trigger
  -- laeuft in derselben Transaktion, ein Fehler wuerde sonst das Original
  -- zurueckrollen.
  RAISE WARNING 'Vertretungskopie fehlgeschlagen: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_benachrichtigung_an_vertretung ON public.benachrichtigungen;
CREATE TRIGGER trg_benachrichtigung_an_vertretung
  AFTER INSERT ON public.benachrichtigungen
  FOR EACH ROW EXECUTE FUNCTION public.benachrichtigung_an_vertretung();

-- ---------------------------------------------------------------------------
-- 8) Rechte
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.ist_aktive_vertretung(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_vp_eigentuemer_of_kontakt(uuid, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.abwesenheit_pruefen() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.kontakt_zustaendigkeit_schuetzen() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.benachrichtigung_an_vertretung() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.ist_aktive_vertretung(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_vp_eigentuemer_of_kontakt(uuid, uuid, jsonb) TO authenticated;
