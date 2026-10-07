-- Der Viertelstundenlauf raeumt nicht mehr auf
--
-- WARUM
--
-- GL nimmt am 22.09.2026 die einzelnen Bautraeger-Zugaenge aus Lovable
-- heraus und behaelt nur den eigenen MORE-Immo-Schluessel. Damit liefern diese
-- Zugaenge keine Objektkennungen mehr.
--
-- Die Bereinigung im Import loescht Objekte, die Investagon nicht mehr fuehrt
-- (`investagon-import/index.ts`, Abschnitt "Eins zu eins"). Sie laeuft, wenn im
-- Rumpf nicht ausdruecklich `aufraeumen: false` steht, und genau das fehlte
-- hier bisher. Nach dem Entfernen eines Zugangs haette der naechste Lauf dessen
-- Objekte fuer abgemeldet gehalten und geloescht, mitsamt Wohnungen, Bildern,
-- Dokumenten und Exposes, denn die haengen alle per ON DELETE CASCADE daran.
--
-- Die vorhandenen Bremsen reichen dafuer nicht: Der Kundenschutz greift nur bei
-- Einheiten mit Kunde, Reservierung oder Verkauf. Der Ausfallschutz greift erst
-- ueber der Haelfte des Bestands. Und die Zweitkennung schuetzt nur Objekte, bei
-- denen die Zusammenfuehrung ueber die Adresse schon gelaufen ist.
--
-- WAS DAS BEDEUTET, SOLANGE ES AUS IST
--
-- Objekte, die Investagon wirklich abmeldet, bleiben im CRM stehen und muessen
-- von Hand entfernt werden. Das ist der bewusste Preis. Ein Objekt zu viel ist
-- harmloser als ein geloeschtes Objekt samt Unterlagen.
--
-- WIEDER ANSCHALTEN
--
-- Erst wenn die Zugaenge entfernt sind, der eigene Schluessel nachweislich alle
-- Objekte liefert und die Dubletten bereinigt sind. Dann diese Migration mit
-- dem urspruenglichen Rumpf `{"sync":true,"bilder":true}` erneut ausfuehren.
-- Der Jobname bleibt derselbe, es entsteht kein zweiter Zeitplan.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron fehlt: Investagon-Zeitplan kann nicht geaendert werden';
  END IF;
  PERFORM cron.schedule(
    'investagon-sync-taeglich',
    '*/15 * * * *',
    $cron$SELECT net.http_post(
      url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/investagon-import',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"sync":true,"bilder":true,"aufraeumen":false}'::jsonb
    );$cron$
  );
END $$;
