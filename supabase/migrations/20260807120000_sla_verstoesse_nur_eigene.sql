-- Zugriffspruefung fuer public.get_sla_violations
--
-- Die Funktion ist SECURITY DEFINER und umgeht damit Row Level Security. Sie
-- hat bisher jede beliebige p_user_id akzeptiert, ohne zu pruefen, wer fragt.
-- Da die profiles-Policy jedem Angemeldeten die internen Profil-IDs zeigt,
-- mussten fremde IDs nicht einmal geraten werden. Damit konnte auch eine Rolle
-- ohne Vertriebszugang (kunde, tippgeber, bewerber) Vorname, Nachname,
-- Pipelinestufe und Untaetigkeitsdauer saemtlicher Leads abfragen.
--
-- Der Rumpf bleibt fachlich unveraendert, es kommt nur die Pruefung davor.
--
-- Vertriebsleiter bekommen hier bewusst KEINEN Team-Zugriff. Die
-- Team-Zugehoerigkeit steht derzeit nur im Frontend (getJuniorsForRecruiter)
-- und nicht in der Datenbank, es gaebe also nichts, woran die Pruefung sich
-- halten koennte. Das wird spaeter separat gebaut.
--
-- service_role ist erlaubt, weil der naechtliche Cron
-- send-sla-inactivity-nudges die Funktion mit dem Service-Key fuer jeden
-- internen Nutzer aufruft. Dort gibt es kein auth.uid(), die Pruefung wuerde
-- den Cron sonst jede Nacht abbrechen lassen. Der Service-Key liegt nur
-- serverseitig und umgeht ohnehin RLS.

CREATE OR REPLACE FUNCTION public.get_sla_violations(p_user_id uuid)
RETURNS TABLE(
  kontakt_id uuid,
  vorname text,
  nachname text,
  pipeline_stufe text,
  last_activity timestamptz,
  days_inactive int,
  severity text,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_orange int;
  v_red int;
BEGIN
  -- Nur die eigene Auswertung, Admin/Inhaber oder der serverseitige Cron.
  -- Die Meldung bleibt absichtlich unspezifisch, damit sie nicht verraet,
  -- ob es die angefragte Person ueberhaupt gibt.
  IF NOT (
    p_user_id = auth.uid()
    OR public.is_admin_role(auth.uid())
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Kein Zugriff auf diese Auswertung';
  END IF;

  -- Höchste relevante Rolle bestimmen (Inhaber > Admin > Leiter > VP > Junior > Setter)
  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = p_user_id
  ORDER BY CASE role::text
    WHEN 'inhaber' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'vertriebsleiter' THEN 3
    WHEN 'vertriebspartner' THEN 4
    WHEN 'juniorpartner' THEN 5
    WHEN 'setterin' THEN 6
    ELSE 99
  END
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  SELECT orange_days, red_days INTO v_orange, v_red
  FROM public.get_sla_thresholds(v_role);

  RETURN QUERY
  WITH meine_kontakte AS (
    SELECT k.id, k.vorname, k.nachname, k.aktualisiert_am,
           COALESCE(k.meta->>'pipelineStufe', 'neu') AS p_stufe
    FROM public.kontakte k
    WHERE k.zustaendig_id = p_user_id
      AND COALESCE(k.archiviert, false) = false
      AND COALESCE(k.geloescht, false) = false
      AND COALESCE(k.meta->>'pipelineStufe', 'neu') NOT IN (
        'verloren', 'faelligkeit', 'notar', 'finanzierung'
      )
  ),
  last_act AS (
    SELECT mk.id AS kid,
      GREATEST(
        mk.aktualisiert_am,
        COALESCE((SELECT MAX(a.datum) FROM public.aktivitaeten a WHERE a.kunde_id = mk.id::text), 'epoch'::timestamptz),
        COALESCE((SELECT MAX(GREATEST(f.erstellt_am, COALESCE(f.erledigt_am::timestamptz, 'epoch'::timestamptz)))
                  FROM public.follow_ups f WHERE f.kunde_id = mk.id::text), 'epoch'::timestamptz),
        COALESCE((SELECT MAX(km.erstellt_am) FROM public.kommunikation km
                  WHERE km.meta->>'kunde_id' = mk.id::text), 'epoch'::timestamptz)
      ) AS last_ts
    FROM meine_kontakte mk
  )
  SELECT
    mk.id,
    mk.vorname,
    mk.nachname,
    mk.p_stufe,
    la.last_ts,
    GREATEST(0, EXTRACT(DAY FROM (now() - la.last_ts))::int) AS d_inactive,
    CASE
      WHEN EXTRACT(DAY FROM (now() - la.last_ts))::int >= v_red THEN 'rot'
      WHEN EXTRACT(DAY FROM (now() - la.last_ts))::int >= v_orange THEN 'orange'
      ELSE 'gruen'
    END AS sev,
    CASE
      WHEN EXTRACT(DAY FROM (now() - la.last_ts))::int >= v_red
        THEN 'Über ' || v_red || ' Tage keine Aktivität'
      ELSE 'Über ' || v_orange || ' Tage keine Aktivität'
    END AS r
  FROM meine_kontakte mk
  JOIN last_act la ON la.kid = mk.id
  WHERE EXTRACT(DAY FROM (now() - la.last_ts))::int >= v_orange
  ORDER BY la.last_ts ASC
  LIMIT 100;
END;
$$;

-- Rechte wie gehabt setzen, damit CREATE OR REPLACE nichts verschiebt.
REVOKE EXECUTE ON FUNCTION public.get_sla_violations(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_sla_violations(uuid) TO authenticated;
