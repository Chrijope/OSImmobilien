-- Die Seite "Punkte für den Call" für den Vertrieb freigeben.
--
-- Die Karte "Weekly Sales Call" im Dashboard ist für Vertriebsleiter und
-- Vertriebspartner sichtbar (src/pages/Index.tsx, visibleFor), die Route
-- /weekly-call stand aber in keiner Rollenliste. Ein Klick auf "Punkte für den
-- Call" warf sie deshalb auf das Dashboard zurück.
--
-- Massgeblich für die Sichtbarkeit ist diese Tabelle, die Konstanten in
-- src/lib/sidebarPermissions.ts sind nur die Rückfallebene, solange die
-- Datenbank noch nicht geantwortet hat.
--
-- Admin und Inhaber brauchen keinen Eintrag, sie stehen in FULL_ACCESS_ROLES.
--
-- Auf der Seite liegen auch die Aufzeichnung und die Gesprächszusammenfassung,
-- die ein Admin hochlädt. Ohne diese Zeilen sieht sie niemand ausser der
-- Geschäftsführung, obwohl sie für alle Teilnehmer gedacht sind.

INSERT INTO public.role_permissions (role, url) VALUES
  ('vertriebsleiter',  '/weekly-call'),
  ('vertriebspartner', '/weekly-call')
ON CONFLICT DO NOTHING;
