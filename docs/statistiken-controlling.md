# Statistiken: fachliche Definitionen und Abnahme

Stand: 9. September 2026. Die Statistikseite ist eine lesende Auswertung. Sie schreibt keine Geschäfts-, Rollen- oder Abrechnungsdaten.

## Navigation und Rechte

Ein Sidebar-Einstieg, deutsche Reiter: Übersicht, Pipeline & Abschlüsse, Aktivitäten, Umsatz & Provisionen, Quellen & Online-Rechner, Eigene Berichte, Recruiting, Finanzierung. Hausverwaltung bleibt separat.

Reiter werden ausdrücklich je Rolle definiert. Unbekannte Rollen erhalten keinen Zugriff. Individuelle Rollen benötigen Freigaben nach dem Muster `/statistiken?tab=activity` in ihren bestehenden `custom_permissions`. Inhaber, Admin und Testaccount können Haus/Team/Eigene wählen; Vertriebsleitung maximal das Team, andere Rollen ihre Zuständigkeit. Personenfilter können den erlaubten Datenbereich ausschließlich verkleinern. IDs haben Vorrang vor Namen. Namen sind nur bei eindeutiger Profilzuordnung ein Altbestands-Fallback. Setter-Zuständigkeit wird über Setter-ID bzw. eindeutig zugeordneten Setternamen gelesen.

Die vorhandene serverseitige Datensicherheit bleibt maßgeblich. Diese Änderung erweitert keine Datenbankrechte. Für Fachpartner ohne gepflegte Zuordnung werden keine hausweiten Ersatzzahlen angezeigt. Neue Zuordnungsmodelle und neue Buchhaltungsquellen werden nicht erfunden.

## Bestände und Ereignisse

- Kontaktbestand/Pipeline: aktueller Zustand des erlaubten Bestands, einschließlich älterer Kontakte. Ein Kontakt steht genau einmal in der Statusverteilung; abgeschlossene Investments stehen nicht im offenen Volumen.
- Zeitraum: Beginn einschließlich, Ende am Folgetag ausschließlich. Filter bleiben in der URL erhalten.
- Neue Kontakte: Erstellungsdatum im Zeitraum.
- Abschlüsse: Investment mit Kaufdatum oder Abschluss-/Bestandsstufe plus zuordenbarem Abschlussdatum. Ein geplanter Notartermin ist kein Abschluss. Erstellungsdaten ersetzen kein fehlendes Abschlussdatum. Stornos und Testdaten zählen nicht. Investment-IDs werden dedupliziert.
- Kaufpreisvolumen: Investment-Kaufpreise, bei Bedarf investmentbezogene Snapshots. Kein Kontaktpreis pro Wohnung, keine Addition von Budget und Investmentpreis.
- Unternehmensumsatz: ohne verknüpfte Erlösbuchhaltung nicht verfügbar; Immobilienkaufpreise sind kein Ersatz.
- Durchschnittlicher Kaufpreis: nur Investments mit gepflegtem positivem Preis; Anzahl ohne Preis wird angezeigt.
- Abschlussdauer: Median vom Kontakt-Eingang bis Abschluss, mit Anzahl auswertbarer Zeitpaare.
- Kohortenabschlussquote: eindeutige abgeschlossene Kunden aus den im Zeitraum neu angelegten Kontakten, Abschluss spätestens bis Periodenende, geteilt durch alle neuen Kontakte. Kein Investmentzähler im Zähler einer Kundenquote.
- Belegte Prozessübergänge: aktueller Nachweisstand der Eingangskohorte, nicht historische Übergangsquote. Zähler enthält nur Kontakte mit beiden Nachweisen; fehlende vorherige Nachweise separat. Ohne Bezugsmenge erscheint „—“.
- Verluste: tatsächliches Verlustdatum; Änderungsdatum wird nicht als Ersatz verwendet.
- Vorzeitraum: unmittelbar vorhergehender Zeitraum gleicher Länge. Ohne Vorperiodenbasis kein erfundener Prozentvergleich.

## Aktivitäten, Finanzierung und Abrechnung

Aktivitäten werden nach Ereignisdatum und Kontaktzuordnung gefiltert. Eine leere Kontaktmenge bleibt leer. Aktive Personen werden über Benutzer-IDs bzw. eindeutig auflösbare Namen gezählt, unabhängig von einer Rangliste und ohne Rollen-Auslassungen. Anrufe aus der Anruftabelle und Aktivitätsprotokolle werden nicht addiert. Terminwahrnehmung wird ohne vollständigen Ergebnisnachweis nicht aus einem vergangenen Datum geschätzt.

Finanzierungen sind investmentbezogen: `finanzierungen.kunde_id` enthält historisch die Investment-ID. Nur ein eindeutig ausgewähltes Angebot liefert Darlehensbetrag und Vertragsstatus. Ein unterschriebener Darlehensvertrag ist nicht gleich Angebot gewählt oder bankfinal. Mehrere ausgewählte Angebote werden als ungeklärt ausgewiesen. Bearbeitungszeiten benötigen beide Ereignisstempel; keine allgemeinen Änderungsdaten als Proxy.

Provisionen stammen aus gespeicherten Abrechnungen und sind getrennt von Kaufpreisvolumen. Ausgewertet werden ganze Abrechnungsmonate, die den Zeitraum berühren. Auszahlungen dagegen nach `ausgezahlt_am`, unabhängig vom Abrechnungsmonat. „Als ausgezahlt markiert“ ist eine Systemangabe, kein Bankabgleich. Entwürfe, Freigaben und Auszahlungen bleiben getrennt. Der Kontaktartenfilter gilt nicht für vollständige Abrechnungen; dies ist sichtbar erläutert. Buchhaltung hat den Abrechnungsbereich, jedoch keinen automatisch erweiterten Kundenbestand.

Online-Rechner verwenden ihre vorhandenen rollierenden Messfenster; diese Abweichung vom allgemeinen Datumsfilter ist direkt am Bereich benannt. Personen- und Teamwahl werden auf die Abrufe angewandt. Fehler erscheinen als nicht verfügbar, nicht als Nullaktivität. Ereignisquoten sind keine eindeutigen Besucherquoten.

## Darstellung und Prüfpfad

Kennzahlenkarten für Ergebnisse, Balken für Kategorien, lineare Kurven für Zeitverläufe mit Nullzeiträumen. Tabellenansicht für exakte Werte. Kategorien erhalten keine geglätteten Flächen oder Radarflächen. Details zeigen alle zugrunde liegenden Datensätze mit Seitennavigation und Kundenlinks. Fehlende Angaben, Datumswerte, Preise und Zuordnungen bleiben sichtbar. Datenladefehler blenden abhängige Zahlen aus.

Die Hausverwaltung bezeichnet Sollmieten, Vorauszahlungen und die Teilrechnung nach Dienstleisterkosten korrekt: keine Gleichsetzung mit Hausgeld, Zahlungseingang oder Gewinn. Bereits abgelaufene Verträge werden getrennt von kommenden Vertragsenden ausgewiesen.

## Verifikation

Ergebnis der isolierten Prüfung: 70 Tests bestanden, Produktionsbuild erfolgreich, TypeScript-Prüfung ohne Fehler.

Automatisierte fachliche Tests: Teamgrenzen/Manipulationen, ID-Vorrang, leere Mengen, Mehrfachinvestments, Abschlussdatum statt Anlagedatum, Storno, Periodengrenzen, lückenlose Verlaufsskalen, Gesamtzahlen über Listenlimits, konsistente Nachweisquoten, Investment-Finanzierung und Renteneinkünfte.

Automatisierte Oberflächentests: Rollen-/Direktlinkschutz, Teamfilter, leere und fehlerhafte Ladezustände, Kennzahl-Details und ungültige Zeiträume.

Eine visuelle Live-Abnahme ist noch offen: Der Browserzugriff auf die lokale Vorschau wurde durch eine nicht verfügbare Richtlinienprüfung abgewiesen. Produktionsdaten wurden nicht verändert; keine Behauptung eines durchgeführten Bankabgleichs oder einer vollständigen Live-Rollenprüfung.
