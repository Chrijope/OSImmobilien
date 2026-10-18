-- ===========================================================================
-- Sidebar-Freigaben je Rolle (Christian, 18.10.2026)
-- ===========================================================================
--
-- WARUM
--
--   Christian ist die Sichtbarkeit der Seitenleiste Rolle für Rolle
--   durchgegangen. Ergänzt werden:
--     Kalender           für alle internen Rollen (kein Entwurf mehr)
--     Alle Kontakte,
--     Auswertungen,
--     Wettbewerb, Kultur für die Buchhaltung
--     Investmentkalkulation, Kultur,
--     Teampartner        für das Backoffice (Nutzerverwaltung bewusst nicht)
--     Kultur             für Vertriebspartner und Vertriebsleitung
--     Objekte            für die Hausverwaltung (nur ansehen)
--
--   Teampartner und Objekte tragen zusätzlich den
--   Admin-Riegel mit `auchFuer` in src/lib/sidebarNavigation.ts; dort sind
--   die Rollen ebenfalls ergänzt. Die Pflege der Objekte bleibt bei Admin,
--   Inhaber und Objektpartner (`objektbereichGesperrt`).
--
--   „Nur lesend“ für die Buchhaltung in Kontakten ist NICHT Teil dieser
--   Migration. Die Buchhaltung hat seit 20260916190000 vollen Zugriff auf
--   Kontakte, das bleibt hier unverändert.
--
-- WAS DIESE MIGRATION TUT
--
--   Nur Zeilen in `role_permissions` hinzufügen. Ändert keine anderen Daten,
--   keine Function auszurollen, Reihenfolge egal, wiederholbar.
-- ===========================================================================

INSERT INTO public.role_permissions (role, url) VALUES
  ('vertriebsleiter',      '/kalender'),
  ('vertriebspartner',     '/kalender'),
  ('buchhaltung',          '/kalender'),
  ('backoffice',           '/kalender'),
  ('hr',                   '/kalender'),
  ('objektpartner',        '/kalender'),
  ('finanzierungspartner', '/kalender'),
  ('hausverwaltung',       '/kalender'),
  ('setterin',             '/kalender'),
  ('versicherungsexperte', '/kalender'),
  ('marketing',            '/kalender'),
  ('individuell',          '/kalender'),

  ('buchhaltung',          '/alle-kontakte'),
  ('buchhaltung',          '/auswertungen'),
  ('buchhaltung',          '/wettbewerb'),
  ('buchhaltung',          '/kultur'),

  ('backoffice',           '/investmentrechner'),
  ('backoffice',           '/kultur'),
  ('backoffice',           '/teampartner'),

  ('vertriebspartner',     '/kultur'),
  ('vertriebsleiter',      '/kultur'),

  ('hausverwaltung',       '/objekte')
ON CONFLICT DO NOTHING;
