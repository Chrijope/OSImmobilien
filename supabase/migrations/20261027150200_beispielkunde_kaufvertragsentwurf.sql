-- Beispielkunde Max Mustermann: Kaufvertragsentwurf im Kundenordner
-- freigegeben (Christian, 27.10.2026).
--
-- Seit 20261027130000 haengt der Notartermin an der Freigabe des
-- Kaufvertragsentwurfs. Der Beispielkunde zeigt den Schritt jetzt mit:
-- freigegeben am 12.09.2026, Notartermin 01.10.2026, also 19 Tage danach.
-- Hinter dem Dateinamen liegt keine Datei, wie bei den anderen Beispiel-PDFs.
--
-- Wiederholbar: Steht schon ein Kaufvertragsentwurf im Kundenordner,
-- passiert nichts.

UPDATE public.investments i
   SET meta = jsonb_set(
         i.meta, '{kundenordner}',
         CASE WHEN jsonb_typeof(i.meta -> 'kundenordner') = 'array' THEN i.meta -> 'kundenordner' ELSE '[]'::jsonb END
         || jsonb_build_array(jsonb_build_object(
              'id', 'beispiel-ko-kve', 'investmentId', i.id::text, 'kategorie', 'Kaufvertragsentwurf',
              'filename', 'Kaufvertragsentwurf_Beispiel.pdf', 'uploadedBy', 'Beispiel',
              'uploadedAt', '2026-09-12T10:00:00Z', 'freigegeben', true, 'freigegebenAm', '2026-09-12T10:00:00Z')))
 WHERE i.kunde_id = 'b7e5a1c0-0000-4000-8000-000000000001'
   AND (i.meta ->> 'beispiel') = 'true'
   AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(i.meta -> 'kundenordner') = 'array' THEN i.meta -> 'kundenordner' ELSE '[]'::jsonb END) d
      WHERE d ->> 'kategorie' = 'Kaufvertragsentwurf');
