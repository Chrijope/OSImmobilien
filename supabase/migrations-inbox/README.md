# Migrations-Inbox: was noch im Supabase-Editor laufen muss

Dieser Ordner ist der Eingangskorb für Migrationen, die **im Repo liegen, aber
in Supabase noch nicht ausgeführt** sind. Migrationen werden in diesem Projekt
nicht automatisch angewendet, Christian führt sie im Supabase-SQL-Editor aus.
Vorher war nur im Abschlussbericht einer Sitzung vermerkt, was noch offen ist,
und das ging leicht verloren.

## Ablauf

1. **Neue Migration entsteht**: Sie wird wie immer in `supabase/migrations/`
   angelegt (das bleibt die vollständige Historie) und zusätzlich hier als Kopie
   abgelegt.
2. **Christian führt sie aus**: Inhalt von `00_ALLE_ZUSAMMEN.sql` in den
   Supabase-SQL-Editor kopieren, in der dort genannten Reihenfolge.
3. **Nachsehen, ob alles ankam**: `99_PRUEFUNG.sql` im selben Editor
   ausführen. Sie ändert nichts und meldet je Teil „ja" oder „fehlt".
   Daneben liegt `98_FEHLENDE_TABELLEN.sql`. Sie geht nicht nur die Teile
   dieses Ordners durch, sondern alle Tabellen, die irgendeine Migration im
   Repo anlegt, und meldet je Tabelle „ja" oder „FEHLT". Auch sie ändert
   nichts. Zweimal ist eine Tabelle unbemerkt liegen geblieben
   (`analysetool_ereignisse` und `va_aufgaben_ergebnisse`, beide aus der
   Woche vom 27.07.2026); diese Abfrage findet den nächsten Fall, bevor er
   im Betrieb auffällt. Als dritte Prüfdatei liegt hier
   `97_PROVISIONSSAETZE_PRUEFEN.sql`. Sie gehört zu Teil 10 und beantwortet
   eine Frage zum Altbestand: Bei wie vielen Investments seit dem 18.08.2026
   weicht der gespeicherte Provisionssatz von dem ab, der heute gelten würde?
   Auch sie ändert nichts und schlägt bewusst keine Korrektur vor. Dazu kommen
   `95_BERATERNAMEN_PRUEFEN.sql` (wie oft die Partnersuche über den Namen
   danebengeht) und `96_SIDEBAR_JE_ROLLE.sql` (welche Routen je Rolle
   freigegeben sind). Alle fünf Prüfdateien bleiben liegen, sie sind keine
   Migrationen.
4. **Danach aufräumen**: Die erledigten Dateien aus diesem Ordner löschen und
   `00_ALLE_ZUSAMMEN.sql` leeren. Die fünf Prüfdateien `95_` bis `99_` bleiben
   liegen, sie sind keine Migrationen. Ein Ordner ohne Migrationsdateien
   bedeutet: es ist nichts offen.

Wichtig: Die Dateien in `supabase/migrations/` bleiben dabei liegen, sie sind
die maßgebliche Quelle. Dieser Ordner ist nur eine Merkliste. Er heißt bewusst
`migrations-inbox` und nicht `migrations/inbox`, damit die Supabase-CLI die
Kopien nicht als zusätzliche Migrationen einliest.

## Aktuell offen

Stand 07.10.2026:

| Datei | was sie tut |
|---|---|
| `20260930160000_objekt_sichtbarkeit_schalter.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar. Neue Funktion `objekt_sichtbarkeit_setzen(uuid, boolean)`: Admin, Inhaber und Objektpartner schalten bei Investagon-Objekten nur die Spalte `sichtbar` um (Punkt auf der Objektkachel, Christian am 30.09.2026). Nötig, weil Objektpartner Investagon-Objekte seit 20260930120000 nicht direkt ändern dürfen. Ohne sie schalten Admin und Inhaber trotzdem, Objektpartner bekommen eine Ablehnung. |
| `20261001120000_abrechnung_nur_backoffice.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar; am besten nach dem Publish. Christians Entscheidung vom 01.10.2026: Die Stufe „abrechnung“ setzen und verlassen wie „abgeschlossen“ nur Admin, Inhaber, Backoffice und der Server. Ersetzt den Rumpf von `pipeline_abschluss_schuetzen()` (Wächter `trg_absicherung_pipeline_abschluss` auf `investments` und `kontakte`). Ohne sie sperrt nur die Oberfläche. Prüfzeile 56.1 |
| `20261004110000_wochenberichte_geheimwort.sql` | **Schritt 1 von 3**, vor dem Ausrollen der Wochenberichte. Die Zeitpläne von `send-weekly-summary` und `send-weekly-vp-summary` schicken das Geheimwort der Automatiken (`x-internal-secret`) mit, wie die anderen Automatiken seit 20260916130000. Nötig, weil beide Functions seit dem 04.10.2026 `automatikSchutz` prüfen. Ohne Geheimwort im Tresor ändert sie nichts. Ändert keine Tabellendaten, wiederholbar. Prüfzeile 57.1 |
| `20261004120000_registrierung_ohne_rollenwahl.sql` | **Schritt 3 von 3: erst die Functions ausrollen** (Schritt 2: `invite-user`, `setup-admin`, `create-test-accounts`, `send-weekly-summary`, `send-weekly-vp-summary`), **dann diese Migration**. `handle_new_user` liest die Rolle nur noch aus `raw_app_meta_data` (setzt allein der Server), sonst `kunde`. Bisher konnte sich jeder per `signUp` mit `data.role = 'admin'` ein Admin-Konto anlegen. Supabase Auth schreibt `app_metadata` erst nach dem Anlegen, der Trigger vergibt deshalb `kunde`; die drei Konto-Functions setzen die Rolle selbst (`_shared/startrolle.ts`). In falscher Reihenfolge bekommen neu Eingeladene nur `kunde`. Ändert keine Daten, wiederholbar. Prüfzeile 58.1 |
| `20261004190000_termin_erinnerungen_kopf.sql` | **Vor dem Ausrollen von `send-termin-erinnerungen`.** Der Zeitplan `send-termin-erinnerungen-hourly` schickt das Geheimwort der Automatiken (`x-internal-secret`) mit. Nötig, weil die Function seit dem 04.10.2026 `automatikSchutz` prüft (`verify_jwt = false`, vorher ohne Ausweis von außen startbar). Ohne Geheimwort im Tresor ändert sie nichts. Ändert keine Tabellendaten, wiederholbar. Prüfzeile 80.1 |
| `20261004191000_benachrichtigungen_sperre_eindeutig.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar. Eindeutiger Teilindex auf `benachrichtigungen (benutzer_id, meta->>'sperre')`, damit `eigene-investments-reminders` bei gleichzeitigen Läufen keine Glocke doppelt schreibt. Gibt es schon Dubletten, legt sie nichts an und warnt nur. Ohne sie läuft alles wie bisher. Prüfzeilen 80.2 und 80.3 |
| `20261004150000_einreichung_upload_server.sql` | **Erst nach dem Ausrollen von `submit-objekt-einreichung` und dem Publish.** Entfernt die beiden Speicherregeln `objekt_medien_anon_einreichung_upload` und `objekt_medien_auth_einreichung_upload`: Niemand lädt mehr selbst nach `objekt-medien/einreichungen/` hoch. Das Formular unter /objekt-akquise lädt seit dem 04.10.2026 mit und ohne Anmeldung über die Function hoch (nur Bilder, höchstens 15 MB, Kontingent je Anschluss, Ordner wie bisher). Dazu 30 MB je Datei am Eimer `objekt-medien` (größte Datei am 04.10.2026: 5,5 MB, Unterlagen im Formular höchstens 25 MB); bewusst keine Typliste, weil PDFs und Investagon-Bilder als `application/octet-stream` hineingehören. Läuft sie zu früh, scheitert nur der Bild-Upload auf /objekt-akquise, das Formular lässt sich trotzdem absenden. Ändert keine Daten, wiederholbar. Prüfzeilen 59.1 bis 59.2 |
| `20261004195000_sicherung_zeitplan.sql` | **Erst nach dem Ausrollen von `daily-backup`.** Legt den Zeitplan `sicherung-taeglich` an (Zustimmung Christian 04.10.2026): `daily-backup` jede Nacht um 01:00 UTC (03:00 Sommerzeit, 02:00 Winterzeit), mit `x-internal-secret` aus dem Tresor. Die Sicherung legt 14 Tabellen als JSON im Eimer `backups` ab und räumt Ordner älter als 30 Tage selbst ab; Investments, Objekte und Wohnungen sind nicht dabei. **Der Papierkorb bleibt** (Entscheidung Christian 04.10.2026): `auto-purge-papierkorb` bekommt keinen Zeitplan, ein Zeitplan `papierkorb-leeren-taeglich` wird entfernt. Der öffentliche Schlüssel steht nicht in der Datei, er wird zur Laufzeit aus einem vorhandenen Zeitplan gelesen (nur Rolle anon). Ohne Geheimwort im Tresor oder ohne gefundenen Schlüssel legt sie nichts an. Wiederholbar, ein vorhandener Zeitplan gleichen Namens wird ersetzt. Prüfzeilen 81.1 bis 81.2 |
| `20261004152000_kundenportal_sperre_nachziehen.sql` | Am besten nach dem Ausrollen von `kundenportal-sperre`, `secure-login`, `invite-user`. Ändert keine Daten, wiederholbar. Zusätzlich (Prüfung Codex 04.10.2026): `merge_kontakt_meta`, `merge_investment_meta`, `darf_investment_nutzen` und `ist_kunde_des_kontakts` lehnen gesperrte Kunden ab; eine Sperre trifft nur Konten mit ausschließlich der Rolle kunde (Tippgeber oder intern zusätzlich: nur die Portalseite). Restrisiko: `kundenchat_starten`, `chat_teilnehmer_eintragen`, `create_empfehlung_kontakt`, `eigenfinanzierung_kunde_unterlage`, `get_kunde_vp_profile` prüfen die Sperre noch nicht. Live am 04.10.2026 gesehen: 14 neuere Tabellen (u. a. lead_pakete, lotse_nachrichten, bewerbungen) ohne die Sperrregel der Kundenportal-Sperre, dazu lief live eine abweichende Fassung von `kundenportal_sperrregeln_anlegen()`, deren Regeln `kunde_portal_gesperrt(auth.uid())` direkt fragen, weshalb jeder Angemeldete die Funktion für fremde Kennungen aufrufen kann. Stellt die Repo-Fassung her, legt alle Regeln neu an, bricht ab, falls danach noch etwas die Funktion direkt fragt, und nimmt erst dann `authenticated` das Recht. Ohne sie bleiben nur die 14 Tabellen für gesperrte Kunden offen. Prüfzeile 82.1 |
| `20261004160000_eigentuemer_aus_investment.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar. Neue Funktion `eigentuemer_aus_investment(uuid)`: legt nach dem Notartermin den Käufer als Eigentümer in der Hausverwaltung an, je Investment genau einmal, nur für interne Rollen, die das Investment nutzen dürfen. Nötig, weil Partner und Backoffice seit 20260930120000 nicht mehr direkt in `eigentuemer` anlegen dürfen; die Übernahme scheiterte seit dem 30.09. still. Ohne sie bleibt die Stufe für diese Rollen auf Notar stehen, das Kundenprofil bietet einen neuen Versuch an. Prüfzeile 83.1 |
| `20261004171000_buchhaltung_kundenprofil_pipeline.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, wiederholbar. Zwei Zeilen in `role_permissions`: Die Buchhaltung kommt ins Kundenprofil und in die Pipeline, um wie das Backoffice „Abrechnung“ und „Abgeschlossen“ zu setzen. Ohne sie sieht die Buchhaltung beide Punkte nicht. Prüfzeile 84.1 |
| `20261004170000_abrechnung_bescheid_sperre.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar. Entscheidung vom 04.10.2026: Ein Provisionsbescheid mit Status „freigegeben“ oder „ausgezahlt“ behält Monat, Partner, Posten und Summen; „Abrechnungen neu berechnen“ ändert nur offene (Auslöser `trg_provisionsabrechnung_bescheid_sperre`). Dazu `trg_provisionsabrechnung_keine_doppelung`: Freigeben oder Auszahlen wird abgelehnt, wenn ein Investment des Bescheids schon in einem anderen freigegebenen oder ausgezahlten Bescheid desselben Partners steht. Dazu `trg_provisionsabrechnung_loeschen_pruefen`: freigegebene und ausgezahlte Bescheide lassen sich aus dem Browser nicht löschen. Status, Vermerke und PDF-Vermerk bleiben frei. Ohne sie prüft nur die Oberfläche. Prüfzeilen 75.1 bis 75.3 |
| `20261004175000_empfehlungsprogramm_anfrage.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar. Vorgabe vom 04.10.2026: Fragt ein Kunde im Portal das Empfehlungsprogramm an, legt `empfehlungsprogramm_anfragen(uuid)` eine Aufgabe für den Zuständigen (`zustaendig_id`) an, die ihm gehört (der Kunde sieht sie nicht), und schickt ihm eine Glocke mit Link auf diese Aufgabe; ohne Zuständigen an Admin, Inhaber und Vertriebsleitung, jede Person einmal. Liegt schon eine offene Anfrage vor (Marker in `ausloeser_schluessel`, Sperre je Kontakt), entsteht keine zweite. Ohne sie schickt das Portal nur eine Glocke an den Zuständigen, ohne Zuständigen sieht der Kunde eine Fehlermeldung. Prüfzeile 76.1 |
| `20261004180000_buchung_sprache.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar; am besten nach dem Publish. Befund vom 04.10.2026: Eine Buchung auf der englischen Terminseite (`?lang=en`) bekam deutsche Mails, weil der neue Kontakt ohne Sprache entstand. Neue zweite Fassung `buchung_anlegen(…, _sprache, …)`: ruft die bestehende unverändert auf und trägt die Sprache nur am gerade angelegten Kontakt ohne Sprache ein. Alte Aufrufer bleiben bei der alten Fassung. Ohne sie bucht die Seite wie bisher, der Kontakt gilt als Deutsch. Prüfzeile 77.1 |
| `20261004193000_objekt_loeschen.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar. Objekt und Einheit löschen nur mit Prüfung in der Datenbank: Auslöser vor dem Löschen auf `objekte` und `wohnungen` lehnen jedes Löschen aus dem Browser ab (Rolle im Token `authenticated` oder `anon`), wenn das Haus belegt ist, ein Investment auf Objekt oder Einheit zeigt oder eine Einheit reserviert, verkauft, mit Kunde, vorgemerkt, aus Investagon oder mit gesendetem Kundenlink ist; Dienstrolle und SQL-Editor bleiben frei (Investagon-Import). Dazu `objekt_loeschen(uuid)` mit Sperre auf Objekt und Einheiten und Rechteprüfung wie die Löschregel (Admin, Inhaber, Objektpartner nur mit eigenem `erstellt_von`). Ohne sie prüft nur der Browser. Prüfzeilen 78.1 bis 78.2 |
| `20261005100000_kundenlink_wohnungsauswahl.sql` | **Reihenfolge: diese Migration, dann `get-kundenansicht` ausrollen, dann `send-kunden-expose` ausrollen.** Rollt `send-kunden-expose` vor `get-kundenansicht` aus, zeigt ein eingeschränkter Link bis dahin noch alle freien Wohnungen. Ändert keine Daten, wiederholbar. Neue Spalte `objekt_exposes.wohnung_auswahl` (Christian, 05.10.2026): Bei der Objektübersicht wählt man im Fenster „Kundenlink senden“, welche freien Wohnungen der Kunde sieht; `get-kundenansicht` gibt nur diese heraus. Leer heißt alle freien Wohnungen, so bleiben alle bisherigen Links. Dazu der Auslöser `trg_objekt_exposes_kundenlink_nur_server`: `art` und `wohnung_auswahl` ändert nur der Server, aus dem Browser lehnt die Datenbank das ab (der Browser schreibt beide heute nirgends). Ohne sie geht die Objektübersicht nur mit allen Wohnungen, eine echte Auswahl lehnt `send-kunden-expose` ab. Prüfzeilen 85.1 und 85.2 |
| `20261005110000_expose_lesen_nach_kundenzugriff.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar; am besten nach dem Publish. Prüfung Codex vom 05.10.2026: Die Leseregel `Exposes lesen` auf `objekt_exposes` ließ den Ersteller eine Zeile dauerhaft lesen, auch nach Übergabe des Kunden an einen anderen Partner. Neu: Admin und Inhaber alles; ohne Kundenbezug nur der Ersteller (neutrale Vorschau je Nutzer); mit Kundenbezug der Zuständige und der Ersteller nur, solange er den Kontakt sehen darf (`darf_alle_kunden_sehen` oder `is_vp_owner_of_kontakt`, also eigene und vertretene Kunden). `get-expose`, `get-kundenansicht` und `send-kunden-expose` lesen mit der Dienstrolle und sind nicht betroffen. Ohne sie gilt die alte Regel weiter. Prüfzeile 86.1 |
| `20261005123000_lotse_auswertung_warteschlange.sql` | **Erst `objekt-lotse` ausrollen, dann diese Migration.** Neue Unterlagen wertet der MORE Lotse einmalig im Voraus aus: Tabelle `lotse_auswertung_warteschlange` (nur Dienstrolle), Auslöser nach jedem INSERT in `objekt_dokumente` und `wohnungs_dokumente` (trägt das Objekt ein, blockiert nie das Anlegen), Zeitplan `lotse-unterlagen-auswerten` alle 10 Minuten mit `x-internal-secret`. Je Lauf höchstens fünf Objekte und acht Unterlagen; leere Schlange heißt keine KI-Kosten. Ohne Geheimwort im Tresor entsteht kein Zeitplan. Ändert keine bestehenden Daten, wiederholbar. Prüfzeilen 87.1 bis 87.3 |
| `20261005130000_rv_link_nach_aufheben.sql` | Steht für sich, Reihenfolge egal, ändert keine Daten beim Ausführen, wiederholbar; gehört zum Knopf „Reservierung aufheben“ und zu `finalize-reservierung`. Eine rv-Unterschriftsanfrage, die vor `investments.meta.rvZuletztAufgehobenAm` angelegt wurde, lässt sich nicht mehr unterschreiben (`sign_signature_request`); `get_signature_request` markiert sie als überholt und meldet `rvAufgehoben`, die Signaturseite zeigt „Diese Reservierung wurde aufgehoben, der Link ist nicht mehr gültig.“ `get_signature_request` ist dafür VOLATILE. Neue, nicht öffentliche Hilfsfunktion `rv_anfrage_aufgehoben`. Ohne sie bleibt ein offener Link einer aufgehobenen Reservierung unterschreibbar, `finalize-reservierung` zählt ihn aber nicht mehr. Prüfzeile 87.1 |
| `20261005160000_weekly_call_zwei_runden.sql` | Steht für sich, Reihenfolge egal, wiederholbar; danach `send-weekly-call-punkte` ausrollen. Vorgabe Christian vom 05.10.2026: zwei Weekly Sales Calls montags, 19:00 Uhr Lead-Berater, 19:30 Uhr Vertriebspartner, Leitung (Admin, Inhaber, Vertriebsleitung) beide. Neue Spalte `weekly_call_punkte.call_runde` (Bestand wird 19:00), Funktion `weekly_call_runden(uid)`, eigene Zeilen lesen, eintragen, ändern und löschen nur im eigenen Call (alle vier `wcp_`-Regeln), `call_runde` nach dem Anlegen fest (`trg_wcp_runde_fest`), `weekly_call_punkte_lesen(date, text)` und `weekly_call_termine(text)` nur für die eigenen Calls (alte Fassungen entfernt). Ohne sie zeigt die Seite statt der Punkte einen ruhigen Hinweis und nimmt keine Punkte an. Prüfzeilen 90.1 bis 90.3 |
| `20261005120000_provision_intern_sperren.sql` | Steht für sich, Reihenfolge egal, keine Function auszurollen, wiederholbar, läuft als eine Transaktion (`BEGIN` bis `COMMIT`) und sperrt dafür kurz `objekte` und `wohnungen` gegen Schreiben. Vorgabe Christian vom 05.10.2026: Provisionsfelder aus Investagon lesen nur Admin, Inhaber und Buchhaltung. Neue Tabelle `investagon_intern` mit `commission`, `commission_comment`, `userCommissions`, `selling_price_commission`, `selling_price_commission_manual`, `sellingPriceCommission`, `transaction_broker_rate`, `listing_broker`. **Ändert Bestandsdaten:** kopiert erst vollständig, vergleicht (bricht bei Abweichung ab, bevor etwas entfernt wird) und entfernt die Felder dann aus `meta.investagonRaw` von 97 Objekten und 618 Einheiten. Ein Auslöser auf `objekte` und `wohnungen` trennt sie künftig bei jedem Schreiben von `meta` ab, auch beim Import, und ergänzt die Kopie. Die Eigenprovisionsvereinbarungen (Kategorie „intern“) bleiben für alle Objektrollen sichtbar, an Dokumenten und Speicher ändert sich nichts. Prüfzeilen 88.1 bis 88.4 |
| `20261007100000_sa_fester_link.sql` | **Nach `20261004130000_absicherung_lesen.sql`** (deren `cleanup_expired_tokens()` würde sonst wieder offene Links löschen), danach `send-sa-invitation`, `send-sa-abbrecher-reminder`, `submit-sa-signature` und `finalize-selbstauskunft` ausrollen, dann Publish. Wiederholbar; ändert Bestandsdaten nur, indem jeder offene, noch gültige Selbstauskunfts-Link mindestens 30 Tage gilt. Freigabe der Geschäftsführung vom 07.10.2026: ein fester Link je Kontakt, Investment und Person, ausgestellt nur über `sa_link_ausstellen` (nur service_role): andere Adresse wird widerrufen (neuer Status `widerrufen`), gleiche Adresse wiederverwendet und auf 30 Tage verlängert. Öffnen und Speichern verlängern ebenso. `get_sa_fill_token` liefert bei offenem Link den Stand aus `investments.meta.saData`, ein Link für Person 2 sieht und schreibt nur `person2Data`. `update_sa_fill_token_data` sperrt die Zeile und schreibt nur, wenn das Investment zum Kontakt gehört. Offene Links werden nie geleert oder gelöscht; abgeschlossene verlieren 30 Tage nach dem Abschluss Stand, Name und E-Mail und werden 180 Tage nach Ablauf gelöscht. Neu: `sa_link_nachfolger` (ältere Links leiten auf den festen Link weiter) und `sa_neuen_link_anfordern` (Glocke an den Zuständigen, ohne ihn an Admin, Inhaber, Vertriebsleitung, höchstens einmal je Kontakt und Investment in 24 Stunden), Spalten `sa_fill_tokens.neuer_link_angefordert_am`, `abgeschlossen_am` (ein abgeschlossener Link holt danach nur zwei Stunden lang Angaben seiner eigenen Fassung ab) und `p2_nachforderung_am` (Mail an Person 2 erst nach erfolgreichem Versand vermerkt, sonst beim nächsten Aufruf nachgeholt). Ein Link für Person 2 wird auf der Seite freundlich abgewiesen. Abschicken über `sa_link_abschliessen` (nur service_role): Status, Unterschriften (Person 2 nur die eigene), Stand und `pending` zu `used` in einer Transaktion unter der Sperre des Links. Ohne sie: keine Weiterleitung, kein Knopf, die Seite liest die Kopie am Link, je Versand ein neuer Link. Prüfzeilen 91.1 bis 91.7 |

### Am 30.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260930100000_absicherung_stufe0.sql` | Teil 1, steht für sich, Reihenfolge egal, keine Function auszurollen, ändert keine Daten, wiederholbar. Absicherung Stufe 0 (Christians Grundsatz vom 29.09.2026: direkt schreiben nur Admin und Inhaber, alle anderen über geprüfte Functions). Nimmt nur Rechte weg, die niemand im Browser braucht, sichtbar ändert sich nichts. (1) Die manuelle Sicherung `objekte_sicherung_20260922` (97 Objekte) bekommt Zeilensicherheit, anon, authenticated und PUBLIC verlieren alle Rechte; die Tabelle bleibt stehen. (2) 36 Hintergrund-, Cron- und Serverfunktionen sind nicht mehr über die öffentliche Schnittstelle aufrufbar, darunter `buchung_pipeline_vorwaerts`, `buchung_investment_vorwaerts`, `bewerber_stufe_closing`, `kennzahl_schreiben`, `meeting_mail_claim`, `rotate_audit_log`, `purge_old_activity_log`; Cron, Edge Functions (Dienstschlüssel) und SECURITY-DEFINER-Aufrufer laufen weiter. (3) anon verliert INSERT, UPDATE, DELETE und TRUNCATE auf allen Tabellen und Views in public, authenticated verliert TRUNCATE. Keine Ausnahme nötig, heute schreibt kein öffentlicher Ablauf direkt als anon. Storage und Realtime unberührt. Ein Wächter bricht ab, wenn eine der 36 Funktionen fehlt oder inzwischen von einer Regel, View oder Funktion ohne SECURITY DEFINER gebraucht wird. Ohne sie bleiben die Lücken offen, sonst läuft alles wie bisher. Neue Tabellen oder Funktionen bekommen in Supabase wieder Standardrechte; meldet 50.5 oder 50.6 etwas, diese Migration erneut ausführen. Prüfzeilen 50.1 bis 50.7 |
| `20260930110000_absicherung_geld_vertraege.sql` | Teil 2, setzt `20260929140000_provisionssatz_ab_reservierung` voraus (am 29.09.2026 gelaufen). **Reihenfolge verbindlich:** 1. Push nach main, 2. in Lovable ausrollen: `invite-user`, 3. Publish, 4. erst dann ausführen; läuft sie vor dem Publish, verwirft die Datenbank die alten Direktwege still. Absicherung Geld und Verträge (Christians Grundsatz vom 29.09.2026: nur Admin und Inhaber schreiben direkt). (1) `investments`: Wächter `trg_absicherung_investments` hält Unterschriften (sa*/rv*), `saPdf`, Abwicklung (Kaufpreiseingang, Provisionsrechnung und Auszahlung nur Admin, Inhaber, Backoffice; Grundbuch, Fälligkeit, Übergabe auch der zuständige Partner), `notarTerminBestaetigt` und `aftersalesBeratung` gegen direkte Schreibzugriffe von Nicht-Admins fest (alter Wert bleibt, kein Abbruch); `merge_investment_meta` lässt Nicht-Admins diese Schlüssel nur zurücksetzen. Neue Wege: `investment_sa_pdf_vermerken`, `investment_abwicklung_speichern`, `investment_loeschen`. (2) Investments löschen direkt nur Admin und Inhaber, Partner über die Funktion nur vor der Reservierung. (3) `kontakte`: `setter`, `erstelltVonName`, `kontaktTyp` und `berater` (ohne Zuständigkeitswechsel) nur Admin, Inhaber, Server; endgültig löschen nur Admin, Inhaber, Vertriebsleitung. (4) `tippgeber`: ändern nur Admin und Inhaber, anlegen nur für sich selbst ohne Portalkonto. (5) `empfehlungen`: Prämie und Auszahlungsmarke nur Admin und Inhaber, Partner legen nur für eigene Kunden an. Prüfzeilen 51.1 bis 51.10. |
| `20260930120000_absicherung_objekte_speicher_chats.sql` | Teil 3, steht für sich, ändert keine Daten, wiederholbar. **Reihenfolge verbindlich:** 1. Push nach main, 2. in Lovable ausrollen: `objekt-texte-ki` und `save-expose-pdf`, 3. Publish, 4. erst dann diese Migration. Läuft sie vor dem Publish, lehnt die Datenbank das Aufheben einer Reservierung und das Anlegen eines Chats der alten Seitenfassung für alle außer Admin und Inhaber ab; läuft sie vor dem Ausrollen, speichert `objekt-texte-ki` die Objekttexte für alle außer Admin und Inhaber nicht mehr. Grundsatz Christian vom 29.09.2026: Nur Admin und Inhaber schreiben direkt, alle anderen über geprüfte Abläufe, was heute geht, geht weiter. (0) Wächter: Eine erlaubende ALL-Regel auf den betroffenen Tabellen oder eine unerwartete erlaubende Speicherregel der vier Eimer bricht mit Meldung ab. (1) Objektbereich (`objekte`, `wohnungen`, `objekt_bilder`, `wohnungs_bilder`, `wohnungs_dokumente`, `objekt_dokumente`, `objekt_einreichungen`): alle erlaubenden INSERT-, UPDATE- und DELETE-Regeln fallen; Anlegen und Ändern nur Admin, Inhaber und Rolle objektpartner am eigenen Objekt (`erstellt_von`, ein neuer Auslöser setzt es beim Anlegen aus dem Browser und hält es danach fest); Löschen nur dort über Admin hinaus, wo es heute schon ging. Zwei neue Wege: `einheit_reservierung_aufheben(uuid)` (Vertrieb nur beim eigenen Kunden, verkauft nur die Leitung) und `einheit_belegung_abgleichen(uuid)` (nur wer das Investment nutzen darf; reserviert nur wer reservieren darf, verkauft dazu das Backoffice; verkauft nur bei „abgeschlossen“; unterschriebene Reservierungsanfrage `rv_*` zum Investment nötig für reserviert und für den Verkauf einer noch freien Einheit, Admin und Inhaber ausgenommen (Papier-Reservierungen); Exklusivzuweisung und fremde Vormerkung wie `vormerke_einheit`; kein fremder Kunde, keine Globalobjekt-Einheit; Auslöser ist der zuständige Partner). (2) Speicher: `unterlagen` überschreiben und löschen nur Admin, Inhaber, eigener Arbeitsordner und bei Pfaden eines Kunden der zuständige Partner (auch Vertretung), Backoffice, Vertriebsleitung, unter `finanzierung/` dazu Finanzierungspartner; Hochladen unverändert. `praesentation-pdfs` schreiben nur Admin und Inhaber, wortgleich mit 20260918170000 (dessen Regeln standen am 29.09.2026 nicht in der Datenbank). `objekt-medien` nur Admin, Inhaber, Objektpartner am eigenen Objekt und Objektfotos am Investment, Einreichungen unverändert. `ansprechpartner` nur Admin und Inhaber. (3) Chats: keine INSERT-Regel mehr auf `chat_teilnehmer`, Eintragen nur über `chat_teilnehmer_eintragen(uuid, jsonb)`, `kundenchat_starten` und den Tippgeber-Chat. Auslöser an `chat_nachrichten`: Wer aus dem Browser schreibt und nicht Admin ist, ändert nur die eigene Lesebestätigung; DEFINER-Funktionen wie `kontakte_zusammenfuehren` bleiben unberührt. (4) Hausverwaltung (neun Tabellen): Anlegen und Ändern nur Rolle hausverwaltung, Admin, Inhaber; Löschen unverändert. Ohne sie nimmt der Code überall den bisherigen Weg. Prüfzeilen 52.1 bis 52.14 |
| `20260930150000_abschluss_nur_backoffice.sql` | Teil 4, steht für sich, keine Function auszurollen, ändert keine Daten, wiederholbar; am besten nach dem Publish, damit die Oberfläche den Hinweis schon zeigt. Christians Entscheidung vom 29.09.2026: Die Stufe „abgeschlossen“ setzen und verlassen nur Admin, Inhaber, Backoffice und der Server. Wächter `trg_absicherung_pipeline_abschluss` auf `investments` und `kontakte` (meta.pipelineStufe); von anderen Rollen bleibt der gespeicherte Wert stehen, ohne Abbruch. Anders als 20260930110000 zählen SECURITY-DEFINER-Funktionen nicht pauschal als geprüft, weil `merge_investment_meta` sonst den Weg offen ließe. Der Abschluss über die Abwicklungskarte (Auszahlung bestätigt durch das Backoffice) läuft weiter. Prüfzeilen 55.1 bis 55.3 |
| `20260930130000_lead_pakete.sql` | Teil 5, steht für sich, Reihenfolge egal, keine Function auszurollen, wiederholbar. Leadpakete (Christians Auftrag vom 29.09.2026): Tabelle `lead_pakete` (Partner, Anzahl, Paketpreis, Zahlungseingang, Freischaltung, Status, Bemerkung, Herkunft Bewerbung eindeutig) und `lead_paket_zuweisungen` (welcher Lead aus welchem Paket, wann, durch wen, Reklamation samt Grund, Ersatz für). Lesen: Admin, Inhaber, Vertriebsleitung alles, Partner nur eigene. Kein direktes Schreiben, nur über `lead_paket_anlegen`, `lead_paket_aendern` (Admin, Inhaber), `lead_paket_aus_bewerbung` (HR, Admin, Inhaber, Backoffice wie beim Bearbeiten von Bewerbungen, Werte nur aus der Bewerbung) sowie `lead_paket_zuweisung_vermerken` und `lead_paket_reklamation` (Admin, Inhaber, Vertriebsleitung; im eigenen Paket nur Admin und Inhaber). Vermerkt werden nur nicht gelöschte Leads der Gesellschaft, ein Lead zählt paketübergreifend nur einmal. Das Paket entsteht aus der Bewerbung (`lead_paket_aus_bewerbung`, beim Bestätigen der Zahlung und beim Anlegen des Nutzers), sobald die Zahlung bestätigt ist, das Nutzerkonto eine Partnerrolle hat und seine E-Mail zur Bewerbung passt. Daten als Tag in Berlin, Freischaltung nie vor der Zahlung. Beim Ausführen wird nichts aus dem Bestand übernommen. Legt jemand außer Admin und Inhaber ein Paket neu an, bekommen Admin und Inhaber eine Glocke zur Prüfung (nicht der Auslöser). Ohne sie fehlen nur das Feld „aus Paket“ und der Abschnitt Leadpakete. Prüfzeilen 53.1 bis 53.9 |
| `20260930140000_terminseite_dauer.sql` | Teil 6, steht für sich, setzt `20260929130000_partnertermin_nur_partner` voraus (am 29.09.2026 gelaufen), keine Function auszurollen, ändert keine Daten, wiederholbar. Feste Dauer auf der Terminseite (Christians Auftrag vom 29.09.2026): Erstgespräch 20 Minuten (die Seite zeigt „15 bis 20 Minuten“), Beratungsgespräch 45 Minuten, beide ohne Blick auf eigene Terminarten in `buchung_terminarten`, die bisher übersteuerten (bei einem Partner stand die Beratung auf 15 Minuten). `partnertermin_zugang` liefert diese Dauern, `partnertermin_bestaetigen` speichert sie in Buchung, Aktivität und Aufgabe. Objekt- und Finanzierungsgespräch unverändert. Rumpf sonst wortgleich zu 20260929130000, die seit dem 29.09.2026 in der Datenbank läuft. Ohne sie zeigt die Seite die Texte schon richtig, gespeichert werden aber weiter 30 und 60 Minuten beziehungsweise die eigene Terminart. Prüfzeilen 54.1 und 54.2 |

Prüfen, ob sie gelaufen sind: Zeilen 50.1 bis 55.3 in `99_PRUEFUNG.sql`.

### Am 29.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260929130000_partnertermin_nur_partner.sql` | Teil 1, steht für sich. Terminseite nur noch für den angemeldeten Partner, dem der Link gehört (Christians Freigabe vom 29.09.2026): `partnertermin_zugang` gibt allen außer `buchung_links.mitarbeiter_id` NULL zurück (wie ein unbekannter Link), `partnertermin_bestaetigen` lehnt sie mit „Kein Zugang“ ab. Beide nur noch für `authenticated`, nicht mehr für `anon` und PUBLIC. Dazu in `partnertermin_bestaetigen`: Steht das Investment fest (am Link, gewählt oder das einzige), rückt genau dieses je Gesprächsart vor, nur vorwärts über `buchung_pipeline_rang`, per `||` auf `meta.pipelineStufe`. Das löst den Provisions-Trigger aus Teil 1 aus, gewollt und unschädlich: Er stellt `lockedProvisionRate*` aus dem alten Stand wieder her, und die Stufen reichen höchstens bis `objektauswahl`, also nie in die Kaufphase. Ohne feststehendes Investment wie bisher `buchung_investment_vorwaerts`. Buchung, Aktivität und Aufgabe tragen „Über die Terminseite eingetragen“ statt „Vom Kunden … bestätigt“. Eine Transaktionssperre je Link verhindert eine zweite Buchung bei gleichzeitigem Aufruf. Je Gesprächsart eine eigene Buchung: Aktualisiert wird nur eine Buchung desselben Anlasses, deren Termin nicht mehr als eine Stunde vorbei ist; ein anderer Anlass legt Buchung, Aktivität und Aufgabe neu an (bisher überschrieb ein Beratungsgespräch das Erstgespräch). Einmalige Links tragen weiter genau eine Buchung. `partnertermin_zugang` liefert dazu `termine` je Anlass. Das Investment am Link und die Auswahl von der Seite zählen nur, wenn sie zum Kontakt gehören und noch laufen, auch beim Vorrücken. Signaturen, SECURITY DEFINER und search_path unverändert. Keine Edge Function und keine andere Datenbankfunktion ruft die beiden auf. Mehrfach ausführbar, ändert keine vorhandenen Daten. Ohne sie verlangt die Seite trotzdem schon die Anmeldung und weist Fremde ab, nur die Datenbank ließe den Aufruf mit dem Link noch zu, und bei mehreren Investments bleibt das gewählte in der Stufe stehen. Prüfzeilen 49.1 bis 49.3 |
| `20260929140000_provisionssatz_ab_reservierung.sql` | Teil 1, muss vor Teil 2 laufen, keine Function auszurollen. Provisionssatz erst ab Reservierung (Christians Entscheidung vom 29.09.2026). (1) Neue Funktion `provisionssatz_ermitteln(uuid)`: die Ermittlung aus dem alten Trigger (Partner laut Kennung, eigen oder zugewiesen, Satz aus der Nutzerverwaltung), nur für den Server. (2) `pipelinestufe_ist_kaufphase(text)`: Reservierung bis Abgeschlossen. (3) Trigger `trg_investments_provisionssatz_festschreiben` feuert jetzt bei INSERT und UPDATE OF meta: schreibt den Satz des aktuellen Partners beim Eintritt in die Kaufphase fest (Quelle `serverseitig`, dazu `lockedProvisionRatePartner` und `lockedProvisionRateAnlass`), vorher nichts. Gültig ist nur ein Satz mit Anlass; ältere, auch die mit Quelle `serverseitig` vom alten INSERT-Trigger, werden beim Eintritt neu ermittelt. Kommt ein Vorgang mit gültigem Satz in die Kaufphase zurück und gehört inzwischen einem anderen Partner, wird ebenfalls neu ermittelt. Die Schlüssel `lockedProvisionRate*` schreibt nur noch er; was der Browser mitschickt, wird durch den gespeicherten Stand ersetzt, auch wenn `meta` kein Objekt ist. Fehler landen als `lockedProvisionRateFehler` am Investment und werden beim nächsten Speichern erneut versucht. Aufträge `nachtrag` und `verwerfen` nimmt er nur aus SQL-Editor oder Server an. (4) Trigger `trg_kontakte_provisionssatz_partnerwechsel`: Ändert sich `zustaendig_id`, bekommen die Investments in der Kaufphase den Satz des neuen Partners; ohne neuen Partner bleibt der Satz. (5) Trigger `trg_user_settings_provision_schuetzen`: `custom_provision_rate`, `_eigen`, `_setter`, `karriere_override`, `provision_locked` und `provision_locked_at` ändern nur Admin, Inhaber und der Server; für alle anderen bleibt still der alte Wert, das übrige Speichern geht weiter. Die Nutzerverwaltung schreibt über `merge_user_settings` und kann das weiter. (6) `provisionssatz_fuer_partner` und `investment_partner_id` auch von PUBLIC entzogen, bisher konnte jeder Angemeldete die Sätze aller Partner abfragen. Keine Bestandsdaten, mehrfach ausführbar. Ohne die Migration läuft alles wie bisher. Prüfzeilen 46.1 bis 46.8 (34.3 erkennt die neue Fassung mit) |
| `20260929150000_provisionssatz_nachtrag.sql` | Teil 2, **nur nach Teil 1**, im SQL-Editor ausführen (bricht sonst ab), **ändert Daten**. Datenkorrektur Provisionssätze im Bestand (Christians Entscheidung vom 29.09.2026). Alt ist jeder Satz ohne `lockedProvisionRateAnlass`. (1) Alte Sätze vor der Kaufphase werden entfernt, damit sie bei der Reservierung neu gesetzt werden; Endzustände bleiben. (2) Alte Sätze in der Kaufphase, auch abgeschlossene, und (3) Kaufphase ganz ohne Satz bekommen den Satz des aktuell zugewiesenen Partners, Quelle `nachgetragen`, mit Zeitpunkt und Partnerkennung. Ermittelt vom Trigger aus Teil 1. Investments mit Fehlervermerk oder ohne ermittelbaren Partner bleiben unberührt. Gegenprobe am Ende, sonst Abbruch ohne Änderung; das Ergebnis erscheint als Tabelle. Mehrfach ausführbar. Prüfzeilen 47.1 und 47.2 |
| `20260929200000_signaturanfragen_nur_serverseitig.sql` | Teil 3, nach Teil 1 und 2 (Provisionssatz, Zeitstempel davor), inhaltlich unabhängig von ihnen. **Reihenfolge verbindlich:** 1. Push nach main, 2. in Lovable ausrollen: `signatur-link-erinnern` (neu), `finalize-aftersales-beratung`, `send-signature-request`, `send-reservation-signature`, `send-vertrag-signature`, 3. Publish, 4. erst dann diese Migration. Läuft sie vor dem Publish, liest die Liveseite noch `token` und bricht an der Aftersales-Karte und der Gegenzeichnungs-Erinnerung. Unterschriftsanfragen nur serverseitig (Christians Entscheidung vom 29.09.2026, samt Nachbesserung aus der Gegenprüfung). (1) Auf `signature_requests` fallen alle erlaubenden INSERT-, UPDATE- und ALL-Regeln weg, dazu jede erlaubende SELECT-Regel außer den beiden unten. (2) Lesen: „Interne sehen Signaturanfragen eigener Kunden“ statt „Interne sehen Signatur-Requests“, Regel wie bei `investments` (`darf_alle_kunden_sehen` oder `ist_eigener_kontakt`), Partnerverträge über `darf_bewerberbereich`; Kunden lesen weiter ihre eigenen, Löschen weiter nur Admin. (3) Tabellenrechte: `anon` verliert alles, `authenticated` verliert SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER und bekommt SELECT spaltenweise zurück, ohne `token`. Mit dem Token ließe sich im Namen des Kunden unterschreiben. Eine neue Spalte muss künftig dort ergänzt werden. (4) Neue Funktion `aftersales_signatur_anlegen(uuid, jsonb, text)`: Kontakt aus dem Investment, Name und Adresse aus dem Kontakt, Formular höchstens 32 KB, ältere offene Aftersales-Anfragen desselben Investments werden `ueberholt`, abgelehnt, wenn der Partner schon unterschrieben hat. Hausverwaltung, Objektpartner, Marketing, HR und Versicherungsexperte sehen Kundenanfragen nur noch als Zuständige. Mehrfach ausführbar, ändert keine Daten. Ohne sie legt der Aftersales-Dialog die Anfragen weiter direkt an (Rückfall im Code). Prüfzeilen 48.1 bis 48.6 (48.6 meldet Spalten ohne Leserecht) |
| `20260928230000_glocke_ohne_zustaendigen_an_leitung.sql` | Teil 1, steht für sich, braucht keine Function. Glocke ohne Zuständigen auch an die Vertriebsleitung (Christians Entscheidung vom 28.09.2026): `create_empfehlung_kontakt` und `create_tippgeber_lead` melden einen neuen Kontakt ohne Zuständigen an Admin, Inhaber und Vertriebsleitung statt nur an Admin und Inhaber, jede Person einmal. Übriger Rumpf wortgleich zu 20260928180000, Signaturen und Rechte unverändert, mehrfach ausführbar, ändert keine Daten. Ohne sie erfährt die Vertriebsleitung nur von diesen beiden Fällen nichts. Prüfzeile 39.1 |
| `20260929090000_glocke_nur_an_zustaendigen.sql` | Teil 2, nach Teil 1, braucht keine Function. Glocke nur an den Zuständigen (Christians Regel vom 29.09.2026): `create_empfehlung_kontakt` meldet eine Empfehlung, die einen bestehenden Kontakt trifft (Dublette), nicht mehr an den Partner des Empfehlenden, wenn der bestehende Kontakt einem anderen Partner oder niemandem gehört. Dann geht die Glocke „Neue Empfehlung: Dublette prüfen“ an Admin, Inhaber und Vertriebsleitung, jede Person einmal. Ohne Dublette oder bei derselben Zuständigkeit unverändert. Übriger Rumpf wortgleich zu 20260928230000 (enthält dessen Änderung schon), Signatur und Rechte unverändert, mehrfach ausführbar, ändert keine Daten. Die Glocken-Kopien an die Vertretung bleiben (Christians Entscheidung vom 29.09.2026), der Trigger `trg_benachrichtigung_an_vertretung` wird nicht angefasst. Ohne die Migration geht die Dubletten-Glocke weiter an den Partner des Empfehlenden. Prüfzeilen 40.1 und 40.2 |
| `20260929110000_partnertermin_umlaute.sql` | Teil 3, steht für sich, Reihenfolge egal, keine Function auszurollen. Terminseite mit echten Umlauten (Christians Freigabe vom 29.09.2026): `partnertermin_zugang` und `partnertermin_bestaetigen` liefern die vier Gesprächsarten jetzt als „Erstgespräch“, „Beratungsgespräch“, „Objektgespräch“ und „Finanzierungsgespräch“, die Beschreibungen mit „klären“, „ausführliche“, „nächsten“. Dieselben Texte landen beim Bestätigen in Buchung, Aktivität und Aufgabentitel, dazu Hinweis an der Buchung, Details der Aktivität, Beschreibung der Aufgabe und drei Fehlermeldungen mit Umlauten. Kennungen wie `erstgespraech`, Logik, Signaturen, SECURITY DEFINER, search_path und Rechte (anon, authenticated) unverändert, übriger Rumpf wortgleich zu 20260927120000. Alte Buchungen, Aktivitäten und Aufgaben bleiben, wie sie sind. Mehrfach ausführbar, ändert keine Daten. Ohne sie zeigt die Seite schon die richtigen Texte, nur die Akte bekommt weiter die Ersatzschreibweise. Prüfzeilen 41.1 bis 41.2 |
| `20260929141000_zoom_tabellen_entfernen.sql` | Teil 4, steht für sich, Reihenfolge egal, keine Function auszurollen. **Löscht Daten, nicht umkehrbar.** Zoom aus dem CRM (Christians Entscheidung vom 29.09.2026, nur der Weekly Sales Call bleibt, sein Link steht im Code). Entfernt die Tabelle `zoom_connections` (OAuth-Schlüssel verbundener Zoom-Konten) samt Regel, Trigger und Indizes, die Triggerfunktion `set_zoom_connections_updated_at()` und die Spalte `profiles.zoom_link`. Ohne CASCADE: Hängt noch eine Sicht, Regel oder ein Trigger-Ausdruck daran, bricht Postgres ab und nichts ist gelöscht; ein Wächterblock bricht außerdem ab, wenn eine Funktion `zoom_connections` nennt oder ein Trigger an `profiles` `zoom_link` anfasst. `aktivitaeten.zoom_link` (Videoraum-Link) und die meta-Felder `zoomMeeting`, `zoomReminderSent`, `terminZoomUrl` in `kontakte.meta` bleiben. Vorschau vor dem Lauf steht im Kopf der Datei. Mehrfach ausführbar. Ohne sie läuft alles weiter, die Tabelle und Spalte liegen nur ungenutzt herum. Prüfzeilen 42.1 bis 42.3 (42.3 meldet einen noch vorhandenen Zeitplan für eine Zoom-Function) |

### Am 28.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260928160000_glocke_absichern.sql` | Teil 1, steht für sich. Vorher ausrollen: `finalize-vertrag` und `send-bewerber-kennenlernen-erinnerungen` (sie schreiben jetzt Pfade in die Glocke; die alten Fassungen schreiben volle Adressen, die ab jetzt abgelehnt werden), außerdem `submit-lead` (Positivliste für `meta`) und `invite-user` (Zuständigkeit). Glocke gegen gefälschte Meldungen (Christians Freigabe vom 28.09.2026) samt drei Umgehungswegen aus der Gegenprüfung. (1) Auslöser `trg_glocke_link_pruefen` auf `benachrichtigungen` und `scheduled_notifications`: Der Link muss ein Pfad im CRM sein (ein „/“ am Anfang, kein „//“, kein „/\“, keine Steuerzeichen) oder leer, für alle Schreibwege, auch den Dienstschlüssel. Geprüft wird beim Anlegen und wenn sich der Link ändert; alte Zeilen bleiben unverändert und lassen sich weiter als gelesen markieren. (2) Neue Funktion `darf_glocke_senden(uuid, text, uuid)`: an sich selbst immer, Admin, Inhaber, Vertriebsleitung und Backoffice an alle, jede interne Rolle an die Stellen im Haus und an Vertriebspartner, an Chatpartner, an Zuständigen und Kundenkonto eines Kontakts, den man betreut oder sehen darf, ein Kunde an den Zuständigen seines Kontakts. Die Einfügeregel heißt jetzt „Glocke nur an erlaubte Empfaenger“ und ersetzt „Nutzer erstellen eigene Benachrichtigungen“. Die Warteschlange nimmt Empfänger und Rollen nach derselben Regel an, nie die ganze Rolle Vertriebspartner, ein Kunde nur die Rolle Finanzierungspartner und nur zu seinem eigenen Kontakt. (3) Neue Spalte `absender_id`, vorbelegt mit dem angemeldeten Nutzer, aus dem Browser nicht zu fälschen. (4) Auslöser `trg_kontakt_zuordnung` auf `kontakte`: Portalzugang (`meta.authUserId`, `meta.person2.authUserId`) und Eigentum (`erstelltVonId`, `empfehlungsgeberVpId`, `tippgeberBenutzerId`, `setterId`) ändern nur Admin und Inhaber, der Dienstschlüssel nur an bestehenden Kontakten. Beim Anlegen fällt der Zugang immer weg (außer Admin, Inhaber), das Eigentum darf nur auf den Anlegenden oder den Zuständigen zeigen; beim Ändern bleibt still der alte Wert, nie ein Abbruch. Erlaubt bleiben das Zusammenführen, „Person 2 überall entfernen“ und die Anlage durch Partner, Setterin, Tippgeber- und Empfehlungsfunktionen. Dazu zwei Suchindizes auf den Zugang. (5) `merge_kontakt_meta` prüft für Rollen ohne Blick auf alle Kunden, ob sie den Kontakt betreuen. Mehrfach ausführbar, löscht nichts. Ohne sie läuft alles wie bisher, nur ohne Schutz. Prüfzeilen 33.1 bis 33.9 |
| `20260928190000_lead_rueckgabe_ohne_lesesperre.sql` | Teil 2, steht für sich, kann vor oder nach Teil 1 laufen. Rückgabe an die Zentrale über die neue Funktion `lead_an_zentrale_zurueckgeben(uuid, jsonb)` (SECURITY DEFINER). Die Migration 20260928150000 reichte nicht: Postgres prüft bei einem UPDATE auch die Leseregel gegen die neue Zeile, und nach der Rückgabe gehört ein zugeteilter Lead dem Partner nicht mehr. Die Funktion setzt Zuständigkeit und Beraternamen leer und schreibt die Verlaufsspur, erlaubt nur dem bisherigen Zuständigen und der Leitung (`darf_leads_zuweisen`), der Trigger `kontakt_zustaendigkeit_schuetzen` läuft weiter mit. Mehrfach ausführbar. Ohne sie nimmt „Alle Kontakte“ den alten Weg: Selbst angelegte Leads gehen zurück, zugeteilte werden abgelehnt und im Dialog genannt. Prüfzeile 35.1 |
| `20260928180000_kennung_statt_name.sql` | Teil 3, steht für sich, setzt nur `berater_name_normal` aus 20260918220000 voraus, Reihenfolge zu Teil 1 und 2 egal. Kennung statt Name (Auftrag vom 28.09.2026). Drei Funktionen suchten den Partner über den Namen und nahmen bei zwei Gleichnamigen das neueste Profil: `create_empfehlung_kontakt` (Empfehlung aus dem Kundenportal) und `create_tippgeber_lead` (Tippgeber-Portal), wenn am Kunden bzw. Tippgeber keine Kennung steht. Jetzt nur noch bei genau einem Profil; sonst bleibt der neue Kontakt ohne Zuständigkeit und die Glocke geht wie bei jedem Kontakt ohne Partner an Admin und Inhaber. Im Trigger `investments_provisionssatz_festschreiben` zählt „eigen“ ohne `erstelltVonId` nur noch, wenn der Name des Erstellers genau ein Profil meint und dieses der ermittelte Partner ist, sonst „zugewiesen“ (die vorsichtigere Annahme). Die Kennung entscheidet überall weiter zuerst. Übrige Rumpfteile wortgleich, Signaturen und Rechte unverändert, keine Daten angefasst, mehrfach ausführbar. Ohne sie raten nur diese drei Funktionen weiter, die Anwendung läuft. Prüfzeilen 34.1 bis 34.4 |
| `20260928210000_notiz_favoriten.sql` | Teil 4, steht für sich, Reihenfolge egal. Favoriten für Notizen im Kundenprofil (Auftrag vom 28.09.2026): zwei neue Spalten an `aktivitaeten`, `angepinnt_am` (gesetzt heißt angepinnt) und `angepinnt_von` (Kennung). Die Markierung gilt gemeinsam für alle am Kunden. Keine neue Regel, die bestehende Update-Regel „Interne bearbeiten Aktivitaeten (scoped)“ deckt das Anpinnen ab, also dieselben Leute wie beim Bearbeiten der Notiz. Mehrfach ausführbar, löscht nichts. Ohne sie läuft alles weiter, nur zeigt niemand einen Favoriten, und der Stern meldet, dass Favoriten noch nicht eingerichtet sind. Prüfzeile 36.1 |
| `20260928200000_handbuch_sa_direkt.sql` | Teil 5, steht für sich, Reihenfolge egal, keine Function auszurollen. Selbstauskunft aus dem Handbuch ohne zweites Kontaktformular (Auftrag vom 28.09.2026). (1) Neue Funktion `handbuch_sa_starten(text)` (SECURITY DEFINER, anon und authenticated): legt zum gültigen Handbuch-Token einen frischen Ausfüll-Link in `sa_fill_tokens` für genau diesen Lead und dieses Investment an und gibt nur dessen Token zurück. Vorbelegt nur Vor- und Nachname sowie Beschäftigung und Ziel aus dem Konfigurator (stehen ohnehin im PDF), E-Mail leer, kein angefangener Stand. Kein Link (`liegt_vor`), wenn die Selbstauskunft unterschrieben ist, das Investment abgeschlossen ist, Person 2 noch unterschreibt (`saSignaturePartial`) oder für das Investment schon ein Link abgeschickt wurde. Höchstens zehn Links je Kontakt und Tag, gezählt unter einer Sperre je Kontakt, Laufzeit sieben Tage, keine Abbrecher-Erinnerung. (2) Neue Spalte `sa_fill_tokens.nur_am_link` (Vorgabe false); `update_sa_fill_token_data` schreibt für diese Links den Zwischenstand nur an den Link, nicht an `investments.meta.saData` (das schreibt `submit-sa-signature` beim Abschicken). Alle anderen Links wie bisher. (3) `handbuch_abrufen` gibt `saToken` nicht mehr heraus, nur noch `saStatus`: Der gespeicherte Link öffnete über `get_sa_fill_token` den angefangenen Stand, und das Handbuch-Token steht jetzt im PDF. Mehrfach ausführbar. Ohne sie nimmt die neue Startseite `/handbuch/ergebnis/:token/selbstauskunft` den bisherigen Weg (gespeicherter Link, sonst offene Selbstauskunft). Prüfzeilen 37.1 bis 37.3 |
| `20260928220000_sa_link_nur_offen_lesbar.sql` | Teil 6, steht für sich, Reihenfolge zu Teil 5 egal, keine Function auszurollen. Leselücke der Selbstauskunfts-Links, Stufe 1 (Christians Freigabe vom 28.09.2026). `get_sa_fill_token` gab jedem mit dem Link den gespeicherten Stand (`prefill_data`), Name und E-Mail heraus, auch nach dem Abschicken (`used`) und nach dem Ablauf. Jetzt nur noch bei offenem (`pending`) und gültigem Link; sonst kommen nur Kennung, Status, Ablauf und Sprache, `prefill_data`, `email`, `name`, `kontakt_id`, `investment_id`, `created_by` und die drei Zeitpunkte zu Mail, Link und Erinnerung sind leer. Signatur, Rückgabetyp, SECURITY DEFINER, search_path und Rechte (anon, authenticated) unverändert, übriger Rumpf wortgleich zu 20260925180000. Mehrfach ausführbar, ändert keine Daten. Ohne sie liefert der Link den Stand weiter wie bisher; die Seite zeigt „Bereits ausgefüllt“ und „Link abgelaufen“ vor und nach der Migration gleich. Prüfzeile 38.1 |
| `20260928120000_objekt_lotse.sql` | Teil 1, steht für sich, muss **vor** dem Ausrollen von `objekt-lotse` laufen. MORE Lotse, Stufe 1 (Christians Freigabe vom 28.09.2026). Drei neue Tabellen: `lotse_zustimmung` (je Nutzer die bestätigte Fassung des Hinweises „Umgang mit KI“, jeder liest und schreibt nur seine Zeile, den Zeitpunkt setzt die Datenbank), `lotse_nachrichten` (Fragen und Antworten, lesen und löschen nur die eigenen Zeilen, auch Admin nicht fremde, schreiben nur die Function) `lotse_unterlagen_auszug` (Sach- und Faktenauszüge der Unterlagen mit Schema-Fassung, ohne Regel für normale Nutzer, nur Dienstschlüssel) und `lotse_kontingent` (Tageskontingent je Nutzer, ohne Regel für Nutzer). Funktion `lotse_kontingent_reservieren(uuid, integer)` zählt atomar hoch (nur Service-Rolle), `lotse_aufraeumen()` löscht Nachrichten und Kontingentzeilen älter als 90 Tage, aufgerufen vom pg_cron-Job `lotse-verlauf-aufraeumen` täglich um 03:15 UTC. Mehrfach ausführbar; wer die erste Fassung vom 28.09.2026 schon ausgeführt hat, führt sie noch einmal aus. Ohne sie zeigt der Reiter „MORE Lotse“ „Der Lotse wird gerade eingerichtet“, der Investmentrechner liest Mietverträge dann ohne gespeicherte Auszüge, sonst ändert sich nichts. Prüfzeilen 30.1 bis 30.9 |
| `20260928130000_support_antworten_melden.sql` | Teil 2, steht für sich. Support-Tickets (Christians Freigabe vom 28.09.2026). Vier Funktionen: `support_ticket_nachricht_anhaengen(uuid, text, text)` hängt eine Nachricht unter Zeilensperre an (kein Datenverlust mehr bei gleichzeitigen Antworten), prüft die Berechtigung (Ersteller ins eigene Ticket, Admin, Inhaber und Backoffice als Support, Vertriebsleitung nur lesen), setzt Absender aus dem Profil („MOREImmo Support (Vorname)“ statt „Admin“), stellt „neu“ auf „in_bearbeitung“ und schreibt bei einer Support-Antwort die Glocke für den Ersteller mit Link auf das Ticket. `support_ticket_gelesen(uuid)` setzt nur beim eigenen Ticket `meta.gelesen_am_ersteller`. `support_ticket_antwort_melden(uuid)` für den Knopf „Antwort erneut melden“ (Admin, Inhaber, Backoffice): Glocke, Lesemarke zurück. `support_ticket_mail_beanspruchen(uuid)` (nur Service-Rolle) ist die 15-Minuten-Bremse der Mail aus `support-antwort-mail`. Mehrfach ausführbar. Ohne sie hängt der Browser Nachrichten wie bisher an, die Glocke kommt aus dem Browser, eine Mail geht nicht hinaus, die Lesemarke bleibt im Browser. Prüfzeilen 31.1 bis 31.5 |
| `20260928150000_lead_rueckgabe_an_zentrale.sql` | Teil 3, steht für sich. Zwei Dinge. (1) Vertriebspartner können ihre Leads an die Zentrale zurückgeben: Die Regel „Vertriebspartner bearbeiten eigene Kontakte“ bekommt im WITH CHECK den Fall `zustaendig_id IS NULL` (zurück in den offenen Pool); das USING bleibt gleich. Bisher lehnte die Datenbank die Rückgabe bei jedem Lead ab, den die Zentrale zugeteilt hatte. Wer zurückgeben darf, prüft weiter der unveränderte Trigger `kontakt_zustaendigkeit_schuetzen`: nur der bisherige Zuständige, keine Vertretung. Der Vertriebsleiter braucht nichts Neues, er durfte schon vorher. (2) `claim_lead` übernimmt einen Lead aus dem Pool nur noch für admin, inhaber, individuell, vertriebsleiter und setterin (die Rollen der Lead-Verwaltung), nicht mehr für jede interne Rolle; Partner bekommen `success = false`. Signatur und Rechte unverändert. Eine Sperre nach Stufe oder Investment ist bewusst nicht enthalten (Entscheidung vom 28.09.2026). Mehrfach ausführbar. Ohne sie meldet „Alle Kontakte“, wie viele Rückgaben abgelehnt wurden, und der Lead bleibt beim Partner; `claim_lead` bleibt so weit wie bisher. Prüfzeilen 32.1 bis 32.3 |

Prüfen, ob sie gelaufen sind: Zeilen 30.1 bis 38.1 in `99_PRUEFUNG.sql`.

### Am 27.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260927010000_profil_sperre_absichern.sql` | Sperre im Profil nur über die Verwaltung, steht für sich: Trigger `trg_profil_verwaltungsfelder_schutz` auf `profiles`. Die Spalten `gesperrt`, `gesperrt_grund`, `unterlagen_frist_bis` (Schonfrist für die Pflichtunterlagen) und `rollen_variante` ändern nur Dienstschlüssel, Admin und Inhaber, gebaut wie `trg_vp_slug_schutz`. Vorher konnte ein gesperrter Partner mit noch gültiger Sitzung sich über die Schnittstelle selbst entsperren. Sperren und Entsperren in der Nutzerverwaltung (Admin, Inhaber) geht weiter. Ohne sie läuft alles wie bisher, nur ohne diesen Schutz |
| `20260927020000_tippgeber_einverstaendnis.sql` | Teil 2. `create_tippgeber_lead` bekommt drei Parameter (`_einverstaendnis`, `_einverstaendnis_fassung`, `_einverstaendnis_wortlaut`) und legt am neuen Kontakt `meta.tippgeberEinverstaendnis` ab (bestätigt, Zeitpunkt aus der Datenbank, Fassung, Wortlaut, Tippgeber). Kommt einer der neuen Parameter mit, lehnt die Funktion ohne Haken ab. Aufrufe ohne sie (Browser mit altem Stand) gehen im Übergang weiter durch, ohne Nachweis. Die alte Fassung mit elf Parametern wird entfernt, sonst wäre der Aufruf mehrdeutig. Ohne die Migration verlangt das Portal den Haken trotzdem, speichert ihn aber nicht. Prüfzeilen 23.1 bis 23.5 |
| `20260927040000_meta_pixel_berechtigung.sql` | Teil 3, steht für sich, muss aber **vor** dem Ausrollen von `get-vp-microsite`, `submit-lead`, `meta-lead` und `vp-marketing` laufen. Meta Pixel nur mit Anlage 4 zum Vertrag (Fassung 2026-09-26) oder mit Bestandsschutz (Christians Entscheidung vom 26.09.2026, Variante A). Neue Tabelle `meta_pixel_berechtigung` (nur Service-Rolle): Bestandsschutz und Sperre durch die Verwaltung je Nutzer, einmal beim Anlegen befüllt mit allen, die heute eine Pixel-ID oder ein Conversions-API-Token haben; ein zweiter Lauf ändert nichts. Funktion `meta_pixel_entfernen(uuid)` (nur Service-Rolle) für den Knopf „Entfernen“: Pixel-ID leeren, Token löschen, Bestandsschutz beenden, in einer Transaktion. Auslöser `trg_meta_pixel_entfernt` auf `user_settings` als Sicherheitsnetz für jeden anderen Weg, Fehler brechen das Speichern ab. Ohne sie gibt es keinen Bestandsschutz: Das Pixel läuft dann nur mit unterschriebenem Vertrag in der Fassung 2026-09-26 oder bei Admin und Inhaber. Prüfzeilen 24.1 bis 24.5 |
| `20260927060000_bewerbungen_nur_bewerberbereich.sql` | Teil 4. Bewerbungen nur noch für hr, admin, inhaber und backoffice (Entscheidung vom 27.09.2026). Neue Regel `darf_bewerberbereich(uid)`. Auf `bewerbungen`, `bewerber_formular` und `bewerber_mail_tracking` werden **alle** bisherigen Regeln entfernt und neu angelegt: lesen, anlegen, ändern, löschen nur die vier Rollen, lesen zusätzlich der Bewerber selbst (`benutzer_id`). In der Ablage `bewerbungen` fällt jede Regel, die den Eimer nennt; öffnen, hochladen (`vertrag/`, `paket-uebersicht/`, `muster-vertrag/`) und löschen nur die vier Rollen. Dazu eine einschränkende Regel auf `signature_requests`: Partnerverträge (`vertrag`, `vertrag_kurz`) nur die vier Rollen, alle anderen Zeilen unverändert. Öffentliche Bewerberwege (Token, Service-Rolle) bleiben unberührt. Ohne sie sehen Vertriebspartner und die übrigen internen Rollen die Bewerbungen in der Datenbank weiter, nur die Oberfläche ist schon zu, und Backoffice kann noch nicht anlegen oder löschen. Prüfzeilen 25.1 bis 25.8 |
| `20260927070000_marketing_einwilligung_schuetzen.sql` | Teil 5, steht für sich. Der Nachweis der Pixel-Einwilligung am Lead (`kontakte.meta.marketingEinwilligung`, von `submit-lead` geschrieben) lässt sich nur noch mit dem Dienstschlüssel anlegen, ändern oder löschen. Auslöser `trg_kontakt_marketing_nachweis` auf `kontakte`: Für alle anderen fliegt ein mitgeschickter Nachweis beim Anlegen raus, beim Ändern und Löschen bleibt der alte Wert stehen. Zurückgesetzt statt abgebrochen, damit Speichern aus dem CRM, `merge_kontakt_meta` und `kontakte_zusammenfuehren` nie daran scheitern; beim Zusammenführen bleibt der Nachweis des älteren Kontakts. Ein `meta`, das kein Objekt ist, nimmt den Nachweis nicht mit, dann bleibt das alte `meta`. Ohne sie läuft alles wie bisher, nur ohne Schutz. Prüfzeilen 26.1 bis 26.3 |
| `20260927080000_gegenzeichnung_token_erneuern.sql` | Teil 6, wirkt erst nach Teil 4 (`20260927060000`): Vorher dürfen alle internen Rollen, auch Vertriebspartner, Unterschriftsanfragen direkt lesen und ändern. Beide im selben Lauf, Teil 4 zuerst. Den Verweis bekommt eine offene Gegenzeichnung nur, wenn der Unterschriftszeitpunkt des Bewerbers passt; sonst lehnt `finalize-vertrag` neutral ab und HR verschickt den Vertrag neu. Bis zum 27.09.2026 bekam der Bewerber den Link der Gegenzeichnung zurück und fand den Token in seiner Akte (`vertragKurzAnfrageToken`); damit konnte er selbst gegenzeichnen. Offene Gegenzeichnungen bekommen einen neuen Token und, wo er fehlt, den Verweis `bewerberRequestId` auf die zuletzt unterschriebene echte Vertragsanfrage (kein Testversand). `vertragKurzAnfrageToken` verschwindet aus allen Bewerbungen. Der alte Link, auch der in der Glocke an Christian Kurz, ist danach tot: Den neuen verschickt HR mit „Erneut an Kurz erinnern“ im Vertrags-Reiter. Ohne sie lehnt `finalize-vertrag` eine alte Gegenzeichnung ohne Verweis neutral ab. Prüfzeilen 27.1 bis 27.2 |
| `20260927090000_marketing_einwilligungen_liste.sql` | Teil 1, steht für sich. Kommt eine Anfrage zu einem bestehenden Kontakt, hängt `submit-lead` den Nachweis der Pixel-Einwilligung an `kontakte.meta.marketingEinwilligungen` an, eine Liste, die nur wächst (bisher nur ungeschützt in `weitereAnfragen`, nach 25 Anfragen weg). Neue Funktion `kontakt_marketing_nachweis_anhaengen(uuid, jsonb)`, nur Service-Rolle: hängt atomar an, damit zwei gleichzeitige Anfragen keinen Eintrag verlieren. Der Auslöser `trg_kontakt_marketing_nachweis` schützt die Liste jetzt für alle Schreibwege, auch den Dienstschlüssel: Ohne die Markierung der Anhänge-Funktion bleibt der alte Wert stehen (so überschreibt auch invite-user sie nicht mit einem veralteten Stand), mit Markierung darf sie nur wachsen. Der einzelne Nachweis `marketingEinwilligung` bleibt wie in Teil 5 vom 27.09. Nie ein Abbruch, nur stilles Zurücksetzen. Ohne sie hängt `submit-lead` auf dem bisherigen Weg an, ohne Schutz. Prüfzeilen 28.1 bis 28.4 |
| `20260927120000_videocall_nur_geschaeftsfuehrer.sql` | Teil 1, steht für sich. Interner Videocall nur noch für Christian Peetz in der Rolle admin (Entscheidung vom 27.09.2026), externer Kalender getrennt davon und für alle wie bisher. `darf_videocall` prüft nur seine beiden Nutzer-Kennungen zusammen mit `has_role(…, 'admin')`; `videocall_freigaben` wird nicht mehr gelesen, die Einträge bleiben. Neue Spalte `buchung_links.ziel` (`intern` oder `extern`), nachbefüllt über das Präfix `terminwahl-`. `buchung_zugang_aufloesen` löst nur interne Links und offene Seiten von Gastgebern mit Videocall auf, damit lehnen Buchungsseite, freie Zeiten und `buchung_anlegen` externe Links und fremde Gastgeber neutral ab und legen nie einen Raum für sie an. `bewerber_termin_buchen` bricht ohne Videocall des Gastgebers neutral ab und legt nichts an (Bewerber buchen über den externen Kalender). `partnertermin_zugang` und `partnertermin_bestaetigen` nehmen nur Links mit `ziel = 'extern'` an. Aktive interne Links von Gastgebern ohne Videocall gehen auf `aktiv = false`, externe bleiben, gelöscht wird nichts. Zeilenregeln: Videoräume, Teilnehmer, Buchungseinstellungen, Verfügbarkeiten und Terminarten nur noch mit `darf_videocall`; externe Links darf jede interne Rolle für einen Kontakt anlegen und ändern, den sie sieht; Kontakt und Besitzer eines Links ändert über die Schnittstelle niemand mehr (Auslöser `trg_buchung_links_zuordnung`, das Zusammenführen von Kontakten bleibt möglich). Ohne sie ist die Oberfläche schon zu, aber Vertriebspartner ohne alte Freigabe können keinen Link auf die Terminseite anlegen. Prüfzeilen 29.1 bis 29.12 |

Prüfen, ob sie gelaufen sind: Zeilen 22.1 bis 22.2, 23.1 bis 23.5, 24.1 bis 24.5, 25.1 bis 25.8, 26.1 bis 26.3, 27.1 bis 27.2, 28.1 bis 28.4 und 29.1 bis 29.12 in `99_PRUEFUNG.sql`.

### Am 26.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260926150000_reservierung_kunde_lesen.sql` | Neue Leseregel „Kunde liest eigene Reservierungsvereinbarung“ im Eimer `unterlagen`: Kunde und Person 2 dürfen die unterschriebene Vereinbarung unter `reservierung/<eigener Kontakt>/` öffnen, nur lesen. Gilt auch für alle schon abgelegten Dateien, nichts wird umkopiert. Ohne sie erzeugt der Knopf im Portal das PDF aus den Angaben am Investment, statt die abgelegte Datei zu öffnen |
| `20260926160000_person2_unterlagen_lesen.sql` | Neue Leseregel „Person 2 liest Kundenunterlagen“ im Eimer `unterlagen`: Person 2 darf im Kundenportal dieselben Ordner lesen wie Person 1 (`<Kontakt>/`, `finanzierung/<Kontakt>/`, `kundenordner/<Kontakt>/`), also ihre eigenen Uploads und die unterschriebene Selbstauskunft. Nur lesen, nur der eigene Kontakt, nicht mehr als Person 1. Die Regel für Person 1 bleibt unverändert. Ohne sie öffnet sich für Person 2 wie bisher keine Datei |
| `20260926170000_handbuch_seite.sql` | Handbuch-Seite: Tabelle `handbuch_anforderungen` (je abgeschicktem Konfigurator eine Zeile, Zeilensicherheit, lesen nur Admin, Inhaber und der Partner des Links, schreiben nur `submit-lead`), öffentliche Lesefunktion `handbuch_abrufen(token)` für die Ergebnisseite, `handbuch_kennzahlen` für die Übersicht der Verwaltung, dazu lernt `analysetool_ereignisse` das Werkzeug „handbuch“ und seine Stufen. Ohne sie läuft die Seite trotzdem (Lead, Handbuch online und als PDF), es fehlen nur Zustellmail, Zählung und Übersicht |

| `20260926180000_handbuch_stand_und_leitung.sql` | Handbuch-Seite, zweite Runde, **nach** Teil 3: Spalte `pdf_gespeichert_am` und Funktion `handbuch_pdf_gespeichert(token)` (Stand „PDF gespeichert“), Vertriebsleitung liest `handbuch_anforderungen` und hat in `handbuch_kennzahlen` die Gesamtsicht, neuer dritter Parameter `p_nur_firma` („Nur Firmenlink“, alte Zwei-Parameter-Aufrufe gehen weiter), neue Funktion `handbuch_lead_staende(kontakt_ids)` für den Stand je Lead in Lead-Verwaltung und Kundenprofil (nur Zeiten und Merkmale, keine Kontaktdaten). Ohne sie zeigt die Lead-Verwaltung nur „Handbuch erhalten“ und „Nur Firmenlink“ einen Hinweis |

| `20260926200000_naechtliche_abmeldung.sql` | Nächtliche Abmeldung: Funktion `naechtliche_abmeldung()` löscht um 03:30 Uhr deutscher Zeit die Sitzungen (`auth.sessions`) aller Konten außer Kunden und Bewerbern, bei Kunden und Bewerbern nur Sitzungen älter als 30 Tage. pg_cron-Job `naechtliche-abmeldung` stündlich zur halben Stunde, gearbeitet wird nur zwischen 03:30 und 03:59 Berliner Zeit und einmal je Tag. Protokoll in `naechtliche_abmeldung_laeufe`. Dazu `sitzungen_beenden(uuid)` für die Edge Function `manage-sessions` (Sperren, „Alle Sessions beenden“). Beide Funktionen nur für die Service-Rolle. Ohne sie gibt es keine nächtliche Abmeldung, und das Beenden fremder Sitzungen meldet „Migration ausstehend“ |

| `20260926210000_aufgaben_abgesagt_nicht_offen.sql` | Eindeutiger Index `aufgaben_ausloeser_offen_idx`: „abgesagt“ zählt nicht mehr als offen, nur noch was weder erledigt noch abgesagt ist. Grund: Die Aufgabe „Objekt-Vorstellungstermin vereinbaren“ wird bei Rückgabe eines Handbuch-Leads in den Pool abgesagt und soll bei der nächsten Zuteilung neu entstehen, auch für denselben Partner. Ohne sie bekommt genau dieser Partner die Aufgabe nicht noch einmal, sonst läuft alles |
| `20260926220000_handbuch_partner_schalter_und_kuerzel.sql` | Handbuch-Seite, dritte Runde, **nach** Teil 4: Schalter `handbuch_partner_freigeschaltet` in `app_config` (Vorbelegung `{"aktiv": false}`) und Funktion `handbuch_partner_freigeschaltet()`. Partner lesen `handbuch_anforderungen` und bekommen `handbuch_kennzahlen` erst, wenn der Schalter an ist; Admin, Inhaber, Vertriebsleitung und Setterin wie bisher. `handbuch_lead_staende` (Kasten im Kundenprofil) bleibt für eigene Kunden offen. Dazu Trigger `trg_vp_slug_sperre` auf `profiles`: kein neues oder geändertes Kürzel `konfigurator`, `selbstauskunft`, `ergebnis`; bestehende Zeilen bleiben unberührt. Freischalten später: `update public.app_config set wert = '{"aktiv": true}'::jsonb where schluessel = 'handbuch_partner_freigeschaltet';`. Ohne sie läuft alles wie bisher |
| `20260926230000_kontakte_zusammenfuehren.sql` | Duplikate zusammenführen: Funktion `kontakte_zusammenfuehren` für den Knopf „Zusammenführen“ unter Alle Kontakte und in der Lead-Verwaltung. Es bleibt immer der ältere Kontakt; leere Felder werden gefüllt, abweichende Angaben als Notiz im Verlauf vermerkt; alle Verknüpfungen des neueren (Investments, Aufgaben, Verlauf, Dokumente, Unterschriften, Selbstauskunft, Termine, Chat, Portalzugang und jede Tabelle mit Fremdschlüssel auf `kontakte`) wandern in einer Transaktion zum älteren, der neuere geht in den Papierkorb. Rechte wie beim Löschen. Ohne sie meldet der Knopf „Datenbank-Erweiterung fehlt noch“ und ändert nichts |
| `20260927000000_kontakt_dateipfade_umschreiben.sql` | Duplikate zusammenführen, Dateien: Funktion `kontakt_dateipfade_umschreiben` (nur Service-Rolle) für die Edge Function `kontakte-zusammenfuehren-dateien`. Nach dem Zusammenführen werden die Dateien des neueren Kontakts im Eimer `unterlagen` in die Ordner des älteren kopiert (nie überschrieben, bei gleichem Namen mit Zusatz `_aus-MI-…`), dann schreibt diese Funktion in einer Transaktion jeden Verweis auf die alten Pfade um (alle Text- und JSON-Spalten außer Protokollen), erst danach werden die alten Dateien gelöscht. Rechte wie beim Zusammenführen. Gehört fachlich zu `20260926230000`, läuft danach. Ohne sie bleiben die Dateien wie bisher am alten Ort, der Browser zeigt einen Hinweis |

| `20260926235000_partnerlinks_absichern.sql` | Partnerlinks absichern (Codex-Prüfung 26.09.2026), steht für sich: Trigger `trg_vp_slug_schutz` auf `profiles`, das Link-Kürzel `vp_slug` ändern nur Dienstschlüssel, Admin und Inhaber, Name und übrige Felder bleiben frei. Regel `partner_link_aktiv(uuid)` (nicht gesperrt, Partnerrolle) in `resolve_tippgeber_slug` und im Klickzähler. Neuer Zähler `tippgeber_klick_zaehlen(vp_slug, tg)` sucht den Tippgeber nur unter dem Partner des Links, höchstens 200 Klicks je Tippgeber und Tag (Tabelle `tippgeber_klick_tage`, kein Personenbezug); der alte `increment_tippgeber_klick` zählt ein Kürzel nur bei genau einem Treffer. Tippgeber-Kürzel wird bei Namensänderung nicht mehr neu vergeben. Ohne sie läuft alles wie bisher, der Browser nimmt dann den alten Zähler |

Prüfen, ob sie gelaufen sind: Zeilen 12.1, 13.1, 14.1 bis 14.4 15.1 bis 15.3, 16.1 bis 16.5, 17.1, 18.1 bis 18.5, 19.1 bis 19.2, 20.1 bis 20.7 und 21.1 bis 21.2 in `99_PRUEFUNG.sql`.

### Am 25.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260925180000_kundensprache_signatur_rpcs.sql` | Kundensprache Etappe 4: `get_signature_request` liefert die Sprache des Kunden in `meta.sprache`, `get_sa_fill_token` in der neuen Spalte `sa_fill_tokens.sprache`, dazu die interne Hilfe `kontakt_sprache(text)`. Ohne sie zeigen Unterschriftsseite und Selbstauskunft-Link Deutsch; die Reservierung wird trotzdem zweisprachig, weil sie ihre Sprache im eigenen Datensatz trägt |
| `20260925190000_kundensprache_zum_link.sql` | Kundensprache Etappe 3: neue Lesefunktion `kundensprache_zum_link(art, token)`, liefert zum Schlüssel einer Kundenseite (Terminbuchung, Terminverwaltung, Partnertermin, Videoraum, Handy-Scan) nur „de“ oder „en“ aus `kontakte.meta.kundenSprache`, dazu die interne Hilfe `kontakt_sprache(uuid)`. Ohne sie bleiben diese Seiten deutsch, sonst läuft alles unverändert |
| `20260925120000_finanzierung_intern_frei.sql` | Finanzierung auch serverseitig erst ab unterschriebener Reservierung: zwei Wachposten, auf `finanzierungen` (Angebote anlegen und ändern) und auf `investments.meta` (`finanzierungsStatus`, `finanzierungsBank`). Ausnahmen: Admin, Inhaber, Dienstschlüssel, Altbestand mit vorhandenen Finanzierungsdaten |
| `20260925200000_kunden_zwei_faktor_freiwillig.sql` | Zwei-Faktor-Anmeldung für Kunden freiwillig, aber verbindlich, wenn an: Ein Kunde mit bestätigtem zweiten Faktor bekommt ohne Code (Sitzung aal1) keine Daten. RESTRICTIVE Regel an allen Tabellen mit Zeilensicherheit außer `profiles`, `user_roles`, `user_settings`, dazu `storage.objects`, gleiches Muster wie die Kundenportal-Sperre. Interne Rollen und Kunden ohne Zwei-Faktor sind nicht betroffen |

Die Zwei-Faktor-Regel wirkt nur fuer Kunden mit eingeschaltetem zweiten
Faktor. Kommt eine neue Tabelle mit Zeilensicherheit hinzu, bekommt sie die
Regel erst, wenn `select public.kunden_zwei_faktor_regeln_anlegen();` noch
einmal laeuft. Pruefzeile 11.3 in `99_PRUEFUNG.sql` zeigt, ob eine fehlt.

Prüfen, ob die Kundensprache gelaufen ist (erwartet zwei Zeilen):

    select p.oid::regprocedure as funktion
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('kontakt_sprache', 'kundensprache_zum_link');

Prüfen, ob die Finanzierungsregel gelaufen ist:

    select tgrelid::regclass as tabelle, tgname, tgenabled
      from pg_trigger
     where tgname in ('trg_finanzierung_intern_frei',
                      'trg_finanzierungsstand_intern_frei');

Ohne sie läuft das Frontend unverändert, nur der direkte Aufruf an der
Oberfläche vorbei bleibt möglich.

### Am 24.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260924200000_steuerrechner_vp_freigeben.sql` | Steuerrechner links unter Tools fuer alle Vertriebspartner, eine Zeile in `role_permissions` |
| `20260924210000_steuerrechner_vertriebsleitung_freigeben.sql` | Steuerrechner auch fuer die Vertriebsleitung, damit sie an ihren eigenen Link kommt, eine Zeile in `role_permissions` |
| `20260923160000_globalobjekt_eine_wahrheit.sql` | Anlageklasse „Globalobjekt“ und Schalter im Bestand angeglichen |
| `20260923170000_dokument_kundenfreigabe.sql` | Dokumenten-Ampel, Freigabe je Unterlage fuer Kunden, einstellbare Rollen |
| `20260923171000_kundenlink_objektuebersicht.sql` | Kundenlink als Exposé oder Objektuebersicht mit Einstiegswohnung |
| `20260923180000_kundenportal_sperre.sql` | Kundenportal-Sperre serverseitig, Sperrregel an allen Tabellen |
| `20260924150000_investagon_unterlagen_einordnen.sql` | Investagon-Unterlagen als Objekt- oder Wohnungsunterlage statt „intern“; Ergebnis: 1.665 Objekt-, 2.291 Wohnungsunterlagen, 15 bewusst intern (Provision, Vertrieb) |
| `20260924120000_reservierung_unterschrieben_empfaenger.sql` | feste Empfaenger der Mail „Reservierung unterschrieben“: Christian Peetz und office@more.immo |
| `20260924170000_nachtpruefung_objektdaten.sql` | Nachtwaechter prueft die Objektdaten (15 Regeln je OBJ, FIN, AS), Kennzahlen fuer das Tagesbriefing |
| `20260924190000_standort_nachholen_zeitplan.sql` | Zeitplan alle zehn Minuten fuer `standort-nachholen`, misst die Umgebung der Objekte nach |

Zur Kundenportal-Sperre: Sie lief, bevor der zugehoerige Code und die Edge
Function `kundenportal-sperre` gepusht und ausgerollt waren. Bis beides
nachgezogen ist, setzt der Waechter an `kontakte` jede Sperraenderung aus dem
Browser zurueck. Wer gesperrt war, bleibt gesperrt. Der Code liegt seit dem
04.10.2026 im Repo; wirksam wird er, sobald `kundenportal-sperre`,
`secure-login` und `invite-user` in Lovable ausgerollt sind. Den Nachzug fuer
neuere Tabellen bringt `20261004152000_kundenportal_sperre_nachziehen.sql`.

### Am 22.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260922100000_investagon_aufraeumen_aus.sql` | der Viertelstundenlauf raeumt nicht mehr auf |
| `20260922120000_investagon_objekte_sofort_sichtbar.sql` | Objekte aus Investagon sind sofort sichtbar statt Entwurf; nie wiederholen |

### Am 21.09.2026 zuletzt ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260921240000_partnertermin_uuid_vergleich.sql` | uuid gegen uuid statt uuid gegen Text, ohne sie laedt die Terminseite nicht |
| `20260921250000_partnertermin_kunde.sql` | die Terminseite nennt dem Partner den Kunden mit E-Mail und Telefon |
| `20260921260000_kennenlerntermin_kalender_der_hr.sql` | die Bewerberseite zeigt den Kalender der zustaendigen HR-Person statt einer festen Adresse |
| `20260921270000_eigenfinanzierung_kunde_upload.sql` | der Kunde laedt seine Eigenfinanzierungs-Unterlagen im Portal selbst hoch |

**Zwei Entscheidungen, die in diesen drei stecken und nicht verloren gehen
sollen.**

Die Kundendaten auf der Terminseite kommen ausschliesslich dann, wenn
`auth.uid()` dem Besitzer des Links entspricht, also dem Partner, der ihn
erzeugt hat. Ein weitergeleiteter Link gibt nichts preis, und auch ein
angemeldeter Kunde mit fremdem Token sieht nichts. Ein Merkmal in der Adresse
wie `?intern=1` taugte dafuer nicht, das laesst sich im Browser aendern.

Beim Kundenupload ist `eigenfinanzierung_kunde_unterlage` bewusst eng gefasst:
Sie aendert nur das Finanzierungsangebot und die Darlehensvertraege des Kunden,
niemals `aktiv` oder `vpBestaetigt`. Den Schluessel `eigenfinanzierung` einfach
in die Positivliste von `merge_investment_meta` zu setzen waere der kurze Weg
gewesen und haette dem Kunden erlaubt, seine Finanzierung selbst freizugeben.

**Der Fehler zum dritten Mal.** `investments.kunde_id` ist seit dem 17.05.2026
eine `uuid`, nicht mehr Text. Ein `::text` daneben laesst die ganze Funktion mit
SQLSTATE 42883 abbrechen. Dasselbe steckte schon im Kennzahlenlauf
(20260909090000) und im Provisionssatz-Trigger (20260909120000).

**Warum jede Pruefung gruen aussah.** Der Abbruch passierte erst im
Investmentteil, und dorthin kommt die Funktion nur mit einem ECHTEN
Buchungstoken. Bei einem erfundenen bricht sie vorher sauber ab und gibt NULL.
Ein Aufruf ueber die oeffentliche Schnittstelle meldete Status 200, die Seite
mit einem Fantasietoken zeigte die richtige Meldung, und `pg_proc` fand beide
Funktionen samt Rechten.

**Die Abfrage, die es gefunden hat**, und die bei jedem aehnlichen Fall wieder
hilft. Sie ruft die Funktion fuer jeden echten Link auf und faengt die Ausnahme
ab, statt sie zu verschlucken. Die Hilfsfunktion liegt in `pg_temp` und
verschwindet mit der Sitzung:

    create or replace function pg_temp.pruefe_terminseite(_token text)
    returns text language plpgsql as $$
    begin
      perform public.partnertermin_zugang(_token);
      return 'ok';
    exception when others then
      return sqlstate || ' / ' || sqlerrm;
    end $$;

    select left(l.token, 28) as token,
           pg_temp.pruefe_terminseite(l.token) as ergebnis
    from public.buchung_links l
    where l.aktiv and (l.gueltig_bis is null or l.gueltig_bis > now())
    order by l.created_at desc limit 20;

**Zwei Lehren.** Erstens: Eine Pruefung mit erfundenen Daten prueft nur den Weg
bis zur ersten Abzweigung. Wer eine Datenbankfunktion absichern will, ruft sie
ueber echte Zeilen auf. Zweitens: `raise notice` hilft im Lovable-Editor nicht,
dort erscheint nur "query succeeded". Diagnosen muessen eine Tabelle
zurueckgeben.

### Am 21.09.2026 spaet abends ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260921230000_partnertermin_investment.sql` | der Termin von der Terminseite haengt ueber eine Aufgabe am Investment |

**Wie der Stand festgestellt wurde, und warum das wichtig war.** Die Datei lag
laenger im Korb, als sie musste, und eine Fehlersuche lief deshalb eine Runde
in die falsche Richtung: Die Terminseite meldete einen Ladefehler, und der
offene Korb legte nahe, dass die Funktion fehlt. Sie war da. Geklaert hat es
diese Abfrage, die nichts aendert und in einer Zeile sagt, welche Fassung
wirklich in der Datenbank steht:

    select p.oid::regprocedure as funktion,
           case when pg_get_functiondef(p.oid) ilike '%investment%'
                then 'neue Fassung' else 'alte Fassung' end as fassung,
           has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_darf,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as angemeldet_darf
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'partnertermin%'
    order by p.proname;

Die Lehre: Eine Datei im Korb ist eine Behauptung, keine Messung. Wer eine
Migration anlegt, die eine Funktion ersetzt, schreibt die passende Pruefabfrage
gleich mit in den Kopf der Datei. Dann kostet die Frage "ist das gelaufen?"
zehn Sekunden statt einer halben Fehlersuche.

### Am 21.09.2026 abends ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260921170000_buchungslinks_objekt_finanzierung.sql` | zwei weitere Buchungslinks je Partner, fuer Objekt- und Finanzierungsgespraech |
| `20260921210000_partnertermin_seite.sql` | die Terminseite `/terminwahl/:token` mit dem eigenen Kalender des Partners |

Die erste ist mit der zweiten miterledigt: Diese traegt dieselben beiden
Spalten noch einmal mit `ADD COLUMN IF NOT EXISTS`, damit sie fuer sich allein
laufen kann.

**Eine Lehre daraus.** Eine Migration, die auf einer aelteren aufbaut, die noch
im Korb liegt, wiederholt deren `ALTER TABLE` besser mit `IF NOT EXISTS`, statt
sie vorauszusetzen. Sonst haengt sie an der Reihenfolge im Editor, und ein
vergessener Teil wird zu einem Fehler im Betrieb statt zu einem beim
Einspielen.

### Am 19.09.2026 abends zusaetzlich ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260919160000_doppelte_kundenchats_zusammenfuehren.sql` | mehrere Kundenchats je Kunde zu einem zusammenfuehren |
| `20260919170000_chatanhaenge_nur_teilnehmer.sql` | Chatanhaenge nur noch fuer Teilnehmer und Admins |
| `20260919180000_kundenchat_teilnehmer_sicherstellen.sql` | Kunde und zustaendiger Berater in jedem Kundenchat |

**Eine Lehre aus dem Kopieren.** Wer mehrere Teile der Sammeldatei
hintereinander in den SQL-Editor einfuegt, muss auf den Zeilenumbruch dazwischen
achten. Klebte das `BEGIN;` des naechsten Teils an der letzten Zeile des
vorigen, meldete Postgres eine Spalte, die es nicht gibt
(`column "teilnehmerbegin" does not exist`). Im Zweifel jeden Teil einzeln
ausfuehren.

### Am 19.09.2026 ausgefuehrt und entfernt

| Datei | was sie tut |
|---|---|
| `20260916260000_bewerbertermin_meta_nachtragen.sql` | traegt Daten am Bewerbertermin nach |
| `20260918180000_botschutz_offene_formulare.sql` | Botschutz fuer die oeffentlichen Formulare |
| `20260918220000_partnersuche_kennung_vor_name.sql` | Partner ueber die Kennung statt ueber den Namen |
| `20260919120000_meeting_mails_nachziehen.sql` | Verschiebung und Absage erreichen den Kunden |
| `20260919140000_leere_kundenchats_reparieren.sql` | sechs Kundenchats ohne Teilnehmer nachtragen |
| `20260919150000_kundenchat_starten.sql` | der Kunde kann seinen Chat selbst starten |

**Eine Lehre aus diesem Tag.** `20260910120000_meeting_gaeste_versand.sql` lag
seit dem 10.09. in der Historie, galt als erledigt und stand nicht in diesem
Ordner. Gelaufen war sie nie. Aufgefallen ist es erst am 19.09., als ein Test
zeigte, dass bei Verschiebung und Absage eines Termins keine einzige Mail an
den Kunden hinausgeht: Die Tabelle `meeting_mail_auftraege` gab es gar nicht.

Neun Tage lang hat also niemand erfahren, dass sein Termin verschoben wurde.
Ein fehlender Eintrag in dieser Merkliste ist damit kein Schoenheitsfehler,
sondern ein stiller Ausfall im Betrieb. Wer eine Migration anlegt, legt die
Kopie hier ab, auch wenn er sicher ist, dass sie gleich ausgefuehrt wird.

Zweite Lehre: Die alte Fassung liess sich nicht einfach nachtraeglich starten.
Sie war mit `CREATE TABLE` und `CREATE FUNCTION` ohne Absicherung geschrieben
und waere abgebrochen, sobald irgendein Teil schon existiert, und zwar ohne
etwas zu hinterlassen. Jede Migration hier gehoert wiederholbar geschrieben:
`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` davor.

## Am 16.09.2026 erledigt

Christian hat an diesem Tag vier Migrationen im SQL-Editor ausgefuehrt, die
Pruefabfrage meldete in allen zwoelf Zeilen "ja":

| Datei | was sie tut |
|---|---|
| `20260916210000_bewerber_selbstbuchung_ins_closing.sql` | Wer sich selbst einen Termin bucht, steht danach im Closing |
| `20260916220000_bewerber_absage_und_rueckholung.sql` | Absage bleibt im Closing, eine neue Buchung holt aus der Wiedervorlage zurueck |
| `20260916230000_sa_entfaellt_nur_ab_vertriebspartner.sql` | Vermerk "Kunde finanziert selbst" nur ab Vertriebspartner, Trigger auf `investments` |
| `20260916240000_verlauf_eigene_eintraege_entfernen.sql` | Eigene Verlaufseintraege entfernen duerfen, Regel auf `aktivitaeten` |
| `20261004130000_absicherung_lesen.sql` | Reihenfolge: 1. Push nach main, 2. in Lovable ausrollen: `redeem-activation-token`, 3. Publish, 4. dann diese Migration. Davor ausgeführt fehlt nur der Vorname auf der Aktivierungsseite und die alte Startseite zeigt der Vertriebsleitung die Hausverwaltungskarte mit Nullen; gespeichert wird alles wie bisher. Freigabe Christian vom 04.10.2026. (K4) Kundendokumente in `unterlagen` und `selbstauskunft-pdfs` lesen nur Admin, Inhaber, wer jeden Kunden sieht (`darf_alle_kunden_sehen`), der eigene Arbeitsordner und der zuständige Partner samt Vertretung (`darf_unterlage_lesen`, Kunde über `unterlagen_pfad_kontakt` plus `aftersales/`, `mobile-scans/` nur über die Scan-Sitzung mit genau diesem Token, `externe-investments/` über jeden Kontakt des Portalkontos; der Resolver `unterlagen_lese_kontakt` ist nicht über die Schnittstelle aufrufbar); Chat und Kundenregeln unverändert. Bisher jede interne Rolle. Bricht ab, wenn eine Leseregel ohne Eimerbezug auf `storage.objects` liegt. (H14) mieter, eigentuemer, vermietungen, kautionen, versicherungen, zaehlerstaende, betriebskosten, hv_tickets lesen nur Hausverwaltung, Admin, Inhaber (`darf_hausverwaltung_lesen`); `dienstleister` bleibt (Marketingseite). (M6) `lookup_activation_name` nur noch Dienstrolle; `redeem-activation-token` gibt bei benutztem oder abgelaufenem Link keine Adresse, keinen Namen und keine Sprache mehr heraus. Dazu löscht `cleanup_expired_tokens()` abgelaufene `mobile_scan_sessions` nicht mehr, sonst verlöre der Partner nach zwei Tagen den Zugriff auf die Scans; abgelaufene Token bleiben ungültig, weil jeder Token-Weg `expires_at` prüft. Ändert keine Daten, wiederholbar. Prüfzeilen 59.1 bis 59.4 |

Die Dateien liegen unveraendert in `supabase/migrations/`, nur die Kopien in
diesem Ordner sind entfernt.

**Eine Lehre aus diesem Tag:** Die ersten beiden legten dieselbe Funktion
`bewerber_stufe_closing` per CREATE OR REPLACE an, mit unterschiedlichen
Statuslisten. In falscher Reihenfolge ausgefuehrt haette die erste die
Rueckholung aus der Wiedervorlage stillschweigend wieder ueberschrieben, ohne
jede Fehlermeldung. Wer zwei Migrationen an derselben Funktion schreibt,
nummeriert sie in der Sammeldatei ausdruecklich und sagt im Kopf, was bei
falscher Reihenfolge passiert.

**Eine zweite Lehre:** Eine fehlende Loeschregel scheitert still. PostgREST
meldet keinen Fehler, es filtert die Zeile nur weg. Der Eintrag verschwindet
aus der Anzeige und ist nach dem naechsten Laden wieder da. Zu jeder neuen
DELETE-Policy gehoert deshalb eine Pruefzeile.

Weiterhin offen, aber **kein Migrationsschritt** und deshalb nicht in diesem
Ordner: das Geheimwort der Automatiken als Function-Secret in Lovable
(`AUTOMATIK_GEHEIMWORT`).

**Stand 09.09.2026: Die Teile 1 bis 9 sind in Supabase gelaufen. Offen ist
allein Teil 10, die Reparatur des Provisionssatz-Triggers.** Die Beschreibungen der
erledigten Teile stehen weiter unten, damit nachvollziehbar bleibt, was
gelaufen ist; Christian entscheidet, wann ihre Dateien aus dem Ordner
verschwinden. Alle Teile sind wiederholbar, ein zweiter Durchlauf schadet
also nicht.

1. `20260907130000_investment_berechnungen.sql`: die Tabelle
   `investment_berechnungen` (mehrere gespeicherte Staende des
   Investmentrechners je Investment, mit Eingabe, Kaufnebenkosten,
   Unterlagen, Kennzahlen und der Herkunft je Feld), die Funktion
   `darf_kontakt_bearbeiten(user, kontakt)` als ausgeschriebene Fassung der
   UPDATE-Regeln auf `kontakte`, der Trigger fuer `geaendert_am` sowie RLS
   mit vier Policies: sehen und schreiben darf, wer den Kunden bearbeiten
   darf. Kein anon-Zugriff. Mehrfach ausfuehrbar. Ohne sie laeuft der
   Investmentrechner wie bisher, der Knopf „Am Investment speichern" meldet
   ruhig, dass die Migration noch offen ist, und im Kundenprofil bleibt der
   Bereich „Berechnungen" leer.

2. `20260907140000_kooperationsgespraech_raumtitel.sql`: der Bewerbertermin
   hiess damals „Kooperationsgespraech". Dieser Teil ist inzwischen von
   Nummer 5 ueberholt, die von jedem der beiden bisherigen Staende aus
   nachzieht. Er darf laufen, muss aber nicht. Wer die Sammeldatei von oben
   nach unten ausfuehrt, nimmt ihn einfach mit.

3. `20260908120000_steuerrechner_ereignisse.sql`: die Spalte `werkzeug` an
   `analysetool_ereignisse`, damit Analysetool und Steuerrechner getrennte
   Trichter bekommen statt in dieselben vier Werte zu zaehlen. Legt die
   Tabelle notfalls selbst an: Beim ersten Versuch am 08.09.2026 brach sie
   ab, weil `analysetool_ereignisse` in der Datenbank nie angelegt worden
   war, obwohl die Migration von 20260727 in der Historie steht. Die Zaehlung
   des Analysetools schrieb seither ins Leere. **Muss vor Nummer 6 laufen.**
   Mehrfach ausfuehrbar. Ohne sie zaehlt kein Trichter, weder der alte noch
   der neue.

4. `20260908150000_steuer_auswertungen_bucket.sql`: der nicht oeffentliche
   Speicherort `steuer-auswertungen` fuer die Auswertungen des oeffentlichen
   Steuerrechners. Er bekommt bewusst keine einzige Policy: `storage.objects`
   hat die Zeilensicherheit an, also darf ohne Policy niemand hinein, und nur
   die Edge Function `steuer-auswertung-versand` schreibt mit der
   Service-Rolle. Sie gibt eine signierte Adresse mit 90 Tagen Laufzeit
   heraus, die in die Mail geht. Mehrfach ausfuehrbar. Ohne sie laeuft der
   Rechner weiter, der Lead kommt an, und die Auswertung wird dem
   Interessenten statt per Mail direkt im Browser als Datei uebergeben.

5. `20260908160000_persoenliches_gespraech.sql`: der Bewerbertermin heisst
   ab jetzt „Persoenliches Gespraech". Sie zieht von **beiden** bisherigen
   Staenden aus nach, also sowohl vom alten „Bewerbergespräch" als auch vom
   zwischenzeitlichen „Kooperationsgespräch"; ob
   `20260907140000_kooperationsgespraech_raumtitel.sql` gelaufen ist, spielt
   damit keine Rolle. Geaendert werden die Bezeichnung der Terminart, die
   Bezeichnung offener Termine in der Zukunft samt Raumtitel, die lange Dauer
   (45 auf 35 Minuten), die kurze Dauer in `bewerber_termin_dauer` (30 auf 25)
   und die Standardagenda des Videoraums. Bereits gebuchte Termine behalten
   ihre Zeit und ihre Laenge. Mehrfach ausfuehrbar. Ohne sie zeigt die
   Oberflaeche den neuen Namen und die neuen Minuten, die Datenbank aber legt
   Raeume weiter unter dem alten Namen an und blockt weiter 45 statt 35
   Minuten.

6. `20260908170000_ereignisse_kampagne.sql`: die Spalte `kampagne` an
   `analysetool_ereignisse`, damit der Trichter des Steuerrechners nicht nur
   je Vertriebspartner, sondern auch je Werbekampagne zaehlt. Dazu die
   Funktion `analysetool_trichter` ein weiteres Mal, jetzt mit `p_kampagne`
   als viertem Parameter, und die neue Funktion
   `analysetool_trichter_kampagnen`, die eine Zeile je Kampagne liefert.
   **Sie muss nach Nummer 3 laufen**, sonst ueberschreibt Nummer 3 die
   Funktion wieder mit der aelteren Fassung. Mehrfach ausfuehrbar, legt
   fehlende Teile notfalls selbst an. Ohne sie zaehlt der Steuerrechner wie
   bisher ohne Kampagne weiter (der Insert wird beim Fehlschlag ein zweites
   Mal ohne die Spalte versucht), und die Karte „Steuerrechner: Vom Aufruf
   zum Lead" schreibt statt der Kampagnentabelle einen Hinweis, dass die
   Migration noch aussteht.

7. `20260908180000_kennzahlen_tagesstand.sql`: der naechtliche Mitschrieb
   der Kennzahlen. Sie legt die schmale Tabelle `kennzahlen_tagesstand` an
   (eine Zeile je Stichtag, Bereich und Kennzahl), die Funktion
   `kennzahlen_tagesstand_lauf()`, die 56 Zahlen aus elf Bereichen
   ausrechnet und hineinschreibt, die Lesefunktion `kennzahlen_verlauf()`,
   die je Kennzahl den heutigen Stand und den Stand vor sieben Tagen
   liefert, sowie den taeglichen pg_cron-Eintrag um 04:10 UTC. Dazu die
   drei Hilfsfunktionen `kennzahl_schreiben`, `kennzahl_stufe` und
   `kennzahl_bewerberstatus`. RLS: lesen duerfen die internen Rollen,
   schreiben darf allein die Sammelfunktion, kein anon-Zugriff. In der
   Tabelle stehen nur Zahlen, keine Namen. Mehrfach ausfuehrbar, ein
   zweiter Lauf am selben Tag ersetzt die Werte des Tages. Ohne sie bleibt
   alles wie heute: Das System kennt nur den Jetztzustand, und die
   Abteilungs-Personas koennen nicht sagen, ob 42 offene Leads viel oder
   wenig sind. Das Lesemodul `src/lib/kennzahlenVerlauf.ts` meldet dann
   ruhig, dass die Migration noch aussteht, und liefert eine leere Liste;
   nichts stuerzt ab.

8. `20260909090000_kennzahlen_lauf_reparatur.sql`: Er ersetzt die Funktion
   `kennzahlen_tagesstand_lauf()` aus Teil 7
   vollständig. Teil 7 ist am 09.09.2026 gelaufen und hat dabei drei von elf
   Bereichen verloren: AGL 0 von 5, OPS 1 von 6, VA 0 von 3, gemeldet hatte
   die Funktion 53 geschriebene Zahlen, in der Tabelle standen 43. Drei
   Ursachen, alle behoben:
   *Erstens* verglichen zwei Abfragen `k.id::text` mit `investments.kunde_id`,
   also Text mit uuid. Die Spalte ist seit dem 17.05.2026 eine uuid mit
   Fremdschlüssel; für Text gibt es dort keinen Operator, die Abfragen brachen
   ab. Jetzt steht dort `k.id = i.kunde_id`.
   *Zweitens* fehlt `va_aufgaben_ergebnisse` in der Datenbank, obwohl die
   Migration seit dem 27.07.2026 im Repo liegt. Die Kennzahl `aufgaben_geloest`
   läuft jetzt nur noch hinter einer Prüfung mit `to_regclass`, ebenso die
   Kennzahlen an `va_partner_fortschritt` und `buchungen`.
   *Drittens* lag der Fehlerabfang je Bereich statt je Kennzahl. Eine kaputte
   Abfrage machte damit den ganzen Bereich rückgängig, auch die Zahlen, die
   vorher schon geschrieben waren, während der Zähler stehen blieb und zu viel
   meldete. Jetzt hat jede Kennzahl ihren eigenen Abfang, und gezählt wird erst
   nach dem erfolgreichen Schreiben.
   Er läuft am Ende einmal selbst los und zeigt danach die Zählung je Bereich.
   Erwartet werden 56 Zahlen, oder 55, solange `va_aufgaben_ergebnisse` fehlt.
   Mehrfach ausführbar. Ohne ihn schreibt der Nachtlauf weiter jede Nacht drei
   Bereiche nicht mit, und der Verlauf hat dort für immer eine Lücke.

9. `20260727080000_va_aufgaben_ergebnisse.sql`: **Nachzuegler vom
   27.07.2026, nie gelaufen.** Legt `va_aufgaben_ergebnisse` und
   `va_abwaegung_antworten` an, samt Zeilensicherheit je Nutzer. Aufgefallen
   am 09.09.2026 durch `98_FEHLENDE_TABELLEN.sql`: Von 118 Tabellen der
   Historie fehlten in der Datenbank genau diese zwei. Ohne sie schreibt die
   Vertriebsakademie ihre Aufgabenergebnisse und Abwaegungsantworten seit
   sechs Wochen ins Leere, und zwar unbemerkt, weil beide Aufrufe in
   `src/lib/vertriebsakademieProgress.ts` in einem `catch { /* silent */ }`
   stehen. Die Auswertung in `VertriebsakademieAdmin.tsx` bleibt deshalb leer.
   Mehrfach ausfuehrbar.

10. `20260909120000_provisionssatz_trigger_reparatur.sql`: **der einzige noch
    offene Teil.** Er repariert den Trigger
    `trg_investments_provisionssatz_festschreiben` aus der Migration vom
    18.08.2026, der den Provisionssatz beim Anlegen eines Investments
    serverseitig festschreiben soll. Er hat nie funktioniert: Die Abfrage
    verglich `k.id::text` mit `investments.kunde_id`, also Text mit uuid.
    Dafür gibt es in Postgres keinen Operator, die Abfrage brach ab, und der
    Abbruch lief in ein `EXCEPTION WHEN OTHERS`, das nur ins Protokoll
    schrieb. Gemessen am 09.09.2026: 2095 Investments seit dem 18.08.2026,
    davon 0 mit einem serverseitig festgeschriebenen Satz. Derselbe Typfehler
    steckte im Kennzahlenlauf und ist dort mit Teil 8 behoben worden.
    Geändert wird dreierlei: Der Vergleich steht jetzt als uuid gegen uuid,
    `investment_partner_id` wird als einzige Fassung mit uuid-Parameter
    sichergestellt (zwei Fassungen nebeneinander wären mehrdeutig, ein
    Wachposten am Ende prüft das), und ein Fehlschlag hinterlässt ab jetzt
    einen Vermerk unter `meta->lockedProvisionRateFehler` im Investment, mit
    Zeitpunkt und Grund. Das Anlegen eines Investments verhindert der Trigger
    nach wie vor unter keinen Umständen. Am Ende steht eine Zählabfrage.
    Mehrfach ausführbar. Ohne ihn bleibt es beim heutigen Zustand: Kein
    Investment bekommt seinen Satz eingefroren, und niemand sieht es.
    **Nicht Teil davon ist eine Korrektur der Altdaten.** Wie viele der 2095
    Investments einen falschen oder gar keinen Satz tragen und wie sich das
    verteilt, beantwortet die Prüfdatei `97_PROVISIONSSAETZE_PRUEFEN.sql`.
    Sie ändert nichts. Über eine Korrektur entscheidet Christian, und zwar
    mit Wissen der Buchhaltung: In den Stufen `abrechnung` und
    `abgeschlossen` ist die Provision bereits abgerechnet.

Alle uebrigen Migrationen bis einschliesslich 20260906140000 sind Stand
07.09.2026 in Supabase ausgefuehrt.

## Stand 18.09.2026: sieben Dateien entfernt, weil ausgefuehrt

Der Korb trug tagelang Migrationen mit, die laengst gelaufen waren. Damit
war die Merkliste wertlos: Wer ihr nicht mehr traut, sieht auch die echten
offenen Punkte nicht.

Entfernt, alle am 18.09.2026 als ausgefuehrt bestaetigt:
20260910100000 (Meeting-Lebenszyklus, in zwei Teilen gelaufen),
20260918120000 (Weekly-Call-Mail), 20260918130000 und 20260918140000
(Lead-Uebergabe), 20260918150000 (search_path), 20260918170000
(Praesentations-PDFs), 20260918200000 (Hermann Vogl),
20260918210000 (Videoraeume nach dem Termin schliessen).

### Wie man den Stand prueft, statt zu raten

Eine Migration, die eine Funktion oder eine Regel anlegt, laesst sich
direkt befragen. Das ist verlaesslicher als jede Liste:

    select 'name der migration' as migration,
           to_regprocedure('public.name_der_funktion(uuid)') is not null as gelaufen;

Fuer eine Zugriffsregel:

    select exists (select 1 from pg_policies
                    where policyname = 'Name der Regel') as gelaufen;

Fuer einen Zeitplan:

    select jobname, schedule, active from cron.job order by jobname;

Mehrere Pruefungen lassen sich mit `union all` verbinden. Aber Vorsicht:
Scheitert EINE Zeile, kommt gar kein Ergebnis zurueck. Am 18.09.2026 hat
eine Abfrage ueber `cron.job` genau das ausgeloest, und es sah aus, als
waeren nur zwei von acht Migrationen geprueft worden. Im Zweifel in zwei
kleinere Abfragen teilen.

Zwei Dateien lassen sich so NICHT pruefen, weil sie weder Funktion noch
Regel anlegen: 20260916260000 (traegt Daten nach) und 20260918150000.
Dort hilft nur der Blick in die Datei.
