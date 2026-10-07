
-- ══════════════════════════════════════════════════════
-- OBJEKTE (Properties)
-- ══════════════════════════════════════════════════════
CREATE TABLE public.objekte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titel TEXT NOT NULL,
  adresse TEXT,
  plz TEXT,
  ort TEXT,
  beschreibung TEXT,
  highlights TEXT[] DEFAULT '{}',
  bild_url TEXT,
  video_url TEXT,
  video_sichtbar BOOLEAN DEFAULT false,
  badge TEXT,
  groesse_von NUMERIC DEFAULT 0,
  groesse_bis NUMERIC DEFAULT 0,
  preis_von NUMERIC DEFAULT 0,
  preis_bis NUMERIC DEFAULT 0,
  rendite_von NUMERIC DEFAULT 0,
  rendite_bis NUMERIC DEFAULT 0,
  sichtbar BOOLEAN DEFAULT true,
  cloud_ordner_url TEXT,
  global_objekt BOOLEAN DEFAULT false,
  sanierungskosten NUMERIC DEFAULT 0,
  exklusiv_partner TEXT[] DEFAULT '{}',
  afa_modell TEXT DEFAULT 'linear',
  afa_satz NUMERIC DEFAULT 2,
  restnutzungsdauer INTEGER DEFAULT 50,
  grundstueck_anteil NUMERIC DEFAULT 20,
  global_gesamt_qm NUMERIC,
  global_etagen INTEGER,
  global_baujahr INTEGER,
  global_grundstueck_qm NUMERIC,
  global_verkaufspreis NUMERIC,
  global_rendite NUMERIC,
  global_jahresnettomiete NUMERIC,
  global_hausgeld_monat NUMERIC,
  global_kaufnebenkosten NUMERIC,
  global_zustand TEXT,
  global_energieeffizienzklasse TEXT,
  global_stellplaetze INTEGER,
  global_vermietungsstand NUMERIC,
  erstellt_von UUID,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  aktualisiert_am TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.objekte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle sehen Objekte" ON public.objekte FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Objekte" ON public.objekte FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Objekte" ON public.objekte FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Objekte" ON public.objekte FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- OBJEKT_BILDER
-- ══════════════════════════════════════════════════════
CREATE TABLE public.objekt_bilder (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  objekt_id UUID REFERENCES public.objekte(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  alt TEXT,
  reihenfolge INTEGER DEFAULT 0,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.objekt_bilder ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Bilder" ON public.objekt_bilder FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Bilder" ON public.objekt_bilder FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Bilder" ON public.objekt_bilder FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Bilder" ON public.objekt_bilder FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- OBJEKT_DOKUMENTE
-- ══════════════════════════════════════════════════════
CREATE TABLE public.objekt_dokumente (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  objekt_id UUID REFERENCES public.objekte(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  typ TEXT DEFAULT 'standard',
  kategorie TEXT DEFAULT 'objektunterlagen',
  sichtbar BOOLEAN DEFAULT true,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.objekt_dokumente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Dokumente obj" ON public.objekt_dokumente FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Dokumente obj" ON public.objekt_dokumente FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Dokumente obj" ON public.objekt_dokumente FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Dokumente obj" ON public.objekt_dokumente FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- WOHNUNGEN (Units within properties)
-- ══════════════════════════════════════════════════════
CREATE TABLE public.wohnungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  objekt_id UUID REFERENCES public.objekte(id) ON DELETE CASCADE NOT NULL,
  we_nr TEXT,
  etage TEXT,
  lage TEXT,
  groesse NUMERIC DEFAULT 0,
  zimmer NUMERIC DEFAULT 0,
  miete_gesamt NUMERIC DEFAULT 0,
  vk_gesamt NUMERIC DEFAULT 0,
  qm_preis NUMERIC DEFAULT 0,
  rendite NUMERIC DEFAULT 0,
  vermietet BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'frei',
  kunde_id TEXT,
  kunde_name TEXT,
  gesetzt_am TEXT,
  gesetzt_bis TEXT,
  reserviert_am TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.wohnungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Wohnungen" ON public.wohnungen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Wohnungen" ON public.wohnungen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Wohnungen" ON public.wohnungen FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Wohnungen" ON public.wohnungen FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- WOHNUNGS_BILDER
-- ══════════════════════════════════════════════════════
CREATE TABLE public.wohnungs_bilder (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wohnung_id UUID REFERENCES public.wohnungen(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  alt TEXT,
  reihenfolge INTEGER DEFAULT 0,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.wohnungs_bilder ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen WBilder" ON public.wohnungs_bilder FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen WBilder" ON public.wohnungs_bilder FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth loeschen WBilder" ON public.wohnungs_bilder FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- WOHNUNGS_DOKUMENTE
-- ══════════════════════════════════════════════════════
CREATE TABLE public.wohnungs_dokumente (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wohnung_id UUID REFERENCES public.wohnungen(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  kategorie TEXT DEFAULT 'wohnungsunterlagen',
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.wohnungs_dokumente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen WDokumente" ON public.wohnungs_dokumente FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen WDokumente" ON public.wohnungs_dokumente FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth loeschen WDokumente" ON public.wohnungs_dokumente FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- AKTIVITAETEN (Activity log per contact)
-- ══════════════════════════════════════════════════════
CREATE TABLE public.aktivitaeten (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kunde_id TEXT NOT NULL,
  benutzer_id UUID,
  art TEXT NOT NULL DEFAULT 'notiz',
  beschreibung TEXT,
  details TEXT,
  von TEXT,
  prioritaet TEXT DEFAULT 'mittel',
  faellig_am TEXT,
  uhrzeit TEXT,
  zugewiesen_an TEXT,
  dauer TEXT,
  ergebnis TEXT,
  teilnehmer TEXT,
  zoom_link TEXT,
  erledigt_am TEXT,
  datum TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.aktivitaeten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Aktivitaeten" ON public.aktivitaeten FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Aktivitaeten" ON public.aktivitaeten FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Aktivitaeten" ON public.aktivitaeten FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Aktivitaeten" ON public.aktivitaeten FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- FOLLOW_UPS
-- ══════════════════════════════════════════════════════
CREATE TABLE public.follow_ups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kunde_id TEXT NOT NULL,
  kunde_name TEXT,
  berater TEXT,
  pipeline_stufe TEXT,
  typ TEXT DEFAULT 'anruf',
  titel TEXT NOT NULL,
  beschreibung TEXT,
  faellig_am TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  erledigt_am TEXT,
  status TEXT DEFAULT 'offen',
  prioritaet TEXT DEFAULT 'mittel',
  automatisch BOOLEAN DEFAULT false,
  benutzer_id UUID
);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen FollowUps" ON public.follow_ups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen FollowUps" ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten FollowUps" ON public.follow_ups FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen FollowUps" ON public.follow_ups FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- FOLLOW_UP_KETTEN (Automation chains)
-- ══════════════════════════════════════════════════════
CREATE TABLE public.follow_up_ketten (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  pipeline_stufe TEXT,
  aktiv BOOLEAN DEFAULT true,
  schritte JSONB DEFAULT '[]',
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.follow_up_ketten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Ketten" ON public.follow_up_ketten FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Ketten" ON public.follow_up_ketten FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Ketten" ON public.follow_up_ketten FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Ketten" ON public.follow_up_ketten FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- FINANZIERUNGEN (per contact)
-- ══════════════════════════════════════════════════════
CREATE TABLE public.finanzierungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kunde_id TEXT NOT NULL UNIQUE,
  phase TEXT DEFAULT 'offen',
  akzeptiertes_angebot_id TEXT,
  angebote JSONB DEFAULT '[]',
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  aktualisiert_am TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.finanzierungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Finanzierungen" ON public.finanzierungen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Finanzierungen" ON public.finanzierungen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Finanzierungen" ON public.finanzierungen FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- EMPFEHLUNGEN
-- ══════════════════════════════════════════════════════
CREATE TABLE public.empfehlungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empfohlen_von TEXT,
  empfohlen_name TEXT,
  empfohlen_email TEXT,
  empfohlen_telefon TEXT,
  status TEXT DEFAULT 'offen',
  notizen TEXT,
  provision NUMERIC DEFAULT 0,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.empfehlungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Empfehlungen" ON public.empfehlungen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Empfehlungen" ON public.empfehlungen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Empfehlungen" ON public.empfehlungen FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- EMPFEHLUNGSPROGRAMME
-- ══════════════════════════════════════════════════════
CREATE TABLE public.empfehlungsprogramme (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  praemie TEXT,
  beschreibung TEXT,
  aktiv BOOLEAN DEFAULT true,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.empfehlungsprogramme ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Programme" ON public.empfehlungsprogramme FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Programme" ON public.empfehlungsprogramme FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Programme" ON public.empfehlungsprogramme FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- MIETER
-- ══════════════════════════════════════════════════════
CREATE TABLE public.mieter (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  email TEXT,
  telefon TEXT,
  objekt TEXT,
  wohnung TEXT,
  einzug TEXT,
  miete NUMERIC DEFAULT 0,
  nebenkosten NUMERIC DEFAULT 0,
  kaution NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'aktiv',
  notizen TEXT,
  dokumente JSONB DEFAULT '[]',
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.mieter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Mieter" ON public.mieter FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Mieter" ON public.mieter FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Mieter" ON public.mieter FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Mieter" ON public.mieter FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- HV_TICKETS (Hausverwaltung)
-- ══════════════════════════════════════════════════════
CREATE TABLE public.hv_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titel TEXT NOT NULL,
  beschreibung TEXT,
  kategorie TEXT,
  prioritaet TEXT DEFAULT 'mittel',
  status TEXT DEFAULT 'offen',
  objekt TEXT,
  wohnung TEXT,
  melder TEXT,
  zugewiesen_an TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  aktualisiert_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  erledigt_am TEXT,
  benutzer_id UUID
);

ALTER TABLE public.hv_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen HvTickets" ON public.hv_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen HvTickets" ON public.hv_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten HvTickets" ON public.hv_tickets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen HvTickets" ON public.hv_tickets FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- DIENSTLEISTER
-- ══════════════════════════════════════════════════════
CREATE TABLE public.dienstleister (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  kategorie TEXT,
  telefon TEXT,
  email TEXT,
  adresse TEXT,
  notizen TEXT,
  bewertung INTEGER DEFAULT 0,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.dienstleister ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Dienstleister" ON public.dienstleister FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Dienstleister" ON public.dienstleister FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Dienstleister" ON public.dienstleister FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Dienstleister" ON public.dienstleister FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- KAUTIONEN
-- ══════════════════════════════════════════════════════
CREATE TABLE public.kautionen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mieter_name TEXT,
  objekt TEXT,
  wohnung TEXT,
  betrag NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'offen',
  eingegangen_am TEXT,
  notizen TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.kautionen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Kautionen" ON public.kautionen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Kautionen" ON public.kautionen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Kautionen" ON public.kautionen FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- VERSICHERUNGEN
-- ══════════════════════════════════════════════════════
CREATE TABLE public.versicherungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  typ TEXT,
  anbieter TEXT,
  police_nr TEXT,
  praemie NUMERIC DEFAULT 0,
  objekt TEXT,
  gueltig_ab TEXT,
  gueltig_bis TEXT,
  notizen TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.versicherungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Versicherungen" ON public.versicherungen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Versicherungen" ON public.versicherungen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Versicherungen" ON public.versicherungen FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- ZAEHLERSTAENDE
-- ══════════════════════════════════════════════════════
CREATE TABLE public.zaehlerstaende (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  objekt TEXT,
  wohnung TEXT,
  zaehler_nr TEXT,
  typ TEXT DEFAULT 'strom',
  wert NUMERIC DEFAULT 0,
  abgelesen_am TEXT,
  notizen TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.zaehlerstaende ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Zaehlerstaende" ON public.zaehlerstaende FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Zaehlerstaende" ON public.zaehlerstaende FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Zaehlerstaende" ON public.zaehlerstaende FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- EIGENTUEMER
-- ══════════════════════════════════════════════════════
CREATE TABLE public.eigentuemer (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  telefon TEXT,
  adresse TEXT,
  objekte TEXT[] DEFAULT '{}',
  notizen TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.eigentuemer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Eigentuemer" ON public.eigentuemer FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Eigentuemer" ON public.eigentuemer FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Eigentuemer" ON public.eigentuemer FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- WETTBEWERB_CHALLENGES
-- ══════════════════════════════════════════════════════
CREATE TABLE public.wettbewerb_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titel TEXT NOT NULL,
  icon TEXT DEFAULT '🏆',
  beschreibung TEXT,
  start_datum TEXT,
  end_datum TEXT,
  anzeigemonat TEXT,
  zielwert INTEGER DEFAULT 0,
  einheit TEXT DEFAULT 'Abschlüsse',
  preis TEXT,
  aktiv BOOLEAN DEFAULT true,
  ranking JSONB DEFAULT '[]',
  fortschritt INTEGER DEFAULT 0,
  ergebnis TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.wettbewerb_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Challenges" ON public.wettbewerb_challenges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Challenges" ON public.wettbewerb_challenges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Challenges" ON public.wettbewerb_challenges FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Challenges" ON public.wettbewerb_challenges FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- KOMMUNIKATION (HV-Kommunikation)
-- ══════════════════════════════════════════════════════
CREATE TABLE public.kommunikation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  typ TEXT DEFAULT 'email',
  betreff TEXT,
  inhalt TEXT,
  empfaenger TEXT,
  absender TEXT,
  objekt TEXT,
  status TEXT DEFAULT 'gesendet',
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.kommunikation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Kommunikation" ON public.kommunikation FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Kommunikation" ON public.kommunikation FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Kommunikation" ON public.kommunikation FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- FRISTEN
-- ══════════════════════════════════════════════════════
CREATE TABLE public.fristen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titel TEXT NOT NULL,
  beschreibung TEXT,
  faellig_am TEXT,
  kategorie TEXT,
  objekt TEXT,
  status TEXT DEFAULT 'offen',
  erinnerung_tage INTEGER DEFAULT 7,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.fristen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Fristen" ON public.fristen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Fristen" ON public.fristen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Fristen" ON public.fristen FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth loeschen Fristen" ON public.fristen FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- SUPPORT_TICKETS
-- ══════════════════════════════════════════════════════
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  betreff TEXT NOT NULL,
  nachricht TEXT,
  kategorie TEXT,
  prioritaet TEXT DEFAULT 'mittel',
  status TEXT DEFAULT 'offen',
  antwort TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Nutzer sehen eigene Tickets" ON public.support_tickets FOR SELECT TO authenticated USING (auth.uid() = benutzer_id);
CREATE POLICY "Nutzer erstellen Tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = benutzer_id);
CREATE POLICY "Nutzer bearbeiten eigene Tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (auth.uid() = benutzer_id);

-- ══════════════════════════════════════════════════════
-- BEWERBUNGEN
-- ══════════════════════════════════════════════════════
CREATE TABLE public.bewerbungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  email TEXT,
  telefon TEXT,
  position TEXT,
  nachricht TEXT,
  status TEXT DEFAULT 'eingegangen',
  notizen TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.bewerbungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Bewerbungen" ON public.bewerbungen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Bewerbungen" ON public.bewerbungen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Bewerbungen" ON public.bewerbungen FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- INVESTMENTS (Kunden-Investments)
-- ══════════════════════════════════════════════════════
CREATE TABLE public.investments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kunde_id TEXT NOT NULL,
  objekt TEXT,
  wohnung TEXT,
  kaufpreis NUMERIC DEFAULT 0,
  kaufdatum TEXT,
  status TEXT DEFAULT 'aktiv',
  notizen TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Investments" ON public.investments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Investments" ON public.investments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Investments" ON public.investments FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- BETRIEBSKOSTEN
-- ══════════════════════════════════════════════════════
CREATE TABLE public.betriebskosten (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  objekt TEXT,
  jahr INTEGER,
  mieter_name TEXT,
  wohnung TEXT,
  gesamtkosten NUMERIC DEFAULT 0,
  vorauszahlung NUMERIC DEFAULT 0,
  nachzahlung NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'entwurf',
  positionen JSONB DEFAULT '[]',
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.betriebskosten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Betriebskosten" ON public.betriebskosten FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Betriebskosten" ON public.betriebskosten FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Betriebskosten" ON public.betriebskosten FOR UPDATE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════
-- VERMIETUNGEN
-- ══════════════════════════════════════════════════════
CREATE TABLE public.vermietungen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  objekt TEXT,
  wohnung TEXT,
  mieter_name TEXT,
  miete NUMERIC DEFAULT 0,
  nebenkosten NUMERIC DEFAULT 0,
  mietbeginn TEXT,
  mietende TEXT,
  status TEXT DEFAULT 'aktiv',
  notizen TEXT,
  erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT now(),
  benutzer_id UUID
);

ALTER TABLE public.vermietungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle sehen Vermietungen" ON public.vermietungen FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth erstellen Vermietungen" ON public.vermietungen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth bearbeiten Vermietungen" ON public.vermietungen FOR UPDATE TO authenticated USING (true);
