---
name: SLA Inaktivitäts-Matrix
description: Rollenbasierte SLA-Thresholds für vernachlässigte Leads — RPC get_sla_violations + Dashboard-Card + tägliche Bell-Nudges
type: feature
---

**RPC:** `get_sla_violations(p_user_id uuid)` (SECURITY DEFINER)
- Liest höchste Rolle aus `user_roles`, holt Thresholds aus `get_sla_thresholds(role)`.
- Last-Activity = GREATEST(kontakte.aktualisiert_am, MAX aktivitaeten.datum, MAX follow_ups, MAX kommunikation.erstellt_am).
- Filtert: zustaendig_id = user, NOT archiviert/geloescht, pipelineStufe ∉ {verloren, faelligkeit, notar, finanzierung}.
- Returns: kontakt_id, vorname, nachname, pipeline_stufe, last_activity, days_inactive, severity (orange/rot/gruen), reason.

**Thresholds (orange/rot Tage):**
- setterin: 1/2
- juniorpartner: 3/7
- vertriebspartner / vertriebsleiter / admin / inhaber: 7/14
- Versicherungsexperten: separate Logik in `insurance/experten-workflow` (7/14, eigene Trigger)

**UI:** `VernachlaessigteLeadsCard` im Dashboard-Setter-Section, sichtbar für alle 5 Rollen (colSpan 6).

**Cron:** Edge Function `send-sla-inactivity-nudges`, Job `sla-inaktivitaet-taeglich`, täglich 05:30 UTC. Schreibt eine Glocken-Meldung für jeden User mit mindestens einer roten SLA-Verletzung, Dedup pro Tag über den Titel-Filter `%SLA%`.

Der Zeitplan stand bis zum 07.08.2026 in keiner Migration; die hier genannten 08:00 waren eine Absicht, kein Zustand. Seit `20260807170000_eskalationsdienste_zeitplan.sql` ist er versioniert und liegt um 05:30 UTC, also nach `lead-eskalation-check` (05:00), damit die Nudges den frischen Stand sehen.

**Was NICHT dazugehört:**
- Tippgeber-Empfehlungen ohne VP-Status-Update → separater Mechanismus (nicht hier)
- Admin-systemweiter Bonität-Stufe-Drift → existiert separat in Pipeline-Borders