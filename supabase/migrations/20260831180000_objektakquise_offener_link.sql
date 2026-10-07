-- Objektakquise als offener Link: Ankaufsfelder, anon-Versand, anon-Bild-Upload
-- in einen dedizierten Pfad und interner Notizverlauf je Einreichung.
--
-- Hintergrund:
-- * Die Route /objekt-akquise ist im Frontend oeffentlich, aber die
--   oeffentliche INSERT-Policy wurde am 25.05. entfernt (20260525080225).
--   Ohne Anmeldung schlug der Versand seither mit einem RLS-Fehler fehl.
-- * Der Bucket objekt-medien erlaubt Schreiben nur fuer interne Rollen bzw.
--   Objekt-Manager (20260618111510, 20260611104223). Der Bild-Upload ueber
--   den offenen Link schlug deshalb ebenfalls fehl.
-- * Die neuen Ankaufspruefungs-Felder liegen gesammelt in einer jsonb-Spalte
--   details, damit nicht fuer jedes Feld eine eigene Spalte noetig ist.
--   Struktur: src/lib/objektEinreichungFormular.ts.

-- ---------------------------------------------------------------------------
-- 1) Sammel-Spalte fuer die neuen Formularfelder
-- ---------------------------------------------------------------------------
ALTER TABLE public.objekt_einreichungen
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.objekt_einreichungen.details IS
  'Zusaetzliche Ankaufspruefungs-Felder des Akquiseformulars (Objekttyp, Wirtschaftlichkeit, Prozess, Unterlagen, Einreicher-Kontakt). Struktur siehe src/lib/objektEinreichungFormular.ts';

-- ---------------------------------------------------------------------------
-- 2) Offener Versand: jeder darf einreichen, aber nur frische Einreichungen
--    ohne interne Felder. Lesen, Aendern und Loeschen bleiben unveraendert
--    intern (bestehende Policies "Interne sehen/bearbeiten Einreichungen").
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Oeffentliche Einreichungen erstellen" ON public.objekt_einreichungen;
CREATE POLICY "Oeffentliche Einreichungen erstellen"
ON public.objekt_einreichungen
FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'eingereicht'
  AND notizen IS NULL
  AND bewertung IS NULL
  AND uebernommen_am IS NULL
  AND uebernommenes_objekt_id IS NULL
);

-- Sicherheitsgurt: anon darf auf dieser Tabelle ausschliesslich einfuegen.
REVOKE ALL ON public.objekt_einreichungen FROM anon;
GRANT INSERT ON public.objekt_einreichungen TO anon;

-- ---------------------------------------------------------------------------
-- 3) Storage: Bild-Upload ueber den offenen Link.
--    anon darf NUR in den Pfad einreichungen/public/ schreiben; kein Lesen,
--    kein Aendern, kein Loeschen, kein Listing (die Anzeige laeuft ueber die
--    Public-URL des oeffentlichen Buckets). Eingeloggte Nutzer ohne interne
--    Rolle duerfen in ihren eigenen Ordner einreichungen/<user-id>/ hochladen.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS objekt_medien_anon_einreichung_upload ON storage.objects;
CREATE POLICY objekt_medien_anon_einreichung_upload
ON storage.objects FOR INSERT TO anon
WITH CHECK (
  bucket_id = 'objekt-medien'
  AND (storage.foldername(name))[1] = 'einreichungen'
  AND (storage.foldername(name))[2] = 'public'
);

DROP POLICY IF EXISTS objekt_medien_auth_einreichung_upload ON storage.objects;
CREATE POLICY objekt_medien_auth_einreichung_upload
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'objekt-medien'
  AND (storage.foldername(name))[1] = 'einreichungen'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- 4) Interner Notizverlauf je Einreichung (Ruecksprache mit dem Eigentuemer).
--    Bewusst eigene Tabelle statt Spalte: fuer anon existiert schlicht keine
--    Policy und kein Grant, damit ist jeder Zugriff ueber den offenen Link
--    ausgeschlossen. Jeder Eintrag traegt Verfasser und Zeitstempel.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.objekt_einreichung_notizen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  einreichung_id uuid NOT NULL REFERENCES public.objekt_einreichungen(id) ON DELETE CASCADE,
  verfasser_id uuid,
  verfasser_name text,
  text text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objekt_einreichung_notizen_einreichung
  ON public.objekt_einreichung_notizen (einreichung_id, erstellt_am DESC);

ALTER TABLE public.objekt_einreichung_notizen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Interne sehen Einreichungsnotizen" ON public.objekt_einreichung_notizen;
CREATE POLICY "Interne sehen Einreichungsnotizen"
ON public.objekt_einreichung_notizen FOR SELECT TO authenticated
USING ((SELECT public.is_internal_role(auth.uid())));

DROP POLICY IF EXISTS "Interne schreiben Einreichungsnotizen" ON public.objekt_einreichung_notizen;
CREATE POLICY "Interne schreiben Einreichungsnotizen"
ON public.objekt_einreichung_notizen FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_internal_role(auth.uid()))
  AND verfasser_id = auth.uid()
);

DROP POLICY IF EXISTS "Admins loeschen Einreichungsnotizen" ON public.objekt_einreichung_notizen;
CREATE POLICY "Admins loeschen Einreichungsnotizen"
ON public.objekt_einreichung_notizen FOR DELETE TO authenticated
USING ((SELECT public.is_admin_role(auth.uid())));

REVOKE ALL ON public.objekt_einreichung_notizen FROM anon;
