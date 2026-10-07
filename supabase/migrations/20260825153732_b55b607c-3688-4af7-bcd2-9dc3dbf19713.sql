-- Menuepunkt "Objekte neu" freigeben (Investagon, eingebettet unter /objekte-neu)
--
-- Massgeblich fuer die Sichtbarkeit ist die Tabelle public.role_permissions.
-- Die Konstanten in src/lib/sidebarPermissions.ts sind nur die Rueckfallebene,
-- solange die Datenbank noch nicht geantwortet hat. Ohne diese Zeilen bliebe
-- der Punkt fuer alle ausser Admin und Inhaber unsichtbar.
--
-- Admin und Inhaber brauchen keinen Eintrag, sie stehen in FULL_ACCESS_ROLES.
--
-- Objektpartner und Hausverwaltung sind mit dabei: Beide arbeiten taeglich
-- mit Objekten, ihnen den neuen Zugang zu verwehren waere der eine Fall, in
-- dem der Menuepunkt wirklich fehlen wuerde.
--
-- Der bisherige Menuepunkt "Objekte" wird nicht entzogen. Er ist in der
-- Seitenleiste auf Admin und Inhaber beschraenkt (adminOnly), die Route selbst
-- bleibt erreichbar. Das ist Absicht: Objektdetail, Immorechner, Exposé und
-- Investmentanalyse liegen unter /objekte/... und werden im Vertrieb weiterhin
-- aus Pipeline und Kundenakte heraus geoeffnet.

INSERT INTO public.role_permissions (role, url) VALUES
  ('vertriebsleiter',      '/objekte-neu'),
  ('vertriebspartner',     '/objekte-neu'),
  ('backoffice',           '/objekte-neu'),
  ('finanzierungspartner', '/objekte-neu'),
  ('objektpartner',        '/objekte-neu'),
  ('hausverwaltung',       '/objekte-neu')
ON CONFLICT DO NOTHING;