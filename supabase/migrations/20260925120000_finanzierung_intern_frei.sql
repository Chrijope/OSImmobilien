-- ===========================================================================
-- Finanzierung erst ab unterschriebener Reservierung, auch serverseitig
-- ===========================================================================
--
-- WORUM ES GEHT (Christian, 25.09.2026)
--
-- Im Kundenprofil ist die Finanzierung offen ab der Reservierung, sobald die
-- Reservierung unterschrieben ist und ein Objekt am Investment steht, und
-- zwar ausdruecklich auch waehrend der Stufe "bonitaetsunterlagen". Die Regel
-- steht im Frontend an einer Stelle: `finanzierungIntern` in
-- `src/lib/investmentFreischaltung.ts`.
--
-- Eine ausgeblendete Karte ist aber keine Zugriffskontrolle. Die
-- Zeilensicherheit auf `finanzierungen` und `investments` prueft nur Rolle und
-- Zustaendigkeit (20260916191000). Wer zustaendig ist, konnte also per
-- direktem Aufruf ein Angebot anlegen oder den Finanzierungsstand setzen,
-- bevor die Reservierung unterschrieben war.
--
-- WAS DIE KARTE VOR DER FREISCHALTUNG VERHINDERT, UND WAS HIER GILT
--
--   1. Einfuegen und Aendern in `public.finanzierungen`. Dort liegen alle
--      Angebote samt ihren Dokumenten (Finanzierungsangebot, Grundschuld,
--      Darlehensvertrag) im Feld `angebote`. Die Karte schreibt nur hierhin
--      (`src/lib/finanzierungStore.ts`).
--   2. `finanzierungsStatus` und `finanzierungsBank` in `investments.meta`.
--      Die Karte setzt den Stand auf "bestaetigt", wenn der Darlehensvertrag
--      unterschrieben ist.
--
-- Beides wird fuer angemeldete Nutzer abgelehnt, solange die Regel nicht
-- erfuellt ist.
--
-- WAS DIE DATENBANK VERLAESSLICH WEISS, UND WAS NICHT
--
--   Stufe             `investments.meta->>'pipelineStufe'`. Dasselbe Feld
--                     liest das Frontend (`fromDb` in investmentsStore.ts).
--   Unterschrift      `investments.meta->>'rvSigned'`. Gesetzt von der Edge
--                     Function `finalize-reservierung` mit dem
--                     Dienstschluessel; das Frontend setzt es nirgends.
--   Objekt            NICHT erzwungen. Ob ein Objekt gesetzt ist, leitet das
--                     Frontend aus mehreren Stellen ab (Bestandswohnung,
--                     `rvVirtualWohnung`, `wohnungSnapshot`, Kaufpreis ...,
--                     siehe `objektDatenFehlen`). Das in SQL nachzubauen
--                     waere eine zweite Wahrheit. Die Luecke ist klein: Eine
--                     Reservierung laesst sich im Frontend nur mit Objekt
--                     oder als Investagon-Vorgang oeffnen.
--
-- AUSNAHMEN
--
--   Admin und Inhaber            duerfen immer.
--   Dienstschluessel             `auth.uid()` ist leer: Edge Functions und
--                                der SQL-Editor duerfen immer.
--   Altbestand                   Hat ein Investment schon Finanzierungsdaten
--                                (Angebote in `finanzierungen`, oder
--                                `finanzierungsStatus` bzw. `finanzierungsBank`
--                                im Meta), bleiben Aenderungen daran erlaubt.
--                                Nichts Bestehendes wird gesperrt.
--   Selbstfinanzierer            Die bestehende Sonderregel bleibt: Der
--                                Vermerk "Kunde finanziert selbst" laesst die
--                                Bonitaetsunterlagen entfallen. Diese Regel
--                                fragt die Bonitaet gar nicht ab, und der
--                                Eigenfinanzierungsbereich
--                                (`meta->'eigenfinanzierung'`) wird hier nicht
--                                bewacht.
--
-- OHNE DIESE MIGRATION
--
-- laeuft das Frontend unveraendert, es zeigt die Karte nach derselben Regel.
-- Nur der direkte Aufruf an der Oberflaeche vorbei bleibt moeglich.
--
-- WER DIE STUFENLISTE AENDERT
--
-- aendert sie auch in `FREIGESCHALTET_AB_RESERVIERUNG`
-- (`src/lib/investmentFreischaltung.ts`).
--
-- VORHER PRUEFEN (aendert nichts)
--
-- Wie viele Investments haben heute schon Finanzierungsdaten, obwohl die
-- Regel nicht erfuellt ist? Genau diese schuetzt die Altbestandsregel; sie
-- werden durch diese Migration nicht gesperrt.
--
--   with daten as (
--     select i.id,
--            coalesce(i.meta ->> 'pipelineStufe', '') as stufe,
--            coalesce(i.meta ->> 'rvSigned', 'false') = 'true' as rv_unterschrieben,
--            (   coalesce(i.meta ->> 'finanzierungsStatus', '') <> ''
--             or coalesce(i.meta ->> 'finanzierungsBank', '') <> '') as stand_im_meta,
--            exists (
--              select 1 from public.finanzierungen f
--               where f.kunde_id = i.id::text
--                 and case when jsonb_typeof(f.angebote) = 'array'
--                          then jsonb_array_length(f.angebote) > 0
--                          else false end
--            ) as angebote_da
--       from public.investments i
--   )
--   select count(*) filter (where stand_im_meta or angebote_da) as mit_finanzierungsdaten,
--          count(*) filter (where (stand_im_meta or angebote_da)
--                             and not (rv_unterschrieben and stufe in (
--                               'reservierung', 'bonitaetsunterlagen', 'finanzierung', 'notar',
--                               'faelligkeit', 'abrechnung', 'abgeschlossen'))) as davon_regel_nicht_erfuellt,
--          count(*) filter (where (stand_im_meta or angebote_da) and not rv_unterschrieben) as davon_ohne_unterschrift,
--          count(*) filter (where (stand_im_meta or angebote_da) and stufe not in (
--                               'reservierung', 'bonitaetsunterlagen', 'finanzierung', 'notar',
--                               'faelligkeit', 'abrechnung', 'abgeschlossen')) as davon_stufe_vor_reservierung
--     from daten;
--
-- Mehrfach ausfuehrbar.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Die Regel auf einem Meta-Stand
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finanzierung_intern_frei_meta(_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(_meta ->> 'rvSigned', 'false') = 'true'
     AND COALESCE(_meta ->> 'pipelineStufe', '') IN (
           'reservierung', 'bonitaetsunterlagen', 'finanzierung', 'notar',
           'faelligkeit', 'abrechnung', 'abgeschlossen'
         )
$$;

COMMENT ON FUNCTION public.finanzierung_intern_frei_meta(jsonb) IS
  'Ist die Finanzierung nach diesem investments.meta intern offen? '
  'Reservierung unterschrieben und Stufe ab Reservierung. Gegenstueck zu '
  'finanzierungIntern im Frontend, ohne die Objektpruefung.';


-- ---------------------------------------------------------------------------
-- 2) Die Regel fuer ein Investment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finanzierung_intern_frei(_investment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT public.finanzierung_intern_frei_meta(i.meta)
       FROM public.investments i
      WHERE i.id = _investment_id),
    false
  )
$$;

COMMENT ON FUNCTION public.finanzierung_intern_frei(uuid) IS
  'Ist die Finanzierung dieses Investments intern offen? Siehe '
  'finanzierung_intern_frei_meta.';

REVOKE ALL ON FUNCTION public.finanzierung_intern_frei(uuid) FROM public;
REVOKE ALL ON FUNCTION public.finanzierung_intern_frei(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finanzierung_intern_frei(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3) Ausnahme: Dienstschluessel, Admin, Inhaber
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finanzierung_sperre_ausgenommen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Leere Kennung: Dienstschluessel (Edge Functions) oder SQL-Editor.
  SELECT _user_id IS NULL
      OR EXISTS (
           SELECT 1 FROM public.user_roles
            WHERE user_id = _user_id
              AND role IN ('admin', 'inhaber')
         )
$$;

REVOKE ALL ON FUNCTION public.finanzierung_sperre_ausgenommen(uuid) FROM public;
REVOKE ALL ON FUNCTION public.finanzierung_sperre_ausgenommen(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finanzierung_sperre_ausgenommen(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) Altbestand: hat das Investment schon Finanzierungsdaten?
-- ---------------------------------------------------------------------------
--
-- `finanzierungen.kunde_id` ist TEXT und enthaelt die INVESTMENT-ID. Der
-- Vergleich laeuft deshalb Text gegen Text ueber `investments.id::text`.
-- `investments.kunde_id` (uuid) kommt hier nicht vor.
--
-- `angebote` wird nur gezaehlt, wenn es wirklich eine Liste ist; ein
-- anderer JSON-Typ liesse `jsonb_array_length` abbrechen.

CREATE OR REPLACE FUNCTION public.finanzierung_hat_angebote(_angebote jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
           WHEN jsonb_typeof(_angebote) = 'array' THEN jsonb_array_length(_angebote) > 0
           ELSE false
         END
$$;

CREATE OR REPLACE FUNCTION public.finanzierung_altbestand(_investment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.finanzierungen f
            WHERE f.kunde_id = _investment_id::text
              AND public.finanzierung_hat_angebote(f.angebote)
         )
      OR EXISTS (
           SELECT 1 FROM public.investments i
            WHERE i.id = _investment_id
              AND (   COALESCE(i.meta ->> 'finanzierungsStatus', '') <> ''
                   OR COALESCE(i.meta ->> 'finanzierungsBank', '') <> '')
         )
$$;

REVOKE ALL ON FUNCTION public.finanzierung_altbestand(uuid) FROM public;
REVOKE ALL ON FUNCTION public.finanzierung_altbestand(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finanzierung_altbestand(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5) Wachposten auf `finanzierungen`
-- ---------------------------------------------------------------------------
--
-- Beim Aendern zaehlt der ALTE Stand der Zeile als Altbestand: Stehen dort
-- schon Angebote, bleibt jede Aenderung erlaubt. Eine Kennung, die keine
-- uuid ist, stammt aus der Zeit, als die Spalte noch die Kontakt-ID trug; sie
-- gilt ebenfalls als Altbestand und wird nicht angefasst.

CREATE OR REPLACE FUNCTION public.pruefe_finanzierung_intern_frei()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv uuid;
BEGIN
  IF public.finanzierung_sperre_ausgenommen(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.kunde_id IS NULL
     OR NEW.kunde_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;
  _inv := NEW.kunde_id::uuid;

  IF TG_OP = 'UPDATE' AND public.finanzierung_hat_angebote(OLD.angebote) THEN
    RETURN NEW;
  END IF;

  IF public.finanzierung_altbestand(_inv) OR public.finanzierung_intern_frei(_inv) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Die Finanzierung ist noch nicht freigeschaltet. Sie öffnet sich, sobald die Reservierung unterschrieben ist.'
    USING ERRCODE = 'check_violation';
END;
$$;

COMMENT ON FUNCTION public.pruefe_finanzierung_intern_frei() IS
  'Wachposten auf finanzierungen: Angebote erst ab unterschriebener '
  'Reservierung. Ausnahmen: Admin, Inhaber, Dienstschluessel, Altbestand.';

DROP TRIGGER IF EXISTS trg_finanzierung_intern_frei ON public.finanzierungen;

CREATE TRIGGER trg_finanzierung_intern_frei
  BEFORE INSERT OR UPDATE ON public.finanzierungen
  FOR EACH ROW
  EXECUTE FUNCTION public.pruefe_finanzierung_intern_frei();


-- ---------------------------------------------------------------------------
-- 6) Wachposten auf `investments.meta`
-- ---------------------------------------------------------------------------
--
-- Springt nur an, wenn sich `finanzierungsStatus` oder `finanzierungsBank`
-- tatsaechlich aendern. Alle anderen Schreibwege in `meta` merken nichts
-- davon. Verglichen wird der Text mit NULLIF, damit ein fehlender Schluessel,
-- ein JSON-null und ein leerer Text alle als "nichts hinterlegt" gelten.
-- `updateInvestment` im Frontend baut `meta` neu zusammen und laesst einen
-- leeren Stand dabei weg; das darf nicht als Aenderung zaehlen.
--
-- Die Regel wird auf dem NEUEN Stand geprueft: Die Karte setzt beim
-- bestaetigten Darlehensvertrag Stufe "notar" und Stand "bestaetigt" in
-- einem Zug, und "notar" gehoert zu den offenen Stufen.

CREATE OR REPLACE FUNCTION public.pruefe_finanzierungsstand_intern_frei()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alt_status text := NULL;
  _alt_bank   text := NULL;
  _neu_status text;
  _neu_bank   text;
BEGIN
  _neu_status := NULLIF(NEW.meta ->> 'finanzierungsStatus', '');
  _neu_bank   := NULLIF(NEW.meta ->> 'finanzierungsBank', '');
  IF TG_OP = 'UPDATE' THEN
    _alt_status := NULLIF(OLD.meta ->> 'finanzierungsStatus', '');
    _alt_bank   := NULLIF(OLD.meta ->> 'finanzierungsBank', '');
  END IF;

  IF _neu_status IS NOT DISTINCT FROM _alt_status
     AND _neu_bank IS NOT DISTINCT FROM _alt_bank THEN
    RETURN NEW;
  END IF;

  IF public.finanzierung_sperre_ausgenommen(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Altbestand: Stand oder Bank waren schon da, oder es gibt Angebote.
  IF TG_OP = 'UPDATE' AND (
       _alt_status IS NOT NULL
       OR _alt_bank IS NOT NULL
       OR EXISTS (
            SELECT 1 FROM public.finanzierungen f
             WHERE f.kunde_id = NEW.id::text
               AND public.finanzierung_hat_angebote(f.angebote)
          )
     ) THEN
    RETURN NEW;
  END IF;

  IF public.finanzierung_intern_frei_meta(NEW.meta) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Die Finanzierung ist noch nicht freigeschaltet. Sie öffnet sich, sobald die Reservierung unterschrieben ist.'
    USING ERRCODE = 'check_violation';
END;
$$;

COMMENT ON FUNCTION public.pruefe_finanzierungsstand_intern_frei() IS
  'Wachposten auf investments.meta -> finanzierungsStatus/finanzierungsBank. '
  'Ausnahmen: Admin, Inhaber, Dienstschluessel, Altbestand.';

DROP TRIGGER IF EXISTS trg_finanzierungsstand_intern_frei ON public.investments;

CREATE TRIGGER trg_finanzierungsstand_intern_frei
  BEFORE INSERT OR UPDATE ON public.investments
  FOR EACH ROW
  EXECUTE FUNCTION public.pruefe_finanzierungsstand_intern_frei();


-- ---------------------------------------------------------------------------
-- 7) Gegenprobe (aendert nichts)
-- ---------------------------------------------------------------------------
--
--   select tgrelid::regclass as tabelle, tgname, tgenabled
--     from pg_trigger
--    where tgname in ('trg_finanzierung_intern_frei',
--                     'trg_finanzierungsstand_intern_frei');
--
-- Erwartet: zwei Zeilen, tgenabled = 'O'.
