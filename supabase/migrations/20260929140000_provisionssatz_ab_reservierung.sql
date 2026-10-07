-- ===========================================================================
-- Provisionssatz: festgeschrieben ab Reservierung, neu beim Partnerwechsel
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (29.09.2026)
--
--   1. Massgeblich ist immer der Satz des aktuell zugewiesenen Partners laut
--      Nutzerverwaltung (user_settings), ueber die bestehende Kette
--      provisionssatz_fuer_partner samt Eigen-/Zugewiesen-Logik.
--   2. Festgeschrieben wird, wenn das Investment die Kaufphase erreicht, also
--      meta.pipelineStufe auf "reservierung" oder eine spaetere Kaufstufe
--      springt und noch kein serverseitiger Satz da ist.
--   3. Wird der Kunde danach umgehaengt (kontakte.zustaendig_id aendert
--      sich), wird neu festgeschrieben, mit dem Satz des neuen Partners.
--   4. Vor der Reservierung wird nichts festgeschrieben. Anzeigen und
--      Statistiken rechnen bis dahin mit dem laufenden Satz des Zustaendigen.
--
-- BEFUND, DER DAZU GEFUEHRT HAT
--
-- Der bisherige Trigger (20260818140000, Kennung-Fassung 20260928180000)
-- schrieb den Satz nur beim ANLEGEN des Investments. Da hatte der Kunde oft
-- noch keinen Partner, und wer spaeter umgehaengt wurde, behielt den Satz
-- des alten. Dazu kam der Browser: updateInvestment schreibt das ganze meta
-- aus dem Zwischenspeicher zurueck, und der kannte den Trigger-Wert nicht.
-- Am 29.09.2026 stand in keinem einzigen Investment ein serverseitiger Satz.
--
-- WAS DIESE MIGRATION TUT
--
--   a) provisionssatz_ermitteln(kunde_id): die Ermittlung aus dem alten
--      Trigger als eigene Funktion, Rumpf inhaltlich unveraendert zur
--      Fassung 20260928180000 (Partner, eigen/zugewiesen, Satz, Grund).
--   b) pipelinestufe_ist_kaufphase(stufe): reservierung bis abgeschlossen,
--      Abbild von PIPELINE_STUFEN in src/lib/pipelineStufen.ts.
--   c) investments_provisionssatz_festschreiben() neu, Trigger jetzt
--      BEFORE INSERT OR UPDATE OF meta:
--        - Schutz: Die Schluessel lockedProvisionRate* schreibt nur noch
--          dieser Trigger. Was ein Client dort mitschickt, faellt weg; beim
--          Aendern bleibt der alte Stand (OLD) stehen. Damit loescht auch ein
--          veralteter Zwischenspeicher im Browser keinen Satz mehr.
--        - Festschreiben beim Eintritt in die Kaufphase, wenn noch kein
--          gueltiger Satz da ist. Gueltig ist nur ein Satz mit
--          lockedProvisionRateAnlass, also aus dieser Fassung; Saetze des
--          alten INSERT-Triggers (Quelle 'serverseitig' ohne Anlass) gelten
--          als alt. Kommt ein Vorgang mit gueltigem Satz in die Kaufphase
--          zurueck und gehoert inzwischen einem anderen Partner, wird neu
--          ermittelt. Ist ein Versuch in der Kaufphase
--          gescheitert (Vermerk lockedProvisionRateFehler), wird es beim
--          naechsten Speichern erneut versucht. Ein meta, das kein
--          Objekt ist, zaehlt wie NULL.
--        - Neu festschreiben auf Auftrag (Schluessel lockedProvisionRateNeu),
--          aber nur von vertrauenswuerdiger Seite: aus einem anderen Trigger
--          (Partnerwechsel, siehe d) oder ohne angemeldeten Nutzer
--          (SQL-Editor, Dienstschluessel). Ein Auftrag aus dem Browser wird
--          verworfen, sonst koennte ein Partner nach einer Stufenerhoehung
--          seinen festgeschriebenen Satz nachtraeglich anheben.
--          Auftraege: 'partnerwechsel', 'nachtrag' (Quelle 'nachgetragen')
--          und 'verwerfen' (entfernt einen Satz vor der Kaufphase).
--   d) kontakte_provisionssatz_partnerwechsel(): Trigger AFTER UPDATE OF
--      zustaendig_id auf kontakte. Fuer jedes Investment dieses Kontakts in
--      der Kaufphase, dessen Satz nicht fuer den neuen Partner steht, geht
--      ein Auftrag an c). Der Satz selbst wird nur in c) ermittelt.
--   e) user_settings_provision_schuetzen(): Waechter auf user_settings.
--      Provisionssaetze, karriere_override und provision_locked aendern nur
--      Admin, Inhaber und der Server; sonst bleibt still der alte Wert.
--   f) Rechte: provisionssatz_fuer_partner und investment_partner_id waren
--      trotz REVOKE fuer anon und authenticated aufrufbar, weil Postgres
--      EXECUTE standardmaessig an PUBLIC vergibt. Jeder haette die Saetze
--      aller Partner abfragen koennen. Jetzt auch von PUBLIC entzogen, wie
--      es die Migrationen vom 18.08. und 09.09.2026 beabsichtigt hatten.
--      Kein Browser ruft diese Funktionen auf.
--
-- SCHLUESSEL IN investments.meta (nur dieser Trigger schreibt sie)
--
--   lockedProvisionRate         der Satz in Prozent
--   lockedProvisionRateAt       Zeitpunkt (UTC)
--   lockedProvisionRateQuelle   'serverseitig' oder 'nachgetragen'
--   lockedProvisionRatePartner  Kennung des Partners, fuer den er gilt
--   lockedProvisionRateAnlass   'reservierung', 'partnerwechsel', 'nachtrag'
--   lockedProvisionRateFehler   Vermerk, warum nichts festgeschrieben wurde
--
-- WAS SICH NICHT AENDERT
--
-- Keine Bestandsdaten. Die Migration legt nur Funktionen und Trigger an und
-- ist beliebig oft ausfuehrbar. Saetze, die heute schon am Investment
-- stehen (auch die 15 vom Browser im Juni und Juli geschriebenen),
-- bleiben stehen; sie aendern sich erst beim Eintritt in die Kaufphase
-- (wenn sie davor lagen), beim Partnerwechsel oder durch die getrennte
-- Datenkorrektur 20260929150000_provisionssatz_nachtrag.sql. Die Abrechnung im Browser liest den
-- Satz erst, wenn FESTGESCHRIEBENER_SATZ_IN_ABRECHNUNG in
-- src/lib/karriereStufeHelper.ts auf true steht; das bleibt false.
--
-- Die Anwendung laeuft auch ohne diese Migration, dann wie bisher.
--
-- Voraussetzungen: provisionssatz_fuer_partner (20260818140000),
-- investment_partner_id(uuid) und berater_name_normal (20260918220000).
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.provisionssatz_fuer_partner(uuid,boolean)') IS NULL
     OR to_regprocedure('public.investment_partner_id(uuid)') IS NULL
     OR to_regprocedure('public.berater_name_normal(text)') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20260818140000, 20260909120000 und 20260918220000 ausfuehren.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- a) Ermittlung des Satzes fuer den aktuellen Partner eines Kunden
-- ---------------------------------------------------------------------------
--
-- Rumpf aus investments_provisionssatz_festschreiben (20260928180000). Neu
-- ist nur die Form: Statt NEW.kunde_id kommt die Kennung als Parameter, und
-- statt NEW.meta zu setzen gibt die Funktion Partner, Satz und Grund zurueck.
-- Fehler werden hier nicht abgefangen, das macht der Aufrufer und vermerkt
-- sie am Investment.

CREATE OR REPLACE FUNCTION public.provisionssatz_ermitteln(
  _kunde_id uuid,
  OUT partner_id uuid,
  OUT satz numeric,
  OUT grund text
)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt record;
  _eigen boolean := false;
  _setter text;
  _ersteller_id text;
  _ersteller_name text;
  _berater_name text;
BEGIN
  -- uuid gegen uuid; ein ::text auf einer Seite hat die Funktion schon
  -- dreimal zerlegt.
  SELECT k.zustaendig_id, k.berater, coalesce(k.meta, '{}'::jsonb) AS meta
    INTO _kontakt
    FROM public.kontakte k
   WHERE k.id = _kunde_id
   LIMIT 1;

  IF NOT FOUND THEN
    grund := 'kontakt_nicht_gefunden';
    RETURN;
  END IF;

  partner_id := public.investment_partner_id(_kunde_id);
  IF partner_id IS NULL THEN
    grund := 'kein_zustaendiger_partner';
    RETURN;
  END IF;

  -- Eigen oder zugewiesen? Spiegel von istEigenKontakt im Frontend:
  -- ein eingetragener Setter bedeutet immer zugewiesen; sonst zaehlt, wer
  -- den Kontakt angelegt hat (erstelltVonId, notfalls der Name); ohne
  -- beides gilt die vorsichtigere Annahme "zugewiesen". Nach einem
  -- Partnerwechsel ist der neue Partner damit in aller Regel "zugewiesen".
  _setter := nullif(trim(coalesce(_kontakt.meta ->> 'setter', '')), '');
  IF _setter IS NOT NULL THEN
    _eigen := false;
  ELSE
    _ersteller_id := nullif(trim(coalesce(_kontakt.meta ->> 'erstelltVonId', '')), '');
    IF _ersteller_id IS NOT NULL THEN
      _eigen := (_ersteller_id = partner_id::text);
    ELSE
      _ersteller_name := lower(trim(coalesce(_kontakt.meta ->> 'erstelltVonName', '')));
      _berater_name := lower(trim(coalesce(_kontakt.berater, '')));
      _eigen := _ersteller_name <> '' AND _berater_name <> '' AND _ersteller_name = _berater_name;
      -- Der Name zaehlt nur, wenn er genau ein Profil meint und dieses der
      -- ermittelte Partner ist (seit 28.09.2026).
      IF _eigen THEN
        SELECT count(*) = 1 AND bool_and(p.id = partner_id) INTO _eigen
          FROM public.profiles p
         WHERE public.berater_name_normal(p.name) = public.berater_name_normal(_ersteller_name);
      END IF;
    END IF;
  END IF;

  satz := public.provisionssatz_fuer_partner(partner_id, _eigen);
  IF satz IS NULL OR satz <= 0 THEN
    satz := NULL;
    grund := 'kein_satz_ermittelbar';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.provisionssatz_ermitteln(uuid) IS
  'Provisionssatz des aktuell zustaendigen Partners eines Kunden (Kennung '
  'zuerst, eigen oder zugewiesen wie im Frontend). Liefert Partner, Satz '
  'und bei Misserfolg einen Grund. Nur fuer Server und SQL-Editor.';

-- ---------------------------------------------------------------------------
-- b) Kaufphase: reservierung bis abgeschlossen
-- ---------------------------------------------------------------------------
--
-- Abbild von PIPELINE_STUFEN in src/lib/pipelineStufen.ts, alles ab
-- "reservierung" bis "abgeschlossen". Nicht dabei sind die Endzustaende
-- (verloren, archiviert, bestandsimport): Dort gibt es nichts abzurechnen.
-- Kommt dort eine Kaufstufe dazu, muss diese Liste nachgezogen werden
-- (src/lib/provisionssatzAbReservierungMigration.test.ts prueft das).

CREATE OR REPLACE FUNCTION public.pipelinestufe_ist_kaufphase(_stufe text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(_stufe, '') IN (
    'reservierung', 'bonitaetsunterlagen', 'finanzierung', 'notar',
    'faelligkeit', 'abrechnung', 'abgeschlossen'
  );
$$;

COMMENT ON FUNCTION public.pipelinestufe_ist_kaufphase(text) IS
  'true ab Reservierung bis Abgeschlossen. Abbild von PIPELINE_STUFEN in '
  'src/lib/pipelineStufen.ts; ab hier wird der Provisionssatz festgeschrieben.';

-- ---------------------------------------------------------------------------
-- c) Der Trigger auf investments
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investments_provisionssatz_festschreiben()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Alle Schluessel, die nur dieser Trigger schreibt.
  _schluessel constant text[] := ARRAY[
    'lockedProvisionRate', 'lockedProvisionRateAt', 'lockedProvisionRateQuelle',
    'lockedProvisionRatePartner', 'lockedProvisionRateAnlass', 'lockedProvisionRateFehler'
  ];
  _meta jsonb;
  _alt jsonb := '{}'::jsonb;
  _auftrag text;
  _anlass text;
  _hat_serversatz boolean;
  _eintritt boolean;
  _nur_bei_anderem_partner boolean := false;
  _ergebnis record;
  _grund text;
  _meldung text;
  _code text;
  _jetzt text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  -- 1) Schutz. Der Auftrag wird herausgenommen und nie gespeichert, die
  --    Provisionsschluessel des Clients fallen weg, beim Aendern kommt der
  --    gespeicherte Stand zurueck. Ein meta, das kein Objekt ist (etwa []),
  --    zaehlt wie NULL, sonst liesse sich der Schutz damit umgehen. Reine
  --    jsonb-Operationen auf Objekten, sie scheitern nicht.
  IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN
    _meta := '{}'::jsonb;
  ELSE
    _meta := NEW.meta;
  END IF;
  _auftrag := nullif(_meta ->> 'lockedProvisionRateNeu', '');
  _meta := (_meta - 'lockedProvisionRateNeu') - _schluessel;
  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.meta) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      INTO _alt
      FROM jsonb_each(OLD.meta) AS e
     WHERE e.key = ANY(_schluessel);
  END IF;
  _meta := _meta || _alt;

  -- Ein Auftrag zaehlt nur aus einem anderen Trigger (Partnerwechsel) oder
  -- ohne angemeldeten Nutzer (SQL-Editor, Dienstschluessel). Aus dem Browser
  -- wird er stillschweigend verworfen, siehe Kopf.
  IF _auftrag IS NOT NULL AND pg_trigger_depth() <= 1 AND auth.uid() IS NOT NULL THEN
    _auftrag := NULL;
  END IF;

  -- Auftrag "verwerfen": einen Satz, der vor der Kaufphase steht, entfernen,
  -- damit er bei der Reservierung neu gesetzt wird. In der Kaufphase nie.
  -- Genutzt von der Datenkorrektur 20260929150000.
  IF _auftrag = 'verwerfen' THEN
    IF NOT public.pipelinestufe_ist_kaufphase(_meta ->> 'pipelineStufe') THEN
      _meta := _meta - _schluessel;
    END IF;
    NEW.meta := _meta;
    RETURN NEW;
  END IF;

  -- 2) Muss festgeschrieben werden? Nie vor der Kaufphase.
  IF public.pipelinestufe_ist_kaufphase(_meta ->> 'pipelineStufe') THEN
    -- Gueltig ist nur ein Satz, den diese Fassung geschrieben hat; sie
    -- erkennt man an lockedProvisionRateAnlass. Aeltere Saetze, auch die mit
    -- Quelle 'serverseitig' aus dem INSERT-Trigger bis 20260928180000, gelten
    -- als alt und werden beim Eintritt in die Kaufphase neu ermittelt.
    _hat_serversatz := (_meta ? 'lockedProvisionRate') AND (_meta ? 'lockedProvisionRateAnlass');
    IF TG_OP = 'INSERT' THEN
      _eintritt := true;
    ELSE
      _eintritt := NOT public.pipelinestufe_ist_kaufphase(OLD.meta ->> 'pipelineStufe');
    END IF;

    IF _auftrag = 'nachtrag' THEN
      _anlass := 'nachtrag';
    ELSIF _auftrag IS NOT NULL THEN
      _anlass := 'partnerwechsel';
    ELSIF NOT _hat_serversatz AND (_eintritt OR _meta ? 'lockedProvisionRateFehler') THEN
      -- Eintritt in die Kaufphase, oder ein frueherer Versuch in der
      -- Kaufphase ist gescheitert (Vermerk steht da): dann beim naechsten
      -- Speichern noch einmal.
      _anlass := 'reservierung';
    ELSIF _eintritt THEN
      -- Rueckkehr in die Kaufphase mit gueltigem Satz: Neu nur, wenn der
      -- Kunde inzwischen einem anderen Partner gehoert (umgehaengt, waehrend
      -- er nicht in der Kaufphase stand).
      _anlass := 'reservierung';
      _nur_bei_anderem_partner := true;
    END IF;

    IF _anlass IS NOT NULL THEN
      -- 3) Ermitteln. Was hier schiefgeht, wird ein Vermerk am Investment,
      --    nie ein Abbruch: Ein Investment muss sich immer speichern lassen.
      BEGIN
        SELECT * INTO _ergebnis FROM public.provisionssatz_ermitteln(NEW.kunde_id);
        _grund := _ergebnis.grund;
      EXCEPTION WHEN OTHERS THEN
        _grund := 'ausnahme';
        _meldung := SQLERRM;
        _code := SQLSTATE;
        RAISE WARNING 'Provisionssatz fuer Investment % nicht ermittelbar: % (%)', NEW.id, SQLERRM, SQLSTATE;
      END;

      IF _nur_bei_anderem_partner THEN
        -- Der bisherige Satz bleibt, wenn der Partner derselbe ist oder
        -- gerade keiner ermittelbar ist. Nur bei einem anderen gehts weiter.
        IF _grund IS NOT NULL THEN
          _anlass := NULL;
        ELSIF _ergebnis.partner_id::text IS NOT DISTINCT FROM (_meta ->> 'lockedProvisionRatePartner') THEN
          _anlass := NULL;
        END IF;
      END IF;

      IF _anlass IS NULL THEN
        NULL;
      ELSIF _grund IS NULL THEN
        _meta := (_meta - 'lockedProvisionRateFehler') || jsonb_build_object(
          'lockedProvisionRate', _ergebnis.satz,
          'lockedProvisionRateAt', _jetzt,
          'lockedProvisionRateQuelle', CASE WHEN _anlass = 'nachtrag' THEN 'nachgetragen' ELSE 'serverseitig' END,
          'lockedProvisionRatePartner', _ergebnis.partner_id::text,
          'lockedProvisionRateAnlass', _anlass
        );
      ELSE
        -- Ein vorhandener Satz bleibt stehen; der Vermerk sagt, dass der
        -- neue nicht ermittelt werden konnte und warum.
        _meta := _meta || jsonb_build_object(
          'lockedProvisionRateFehler', jsonb_strip_nulls(jsonb_build_object(
            'zeitpunkt', _jetzt,
            'anlass', _anlass,
            'grund', _grund,
            'meldung', _meldung,
            'code', _code
          ))
        );
      END IF;
    END IF;
  END IF;

  NEW.meta := _meta;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.investments_provisionssatz_festschreiben() IS
  'Schreibt den Provisionssatz beim Eintritt in die Kaufphase und auf Auftrag '
  '(Partnerwechsel, Nachtrag) fest. Einziger Schreiber der Schluessel '
  'lockedProvisionRate* in investments.meta.';

DROP TRIGGER IF EXISTS trg_investments_provisionssatz_festschreiben ON public.investments;
CREATE TRIGGER trg_investments_provisionssatz_festschreiben
BEFORE INSERT OR UPDATE OF meta ON public.investments
FOR EACH ROW
EXECUTE FUNCTION public.investments_provisionssatz_festschreiben();

-- ---------------------------------------------------------------------------
-- d) Partnerwechsel am Kontakt
-- ---------------------------------------------------------------------------
--
-- Setzt nur den Auftrag; der Trigger aus c) ermittelt den Satz fuer den dann
-- zustaendigen Partner. Bewusst ohne EXCEPTION-Block: c) faengt jeden Fehler
-- der Ermittlung selbst ab und vermerkt ihn am Investment. Scheitert das
-- UPDATE trotzdem (Sperre, Deadlock), scheitert die Umhaengung sichtbar und
-- kann wiederholt werden, statt still einen falschen Satz stehen zu lassen.
--
-- Ohne neuen Partner (Rueckgabe an die Zentrale) bleibt der Satz stehen.

CREATE OR REPLACE FUNCTION public.kontakte_provisionssatz_partnerwechsel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dass sich die Zustaendigkeit geaendert hat, prueft schon die WHEN-Klausel.
  IF NEW.zustaendig_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Nur ein Schluessel kommt dazu, der Rest von meta bleibt, wie er ist.
  UPDATE public.investments i
     SET meta = coalesce(i.meta, '{}'::jsonb) || jsonb_build_object('lockedProvisionRateNeu', 'partnerwechsel')
   WHERE i.kunde_id = NEW.id
     AND public.pipelinestufe_ist_kaufphase(i.meta ->> 'pipelineStufe')
     AND (i.meta ->> 'lockedProvisionRatePartner') IS DISTINCT FROM NEW.zustaendig_id::text;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.kontakte_provisionssatz_partnerwechsel() IS
  'Beim Umhaengen eines Kunden: Investments in der Kaufphase bekommen den '
  'Satz des neuen Partners (ueber investments_provisionssatz_festschreiben).';

DROP TRIGGER IF EXISTS trg_kontakte_provisionssatz_partnerwechsel ON public.kontakte;
CREATE TRIGGER trg_kontakte_provisionssatz_partnerwechsel
AFTER UPDATE OF zustaendig_id ON public.kontakte
FOR EACH ROW
WHEN (OLD.zustaendig_id IS DISTINCT FROM NEW.zustaendig_id)
EXECUTE FUNCTION public.kontakte_provisionssatz_partnerwechsel();

-- ---------------------------------------------------------------------------
-- e) Provisionseinstellungen nur durch Admin und Inhaber
-- ---------------------------------------------------------------------------
--
-- Christians Grundsatz: Provisionssaetze setzen nur Admin und Inhaber. Bisher
-- erlaubte die Regel "Users update own settings" jedem, in seiner eigenen
-- Zeile custom_provision_rate, _eigen, _setter, karriere_override und
-- provision_locked direkt zu aendern, und merge_user_settings liess es zu,
-- solange provision_locked nicht gesetzt war. Da der Trigger oben den Satz
-- genau daraus festschreibt, haette sich ein Partner so vor der Reservierung
-- einen hoeheren Satz geben koennen.
--
-- Der Waechter bricht nicht ab, er behaelt den alten Wert dieser Schluessel.
-- So scheitert das uebrige Speichern nicht: Eigene Einstellungen (Tutorial,
-- Zwei-Faktor, Zielplanung, Favoriten) laufen ueber merge_user_settings mit
-- anderen Schluesseln weiter. Die Nutzerverwaltung (TeampartnerProfil,
-- Aktivierung neuer Partner) schreibt fremde Zeilen ebenfalls ueber
-- merge_user_settings, und das verlangt schon heute Admin oder Inhaber;
-- ohne angemeldeten Nutzer (invite-user, SQL-Editor) bleibt alles erlaubt.
-- Beim Anlegen einer Zeile durch einen Nicht-Admin fallen die Schluessel weg.

CREATE OR REPLACE FUNCTION public.user_settings_provision_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _schluessel constant text[] := ARRAY[
    'custom_provision_rate', 'custom_provision_rate_eigen', 'custom_provision_rate_setter',
    'karriere_override', 'provision_locked', 'provision_locked_at'
  ];
  _neu jsonb;
  _alt jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.einstellungen) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      INTO _alt
      FROM jsonb_each(OLD.einstellungen) AS e
     WHERE e.key = ANY(_schluessel);
  END IF;

  -- Kein Objekt (NULL, []) zaehlt wie leer, sonst liesse sich der Schutz
  -- umgehen. Gab es nichts zu schuetzen, bleibt der neue Wert, wie er ist.
  IF NEW.einstellungen IS NULL OR jsonb_typeof(NEW.einstellungen) <> 'object' THEN
    IF _alt = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    _neu := '{}'::jsonb;
  ELSE
    _neu := NEW.einstellungen;
  END IF;

  IF (_neu - _schluessel) || _alt IS DISTINCT FROM _neu THEN
    RAISE WARNING 'Provisionseinstellungen von Nutzer % nicht geaendert: nur Admin und Inhaber', NEW.user_id;
  END IF;
  NEW.einstellungen := (_neu - _schluessel) || _alt;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.user_settings_provision_schuetzen() IS
  'Provisionssaetze, Karrierestufe und Festschreibung in user_settings.einstellungen '
  'aendern nur Admin, Inhaber oder der Server; sonst bleibt der alte Wert.';

DROP TRIGGER IF EXISTS trg_user_settings_provision_schuetzen ON public.user_settings;
CREATE TRIGGER trg_user_settings_provision_schuetzen
BEFORE INSERT OR UPDATE OF einstellungen ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.user_settings_provision_schuetzen();

-- ---------------------------------------------------------------------------
-- f) Rechte
-- ---------------------------------------------------------------------------
--
-- Die Funktionen lesen als SECURITY DEFINER an RLS vorbei fremde
-- user_settings. Nur Server (Trigger laufen als Tabellenbesitzer) und
-- service_role duerfen sie rufen. Das REVOKE von PUBLIC ist der Teil, der
-- bisher fehlte.

REVOKE ALL ON FUNCTION public.provisionssatz_ermitteln(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisionssatz_ermitteln(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.investment_partner_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.investment_partner_id(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.investments_provisionssatz_festschreiben() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kontakte_provisionssatz_partnerwechsel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_settings_provision_schuetzen() FROM PUBLIC, anon, authenticated;

-- Rechnet nur auf dem uebergebenen Text, verraet nichts.
REVOKE ALL ON FUNCTION public.pipelinestufe_ist_kaufphase(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pipelinestufe_ist_kaufphase(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 46.1 bis 46.8 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
