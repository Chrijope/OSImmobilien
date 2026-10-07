-- ===========================================================================
-- Praesentations-PDFs: lesen alle, schreiben nur die Vorlagenpflege
-- ===========================================================================
--
-- WARUM
--
-- Der Ablageort `praesentation-pdfs` stand seit dem 17.07.2026 jedem
-- angemeldeten Nutzer zum Schreiben offen (20260717085929): INSERT und UPDATE
-- ohne jede Einschraenkung auf Rolle oder Eigentuemer. Wer angemeldet ist,
-- konnte also jede fertige Praesentation ueberschreiben, auch die, die
-- Kollegen gleich darauf an Kunden weitergeben.
--
-- ENTSCHEIDUNG VON CHRISTIAN
--
-- Lesen bleibt fuer alle Angemeldeten offen, es sind Vorlagen und jeder soll
-- sie herunterladen koennen. Schreiben, Aendern und Loeschen gehoert allein
-- denen, die Vorlagen pflegen, also admin und inhaber. Dieselben zwei Rollen
-- fasst `public.is_admin_role` zusammen, deshalb steht hier keine eigene
-- Liste.
--
-- WER HEUTE TATSAECHLICH SCHREIBT
--
-- Nur eine Stelle: `src/components/presentation/PraesentationPdfButton.tsx`.
-- Sie legt die einmal erzeugte PDF nebenbei in den Ablageort, damit der
-- naechste Nutzer sie nicht neu rendern muss. Das ist ein Zwischenspeicher
-- und keine Arbeit, die jemandem abgeschnitten wird: Schlaegt der Upload
-- fehl, bekommt der Nutzer seine PDF trotzdem, sie wird im Browser erzeugt.
-- Ab jetzt fuellt die Vorlagenpflege den Zwischenspeicher, alle anderen lesen
-- ihn nur. Keine Edge Function und kein Hintergrundlauf schreibt dorthin;
-- beide wuerden ohnehin mit der Dienstrolle laufen, fuer die keine dieser
-- Richtlinien gilt.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================

-- Lesen: unveraendert jeder Angemeldete. Steht hier nur, damit die Regel
-- vollstaendig an einer Stelle nachzulesen ist.
DROP POLICY IF EXISTS "Praesentation-PDFs auth read" ON storage.objects;
CREATE POLICY "Praesentation-PDFs auth read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'praesentation-pdfs');

-- Anlegen: nur die Vorlagenpflege.
DROP POLICY IF EXISTS "Praesentation-PDFs auth insert" ON storage.objects;
DROP POLICY IF EXISTS "Praesentation-PDFs pflege insert" ON storage.objects;
CREATE POLICY "Praesentation-PDFs pflege insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'praesentation-pdfs'
    AND (select public.is_admin_role(auth.uid()))
  );

-- Aendern: ebenso. Das WITH CHECK muss mit, sonst koennte eine geaenderte
-- Zeile hinterher in einem fremden Ablageort liegen.
DROP POLICY IF EXISTS "Praesentation-PDFs auth update" ON storage.objects;
DROP POLICY IF EXISTS "Praesentation-PDFs pflege update" ON storage.objects;
CREATE POLICY "Praesentation-PDFs pflege update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'praesentation-pdfs'
    AND (select public.is_admin_role(auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'praesentation-pdfs'
    AND (select public.is_admin_role(auth.uid()))
  );

-- Loeschen: bisher gab es dafuer gar keine Richtlinie, also konnte es
-- niemand ausser der Dienstrolle. Die Vorlagenpflege bekommt es jetzt, damit
-- eine veraltete Fassung weggeraeumt werden kann. Beim Erhoehen von
-- PDF_VERSION bleiben sonst alte Staende dauerhaft liegen.
DROP POLICY IF EXISTS "Praesentation-PDFs pflege delete" ON storage.objects;
CREATE POLICY "Praesentation-PDFs pflege delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'praesentation-pdfs'
    AND (select public.is_admin_role(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Nachsehen
-- ---------------------------------------------------------------------------
--
--     select policyname, cmd, qual, with_check
--       from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and policyname like 'Praesentation-PDFs%';
--
-- Erwartet werden vier Zeilen: read (SELECT, ohne Rollenpruefung),
-- pflege insert, pflege update, pflege delete.
--
-- Gegenprobe im Betrieb: Ein Vertriebspartner oeffnet eine Praesentation und
-- laedt die PDF herunter, das muss gehen. In der Browser-Konsole steht dabei
-- gegebenenfalls der Hinweis, dass der Zwischenspeicher nicht gefuellt werden
-- konnte. Das ist der neue Normalfall und kein Fehler.
