-- Zwei weitere Buchungslinks je Vertriebspartner
--
-- Im Profil stehen bisher zwei: `buchungslink` für das telefonische
-- Erstgespräch und `beratungslink` für das Beratungsgespräch. Christian hat am
-- 21.09.2026 zwei weitere Anlässe ergänzt, damit ein Partner alle vier
-- Gespräche über seinen eigenen Kalender terminieren kann:
--
--   * Objektgespräch, 60 Minuten
--   * Finanzierungsgespräch, 60 Minuten
--
-- Gleiche Bauart wie die beiden vorhandenen, also je eine Textspalte ohne
-- Vorgabe. Die Namen folgen den vorhandenen: das Wort, worum es geht, plus
-- "link", ohne Bindestrich.
--
-- Rechte bleiben unverändert. Auf `profiles` gibt es keine spaltenweisen
-- Freigaben, und die öffentliche Sicht `profiles_public` wird bewusst NICHT
-- erweitert: Die vier Knöpfe stehen im Kundenprofil und sehen nur angemeldete
-- Partner.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS objektlink text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS finanzierungslink text;

COMMENT ON COLUMN public.profiles.objektlink IS
  'Persoenlicher Buchungslink des Partners fuer das Objektgespraech, 60 Minuten.';
COMMENT ON COLUMN public.profiles.finanzierungslink IS
  'Persoenlicher Buchungslink des Partners fuer das Finanzierungsgespraech, 60 Minuten.';
