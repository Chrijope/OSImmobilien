# Video-Call: Bereitstellung und Abnahme

Stand: 09.09.2026. Änderungen lokal umgesetzt und geprüft; keine produktive Bereitstellung oder Launch-Freigabe erfolgt.

## Reihenfolge der Bereitstellung

1. Zielprojekt und vorhandenen Migrationsstand im Lovable-Cloud-Projekt prüfen. Das Backend und der vorhandene Versandanbieter bleiben Lovable; ein separates Supabase-Konto ist nicht erforderlich. Die aktuelle Sitzung kann den aktiven Cloud-Stand nicht administrativ einsehen. Bestehende Tabellen, Rollen, Buchungsfunktionen und Sicherung prüfen.
2. `20260910100000_meeting_lebenszyklus.sql` , `20260910110000_buchung_mail_outbox.sql` und `20260910120000_meeting_gaeste_versand.sql` zunächst in einer Testumgebung anwenden. Für den Versand werden `pg_cron` und `pg_net` benötigt. Die Dispatcher-URL in der zweiten Migration zeigt auf `DEIN-SUPABASE-PROJEKT.supabase.co`; für eine andere Zielumgebung muss die URL vor Anwendung passend gesetzt werden. Keine Testbuchungen an produktive Versanddienste weiterleiten.
3. Die aktualisierten Edge Functions `send-buchung-bestaetigung`, `send-buchung-aenderung`, `send-transactional-email` (neue Vorlage) und `process-email-queue` (neuer Vorverarbeitungsschritt) gemeinsam in Lovable bereitstellen. Vorhandene Sender-Konfiguration und Zugriffsschutz prüfen. Die neue Lease-RPC muss vorher vorhanden sein.
4. Frontend bereitstellen und mit kontrollierten Testkonten prüfen. Fehlende atomare Funktionen führen bewusst zum Abbruch, statt Teilstände zu speichern.
5. Den durch die Migration inaktiv angelegten Zeitplan erst nach erfolgreicher Prüfung beider Versanddienste aktivieren. Mit administrativem Datenbankzugang: `UPDATE cron.job SET active = true WHERE jobname = 'buchung-mail-ausliefern';`. Falls Erweiterungen bei der Migration fehlten, muss der Zeitplan vorher eingerichtet werden.
6. Tatsächlichen Versand und Warteschlangenverlauf prüfen. Eine Annahme durch den Versanddienst beweist noch keine Zustellung im Postfach. Bei Problemen den Zeitplan wieder deaktivieren und Fehler untersuchen; Migrationen mit bestehenden Daten nicht pauschal zurücksetzen.

## Vollständige Abnahme mit Testkonten

- Kundenprofil öffnen, Meeting erstellen, Datum/Uhrzeit in Europe/Berlin und Dauer wählen, höchstens zwei zusätzliche Gäste angeben. Doppelklick und erzwungenen Speicherfehler prüfen. Es müssen genau eine Aktivität, ein Raum und eine verknüpfte Aufgabe entstehen; bei Fehlern keine Teilanlage und keine Einladung.
- Kunden- und Gasteinladungen im echten Testpostfach samt Kalenderdatei prüfen. Kundenzugang auf zweitem Gerät öffnen, Warteraum und Einlass prüfen. Gastgeber, Kunde und zwei Gäste müssen gemeinsam teilnehmen können.
- Kamera, Mikrofon, Gerätewechsel, Spiegelung, Hintergrund, Bildschirmfreigabe, Lautsprechertest und Berechtigungsverweigerung prüfen. Verbindung über getrennte Netze einschließlich Mobilfunk/Firmennetz testen. Geladene TURN-Konfiguration allein ist kein Nachweis einer erfolgreichen Relay-Verbindung.
- Notizen speichern, kurz das Netz unterbrechen, Seite erneut öffnen und Wiederherstellung prüfen. Gespräch abschließen; Kundenaktivität, Aufgabe und Raumzustand abgleichen.
- Manuelles Meeting verschieben, abschließen und Raum löschen. Verknüpfungen, Konfliktprüfung und fremde Benutzerrechte prüfen. Bei uneindeutig zugeordneten älteren Aufgaben ist eine gezielte Bestandsprüfung erforderlich.
- Alternative „Kunde wählt selbst“ mit persönlichem Link prüfen: freie Zeit, belegte Zeit, Puffer, Vorlauf, Ausnahme, Verschieben, Absage und abgelaufener Link. Öffentlichen Buchungslink separat prüfen.
- Bestätigung/Änderung bei geschlossenem Browser verarbeiten lassen; Versandfehler erzwingen und Wiederholung prüfen. Standard: zwei Aufträge je fünf Minuten, maximal zehn Versuche; bei höherem Volumen Kapazität und Anbieterlimits abstimmen.
- Alle drei Sidebar-Seiten auf Desktop und Mobilgerät einschließlich Tastaturbedienung prüfen. In Einstellungen echte Speicherfehler und erneuten Versuch prüfen. Kommende/vergangene Termine, weitere Ergebnisse und Wochenwechsel kontrollieren.

## Bekannte Grenzen

- Manuelle Einladungen werden nach erfolgreicher Anlage über den bestehenden Versanddienst gesendet. Sie liegen nicht in der neuen dauerhaften Buchungswarteschlange. Fehler werden angezeigt. Änderungen und Absagen werden dagegen automatisch je gespeichertem Empfänger vorgemerkt und vom vorhandenen Lovable-Mail-Worker übernommen. Auch bei gelöschter Aktivität bleibt der Auftrag erhalten. Alte Gäste werden aus der bisherigen Gästezeile übernommen; bei Altterminen wird der aktuelle Kundenkontakt als Empfänger ergänzt, da frühere Einladungsoptionen nicht strukturiert gespeichert waren. Die Abnahme muss für Altbestand diese Zuordnung prüfen.
- Externe Kalender-Synchronisierung ist weiterhin ein nachgelagerter Integrationsschritt und wurde nicht live geprüft.
- Die Wochenansicht zeigt Buchungen über Buchungslinks, nicht sämtliche CRM- und Fremdkalenderereignisse. Spontane Räume erzeugen nicht automatisch die Kunden-/Aufgabenverknüpfung des Meetingdialogs.
- Notizen sind Raumnotizen, keine automatische Transkription. Der umfangreichere No-Show-Folgeprozess bleibt im Kundenprofil.
- Browserzugriff war durch eine administrative Sicherheitsprüfung blockiert. Es wurde kein echter Mehrpersonen-Call und keine visuelle Live-Abnahme durchgeführt.

## Lokale Prüfergebnisse

- 311 Video-Call-/Meeting-Tests in 32 Dateien bestanden.
- 25 isolierte Datenbankszenarien bestanden; reduzierte Teststruktur mit neuen Migrationen und vorhandener öffentlicher Verschiebefunktion, kein produktiver Datenbanknachweis.
- TypeScript und Produktions-Build bestanden; neue Kernmodule ohne Lintfehler. Ältere Dateien enthalten bestehende Lintbefunde.
- Gesamtsuite: 4.516 bestanden, ein reproduzierbarer Fehler im unveränderten Exposé-Test `useAktiverAbschnitt.test.tsx` (veraltete IntersectionObserver-Erwartung).
- Vier betroffene Versanddienste einschließlich lokaler Abhängigkeiten erfolgreich gebündelt, nicht gegen den echten Maildienst ausgeführt.

Gezielte Frontendprüfung: `npx vitest run src/lib/videocall src/lib/videoraum src/lib/meeting src/lib/notizSpeicher src/lib/buchung src/lib/kontaktTermine.test.ts src/lib/inboxTermine.test.ts src/components/videoraum src/pages/VideoraumGast.test.ts src/components/buchung src/components/kunden/BuchungErgebnisKarten.test.tsx src/components/kunden/QuickActionDialog.meeting.test.tsx`.

Datenbankprüfung: PGlite 0.3.14 in einem separaten temporären Verzeichnis installieren; anschließend `PGLITE_MODULE=/absoluter/pfad/node_modules/@electric-sql/pglite/dist/index.js node scripts/tests/meeting-database.mjs`. PGlite wurde nicht als Projektabhängigkeit ergänzt.

Weitere Prüfungen: `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, `npm test`, `git diff --check`. Lokal wurde Node 24.19.0 genutzt.

Der ausführliche Bedien- und Abschlussbericht liegt unter `output/pdf/MOREImmo-Videocall-Abschlussbericht.pdf`.

## Automatische manuelle Gastbenachrichtigungen

`meeting_kommunikation` speichert die tatsächlichen Empfänger der Ersteinladung. Kunden ohne gewählte Einladung werden bei neuen Meetings nicht nachträglich automatisch aufgenommen; zusätzliche Gäste bleiben berücksichtigt. Bei Änderungen entsteht je normalisierter E-Mail-Adresse ein Auftrag. Änderung/Absage und Vormerkung sind eine Transaktion. Ein regulärer Gesprächsabschluss erzeugt keine Absage.

Der bestehende `process-email-queue` holt bis zu zehn Aufträge und übergibt sie an `send-transactional-email`; Versand und spätere Zustellfehler laufen über die bestehende Lovable-Infrastruktur. Die neue Vorlage `meeting-aenderung` enthält keine privaten Kundendetails oder anderen Empfänger. Kalenderdateien nutzen dieselbe UID wie die Ersteinladung und eine fortlaufende SEQUENCE; Absagen verwenden METHOD:CANCEL/STATUS:CANCELLED. Das Verhalten der jeweiligen Kalenderprogramme ist live zu prüfen.

Lease und Erfolg werden je Empfänger gespeichert. Ein fehlgeschlagener Gast blockiert keine anderen Empfänger. Für denselben Empfänger bleibt die Reihenfolge erhalten; nach zehn Fehlern muss der frühere Auftrag im Kundenprofil erneut angestoßen werden, bevor spätere Änderungen an diese Adresse folgen. Offene/fehlerhafte Aufträge bleiben auch nach dem Löschen des letzten Meetings im Kundenprofil sichtbar. Annahme durch den Dienst ist kein Posteingangsbeweis.

Offizielle Einordnung: https://docs.lovable.dev/tips-tricks/external-deployment-hosting beschreibt die Supabase-kompatible Projektstruktur von Lovable Cloud. Git-Synchronisierung, aktive Backendmigrationen und Veröffentlichung sind gesondert zu prüfen.
