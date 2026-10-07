# Investagon: Korrektur anhand des Live-Diagnoseberichts vom 09.09.2026

## Gesicherter Befund

Quelle: vom Betreiber übergebener, ausschließlich lesender Lovable-Cloud-Bericht.
Die Angaben wurden in dieser Arbeitsumgebung nicht erneut live abgefragt.

- Zugang 3 funktioniert: 43 eindeutige Projekte, 325 eindeutige Wohnungen,
  vollständige Hydra-Sammlung ohne Folgeseite.
- Zugänge 1, 4, 5: 401; Schlüssel und Organisationskennung müssen zusammen geprüft
  werden. Zugang 2: 404; dessen eigene Basisadresse und API-Schema sind ungeklärt.
- Im CRM: 50 Investagon-Objekte/362 Wohnungen. 331 Wohnungen haben keine
  Hauptkennzahlen, 44 Objekte keine Adresse/PLZ; keine importierten Medien.
  Zusätzliche Altobjekte und nicht mehr gelieferte Einheiten bleiben erhalten.
- Vollständige Daten stehen unter `/api/projects/{api_project_id}` und
  `/api/properties/{api_property_id}`. `api_projects`/`api_properties` sind Kurzlisten.
- `photos[].filename` und `files[].filename` enthalten vollständige Adressen.
  Ein Projektfoto wurde von Lovable mit HTTP 200 und image/jpeg geprüft.
  Die geprüften ZIPs enthalten PDF-Dokumente, keine Fotos.
- Projektbeschreibungen kommen als HTML in `wikiPage`.
- Cron ist aktiv, übergibt bislang nur `{sync:true}`. Webhook: keine protokollierten
  Aufrufe. Er wird durch diese Änderung nicht deaktiviert oder umgebaut.

## Umsetzung

1. Vollabrufe mit dokumentierten Feldnamen für Preise, Fläche, Zimmer, Miete,
   Möblierung, Stellplatz und ausgewählte laufende Kosten. Alle weiteren
   Originalfelder bleiben in `meta.investagonRaw` erhalten; diese werden nicht
   ohne fachliche Zuordnung in bestehende Finanzberechnungen eingespeist.
2. Vorhandene API-ID-Wohnungsnummern des alten Imports werden erkannt und
   aufgefüllt. Danach übernimmt die stabile Investagon-ID die Zuordnung.
   Neue Einheiten erhalten den Quellstatus (frei/reserviert/verkauft); die
   genauere Investagon-Stufe bleibt in den Originaldaten erhalten. Kundenbindung
   und nicht vom Import verwaltete Reservierungen werden geschützt.
3. HTML-Beschreibungen aus `wikiPage` werden in Klartext übernommen. Projektadresse
   und Gebäudedaten werden, soweit erforderlich, aus Wohnungsdetails ergänzt.
4. Fotos über `photos`-Adressen, Unterlagen über `files`-Adressen laden. Dadurch
   werden Projektunterlagen nicht unnötig aus jedem Wohnungspaket dupliziert.
   ZIP dient nur als Ersatz, wenn direkte Dateiadressen fehlen.
5. Nur bestätigte Fotos gehen in den öffentlichen Bildspeicher. Dokumente bleiben
   privat; die interne Route erstellt beim Öffnen kurzlebige Downloadlinks.
   Importbilder ergänzen manuelle Bilder, Wohnungsdokumente werden angezeigt,
   ein fehlendes Titelbild wird gesetzt. Der obere Investagon-Login und die
   untere interne Objektverwaltung behalten ihre getrennten Routen.
6. Teilimporte speichern Detail- und Medienfortschritt. Vollständig abgeglichene
   Projekte werden anhand Tages-/Quellversion übersprungen. `offen` zählt noch
   nicht vollständig abgeglichene Projekte, `sollProjekte`/`sollEinheiten` den
   aktuellen API-Bestand. Fehlgeschlagene Quellen bleiben als Fehler erkennbar.
7. `{sync:true}` lädt Medien standardmäßig mit. Eine weitere Migration stellt
   den bestehenden Cron-Job auf 15-Minuten-Folgeläufe um (vier pro Stunde,
   entsprechend dem vorhandenen Rate-Limit). Teilimporte können so automatisch
   fortsetzen. Geänderte Quellversionen und der nächste Tag starten den Abgleich
   erneut. Ein fehlgeschlagener Medienabruf wird nicht als vollständig markiert.

## Ausrollen über Lovable Cloud — noch ausstehend

Der GitHub-Entwurf ist privat und für Lovables Diagnose nicht lesbar. Deshalb
wird zusätzlich ein Text-Patch zum Hochladen im Projektchat bereitgestellt.
Das Repository braucht dafür nicht öffentlich gemacht zu werden.

Reihenfolge:

1. Patch gegen den aktuellen Projektstand prüfen und auf einem Arbeitszweig
   anwenden. Andere Änderungen an Landingpages, Statistik und Abrechnung erhalten.
2. Gezielte Tests, Deno-Typprüfung und Frontend-Build ausführen.
3. Migration `20260909130000_investagon_dokumente_privat.sql` anwenden; sie legt
   den privaten Dokumentenspeicher und den privaten Detailcache an.
4. Edge Function `investagon-import` und Frontend bereitstellen, zunächst
   Trockenlauf auswerten. Sollbestand aus der aktuellen API verwenden (43/325
   ist der Diagnosezeitpunkt, keine dauerhaft fest programmierte Grenze).
5. Den realen Erstimport mit Bildern und Unterlagen ausführen und bei Teilberichten
   fortsetzen. Vorhandene Wohnungen auffüllen; zusätzliche Altobjekte erhalten.
6. Alle aktuellen Quell-IDs gegen CRM-Zeilen abgleichen. Nullwerte, Adresse/PLZ,
   Quellstatus, Foto- und Dokumentzahlen an den Detailantworten prüfen. Die im
   Bericht genannte Musterwohnung hat 479900 Kaufpreis, 71 m², 4 Zimmer und
   2400 Monatsmiete; sie darf nach dem Import nicht vier Nullwerte aufweisen.
7. Private Unterlagen als berechtigter interner Nutzer öffnen und Zugriff ohne
   Berechtigung ausschließen; Folgeimport auf Dubletten prüfen.
8. Nach bestandenem Erstabgleich Migration
   `20260909153000_investagon_sync_fortsetzen.sql` anwenden und den automatischen
   Folgelauf kontrollieren. Laufprotokoll mit Soll/Ist/offen/Fehlern zurückgeben.

Ein vollständiger Abgleich aller fünf Zugänge ist erst möglich, wenn auch die
vier fehlerhaften Zugänge korrigiert wurden. Keine Zugangsdaten in Chat oder
Patch übertragen; sie bleiben in Lovable Cloud Secrets.
