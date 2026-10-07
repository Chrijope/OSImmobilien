
-- 1) Tabelle
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role text NOT NULL,
  url  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, url)
);

-- 2) Grants (auth-only Lesen; Schreiben nur über RLS-Policies / service_role)
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL    ON public.role_permissions TO service_role;

-- 3) RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions readable by authenticated"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "role_permissions admins manage"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'inhaber'::app_role));

-- 4) Realtime
ALTER TABLE public.role_permissions REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='role_permissions';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions';
  END IF;
END $$;

-- 5) Helper-Funktion: darf Rolle diesen URL-Pfad?
CREATE OR REPLACE FUNCTION public.role_has_url(_role text, _url text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clean AS (
    SELECT split_part(split_part(_url, '?', 1), '#', 1) AS u
  )
  SELECT
    -- Voll-Zugriffs-Rollen sehen alles
    CASE WHEN _role IN ('inhaber','admin','individuell','testaccount') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.role_permissions rp, clean
      WHERE rp.role = _role
        AND (clean.u = rp.url OR clean.u LIKE rp.url || '/%')
    )
    END;
$$;

-- 6) Seed aus den bestehenden Frontend-Konstanten (sidebarPermissions.ts)
INSERT INTO public.role_permissions (role, url) VALUES
-- buchhaltung
('buchhaltung','/'),('buchhaltung','/inbox'),('buchhaltung','/anrufe'),('buchhaltung','/news'),
('buchhaltung','/abrechnungen'),('buchhaltung','/chat'),('buchhaltung','/ansprechpartner'),
('buchhaltung','/academy'),('buchhaltung','/wissenswelt'),
-- setterin
('setterin','/'),('setterin','/inbox'),('setterin','/anrufe'),('setterin','/news'),
('setterin','/lead-verwaltung'),('setterin','/meine-leads'),('setterin','/pipeline'),
('setterin','/kunden'),('setterin','/papierkorb'),('setterin','/ansprechpartner'),
('setterin','/academy'),('setterin','/einstellungen'),('setterin','/sales-coach'),
('setterin','/chat'),('setterin','/wissenswelt'),
-- objektpartner
('objektpartner','/'),('objektpartner','/news'),('objektpartner','/objekte'),
('objektpartner','/objekte/neu'),('objektpartner','/objekte/bearbeiten'),
('objektpartner','/objekt-akquise'),('objektpartner','/objekt-einreichungen'),
('objektpartner','/immorechner'),('objektpartner','/afa-rechner'),
('objektpartner','/chat'),('objektpartner','/support-kontaktieren'),
('objektpartner','/ansprechpartner'),('objektpartner','/einstellungen'),
-- kunde
('kunde','/kunde/stammdaten'),('kunde','/kunde/chat'),('kunde','/kunde/investments'),
('kunde','/kunde/steuer-cockpit'),('kunde','/kunde/kundenordner'),
('kunde','/kunde/empfehlungen'),('kunde','/kunde/einstellungen'),('kunde','/einstellungen'),
-- tippgeber
('tippgeber','/tippgeber-portal'),('tippgeber','/einstellungen'),
-- vertriebspartner
('vertriebspartner','/'),('vertriebspartner','/inbox'),('vertriebspartner','/anrufe'),
('vertriebspartner','/news'),('vertriebspartner','/sales-coach'),
('vertriebspartner','/meine-leads'),('vertriebspartner','/alle-kontakte'),
('vertriebspartner','/kontakte'),('vertriebspartner','/neukunden'),
('vertriebspartner','/abwicklung'),('vertriebspartner','/bestandskunden'),
('vertriebspartner','/verloren'),('vertriebspartner','/pipeline'),
('vertriebspartner','/empfehlungen'),('vertriebspartner','/follow-ups'),
('vertriebspartner','/reservierung'),('vertriebspartner','/papierkorb'),
('vertriebspartner','/objekte'),('vertriebspartner','/objekt-akquise'),
('vertriebspartner','/objekt-einreichungen'),('vertriebspartner','/auswertungen'),
('vertriebspartner','/statistiken'),('vertriebspartner','/analysetool'),
('vertriebspartner','/abrechnungen'),('vertriebspartner','/provisionsabrechnung'),
('vertriebspartner','/zielplanung'),('vertriebspartner','/wettbewerb'),
('vertriebspartner','/immorechner'),('vertriebspartner','/afa-rechner'),
('vertriebspartner','/bonitaetsrechner'),('vertriebspartner','/academy'),
('vertriebspartner','/immobilien-lexikon'),('vertriebspartner','/praesentation'),
('vertriebspartner','/unterlagen'),('vertriebspartner','/chat'),
('vertriebspartner','/support-kontaktieren'),('vertriebspartner','/ansprechpartner'),
('vertriebspartner','/berater-microseite'),('vertriebspartner','/teampartner'),
('vertriebspartner','/einstellungen'),('vertriebspartner','/kunden'),
('vertriebspartner','/wissenswelt'),('vertriebspartner','/aftersales'),
('vertriebspartner','/leitfaeden'),('vertriebspartner','/wissenswert'),
('vertriebspartner','/marketing'),('vertriebspartner','/bonitaet'),
-- finanzierungspartner
('finanzierungspartner','/'),('finanzierungspartner','/inbox'),('finanzierungspartner','/news'),
('finanzierungspartner','/objekte'),('finanzierungspartner','/abwicklung'),
('finanzierungspartner','/kunden'),('finanzierungspartner','/alle-kontakte'),
('finanzierungspartner','/kontakte'),('finanzierungspartner','/neukunden'),
('finanzierungspartner','/bestandskunden'),('finanzierungspartner','/pipeline'),
('finanzierungspartner','/immorechner'),('finanzierungspartner','/afa-rechner'),
('finanzierungspartner','/chat'),('finanzierungspartner','/support-kontaktieren'),
('finanzierungspartner','/ansprechpartner'),('finanzierungspartner','/einstellungen'),
-- hausverwaltung
('hausverwaltung','/'),('hausverwaltung','/inbox'),('hausverwaltung','/anrufe'),
('hausverwaltung','/news'),('hausverwaltung','/objekte'),('hausverwaltung','/mieter'),
('hausverwaltung','/eigentuemer'),('hausverwaltung','/dienstleister'),
('hausverwaltung','/hv-uebersicht'),('hausverwaltung','/hv-tickets'),
('hausverwaltung','/hv-kommunikation'),('hausverwaltung','/hv-statistiken'),
('hausverwaltung','/vermietung'),('hausverwaltung','/einheitenspiegel'),
('hausverwaltung','/betriebskostenabrechnung'),('hausverwaltung','/kautionen'),
('hausverwaltung','/zaehlerstaende'),('hausverwaltung','/fristenueberwachung'),
('hausverwaltung','/versicherungen'),('hausverwaltung','/immorechner'),
('hausverwaltung','/afa-rechner'),('hausverwaltung','/bonitaetsrechner'),
('hausverwaltung','/immobilien-lexikon'),('hausverwaltung','/chat'),
('hausverwaltung','/support-kontaktieren'),('hausverwaltung','/ansprechpartner'),
('hausverwaltung','/einstellungen'),('hausverwaltung','/wissenswelt'),
-- versicherungsexperte
('versicherungsexperte','/'),('versicherungsexperte','/inbox'),
('versicherungsexperte','/news'),('versicherungsexperte','/verloren'),
('versicherungsexperte','/kunden'),('versicherungsexperte','/pipeline'),
('versicherungsexperte','/chat'),('versicherungsexperte','/support-kontaktieren'),
('versicherungsexperte','/ansprechpartner'),('versicherungsexperte','/einstellungen'),
('versicherungsexperte','/wissenswelt'),
-- vertriebsleiter
('vertriebsleiter','/'),('vertriebsleiter','/inbox'),('vertriebsleiter','/anrufe'),
('vertriebsleiter','/news'),('vertriebsleiter','/sales-coach'),
('vertriebsleiter','/lead-verwaltung'),('vertriebsleiter','/meine-leads'),
('vertriebsleiter','/alle-kontakte'),('vertriebsleiter','/kontakte'),
('vertriebsleiter','/neukunden'),('vertriebsleiter','/abwicklung'),
('vertriebsleiter','/bestandskunden'),('vertriebsleiter','/verloren'),
('vertriebsleiter','/pipeline'),('vertriebsleiter','/empfehlungen'),
('vertriebsleiter','/follow-ups'),('vertriebsleiter','/reservierung'),
('vertriebsleiter','/papierkorb'),('vertriebsleiter','/objekte'),
('vertriebsleiter','/objekt-einreichungen'),('vertriebsleiter','/auswertungen'),
('vertriebsleiter','/statistiken'),('vertriebsleiter','/analysetool'),
('vertriebsleiter','/abrechnungen'),('vertriebsleiter','/provisionsabrechnung'),
('vertriebsleiter','/zielplanung'),('vertriebsleiter','/wettbewerb'),
('vertriebsleiter','/immorechner'),('vertriebsleiter','/afa-rechner'),
('vertriebsleiter','/bonitaetsrechner'),('vertriebsleiter','/academy'),
('vertriebsleiter','/wissenswelt'),('vertriebsleiter','/immobilien-lexikon'),
('vertriebsleiter','/praesentation'),('vertriebsleiter','/unterlagen'),
('vertriebsleiter','/marketing'),('vertriebsleiter','/chat'),
('vertriebsleiter','/support-kontaktieren'),('vertriebsleiter','/teampartner'),
('vertriebsleiter','/ansprechpartner'),('vertriebsleiter','/berater-microseite'),
('vertriebsleiter','/karriere'),('vertriebsleiter','/einstellungen'),
('vertriebsleiter','/kunden'),('vertriebsleiter','/aftersales'),
('vertriebsleiter','/leitfaeden'),('vertriebsleiter','/wissenswert'),
('vertriebsleiter','/bonitaet'),
-- hr
('hr','/'),('hr','/inbox'),('hr','/news'),('hr','/bewerbungsmanagement'),
('hr','/karriere'),('hr','/teampartner'),('hr','/ansprechpartner'),
('hr','/nutzerverwaltung'),('hr','/chat'),('hr','/support-kontaktieren'),
('hr','/helpdesk'),('hr','/wissenswelt'),('hr','/immobilien-lexikon'),
('hr','/einstellungen'),
-- backoffice
('backoffice','/'),('backoffice','/inbox'),('backoffice','/anrufe'),('backoffice','/news'),
('backoffice','/alle-kontakte'),('backoffice','/kontakte'),('backoffice','/neukunden'),
('backoffice','/bestandskunden'),('backoffice','/kunden'),('backoffice','/abwicklung'),
('backoffice','/pipeline'),('backoffice','/verloren'),('backoffice','/reservierung'),
('backoffice','/follow-ups'),('backoffice','/unterlagen'),('backoffice','/praesentation'),
('backoffice','/objekte'),('backoffice','/einheitenspiegel'),('backoffice','/immorechner'),
('backoffice','/afa-rechner'),('backoffice','/bonitaetsrechner'),('backoffice','/wissenswelt'),
('backoffice','/immobilien-lexikon'),('backoffice','/abrechnungen'),
('backoffice','/provisionsabrechnung'),('backoffice','/auswertungen'),
('backoffice','/statistiken'),('backoffice','/analysetool'),('backoffice','/chat'),
('backoffice','/helpdesk'),('backoffice','/support-kontaktieren'),
('backoffice','/ansprechpartner'),('backoffice','/teampartner'),
('backoffice','/nutzerverwaltung'),('backoffice','/berater-microseite'),
('backoffice','/einstellungen'),('backoffice','/aftersales'),('backoffice','/leitfaeden'),
('backoffice','/wissenswert'),('backoffice','/bonitaet')
ON CONFLICT DO NOTHING;
