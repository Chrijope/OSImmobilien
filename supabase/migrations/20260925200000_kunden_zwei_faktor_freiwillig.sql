-- ===========================================================================
-- Zwei-Faktor-Anmeldung fuer Kunden: freiwillig, aber verbindlich, wenn an
-- ===========================================================================
--
-- WARUM (Entscheidung GL vom 25.09.2026)
--
--   Jeder Kunde entscheidet selbst, ob er die Zwei-Faktor-Anmeldung
--   einschaltet. Wer sie eingeschaltet hat, muss den Code beim Anmelden aber
--   weiter eingeben und darf ihn nicht umgehen koennen.
--
-- WAS VORHER GALT
--
--   Die Pflicht fuer Kunden stand nur in der Oberflaeche (`KundenMfaGuard`:
--   sieben Tage Frist nach dem ersten Login, danach ein Vollbild bis zur
--   Einrichtung, bei vorhandenem Faktor die Codeabfrage). In der Datenbank
--   gab es keine Pruefung der Sicherheitsstufe (`aal`), weder fuer Kunden
--   noch fuer interne Rollen, und auch `secure-login` und `manage-mfa`
--   kannten keine Kundenpflicht. Es gibt also keine Pflicht-Migration, die
--   zurueckgenommen werden muesste; die Pflicht faellt mit dem Umbau von
--   `KundenMfaGuard` weg.
--
--   Die Luecke dabei: Wer das Passwort eines Kunden mit Zwei-Faktor kannte,
--   kam an der Oberflaeche nicht vorbei, konnte mit dem Anmeldetoken (aal1)
--   aber die Schnittstelle direkt abfragen und bekam alles, was die
--   Zeilenregeln dem Kunden zeigen.
--
-- WAS DIESE MIGRATION TUT
--
--   1. `kunde_zweiter_faktor_erfuellt()`: false genau dann, wenn
--        - das Konto ein Kundenkonto ist (Rolle kunde, hoechstens zusaetzlich
--          tippgeber, keine interne Rolle),
--        - es einen bestaetigten zweiten Faktor hat
--          (`auth.mfa_factors.status = 'verified'`) und
--        - die Sitzung den Code noch nicht benutzt hat (`aal` ist nicht aal2).
--      Sonst true.
--
--   2. Regel „Kunden mit Zwei-Faktor nur mit Code“ als RESTRICTIVE Regel an
--      jeder Tabelle in `public` mit Zeilensicherheit, dazu `storage.objects`.
--      Gleiches Muster wie die Kundenportal-Sperre (20260923180000): Eine
--      RESTRICTIVE Regel gibt nichts frei, sie nimmt nur weg. Fuer alle, fuer
--      die die Funktion true liefert, aendert sich nichts.
--      Ausgenommen sind `profiles`, `user_roles` und `user_settings`. Ohne
--      sie laedt die Anwendung nicht und der Kunde saehe statt der
--      Codeabfrage einen Ladekreis. Dort liegen Name, Rolle und
--      Einstellungen, keine Kundendaten.
--
--   Mit dem Code (aal2) gelten wieder die bisherigen Regeln, unveraendert.
--
-- NICHT BETROFFEN
--
--   Kunden ohne Zwei-Faktor, alle internen Rollen (fuer sie bleibt es bei der
--   Regel in der Oberflaeche, `InternalMfaGuard`), nicht angemeldete Aufrufe
--   (Unterschriftslinks, Kundenlink, oeffentliche Seiten) und der
--   Dienstschluessel der Edge Functions.
--
-- WAS OHNE SIE PASSIERT
--
--   Der Code laeuft auch ohne diese Migration. Die Codeabfrage fuer Kunden
--   mit Zwei-Faktor bleibt dann wie bisher nur in der Oberflaeche erzwungen.
--
-- WIEDERHOLBAR
--
--   CREATE OR REPLACE und DROP POLICY IF EXISTS vor jeder Regel. Neue
--   Tabelle spaeter? Dann einmal im SQL-Editor:
--     select public.kunden_zwei_faktor_regeln_anlegen();
--
-- PRUEFEN (lesend, aendert nichts):
--
--   select
--     to_regprocedure('public.kunde_zweiter_faktor_erfuellt()') is not null
--       as funktion_da,
--     (select count(*) from pg_policies
--       where policyname = 'Kunden mit Zwei-Faktor nur mit Code'
--         and permissive = 'RESTRICTIVE') as regeln,
--     (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--       where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
--         and c.relname not in ('profiles', 'user_roles', 'user_settings')) + 1
--       as regeln_erwartet;
--
-- ZURUECK (falls noetig, im SQL-Editor):
--
--   Jede Regel „Kunden mit Zwei-Faktor nur mit Code“ mit DROP POLICY
--   entfernen. Dann gilt wieder: Codeabfrage nur in der Oberflaeche.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Hat diese Sitzung den zweiten Faktor, falls sie ihn braucht?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kunde_zweiter_faktor_erfuellt()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    -- Nicht angemeldet: diese Regel ist nicht zustaendig.
    auth.uid() IS NULL
    -- Kein Kundenkonto: nicht zustaendig.
    OR NOT EXISTS (
      SELECT 1 FROM public.user_roles r
       WHERE r.user_id = auth.uid() AND r.role::text = 'kunde'
    )
    -- Daneben eine interne Rolle: dann gilt die interne Regel.
    OR EXISTS (
      SELECT 1 FROM public.user_roles r
       WHERE r.user_id = auth.uid() AND r.role::text NOT IN ('kunde', 'tippgeber')
    )
    -- Kunde ohne bestaetigten zweiten Faktor: freiwillig, also frei.
    OR NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
       WHERE f.user_id = auth.uid() AND f.status::text = 'verified'
    )
    -- Kunde mit zweitem Faktor: nur, wenn die Sitzung ihn benutzt hat.
    OR coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

COMMENT ON FUNCTION public.kunde_zweiter_faktor_erfuellt() IS
  'false nur fuer ein Kundenkonto mit bestaetigtem zweiten Faktor, dessen '
  'Sitzung den Code noch nicht benutzt hat (aal1). Massgeblich fuer die Regel '
  '„Kunden mit Zwei-Faktor nur mit Code“. Siehe 20260925200000_kunden_zwei_faktor_freiwillig.sql';

REVOKE ALL ON FUNCTION public.kunde_zweiter_faktor_erfuellt() FROM public;
GRANT EXECUTE ON FUNCTION public.kunde_zweiter_faktor_erfuellt() TO authenticated, anon, service_role;


-- ---------------------------------------------------------------------------
-- 2) Die Regel an allen Tabellen mit Zeilensicherheit und am Dateispeicher
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kunden_zwei_faktor_regeln_anlegen()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _t record;
  _anzahl integer := 0;
  _ausgelassen text[] := ARRAY[]::text[];
BEGIN
  FOR _t IN
    SELECT n.nspname::text AS schema_name, c.relname::text AS tabelle
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relrowsecurity
       -- Ohne diese drei laedt die Anwendung nicht, siehe Kopf.
       AND c.relname NOT IN ('profiles', 'user_roles', 'user_settings')
    UNION ALL
    SELECT 'storage', 'objects'
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
        'Kunden mit Zwei-Faktor nur mit Code', _t.schema_name, _t.tabelle);
      -- `(SELECT ...)`: einmal je Abfrage ausgewertet, nicht je Zeile.
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated '
        || 'USING ((SELECT public.kunde_zweiter_faktor_erfuellt())) '
        || 'WITH CHECK ((SELECT public.kunde_zweiter_faktor_erfuellt()))',
        'Kunden mit Zwei-Faktor nur mit Code', _t.schema_name, _t.tabelle);
      _anzahl := _anzahl + 1;
    EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
      -- Eine Tabelle, die dieser Rolle nicht gehoert, bricht nicht den
      -- ganzen Lauf ab. Sie wird unten genannt.
      _ausgelassen := _ausgelassen || (_t.schema_name || '.' || _t.tabelle);
    END;
  END LOOP;

  RAISE NOTICE 'Regel Kunden mit Zwei-Faktor an % Tabellen gesetzt', _anzahl;
  IF array_length(_ausgelassen, 1) > 0 THEN
    RAISE WARNING 'Regel Kunden mit Zwei-Faktor nicht gesetzt (keine Rechte): %',
      array_to_string(_ausgelassen, ', ');
  END IF;
  RETURN _anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.kunden_zwei_faktor_regeln_anlegen() FROM public, anon, authenticated, service_role;

SELECT public.kunden_zwei_faktor_regeln_anlegen();

COMMIT;
