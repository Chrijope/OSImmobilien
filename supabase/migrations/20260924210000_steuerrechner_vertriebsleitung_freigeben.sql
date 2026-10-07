-- ===========================================================================
-- Den Steuerrechner fuer die Vertriebsleitung freigeben
-- ===========================================================================
--
-- Christian hat am 24.09.2026 entschieden: Die Vertriebsleitung bekommt einen
-- eigenen Steuerrechner-Link. Ein Lead darueber wird ihr zugeordnet, und sie
-- bekommt die Glocke. Den Link holt sie sich auf der Seite Steuerrechner.
--
-- In `src/lib/sidebarPermissions.ts` steht die Seite fuer die Rolle
-- vertriebsleiter schon, dort aber nur als Rueckfall, solange die Datenbank
-- noch nicht geantwortet hat. Massgeblich ist diese Tabelle, und hier fehlte
-- die Zeile. Ohne sie saehe die Vertriebsleitung die Seite nicht und kaeme an
-- ihren Link nicht heran.
--
-- Der Code braucht diese Migration nicht, um zu laufen. Fehlt sie, bleibt der
-- Menuepunkt fuer die Vertriebsleitung nur unsichtbar.
--
-- Backoffice steht bewusst NICHT hier. Es bekommt keinen Link, und ob es die
-- Seite ueberhaupt sieht, ist eine eigene Frage, die diese Migration nicht
-- entscheidet.
-- ===========================================================================

INSERT INTO public.role_permissions (role, url) VALUES
  ('vertriebsleiter', '/steuerrechner')
ON CONFLICT DO NOTHING;
