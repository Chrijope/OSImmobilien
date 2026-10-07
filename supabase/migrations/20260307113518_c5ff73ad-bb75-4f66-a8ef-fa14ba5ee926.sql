
-- Seed categories
INSERT INTO public.unterlagen_kategorien (name, reihenfolge, typ) VALUES
  ('Präsentation', 1, 'kategorie'),
  ('Bonitätsunterlagen', 2, 'kategorie'),
  ('Beratung / Abschluss', 3, 'kategorie'),
  ('After Sales', 4, 'kategorie'),
  ('Steuerliche Themen', 5, 'kategorie'),
  ('Wissenswert', 6, 'kategorie'),
  ('Karriere', 7, 'kategorie'),
  ('Teamaufbau', 8, 'kategorie'),
  ('Organisation', 9, 'kategorie'),
  ('Marketing', 10, 'kategorie'),
  ('Vorlagen & Leitfäden', 11, 'kategorie');

-- Präsentation
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('WOHNWERT Präsentation kurz (Keynote)', 1, 'keynote'),
  ('WOHNWERT Präsentation kurz (PDF)', 2, 'pdf'),
  ('WOHNWERT Präsentation mittel (Keynote)', 3, 'keynote'),
  ('WOHNWERT Präsentation mittel (PDF)', 4, 'pdf'),
  ('WOHNWERT Präsentation lang (Keynote)', 5, 'keynote'),
  ('WOHNWERT Präsentation lang (PDF)', 6, 'pdf'),
  ('WOHNWERT Konzeptpräsentation Sprechskript (kurz bis lang)', 7, 'pdf'),
  ('Hintergründe Wohnwert', 8, 'pdf'),
  ('Hintergründe Immosales', 9, 'pdf')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Präsentation' LIMIT 1) k;

-- Bonitätsunterlagen
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Checkliste „WOHNWERT"', 1, 'pdf'),
  ('Checkliste „Bankprüfung"', 2, 'pdf'),
  ('Selbstauskunft', 3, 'pdf'),
  ('Schufa-Bestellung', 4, 'pdf'),
  ('Mietfreibestätigung', 5, 'pdf'),
  ('Negativ-Erklärung Steuer', 6, 'pdf'),
  ('Vollmacht für Objekteigentümer', 7, 'pdf'),
  ('Aufstellung Immobilienvermögen', 8, 'pdf'),
  ('Haushaltsrechner (BoniTool)', 9, 'tool')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Bonitätsunterlagen' LIMIT 1) k;

-- Beratung / Abschluss
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Beispielberechnung (NUMBERS)', 1, 'numbers'),
  ('Immobilienkalkulator (NUMBERS)', 2, 'numbers'),
  ('WOHNWERT Immorechner', 3, 'tool'),
  ('AfA Erklärvideo', 4, 'video'),
  ('Lohnsteueroptimierung (Video)', 5, 'video'),
  ('Ehegattenschaukel & Verkauf Eltern an Kinder (Video)', 6, 'video')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Beratung / Abschluss' LIMIT 1) k;

-- After Sales
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Steuerwissen kompakt', 1, 'pdf'),
  ('Steuersätze nach Einkommenshöhe', 2, 'pdf'),
  ('Zusammenfassung - Checkliste für die maximale Steuerersparnis', 3, 'pdf'),
  ('Senkung der Lohnsteuer in Elster (Video)', 4, 'video')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'After Sales' LIMIT 1) k;

-- Steuerliche Themen
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Steuerliche Grundlagen', 1, 'pdf')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Steuerliche Themen' LIMIT 1) k;

-- Wissenswert
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Abschreibung Allgemein', 1, 'pdf'),
  ('Abschreibung bei Renovierung', 2, 'pdf'),
  ('Entwicklung der Immobilienpreise während Corona', 3, 'pdf'),
  ('Grundbuch', 4, 'pdf'),
  ('Hier lohnt sich der Immobilienkauf', 5, 'pdf'),
  ('Immobilie als Altersvorsorge', 6, 'pdf'),
  ('Immobilien vs Aktien', 7, 'pdf'),
  ('Immobilienpreise steigen trotz Corona', 8, 'pdf'),
  ('Inflation', 9, 'pdf'),
  ('Kaufpreisentwicklung bis 2030', 10, 'pdf'),
  ('Kaufpreisentwicklung ländliche Gegenden', 11, 'pdf'),
  ('Ländliche Gegenden & der Wohnungsmangel', 12, 'pdf'),
  ('Renditeerwartung', 13, 'pdf'),
  ('Vergleich Immobilien, Aktien, Gold, Bargeld', 14, 'pdf'),
  ('Wohnungsmangel Bedarfsdeckung', 15, 'pdf')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Wissenswert' LIMIT 1) k;

-- Karriere
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('WOHNWERT Vertriebs- & Karriereplan', 1, 'pdf'),
  ('WOHNWERT Assistenten Vertrag (Blanko)', 2, 'pdf'),
  ('WOHNWERT VP-Vertrag (Blanko)', 3, 'pdf'),
  ('VP-AGB', 4, 'pdf'),
  ('Karriereantrag (Neueinstufung/Beförderung)', 5, 'pdf'),
  ('Zielplanung (Vorlage, Pages)', 6, 'pages'),
  ('Antrag auf Sonderleistungen', 7, 'pdf')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Karriere' LIMIT 1) k;

-- Teamaufbau
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Vertriebsleitung Startergespräch', 1, 'pdf'),
  ('Vertriebsleitung Follow-up-Gespräch', 2, 'pdf'),
  ('Vertriebsleitung Halbjahres-/Jahres-Gespräch', 3, 'pdf')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Teamaufbau' LIMIT 1) k;

-- Organisation
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Kunden- & Umsatzliste (NUMBERS)', 1, 'numbers'),
  ('E-Mail-Signatur (Vorlage, Word)', 2, 'word'),
  ('WOHNWERT Logo (PSD)', 3, 'psd'),
  ('WOHNWERT Logo Screen', 4, 'image'),
  ('Gesprächsprotokoll', 5, 'pdf'),
  ('Anmeldung E-Mail-Postfach', 6, 'pdf'),
  ('Rechnungsvorlage (Pages)', 7, 'pages'),
  ('Rechnungsvorlage (Word)', 8, 'word')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Organisation' LIMIT 1) k;

-- Marketing
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Social Media Management Antrag (Coming Soon)', 1, 'pdf'),
  ('Antrag auf eigenes Marketing (Coming Soon)', 2, 'pdf')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Marketing' LIMIT 1) k;

-- Vorlagen & Leitfäden
INSERT INTO public.unterlagen_dokumente (kategorie_id, name, reihenfolge, dateityp)
SELECT k.id, d.name, d.reihenfolge, d.dateityp
FROM (VALUES
  ('Leitfaden für Neukunden Anwerbung/Akquise', 1, 'pdf'),
  ('Leitfaden für Immosales-Partner Anwerbung/Akquise', 2, 'pdf')
) AS d(name, reihenfolge, dateityp)
CROSS JOIN (SELECT id FROM public.unterlagen_kategorien WHERE name = 'Vorlagen & Leitfäden' LIMIT 1) k;

-- Highlights
INSERT INTO public.unterlagen_highlights (titel, typ, beschreibung, verknuepfung, reihenfolge) VALUES
  ('Konzeptvideo', 'video', 'Festes Einkommen – Vertriebsvideo', null, 1),
  ('Immorechner', 'tool', 'Berechne Deinen Vermögensaufbau mit Immobilien', '/immorechner', 2),
  ('Steuerwissen', 'image', 'Steuern sparen mit Immobilien', 'steuerliche_themen', 3),
  ('Karriereplan', 'image', 'Deine Karriere im Vertrieb', null, 4);
