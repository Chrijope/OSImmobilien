-- ===========================================================================
-- Videocall: eigene Hintergrundbilder
-- ===========================================================================
--
-- Fuer den Video-Hintergrund im eigenen Videoraum kann jeder Nutzer eigene
-- Bilder hochladen (Einstellungen, Videocall). Die Bilder liegen in einem
-- privaten Bucket, jeder ausschliesslich in seinem eigenen Verzeichnis
-- `<userId>/...`. Es gibt keine Tabelle dazu: Die Dateiliste des Buckets ist
-- die Wahrheit, und die gespeicherte Auswahl (userSetting "videocall")
-- traegt nur den Pfad.
--
-- Vorbild ist der Bucket partner-unterlagen aus
-- 20260806160000_partner_pflichtunterlagen.sql, nur strenger: Hier darf
-- wirklich niemand ausser dem Eigentuemer an die Dateien, auch keine
-- Leitungsrolle. Ein Hintergrundbild ist Privatsache.

-- ── Speicherort ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videocall-hintergruende', 'videocall-hintergruende', false,
  5242880,  -- 5 MB. Die Oberflaeche verkleinert vor dem Upload ohnehin auf
            -- hoechstens 1920 Pixel Breite, das landet weit darunter.
  -- image/jpg steht mit dabei, weil manche Handykameras diesen falschen,
  -- aber verbreiteten Typ senden.
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── Zugriff auf die Dateien im Bucket ──────────────────────────────────────
--
-- Der Pfad beginnt mit der Nutzerkennung, daran haengt die Zuordnung. Jede
-- Regel prueft beides: den Bucket und das eigene Verzeichnis.

CREATE POLICY "Videocall-Hintergruende lesen"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'videocall-hintergruende'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Videocall-Hintergruende hochladen"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'videocall-hintergruende'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Videocall-Hintergruende ersetzen"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'videocall-hintergruende'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Videocall-Hintergruende loeschen"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'videocall-hintergruende'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
