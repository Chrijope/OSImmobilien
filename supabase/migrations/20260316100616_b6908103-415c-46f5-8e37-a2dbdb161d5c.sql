
-- Batch 2: empfehlungen, empfehlungsprogramme, dienstleister, eigentuemer, hv_tickets, kautionen, kommunikation, betriebskosten, fristen, bewerbungen, support_tickets, news, app_config, benachrichtigungen, objekt_bilder, objekt_dokumente, profiles

DROP POLICY IF EXISTS "Alle sehen Empfehlungen" ON public.empfehlungen;
DROP POLICY IF EXISTS "Auth bearbeiten Empfehlungen" ON public.empfehlungen;
DROP POLICY IF EXISTS "Auth erstellen Empfehlungen" ON public.empfehlungen;
CREATE POLICY "Interne sehen Empfehlungen" ON public.empfehlungen FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Empfehlungen" ON public.empfehlungen FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Empfehlungen" ON public.empfehlungen FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Programme" ON public.empfehlungsprogramme;
DROP POLICY IF EXISTS "Auth bearbeiten Programme" ON public.empfehlungsprogramme;
DROP POLICY IF EXISTS "Auth erstellen Programme" ON public.empfehlungsprogramme;
CREATE POLICY "Interne sehen Programme" ON public.empfehlungsprogramme FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Admins bearbeiten Programme" ON public.empfehlungsprogramme FOR UPDATE TO authenticated USING (public.is_admin_role(auth.uid()));
CREATE POLICY "Admins erstellen Programme" ON public.empfehlungsprogramme FOR INSERT TO authenticated WITH CHECK (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Dienstleister" ON public.dienstleister;
DROP POLICY IF EXISTS "Auth bearbeiten Dienstleister" ON public.dienstleister;
DROP POLICY IF EXISTS "Auth erstellen Dienstleister" ON public.dienstleister;
DROP POLICY IF EXISTS "Auth loeschen Dienstleister" ON public.dienstleister;
CREATE POLICY "Interne sehen Dienstleister" ON public.dienstleister FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Dienstleister" ON public.dienstleister FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Dienstleister" ON public.dienstleister FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));
CREATE POLICY "Admins loeschen Dienstleister" ON public.dienstleister FOR DELETE TO authenticated USING (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Eigentuemer" ON public.eigentuemer;
DROP POLICY IF EXISTS "Auth bearbeiten Eigentuemer" ON public.eigentuemer;
DROP POLICY IF EXISTS "Auth erstellen Eigentuemer" ON public.eigentuemer;
CREATE POLICY "Interne sehen Eigentuemer" ON public.eigentuemer FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Eigentuemer" ON public.eigentuemer FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Eigentuemer" ON public.eigentuemer FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen HvTickets" ON public.hv_tickets;
DROP POLICY IF EXISTS "Auth bearbeiten HvTickets" ON public.hv_tickets;
DROP POLICY IF EXISTS "Auth erstellen HvTickets" ON public.hv_tickets;
DROP POLICY IF EXISTS "Auth loeschen HvTickets" ON public.hv_tickets;
CREATE POLICY "Interne sehen HvTickets" ON public.hv_tickets FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten HvTickets" ON public.hv_tickets FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen HvTickets" ON public.hv_tickets FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));
CREATE POLICY "Admins loeschen HvTickets" ON public.hv_tickets FOR DELETE TO authenticated USING (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Kautionen" ON public.kautionen;
DROP POLICY IF EXISTS "Auth bearbeiten Kautionen" ON public.kautionen;
DROP POLICY IF EXISTS "Auth erstellen Kautionen" ON public.kautionen;
CREATE POLICY "Interne sehen Kautionen" ON public.kautionen FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Kautionen" ON public.kautionen FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Kautionen" ON public.kautionen FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Kommunikation" ON public.kommunikation;
DROP POLICY IF EXISTS "Auth bearbeiten Kommunikation" ON public.kommunikation;
DROP POLICY IF EXISTS "Auth erstellen Kommunikation" ON public.kommunikation;
CREATE POLICY "Interne sehen Kommunikation" ON public.kommunikation FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Kommunikation" ON public.kommunikation FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Kommunikation" ON public.kommunikation FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Betriebskosten" ON public.betriebskosten;
DROP POLICY IF EXISTS "Auth bearbeiten Betriebskosten" ON public.betriebskosten;
DROP POLICY IF EXISTS "Auth erstellen Betriebskosten" ON public.betriebskosten;
CREATE POLICY "Interne sehen Betriebskosten" ON public.betriebskosten FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Betriebskosten" ON public.betriebskosten FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Betriebskosten" ON public.betriebskosten FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Fristen" ON public.fristen;
DROP POLICY IF EXISTS "Auth bearbeiten Fristen" ON public.fristen;
DROP POLICY IF EXISTS "Auth erstellen Fristen" ON public.fristen;
DROP POLICY IF EXISTS "Auth loeschen Fristen" ON public.fristen;
CREATE POLICY "Interne sehen Fristen" ON public.fristen FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Fristen" ON public.fristen FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne erstellen Fristen" ON public.fristen FOR INSERT TO authenticated WITH CHECK (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne loeschen Fristen" ON public.fristen FOR DELETE TO authenticated USING (public.is_internal_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Bewerbungen" ON public.bewerbungen;
DROP POLICY IF EXISTS "Auth bearbeiten Bewerbungen" ON public.bewerbungen;
DROP POLICY IF EXISTS "Auth erstellen Bewerbungen" ON public.bewerbungen;
CREATE POLICY "Interne sehen Bewerbungen" ON public.bewerbungen FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()) OR auth.uid() = benutzer_id);
CREATE POLICY "Interne bearbeiten Bewerbungen" ON public.bewerbungen FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Alle erstellen Bewerbungen" ON public.bewerbungen FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Alle sehen SupportTickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Auth bearbeiten SupportTickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Auth erstellen SupportTickets" ON public.support_tickets;
CREATE POLICY "Sehen SupportTickets" ON public.support_tickets FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()) OR auth.uid() = benutzer_id);
CREATE POLICY "Bearbeiten SupportTickets" ON public.support_tickets FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()) OR auth.uid() = benutzer_id);
CREATE POLICY "Erstellen SupportTickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = benutzer_id);

DROP POLICY IF EXISTS "Admins bearbeiten News" ON public.news;
DROP POLICY IF EXISTS "Admins erstellen News" ON public.news;
DROP POLICY IF EXISTS "Admins löschen News" ON public.news;
CREATE POLICY "Admins bearbeiten News" ON public.news FOR UPDATE TO authenticated USING (public.is_admin_role(auth.uid()));
CREATE POLICY "Admins erstellen News" ON public.news FOR INSERT TO authenticated WITH CHECK (public.is_admin_role(auth.uid()));
CREATE POLICY "Admins loeschen News" ON public.news FOR DELETE TO authenticated USING (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Auth aktualisieren config" ON public.app_config;
DROP POLICY IF EXISTS "Auth schreiben config" ON public.app_config;
CREATE POLICY "Admins aktualisieren config" ON public.app_config FOR UPDATE TO authenticated USING (public.is_admin_role(auth.uid()));
CREATE POLICY "Admins schreiben config" ON public.app_config FOR INSERT TO authenticated WITH CHECK (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Nutzer sehen alle Benachrichtigungen" ON public.benachrichtigungen;
CREATE POLICY "Nutzer sehen eigene Benachrichtigungen" ON public.benachrichtigungen FOR SELECT TO authenticated USING (auth.uid() = benutzer_id);

DROP POLICY IF EXISTS "Alle sehen Bilder" ON public.objekt_bilder;
DROP POLICY IF EXISTS "Auth bearbeiten Bilder" ON public.objekt_bilder;
DROP POLICY IF EXISTS "Auth erstellen Bilder" ON public.objekt_bilder;
CREATE POLICY "Interne sehen Bilder" ON public.objekt_bilder FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Admins bearbeiten Bilder" ON public.objekt_bilder FOR UPDATE TO authenticated USING (public.is_admin_role(auth.uid()));
CREATE POLICY "Admins erstellen Bilder" ON public.objekt_bilder FOR INSERT TO authenticated WITH CHECK (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Alle sehen Dokumente" ON public.objekt_dokumente;
DROP POLICY IF EXISTS "Auth bearbeiten Dokumente" ON public.objekt_dokumente;
DROP POLICY IF EXISTS "Auth erstellen Dokumente" ON public.objekt_dokumente;
CREATE POLICY "Interne sehen Dokumente" ON public.objekt_dokumente FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Admins bearbeiten Dokumente" ON public.objekt_dokumente FOR UPDATE TO authenticated USING (public.is_admin_role(auth.uid()));
CREATE POLICY "Admins erstellen Dokumente" ON public.objekt_dokumente FOR INSERT TO authenticated WITH CHECK (public.is_admin_role(auth.uid()));

DROP POLICY IF EXISTS "Nutzer bearbeiten eigenes Profil" ON public.profiles;
DROP POLICY IF EXISTS "Admins bearbeiten alle Profile" ON public.profiles;
DROP POLICY IF EXISTS "Auth sehen Profile" ON public.profiles;
DROP POLICY IF EXISTS "Alle sehen Profile" ON public.profiles;
DROP POLICY IF EXISTS "Auth bearbeiten Profile" ON public.profiles;
CREATE POLICY "Auth sehen Profile" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Nutzer bearbeiten eigenes Profil" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins bearbeiten alle Profile" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin_role(auth.uid()));

-- objekte
DROP POLICY IF EXISTS "Alle sehen Objekte" ON public.objekte;
DROP POLICY IF EXISTS "Auth bearbeiten Objekte" ON public.objekte;
DROP POLICY IF EXISTS "Auth erstellen Objekte" ON public.objekte;
DROP POLICY IF EXISTS "Auth loeschen Objekte" ON public.objekte;
CREATE POLICY "Interne sehen Objekte" ON public.objekte FOR SELECT TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Interne bearbeiten Objekte" ON public.objekte FOR UPDATE TO authenticated USING (public.is_internal_role(auth.uid()));
CREATE POLICY "Admins erstellen Objekte" ON public.objekte FOR INSERT TO authenticated WITH CHECK (public.is_admin_role(auth.uid()));
CREATE POLICY "Admins loeschen Objekte" ON public.objekte FOR DELETE TO authenticated USING (public.is_admin_role(auth.uid()));
