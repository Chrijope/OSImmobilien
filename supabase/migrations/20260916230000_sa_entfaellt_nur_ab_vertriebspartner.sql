-- ===========================================================================
-- Der Vermerk "Kunde finanziert selbst" darf nur ab Vertriebspartner gesetzt
-- werden
-- ===========================================================================
--
-- WORUM ES GEHT
--
-- Seit dem 16.09.2026 gibt es im Kundenprofil an der Objektauswahl einen
-- Schalter "Kunde finanziert selbst, keine Selbstauskunft noetig". Er legt
-- unter `investments.meta -> 'selbstauskunftEntfaellt'` einen Vermerk mit
-- Zeitpunkt und Person ab. Wo er steht, laeuft der Vorgang ohne
-- Selbstauskunft weiter, und die Bonitaetsunterlagen entfallen.
--
-- Das ist eine fachliche Entscheidung und keine Kleinigkeit. Setzen duerfen
-- sie Vertriebspartner und alles darueber, also admin, inhaber,
-- vertriebsleiter, vertriebspartner und backoffice. Die Setterin
-- ausdruecklich nicht.
--
-- BEFUND
--
-- In der Oberflaeche erscheint der Schalter nur fuer diese Rollen. Das ist
-- aber keine Zugriffskontrolle, ein ausgeblendeter Schalter haelt niemanden
-- auf. Der Schreibweg ist `merge_investment_meta`, und die Funktion laeuft als
-- SECURITY DEFINER: Wer `is_internal_role` erfuellt, darf jeden beliebigen
-- Schluessel in `meta` schreiben. `is_internal_role` schliesst `setterin`
-- ein (siehe 20260318153612). Eine Setterin koennte den Vermerk also per
-- Aufruf
--   supabase.rpc('merge_investment_meta',
--                { _investment_id: <ihre Kennung>,
--                  _updates: { selbstauskunftEntfaellt: { aktiv: true } } })
-- selbst setzen.
--
-- WAS SICH AENDERT
--
-- Ein Wachposten auf `public.investments`, der nur anspringt, wenn sich der
-- Wert dieses einen Schluessels tatsaechlich aendert. Bleibt er, wie er ist,
-- merkt niemand etwas davon, auch nicht bei den vielen anderen Schreibwegen
-- in `meta`.
--
-- Bewusst als Trigger und nicht als weitere Positivliste in
-- `merge_investment_meta`: Der Trigger haengt an der Tabelle und greift
-- deshalb auf JEDEM Schreibweg, also auch bei einem direkten UPDATE ueber die
-- Zeilensicherheit oder bei einer kuenftigen zweiten RPC. Er haengt ausserdem
-- nicht davon ab, welche Fassung von `merge_investment_meta` gerade in der
-- Datenbank steht.
--
-- Der Dienstschluessel (`auth.uid()` ist dann leer) darf weiterhin alles. Die
-- Edge Functions arbeiten damit, und sie setzen diesen Vermerk ohnehin nicht.
--
-- Mehrfach ausfuehrbar.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Wer darf den Vermerk setzen?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.darf_sa_entfallen_setzen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NULL
      OR EXISTS (
           SELECT 1 FROM public.user_roles
            WHERE user_id = _user_id
              AND role IN ('admin', 'inhaber', 'vertriebsleiter',
                           'vertriebspartner', 'backoffice')
         )
$$;

COMMENT ON FUNCTION public.darf_sa_entfallen_setzen(uuid) IS
  'Darf dieser Nutzer den Vermerk "Kunde finanziert selbst" am Investment '
  'setzen oder zuruecknehmen? Vertriebspartner und alles darueber, die '
  'Setterin nicht. Leere Kennung bedeutet Dienstschluessel und ist erlaubt.';

REVOKE ALL ON FUNCTION public.darf_sa_entfallen_setzen(uuid) FROM public;
REVOKE ALL ON FUNCTION public.darf_sa_entfallen_setzen(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.darf_sa_entfallen_setzen(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2) Der Wachposten
-- ---------------------------------------------------------------------------
--
-- `jsonb_extract_path` statt `->`, damit ein fehlender Schluessel und ein
-- ausdrueckliches JSON-null beide als "nichts hinterlegt" gelten und ein
-- Wechsel zwischen beiden nicht als Aenderung zaehlt.

CREATE OR REPLACE FUNCTION public.pruefe_sa_entfaellt_recht()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alt jsonb;
  _neu jsonb;
BEGIN
  _neu := COALESCE(NEW.meta -> 'selbstauskunftEntfaellt', 'null'::jsonb);
  IF TG_OP = 'UPDATE' THEN
    _alt := COALESCE(OLD.meta -> 'selbstauskunftEntfaellt', 'null'::jsonb);
  ELSE
    _alt := 'null'::jsonb;
  END IF;

  IF _neu IS DISTINCT FROM _alt
     AND NOT public.darf_sa_entfallen_setzen(auth.uid()) THEN
    RAISE EXCEPTION
      'Der Vermerk "Kunde finanziert selbst" darf nur ab Vertriebspartner gesetzt werden';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pruefe_sa_entfaellt_recht() IS
  'Wachposten auf investments.meta -> selbstauskunftEntfaellt. Springt nur an, '
  'wenn sich der Wert tatsaechlich aendert.';

DROP TRIGGER IF EXISTS trg_sa_entfaellt_recht ON public.investments;

CREATE TRIGGER trg_sa_entfaellt_recht
  BEFORE INSERT OR UPDATE ON public.investments
  FOR EACH ROW
  EXECUTE FUNCTION public.pruefe_sa_entfaellt_recht();


-- ---------------------------------------------------------------------------
-- 3) Gegenprobe (aendert nichts)
-- ---------------------------------------------------------------------------
--
--   select tgname, tgenabled
--     from pg_trigger
--    where tgrelid = 'public.investments'::regclass
--      and not tgisinternal;
--
--   select count(*) as mit_vermerk
--     from public.investments
--    where meta -> 'selbstauskunftEntfaellt' ->> 'aktiv' = 'true';
