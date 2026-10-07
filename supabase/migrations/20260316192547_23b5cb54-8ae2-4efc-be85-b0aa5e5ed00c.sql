
-- ============================
-- 1. FIX signature_requests: restrict anon access
-- ============================
DROP POLICY IF EXISTS "Oeffentlich lesen per Token" ON public.signature_requests;
DROP POLICY IF EXISTS "Oeffentlich aktualisieren Signatur" ON public.signature_requests;
DROP POLICY IF EXISTS "Auth erstellen Signatur" ON public.signature_requests;

CREATE POLICY "Erstellen Signatur intern" ON public.signature_requests
  FOR INSERT TO authenticated WITH CHECK (is_internal_role(auth.uid()));

CREATE POLICY "Lesen per Token anon" ON public.signature_requests
  FOR SELECT TO anon, authenticated USING (
    token = coalesce(current_setting('request.headers', true)::json->>'x-signature-token', '')
    OR is_internal_role(auth.uid())
  );

CREATE POLICY "Aktualisieren per Token" ON public.signature_requests
  FOR UPDATE TO anon, authenticated USING (
    token = coalesce(current_setting('request.headers', true)::json->>'x-signature-token', '')
  );

-- ============================
-- 2. FIX unterlagen_* tables: restrict to authenticated internal roles
-- ============================
DROP POLICY IF EXISTS "Dokumente aktualisieren" ON public.unterlagen_dokumente;
DROP POLICY IF EXISTS "Dokumente einfügen" ON public.unterlagen_dokumente;
DROP POLICY IF EXISTS "Dokumente lesen" ON public.unterlagen_dokumente;
DROP POLICY IF EXISTS "Dokumente löschen" ON public.unterlagen_dokumente;
DROP POLICY IF EXISTS "Alle sehen Dokumente" ON public.unterlagen_dokumente;

CREATE POLICY "Interne sehen Unterlagen Dokumente" ON public.unterlagen_dokumente
  FOR SELECT TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Admins bearbeiten Unterlagen Dokumente" ON public.unterlagen_dokumente
  FOR INSERT TO authenticated WITH CHECK (is_admin_role(auth.uid()));
CREATE POLICY "Admins aktualisieren Unterlagen Dokumente" ON public.unterlagen_dokumente
  FOR UPDATE TO authenticated USING (is_admin_role(auth.uid()));
CREATE POLICY "Admins loeschen Unterlagen Dokumente" ON public.unterlagen_dokumente
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Highlights aktualisieren" ON public.unterlagen_highlights;
DROP POLICY IF EXISTS "Highlights einfügen" ON public.unterlagen_highlights;
DROP POLICY IF EXISTS "Highlights lesen" ON public.unterlagen_highlights;
DROP POLICY IF EXISTS "Highlights löschen" ON public.unterlagen_highlights;

CREATE POLICY "Interne sehen Highlights" ON public.unterlagen_highlights
  FOR SELECT TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Admins bearbeiten Highlights" ON public.unterlagen_highlights
  FOR INSERT TO authenticated WITH CHECK (is_admin_role(auth.uid()));
CREATE POLICY "Admins aktualisieren Highlights" ON public.unterlagen_highlights
  FOR UPDATE TO authenticated USING (is_admin_role(auth.uid()));
CREATE POLICY "Admins loeschen Highlights" ON public.unterlagen_highlights
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Kategorien aktualisieren" ON public.unterlagen_kategorien;
DROP POLICY IF EXISTS "Kategorien einfügen" ON public.unterlagen_kategorien;
DROP POLICY IF EXISTS "Kategorien lesen" ON public.unterlagen_kategorien;
DROP POLICY IF EXISTS "Kategorien löschen" ON public.unterlagen_kategorien;
DROP POLICY IF EXISTS "Alle sehen Kategorien" ON public.unterlagen_kategorien;

CREATE POLICY "Interne sehen Kategorien" ON public.unterlagen_kategorien
  FOR SELECT TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Admins bearbeiten Kategorien" ON public.unterlagen_kategorien
  FOR INSERT TO authenticated WITH CHECK (is_admin_role(auth.uid()));
CREATE POLICY "Admins aktualisieren Kategorien" ON public.unterlagen_kategorien
  FOR UPDATE TO authenticated USING (is_admin_role(auth.uid()));
CREATE POLICY "Admins loeschen Kategorien" ON public.unterlagen_kategorien
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

-- ============================
-- 3. FIX tippgeber
-- ============================
DROP POLICY IF EXISTS "Alle sehen Tippgeber" ON public.tippgeber;
DROP POLICY IF EXISTS "Auth bearbeiten Tippgeber" ON public.tippgeber;
DROP POLICY IF EXISTS "Auth erstellen Tippgeber" ON public.tippgeber;
DROP POLICY IF EXISTS "Auth loeschen Tippgeber" ON public.tippgeber;

CREATE POLICY "Interne sehen Tippgeber" ON public.tippgeber
  FOR SELECT TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Tippgeber" ON public.tippgeber
  FOR INSERT TO authenticated WITH CHECK (is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Tippgeber" ON public.tippgeber
  FOR UPDATE TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Admins loeschen Tippgeber" ON public.tippgeber
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

-- ============================
-- 4. FIX objekt_bilder DELETE
-- ============================
DROP POLICY IF EXISTS "Auth loeschen Bilder" ON public.objekt_bilder;
CREATE POLICY "Admins loeschen Bilder" ON public.objekt_bilder
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

-- ============================
-- 5. FIX objekt_dokumente: remove overly permissive
-- ============================
DROP POLICY IF EXISTS "Auth bearbeiten Dokumente obj" ON public.objekt_dokumente;
DROP POLICY IF EXISTS "Auth erstellen Dokumente obj" ON public.objekt_dokumente;
DROP POLICY IF EXISTS "Auth loeschen Dokumente obj" ON public.objekt_dokumente;
DROP POLICY IF EXISTS "Alle sehen Dokumente obj" ON public.objekt_dokumente;

CREATE POLICY "Admins loeschen Dokumente" ON public.objekt_dokumente
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

-- ============================
-- 6. FIX chat_nachrichten INSERT
-- ============================
DROP POLICY IF EXISTS "Nutzer senden Nachrichten" ON public.chat_nachrichten;
CREATE POLICY "Nutzer senden Nachrichten" ON public.chat_nachrichten
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = absender_id AND is_chat_participant(auth.uid(), chat_id)
  );

-- ============================
-- 7. FIX vermietungen
-- ============================
DROP POLICY IF EXISTS "Alle sehen Vermietungen" ON public.vermietungen;
DROP POLICY IF EXISTS "Auth bearbeiten Vermietungen" ON public.vermietungen;
DROP POLICY IF EXISTS "Auth erstellen Vermietungen" ON public.vermietungen;

CREATE POLICY "Interne sehen Vermietungen" ON public.vermietungen
  FOR SELECT TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Vermietungen" ON public.vermietungen
  FOR INSERT TO authenticated WITH CHECK (is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Vermietungen" ON public.vermietungen
  FOR UPDATE TO authenticated USING (is_internal_role(auth.uid()));

-- ============================
-- 8. FIX versicherungen
-- ============================
DROP POLICY IF EXISTS "Alle sehen Versicherungen" ON public.versicherungen;
DROP POLICY IF EXISTS "Auth bearbeiten Versicherungen" ON public.versicherungen;
DROP POLICY IF EXISTS "Auth erstellen Versicherungen" ON public.versicherungen;

CREATE POLICY "Interne sehen Versicherungen" ON public.versicherungen
  FOR SELECT TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Versicherungen" ON public.versicherungen
  FOR INSERT TO authenticated WITH CHECK (is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Versicherungen" ON public.versicherungen
  FOR UPDATE TO authenticated USING (is_internal_role(auth.uid()));

-- ============================
-- 9. FIX zaehlerstaende
-- ============================
DROP POLICY IF EXISTS "Alle sehen Zaehlerstaende" ON public.zaehlerstaende;
DROP POLICY IF EXISTS "Auth bearbeiten Zaehlerstaende" ON public.zaehlerstaende;
DROP POLICY IF EXISTS "Auth erstellen Zaehlerstaende" ON public.zaehlerstaende;

CREATE POLICY "Interne sehen Zaehlerstaende" ON public.zaehlerstaende
  FOR SELECT TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Zaehlerstaende" ON public.zaehlerstaende
  FOR INSERT TO authenticated WITH CHECK (is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Zaehlerstaende" ON public.zaehlerstaende
  FOR UPDATE TO authenticated USING (is_internal_role(auth.uid()));

-- ============================
-- 10. FIX wohnungen
-- ============================
DROP POLICY IF EXISTS "Auth bearbeiten Wohnungen" ON public.wohnungen;
DROP POLICY IF EXISTS "Auth erstellen Wohnungen" ON public.wohnungen;
DROP POLICY IF EXISTS "Auth loeschen Wohnungen" ON public.wohnungen;

CREATE POLICY "Interne bearbeiten Wohnungen" ON public.wohnungen
  FOR UPDATE TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Wohnungen" ON public.wohnungen
  FOR INSERT TO authenticated WITH CHECK (is_internal_role(auth.uid()));
CREATE POLICY "Admins loeschen Wohnungen" ON public.wohnungen
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

-- ============================
-- 11. FIX wohnungs_bilder & wohnungs_dokumente
-- ============================
DROP POLICY IF EXISTS "Auth bearbeiten WBilder" ON public.wohnungs_bilder;
DROP POLICY IF EXISTS "Auth erstellen WBilder" ON public.wohnungs_bilder;
DROP POLICY IF EXISTS "Auth loeschen WBilder" ON public.wohnungs_bilder;

CREATE POLICY "Interne bearbeiten WBilder" ON public.wohnungs_bilder
  FOR UPDATE TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen WBilder" ON public.wohnungs_bilder
  FOR INSERT TO authenticated WITH CHECK (is_internal_role(auth.uid()));
CREATE POLICY "Admins loeschen WBilder" ON public.wohnungs_bilder
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Auth bearbeiten WDokumente" ON public.wohnungs_dokumente;
DROP POLICY IF EXISTS "Auth erstellen WDokumente" ON public.wohnungs_dokumente;
DROP POLICY IF EXISTS "Auth loeschen WDokumente" ON public.wohnungs_dokumente;

CREATE POLICY "Interne bearbeiten WDokumente" ON public.wohnungs_dokumente
  FOR UPDATE TO authenticated USING (is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen WDokumente" ON public.wohnungs_dokumente
  FOR INSERT TO authenticated WITH CHECK (is_internal_role(auth.uid()));
CREATE POLICY "Admins loeschen WDokumente" ON public.wohnungs_dokumente
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));

-- ============================
-- 12. FIX wettbewerb_challenges
-- ============================
DROP POLICY IF EXISTS "Auth bearbeiten Challenges" ON public.wettbewerb_challenges;
DROP POLICY IF EXISTS "Auth erstellen Challenges" ON public.wettbewerb_challenges;
DROP POLICY IF EXISTS "Auth loeschen Challenges" ON public.wettbewerb_challenges;

CREATE POLICY "Admins bearbeiten Challenges" ON public.wettbewerb_challenges
  FOR UPDATE TO authenticated USING (is_admin_role(auth.uid()));
CREATE POLICY "Admins erstellen Challenges" ON public.wettbewerb_challenges
  FOR INSERT TO authenticated WITH CHECK (is_admin_role(auth.uid()));
CREATE POLICY "Admins loeschen Challenges" ON public.wettbewerb_challenges
  FOR DELETE TO authenticated USING (is_admin_role(auth.uid()));
