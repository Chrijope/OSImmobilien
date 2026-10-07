-- ===========================================================================
-- Ablage fuer die Steuerauswertungen des oeffentlichen Rechners
-- ===========================================================================
--
-- Die Auswertung entsteht im Browser eines nicht angemeldeten Besuchers. Damit
-- ein Knopf in der Mail darauf zeigen kann, muss sie irgendwo liegen. Genau
-- dafuer ist dieser Eimer da.
--
-- Er ist NICHT oeffentlich, und er bekommt bewusst KEINE einzige Policy. Das
-- ist kein Versehen:
--
--   * `storage.objects` hat die Zeilensicherheit an. Ohne Policy darf also
--     niemand lesen, schreiben oder loeschen, weder anon noch authenticated.
--   * Die Service-Rolle umgeht die Zeilensicherheit. Nur die Edge Function
--     `steuer-auswertung-versand` schreibt hier hinein, und nur sie erzeugt
--     die signierte Adresse mit 90 Tagen Laufzeit, die in die Mail geht.
--
-- Ein Eimer, in den ein anonymer Besucher selbst schreiben duerfte, waere eine
-- offene Tuer: Jeder koennte beliebige Dateien unter unserem Namen ablegen und
-- verteilen. Deshalb geht der Weg ueber die Function und nicht ueber eine
-- Policy fuer `anon`.
--
-- Mehrfach ausfuehrbar.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'steuer-auswertungen', 'steuer-auswertungen', false,
  5242880,  -- 5 MB. Vier Seiten PDF liegen bei rund 300 KB, das ist reichlich
            -- Luft. Die Function begrenzt zusaetzlich schon die Anfrage.
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Sicherheitsnetz: Sollte je eine Policy fuer diesen Eimer angelegt worden
-- sein, verschwindet sie hier wieder. Der Eimer ist ausschliesslich ueber die
-- Service-Rolle erreichbar.
DO $$
DECLARE
  regel record;
BEGIN
  FOR regel IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (qual ILIKE '%steuer-auswertungen%' OR with_check ILIKE '%steuer-auswertungen%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', regel.policyname);
  END LOOP;
END $$;
