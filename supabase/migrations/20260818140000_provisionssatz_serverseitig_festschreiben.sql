-- ===========================================================================
-- Provisionssatz beim Anlegen eines Investments serverseitig festschreiben
-- ===========================================================================
--
-- Bisher rechnete der anlegende Browser den festzuschreibenden Satz selbst
-- (src/lib/investmentsStore.ts, addInvestment) aus cacheGet("user_settings").
-- Das ging schief, sobald jemand ein Investment fuer einen FREMDEN Partner
-- anlegte, dessen user_settings er per RLS nicht lesen darf (z. B. Team Lead
-- oder Backoffice): die Settings-Zeile fehlte im Cache, der Fallback fror
-- stillschweigend 3 % ein, und dieser falsche Wert schlug danach jede
-- Korrektur.
--
-- Ab jetzt bestimmt ein BEFORE-INSERT-Trigger den Satz direkt in der
-- Datenbank. Er liest user_settings als SECURITY DEFINER, unabhaengig davon,
-- wer das Investment anlegt. Der Client schreibt lockedProvisionRate nicht
-- mehr selbst.
--
-- Prioritaet (identisch zur Kette in src/lib/karriereStufeHelper.ts,
-- getEffectiveRateInfoForKontakt, ohne den Investment-Lock, der hier ja erst
-- entsteht):
--   1. custom_provision_rate_eigen bzw. custom_provision_rate_setter,
--      je nachdem ob der Kontakt eigen oder zugewiesen ist
--   2. custom_provision_rate
--   3. Stufensatz aus karriere_override (Kennung zuerst, dann Titel,
--      dann Legacy-Alias)
--   4. Satz der ersten Stufe (3 %), wie KARRIERE_STUFEN[0] im Frontend
--
-- Ob die Saetze festgeschrieben sind (provision_locked) spielt fuer die WAHL
-- des Wertes keine Rolle: gesperrt oder nicht, es sind dieselben Felder.

-- ── 1. Die Karrierestufen als Tabelle ──────────────────────────────────────
--
-- WICHTIG: Diese Tabelle ist das SQL-Abbild von KARRIERE_STUFEN in
-- src/lib/karriereStufeHelper.ts (inklusive der Legacy-Aliase dort).
-- Aendert sich dort eine Stufe, ein Satz oder ein Alias, muss eine Migration
-- diese Tabelle nachziehen, sonst frieren Trigger und Datenbank andere Saetze
-- ein als das Frontend anzeigt.

CREATE TABLE IF NOT EXISTS public.karriere_stufen (
  id text PRIMARY KEY,
  titel text NOT NULL,
  rate numeric NOT NULL,
  sortierung integer NOT NULL,
  legacy_aliase text[] NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.karriere_stufen IS
  'SQL-Abbild von KARRIERE_STUFEN aus src/lib/karriereStufeHelper.ts. '
  'Muss bei jeder Aenderung dort per Migration synchron gehalten werden. '
  'Befuellt nur ueber Migrationen, keine Schreibrechte fuer Clients.';

INSERT INTO public.karriere_stufen (id, titel, rate, sortierung, legacy_aliase) VALUES
  ('tippgeber',        'Vertriebspartner', 3,   1, ARRAY['junior berater']),
  ('vertriebspartner', 'Lead Partner',     4,   2, ARRAY['berater', 'lead berater']),
  ('manager',          'Team Lead',        4.5, 3, ARRAY['team berater']),
  ('vertriebsfirma',   'Lizenzpartner',    5,   4, ARRAY['senior berater'])
ON CONFLICT (id) DO UPDATE
  SET titel = EXCLUDED.titel,
      rate = EXCLUDED.rate,
      sortierung = EXCLUDED.sortierung,
      legacy_aliase = EXCLUDED.legacy_aliase;

ALTER TABLE public.karriere_stufen ENABLE ROW LEVEL SECURITY;

-- Lesen darf jeder Angemeldete (die Stufen stehen ohnehin im Frontend-Code),
-- schreiben niemand ausser Migrationen (keine INSERT/UPDATE/DELETE-Policy).
DROP POLICY IF EXISTS "Alle lesen Karrierestufen" ON public.karriere_stufen;
CREATE POLICY "Alle lesen Karrierestufen"
ON public.karriere_stufen
FOR SELECT
TO authenticated
USING (true);

-- ── 2. Sicheres Zahl-Lesen aus dem freien einstellungen-JSON ───────────────
--
-- In einstellungen steht freies JSON. Ein direkter ::numeric-Cast wuerde bei
-- einem versehentlichen String die ganze Abfrage sprengen. Gilt wie im
-- Frontend: nur Zahlen groesser 0 zaehlen als gepflegter Satz.

CREATE OR REPLACE FUNCTION public.einstellung_zahl(_einstellungen jsonb, _key text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(_einstellungen -> _key) = 'number'
         AND (_einstellungen ->> _key)::numeric > 0
      THEN (_einstellungen ->> _key)::numeric
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.einstellung_zahl(jsonb, text) IS
  'Liest einen Provisionssatz aus user_settings.einstellungen. Nur echte '
  'JSON-Zahlen groesser 0 zaehlen, alles andere ergibt NULL.';

-- ── 3. Stufen-Aufloesung, Kennung zuerst ───────────────────────────────────
--
-- Spiegel von findKarriereStufe im Frontend: Der Titel der ersten Stufe
-- ("Vertriebspartner") ist bis auf die Schreibweise gleich mit der Kennung
-- der zweiten Stufe ("vertriebspartner"). Deshalb laufen die Kennungen in
-- einem eigenen, exakten Durchlauf VOR den Titeln.

CREATE OR REPLACE FUNCTION public.karriere_stufe_rate(_wert text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _raw text := trim(coalesce(_wert, ''));
  _norm text := lower(trim(coalesce(_wert, '')));
  _rate numeric;
BEGIN
  IF _norm = '' THEN
    RETURN NULL;
  END IF;

  -- 1. Exakte Kennung (so schreiben Nutzerverwaltung und Aktivierung den Wert).
  SELECT rate INTO _rate FROM public.karriere_stufen WHERE id = _raw;
  IF FOUND THEN RETURN _rate; END IF;

  -- 2. Titel, fuer Altbestand wie "Lead Partner" oder "Vertriebspartner".
  SELECT rate INTO _rate FROM public.karriere_stufen WHERE lower(titel) = _norm;
  IF FOUND THEN RETURN _rate; END IF;

  -- 3. Kennung in abweichender Schreibweise (z. B. "MANAGER").
  SELECT rate INTO _rate FROM public.karriere_stufen WHERE id = _norm;
  IF FOUND THEN RETURN _rate; END IF;

  -- 4. Legacy-Aliase aus alten Datenbestaenden.
  SELECT rate INTO _rate FROM public.karriere_stufen WHERE _norm = ANY(legacy_aliase);
  IF FOUND THEN RETURN _rate; END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.karriere_stufe_rate(text) IS
  'Loest einen gespeicherten Karriere-Wert (Kennung, Titel oder Legacy-Alias) '
  'auf den Stufensatz auf. Kennung-zuerst wie findKarriereStufe im Frontend. '
  'NULL bei leerem oder unbekanntem Wert.';

-- ── 4. Zustaendiger Partner eines Investments ──────────────────────────────
--
-- Gleiche Reihenfolge wie der bisherige Client-Code: erst der Berater-Name
-- gegen profiles.name, dann kontakte.zustaendig_id.

CREATE OR REPLACE FUNCTION public.investment_partner_id(_kunde_id text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _berater text;
  _zustaendig uuid;
  _partner uuid;
BEGIN
  SELECT k.berater, k.zustaendig_id
    INTO _berater, _zustaendig
    FROM public.kontakte k
   WHERE k.id::text = _kunde_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF coalesce(trim(_berater), '') <> '' THEN
    SELECT p.id INTO _partner FROM public.profiles p WHERE p.name = _berater LIMIT 1;
    IF _partner IS NOT NULL THEN
      RETURN _partner;
    END IF;
  END IF;

  RETURN _zustaendig;
END;
$$;

COMMENT ON FUNCTION public.investment_partner_id(text) IS
  'Zustaendiger Vertriebspartner zu einer investments.kunde_id: erst der '
  'Berater-Name gegen profiles.name, dann kontakte.zustaendig_id.';

-- ── 5. Der Satz fuer einen Partner ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.provisionssatz_fuer_partner(_partner uuid, _eigen boolean)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _e jsonb := '{}'::jsonb;
  _rate numeric;
BEGIN
  IF _partner IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(einstellungen, '{}'::jsonb) INTO _e
    FROM public.user_settings
   WHERE user_id = _partner;
  IF NOT FOUND THEN
    _e := '{}'::jsonb;
  END IF;

  -- 1. Der zum Fall passende Satz (eigen bzw. zugewiesen).
  _rate := CASE
    WHEN _eigen THEN public.einstellung_zahl(_e, 'custom_provision_rate_eigen')
    ELSE public.einstellung_zahl(_e, 'custom_provision_rate_setter')
  END;
  IF _rate IS NOT NULL THEN RETURN _rate; END IF;

  -- 2. Der allgemeine individuelle Satz.
  _rate := public.einstellung_zahl(_e, 'custom_provision_rate');
  IF _rate IS NOT NULL THEN RETURN _rate; END IF;

  -- 3. Der Stufensatz aus dem karriere_override.
  _rate := public.karriere_stufe_rate(_e ->> 'karriere_override');
  IF _rate IS NOT NULL THEN RETURN _rate; END IF;

  -- 4. Erste Stufe, wie KARRIERE_STUFEN[0] im Frontend.
  SELECT rate INTO _rate FROM public.karriere_stufen ORDER BY sortierung LIMIT 1;
  RETURN _rate;
END;
$$;

COMMENT ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) IS
  'Effektiver Provisionssatz eines Partners: eigener/zugewiesener Satz, dann '
  'allgemeiner individueller Satz, dann Stufensatz aus karriere_override, '
  'dann erste Stufe. Gleiche Kette wie getEffectiveRateInfoForKontakt im '
  'Frontend (ohne Investment-Lock).';

-- ── 6. Der Trigger ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.investments_provisionssatz_festschreiben()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt record;
  _partner uuid;
  _eigen boolean := false;
  _setter text;
  _ersteller_id text;
  _ersteller_name text;
  _berater_name text;
  _rate numeric;
BEGIN
  -- Ein Fehler hier darf NIE das Anlegen eines Investments verhindern.
  BEGIN
    SELECT k.zustaendig_id, k.berater, coalesce(k.meta, '{}'::jsonb) AS meta
      INTO _kontakt
      FROM public.kontakte k
     WHERE k.id::text = NEW.kunde_id
     LIMIT 1;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    _partner := public.investment_partner_id(NEW.kunde_id);
    IF _partner IS NULL THEN
      RETURN NEW;
    END IF;

    -- Eigen oder zugewiesen? Spiegel von istEigenKontakt im Frontend:
    -- ein eingetragener Setter bedeutet immer zugewiesen; sonst zaehlt, wer
    -- den Kontakt angelegt hat (erstelltVonId, notfalls der Name); ohne
    -- beides gilt die vorsichtigere Annahme "zugewiesen".
    _setter := nullif(trim(coalesce(_kontakt.meta ->> 'setter', '')), '');
    IF _setter IS NOT NULL THEN
      _eigen := false;
    ELSE
      _ersteller_id := nullif(trim(coalesce(_kontakt.meta ->> 'erstelltVonId', '')), '');
      IF _ersteller_id IS NOT NULL THEN
        _eigen := (_ersteller_id = _partner::text);
      ELSE
        _ersteller_name := lower(trim(coalesce(_kontakt.meta ->> 'erstelltVonName', '')));
        _berater_name := lower(trim(coalesce(_kontakt.berater, '')));
        _eigen := _ersteller_name <> '' AND _berater_name <> '' AND _ersteller_name = _berater_name;
      END IF;
    END IF;

    _rate := public.provisionssatz_fuer_partner(_partner, _eigen);
    IF _rate IS NULL OR _rate <= 0 THEN
      RETURN NEW;
    END IF;

    -- Der Server ist die einzige Wahrheit: ein eventuell vom Client
    -- mitgeschickter Wert wird ueberschrieben.
    NEW.meta := coalesce(NEW.meta, '{}'::jsonb) || jsonb_build_object(
      'lockedProvisionRate', _rate,
      'lockedProvisionRateAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'lockedProvisionRateQuelle', 'serverseitig'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Provisionssatz konnte fuer Investment % nicht festgeschrieben werden: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_investments_provisionssatz_festschreiben ON public.investments;
CREATE TRIGGER trg_investments_provisionssatz_festschreiben
BEFORE INSERT ON public.investments
FOR EACH ROW
EXECUTE FUNCTION public.investments_provisionssatz_festschreiben();

-- ── 7. Rechte ──────────────────────────────────────────────────────────────
--
-- investment_partner_id und provisionssatz_fuer_partner lesen als
-- SECURITY DEFINER an RLS vorbei fremde user_settings. Ein beliebiger
-- Angemeldeter koennte damit die Provisionssaetze aller Partner abfragen.
-- Deshalb: nur der Server (Trigger laeuft als Tabellenbesitzer) und
-- service_role duerfen sie rufen.

REVOKE ALL ON FUNCTION public.investment_partner_id(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.investment_partner_id(text) TO service_role;

REVOKE ALL ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisionssatz_fuer_partner(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.investments_provisionssatz_festschreiben() FROM anon, authenticated;

-- einstellung_zahl und karriere_stufe_rate verraten nichts Fremdes
-- (reine Rechenhelfer bzw. oeffentlich bekannte Stufen), sie bleiben
-- fuer authenticated aufrufbar.
GRANT EXECUTE ON FUNCTION public.einstellung_zahl(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.karriere_stufe_rate(text) TO authenticated, service_role;
