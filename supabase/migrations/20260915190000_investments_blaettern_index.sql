-- ===========================================================================
-- Index fuer das blockweise Laden der Investments
-- ===========================================================================
--
-- `src/lib/dataCache.ts` holt `investments` wie `kontakte` in Bloecken von
-- 1000 Zeilen. Bis zum 15.09.2026 fehlte der Tabelle ein Eintrag in
-- `SORTIERSPALTE`, das Blaettern lief also ohne ORDER BY. Ohne Sortierung
-- garantiert Postgres zwischen zwei Bloecken keine feste Reihenfolge: Eine
-- Zeile kann in zwei Bloecken auftauchen oder ganz durchfallen. Der Cache
-- sortiert jetzt nach `erstellt_am DESC NULLS LAST, id DESC`, genau wie bei
-- den Kontakten.
--
-- Damit diese Sortierung nicht bei jedem Block die ganze Tabelle neu ordnet,
-- braucht sie denselben passenden Index wie `kontakte` seit 20260915140000.
-- Richtung und NULL-Lage muessen exakt zur Abfrage passen, sonst nutzt der
-- Planer den Index nicht.
--
-- Wiederholt ausfuehrbar. Sperrt die Tabelle waehrend des Aufbaus kurz gegen
-- Schreibzugriffe, Lesen bleibt moeglich; bei den heutigen Groessen Sekunden.
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_investments_erstellt_id_desc
  ON public.investments (erstellt_am DESC NULLS LAST, id DESC);

-- Pruefung (aendert nichts). Im Plan muss
-- "Index Scan using idx_investments_erstellt_id_desc" stehen und kein "Sort":
--
--   explain (analyze, buffers)
--   select * from public.investments
--   order by erstellt_am desc nulls last, id desc
--   offset 1000 limit 1000;
