> Aktueller Befund vom 09.09.2026: Der funktionierende Zugang liefert 43 Projekte
> und 325 Wohnungen. Fotos und Dateien haben vollständige Downloadadressen;
> die geprüften ZIPs enthalten PDFs, keine Fotos. Die historischen Annahmen
> zu Bildpfaden und Detailendpunkten unten sind überholt.
> Siehe [aktueller Korrektur- und Abnahmestand](investagon-sync-2026-09-09.md).

# Investagon-Anbindung, Stand 26.08.2026

Das Thema liegt auf Warteposition. Christian setzt es mit Benedikt fort, dem
Programmierer, der ins Team kommt. Diese Notiz ist die Übergabe.

## ⚠️ Das Wichtigste zuerst: Den Echtlauf nicht starten

Der Trockenlauf zeigt inzwischen 40 Projekte mit 293 Einheiten aus der echten
API. Das sieht nach Erfolg aus, ist aber eine Falle.

**Die Listenabfrage liefert keine Preise.** Ein Datensatz aus
`/api/api_properties` enthält nur:

    id, active, visibility, object_country, object_postal_code, object_city,
    object_street, object_house_number, object_apartment_number, project,
    updated, commission, statusName, selling_price_commission

Also Adresse, Status und Provision. **Kein Kaufpreis, keine Fläche, keine
Zimmer, keine Miete.** Der Import sucht in `einheitAus()` aber genau nach
`purchasePrice`, `livingSpace`, `rent` und `rooms`.

Wer jetzt „Import jetzt ausführen" drückt, legt 40 Objekte mit 293 Einheiten
an, in denen überall Null steht. Das ist schlechter als der heutige Zustand.

**Erst lösen, dann importieren.**

## Der Zugang funktioniert seit dem 26.08.2026

Monatelang kam bei jedem Aufruf:

    HTTP 401
    {"message":"Access Denied. The user doesn't have ROLE_PERMISSION_PROPERTY_VIEW."}

Das wurde für ein Rechteproblem bei Investagon gehalten. **Das war falsch.**
Dieselbe Meldung kommt bei einem Aufruf völlig ohne Schlüssel, nachgemessen mit
`curl` gegen `https://api.investagon.com/api/api_properties`. Der Rollenname
darin wird aus der angefragten Adresse abgeleitet und sagt nichts über das
Konto aus. Bei `/api/organizations` heißt er entsprechend `ROLE_API`.

Zwei Fehler lagen im eigenen Code, beide behoben:

1. **Die Organisationskennung stand in der Kopfzeile** `X-Organization-Id`, die
   Investagon nicht kennt und stillschweigend ignoriert. Sie gehört als
   Anhängsel in die Adresse: `?organization_id=UUID`.
2. **Die Listenpfade waren falsch.** Richtig sind `/api/api_projects` und
   `/api/api_properties`, nicht `/api/projects` und `/api/properties`.

## Die fünf Zugänge

Von den fünf hinterlegten Zugängen funktioniert genau einer:

| Zugang | Zustand |
|---|---|
| 1 | ungültige Organisationskennung, liefert 401 |
| 2 | falsche Basisadresse, liefert 404 |
| **3** | **funktioniert, liefert 40 Projekte und 293 Einheiten** |
| 4, 5 | ungültig, liefern 401 |

Alle fünf tragen eine Organisationskennung, aber nur eine davon ist gültig. Ein
Filter auf „ist eine Kennung eingetragen" reicht deshalb nicht, es muss geprüft
werden, ob der Zugang tatsächlich antwortet. So macht es die Diagnose jetzt.

Die vier toten Zugänge sollten aufgeräumt werden, sonst steht bei jedem
nächtlichen Lauf eine Fehlerliste, die niemand mehr liest.

## Was als Nächstes zu tun ist

1. **Den Einzelabruf auswerten.** Die Diagnose ruft seit `76989f1f` zusätzlich
   `/api/api_properties/{id}` und `/api/api_projects/{id}` ab. Dort stehen die
   vollständigen Felder. Diesen Schritt hat noch niemand ausgewertet, er ist
   der Ausgangspunkt für alles Weitere.
2. **Den Import auf den Einzelabruf umstellen**, sobald die Feldnamen bekannt
   sind. Achtung: Das sind 293 Einzelabrufe je Lauf.
3. **Den Fortschrittsmerker bauen.** Bei 293 Einzelabrufen und acht Minuten
   Laufzeitgrenze (`LAUFZEIT_MS`) wird ein Lauf abbrechen. Heute beginnt der
   nächste wieder bei Projekt 1, es wird kein Fortschritt gemerkt.
4. **Die Dokumente freigeben.** Das Paket je Einheit wird bereits
   heruntergeladen, `istBildDatei` in `bilder.ts` wirft beim Auspacken aber
   alles weg, was kein Foto ist. Die Tabellen `objekt_dokumente` und
   `wohnungs_dokumente` existieren und werden angezeigt.
5. **Die Bildadressen klären.** Einzige offene Frage an Investagon: Die API
   liefert Bilder nur als Dateinamen ohne Pfad. Wie die vollständige Adresse
   gebildet wird, steht nicht in der Dokumentation.

## Was am 25.08.2026 behoben wurde

Der nächtliche Lauf überschrieb im CRM gepflegte Daten. Behoben in `2a6c9fb7`:

- `objekte.meta` wird zusammengeführt statt ersetzt.
- Freie Wohnungen werden abgeglichen statt gelöscht und neu angelegt. Vorher
  bekamen sie jede Nacht neue IDs, und daran hängende Bilder, Dokumente,
  Hausgeld und Rücklage gingen verloren. Reservierte und verkaufte Einheiten
  waren schon vorher geschützt.

## Warum kein Auslesen über den Browser

Geprüft und verworfen. Der Netzwerkmitschnitt der Objektliste enthält keinen
einzigen Datenaufruf, nur Tracking, Karten und Schriften. Die Seiten kommen
fertig gerendert vom Server. Und es liefe nie von allein: Das CRM läuft in der
Cloud, dort gibt es keinen Browser.

## Was Investagon geantwortet hat (26.08.2026)

David Katz, Lead Client & Business Manager:

- Die Bitte um die Berechtigung liegt bei deren Geschäftsführung und IT, noch
  offen.
- **Die Sichtbarkeit ist als Ursache ausgeschlossen.** Objekte, die Bauträger
  teilen, stehen zunächst auf „Überprüfung ausstehend". Das war der
  Review-Punkt aus der Erinnerung. Er hat aber ausdrücklich keinen Einfluss auf
  die Datenübertragung über die API, weil dort mit Adminrechten gearbeitet
  wird, und keinen Einfluss auf die Dokumente. In den Import-Einstellungen von
  Investagon lässt sich die Standardsichtbarkeit auf Online stellen.
- Abfragbar ist sie über `/api/api_properties/{id}`, Feld `Visibility`.
- **Wichtig für die Erwartung:** Der Umfang der Medien und Infos hängt davon
  ab, was der Anbieter einträgt. Wir bekommen alles Vorhandene, aber nicht
  mehr. Wie viel je Objekt hinterlegt ist, lässt sich über die Felder `photos`
  und `files` vorab auszählen.

**Einzige offene technische Frage an Investagon:** Die API liefert Bilder nur
als Dateinamen ohne Adresse. Wie die vollständige Bildadresse gebildet wird,
steht nicht in der Dokumentation.
