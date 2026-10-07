-- ===========================================================================
-- Die Tabelle benachrichtigungen bekommt die Spalte meta
-- ===========================================================================
--
-- WARUM
--
-- `src/lib/notificationStore.ts` legt seit jeher Benachrichtigungen mit einem
-- Feld `meta` an (Funktion `toDb`). Darin steht, um welche Art es sich handelt
-- (`notif_type`) und woran sie haengt: Kunde, Investment, Kontakt, Chat, dazu
-- die vollstaendige Nutzlast. Der Lesepfad `fromDbByType` filtert genau nach
-- `meta.notif_type`.
--
-- Die Spalte gab es nie. PostgREST lehnte deshalb jedes Einfuegen ab:
--   Could not find the 'meta' column of 'benachrichtigungen' in the schema cache
--
-- Anders als beim `_ts`-Fehler vom 15.09.2026 wurde dieser Fehler nicht
-- verschluckt: `cacheInsert` zeigt ohne `silent` einen roten Hinweis und wirft
-- danach weiter. Ein Vertriebspartner sah beim Anfordern der Unterschrift auf
-- der Reservierungsseite also eine Fehlermeldung, obwohl die Reservierung
-- selbst in Ordnung war. Gemeldet am 16.09.2026 von Philipp Pintat.
--
-- Betroffen sind fuenf Arten von Benachrichtigungen, die es damit bis heute
-- nie in die Datenbank geschafft haben: Erwaehnungen im Chat, Praemien,
-- Loeschanfragen, Dokumentenstand am Investment und neue Leads aus dem
-- Analysetool.
--
-- Bewusst `jsonb` und nicht `json`: es wird gefiltert, nicht nur gelesen.
-- Der Index ist ein GIN-Index auf die ganze Spalte, weil der Lesepfad auf
-- `meta->>'notif_type'` filtert und spaeter auch auf Kunde und Investment.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================

ALTER TABLE public.benachrichtigungen
  ADD COLUMN IF NOT EXISTS meta jsonb;

COMMENT ON COLUMN public.benachrichtigungen.meta IS
  'Strukturierte Zusatzangaben der Benachrichtigung: notif_type (mention, prize, delete_request, doc, analyse_lead) sowie kundeId, investmentId, kontaktId, chatId und die vollstaendige Nutzlast. Gesetzt von src/lib/notificationStore.ts.';

CREATE INDEX IF NOT EXISTS idx_benachrichtigungen_meta
  ON public.benachrichtigungen USING gin (meta);

-- Prueflauf: Gibt es die Spalte jetzt?
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'benachrichtigungen'
--      and column_name = 'meta';
