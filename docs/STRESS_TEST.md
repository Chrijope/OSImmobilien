# Stress-Test – MOREImmo CRM

Generiert 5.000 Test-Leads und simuliert ein 50-VP-Setup, um Listen-Pagination,
Pipeline-Performance und Cache-Verhalten zu prüfen.

## Ausführung

```bash
# 1. .env mit Service-Role-Key bereitstellen (NIEMALS committen)
export SUPABASE_URL=https://<projekt>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# 2. Script ausführen
bun run scripts/stress-test-seed.ts
```

## Was passiert

- 50 Pseudo-VP-User werden in `profiles` angelegt (mit `_testData: true`)
- 5.000 Kontakte werden gleichmäßig auf die VPs verteilt
- Pipeline-Stufen werden zufällig gesetzt (gewichtet realistisch)
- Alle Datensätze tragen `meta._testData = true` → können sauber aufgeräumt werden

## Aufräumen

```sql
-- ALLE Test-Daten in einem Rutsch löschen
DELETE FROM public.kontakte WHERE (meta ->> '_testData')::boolean = true;
DELETE FROM public.profiles WHERE name LIKE 'TestVP-%';
```

## Erwartete Ergebnisse

| Aktion | Soll-Zeit |
|--------|-----------|
| Lead-Liste laden (50 pro Seite) | < 1.5s |
| Pipeline-Board rendern | < 2s |
| Kunden-Detail öffnen | < 1s |
| Filter setzen | < 500ms |

Werte über diesen Grenzen → Performance-Audit notwendig.
