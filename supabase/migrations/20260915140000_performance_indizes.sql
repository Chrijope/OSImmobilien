-- ===========================================================================
-- Performance, Stufe 2a: fehlende Indizes fuer die Cache-Tabellen
-- ===========================================================================
--
-- Herkunft: Performance_Bericht_2026-09-15.md, Abschnitt 4 ("Indizes fehlen")
-- und Abschnitt 5, Massnahme 5 (OFFSET-Blaettern ueber kontakte sortiert
-- jeden Block neu).
--
-- Was hier passiert
--
-- `src/lib/dataCache.ts` laedt beim Login 44 Tabellen. Fuer acht davon
-- (Tabelle SORTIERSPALTE) sortiert die Funktion `grundabfrage()` absteigend
-- nach einer Zeitspalte und als Zweitsortierung absteigend nach `id`:
--
--     .order(spalte, { ascending: false, nullsFirst: false })
--     .order("id",   { ascending: false })
--
-- Daraus macht PostgREST `ORDER BY spalte DESC NULLS LAST, id DESC`.
-- `kontakte` wird dabei in `ladeTabelle()` in Bloecken von 1000 Zeilen mit
-- OFFSET geblaettert (SEITENWEISE_TABELLEN), die vier grossen Tabellen
-- (GROSSE_TABELLEN) mit LIMIT 20000, der Rest mit LIMIT 5000.
-- Zeilennummern stehen hier bewusst nicht: die Datei wird parallel
-- umgebaut, die Funktionsnamen bleiben. Ohne passenden Index muss Postgres
-- fuer jeden Block die ganze Tabelle lesen und neu sortieren.
--
-- Wichtig zur Sortierrichtung: Ein Index nuetzt der Sortierung nur, wenn
-- Spaltenreihenfolge, Richtung UND die Lage der NULL-Werte exakt passen.
-- Der vorhandene `idx_kontakte_aktiv_erstellt (erstellt_am DESC, id)` aus
-- 20260817131026 hat `NULLS FIRST` (Standard bei DESC) und `id` aufsteigend.
-- Er passt deshalb weder vorwaerts noch rueckwaerts gelesen zu der Abfrage
-- oben. Dasselbe gilt fuer `idx_aktivitaeten_datum (datum)` und
-- `idx_aufgaben_faellig (faellig_am)`. Die neuen Indizes tragen darum
-- ausdruecklich `DESC NULLS LAST, id DESC`.
--
-- Die Sortierindizes sind bewusst nicht auf `geloescht` eingeschraenkt:
-- PostgREST uebergibt Filterwerte als Parameter, und einen Teilindex kann
-- der Planer nur nutzen, wenn er die Bedingung zur Planzeit beweisen kann.
-- Ein vollstaendiger Index passt immer; die geloeschten Zeilen werden beim
-- Lesen uebersprungen.
--
-- Alle Anweisungen sind `IF NOT EXISTS` und damit beliebig oft ausfuehrbar.
-- `CONCURRENTLY` ist im SQL-Editor nicht moeglich (laeuft in einer
-- Transaktion); der Aufbau sperrt die jeweilige Tabelle kurz gegen
-- Schreibzugriffe, Lesen bleibt moeglich. Bei den heutigen Groessen sind das
-- Sekunden. Am besten ausserhalb der Kernarbeitszeit ausfuehren.
--
-- ---------------------------------------------------------------------------
-- VORHER: vorhandene Indizes ansehen (Abfrage aus dem Bericht, Abschnitt 7.4)
-- ---------------------------------------------------------------------------
--
--   select tablename, indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public'
--     and tablename in ('kontakte','aktivitaeten','activity_log',
--                       'chat_nachrichten','kommunikation','follow_ups',
--                       'aufgaben','benachrichtigungen','wohnungen',
--                       'objekt_bilder','objekt_dokumente','wohnungs_bilder',
--                       'wohnungs_dokumente','finanzierungen','bewerbungen',
--                       'investments')
--   order by tablename, indexname;
--
-- ---------------------------------------------------------------------------
-- Bewusst NICHT angelegt (und warum)
-- ---------------------------------------------------------------------------
--
-- investments(kunde_id):    existiert (idx_investments_kunde_id, 20260517094425)
-- investments(status):      keine Datenbankabfrage filtert danach. Frontend
--                           und Edge Functions filtern den Status im
--                           Arbeitsspeicher. Ein Index ohne Abfrage kostet
--                           nur beim Schreiben.
-- aktivitaeten(kunde_id):   existiert als (kunde_id, datum DESC)
--                           (idx_aktivitaeten_kunde_datum, 20260728120000)
-- activity_log(kontakt_id): existiert doppelt (idx_activity_log_kontakt aus
--                           20260707100228 und idx_activity_log_kontakt_zeit
--                           aus 20260728120000, beide (kontakt_id,
--                           created_at DESC)). Nebenbefund, hier nicht
--                           angefasst; einer der beiden kann weg.
-- finanzierungen(kunde_id): Spalte ist UNIQUE (20260314101936), der
--                           Unique-Index deckt `.in("kunde_id", ...)` ab.
-- kommunikation(kontakt_id): Spalte gibt es nicht. Der Kunde steht in
--                           meta->>'kunde_id' und wird in der RLS-Regel als
--                           Funktionsparameter benutzt; ein Ausdrucksindex
--                           wuerde dort nicht greifen.
-- kontakte(geloescht):      Teilindex fuer geloescht = true existiert
--                           (20260427164259). Die Abfrage des Caches will das
--                           Gegenteil, also fast alle Zeilen; dafuer ist kein
--                           Index sinnvoll.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) kontakte: Sortierung des Blockladens
--    Nutzer: src/lib/dataCache.ts, grundabfrage() und ladeTabelle()
--    (range je Block). Jeder der bis zu 60 Bloecke sortiert sonst neu.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kontakte_erstellt_id_desc
  ON public.kontakte (erstellt_am DESC NULLS LAST, id DESC);

-- ---------------------------------------------------------------------------
-- 2) aktivitaeten: Sortierung, LIMIT 20000
--    Nutzer: src/lib/dataCache.ts, SORTIERSPALTE datum, grundabfrage().
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_aktivitaeten_datum_id_desc
  ON public.aktivitaeten (datum DESC NULLS LAST, id DESC);

-- ---------------------------------------------------------------------------
-- 3) activity_log: Sortierung, LIMIT 20000
--    Nutzer: src/lib/dataCache.ts, SORTIERSPALTE created_at, grundabfrage().
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_activity_log_created_id_desc
  ON public.activity_log (created_at DESC NULLS LAST, id DESC);

-- ---------------------------------------------------------------------------
-- 4) chat_nachrichten: Sortierung, LIMIT 20000
--    Nutzer: src/lib/dataCache.ts, SORTIERSPALTE gesendet_am, grundabfrage().
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_nachrichten_gesendet_id_desc
  ON public.chat_nachrichten (gesendet_am DESC NULLS LAST, id DESC);

-- ---------------------------------------------------------------------------
-- 5) chat_nachrichten: Verlauf eines Chats
--    Nutzer: src/components/chat/ChatVerlauf.tsx Zeile 200
--            (.eq chat_id, .lt gesendet_am, .order gesendet_am desc, limit 50),
--            src/pages/KundeChat.tsx Zeile 126, src/pages/TippgeberPortal.tsx
--            Zeilen 161, 201 und 931, sowie die RLS-Regel "Nutzer sehen
--            Chat-Nachrichten" (chat_id IN (select eigene_chat_ids(...)),
--            20260830120000).
--    Rueckwaerts gelesen deckt derselbe Index auch `ascending: true` ab.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_nachrichten_chat_gesendet
  ON public.chat_nachrichten (chat_id, gesendet_am DESC);

-- ---------------------------------------------------------------------------
-- 6) kommunikation: Sortierung, LIMIT 20000
--    Nutzer: src/lib/dataCache.ts, SORTIERSPALTE erstellt_am, grundabfrage().
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kommunikation_erstellt_id_desc
  ON public.kommunikation (erstellt_am DESC NULLS LAST, id DESC);

-- ---------------------------------------------------------------------------
-- 7) follow_ups: Sortierung, LIMIT 5000 (faellig_am ist TEXT im ISO-Format,
--    die Textsortierung entspricht der Zeitsortierung)
--    Nutzer: src/lib/dataCache.ts, SORTIERSPALTE faellig_am, grundabfrage().
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_follow_ups_faellig_id_desc
  ON public.follow_ups (faellig_am DESC NULLS LAST, id DESC);

-- ---------------------------------------------------------------------------
-- 8) follow_ups: Kunde
--    Nutzer: RLS "Interne sehen FollowUps (scoped)" (20260827230000):
--            follow_ups.kunde_id IN (select ... eigene_kontakt_ids(...)).
--            Fuer Vertriebspartner mit wenigen Kontakten kann der Planer
--            damit ueber die Kontaktmenge in follow_ups springen, statt alle
--            Follow-Ups zu lesen.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_follow_ups_kunde_id
  ON public.follow_ups (kunde_id);

-- ---------------------------------------------------------------------------
-- 9) aufgaben: Sortierung, LIMIT 5000 (Tabelle der ersten Ladewelle)
--    Nutzer: src/lib/dataCache.ts, SORTIERSPALTE faellig_am, grundabfrage().
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_aufgaben_faellig_id_desc
  ON public.aufgaben (faellig_am DESC NULLS LAST, id DESC);

-- ---------------------------------------------------------------------------
-- 10) benachrichtigungen: ungelesene je Nutzer (Glocke, Seitenleiste)
--     Nutzer: src/hooks/useSidebarCounts.ts Zeile 64 und
--             src/components/SidebarRoleSelector.tsx Zeile 85
--             (.eq benutzer_id, .eq gelesen false, count).
--     Der vorhandene idx_benachrichtigungen_benutzer (benutzer_id) bleibt
--     fuer die RLS-Regel benutzer_id = (select auth.uid()) zustaendig.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_benachrichtigungen_benutzer_gelesen
  ON public.benachrichtigungen (benutzer_id, gelesen);

-- ---------------------------------------------------------------------------
-- 11) wohnungen: Objekt (Fremdschluessel ohne Index)
--     Nutzer: src/pages/ObjektDetail.tsx Zeile 167,
--             src/components/objekte/ExposeSection.tsx Zeile 129,
--             src/lib/objekteStore.ts Zeilen 711, 765, 827 (delete je Objekt),
--             supabase/functions/get-expose/index.ts Zeile 26,
--             supabase/functions/investagon-import/index.ts Zeilen 689, 1011,
--             und ON DELETE CASCADE von objekte (jede Objektloeschung sucht
--             sonst alle Wohnungen sequentiell durch).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wohnungen_objekt_id
  ON public.wohnungen (objekt_id);

-- ---------------------------------------------------------------------------
-- 12) objekt_bilder: Objekt (Fremdschluessel ohne Index)
--     Nutzer: src/pages/ObjektDetail.tsx Zeile 261,
--             src/pages/KundenansichtObjekt.tsx Zeile 51,
--             src/lib/objekteStore.ts Zeilen 710, 730, 825,
--             supabase/functions/get-expose/index.ts Zeile 25,
--             supabase/functions/get-objektvorstellung/index.ts Zeile 77,
--             supabase/functions/investagon-import/bilder.ts Zeile 452,
--             und ON DELETE CASCADE von objekte.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_objekt_bilder_objekt_id
  ON public.objekt_bilder (objekt_id);

-- ---------------------------------------------------------------------------
-- 13) objekt_dokumente: Objekt (Fremdschluessel ohne Index)
--     Nutzer: src/pages/ObjektDetail.tsx Zeile 275,
--             src/pages/KundenansichtObjekt.tsx Zeile 52,
--             src/pages/KundenansichtWohnung.tsx Zeile 52,
--             src/lib/objekteStore.ts Zeilen 712, 751, 826,
--             supabase/functions/get-expose/index.ts Zeile 26,
--             supabase/functions/save-expose-pdf/index.ts Zeile 115,
--             und ON DELETE CASCADE von objekte.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_objekt_dokumente_objekt_id
  ON public.objekt_dokumente (objekt_id);

-- ---------------------------------------------------------------------------
-- 14) wohnungs_bilder: Wohnung (Fremdschluessel ohne Index)
--     Nutzer: src/pages/ObjektDetail.tsx Zeile 173 (.in wohnung_id),
--             supabase/functions/investagon-import/bilder.ts Zeile 482,
--             supabase/functions/get-expose/index.ts Zeile 26 (eingebettet
--             ueber wohnungen -> wohnungs_bilder(*)),
--             und ON DELETE CASCADE von wohnungen.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wohnungs_bilder_wohnung_id
  ON public.wohnungs_bilder (wohnung_id);

-- ---------------------------------------------------------------------------
-- 15) wohnungs_dokumente: Wohnung (Fremdschluessel ohne Index, gleiches
--     Muster wie 14)
--     Nutzer: supabase/functions/get-expose/index.ts Zeile 26 (eingebettet
--             ueber wohnungen -> wohnungs_dokumente(*)),
--             und ON DELETE CASCADE von wohnungen.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wohnungs_dokumente_wohnung_id
  ON public.wohnungs_dokumente (wohnung_id);

-- ---------------------------------------------------------------------------
-- 16) bewerbungen: Status
--     Nutzer: src/hooks/useSidebarCounts.ts Zeile 60
--             (count where status = 'eingegangen', bei jedem Laden der
--             Seitenleiste) und
--             supabase/functions/send-bewerber-nachfass/index.ts Zeile 100.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bewerbungen_status
  ON public.bewerbungen (status);


-- ===========================================================================
-- NACHHER: Pruefabfragen (aendern nichts)
-- ===========================================================================
--
-- 1) Sind die 16 Indizes da?
--
--   select tablename, indexname
--   from pg_indexes
--   where schemaname = 'public'
--     and tablename in ('kontakte','aktivitaeten','activity_log',
--                       'chat_nachrichten','kommunikation','follow_ups',
--                       'aufgaben','benachrichtigungen','wohnungen',
--                       'objekt_bilder','objekt_dokumente','wohnungs_bilder',
--                       'wohnungs_dokumente','bewerbungen')
--     and indexname in (
--       'idx_kontakte_erstellt_id_desc','idx_aktivitaeten_datum_id_desc',
--       'idx_activity_log_created_id_desc',
--       'idx_chat_nachrichten_gesendet_id_desc',
--       'idx_chat_nachrichten_chat_gesendet','idx_kommunikation_erstellt_id_desc',
--       'idx_follow_ups_faellig_id_desc','idx_follow_ups_kunde_id',
--       'idx_aufgaben_faellig_id_desc','idx_benachrichtigungen_benutzer_gelesen',
--       'idx_wohnungen_objekt_id','idx_objekt_bilder_objekt_id',
--       'idx_objekt_dokumente_objekt_id','idx_wohnungs_bilder_wohnung_id',
--       'idx_wohnungs_dokumente_wohnung_id','idx_bewerbungen_status')
--   order by tablename, indexname;
--
--   Erwartet: 16 Zeilen.
--
-- 2) Nutzt das Blockladen der Kontakte den neuen Index? Im Plan muss
--    "Index Scan using idx_kontakte_erstellt_id_desc" stehen und KEIN
--    "Sort".
--
--   explain (analyze, buffers)
--   select * from public.kontakte
--   where (geloescht is null or geloescht = false)
--   order by erstellt_am desc nulls last, id desc
--   offset 3000 limit 1000;
--
-- 3) Dasselbe fuer die groesste Tabelle:
--
--   explain (analyze, buffers)
--   select * from public.aktivitaeten
--   order by datum desc nulls last, id desc
--   limit 20000;
