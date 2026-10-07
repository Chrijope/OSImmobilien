-- Objektunterlagen bekommen einen eigenen, nicht oeffentlichen Speicherort.
--
-- Bisher landete alles im oeffentlichen Eimer "objekt-medien": Fotos ebenso
-- wie Grundbuchauszug, Teilungserklaerung, Mietvertrag, Wirtschaftsplan und
-- Versicherungsnachweis. Fuer Fotos ist das gewollt, sie erscheinen in
-- Exposés und Kundenlinks, die auch ohne Anmeldung geoeffnet werden. Fuer
-- Unterlagen ist es das nicht: Die Leseregel "objekt_medien_public_read"
-- laesst jeden Abruf zu, auch ohne Anmeldung und ohne jede Bedingung.
--
-- Warum ein eigener Eimer und nicht der vorhandene private Eimer
-- "unterlagen": Dort liegen die Kundenunterlagen, und dessen Leseregel
-- "unterlagen_auth_read" laesst jeden angemeldeten Nutzer lesen, also auch
-- die Rollen kunde und tippgeber. Objektunterlagen sollen enger liegen.
-- Waeren beide Sorten erst einmal vermischt, liesse sich das nur noch ueber
-- Pfadpraefixe auseinanderhalten, und ein Zurueck gaebe es praktisch nicht.
--
-- Der oeffentliche Eimer "objekt-medien" bleibt unangetastet, sonst brechen
-- die Exposés. Diese Migration verschiebt auch keine einzige vorhandene
-- Datei: Was heute im oeffentlichen Eimer liegt, bleibt dort und bleibt
-- erreichbar. Ueber den Umzug entscheidet Christian gesondert.
--
-- Mehrfach ausfuehrbar.

INSERT INTO storage.buckets (id, name, public)
VALUES ('objekt-dokumente', 'objekt-dokumente', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Lesen: nur angemeldete Nutzer mit interner Rolle. Kein anon.
--
-- Dasselbe Mass wie bei der Tabelle public.objekt_dokumente, deren
-- SELECT-Regel ebenfalls public.is_internal_role verlangt. Enger waere
-- verlockend, denn darunter fallen fuenfzehn Rollen, auch hausverwaltung,
-- marketing und hr, die einen Grundbuchauszug nicht brauchen. Es wuerde aber
-- nichts schuetzen und nur tote Verweise erzeugen: Wer den Eintrag samt
-- Dateiname in der Liste sieht, muss die Datei auch oeffnen koennen. Die
-- Trennung gehoert dann an die Tabelle, und beide Stellen muessen zusammen
-- enger werden, nicht diese allein.
DROP POLICY IF EXISTS "objekt_dokumente_intern_lesen" ON storage.objects;
CREATE POLICY "objekt_dokumente_intern_lesen" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'objekt-dokumente' AND public.is_internal_role(auth.uid()));

-- Schreiben, Aendern und Loeschen: nur wer Objekte pflegen darf.
--
-- public.is_objekt_manager sind admin, inhaber und objektpartner, also genau
-- die Rollen, die auch die Zeilen in public.objekt_dokumente anlegen duerfen
-- und die im Objektbereich als Bearbeiter gelten. Eine Datei ohne passende
-- Zeile waere ohnehin unerreichbar.
DROP POLICY IF EXISTS "objekt_dokumente_pflege_anlegen" ON storage.objects;
CREATE POLICY "objekt_dokumente_pflege_anlegen" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'objekt-dokumente' AND public.is_objekt_manager(auth.uid()));

DROP POLICY IF EXISTS "objekt_dokumente_pflege_aendern" ON storage.objects;
CREATE POLICY "objekt_dokumente_pflege_aendern" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'objekt-dokumente' AND public.is_objekt_manager(auth.uid()))
  WITH CHECK (bucket_id = 'objekt-dokumente' AND public.is_objekt_manager(auth.uid()));

DROP POLICY IF EXISTS "objekt_dokumente_pflege_loeschen" ON storage.objects;
CREATE POLICY "objekt_dokumente_pflege_loeschen" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'objekt-dokumente' AND public.is_objekt_manager(auth.uid()));
