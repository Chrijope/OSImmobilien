# Backup & Restore – MOREImmo CRM

Stand: 2026-05. Verantwortlich: Inhaber / IT-Admin.

## Backup-Strategie (aktiv)

- **Quelle**: Supabase Postgres (EU-Frankfurt), alle `public.*`-Tabellen
- **Job**: `pg_cron` täglich 03:00 UTC → schreibt JSON-Dumps in Storage-Bucket `backups`
- **Retention**: 30 Tage rollierend (älter als 30d wird automatisch gelöscht)
- **Format**: Eine `.json.gz`-Datei pro Tabelle, gruppiert in `backups/YYYY-MM-DD/`
- **Zusätzlich**: Supabase PITR (Point-in-Time-Recovery) der letzten 7 Tage über das Lovable Cloud Backend

## Restore-Verfahren

### A) Punktuelle Wiederherstellung einzelner Datensätze

1. Im Cloud Backend → Storage → Bucket `backups` → gewünschten Tag öffnen
2. JSON der betroffenen Tabelle herunterladen
3. Datensatz lokal extrahieren (z. B. via `jq '.[] | select(.id=="<uuid>")'`)
4. Über das Cloud Backend Tabellen-Editor neu einfügen oder per SQL-Editor:
   ```sql
   INSERT INTO public.kontakte (id, vorname, nachname, email, ...)
   VALUES ('...');
   ```
5. Audit-Log-Eintrag erzeugen (`log_audit_event('restore', 'kontakte', '<id>')`)

### B) Vollständiger Restore einer Tabelle

1. Tabelle leeren oder umbenennen (NIE produktiv ohne Snapshot!)
2. JSON-Dump in temporäre Tabelle laden
3. Mit `INSERT … SELECT` zurückspielen

### C) PITR-Restore (Disaster Recovery)

Nur über Lovable Cloud Support möglich. Vorgehen:

1. Inhaber meldet Vorfall an Support
2. Wunsch-Zeitpunkt nennen (ISO-8601, max. 7 Tage zurück)
3. Support stellt eine **Zweit-Datenbank** auf den Zeitpunkt bereit
4. Daten aus Zweit-DB punktuell zurückkopieren (per `pg_dump` / Tabellen-Diff)

## Test-Plan (quartalsweise)

Verantwortlich: IT-Admin. Dauer: ca. 30 min.

1. **Letzten Backup-Lauf prüfen**
   - SQL: `SELECT MAX(created_at) FROM storage.objects WHERE bucket_id='backups';`
   - Soll: < 36h alt
2. **Sample-Restore (Dummy-Tabelle)**
   - Tabelle `kontakte` als JSON ziehen, in `kontakte_restore_test` einlesen
   - Row-Count vergleichen
   - `kontakte_restore_test` danach droppen
3. **Audit-Log-Eintrag erzeugen**
   - `action='backup_test'`, `meta={ tag, row_count, ok }`
4. **Ergebnis dokumentieren**
   - In Helpdesk-Ticket-Kategorie "Backup-Test" eintragen

## Notfall-Kontakte

- Inhaber: siehe Profil
- Lovable Cloud Support: support@lovable.dev
- Datenschutzbeauftragte:r: siehe Impressum

## Was NIEMALS getan werden darf

- ❌ Direktes `DELETE FROM kontakte` ohne vorherigen Snapshot
- ❌ `TRUNCATE` auf prod-Tabellen
- ❌ Restore-JSONs in produktive Tabellen ohne Trockenlauf in `*_restore_test`
- ❌ Service-Role-Key in Frontend-Code
