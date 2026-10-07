# Bonitätsunterlagen abhängig von der Beschäftigungsart

## Problem

Die Bankprüfungsliste ist fest auf Angestellte verdrahtet. Wählt der Kunde in der
Selbstauskunft "selbstständig", werden zwar BWA, Steuerbescheide und
Handelsregisterauszug ergänzt, aber Lohnsteuerbescheinigung, Arbeitsvertrag und
Renteninformation bleiben als Pflichtfelder stehen. Die Liste existiert
zusätzlich viermal dupliziert im Code (Kundenprofil, Kundenportal,
Kundenprofilseite, MobileScan), deshalb driften die Ansichten auseinander.

## Umsetzung

### 1. Eine gemeinsame Quelle

Neue Datei `src/lib/bankpruefungDocs.ts` mit einer Funktion
`buildBankpruefungDocs(saData, kunde, personSuffix)`. Sie liefert die komplette
Bankprüfungsliste inklusive der bisherigen dynamischen Regeln (Mietvertrag,
Kreditverträge, Vermögensnachweise, Bankkonten). Die vier Stellen im Code rufen
künftig nur noch diese Funktion auf, statt eigene Listen zu pflegen.

Der Bonitätscheck bleibt unverändert, wie gewünscht, für alle Beschäftigungsarten
identisch.

### 2. Regeln je Beschäftigungsart (Bankprüfung)

Angestellt (unverändert):
Lohnsteuerbescheinigung (Pflicht), Steuerbescheid / Negativ-Erklärung (Pflicht),
Arbeitsvertrag (Pflicht), Renteninformation (Pflicht), Eigenkapitalnachweis
(Pflicht), Kontoauszüge 3 Monate (Pflicht), PKV Nachweis (optional).

Selbstständig:
- Lohnsteuerbescheinigung des Vorjahrs: nicht mehr Pflicht (bleibt optional,
  falls jemand zusätzlich angestellt war)
- Arbeitsvertrag: nicht mehr Pflicht (optional)
- Steuerbescheide der letzten 3 Jahre: Pflicht (ersetzt den einzelnen
  "Letzter Steuerbescheid" und die bisherige 2-Jahres-Position)
- Bilanz / BWA der letzten 3 Jahre: Pflicht
- Steuererklärungen komplett (letzte 3 Jahre): Pflicht
- Handelsregisterauszug: optional (nur wenn eingetragene Firma)
- Renteninformation: bleibt, aber optional statt Pflicht
- Eigenkapitalnachweis, Kontoauszüge 3 Monate: Pflicht
- Geschäftskontoauszüge der letzten 3 Monate: Pflicht
- PKV Nachweis: optional

Beamter: wie Angestellt, zusätzlich Besoldungsbescheide (Pflicht), Arbeitsvertrag
wird zu "Ernennungsurkunde" (optional).

### 3. Was ich streichen würde

- "Aktuelle Renteninformation" nur noch Pflicht bei Angestellten unter 27 nicht
  anfordern; generell bei Selbstständigen optional, weil dort meist keine
  gesetzliche Anwartschaft besteht.
- "Letzter Steuerbescheid / Negativ-Erklärung" entfällt bei Selbstständigen als
  eigene Position, weil er in "Steuerbescheide der letzten 3 Jahre" aufgeht.
- "Handelsregisterauszug" bleibt optional, viele Einzelunternehmer haben keinen.

Nichts wird ersatzlos für Angestellte gelöscht, damit bestehende Akten nicht
plötzlich unvollständig aussehen.

### 4. Umgang mit bereits hochgeladenen Dateien

Positionen, zu denen bereits ein Dokument vorliegt, bleiben immer sichtbar, auch
wenn sie für die neue Beschäftigungsart nicht mehr vorgesehen sind. So geht kein
Upload verloren, wenn die Beschäftigungsart nachträglich korrigiert wird.

### 5. Technische Details

- Neue Datei: `src/lib/bankpruefungDocs.ts`
- Angepasst: `src/pages/KundenDetail.tsx`, `src/pages/KundeInvestments.tsx`,
  `src/pages/Kundenprofilseite.tsx`, `src/pages/MobileScan.tsx`
- Person 2 nutzt dieselbe Funktion mit Suffix "Person 2" und liest
  `saData.person2Data.beschaeftigungsart`
- Keine Datenbank-Migration nötig, die Listen werden zur Laufzeit berechnet
- Prüfung vor Abschluss: `npx tsc -b`, `npm run build`, `npx vitest run`
