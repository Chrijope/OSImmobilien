-- ===========================================================================
-- Bilder der Objekteinreichung nur noch ueber die Function, Groessengrenze
-- am Eimer objekt-medien
-- ===========================================================================
--
-- WARUM
--
-- 20260831180000_objektakquise_offener_link.sql hat zwei Speicherregeln
-- angelegt: anon durfte selbst nach objekt-medien/einreichungen/public/
-- hochladen, jeder Angemeldete (auch Kunde, Tippgeber, Bewerber) in
-- einreichungen/<eigene Kennung>/. Der Eimer ist oeffentlich, beide Regeln
-- kannten weder Dateityp noch Groesse noch eine Bremse: Jeder konnte
-- beliebige Dateien unter unserer Adresse ablegen und verteilen.
--
-- Seit dem 04.10.2026 laedt das Formular unter /objekt-akquise in beiden
-- Faellen ueber die Function submit-objekt-einreichung hoch. Sie nimmt nur
-- Bilder bis 15 MB an, erkannt am Dateianfang, mit Kontingent je Anschluss,
-- und legt mit der Dienstrolle in denselben Ordnern ab wie bisher.
--
-- WAS DIESE MIGRATION TUT
--
-- 1. Entfernt beide Einreichungsregeln. Die Regeln fuer Admin, Inhaber,
--    Objektpartner und Objektfotos (20260930120000) bleiben unberuehrt.
-- 2. Setzt am Eimer objekt-medien eine Groessengrenze von 30 MB je Datei.
--    Gezaehlt am 04.10.2026: die groesste Datei hat 5,5 MB (ein Exposé),
--    Unterlagen sind im Formular auf 25 MB begrenzt (ObjektNeu.tsx). 30 MB
--    liegt ueber jedem heutigen Weg.
--
-- Bewusst KEINE Typgrenze (allowed_mime_types) am Eimer: Hinein gehoeren
-- auch PDFs (Exposés, Wohnungsexposés, Unterlagen unter objekte/) und aus
-- Investagon kommen Bilder als application/octet-stream. Eine Typliste
-- wuerde heutige Wege brechen. Die Typpruefung fuer Fremde macht die
-- Function.
--
-- Aendert keine Daten, wiederholbar.
--
-- REIHENFOLGE
--
--   1. submit-objekt-einreichung in Lovable ausrollen
--   2. Publish (die Seite nutzt dann den neuen Weg)
--   3. erst dann diese Migration
--
-- Laeuft sie vorher, scheitert der Bild-Upload auf /objekt-akquise. Das
-- Formular sagt das und laesst sich trotzdem absenden.
-- ===========================================================================

DROP POLICY IF EXISTS objekt_medien_anon_einreichung_upload ON storage.objects;
DROP POLICY IF EXISTS objekt_medien_auth_einreichung_upload ON storage.objects;

UPDATE storage.buckets SET file_size_limit = 31457280 WHERE id = 'objekt-medien';

-- Nachsehen (aendert nichts): Pruefzeile 59.1 und 59.2 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
