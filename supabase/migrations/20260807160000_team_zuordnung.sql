-- ===========================================================================
-- Wer gehört zu wessen Team? Einmal in der Datenbank, statt dreimal im Code
-- ===========================================================================
--
-- Die Team-Zugehörigkeit liegt an zwei Stellen, und bisher hat nur das
-- Frontend sie zusammengesetzt (`src/lib/juniorOverrideLogic.ts`):
--
--   1. `user_settings.einstellungen->>'teamleader_id'` aus der
--      Nutzerverwaltung. Das ist die maßgebliche Zuordnung.
--   2. Das Bewerbermanagement: Wer einen Bewerber geworben hat, führt ihn
--      auch, sobald aus dem Bewerber ein Nutzerkonto geworden ist. Beim
--      Aktivieren schreibt `AktivierungTab` beides nach `user_settings`
--      (`geworben_von_user_id`), die Bewerberzeile selbst bleibt aber die
--      Quelle für alle, die vor dieser Automatik aktiviert wurden.
--
-- Weil das nur im Browser stand, konnte die Datenbank es nicht benutzen. In
-- `20260807120000_sla_verstoesse_nur_eigene.sql` steht deshalb wörtlich, dass
-- Vertriebsleiter dort bewusst KEINEN Team-Zugriff bekommen, "es gäbe nichts,
-- woran die Prüfung sich halten könnte". Das ist ab hier erledigt.
--
-- Diese Migration legt die Zuordnung genau einmal an. Die Eskalationsdienste
-- benutzen sie ab sofort, die Oberfläche kann später dieselbe Wahrheit lesen,
-- statt sich eine eigene zu bauen.
--
-- Bewusst nur EINE Ebene tief: Wer den Teamleiter eines Teamleiters ist,
-- interessiert hier niemanden, und eine rekursive Abfrage über frei
-- gepflegte JSON-Felder ist ein Ring, der irgendwann geschlossen wird.

-- ── 1. Die rohe Zuordnung: Mitglied → Leiter ───────────────────────────────

CREATE OR REPLACE FUNCTION public.team_zuordnung()
RETURNS TABLE(mitglied_id uuid, leiter_id uuid, quelle text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- a) Nutzerverwaltung, die maßgebliche Zuordnung.
  SELECT s.user_id,
         (s.einstellungen ->> 'teamleader_id')::uuid,
         'nutzerverwaltung'
    FROM public.user_settings s
   WHERE s.einstellungen ->> 'teamleader_id' ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (s.einstellungen ->> 'teamleader_id')::uuid <> s.user_id

  UNION

  -- b) Der Werber aus dem Bewerbermanagement, beim Aktivieren nach
  --    user_settings gespiegelt.
  SELECT s.user_id,
         (s.einstellungen ->> 'geworben_von_user_id')::uuid,
         'geworben'
    FROM public.user_settings s
   WHERE s.einstellungen ->> 'geworben_von_user_id' ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (s.einstellungen ->> 'geworben_von_user_id')::uuid <> s.user_id

  UNION

  -- c) Die Bewerberzeile selbst. Deckt alle ab, die aktiviert wurden, bevor
  --    die Spiegelung nach user_settings existierte. Die Bewerber liegen in
  --    `bewerbungen`, ihre Felder in `meta` und in camelCase, weil die Tabelle
  --    aus dem Frontend heraus befüllt wird.
  SELECT (b.meta ->> 'userAccountId')::uuid,
         (b.meta ->> 'geworbenVonUserId')::uuid,
         'bewerber'
    FROM public.bewerbungen b
   WHERE coalesce(b.meta ->> '_type', 'bewerber') = 'bewerber'
     AND b.meta ->> 'userAccountId' ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND b.meta ->> 'geworbenVonUserId' ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND (b.meta ->> 'userAccountId')::uuid <> (b.meta ->> 'geworbenVonUserId')::uuid;
$$;

COMMENT ON FUNCTION public.team_zuordnung() IS
  'Rohe Team-Zuordnung Mitglied zu Leiter aus drei Quellen: '
  'user_settings.teamleader_id, user_settings.geworben_von_user_id und der '
  'Bewerberzeile. Einzige Wahrheit fuer alle Team-Abfragen. Nicht direkt '
  'aufrufen, sondern ueber team_mitglieder oder zustaendigkeitsbereich.';

-- Die Muster-Prüfung auf UUID-Form ist kein Schmuck: In `einstellungen` steht
-- freies JSON. Ein leerer String oder ein Name statt einer ID würde die
-- Umwandlung sprengen und die ganze Abfrage abbrechen lassen, und damit jeden
-- Dienst, der sie benutzt.

-- ── 2. Ein Team, von oben gesehen ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.team_mitglieder(_leiter uuid)
RETURNS TABLE(mitglied_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT z.mitglied_id
    FROM public.team_zuordnung() z
   WHERE z.leiter_id = _leiter
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = z.mitglied_id);
$$;

COMMENT ON FUNCTION public.team_mitglieder(uuid) IS
  'Alle Nutzer, die diesem Leiter zugeordnet sind, ohne ihn selbst. '
  'Verwaiste Zuordnungen ohne Profil fallen heraus.';

-- ── 3. Ein Team, von unten gesehen ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aufsicht_ueber(_mitglied uuid)
RETURNS TABLE(aufseher_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Inhaber und Administratoren sehen das ganze Haus.
  SELECT DISTINCT r.user_id
    FROM public.user_roles r
   WHERE r.role IN ('admin', 'inhaber')
     AND r.user_id <> _mitglied

  UNION

  -- Dazu die Leiter dieses Mitglieds, sofern sie auch wirklich Leiter sind.
  -- Ein Werber ohne Leiterrolle bekommt keine fremden Lead-Daten zu sehen.
  SELECT DISTINCT z.leiter_id
    FROM public.team_zuordnung() z
   WHERE z.mitglied_id = _mitglied
     AND z.leiter_id <> _mitglied
     AND EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.user_id = z.leiter_id AND r.role = 'vertriebsleiter'
     );
$$;

COMMENT ON FUNCTION public.aufsicht_ueber(uuid) IS
  'Alle, die die Leads dieses Nutzers ueberblicken duerfen: Inhaber, '
  'Administratoren und die eigenen Vertriebsleiter. Empfaengerliste fuer '
  'Eskalationen, damit ein Alarm nicht an das ganze Haus geht.';

-- ── 4. Der Bereich eines Nutzers ───────────────────────────────────────────

-- Die Ausgabespalte heißt bewusst `bereich_id` und nicht `user_id`: In einer
-- SQL-Funktion wird der Name der Ausgabespalte zu einem Bezeichner im Rumpf
-- und würde jede unqualifizierte Spalte `user_id` mehrdeutig machen.
CREATE OR REPLACE FUNCTION public.zustaendigkeitsbereich(_user uuid)
RETURNS TABLE(bereich_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Sich selbst sieht jeder.
  SELECT _user
   WHERE _user IS NOT NULL

  UNION

  -- Inhaber und Administratoren sehen jeden mit einer internen Rolle.
  --
  -- Bewusst ueber `is_internal_role` statt ueber eine eigene Rollenliste. Eine
  -- getippte Liste war hier schon einmal falsch: sie enthielt 'juniorpartner',
  -- das es im Typ `app_role` gar nicht gibt, und die Migration brach ab. Die
  -- Funktion ist die eine Stelle, an der steht, wer als intern gilt.
  SELECT DISTINCT r.user_id
    FROM public.user_roles r
   WHERE public.is_admin_role(_user)
     AND public.is_internal_role(r.user_id)

  UNION

  -- Vertriebsleiter sehen ihr Team.
  SELECT m.mitglied_id
    FROM public.team_mitglieder(_user) m
   WHERE EXISTS (
     SELECT 1 FROM public.user_roles r
      WHERE r.user_id = _user AND r.role = 'vertriebsleiter'
   );
$$;

COMMENT ON FUNCTION public.zustaendigkeitsbereich(uuid) IS
  'Alle Nutzer, deren Leads dieser Nutzer ueberblicken darf. Inhaber und '
  'Administratoren das ganze Haus, Vertriebsleiter ihr Team plus sich '
  'selbst, alle anderen nur sich selbst. Gegenstueck zu aufsicht_ueber.';

-- ── 5. Rechte ──────────────────────────────────────────────────────────────
--
-- Alle vier sind SECURITY DEFINER und lesen an RLS vorbei. Sie liefern zwar
-- nur Nutzer-IDs und keine Kundendaten, aber eine vollstaendige Teamkarte des
-- Hauses ist nichts, was ein Kunde oder Tippgeber abfragen koennen soll.
--
-- `team_zuordnung` bleibt komplett serverseitig, sie ist die rohe Tabelle.
-- Die drei Wrapper darf jeder Angemeldete rufen: Sie beantworten
-- Organisationsfragen, keine Kundenfragen, und die Oberflaeche braucht sie
-- spaeter fuer Teamlisten.

REVOKE ALL ON FUNCTION public.team_zuordnung() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_zuordnung() TO service_role;

REVOKE ALL ON FUNCTION public.team_mitglieder(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.team_mitglieder(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.aufsicht_ueber(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.aufsicht_ueber(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.zustaendigkeitsbereich(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.zustaendigkeitsbereich(uuid) TO authenticated, service_role;
