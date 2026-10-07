-- ===========================================================================
-- Weekly Sales Call: zwei Calls am Montag, Punkte je Call getrennt
-- ===========================================================================
--
-- Vorgabe GL vom 05.10.2026: Montags 19:00 Uhr der Call fuer die
-- Lead-Berater, 19:30 Uhr der Call fuer die Vertriebspartner ohne diese
-- Variante. Admin, Inhaber und Vertriebsleitung betreuen beide. Zoom-Link und
-- Wochenschnitt (20:30, `weekly_call_woche()`) bleiben fuer beide gleich.
--
-- Die Punkte fuer den Call werden je Call getrennt gefuehrt. Die Datenbank
-- erzwingt die Trennung, nicht nur die Oberflaeche:
--
--   - Spalte `weekly_call_punkte.call_runde` ('lead_berater' oder
--     'vertriebspartner'). Bestehende Punkte gehoeren zum 19:00-Call.
--   - `weekly_call_runden(uid)`: welche Calls jemand sieht. Leitung beide,
--     Vertriebspartner mit `profiles.rollen_variante = 'lead_berater'` nur
--     den 19:00-Call, alle anderen Vertriebspartner nur den 19:30-Call,
--     sonst keinen. Gerechnet wird ueber die zugewiesenen Rollen (has_role)
--     und die Variante, die nur Admin und Inhaber setzen (20260927010000).
--   - Lesen, Eintragen, Aendern und Loeschen der eigenen Zeilen nur in einem
--     Call, den man sieht. `call_runde` ist nach dem Anlegen fest.
--   - Lesen (`weekly_call_punkte_lesen`) und Rueckschau
--     (`weekly_call_termine`) nur fuer die eigenen Calls, optional auf einen
--     Call beschraenkt. Beide Funktionen bekommen dafuer einen zweiten,
--     optionalen Parameter `_runde`; ohne ihn gibt es alle eigenen Calls.
--     Die alte Fassung mit einem Parameter wird dafuer entfernt, sonst waere
--     der Aufruf mehrdeutig.
--
-- Unveraendert: Anonymitaet (keine Verfasser-ID nach aussen), Aendern und
-- Loeschen nur am eigenen Punkt und nur bis zum Call, Abhaken nur die
-- Aufsicht, Protokolle und Anhaenge haengen weiter am Termin (gemeinsam fuer
-- beide Calls).
--
-- Ein noch offener alter Browser-Tab traegt ohne `call_runde` ein. Dann setzt
-- der Standardwert den Call des Nutzers selbst, damit nichts im falschen Call
-- landet.
--
-- Wiederholbar. Aendert keine bestehenden Daten ausser dem Fuellen der neuen
-- Spalte mit 'lead_berater'.

BEGIN;

-- ── Welche Calls jemand sieht ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.weekly_call_runden(_uid uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN ARRAY[]::text[]
    -- Im Browser nur fuer sich selbst, sonst liesse sich ueber fremde
    -- Kennungen die Rolle anderer Nutzer erfragen. Der Server (ohne
    -- Anmeldung) darf jede Kennung pruefen.
    WHEN auth.uid() IS NOT NULL AND _uid <> auth.uid() THEN ARRAY[]::text[]
    WHEN public.has_role(_uid, 'admin'::public.app_role)
      OR public.has_role(_uid, 'inhaber'::public.app_role)
      OR public.has_role(_uid, 'vertriebsleiter'::public.app_role)
      THEN ARRAY['lead_berater', 'vertriebspartner']
    WHEN public.has_role(_uid, 'vertriebspartner'::public.app_role) THEN
      CASE WHEN EXISTS (SELECT 1 FROM public.profiles
                         WHERE id = _uid AND rollen_variante = 'lead_berater')
           THEN ARRAY['lead_berater']
           ELSE ARRAY['vertriebspartner'] END
    ELSE ARRAY[]::text[]
  END;
$$;

COMMENT ON FUNCTION public.weekly_call_runden(uuid) IS
  'Weekly Sales Calls, die ein Nutzer sieht: lead_berater (19:00) und/oder '
  'vertriebspartner (19:30). Leitung beide, Lead-Berater nur 19:00, '
  'Vertriebspartner nur 19:30. Gleiche Regel wie callRundenFuer() in '
  'src/lib/weeklyCallZeit.ts. Migration 20261005160000.';

REVOKE EXECUTE ON FUNCTION public.weekly_call_runden(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.weekly_call_runden(uuid) TO authenticated, service_role;

-- Standard beim Eintragen ohne Angabe: der eigene Call, bei der Leitung der
-- erste (19:00).
CREATE OR REPLACE FUNCTION public.weekly_call_eigene_runde()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE((public.weekly_call_runden(auth.uid()))[1], 'lead_berater');
$$;

REVOKE EXECUTE ON FUNCTION public.weekly_call_eigene_runde() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.weekly_call_eigene_runde() TO authenticated, service_role;

-- ── Die Spalte ──────────────────────────────────────────────────────────────
-- Erst mit festem Standard anlegen, damit der Bestand sicher beim 19:00-Call
-- landet, danach auf den eigenen Call des Eintragenden umstellen.
ALTER TABLE public.weekly_call_punkte
  ADD COLUMN IF NOT EXISTS call_runde text NOT NULL DEFAULT 'lead_berater';

ALTER TABLE public.weekly_call_punkte
  DROP CONSTRAINT IF EXISTS weekly_call_punkte_call_runde_check;
ALTER TABLE public.weekly_call_punkte
  ADD CONSTRAINT weekly_call_punkte_call_runde_check
  CHECK (call_runde IN ('lead_berater', 'vertriebspartner'));

ALTER TABLE public.weekly_call_punkte
  ALTER COLUMN call_runde SET DEFAULT public.weekly_call_eigene_runde();

CREATE INDEX IF NOT EXISTS idx_wcp_termin_runde
  ON public.weekly_call_punkte (call_termin DESC, call_runde);

COMMENT ON COLUMN public.weekly_call_punkte.call_runde IS
  'Zu welchem Call der Punkt gehoert: lead_berater (19:00) oder '
  'vertriebspartner (19:30). Migration 20261005160000.';

-- ── Lesen, Eintragen, Aendern, Loeschen nur im eigenen Call ─────────────────
--
-- Auch die eigenen Zeilen nur, solange man den Call sieht. Sonst koennte ein
-- Vertriebspartner seine Bestandspunkte (jetzt 19:00) weiter direkt lesen
-- oder loeschen.
DROP POLICY IF EXISTS "wcp_select_eigene" ON public.weekly_call_punkte;
CREATE POLICY "wcp_select_eigene" ON public.weekly_call_punkte
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  );

DROP POLICY IF EXISTS "wcp_delete_eigene" ON public.weekly_call_punkte;
CREATE POLICY "wcp_delete_eigene" ON public.weekly_call_punkte
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  );

DROP POLICY IF EXISTS "wcp_insert" ON public.weekly_call_punkte;
CREATE POLICY "wcp_insert" ON public.weekly_call_punkte
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  );

DROP POLICY IF EXISTS "wcp_update_eigene" ON public.weekly_call_punkte;
CREATE POLICY "wcp_update_eigene" ON public.weekly_call_punkte
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  )
  WITH CHECK (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND call_runde = ANY (public.weekly_call_runden(auth.uid()))
  );

-- Ein Punkt bleibt in dem Call, fuer den er eingetragen wurde. Aus dem
-- Browser laesst sich call_runde nach dem Anlegen nicht mehr aendern, auch
-- nicht von der Leitung; nur der Server (ohne Anmeldung) darf es.
CREATE OR REPLACE FUNCTION public.weekly_call_runde_fest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.call_runde IS DISTINCT FROM OLD.call_runde AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Ein Punkt bleibt in seinem Call.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wcp_runde_fest ON public.weekly_call_punkte;
CREATE TRIGGER trg_wcp_runde_fest
  BEFORE UPDATE OF call_runde ON public.weekly_call_punkte
  FOR EACH ROW EXECUTE FUNCTION public.weekly_call_runde_fest();

-- ── Lesen nur die eigenen Calls ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.weekly_call_punkte_lesen(date);
DROP FUNCTION IF EXISTS public.weekly_call_punkte_lesen(date, text);
CREATE FUNCTION public.weekly_call_punkte_lesen(_termin date DEFAULT NULL, _runde text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  text text,
  call_termin date,
  call_runde text,
  von_mir boolean,
  besprochen boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.id,
         p.text,
         p.call_termin,
         p.call_runde,
         p.user_id = auth.uid() AS von_mir,
         p.besprochen_am IS NOT NULL AS besprochen,
         p.created_at
    FROM public.weekly_call_punkte p
   WHERE p.call_termin = COALESCE(_termin, public.weekly_call_woche())
     AND p.call_runde = ANY (public.weekly_call_runden(auth.uid()))
     AND (_runde IS NULL OR p.call_runde = _runde)
   ORDER BY p.created_at ASC;
$$;

COMMENT ON FUNCTION public.weekly_call_punkte_lesen(date, text) IS
  'Punkte eines Weekly Sales Call ohne Verfasser, nur aus den Calls, die der '
  'Nutzer sieht (weekly_call_runden). _runde beschraenkt auf einen Call. '
  'Migration 20261005160000.';

REVOKE EXECUTE ON FUNCTION public.weekly_call_punkte_lesen(date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.weekly_call_punkte_lesen(date, text) TO authenticated;

-- Rueckschau: Termine mit Punkten aus den eigenen Calls oder mit Protokoll.
DROP FUNCTION IF EXISTS public.weekly_call_termine();
DROP FUNCTION IF EXISTS public.weekly_call_termine(text);
CREATE FUNCTION public.weekly_call_termine(_runde text DEFAULT NULL)
RETURNS TABLE (call_termin date, anzahl bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH sichtbar AS (
    SELECT p.id, p.call_termin
      FROM public.weekly_call_punkte p
     WHERE p.call_runde = ANY (public.weekly_call_runden(auth.uid()))
       AND (_runde IS NULL OR p.call_runde = _runde)
  )
  SELECT t.call_termin, count(s.id) AS anzahl
    FROM (
      SELECT call_termin FROM sichtbar
      UNION
      SELECT call_termin FROM public.weekly_call_protokolle
    ) t
    LEFT JOIN sichtbar s ON s.call_termin = t.call_termin
   WHERE cardinality(public.weekly_call_runden(auth.uid())) > 0
   GROUP BY t.call_termin
   ORDER BY t.call_termin DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.weekly_call_termine(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.weekly_call_termine(text) TO authenticated;

COMMIT;

-- Zum Schluss: der Stand danach. Erwartet: true, 4, true, 0.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'weekly_call_punkte'
             AND column_name = 'call_runde') AS spalte_da,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_call_punkte'
      AND COALESCE(qual, with_check) LIKE '%weekly_call_runden%') AS regeln_getrennt,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'weekly_call_punkte_lesen'
             AND pg_get_function_identity_arguments(p.oid) = '_termin date, _runde text') AS lesen_getrennt,
  (SELECT count(*) FROM public.weekly_call_punkte WHERE call_runde IS NULL) AS punkte_ohne_call;

-- Nachsehen (aendert nichts): Pruefzeilen 90.1 bis 90.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
