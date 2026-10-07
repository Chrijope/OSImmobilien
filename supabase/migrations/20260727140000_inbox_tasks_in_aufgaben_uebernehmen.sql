-- Bestehende Aufgaben aus den persönlichen Einstellungen in die Tabelle holen.
--
-- Aufgaben lagen bisher als JSON-Liste in `user_settings.einstellungen.inbox_tasks`,
-- also ausschließlich beim Nutzer, der sie angelegt hat. Neue Aufgaben gehen
-- seit der letzten Änderung in die Tabelle `aufgaben`. Die alten liegen aber
-- weiterhin im JSON und sind für Kollegen unsichtbar, weshalb die
-- Pipeline-Kachel eines Kunden den Termin eines Kollegen nicht kennt.
--
-- Diese Migration übernimmt jeden Eintrag mit gültigem Kundenbezug einmalig in
-- die Tabelle. Der Auslöser-Schlüssel merkt sich die alte ID, ein zweiter Lauf
-- legt deshalb nichts doppelt an. Die JSON-Liste bleibt unangetastet, damit
-- nichts verloren geht, falls etwas nachzuprüfen ist.

INSERT INTO public.aufgaben (
  benutzer_id,
  zugewiesen_an,
  kontakt_id,
  typ,
  prioritaet,
  status,
  titel,
  beschreibung,
  faellig_am,
  uhrzeit,
  ausloeser_schluessel,
  erstellt_am
)
SELECT
  us.user_id,
  us.user_id,
  (t->>'kundeId')::uuid,
  COALESCE(NULLIF(t->>'typ', ''), 'aufgabe')::public.aufgabe_typ,
  COALESCE(NULLIF(t->>'prioritaet', ''), 'mittel')::public.aufgabe_prioritaet,
  CASE
    WHEN us.einstellungen->'inbox_done_ids' @> to_jsonb(t->>'id')
      THEN 'erledigt'
    ELSE 'offen'
  END::public.aufgabe_status,
  COALESCE(NULLIF(t->>'titel', ''), 'Aufgabe'),
  NULLIF(t->>'beschreibung', ''),
  -- Datum kommt als YYYY-MM-DD oder als voller Zeitstempel. Alles, was sich
  -- nicht lesen lässt, bleibt leer statt die Migration abzubrechen.
  CASE
    WHEN t->>'faellig_am' ~ '^\d{4}-\d{2}-\d{2}'
      THEN (substring(t->>'faellig_am' from 1 for 10))::timestamptz
    ELSE NULL
  END,
  CASE
    WHEN t->>'uhrzeit' ~ '^\d{1,2}:\d{2}'
      THEN (substring(t->>'uhrzeit' from 1 for 5))::time
    ELSE NULL
  END,
  'migriert:' || (t->>'id'),
  now()
FROM public.user_settings us
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(us.einstellungen->'inbox_tasks') = 'array'
      THEN us.einstellungen->'inbox_tasks'
    ELSE '[]'::jsonb
  END
) AS t
WHERE
  -- Nur Einträge mit echtem Kundenbezug. Ohne Kunden hätte die Aufgabe in der
  -- Pipeline ohnehin keinen Platz.
  t->>'kundeId' ~ '^[0-9a-fA-F-]{36}$'
  AND EXISTS (SELECT 1 FROM public.kontakte k WHERE k.id = (t->>'kundeId')::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM public.aufgaben a
    WHERE a.ausloeser_schluessel = 'migriert:' || (t->>'id')
  );

-- Kontrolle: Wie viele Aufgaben hängen jetzt an Kunden?
-- SELECT count(*) FROM public.aufgaben WHERE kontakt_id IS NOT NULL;
