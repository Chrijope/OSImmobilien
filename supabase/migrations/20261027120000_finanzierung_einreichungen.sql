-- ===========================================================================
-- Ein Kunde, mehrere Finanzierer (Entscheidung Christian, 27.10.2026)
-- ===========================================================================
--
-- Bisher sah jeder Finanzierungspartner alle Kunden, alle Investments und
-- alle Angebote, weil die Rolle in `darf_alle_kunden_sehen` stand. Mit
-- mehreren externen Finanzierern geht das nicht mehr: Jeder saehe die Kunden
-- und die Angebote der anderen.
--
-- Ab hier gilt:
--
--   * Je Investment und Finanzierer gibt es eine Einreichung mit eigenem
--     Stand, eigener Frist, eigenem Angebot, eigenen Zielbanken und eigenem
--     Nachrichtenverlauf (Tabellen unten).
--   * Ein Finanzierer sieht nur Kunden, Investments und Kundenunterlagen, die
--     ihm eingereicht wurden und noch laufen. Nach Absage, Ablehnung oder
--     Rueckzug ist der Zugang weg; mit Zuschlag bleibt er.
--   * Einreichen duerfen admin, inhaber, vertriebsleiter und backoffice, ueber
--     die Edge Function `finanzierung-partner-benachrichtigen`; Vertriebspartner
--     nicht mehr.
--   * Die Zielbanken, den Vergleich und den Zuschlag sehen nur admin, inhaber
--     und backoffice, nie ein anderer Finanzierer (Christian: „ganz wichtig“).
--   * Je Investment hoechstens ein Zuschlag. Danach haelt die Finanzierung nur
--     das gewonnene Angebot, der Gewinner sieht keine fremden.
--   * Die anderen Finanzierer sehen weder Einreichungen noch Angebote
--     voneinander. Auch die Angebotsdateien liegen je Einreichung in einem
--     eigenen Ordner, den nur der Eigentuemer lesen darf.
--
-- WER ZUGRIFF VERLIERT
--
--   finanzierungspartner: alle Kunden, die ihm nicht eingereicht sind, dazu
--   Aktivitaeten, Kommunikation, Aufgaben und Pipeline aller Kunden (die
--   haengen an `darf_alle_kunden_sehen`). Laufende Faelle bleiben ihm durch
--   die Uebernahme unten erhalten, aber nur dort, wo er nachweislich gemeldet
--   wurde. Die uebrigen laufenden Faelle zeigt die Seite Finanzierungen unter
--   „Laufend, ohne Finanzierer“ zum Zuteilen.
--
-- Mehrfach ausfuehrbar.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Tabellen
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finanzierung_einreichungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  finanzierer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'eingereicht'
    CHECK (status IN ('eingereicht', 'in_pruefung', 'rueckfrage', 'angebot',
                      'zuschlag', 'abgelehnt', 'abgesagt', 'zurueckgezogen')),
  frist_bis date,
  banken text[] NOT NULL DEFAULT '{}',
  angebot jsonb,
  angebot_datei text,
  grund text,
  freigabe_kunde boolean NOT NULL DEFAULT false,
  eingereicht_von uuid,
  eingereicht_am timestamptz NOT NULL DEFAULT now(),
  gesichtet_am timestamptz,
  angebot_am timestamptz,
  entschieden_am timestamptz,
  aktualisiert_am timestamptz NOT NULL DEFAULT now(),
  -- Letzte Fristerinnerung, damit sie hoechstens einmal am Tag kommt.
  erinnert_am date,
  UNIQUE (investment_id, finanzierer_id)
);

COMMENT ON TABLE public.finanzierung_einreichungen IS
  'Ein Investment bei einem Finanzierer eingereicht. Stand, Frist, Angebot und '
  'Zielbanken je Finanzierer. Entscheidung Christian vom 27.10.2026.';
COMMENT ON COLUMN public.finanzierung_einreichungen.banken IS
  'Banken, bei denen der Finanzierer anfragt. Sichtbar fuer admin, inhaber, '
  'backoffice und den Finanzierer selbst, nie fuer andere Finanzierer.';

CREATE INDEX IF NOT EXISTS finanzierung_einreichungen_finanzierer
  ON public.finanzierung_einreichungen (finanzierer_id);

-- Hoechstens ein Zuschlag je Investment, auch bei zwei gleichzeitigen Klicks.
CREATE UNIQUE INDEX IF NOT EXISTS finanzierung_einreichungen_ein_zuschlag
  ON public.finanzierung_einreichungen (investment_id) WHERE status = 'zuschlag';

CREATE TABLE IF NOT EXISTS public.finanzierung_nachrichten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  einreichung_id uuid NOT NULL REFERENCES public.finanzierung_einreichungen(id) ON DELETE CASCADE,
  von uuid NOT NULL DEFAULT auth.uid(),
  text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 4000),
  nachforderung boolean NOT NULL DEFAULT false,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finanzierung_nachrichten_einreichung
  ON public.finanzierung_nachrichten (einreichung_id, erstellt_am);

-- Wer hat welche Kundenunterlage geladen. Geschrieben vom Browser beim
-- Herunterladen, gelesen nur von der Leitung.
CREATE TABLE IF NOT EXISTS public.finanzierung_zugriffe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  aktion text NOT NULL CHECK (length(aktion) BETWEEN 1 AND 200),
  am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finanzierung_zugriffe_investment
  ON public.finanzierung_zugriffe (investment_id, am);


-- ---------------------------------------------------------------------------
-- 2) Hilfsfunktionen
-- ---------------------------------------------------------------------------

-- Wer steuert die Finanzierung: Banken sehen, vergleichen, Zuschlag geben.
-- Einreichen darf zusaetzlich die Vertriebsleitung, das prueft die Edge
-- Function (FINANZIERUNG_MELDEN_ROLLEN).
CREATE OR REPLACE FUNCTION public.darf_finanzierung_steuern(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id
         AND ur.role::text IN ('admin', 'inhaber', 'backoffice')
    )
  ), false)
$$;

-- Laeuft fuer diesen Finanzierer eine Einreichung zu diesem Investment?
CREATE OR REPLACE FUNCTION public.finanzierer_aktiv(_user_id uuid, _investment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM public.finanzierung_einreichungen e
       WHERE e.finanzierer_id = _user_id
         AND e.investment_id = _investment_id
         AND e.status NOT IN ('abgelehnt', 'abgesagt', 'zurueckgezogen')
    )
  ), false)
$$;

-- Dasselbe ueber den Kontakt, fuer Kontakte und Kundenordner.
CREATE OR REPLACE FUNCTION public.finanzierer_sieht_kontakt(_user_id uuid, _kontakt_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM public.finanzierung_einreichungen e
        JOIN public.investments i ON i.id = e.investment_id
       WHERE e.finanzierer_id = _user_id
         AND i.kunde_id = _kontakt_id
         AND e.status NOT IN ('abgelehnt', 'abgesagt', 'zurueckgezogen')
    )
  ), false)
$$;

-- Hat dieser Finanzierer den Zuschlag? finanzierungen.kunde_id ist Text und
-- traegt die Investment-ID.
CREATE OR REPLACE FUNCTION public.finanzierer_hat_zuschlag(_user_id uuid, _investment_id_text text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    _investment_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM public.finanzierung_einreichungen e
       WHERE e.finanzierer_id = _user_id
         AND e.investment_id = _investment_id_text::uuid
         AND e.status = 'zuschlag'
    )
  ), false)
$$;

REVOKE ALL ON FUNCTION public.darf_finanzierung_steuern(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.finanzierer_aktiv(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.finanzierer_sieht_kontakt(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.finanzierer_hat_zuschlag(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_finanzierung_steuern(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finanzierer_aktiv(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finanzierer_sieht_kontakt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finanzierer_hat_zuschlag(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3) Der Finanzierer verlaesst den Kreis "darf alle Kunden sehen"
-- ---------------------------------------------------------------------------
--
-- Gleicher Wortlaut wie 20260916190000, nur ohne finanzierungspartner. Der
-- Test `src/lib/kundenzugriffRollen.test.ts` liest diese letzte Fassung.

CREATE OR REPLACE FUNCTION public.darf_alle_kunden_sehen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN (
          'admin',
          'inhaber',
          'vertriebsleiter',
          'backoffice',
          'buchhaltung',
          'setterin',
          'individuell',
          'testaccount'
        )
    )
  ), false)
$$;

COMMENT ON FUNCTION public.darf_alle_kunden_sehen(uuid) IS
  'Darf dieser Nutzer alle Kunden sehen? admin, inhaber, vertriebsleiter, '
  'backoffice, buchhaltung, setterin, individuell, testaccount. Seit dem '
  '27.10.2026 ohne finanzierungspartner: Er sieht nur eingereichte Kunden '
  '(finanzierer_aktiv, finanzierer_sieht_kontakt).';


-- ---------------------------------------------------------------------------
-- 4) Was der Finanzierer stattdessen sieht
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Finanzierer sehen eingereichte Kontakte" ON public.kontakte;
CREATE POLICY "Finanzierer sehen eingereichte Kontakte" ON public.kontakte
  FOR SELECT TO authenticated
  USING (public.finanzierer_sieht_kontakt(auth.uid(), id));

DROP POLICY IF EXISTS "Finanzierer sehen eingereichte Investments" ON public.investments;
CREATE POLICY "Finanzierer sehen eingereichte Investments" ON public.investments
  FOR SELECT TO authenticated
  USING (public.finanzierer_aktiv(auth.uid(), id));

-- Mit Zuschlag arbeitet der Finanzierer in der bisherigen Finanzierung weiter
-- (Grundschuld, Darlehensvertrag). Anlegen und Freigeben fuer den Kunden
-- bleibt bei der Leitung.
DROP POLICY IF EXISTS "Finanzierer mit Zuschlag sehen Finanzierung" ON public.finanzierungen;
CREATE POLICY "Finanzierer mit Zuschlag sehen Finanzierung" ON public.finanzierungen
  FOR SELECT TO authenticated
  USING (public.finanzierer_hat_zuschlag(auth.uid(), kunde_id));
DROP POLICY IF EXISTS "Finanzierer mit Zuschlag bearbeiten Finanzierung" ON public.finanzierungen;
CREATE POLICY "Finanzierer mit Zuschlag bearbeiten Finanzierung" ON public.finanzierungen
  FOR UPDATE TO authenticated
  USING (public.finanzierer_hat_zuschlag(auth.uid(), kunde_id))
  WITH CHECK (public.finanzierer_hat_zuschlag(auth.uid(), kunde_id));

-- Ersetzt 20261016209000: nicht mehr jeder Ordner mit Investment, sondern
-- nur der eingereichte.
DROP POLICY IF EXISTS "kunde_dokumente_select_finanzierungspartner" ON public.kunde_dokumente;
CREATE POLICY "kunde_dokumente_select_finanzierungspartner" ON public.kunde_dokumente
  FOR SELECT TO authenticated
  USING (
    investment_id IS NOT NULL
    AND public.finanzierer_aktiv(auth.uid(), investment_id)
  );


-- ---------------------------------------------------------------------------
-- 5) Dateien im Eimer `unterlagen`
-- ---------------------------------------------------------------------------
--
-- Ordner einer Einreichung: finanzierung/<investment>/einreichung-<id>/...
-- Nur der Eigentuemer der Einreichung und die Leitung. Ordner eines Angebots
-- finanzierung/<investment>/<angebot>/ (Angebot, Grundschuld,
-- Darlehensvertrag) nur mit Zuschlag und nur fuer Angebote, die in der
-- Finanzierung stehen; nach dem Zuschlag ist das nur noch das gewonnene.
-- finanzierung/eigen/<kontakt>/... hat der Kunde selbst hochgeladen und
-- zaehlt wie der Kundenordner.

CREATE OR REPLACE FUNCTION public.finanzierer_darf_pfad(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  teile text[] := storage.foldername(_name);
  uuid_muster constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  kontakt uuid;
BEGIN
  IF NOT public.has_role(_user_id, 'finanzierungspartner'::public.app_role) THEN
    RETURN false;
  END IF;

  IF teile[1] = 'finanzierung' AND teile[2] IS DISTINCT FROM 'eigen' THEN
    IF coalesce(teile[2], '') !~* uuid_muster THEN
      RETURN false;
    END IF;
    IF coalesce(teile[3], '') LIKE 'einreichung-%' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.finanzierung_einreichungen e
         WHERE e.id::text = substr(teile[3], 13)
           AND e.investment_id = teile[2]::uuid
           AND e.finanzierer_id = _user_id
           AND e.status NOT IN ('abgelehnt', 'abgesagt', 'zurueckgezogen')
      );
    END IF;
    RETURN public.finanzierer_hat_zuschlag(_user_id, teile[2])
       AND EXISTS (
         SELECT 1 FROM public.finanzierungen f
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(f.angebote) = 'array' THEN f.angebote ELSE '[]'::jsonb END) a
          WHERE f.kunde_id = teile[2] AND a ->> 'id' = teile[3]
       );
  END IF;

  kontakt := public.unterlagen_lese_kontakt(_name);
  RETURN kontakt IS NOT NULL AND public.finanzierer_sieht_kontakt(_user_id, kontakt);
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierer_darf_pfad(uuid, text) FROM public, anon, authenticated;

-- Wortlaut wie 20261004130000, nur der Finanzierer-Zweig ist neu.
CREATE OR REPLACE FUNCTION public.darf_unterlage_lesen(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kontakt uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_admin_role(_user_id) THEN
    RETURN true;
  END IF;
  IF (storage.foldername(_name))[1] = 'chat' THEN
    RETURN false;
  END IF;
  IF NOT public.is_internal_role(_user_id) THEN
    RETURN false;
  END IF;
  IF public.darf_alle_kunden_sehen(_user_id) THEN
    RETURN true;
  END IF;
  IF (storage.foldername(_name))[1] = _user_id::text THEN
    RETURN true;
  END IF;
  IF public.finanzierer_darf_pfad(_user_id, _name) THEN
    RETURN true;
  END IF;

  IF (storage.foldername(_name))[1] = 'externe-investments' THEN
    IF coalesce((storage.foldername(_name))[2], '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.externe_investments ei
        JOIN public.kontakte k
          ON (k.meta ->> 'authUserId') = ei.user_id::text
          OR (k.meta -> 'person2' ->> 'authUserId') = ei.user_id::text
       WHERE ei.id = ((storage.foldername(_name))[2])::uuid
         AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
    );
  END IF;

  kontakt := public.unterlagen_lese_kontakt(_name);
  IF kontakt IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.kontakte k
     WHERE k.id = kontakt
       AND public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
  );
END;
$$;

-- Wortlaut wie 20260930120000. Der Finanzierer-Zweig galt bisher fuer jeden
-- Ordner unter finanzierung/, jetzt nur fuer die eigene Einreichung und mit
-- Zuschlag.
CREATE OR REPLACE FUNCTION public.darf_unterlage_aendern(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kontakt uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_admin_role(_user_id) THEN
    RETURN true;
  END IF;
  IF (storage.foldername(_name))[1] = _user_id::text THEN
    RETURN true;
  END IF;
  -- Nicht finanzierung/eigen/: Das sind Dateien des Kunden, die liest der
  -- Finanzierer nur.
  IF (storage.foldername(_name))[1] = 'finanzierung'
     AND (storage.foldername(_name))[2] IS DISTINCT FROM 'eigen'
     AND public.finanzierer_darf_pfad(_user_id, _name) THEN
    RETURN true;
  END IF;

  kontakt := public.unterlagen_pfad_kontakt(_name);
  IF kontakt IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.kontakte k
     WHERE k.id = kontakt
       AND (
         public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
         OR public.has_role(_user_id, 'backoffice'::public.app_role)
         OR public.has_role(_user_id, 'vertriebsleiter'::public.app_role)
       )
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 6) Regeln auf den neuen Tabellen
-- ---------------------------------------------------------------------------

ALTER TABLE public.finanzierung_einreichungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzierung_nachrichten ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finanzierung_zugriffe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Einreichungen lesen" ON public.finanzierung_einreichungen;
CREATE POLICY "Einreichungen lesen" ON public.finanzierung_einreichungen
  FOR SELECT TO authenticated
  USING ((select public.darf_finanzierung_steuern(auth.uid())) OR finanzierer_id = auth.uid());

-- Anlegen nur die Leitung oder die Edge Function (Dienstschluessel), und nur
-- fuer Nutzer mit der Rolle Finanzierungspartner.
DROP POLICY IF EXISTS "Einreichungen anlegen" ON public.finanzierung_einreichungen;
CREATE POLICY "Einreichungen anlegen" ON public.finanzierung_einreichungen
  FOR INSERT TO authenticated
  WITH CHECK (
    (select public.darf_finanzierung_steuern(auth.uid()))
    AND public.has_role(finanzierer_id, 'finanzierungspartner'::public.app_role)
  );

-- Aendern: Leitung alles, Finanzierer nur die eigene; welche Felder, prueft
-- der Ausloeser unten.
DROP POLICY IF EXISTS "Einreichungen aendern" ON public.finanzierung_einreichungen;
CREATE POLICY "Einreichungen aendern" ON public.finanzierung_einreichungen
  FOR UPDATE TO authenticated
  USING ((select public.darf_finanzierung_steuern(auth.uid())) OR finanzierer_id = auth.uid())
  WITH CHECK ((select public.darf_finanzierung_steuern(auth.uid())) OR finanzierer_id = auth.uid());

DROP POLICY IF EXISTS "Einreichungen loeschen" ON public.finanzierung_einreichungen;
CREATE POLICY "Einreichungen loeschen" ON public.finanzierung_einreichungen
  FOR DELETE TO authenticated
  USING ((select public.is_admin_role(auth.uid())));

DROP POLICY IF EXISTS "Nachrichten lesen" ON public.finanzierung_nachrichten;
CREATE POLICY "Nachrichten lesen" ON public.finanzierung_nachrichten
  FOR SELECT TO authenticated
  USING (
    (select public.darf_finanzierung_steuern(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.finanzierung_einreichungen e
                WHERE e.id = einreichung_id AND e.finanzierer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Nachrichten schreiben" ON public.finanzierung_nachrichten;
CREATE POLICY "Nachrichten schreiben" ON public.finanzierung_nachrichten
  FOR INSERT TO authenticated
  WITH CHECK (
    von = auth.uid()
    AND (
      (select public.darf_finanzierung_steuern(auth.uid()))
      OR EXISTS (SELECT 1 FROM public.finanzierung_einreichungen e
                  WHERE e.id = einreichung_id AND e.finanzierer_id = auth.uid()
                    AND e.status NOT IN ('abgelehnt', 'abgesagt', 'zurueckgezogen'))
    )
  );

DROP POLICY IF EXISTS "Zugriffe lesen" ON public.finanzierung_zugriffe;
CREATE POLICY "Zugriffe lesen" ON public.finanzierung_zugriffe
  FOR SELECT TO authenticated
  USING ((select public.darf_finanzierung_steuern(auth.uid())));

DROP POLICY IF EXISTS "Zugriffe vermerken" ON public.finanzierung_zugriffe;
CREATE POLICY "Zugriffe vermerken" ON public.finanzierung_zugriffe
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND ((select public.darf_finanzierung_steuern(auth.uid()))
         OR public.finanzierer_aktiv(auth.uid(), investment_id))
  );


-- ---------------------------------------------------------------------------
-- 7) Was der Finanzierer an seiner Einreichung aendern darf
-- ---------------------------------------------------------------------------
--
-- Er setzt seinen Stand (in Pruefung, Rueckfrage, Angebot, abgelehnt), seine
-- Banken, sein Angebot und den Vermerk "gesichtet". Investment, Frist,
-- Zuschlag und die Freigabe fuer den Kunden setzt nur die Leitung.

CREATE OR REPLACE FUNCTION public.finanzierung_einreichung_schuetzen()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.darf_finanzierung_steuern(auth.uid()) THEN
    IF NEW.investment_id IS DISTINCT FROM OLD.investment_id
       OR NEW.finanzierer_id IS DISTINCT FROM OLD.finanzierer_id
       OR NEW.frist_bis IS DISTINCT FROM OLD.frist_bis
       OR NEW.freigabe_kunde IS DISTINCT FROM OLD.freigabe_kunde
       OR NEW.eingereicht_von IS DISTINCT FROM OLD.eingereicht_von
       OR NEW.eingereicht_am IS DISTINCT FROM OLD.eingereicht_am THEN
      RAISE EXCEPTION 'Diese Angaben setzt nur die Leitung.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.status IN ('zuschlag', 'abgelehnt', 'abgesagt', 'zurueckgezogen')
       AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.angebot IS DISTINCT FROM OLD.angebot
            OR NEW.angebot_datei IS DISTINCT FROM OLD.angebot_datei) THEN
      RAISE EXCEPTION 'Die Einreichung ist entschieden.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('in_pruefung', 'rueckfrage', 'angebot', 'abgelehnt') THEN
      RAISE EXCEPTION 'Diesen Stand setzt nur die Leitung.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Die Angebotsdatei nur aus dem eigenen Ordner, sonst kaeme ueber die
    -- Uebernahme beim Zuschlag eine fremde Datei in die Finanzierung.
    IF NEW.angebot_datei IS DISTINCT FROM OLD.angebot_datei
       AND NEW.angebot_datei IS NOT NULL
       AND (NEW.angebot_datei NOT LIKE 'finanzierung/' || NEW.investment_id || '/einreichung-' || NEW.id || '/%'
            OR NEW.angebot_datei LIKE '%..%') THEN
      RAISE EXCEPTION 'Die Angebotsdatei gehoert in den Ordner dieser Einreichung.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Zeitstempel zaehlen fuer die Kennzahlen, der Finanzierer setzt sie
    -- nicht selbst. "Gesichtet" nur einmal und mit der Serverzeit.
    NEW.gesichtet_am := coalesce(OLD.gesichtet_am, CASE WHEN NEW.gesichtet_am IS NOT NULL THEN now() END);
    NEW.angebot_am := OLD.angebot_am;
    NEW.entschieden_am := OLD.entschieden_am;
    NEW.erinnert_am := OLD.erinnert_am;
  END IF;

  IF NEW.gesichtet_am IS NULL AND NEW.status <> 'eingereicht' THEN
    NEW.gesichtet_am := now();
  END IF;
  IF NEW.status = 'angebot' AND OLD.status IS DISTINCT FROM 'angebot' THEN
    NEW.angebot_am := now();
  END IF;
  IF NEW.status IN ('zuschlag', 'abgelehnt', 'abgesagt', 'zurueckgezogen')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.entschieden_am := now();
  END IF;
  NEW.aktualisiert_am := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_einreichung_schuetzen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finanzierung_einreichung_schuetzen ON public.finanzierung_einreichungen;
CREATE TRIGGER trg_finanzierung_einreichung_schuetzen
  BEFORE UPDATE ON public.finanzierung_einreichungen
  FOR EACH ROW EXECUTE FUNCTION public.finanzierung_einreichung_schuetzen();


-- ---------------------------------------------------------------------------
-- 8) Glocken
-- ---------------------------------------------------------------------------
--
-- Aendert der Finanzierer seinen Stand oder schreibt er, erfaehrt es die
-- Leitung; entscheidet oder schreibt die Leitung, erfaehrt es der
-- Finanzierer. Im Datenbankausloeser, weil der Finanzierer selbst keine
-- Glocken an die Leitung senden darf.

CREATE OR REPLACE FUNCTION public.finanzierung_glocke(_einreichung public.finanzierung_einreichungen, _an_leitung boolean, _titel text, _text text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kontakt uuid;
  v_name text;
  v_link text;
BEGIN
  SELECT i.kunde_id, btrim(coalesce(k.vorname, '') || ' ' || coalesce(k.nachname, ''))
    INTO v_kontakt, v_name
    FROM public.investments i LEFT JOIN public.kontakte k ON k.id = i.kunde_id
   WHERE i.id = _einreichung.investment_id;
  v_link := '/kunden/' || v_kontakt || '?tab=investments&investment=' || _einreichung.investment_id || '#finanzierung';

  IF _an_leitung THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link, gelesen)
    SELECT DISTINCT ur.user_id, _titel, coalesce(nullif(v_name, ''), 'Ein Kunde') || ': ' || _text, v_link, false
      FROM public.user_roles ur
     WHERE ur.role::text IN ('admin', 'inhaber', 'backoffice')
       AND ur.user_id IS DISTINCT FROM auth.uid();
  ELSE
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link, gelesen)
    VALUES (_einreichung.finanzierer_id, _titel, coalesce(nullif(v_name, ''), 'Ein Kunde') || ': ' || _text, v_link, false);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_glocke(public.finanzierung_einreichungen, boolean, text, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finanzierung_einreichung_melden()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  CASE NEW.status
    WHEN 'in_pruefung' THEN PERFORM public.finanzierung_glocke(NEW, true, 'Finanzierung in Prüfung', 'Der Finanzierer prüft die Unterlagen.');
    WHEN 'rueckfrage' THEN PERFORM public.finanzierung_glocke(NEW, true, 'Rückfrage vom Finanzierer', 'Der Finanzierer hat eine Rückfrage. Bitte im Abschnitt Finanzierung ansehen.');
    WHEN 'angebot' THEN PERFORM public.finanzierung_glocke(NEW, true, 'Finanzierungsangebot eingegangen', 'Ein Finanzierer hat ein Angebot hochgeladen.');
    WHEN 'abgelehnt' THEN PERFORM public.finanzierung_glocke(NEW, true, 'Finanzierer hat abgelehnt', coalesce('Grund: ' || nullif(NEW.grund, ''), 'Ohne Angabe eines Grundes.'));
    WHEN 'zuschlag' THEN PERFORM public.finanzierung_glocke(NEW, false, 'Zuschlag erhalten', 'Ihr Angebot wurde angenommen. Bitte die Finanzierung weiterführen.');
    WHEN 'abgesagt' THEN PERFORM public.finanzierung_glocke(NEW, false, 'Finanzierung anderweitig vergeben', 'Vielen Dank für Ihr Angebot. Der Kunde hat sich für ein anderes Angebot entschieden.');
    WHEN 'zurueckgezogen' THEN PERFORM public.finanzierung_glocke(NEW, false, 'Einreichung zurückgezogen', 'Die Einreichung wurde zurückgezogen.');
    ELSE NULL;
  END CASE;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_einreichung_melden() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finanzierung_einreichung_melden ON public.finanzierung_einreichungen;
CREATE TRIGGER trg_finanzierung_einreichung_melden
  AFTER UPDATE OF status ON public.finanzierung_einreichungen
  FOR EACH ROW EXECUTE FUNCTION public.finanzierung_einreichung_melden();

CREATE OR REPLACE FUNCTION public.finanzierung_nachricht_melden()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  e public.finanzierung_einreichungen;
BEGIN
  SELECT * INTO e FROM public.finanzierung_einreichungen WHERE id = NEW.einreichung_id;
  IF NEW.von = e.finanzierer_id THEN
    PERFORM public.finanzierung_glocke(e, true,
      CASE WHEN NEW.nachforderung THEN 'Finanzierer fordert Unterlage nach' ELSE 'Nachricht vom Finanzierer' END,
      left(NEW.text, 160));
  ELSE
    PERFORM public.finanzierung_glocke(e, false, 'Nachricht zur Finanzierung', left(NEW.text, 160));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_nachricht_melden() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finanzierung_nachricht_melden ON public.finanzierung_nachrichten;
CREATE TRIGGER trg_finanzierung_nachricht_melden
  AFTER INSERT ON public.finanzierung_nachrichten
  FOR EACH ROW EXECUTE FUNCTION public.finanzierung_nachricht_melden();


-- ---------------------------------------------------------------------------
-- 9) Zuschlag in einem Schritt
-- ---------------------------------------------------------------------------
--
-- Ein Angebot gewinnt, alle anderen laufenden Einreichungen dieses
-- Investments werden abgesagt. In einer Transaktion, damit nie zwei
-- Zuschlaege nebeneinander stehen.

CREATE OR REPLACE FUNCTION public.finanzierung_zuschlag(_einreichung_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_investment uuid;
BEGIN
  IF NOT public.darf_finanzierung_steuern(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT investment_id INTO v_investment FROM public.finanzierung_einreichungen
   -- Nicht nur 'angebot': uebernommene Altfaelle stehen auf 'in_pruefung',
   -- obwohl ihr Angebot laengst in der Finanzierung liegt.
   WHERE id = _einreichung_id AND status IN ('eingereicht', 'in_pruefung', 'rueckfrage', 'angebot') FOR UPDATE;
  IF v_investment IS NULL THEN
    RAISE EXCEPTION 'Diese Einreichung laeuft nicht mehr.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finanzierung_einreichungen
              WHERE investment_id = v_investment AND status = 'zuschlag') THEN
    RAISE EXCEPTION 'Fuer diesen Kauf gibt es schon einen Zuschlag.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.finanzierung_einreichungen SET status = 'zuschlag' WHERE id = _einreichung_id;
  UPDATE public.finanzierung_einreichungen SET status = 'abgesagt'
   WHERE investment_id = v_investment AND id <> _einreichung_id
     AND status IN ('eingereicht', 'in_pruefung', 'rueckfrage', 'angebot');
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_zuschlag(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finanzierung_zuschlag(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 10) Fristen: werktags um 8 Uhr an ueberfaellige Einreichungen erinnern
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finanzierung_fristen_erinnern()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  e public.finanzierung_einreichungen;
  n integer := 0;
BEGIN
  FOR e IN
    SELECT * FROM public.finanzierung_einreichungen
     WHERE status IN ('eingereicht', 'in_pruefung', 'rueckfrage')
       AND frist_bis IS NOT NULL
       AND frist_bis < (now() AT TIME ZONE 'Europe/Berlin')::date
       AND erinnert_am IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Berlin')::date
     FOR UPDATE SKIP LOCKED
  LOOP
    -- Hoechstens einmal am Tag, auch wenn der Lauf doppelt anstoesst.
    UPDATE public.finanzierung_einreichungen
       SET erinnert_am = (now() AT TIME ZONE 'Europe/Berlin')::date
     WHERE id = e.id;
    PERFORM public.finanzierung_glocke(e, false, 'Frist für das Angebot überschritten',
      'Das Angebot war bis ' || to_char(e.frist_bis, 'DD.MM.YYYY') || ' vereinbart. Bitte Stand melden.');
    PERFORM public.finanzierung_glocke(e, true, 'Finanzierer überfällig',
      'Frist bis ' || to_char(e.frist_bis, 'DD.MM.YYYY') || ' ist überschritten.');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_fristen_erinnern() FROM public, anon, authenticated;

DO $zeitplan$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finanzierung-fristen') THEN
      PERFORM cron.unschedule('finanzierung-fristen');
    END IF;
    -- 7 Uhr UTC, also 8 oder 9 Uhr in Berlin, montags bis freitags.
    PERFORM cron.schedule('finanzierung-fristen', '0 7 * * 1-5', 'SELECT public.finanzierung_fristen_erinnern();');
  ELSE
    RAISE WARNING 'pg_cron fehlt, keine Fristerinnerung fuer Finanzierungen angelegt.';
  END IF;
END
$zeitplan$;


-- ---------------------------------------------------------------------------
-- 11) Laufende Faelle uebernehmen
-- ---------------------------------------------------------------------------
--
-- Wer nachweislich benachrichtigt wurde (finanzierungPartnerMeldungen),
-- behaelt seinen Kunden (Christian, 27.10.2026). Alle anderen laufenden
-- Faelle bekommt kein Finanzierer automatisch; die Seite Finanzierungen
-- listet sie unter „Laufend, ohne Finanzierer“ zum Zuteilen.

INSERT INTO public.finanzierung_einreichungen (investment_id, finanzierer_id, status, eingereicht_am)
SELECT i.id, (m ->> 'userId')::uuid, 'in_pruefung',
       coalesce((m ->> 'am')::timestamptz, now())
  FROM public.investments i
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(i.meta -> 'finanzierungPartnerMeldungen') = 'array'
        THEN i.meta -> 'finanzierungPartnerMeldungen' ELSE '[]'::jsonb END) m
 WHERE (m ->> 'userId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = (m ->> 'userId')::uuid AND ur.role = 'finanzierungspartner')
ON CONFLICT (investment_id, finanzierer_id) DO NOTHING;
