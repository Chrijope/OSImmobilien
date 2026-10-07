-- ===========================================================================
-- Den Steuerrechner fuer Vertriebspartner freigeben
-- ===========================================================================
--
-- Christian hat am 24.09.2026 entschieden: Jeder Vertriebspartner sieht den
-- Steuerrechner links unter Tools, gleich auf welcher Karrierestufe. Jeder
-- Partner teilt ihn ueber seinen persoenlichen Link, Interessenten landen als
-- neuer Lead nur bei ihm.
--
-- Massgeblich fuer die Sichtbarkeit ist diese Tabelle. Die Listen in
-- `src/lib/sidebarPermissions.ts` sind nur der Rueckfall, solange die
-- Datenbank noch nicht geantwortet hat. Dort stand die Seite schon fuer
-- Vertriebspartner, hier fehlte die Zeile bisher.
--
-- Die Seite liest nur Kontakte, die die Kontaktregeln dem Partner ohnehin
-- zeigen (eigene Leads). Fremde Leads oder Provisionen laedt sie nicht.
-- ===========================================================================

INSERT INTO public.role_permissions (role, url) VALUES
  ('vertriebspartner', '/steuerrechner')
ON CONFLICT DO NOTHING;
