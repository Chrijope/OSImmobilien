# Kennung statt Name

Auftrag vom 28.09.2026: Kunden und Personen werden in allen Abläufen über die
Kennung zugeordnet, nicht über den Namen. Zwei Konten können gleich heißen.
Die Abläufe selbst bleiben, geändert ist nur, woran zugeordnet wird.

## Die Regel

1. Die Kennung entscheidet allein, sobald sie gesetzt ist
   (`zustaendig_id`, `authUser.id`, `kontakt.id`, `meta.vpId`, `setterId`,
   `setterCloserId`, `zugeordnet_id`).
2. Der Name ist nur Rückfall für alte Datensätze ohne Kennung, und auch dann
   nur, wenn er unter allen Nutzern genau einmal vorkommt. Verglichen wird
   tolerant (Groß- und Kleinschreibung, Leerzeichen), mit
   `normalisiereBeraterName` bzw. `berater_name_normal`.
3. Passt ein Name auf mehrere Nutzer, wird nichts zugeordnet: im Log eine
   Warnung, bei der Übergabe eine sichtbare Meldung, in der Datenbank bleibt
   der Kontakt ohne Zuständigkeit und die Glocke geht an Admin und Inhaber.
4. Wo bisher nur der Name geschrieben wurde, wird die Kennung mitgeschrieben.
5. Kennung veraltet, Name aktuell: Bei Feldpaaren, deren Name sich ohne die
   Kennung ändern lässt, zählt die Kennung nur, wenn der Name der Person
   dahinter zum eingetragenen Namen passt. Sonst zählt der eindeutige Name,
   bei mehrdeutigem Namen niemand (`istPerson`, `kennungMitNamensprobe`).
   Das betrifft `setter`/`setterId` (der Trigger `trg_kontakt_zuordnung`
   setzt eine geänderte `setterId` für Nicht-Admins still zurück, der Name
   ändert sich trotzdem) und `setterCloser`/`setterCloserId`.
6. `berater`/`zustaendig_id` kann ebenfalls auseinanderlaufen (Setter-Skript
   ohne eindeutigen Treffer, Versicherungs-Closer, Altbestand). Dort bleibt
   `zustaendig_id` maßgeblich, weil an ihr die Zeilenrechte hängen und eine
   Liste nichts zeigen soll, was die Datenbank nicht ausliefert. Abrechnung
   und Provision warnen einmal je Fall im Log; gezählt wird im Lese-SQL.

Helfer: `istZustaendig`, `kontaktImTeam`, `kontaktBelongsToUser`
(`src/lib/kontaktOwnership.ts`), `kennungZuName`, `nameMeintNutzer`,
`nameMehrdeutig` (`src/lib/beraterNamensabgleich.ts`), `beraterKennung`
(`supabase/functions/_shared/berater-namensabgleich.ts`).

## Bestandsaufnahme

Art A: Zuordnung oder Rechte (wer sieht was, wem gehört was, wer bekommt
Glocke, Mail, Provision, Übergabe). Art B: nur Anzeige oder Filter, den der
Nutzer selbst wählt. Zeilen nach dem Umbau.

### A, umgestellt

| Datei:Zeile | Was | Risiko vorher |
|---|---|---|
| src/lib/kontaktOwnership.ts:49, 68 | `kontaktBelongsToUser`, neu `istZustaendig`: Name nur eindeutig | hoch, Sichtbarkeit und Provision überall |
| src/lib/kontaktOwnership.ts:114 | neu `kontaktImTeam`, Dashboard-Bucket: Kennung schlägt Namen | mittel, fremde Kontakte im Team |
| src/lib/datenSicht.ts:159 | eigene Sicht und Teamsicht | mittel |
| src/lib/kontaktTypHelper.ts:72 | Kontakttyp eigen/Team, Name ODER Kennung | mittel |
| src/pages/KundenDetail.tsx:2893 | Erstgesprächs-Skript für eigene Leads | mittel |
| src/lib/statistikenHelper.ts:229, 233, 372 | ROI und VP-Kennzahlen (derzeit ohne Aufrufer) | niedrig |
| src/lib/gamificationEngine.ts | Kontakte je Nutzer nur über den Namen | mittel |
| src/pages/Auswertungen.tsx:101 | Partnerauswahl hält die Kennung, Satz und Karriere per Kennung | mittel |
| src/components/auswertungen/FunnelReport.tsx:97 | Funnel je Partner | niedrig |
| src/pages/Empfehlungen.tsx:165, 195 | Sichtbarkeit, Statusrecht, „gesehen“ markieren über `meta.vpId` bzw. Zeilen-IDs | hoch, fremde Empfehlungen |
| src/pages/Empfehlungen.tsx:683 | Empfehlenden Kunden öffnen: Kennung, Name nur eindeutig | mittel, falscher Kunde |
| src/pages/MeineLeads.tsx:86, src/pages/Verloren.tsx:62 | Setter-Leads über `setterId` | mittel |
| src/pages/Papierkorb.tsx:190 | Vorbelegung beim Wiederherstellen | niedrig |
| src/pages/Teampartner.tsx:1259, 1371 | Strukturbaum des Partners über die eigene Kennung | mittel, fremder Baum |
| src/components/dashboard/TeamUebersichtCard.tsx:40 | Tippgeber-Zähler | niedrig |
| src/components/dashboard/KundenCard.tsx:131, PotenzialCard.tsx:38 | Downline-Kontakte | mittel |
| src/lib/beraterHistorie.ts:137, 327 | `reassignBerater(Bulk)` nimmt `zielId`, doppelter Name bricht vor dem Schreiben ab | hoch, Lead, Glocke und Mail beim Namensvetter |
| src/lib/beraterHistorie.ts:155, 512 | Historie schreibt `id` mit und schließt Einträge über sie | mittel |
| src/pages/KundenDetail.tsx:4027, 4076 | Berater- und Setterwechsel geben die Kennung weiter | hoch |
| src/pages/KundenDetail.tsx:3270, 3309, 3320, 5273 | Setter-Flow: Auswahl hält die Kennung, `setterCloserId`, „Lead neu zuweisen“ setzt `zustaendig_id` | hoch, Glocke beim Falschen, Lead blieb beim alten Partner |
| src/pages/KundenDetail.tsx:3862 | No-Show-Glocke | mittel |
| src/components/setter/SetterSkript.tsx:395 | Setter-Skript: gewählte Kennung vor Namen | mittel |
| src/components/kunden/BeraterSearchSelect.tsx | liefert zusätzlich die Kennung | Voraussetzung |
| src/lib/chatStore.ts:307 | Partner als Chat-Teilnehmer | mittel |
| src/lib/terminErgebnis.ts:340 | Empfänger der Folgeaufgabe | mittel |
| src/lib/buchungslinkMail.ts:62 | Signatur der Buchungslink-Mail | niedrig |
| src/pages/Ansprechpartner.tsx:95 | Chat mit Ansprechpartner nur bei eindeutigem Namen | mittel |
| src/pages/AlleKontakte.tsx:734, KontoAbschaltenDialog.tsx | Umverteilen mit Kennung | hoch |
| src/pages/Provisionsabrechnung.tsx:118, 167 | eigene Deals und Junior-Overrides | hoch, doppelt gezählt |
| src/pages/Provisionsabrechnung.tsx:222 | eigene Abrechnung über `authUser.id` (vorher mangels Kennung nur Name) | hoch, fremde Abrechnung sichtbar |
| src/pages/Abrechnungen.tsx:224, 1388 | Partnerliste und Entwicklungskurve | hoch |
| src/components/dashboard/ProvisionChart.tsx:35, 60 | Satz und Junior: Kennung vor Namen | mittel |
| src/lib/karriereStufeHelper.ts:214 | eigen/zugewiesen ohne Ersteller-Kennung | mittel, Satz |
| src/components/kunde/portal/KundePortalLayout.tsx:197, KundeChat.tsx:109, KundeEmpfehlungen.tsx:138, vpBewertungContext.ts:54 | Portal: Namensrückfall nur bei genau einem Treffer | mittel |
| supabase/functions/check-document-reminders/index.ts:162 | Glocke nur über den Namen | mittel |
| supabase/functions/send-zoom-beratung-reminders/index.ts:84 | Glocke nur über den Namen | mittel |
| supabase/functions/send-erstgespraech-reminders/index.ts:124 | Mail-Signatur nur über den Namen | niedrig |
| src/components/bewerbung/AktivierungTab.tsx:182 | Tippgeber mit `zugeordnet_id` | mittel |
| src/lib/einheitBelegung.ts:399 | „eigener Kunde“ an einer Einheit | niedrig |
| src/lib/supportTicketStore.ts:425, src/pages/SupportKontaktieren.tsx:105 | eigene Tickets ohne Kennung (Testkonto) | niedrig |
| SQL `create_empfehlung_kontakt` | Partner über neuesten Namenstreffer | mittel |
| SQL `create_tippgeber_lead` | Partner über neuesten Namenstreffer | mittel |
| SQL `investments_provisionssatz_festschreiben` | eigen/zugewiesen über Namensvergleich | mittel, Satz |

### A, war schon richtig (Kennung zuerst, Name nur eindeutig)

`investment_partner_id` (SQL, seit 18.09.), `is_vp_owner_of_kontakt` und alle
Kontakt-Regeln (nur `zustaendig_id`), `kontakt_zustaendigkeit_schuetzen`,
Handbuch (`berater_id`), `src/lib/mailBerater.ts:54`,
`supabase/functions/submit-lead/index.ts:889`,
`supabase/functions/_shared/ansprechpartner.ts:88`,
`finalize-selbstauskunft/index.ts:666` und `finalize-reservierung/index.ts:810`
(Kennung zuerst, `maybeSingle` liefert bei zwei Treffern nichts),
`src/lib/statistikController.ts:146, 637`, `src/pages/Statistiken.tsx:267`,
`send-weekly-vp-summary` (Kennung), Einheiten-Exklusivität (`exklusivNutzer`).

### A, bewusst offen

| Datei:Zeile | Warum offen |
|---|---|
| src/pages/Objekte.tsx:259, src/lib/objektZugang.ts:49, src/pages/Einheitenspiegel.tsx:59 | `objekte.exklusiv_partner` ist eine Liste von Namen. Kennungen bräuchten eine neue Spalte oder eine Umstellung der Liste, das ist eine Datenmodellfrage |
| src/pages/KundenDetail.tsx:12401 | Versicherungs-Closer schreibt `berater` ohne `zustaendig_id`. Die Rolle hat seit 16.09.2026 keinen Datenbankzugriff auf Kontakte; ob der Ablauf noch lebt, klärt Christian |
| src/components/dashboard/NoShowQuoteCard.tsx:74, 94 | No-Show-Quote der Setterin über `setter`-Namen, reine Statistik |
| src/lib/statistikenHelper.ts:401 | Empfehlungsquote über Kundennamen, Funktion ohne Aufrufer |
| src/lib/bewerberKontaktversuch.ts:88 | feste HR-Ansprechperson für die Mail-Signatur über den Namen |
| Altbestand | Kontakte mit `berater`, aber ohne `zustaendig_id`, und Tippgeber ohne `zugeordnet_id` bleiben beim Namensrückfall. Nachfüllen nur nach Freigabe, Zahlen siehe Lese-SQL |

### B, bleibt

Benutzerfilter nach Beratername (`BeraterFilter.tsx`, `KontakteFilterLeiste.tsx`,
`StatistikCustomReports.tsx:105`), Anzeigen (`TippgeberPortal.tsx:294`,
`Wettbewerb.tsx:559`, `StatistikActivity.tsx:158`, `AnsprechpartnerCard.tsx`),
Dokument- und Dateinamen (`d.name === …` in Objekt-, Kunden- und
Finanzierungsseiten, `finalize-vertrag:463`, `save-expose-pdf`),
Bundesländer, Dublettenhinweis über Nachname (`kontakt-dublette.ts`).

## Lese-SQL für Christian

Ändert nichts und gibt keine Namen aus. `name_passt_nicht_zur_kennung` und
`kennung_ohne_beratername` sind die Kontakte, die seit der Umstellung in
Abrechnungen (Partnerliste) und Gamification zusätzlich über die Kennung
zählen, weil dort vorher allein der Name entschied.

```sql
select
  (select count(*) from public.kontakte
    where coalesce(btrim(berater), '') <> '' and zustaendig_id is null
      and coalesce(geloescht, false) = false) as kontakte_name_ohne_kennung,
  (select count(*) from public.kontakte k
    where coalesce(btrim(k.berater), '') <> '' and k.zustaendig_id is null
      and coalesce(k.geloescht, false) = false
      and (select count(*) from public.profiles p
            where public.berater_name_normal(p.name) = public.berater_name_normal(k.berater)) > 1) as davon_name_mehrdeutig,
  (select count(*) from public.kontakte k
    where k.zustaendig_id is not null and coalesce(btrim(k.berater), '') <> ''
      and coalesce(k.geloescht, false) = false
      and not exists (select 1 from public.profiles p
            where p.id = k.zustaendig_id
              and public.berater_name_normal(p.name) = public.berater_name_normal(k.berater))) as name_passt_nicht_zur_kennung,
  (select count(*) from public.kontakte
    where zustaendig_id is not null and coalesce(btrim(berater), '') = ''
      and coalesce(geloescht, false) = false) as kennung_ohne_beratername,
  (select count(*) from public.kontakte
    where coalesce(btrim(meta ->> 'setterId'), '') <> '' and coalesce(btrim(meta ->> 'setter'), '') <> ''
      and not exists (select 1 from public.profiles p
            where p.id::text = meta ->> 'setterId'
              and public.berater_name_normal(p.name) = public.berater_name_normal(meta ->> 'setter'))) as setter_kennung_passt_nicht,
  (select count(*) from public.tippgeber
    where zugeordnet_id is null and coalesce(btrim(zugeordnet_name), '') <> '') as tippgeber_name_ohne_kennung,
  (select count(*) from (
     select 1 from public.profiles
      where coalesce(btrim(name), '') <> ''
      group by public.berater_name_normal(name)
     having count(*) > 1) x) as namen_mehrfach_vergeben;
```

Anzahl je mehrfach vergebenem Namen, ohne den Namen:

```sql
select count(*) as profile_mit_diesem_namen
  from public.profiles
 where coalesce(btrim(name), '') <> ''
 group by public.berater_name_normal(name)
having count(*) > 1
 order by 1 desc;
```
