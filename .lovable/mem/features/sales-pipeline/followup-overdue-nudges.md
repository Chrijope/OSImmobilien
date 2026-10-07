---
name: Follow-Up Overdue Nudges
description: Täglicher Cron meldet überfällige Follow-Ups an den Zuständigen, ab drei Tagen zusätzlich an dessen Führung
type: feature
---
Täglicher Cron `followup-overdue-nudges-daily` (06:00 UTC, seit
`20260807170000_eskalationsdienste_zeitplan.sql`) ruft die Edge Function
`send-followup-overdue-nudges`:

- Liest `follow_ups` mit `status='offen'` und `faellig_am < heute`
- Überspringt Kontakte mit verloren/archiviert oder `pipelineStufe='verloren'`
- Überspringt, wenn `kontakt.meta.lastFollowupNudgeAt` schon von heute ist
  (höchstens ein Hinweis je Lead und Tag)
- Glocken-Meldung an `follow_ups.benutzer_id`, ersatzweise `kontakt.zustaendig_id`
- Setzt `lastFollowupNudgeAt` über `merge_kontakt_meta`
- **Eskalation:** ab drei Tagen Überfälligkeit und ohne vorhandenes
  `meta.followupEscalatedAt` zusätzlich eine Meldung an die Aufsicht über den
  Zuständigen (`public.aufsicht_ueber`: Inhaber, Administratoren und die
  eigenen Vertriebsleiter), mit Kundenname und Betreuername. Danach wird
  `followupEscalatedAt` gesetzt, die Meldung geht also nur einmal hinaus.

Zur Historie: Die Eskalation war zwischenzeitlich ausgebaut (Rundruf an alle
Admin/Inhaber/Vertriebsleiter, entfernt wegen der Inbox-Ownership-Regel). Die
Variable `escalations` blieb im Code stehen und lieferte konstant null,
während diese Datei weiter behauptete, es gäbe die Eskalation. Seit dem
07.08.2026 gibt es sie wieder, aber gezielt an die Aufsicht statt als Rundruf.

Fällt die Team-Zuordnung aus, weil `20260807160000_team_zuordnung.sql` noch
nicht gelaufen ist, bleibt die Eskalation aus und die Antwort meldet
`fuehrungErreichbar: false`. Der Hinweis an den Zuständigen läuft weiter.

Dashboard-Kachel `UeberfaelligeFollowUpsCard` für
setterin/vertriebspartner/vertriebsleiter/admin/inhaber: zählt eigene
überfällige und heute fällige Follow-Ups, zeigt die ersten drei mit Sprung
nach `/kunden/:id`.
