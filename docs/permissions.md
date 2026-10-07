# Rollen-Berechtigungs-Matrix (Capability Matrix)

Diese Datei ist die menschenlesbare Spiegelung der Tabelle `public.role_permissions`
(siehe Migration `audit_tag3_role_permissions`). Sie wird bei Bedarf manuell aus
`src/lib/sidebarPermissions.ts` regeneriert (Skript folgt) und sollte mit der
Datenbank synchron bleiben.

## Vollzugriff (alle URLs erlaubt)

- `inhaber`
- `admin`
- `individuell`
- `testaccount`

## Rollen mit eingeschränktem URL-Set

| Rolle | Anzahl URLs | Bereich |
| --- | --- | --- |
| buchhaltung | 9 | Inbox, Abrechnungen, Chat, Academy |
| setterin | 14 | Leads, Pipeline, Kunden, Sales-Coach |
| objektpartner | 11 | Eigene Objekte, Rechner, Support |
| kunde | 8 | Kundenportal (`/kunde/*`), Einstellungen |
| tippgeber | 2 | Tippgeber-Portal, Einstellungen |
| vertriebspartner | 50+ | Vertriebs-Vollfeature inkl. Reservierung, Notar, Auswertungen |
| finanzierungspartner | 14 | Abwicklung, Kontakte, Rechner |
| hausverwaltung | 24 | HV-Module (Mieter, Tickets, Betriebskosten, Vermietung) |
| versicherungsexperte | 9 | Verloren-Kunden + Pipeline, Wissenswelt |
| vertriebsleiter | 50+ | Vertrieb + Team + Karriere |
| hr | 11 | Bewerbungen, Karriere, Nutzerverwaltung |
| backoffice | 35 | Kontakte, Abwicklung, Abrechnung, Auswertung |

## Single Source of Truth

Quelle: Tabelle `public.role_permissions` mit Spalten `(role text, url text)`.
- **Frontend:** `src/lib/sidebarPermissions.ts` lädt zur Laufzeit den Cache
  (`role_permissions_v1` in `localStorage`) und prüft URL gegen den Cache.
  Fallback: bestehende Konstanten, damit die App auch offline bootet.
- **Backend:** RLS-Funktion `public.role_has_url(_role, _url)` (security definer)
  kann in Edge Functions / Policies wiederverwendet werden.

## Aktualisierung

1. Berechtigung ändern (Admin-UI folgt) oder direkt in der Tabelle korrigieren.
2. Frontend-Cache wird per Realtime invalidiert (Topic: `role_permissions`).
3. Diese Doku zur Stichtagsdokumentation manuell regenerieren.

## Stichtag

Erstellt: 11.06.2026 (Tag 3 der Audit-Umsetzung).