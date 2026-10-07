-- ===========================================================================
-- Die Seite "Vertriebshandbuch" freigeben
-- ===========================================================================
--
-- Das Handbuch erklaert den Kundenabwicklungsprozess von der Anlage bis zum
-- Abschluss: alle Stufen, alle Erinnerungen mit ihren Eskalationsstufen, wer
-- wann eine Glocke oder eine Aufgabe bekommt, was beim Kunden ankommt, was die
-- Ampel am Namen bedeutet und was "Aktion erstellen" ausloest.
--
-- Es ist fuer die Vertriebspartner gedacht. Genau sie sehen im Alltag immer
-- nur den Ausschnitt, in dem sie gerade stehen, und wissen nicht, was davor
-- und danach von allein laeuft.
--
-- Massgeblich fuer die Sichtbarkeit ist diese Tabelle. Die Listen in
-- `src/lib/sidebarPermissions.ts` sind nur der Rueckfall, solange die
-- Datenbank noch nicht geantwortet hat. Admin und Inhaber brauchen keinen
-- Eintrag, sie stehen in FULL_ACCESS_ROLES.
--
-- Die Seite zeigt keine Kundendaten, sondern ausschliesslich erklaerenden
-- Text. Sie ist deshalb breit freigegeben.
-- ===========================================================================

INSERT INTO public.role_permissions (role, url) VALUES
  ('vertriebspartner', '/vertriebshandbuch'),
  ('vertriebsleiter',  '/vertriebshandbuch'),
  ('setterin',         '/vertriebshandbuch'),
  ('backoffice',       '/vertriebshandbuch'),
  ('finanzierungspartner', '/vertriebshandbuch'),
  ('hr',               '/vertriebshandbuch'),
  ('individuell',      '/vertriebshandbuch')
ON CONFLICT DO NOTHING;
