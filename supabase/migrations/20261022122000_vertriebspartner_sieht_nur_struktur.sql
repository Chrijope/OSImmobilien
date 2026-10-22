-- ===========================================================================
-- Strukturvertrieb: Vertriebspartner sehen Namen nur in ihrer Struktur
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (22.10.2026)
--
--   Namen und E-Mail-Adressen fremder Strukturen sind fuer Vertriebspartner
--   verborgen. Sie sehen sich selbst und die Struktur, die sie aufgebaut
--   haben. Vertriebsleitung, Admin und Inhaber sehen alle Strukturen.
--
-- WAS DIESE MIGRATION TUT
--
--   1. ist_reiner_vertriebspartner(nutzer): Vertriebspartner ohne Leitungs-
--      rolle (Vertriebsleitung, Admin, Inhaber). Fuer sie greift die neue
--      Grenze, auch wenn sie zusaetzlich eine Stabsrolle tragen.
--   2. sichtbare_nutzer_ids(): wen ein reiner Vertriebspartner sehen darf:
--        - sich selbst,
--        - seine Struktur nach unten (alle Ebenen) und seine Kette nach oben
--          (Teamleiter, deren Teamleiter ...),
--        - alle mit Leitungs- oder Stabsrolle (Admin, Inhaber,
--          Vertriebsleitung, Backoffice, Buchhaltung, Finanzierungs- und
--          Objektpartner, Hausverwaltung, Marketing, HR, Setterin,
--          Versicherung, individuell): Ansprechpartner, Chats, Aufgaben,
--        - Mitteilnehmer seiner Chats,
--        - die Portalkonten seiner Kunden (Person 1 und 2) und seiner
--          Tippgeber.
--   3. Je eine EINSCHRAENKENDE Leseregel (AS RESTRICTIVE) auf profiles und
--      user_roles. Sie wirkt zusaetzlich zu allen bestehenden Regeln, auch zu
--      solchen, die ausserhalb der Migrationen angelegt wurden, und aendert
--      fuer alle anderen Rollen nichts. Beide Funktionen laufen einmal je
--      Abfrage (Unterabfrage), nicht je Zeile.
--   4. mehrfache_beraternamen(): welche der fuer den Aufrufer SICHTBAREN
--      Namen unter allen Profilen mehrfach vorkommen. Kein fremder Name wird
--      verraten. Der Namensabgleich im CRM (src/lib/beraterNamensabgleich.ts)
--      braucht das, damit ein unsichtbarer Namensvetter einen alten
--      Datensatz ohne Kennung nicht faelschlich eindeutig macht.
--
-- Aendert keine Daten. Mehrfach ausfuehrbar. Voraussetzungen:
-- 20261016100000, 20260918220000.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.struktur_unter(uuid)') IS NULL
     OR to_regprocedure('public.struktur_kette(uuid)') IS NULL
     OR to_regprocedure('public.berater_name_normal(text)') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20261016100000 und 20260918220000 ausfuehren.';
  END IF;
END;
$$;

-- Leitungs- und Stabsrollen: Wer eine davon traegt, bleibt fuer
-- Vertriebspartner sichtbar (Ansprechpartner, Chats, Aufgaben).
CREATE OR REPLACE FUNCTION public.stabsrollen()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['admin', 'inhaber', 'vertriebsleiter', 'backoffice', 'buchhaltung', 'finanzierungspartner',
               'objektpartner', 'hausverwaltung', 'marketing', 'hr', 'setterin', 'versicherungsexperte', 'individuell'];
$$;

CREATE OR REPLACE FUNCTION public.ist_reiner_vertriebspartner(_nutzer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Ausgenommen sind nur die Leitungsrollen, die laut Christian alle
  -- Strukturen sehen. Eine weitere Stabsrolle hebt die Grenze nicht auf.
  SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _nutzer AND r.role::text = 'vertriebspartner')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = _nutzer
                      AND r.role::text IN ('vertriebsleiter', 'admin', 'inhaber'));
$$;

COMMENT ON FUNCTION public.ist_reiner_vertriebspartner(uuid) IS
  'Vertriebspartner ohne Leitungsrolle (Vertriebsleitung, Admin, Inhaber). Fuer sie gilt die Sicht '
  'nur auf die eigene Struktur (20261022122000).';

CREATE OR REPLACE FUNCTION public.sichtbare_nutzer_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ich AS (SELECT auth.uid() AS id)
  SELECT id FROM ich WHERE id IS NOT NULL
  UNION
  SELECT u.mitglied_id FROM ich, public.struktur_unter(ich.id) u
  UNION
  SELECT k.leiter_id FROM ich, public.struktur_kette(ich.id) k
  UNION
  SELECT r.user_id FROM public.user_roles r WHERE r.role::text = ANY(public.stabsrollen())
  UNION
  SELECT t2.benutzer_id
    FROM ich
    JOIN public.chat_teilnehmer t1 ON t1.benutzer_id = ich.id
    JOIN public.chat_teilnehmer t2 ON t2.chat_id = t1.chat_id
  UNION
  SELECT (x.konto)::uuid
    FROM ich
    JOIN public.kontakte k ON k.zustaendig_id = ich.id
    CROSS JOIN LATERAL (VALUES (k.meta ->> 'authUserId'), (k.meta -> 'person2' ->> 'authUserId')) AS x(konto)
   WHERE x.konto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION
  SELECT t.benutzer_id FROM ich JOIN public.tippgeber t ON t.zugeordnet_id = ich.id WHERE t.benutzer_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.sichtbare_nutzer_ids() IS
  'Wen ein reiner Vertriebspartner in profiles und user_roles sehen darf: '
  'sich, Struktur, Kette, Leitung und Stab, Chat-Mitteilnehmer, eigene Kunden '
  'und Tippgeber.';

DROP POLICY IF EXISTS "Vertriebspartner sehen nur ihre Struktur" ON public.profiles;
CREATE POLICY "Vertriebspartner sehen nur ihre Struktur"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  NOT (SELECT public.ist_reiner_vertriebspartner(auth.uid()))
  OR id IN (SELECT public.sichtbare_nutzer_ids())
);

DROP POLICY IF EXISTS "Vertriebspartner sehen nur Rollen ihrer Struktur" ON public.user_roles;
CREATE POLICY "Vertriebspartner sehen nur Rollen ihrer Struktur"
ON public.user_roles
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  NOT (SELECT public.ist_reiner_vertriebspartner(auth.uid()))
  OR user_id IN (SELECT public.sichtbare_nutzer_ids())
);

CREATE OR REPLACE FUNCTION public.mehrfache_beraternamen()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sichtbar AS (
    SELECT DISTINCT public.berater_name_normal(p.name) AS n
      FROM public.profiles p
     WHERE NOT public.ist_reiner_vertriebspartner(auth.uid())
        OR p.id IN (SELECT public.sichtbare_nutzer_ids())
  )
  SELECT public.berater_name_normal(p.name)
    FROM public.profiles p
   WHERE public.berater_name_normal(p.name) IN (SELECT n FROM sichtbar WHERE n <> '')
   GROUP BY 1
  HAVING count(*) > 1;
$$;

COMMENT ON FUNCTION public.mehrfache_beraternamen() IS
  'Sichtbare Namen (Vergleichsform), die unter allen Profilen mehrfach '
  'vorkommen. Ohne Kennungen, ohne fremde Namen; fuer den Namensabgleich.';

REVOKE ALL ON FUNCTION public.stabsrollen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stabsrollen() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ist_reiner_vertriebspartner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ist_reiner_vertriebspartner(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.sichtbare_nutzer_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sichtbare_nutzer_ids() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mehrfache_beraternamen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mehrfache_beraternamen() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
