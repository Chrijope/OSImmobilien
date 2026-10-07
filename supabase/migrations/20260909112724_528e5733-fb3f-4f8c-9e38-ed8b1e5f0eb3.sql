-- lovable-cron-fallback-reviewed: 96 runs/day; ein Lauf ist auf 120 Sekunden begrenzt und schafft nur einen Teil der 43 Projekte samt Medien, deshalb sind Fortsetzungslaeufe noetig; bereits abgeglichene Projekte werden uebersprungen und die Function ist auf 4 Laeufe je Stunde begrenzt
-- Ein 120-Sekunden-Teilimport reicht nicht für 325 Details und deren Medien.
-- Folgeläufe überspringen vollständig abgeglichene Projekte derselben Quellversion.
-- Der stabile Jobname bleibt erhalten, damit kein zweiter Zeitplan entsteht.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron fehlt: Investagon-Fortsetzung kann nicht eingerichtet werden';
  END IF;
  PERFORM cron.schedule(
    'investagon-sync-taeglich',
    '*/15 * * * *',
    $cron$SELECT net.http_post(
      url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/investagon-import',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"sync":true,"bilder":true}'::jsonb
    );$cron$
  );
END $$;