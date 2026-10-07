# OS Immobilien CRM

Eigenständiges Projekt. Entstanden als Kopie des Aufbaus eines bestehenden
Immobilien-CRM, ohne dessen Historie, Daten, Zugangsdaten und Rechtstexte.
Es hat keine Verbindung zum Ursprungsprojekt.

## Stand

- Frontend: React 18, Vite 5, TypeScript, Tailwind, shadcn/ui.
- Auslieferung: Netlify (netlify.toml). Build `npm run build`, Ordner `dist`.
- Backend: eigenes Supabase-Projekt `irwdgutegmivbtgmftyc` (Datenbank,
  Auth, Storage, Edge Functions), später beim Systemhaus. Werte siehe
  `.env.example`; die `.env` gehört nie ins Repo.
- Platzhalter: `DEIN-MEETING`, `DEIN-KENNCODE` (Weekly Call).
  `DEIN-ANON-KEY` in sieben Zeitplan-Migrationen betrifft nur eine neue,
  leere Datenbank; im Projekt sind diese Migrationen schon eingespielt.

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

## Ablauf bei Änderungen

Frontend und Backend werden getrennt veröffentlicht (anders als bei Lovable):

- Frontend (Netlify): geht bei jedem Push auf `main` automatisch live.
- Backend (Supabase): über die Supabase-GitHub-Integration („Deploy to
  production“). Beim Merge auf `main` spielt Supabase neue Migrationen ein
  und veröffentlicht alle Edge Functions, die in `supabase/config.toml`
  stehen. Neue Function deshalb immer dort eintragen, sonst fehlt sie live.
  Auth-, API-Einstellungen und Secrets kommen nicht mit, die pflegt man im
  Supabase-Dashboard.

Schritte:

1. Lokal testen: `npm run dev`, im Browser `localhost` öffnen. Dazu die
   Prüfungen aus „Arbeitsweise“.
2. Eigenen Branch pushen, nicht direkt `main`. Pull Request öffnen; Netlify
   baut eine Deploy Preview (eigene Test-Adresse), dort testen. Die
   Live-Seite bleibt unberührt.
3. Bei Backend-Änderungen vor dem Merge ein Backup der Datenbank ziehen.
   Im Pull Request die Supabase-Prüfung abwarten, sie muss grün sein.
4. Pull Request nach `main` mergen. Supabase und Netlify veröffentlichen
   gleichzeitig. Neue Spalten deshalb so anlegen, dass die alte Oberfläche
   kurz weiterläuft (erst hinzufügen, später entfernen).

Migrationen nicht mehr von Hand im SQL-Editor ausführen: Supabase merkt sich
nur, was über die Integration lief, und würde sonst doppelt einspielen.

Einmalige Einrichtung: Supabase-Dashboard, Project Settings, Integrations,
GitHub verbinden, Repo `Chrijope/OSImmobilien`, Working directory `.`,
Production branch `main`, „Deploy to production“ an. Netlify braucht die
Umgebungsvariablen aus `.env.example`.

Zurückspringen:

- Frontend sofort: Netlify-Dashboard, Deploys, älteren Stand wählen,
  „Publish deploy“. Ändert keinen Code.
- Frontend dauerhaft: `git revert <commit>` und pushen. Kein Force-Push.
- Datenbank: Migrationen lassen sich nicht per Knopf zurücknehmen. Entweder
  eine neue Migration, die die Änderung umkehrt, oder Backup einspielen
  (Point-in-Time Recovery nur in bezahlten Supabase-Tarifen). Deshalb vor
  jeder Migration ein Backup.

Browser: beliebig (Chrome oder Safari); `localhost` für lokal, die
Netlify-Adresse für Vorschau und Live.
