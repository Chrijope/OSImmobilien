-- ===========================================================================
-- get_sla_violations: abgeschlossene Kunden sind keine vernachlaessigten Leads
-- ===========================================================================
--
-- Die Glocke meldete taeglich "SLA-Verstoss: 1 Lead vernachlaessigt" auch fuer
-- Kontakte, die laengst Kunde sind. Ausgenommen waren nur die Stufen
-- verloren, faelligkeit, notar und finanzierung. Die Stufen notar_ohne_gs,
-- notar_mit_gs, abrechnung, abgeschlossen, kunde, aftersales und archiviert
-- fehlten; dieselbe Liste wie GEWONNEN/VERLOREN in src/lib/dashboardKpis.ts.
--
-- Nur die Ausnahmeliste aendert sich. Zugriffspruefung und Rumpf bleiben wie
-- in 20260807190000_sla_verstoesse_fuer_die_aufsicht.sql.

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
  -- Die eigene Auswertung, die eigene Aufsicht, oder der serverseitige Cron.
  --
  -- `aufsicht_ueber` enthaelt Inhaber, Administratoren und die Vertriebsleiter
  -- dieser Person. Damit deckt sie den Admin-Fall gleich mit ab; die
  -- ausdrueckliche Pruefung auf `is_admin_role` bleibt trotzdem stehen, damit
  -- ein Administrator auch dann durchkommt, wenn die Team-Zuordnung einmal
  -- keine Zeile liefert.
  --
  -- Die Meldung bleibt absichtlich unspezifisch, damit sie nicht verraet, ob
  -- es die angefragte Person ueberhaupt gibt.
  IF NOT (
    p_user_id = auth.uid()
    OR public.is_admin_role(auth.uid())
    OR auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.aufsicht_ueber(p_user_id) a
       WHERE a.aufseher_id = auth.uid()
    )
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
        'verloren', 'archiviert', 'faelligkeit', 'notar', 'notar_ohne_gs',
        'notar_mit_gs', 'finanzierung', 'abrechnung', 'abgeschlossen',
        'kunde', 'aftersales'
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

COMMENT ON FUNCTION public.get_sla_violations(uuid) IS
  'Vernachlaessigte Leads einer Person. Abfragen darf sie nur diese Person '
  'selbst, ihre Aufsicht laut public.aufsicht_ueber, also Inhaber, '
  'Administratoren und die eigenen Vertriebsleiter, sowie der serverseitige '
  'Cron mit dem Service-Key. Alle anderen bekommen eine Fehlermeldung.';

-- Rechte wie gehabt setzen, damit CREATE OR REPLACE nichts verschiebt.
REVOKE EXECUTE ON FUNCTION public.get_sla_violations(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_sla_violations(uuid) TO authenticated;
