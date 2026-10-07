# OS Immobilien CRM

Eigenständiges Projekt. Entstanden als Kopie des Aufbaus eines bestehenden
Immobilien-CRM, ohne dessen Historie, Daten, Zugangsdaten und Rechtstexte.
Es hat keine Verbindung zum Ursprungsprojekt.

## Stand

- Frontend: React 18, Vite 5, TypeScript, Tailwind, shadcn/ui.
- Auslieferung: Netlify (netlify.toml). Build `npm run build`, Ordner `dist`.
- Backend: noch nicht verbunden. Vorgesehen ist ein eigenes Supabase
  (Datenbank, Auth, Storage, Edge Functions), später beim Systemhaus.
  Werte siehe `.env.example`; die `.env` gehört nie ins Repo.
- Platzhalter, die beim Verbinden ersetzt werden müssen:
  `DEIN-SUPABASE-PROJEKT`, `DEIN-ANON-KEY` (Migrationen, Zeitpläne,
  supabase/config.toml), `DEIN-MEETING`, `DEIN-KENNCODE` (Weekly Call).

## Noch anzupassen

- Firmenname, Logo, Farben, Texte, Mails, PDFs (heute noch die Inhalte des
  Ursprungsprojekts).
- Rechtstexte, Verträge, Datenschutz, Impressum, AVV: neu erstellen und
  anwaltlich prüfen lassen. `public/dokumente/` ist bewusst leer.
- KI-Funktionen in den Edge Functions nutzen den Lovable AI Gateway
  (LOVABLE_API_KEY); ohne Lovable auf einen anderen Anbieter umstellen.
- Personas unter `.claude/agents` und Texte unter `docs/` stammen aus dem
  Ursprungsprojekt und sind anzupassen oder zu löschen.

## Arbeitsweise

Kommunikation und Code-Kommentare auf Deutsch. Vor einem Push:
`npx tsc -b`, `npm run build`, `npx vitest run`.
