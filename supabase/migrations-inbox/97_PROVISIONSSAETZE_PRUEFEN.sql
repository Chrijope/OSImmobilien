-- ===========================================================================
-- Prueflauf: Welcher Provisionssatz steht an den Investments seit dem
-- 18.08.2026, und welcher wuerde heute gelten?
-- ===========================================================================
--
-- Diese Datei aendert NICHTS. Sie ist eine reine Abfrage und darf beliebig
-- oft laufen.
--
-- WARUM SIE ES GIBT
--
-- Der Trigger `trg_investments_provisionssatz_festschreiben` (Migration
-- 20260818140000) hat vom 18.08.2026 bis zum 09.09.2026 bei jedem Aufruf
-- versagt: Er verglich `k.id::text` mit `investments.kunde_id`, also Text mit
-- uuid, und brach ab. Der Abbruch lief in ein `EXCEPTION WHEN OTHERS`, das
-- nur eine Protokollzeile schrieb. Gemessen am 09.09.2026: 2095 Investments
-- seit dem 18.08.2026, davon 0 mit
-- `meta->>'lockedProvisionRateQuelle' = 'serverseitig'`.
-- Repariert wird das mit 20260909120000_provisionssatz_trigger_reparatur.sql.
--
-- Die Reparatur wirkt aber erst ab dem naechsten Investment. Fuer die sechs
-- Wochen dazwischen bleibt die eigentlich wichtige Frage offen: Es wurde
-- nicht nur nichts geschrieben, es kann auch ein FALSCHER Satz aus dem
-- Browser dastehen. Genau das war der Grund, den Satz ueberhaupt auf den
-- Server zu holen: Wer ein Investment fuer einen fremden Partner anlegte,
-- durfte dessen `user_settings` per RLS nicht lesen, und der Fallback fror
-- still 3 Prozent ein.
--
-- Diese Abfrage stellt den gespeicherten Satz dem gegenueber, den
-- `provisionssatz_fuer_partner` heute fuer den zustaendigen Partner liefern
-- wuerde, und zaehlt die Faelle je Kombination.
--
-- KEINE KORREKTUR
--
-- Hier wird nichts vorgeschlagen und nichts geaendert. Ob und wie
-- Provisionsdaten rueckwirkend angefasst werden, entscheidet GL, und
-- zwar mit Wissen der Buchhaltung. Die Spalte `davon_abgerechnet_oder_zu`
-- steht deshalb mit dabei: In diesen Faellen ist die Provision bereits
-- abgerechnet oder der Vorgang geschlossen, eine stille nachtraegliche
-- Aenderung wuerde die Buchhaltung von den historischen Zahlen wegdrehen.
--
-- Voraussetzung: Die Funktionen aus 20260818140000 und die uuid-Fassung von
-- `investment_partner_id` (20260818150000 oder 20260909120000) stehen in der
-- Datenbank. Fehlt eine, meldet die Abfrage "function does not exist"; dann
-- zuerst die Migrationen ausfuehren.
--
-- Es kommen keine Namen und keine Kundendaten in der Ausgabe vor, nur Saetze
-- und Anzahlen.

WITH basis AS (
  SELECT
    i.id,
    -- Nur echte JSON-Zahlen zaehlen als gespeicherter Satz, wie ueberall
    -- sonst in dieser Kette auch.
    CASE WHEN jsonb_typeof(i.meta -> 'lockedProvisionRate') = 'number'
         THEN (i.meta ->> 'lockedProvisionRate')::numeric END              AS gespeichert,
    i.meta ->> 'lockedProvisionRateQuelle'                                  AS quelle,
    coalesce(i.meta ->> 'pipelineStufe', '')                               AS stufe,
    public.investment_partner_id(i.kunde_id)                               AS partner,
    k.berater                                                              AS berater,
    coalesce(k.meta, '{}'::jsonb)                                          AS kmeta
  FROM public.investments i
  LEFT JOIN public.kontakte k ON k.id = i.kunde_id
  WHERE i.erstellt_am >= timestamptz '2026-08-18 00:00:00+02'
),

-- Eigen oder zugewiesen, genau wie im Trigger und in istEigenKontakt:
-- ein eingetragener Setter bedeutet immer zugewiesen; sonst zaehlt, wer den
-- Kontakt angelegt hat; ohne beides gilt die vorsichtigere Annahme
-- "zugewiesen".
mit_eigen AS (
  SELECT
    b.*,
    CASE
      WHEN nullif(trim(coalesce(b.kmeta ->> 'setter', '')), '') IS NOT NULL
        THEN false
      WHEN nullif(trim(coalesce(b.kmeta ->> 'erstelltVonId', '')), '') IS NOT NULL
        THEN trim(b.kmeta ->> 'erstelltVonId') = b.partner::text
      ELSE
        lower(trim(coalesce(b.kmeta ->> 'erstelltVonName', ''))) <> ''
        AND lower(trim(coalesce(b.berater, ''))) <> ''
        AND lower(trim(coalesce(b.kmeta ->> 'erstelltVonName', '')))
            = lower(trim(coalesce(b.berater, '')))
    END AS eigen
  FROM basis b
),

verglichen AS (
  SELECT
    m.id,
    m.gespeichert,
    m.quelle,
    m.stufe,
    CASE WHEN m.partner IS NULL THEN NULL
         ELSE public.provisionssatz_fuer_partner(m.partner, coalesce(m.eigen, false))
    END AS heute
  FROM mit_eigen m
)

-- to_char statt ::text: sonst stuenden 3 und 3.0 als zwei Zeilen da, obwohl
-- es derselbe Satz ist.
SELECT
  coalesce(to_char(gespeichert, 'FM990.999'), 'kein Wert')  AS gespeicherter_satz,
  coalesce(to_char(heute, 'FM990.999'), 'kein Partner')     AS heutiger_satz,
  CASE
    WHEN heute IS NULL                              THEN 'kein zustaendiger Partner'
    WHEN gespeichert IS NULL                        THEN 'nie festgeschrieben'
    WHEN abs(gespeichert - heute) <= 0.001          THEN 'gleich'
    WHEN gespeichert < heute                        THEN 'gespeichert ist NIEDRIGER'
    ELSE                                                 'gespeichert ist HOEHER'
  END                                               AS bewertung,
  count(*)                                          AS anzahl,
  count(*) FILTER (WHERE stufe IN ('abrechnung', 'abgeschlossen'))
                                                    AS davon_abgerechnet_oder_zu,
  count(*) FILTER (WHERE quelle = 'serverseitig')   AS davon_vom_server
FROM verglichen
GROUP BY 1, 2, 3
ORDER BY anzahl DESC, gespeicherter_satz, heutiger_satz;

-- Dieselbe Menge noch einmal als eine Zeile, damit die Summen der Tabelle
-- darueber nachpruefbar sind. Erwartet wurde am 09.09.2026:
-- investments_gesamt = 2095, vom_server = 0.
SELECT
  count(*)                                                                       AS investments_gesamt,
  count(*) FILTER (WHERE jsonb_typeof(i.meta -> 'lockedProvisionRate') = 'number') AS mit_satz,
  count(*) FILTER (WHERE i.meta ->> 'lockedProvisionRateQuelle' = 'serverseitig')  AS vom_server,
  count(*) FILTER (WHERE i.meta ? 'lockedProvisionRateFehler')                     AS mit_fehlervermerk,
  count(*) FILTER (WHERE coalesce(i.meta ->> 'pipelineStufe', '')
                         IN ('abrechnung', 'abgeschlossen'))                       AS abgerechnet_oder_zu
  FROM public.investments i
 WHERE i.erstellt_am >= timestamptz '2026-08-18 00:00:00+02';
