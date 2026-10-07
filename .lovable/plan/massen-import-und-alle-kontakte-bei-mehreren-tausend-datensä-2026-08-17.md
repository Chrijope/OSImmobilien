# Massen-Import und "Alle Kontakte" bei mehreren Tausend Datensätzen

## Ausgangslage (gemessen)

- Tabelle `kontakte`: 6.215 Zeilen gesamt, davon nur 160 aktiv, der Rest gelöscht (Papierkorb-Leichen aus früheren Importen).
- Der Import schreibt heute **eine Zeile pro Netzwerk-Anfruf** in einer `for`-Schleife (`ImportExportButton.tsx`), zusätzlich pro Zeile ggf. ein Investment. Bei 5.000 Zeilen sind das über 5.000 Roundtrips, das dauert je nach Latenz 15 bis 40 Minuten und bricht beim Tab-Wechsel oder Reload komplett ab. Zwischenstand geht verloren, Doppel-Import ist dann wahrscheinlich.
- `addKontakt` berechnet die `moreId` aus dem Cache (`max + 1`). In einer Schleife über tausende Zeilen ist das O(n²) und bei parallelem Import kollidiert es.
- Der Cache lädt `kontakte` mit `limit(5000)` in einem Rutsch, sortiert nach `erstellt_am` absteigend. Ab 5.000 aktiven Kontakten fehlen die ältesten still im Frontend, und zwar überall (Alle Kontakte, Pipeline, Suche).
- "Alle Kontakte" filtert und sortiert komplett im Browser über das Cache-Array und rendert dann seitenweise. Das Rendern ist nicht das Problem, das Laden ist es.

## Empfehlung: kein "unbegrenzt in einem Rutsch", sondern Chunk-Import mit Fortschritt

Ein einziger Riesen-Upload ohne Grenze ist die schlechteste Variante: Browser-Timeout, kein Fortschritt, kein Wiederaufsetzen. Richtig ist eine **Stapelverarbeitung in Blöcken von 500 Zeilen**, aber unsichtbar für den Nutzer: Er lädt eine Datei mit 10.000 Zeilen hoch, das System zerlegt sie selbst und arbeitet sie Block für Block ab. Der Nutzer muss die Datei also **nicht** manuell splitten.

### Import-Umbau

1. **Bulk-Insert statt Einzel-Insert**: pro Block ein `insert([...500 Zeilen])`. Aus 10.000 Anfragen werden 20. Laufzeit sinkt von Minuten auf Sekunden.
2. **`moreId` in die Datenbank verlagern**: Sequenz plus Default statt Berechnung im Browser. Ohne das ist ein Bulk-Insert nicht kollisionsfrei.
3. **Fortschrittsanzeige**: "Block 4 von 20, 2.000 von 10.000 Kontakten angelegt", Abbrechen-Knopf, Warnung vor dem Schließen des Tabs.
4. **Vorprüfung vor dem ersten Schreiben**: Datei parsen, Kopfzeilen zuordnen, Zeilen ohne Namen zählen, Dubletten gegen E-Mail und Telefonnummer prüfen, dann eine Zusammenfassung zeigen ("9.840 werden angelegt, 120 Dubletten übersprungen, 40 Zeilen ohne Namen"). Erst dann schreiben.
5. **Idempotenz**: Die bereits vorhandene `importBatchId` pro Datei behalten und zusätzlich pro Zeile einen Hash aus E-Mail plus Telefon speichern. Ein zweiter Upload derselben Datei legt dann nichts doppelt an, und ein abgebrochener Lauf kann sauber fortgesetzt werden.
6. **Rückgängig**: Über die `importBatchId` einen "Import zurücknehmen"-Knopf, der den gesamten Stapel in den Papierkorb legt. Bei 10.000 Zeilen ist das die wichtigste Sicherheitsleine.
7. **Investment-Anlage nicht pro Zeile einzeln**: nach dem Insert einmal gesammelt für die betroffenen Stufen, ebenfalls als Bulk.
8. **Obergrenze pro Datei**: 25.000 Zeilen, darüber Hinweis "bitte Datei teilen". Das ist keine technische Grenze, sondern ein Schutz vor versehentlichen Fehl-Uploads.

### Worauf zusätzlich zu achten ist

- **Zeichensatz und Trennzeichen**: BOM, Semikolon versus Komma, Excel-Export mit `sep=`. Ist teilweise da, wird bei der Vorprüfung erweitert.
- **Telefonnummern normalisieren** (`normalizeTelefon` existiert), sonst greift die Dublettenprüfung nicht.
- **Zuständigkeit**: Bei 10.000 Leads muss beim Import festgelegt werden, wer sie bekommt (ein Partner, Round-Robin über mehrere, oder Pool ohne Zuständigen). Sonst landen alle beim Hochladenden.
- **Keine Massen-Mails auslösen**: sicherstellen, dass der Import keine Zuweisungs-Mails, Benachrichtigungen oder Follow-up-Automatik pro Zeile feuert.
- **Realtime**: Während eines Bulk-Imports das Realtime-Abo für `kontakte` kurz pausieren, sonst feuert es 10.000 Einzel-Events und friert die Oberfläche ein. Danach einmal neu laden.
- **DSGVO**: Herkunft und Einwilligung pro Import-Stapel dokumentieren (Feld im Import-Dialog, wird in `meta` abgelegt).

## "Alle Kontakte" bei mehreren Tausend Datensätzen

Das ist ein getrenntes Problem und muss mit dem Import zusammen gelöst werden, sonst importiert man erfolgreich Daten, die anschließend niemand sieht.

1. **Papierkorb-Altlast bereinigen**: 6.055 gelöschte Zeilen liegen in der Tabelle. Sie sind schon aus dem Cache-Filter ausgeschlossen, belasten aber Abfragen. Endgültig löschen nach Ablauf der 90-Tage-Frist.
2. **Seitenweises Nachladen statt einem `limit(5000)`**: Der Cache holt `kontakte` in Blöcken von 1.000 über `range()`, bis alles da ist. Die erste Seite ist damit sofort sichtbar, der Rest fließt im Hintergrund nach. Das hebt die stille Grenze bei 5.000 auf.
3. **Schmalere Spaltenauswahl für die Liste**: Statt `select("*")` inklusive großem `meta`-Feld nur die Felder laden, die Liste und Filter brauchen. Das Detailprofil lädt seinen Datensatz weiterhin vollständig. Das ist der größte Hebel: die 16 MB Tabelle schrumpft für den Listenaufruf auf einen Bruchteil.
4. **Sofort-Anzeige**: Die Tabelle rendert die erste Seite, sobald der erste Block da ist, mit einer dezenten Zeile "lade weitere Kontakte". Kein Skeleton über den vollen Ladevorgang.
5. **Datenbank-Indizes** auf `geloescht`, `erstellt_am`, `zustaendig_id` und den Suchfeldern, damit RLS-gefilterte Abfragen bei 50.000 Zeilen nicht einbrechen.
6. **Ab etwa 20.000 Kontakten** reicht der Cache-Ansatz nicht mehr; dann werden Suche, Filter und Sortierung serverseitig ausgeführt und nur die sichtbare Seite geladen. Das ist Ausbaustufe 2 und wird jetzt nur vorbereitet, nicht gebaut.

## Umsetzung in Schritten

- **Schritt 1 (Grundlage)**: Migration für `moreId`-Sequenz und die Indizes. Muss von dir im SQL-Editor eingespielt werden.
- **Schritt 2 (Anzeige)**: Cache auf seitenweises Nachladen und schmale Spaltenauswahl umstellen. Danach zeigt "Alle Kontakte" verlässlich alles, egal wie viele.
- **Schritt 3 (Import)**: Import-Dialog auf Vorprüfung, Bulk-Insert in 500er-Blöcken, Fortschritt, Abbrechen und Zurücknehmen umbauen.
- **Schritt 4 (Test)**: Testlauf mit 5.000 Zeilen gegen Testdaten, Laufzeit messen, danach aufräumen.

## Antwort auf deine Frage in einem Satz

Der Nutzer soll **eine** Datei beliebiger Größe hochladen können, das System verarbeitet sie intern in 500er-Blöcken. Eine erzwungene manuelle Aufteilung auf 500er-Dateien ist nicht nötig und wäre nur eine Zumutung.
