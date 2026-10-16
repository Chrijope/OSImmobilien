-- ===========================================================================
-- Partnerstruktur: Vertriebspartner laden Partner ein, Differenz je Ebene
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (16.10.2026)
--
--   - Ein Vertriebspartner laedt eigene Vertriebspartner ein und gibt ihnen
--     einen Satz (gilt fuer Lead und Eigen), hoechstens seinen Eigen-Satz.
--     Spaeter darf er die Saetze in seiner Struktur aendern, mit derselben
--     Grenze.
--   - Er sieht alle Ebenen unter sich. Vertriebsleiter sehen alle, Admin und
--     Inhaber alles.
--   - Jede Ebene bekommt die Differenz zur Ebene darunter (A 10 %, B 8 %,
--     C 5 %: C 5, B 3, A 2). Die Kette wird ab der Reservierung
--     festgeschrieben wie der Satz des Partners.
--
-- Massgeblich fuer die Struktur ist allein user_settings.teamleader_id.
--
-- WAS DIESE MIGRATION TUT
--
--   1. struktur_unter(leiter) und struktur_kette(partner): die Struktur ueber
--      alle Ebenen, nach unten und nach oben, gegen Kreise auf 20 Ebenen
--      begrenzt. Nur Server. meine_struktur() liefert die eigene Struktur
--      des angemeldeten Nutzers.
--   2. Leseregel: Ein Nutzer liest die user_settings seiner ganzen Struktur
--      (bisher nur die direkte Ebene).
--   3. Schutz-Trigger user_settings_provision_schuetzen neu:
--        - teamleader_id und geworben_von_user_id gehoeren jetzt zu den
--          geschuetzten Schluesseln. Bisher konnte sich ein Partner seinen
--          Teamleiter selbst eintragen; bei einer Differenzprovision waere
--          das Geld.
--        - Wer in der Struktur ueber jemandem steht, darf dessen Lead- und
--          Eigen-Satz setzen, hoechstens bis zu seinem eigenen Eigen-Satz.
--        - Ein Teamleiter, der einen Kreis ergaebe, wird abgelehnt, auch fuer
--          Admin und Inhaber.
--   4. struktur_satz_setzen(partner, satz): der Weg dafuer aus dem Browser.
--   5. provisionskette_ermitteln und Festschreibung der Kette im Trigger
--      investments_provisionssatz_festschreiben (Schluessel
--      lockedProvisionKette). Die Eigen-/Zugewiesen-Logik steht dafuer in
--      kontakt_eigen_fuer_partner, provisionssatz_ermitteln nutzt sie
--      unveraendert.
--   6. Seitenrechte: Nutzerverwaltung fuer Vertriebspartner und
--      Vertriebsleitung (dort erscheint ihre Struktur, nicht die Verwaltung).
--
-- WAS SICH NICHT AENDERT
--
--   Keine Bestandsdaten. Bereits festgeschriebene Vorgaenge bekommen keine
--   Kette nachgetragen: Eine Differenz gibt es nur fuer Vorgaenge, die ab
--   dieser Migration in die Kaufphase kommen. Kunden und Vorgaenge der
--   Struktur bleiben fuer den Teamleiter unsichtbar; die Differenz rechnet
--   die Monatsabrechnung.
--
-- Mehrfach ausfuehrbar. Voraussetzungen: 20260929140000, 20261015121000.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.provisionssatz_fuer_partner(uuid,boolean)') IS NULL
     OR to_regprocedure('public.provisionssatz_ermitteln(uuid)') IS NULL
     OR to_regprocedure('public.einstellung_zahl(jsonb,text)') IS NULL
     OR to_regprocedure('public.provisionssatz_im_bereich(jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20260929140000 und 20261015121000 ausfuehren.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Struktur ueber alle Ebenen
-- ---------------------------------------------------------------------------

-- Teamleiter aus einem einstellungen-Objekt, nur als gueltige Kennung.
CREATE OR REPLACE FUNCTION public.teamleiter_aus(_einstellungen jsonb, _selbst uuid)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(_einstellungen) = 'object'
     AND _einstellungen ->> 'teamleader_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (_einstellungen ->> 'teamleader_id')::uuid IS DISTINCT FROM _selbst
    THEN (_einstellungen ->> 'teamleader_id')::uuid
  END;
$$;

CREATE OR REPLACE FUNCTION public.struktur_unter(_leiter uuid)
RETURNS TABLE(mitglied_id uuid, ebene integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE baum(id, tiefe) AS (
    SELECT s.user_id, 1
      FROM public.user_settings s
     WHERE public.teamleiter_aus(s.einstellungen, s.user_id) = _leiter
    UNION
    SELECT s.user_id, b.tiefe + 1
      FROM public.user_settings s
      JOIN baum b ON public.teamleiter_aus(s.einstellungen, s.user_id) = b.id
     WHERE b.tiefe < 20
  )
  SELECT id, min(tiefe) FROM baum WHERE id IS DISTINCT FROM _leiter GROUP BY id;
$$;

COMMENT ON FUNCTION public.struktur_unter(uuid) IS
  'Alle Partner unter einem Teamleiter ueber alle Ebenen (teamleader_id), '
  'mit der Ebene. Hoechstens 20 Ebenen. Nur Server.';

CREATE OR REPLACE FUNCTION public.struktur_kette(_partner uuid)
RETURNS TABLE(ebene integer, leiter_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE kette(tiefe, id, pfad) AS (
    SELECT 1, public.teamleiter_aus(s.einstellungen, s.user_id), ARRAY[_partner]
      FROM public.user_settings s
     WHERE s.user_id = _partner
    UNION ALL
    SELECT k.tiefe + 1, public.teamleiter_aus(s.einstellungen, s.user_id), k.pfad || k.id
      FROM kette k
      JOIN public.user_settings s ON s.user_id = k.id
     WHERE k.id IS NOT NULL AND k.tiefe < 20 AND NOT (k.id = ANY(k.pfad))
  )
  SELECT tiefe, id FROM kette WHERE id IS NOT NULL AND NOT (id = ANY(pfad)) ORDER BY tiefe;
$$;

COMMENT ON FUNCTION public.struktur_kette(uuid) IS
  'Die Teamleiter ueber einem Partner, von unten nach oben (Ebene 1 = direkter '
  'Teamleiter). Endet bei einem Kreis oder nach 20 Ebenen. Nur Server.';

CREATE OR REPLACE FUNCTION public.meine_struktur()
RETURNS TABLE(mitglied_id uuid, ebene integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.mitglied_id, u.ebene FROM public.struktur_unter(auth.uid()) u WHERE auth.uid() IS NOT NULL;
$$;

COMMENT ON FUNCTION public.meine_struktur() IS
  'Die Struktur des angemeldeten Nutzers ueber alle Ebenen.';

-- Obergrenze fuer Saetze in der eigenen Struktur: der eigene Eigen-Satz,
-- im Altbestand ersatzweise der allgemeine Satz.
CREATE OR REPLACE FUNCTION public.provisions_obergrenze(_nutzer uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    public.einstellung_zahl(s.einstellungen, 'custom_provision_rate_eigen'),
    public.einstellung_zahl(s.einstellungen, 'custom_provision_rate')
  )
    FROM public.user_settings s
   WHERE s.user_id = _nutzer
     AND jsonb_typeof(s.einstellungen) = 'object';
$$;

-- ---------------------------------------------------------------------------
-- 2) Leseregel: die ganze Struktur
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Struktur liest user_settings" ON public.user_settings;
CREATE POLICY "Struktur liest user_settings"
ON public.user_settings
FOR SELECT
TO authenticated
USING (user_id IN (SELECT m.mitglied_id FROM public.meine_struktur() m));

-- ---------------------------------------------------------------------------
-- 3) Schutz der Provisions- und Struktur-Schluessel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_settings_provision_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _schluessel constant text[] := ARRAY[
    'custom_provision_rate', 'custom_provision_rate_eigen', 'custom_provision_rate_setter',
    'karriere_override', 'provision_locked', 'provision_locked_at',
    'teamleader_id', 'geworben_von_user_id'
  ];
  _struktur_saetze constant text[] := ARRAY['custom_provision_rate_setter', 'custom_provision_rate_eigen'];
  _neu jsonb;
  _alt jsonb := '{}'::jsonb;
  _leiter_neu uuid;
  _leiter_alt uuid;
  _grenze numeric;
  _k text;
BEGIN
  IF NEW.einstellungen IS NULL OR jsonb_typeof(NEW.einstellungen) <> 'object' THEN
    _neu := '{}'::jsonb;
  ELSE
    _neu := NEW.einstellungen;
  END IF;

  -- Kein Kreis: der neue Teamleiter darf nicht der Nutzer selbst oder jemand
  -- aus seiner Struktur sein. Gilt fuer jeden, auch fuer Admin und Server.
  _leiter_neu := public.teamleiter_aus(_neu, NEW.user_id);
  IF TG_OP = 'UPDATE' THEN
    _leiter_alt := public.teamleiter_aus(OLD.einstellungen, OLD.user_id);
  END IF;
  IF _leiter_neu IS NOT NULL AND _leiter_neu IS DISTINCT FROM _leiter_alt
     AND EXISTS (SELECT 1 FROM public.struktur_unter(NEW.user_id) u WHERE u.mitglied_id = _leiter_neu) THEN
    RAISE EXCEPTION 'Diese Zuordnung ergaebe einen Kreis in der Struktur: Der Teamleiter steht schon unter diesem Partner.';
  END IF;

  IF auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.einstellungen) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      INTO _alt
      FROM jsonb_each(OLD.einstellungen) AS e
     WHERE e.key = ANY(_schluessel);
  END IF;

  -- Wer in der Struktur ueber dem Nutzer steht, darf Lead- und Eigen-Satz
  -- setzen, hoechstens bis zu seinem eigenen Eigen-Satz.
  IF NEW.user_id IS DISTINCT FROM auth.uid()
     AND EXISTS (SELECT 1 FROM public.struktur_unter(auth.uid()) u WHERE u.mitglied_id = NEW.user_id) THEN
    _grenze := public.provisions_obergrenze(auth.uid());
    FOREACH _k IN ARRAY _struktur_saetze LOOP
      IF _grenze IS NOT NULL
         AND jsonb_typeof(_neu -> _k) = 'number'
         AND (_neu ->> _k)::numeric > 0
         AND (_neu ->> _k)::numeric <= _grenze THEN
        _alt := (_alt - _k) || jsonb_build_object(_k, _neu -> _k);
      END IF;
    END LOOP;
  END IF;

  IF (_neu - _schluessel) || _alt IS DISTINCT FROM _neu THEN
    RAISE WARNING 'Provisions- oder Struktureinstellungen von Nutzer % nicht geaendert', NEW.user_id;
  END IF;
  NEW.einstellungen := (_neu - _schluessel) || _alt;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.user_settings_provision_schuetzen() IS
  'Provisionssaetze, Teamleiter und Werber in user_settings aendern nur Admin, '
  'Inhaber und der Server; Lead- und Eigen-Satz zusaetzlich, wer in der '
  'Struktur darueber steht, bis zu seinem Eigen-Satz. Kein Kreis.';

DROP TRIGGER IF EXISTS trg_user_settings_provision_schuetzen ON public.user_settings;
CREATE TRIGGER trg_user_settings_provision_schuetzen
BEFORE INSERT OR UPDATE OF einstellungen ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.user_settings_provision_schuetzen();

-- ---------------------------------------------------------------------------
-- 4) Satz in der eigenen Struktur setzen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.struktur_satz_setzen(_partner uuid, _satz numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _grenze numeric;
  _e jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.';
  END IF;
  IF _satz IS NULL OR _satz <= 0 OR _satz > 100 THEN
    RAISE EXCEPTION 'Bitte trag einen Provisionssatz zwischen 0 und 100 Prozent ein.';
  END IF;
  IF NOT public.is_admin_role(_uid) THEN
    IF NOT EXISTS (SELECT 1 FROM public.struktur_unter(_uid) u WHERE u.mitglied_id = _partner) THEN
      RAISE EXCEPTION 'Dieser Partner gehoert nicht zu deiner Struktur.';
    END IF;
    _grenze := public.provisions_obergrenze(_uid);
    IF _grenze IS NULL THEN
      RAISE EXCEPTION 'Fuer dich ist noch kein Provisionssatz hinterlegt. Bitte wende dich an die Geschaeftsleitung.';
    END IF;
    IF _satz > _grenze THEN
      RAISE EXCEPTION 'Hoechstens dein Eigen-Satz: % Prozent.', _grenze;
    END IF;
  END IF;

  INSERT INTO public.user_settings (user_id, einstellungen)
  VALUES (_partner, jsonb_build_object('custom_provision_rate_setter', _satz, 'custom_provision_rate_eigen', _satz))
  ON CONFLICT (user_id) DO UPDATE
    SET einstellungen = (CASE WHEN jsonb_typeof(public.user_settings.einstellungen) = 'object'
                              THEN public.user_settings.einstellungen ELSE '{}'::jsonb END)
                        || jsonb_build_object('custom_provision_rate_setter', _satz, 'custom_provision_rate_eigen', _satz),
        updated_at = now();

  -- Gegenprobe: Der Schutz-Trigger verwirft still; dann soll es laut scheitern.
  SELECT einstellungen INTO _e FROM public.user_settings WHERE user_id = _partner;
  IF public.einstellung_zahl(_e, 'custom_provision_rate_eigen') IS DISTINCT FROM _satz
     OR public.einstellung_zahl(_e, 'custom_provision_rate_setter') IS DISTINCT FROM _satz THEN
    RAISE EXCEPTION 'Der Provisionssatz wurde nicht gespeichert.';
  END IF;
  RETURN _satz;
END;
$$;

COMMENT ON FUNCTION public.struktur_satz_setzen(uuid, numeric) IS
  'Setzt Lead- und Eigen-Satz eines Partners: Admin und Inhaber jeden, sonst '
  'nur in der eigenen Struktur und hoechstens bis zum eigenen Eigen-Satz.';

-- ---------------------------------------------------------------------------
-- 5) Kette festschreiben
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kontakt_eigen_fuer_partner(_kunde_id uuid, _partner uuid)
RETURNS boolean
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
  partner_id uuid := _partner;
BEGIN
  SELECT k.zustaendig_id, k.berater, coalesce(k.meta, '{}'::jsonb) AS meta
    INTO _kontakt
    FROM public.kontakte k
   WHERE k.id = _kunde_id
   LIMIT 1;
  IF NOT FOUND OR _partner IS NULL THEN
    RETURN false;
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

  RETURN _eigen;
END;
$$;

COMMENT ON FUNCTION public.kontakt_eigen_fuer_partner(uuid, uuid) IS
  'Hat dieser Partner den Kontakt selbst angelegt (eigen) oder wurde er ihm '
  'zugewiesen? Spiegel von istEigenKontakt im Frontend. Aus '
  'provisionssatz_ermitteln (20260929140000) herausgeloest.';

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

  _eigen := public.kontakt_eigen_fuer_partner(_kunde_id, partner_id);

  satz := public.provisionssatz_fuer_partner(partner_id, _eigen);
  IF satz IS NULL OR satz <= 0 THEN
    satz := NULL;
    grund := 'kein_satz_ermittelbar';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.provisionskette_ermitteln(_kunde_id uuid, _partner uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ebene', k.ebene,
        'partner', k.leiter_id::text,
        'satz', public.provisionssatz_fuer_partner(k.leiter_id, public.kontakt_eigen_fuer_partner(_kunde_id, _partner))
      ) ORDER BY k.ebene
    ),
    '[]'::jsonb
  )
  FROM public.struktur_kette(_partner) k;
$$;

COMMENT ON FUNCTION public.provisionskette_ermitteln(uuid, uuid) IS
  'Die Teamleiter ueber dem Partner mit ihrem Satz fuer diesen Vorgang '
  '(eigen oder zugewiesen wie beim Partner). Wird mit dem Satz festgeschrieben.';

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
    'lockedProvisionRatePartner', 'lockedProvisionRateAnlass', 'lockedProvisionRateFehler',
    'lockedProvisionKette'
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
          'lockedProvisionRateAnlass', _anlass,
          -- Seit 20261016100000: die Teamleiter-Kette mit ihren Saetzen,
          -- zum selben Zeitpunkt fest. Daraus rechnet die Abrechnung die
          -- Differenz je Ebene; eine spaetere Aenderung an Struktur oder
          -- Saetzen wirkt auf diesen Vorgang nicht mehr.
          'lockedProvisionKette', public.provisionskette_ermitteln(NEW.kunde_id, _ergebnis.partner_id)
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

-- ---------------------------------------------------------------------------
-- 6) Rechte
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.teamleiter_aus(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teamleiter_aus(jsonb, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.struktur_unter(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.struktur_unter(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.struktur_kette(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.struktur_kette(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.provisions_obergrenze(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisions_obergrenze(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.kontakt_eigen_fuer_partner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kontakt_eigen_fuer_partner(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.provisionskette_ermitteln(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisionskette_ermitteln(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.provisionssatz_ermitteln(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisionssatz_ermitteln(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.investments_provisionssatz_festschreiben() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_settings_provision_schuetzen() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.meine_struktur() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meine_struktur() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.struktur_satz_setzen(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.struktur_satz_setzen(uuid, numeric) TO authenticated, service_role;

-- Seitenrechte: Unter /nutzerverwaltung sehen Vertriebspartner und
-- Vertriebsleitung ihre Struktur (App.tsx), nicht die Verwaltung.
INSERT INTO public.role_permissions (role, url) VALUES
  ('vertriebspartner', '/nutzerverwaltung'),
  ('vertriebsleiter', '/nutzerverwaltung')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
