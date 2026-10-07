// 10 redaktionelle Artikel für Vertriebspartner – Immobilien & Kapitalanlage
// Quellen sind im Text als footnotes/Quellen-Block hinterlegt.

export interface WissensArtikel {
  slug: string;
  titel: string;
  kategorie: string;
  zusammenfassung: string;
  lesedauer: number; // in Minuten
  veroeffentlicht: string; // YYYY-MM-DD
  inhalt: string; // Markdown-ähnlich, Absätze mit \n\n, ## für Überschriften
  quellen: { titel: string; url: string }[];
}

export const WISSENS_ARTIKEL: WissensArtikel[] = [
  {
    slug: "immobilienmarkt-deutschland-2026",
    titel: "Immobilienmarkt Deutschland 2026: Wende nach der Korrektur",
    kategorie: "Immobilienmarkt",
    zusammenfassung:
      "Nach zwei Jahren Preiskorrektur stabilisieren sich die deutschen Wohnimmobilienpreise. Das bedeutet die aktuelle Lage für Kapitalanleger.",
    lesedauer: 6,
    veroeffentlicht: "2026-03-15",
    inhalt: `## Die Trendwende ist da

Der vdpResearch-Index zeigt seit dem dritten Quartal 2025 eine Stabilisierung der Wohnimmobilienpreise in Deutschland. Nach einem Rückgang von rund 13 % seit dem Höchststand 2022 verzeichnen die Top-7-Städte (München, Hamburg, Berlin, Köln, Frankfurt, Stuttgart, Düsseldorf) erstmals wieder leicht steigende Quadratmeterpreise.

## Treiber der Erholung

Drei Faktoren wirken zusammen:

1. **Sinkende Bauzinsen** – 10-jährige Hypothekendarlehen liegen wieder bei 3,1–3,4 %.
2. **Massive Wohnungsknappheit** – das Pestel-Institut beziffert das Defizit auf 910.000 Wohnungen bis Ende 2025.
3. **Mietpreis-Explosion** – Neuvertragsmieten in Ballungszentren steigen um 6–9 % p.a.

## Was das für Kapitalanleger bedeutet

Wer jetzt einsteigt, profitiert von einem historischen Window: niedrige Einstiegspreise, steigende Mieteinnahmen und perspektivisch wieder anziehende Kaufpreise. Besonders B- und C-Lagen mit guter Infrastruktur bieten Renditen von 4–6 % brutto.

## Fazit

Die Bodenbildung ist abgeschlossen. Wer die Marktphase nutzt, sichert sich Substanzwerte zu Konditionen, die in fünf Jahren nicht mehr zu sehen sein werden.`,
    quellen: [
      { titel: "vdp-Immobilienpreisindex Q4/2025", url: "https://www.pfandbrief.de/site/de/vdp/immobilie/marktinformation/vdp_immobilienpreisindex.html" },
      { titel: "Pestel-Institut Wohnungsbau-Studie 2025", url: "https://www.pestel-institut.de/" },
      { titel: "Bundesbank Zinsstatistik MFI", url: "https://www.bundesbank.de/de/statistiken/geld-und-kapitalmaerkte/zinssaetze-und-renditen" },
    ],
  },
  {
    slug: "denkmalschutz-afa-vorteile",
    titel: "Denkmal-AfA: Der unterschätzte Steuerturbo",
    kategorie: "Steuern",
    zusammenfassung:
      "Bis zu 9 % Abschreibung pro Jahr auf Sanierungskosten – die Denkmal-AfA nach §§ 7i, 10f EStG ist eines der attraktivsten Steuermodelle in Deutschland.",
    lesedauer: 5,
    veroeffentlicht: "2026-02-28",
    inhalt: `## Wie die Denkmal-AfA funktioniert

Käufer einer denkmalgeschützten Immobilie können den Sanierungsanteil über zwölf Jahre abschreiben:

- **Jahre 1–8:** je 9 % Abschreibung
- **Jahre 9–12:** je 7 % Abschreibung
- **Summe:** 100 % der Sanierungskosten in 12 Jahren absetzbar

Zusätzlich gilt für die Altbausubstanz die normale lineare AfA von 2,5 % p.a. (vor 1925 errichtet) bzw. 2,0 % p.a.

## Selbstnutzer profitieren ebenfalls

Über § 10f EStG können auch Eigennutzer 9 % der Sanierungskosten zehn Jahre lang als Sonderausgaben geltend machen – ein Vorteil, den die Wohnriester- oder Wohnungsbauprämie nicht erreicht.

## Praxisbeispiel

Bei 250.000 € Sanierungskosten ergibt sich allein im ersten Jahr eine zusätzliche Abschreibung von 22.500 €. Bei einem Spitzensteuersatz von 42 % entspricht das einer Steuerersparnis von 9.450 € – jährlich.

## Voraussetzungen

Wichtig ist die Bescheinigung der Denkmalschutzbehörde nach § 7i (2) EStG, ausgestellt **vor** Beginn der Sanierungsmaßnahmen. Ohne diese Bescheinigung erkennt das Finanzamt die erhöhte AfA nicht an.`,
    quellen: [
      { titel: "§ 7i EStG – Erhöhte Absetzungen bei Baudenkmalen", url: "https://www.gesetze-im-internet.de/estg/__7i.html" },
      { titel: "§ 10f EStG – Steuerbegünstigung für selbstgenutzte Baudenkmale", url: "https://www.gesetze-im-internet.de/estg/__10f.html" },
      { titel: "BMF-Schreiben zur Denkmal-AfA", url: "https://www.bundesfinanzministerium.de/" },
    ],
  },
  {
    slug: "neubau-afa-5-prozent-degressiv",
    titel: "Neubau-AfA 2024+: 5 % degressive Abschreibung nutzen",
    kategorie: "Steuern",
    zusammenfassung:
      "Mit dem Wachstumschancengesetz wurde die degressive AfA für neu gebaute Mietwohnungen reaktiviert. So funktioniert das Modell.",
    lesedauer: 4,
    veroeffentlicht: "2026-02-10",
    inhalt: `## Das neue Steuer-Vehikel

Seit dem Wachstumschancengesetz (März 2024) können Investoren für neu errichtete Mietwohngebäude eine **degressive AfA von 5 % p.a.** auf den Restbuchwert in Anspruch nehmen.

## Voraussetzungen

- Baubeginn zwischen 01.10.2023 und 30.09.2029
- Wohnung dient der Vermietung zu Wohnzwecken
- Anschaffungs-/Herstellungskosten ab dem Baubeginnjahr

## Vergleich linear vs. degressiv

Bei 400.000 € Gebäudewert:

- **Linear (3 % p.a.):** 12.000 € Abschreibung in den ersten Jahren – konstant
- **Degressiv (5 % p.a.):** 20.000 € im ersten Jahr, 19.000 € im zweiten, ...

Bereits in den ersten sechs Jahren beträgt die kumulierte Abschreibung 102.000 € (degressiv) statt 72.000 € (linear) – ein Liquiditätsvorteil von 30.000 €.

## Wechsel ist möglich

Der Investor darf jederzeit zur linearen AfA zurückwechseln – sinnvoll, sobald die degressive Methode unter den linearen Wert fällt.`,
    quellen: [
      { titel: "§ 7 Abs. 5a EStG – Degressive AfA für Wohngebäude", url: "https://www.gesetze-im-internet.de/estg/__7.html" },
      { titel: "Wachstumschancengesetz – BGBl. I Nr. 108/2024", url: "https://www.bgbl.de/" },
      { titel: "BMF-FAQ zur neuen Wohngebäude-AfA", url: "https://www.bundesfinanzministerium.de/" },
    ],
  },
  {
    slug: "kapitalanlage-vs-aktien-immobilien-rendite",
    titel: "Aktien vs. Immobilien: Der ehrliche Renditevergleich",
    kategorie: "Kapitalanlage",
    zusammenfassung:
      "MSCI World oder Mehrfamilienhaus? Wir vergleichen beide Anlageklassen über 20 Jahre – und beleuchten den Hebel-Effekt der Immobilie.",
    lesedauer: 7,
    veroeffentlicht: "2026-01-22",
    inhalt: `## Der Vergleich auf den ersten Blick

| Anlageklasse | Ø Rendite p.a. (20 J.) | Volatilität |
|---|---|---|
| MSCI World (TR, EUR) | 8,2 % | hoch |
| DAX (Performance) | 6,4 % | sehr hoch |
| Wohnimmobilie D-Top-7 | 4,8 % (Wertsteigerung) + 3,2 % (Mietrendite) = **8,0 %** | niedrig |

## Der entscheidende Hebel: Fremdfinanzierung

Aktien kaufst du meist mit eigenem Geld. Für eine vermietete Immobilie finanziert die Bank 80 bis 100 Prozent mit. Jede Wertentwicklung wirkt damit auf den vollen Kaufpreis und nicht nur auf deinen Anteil. Gerechnet mit den 4,8 % Wertsteigerung aus der Tabelle oben:

- 300.000 € Objektwert, davon 60.000 € Eigenkapital
- 4,8 % auf 300.000 € = **14.400 € Wertzuwachs im ersten Jahr**
- bezogen auf deine eingesetzten 60.000 € sind das **24 %**

Das zeigt den Hebel, ist aber noch keine Rendite. Zinsen, nicht umlagefähige Kosten, Leerstand, Steuer und deine monatlichen Zuzahlungen sind darin nicht enthalten. Und der Hebel wirkt in beide Richtungen: Sinkt der Wert um dieselben 4,8 %, sind es dieselben 14.400 €, und die trägst du allein, weil die Schuld bei der Bank unverändert bleibt. Je weniger Eigenkapital du einbringst, desto größer wird beides, die Chance und das Risiko. Der Unterschied zum Wertpapierkredit liegt darin, dass dir bei bedienter Rate niemand Geld nachfordert, während eine Depotfinanzierung bei fallenden Kursen genau das tut.

Was am Ende für dich herauskommt, hängt an deinem Objekt, deiner Finanzierung und deinem Steuersatz. Der Investmentrechner zeigt es dir für das konkrete Objekt: Cashflow vor und nach Steuer, den Steuereffekt im ersten Jahr und über zehn Jahre sowie das Gesamtvermögen nach zehn Jahren, unter jeder Zahl mit ihrem Rechenweg. Im Objektvergleich steht zusätzlich der interne Zinsfuß (IRR). Diese Zahlen rechnest du für das konkrete Objekt aus, statt eine Faustformel zu nennen.

## Steuern: der zweite große Unterschied

- **Aktien:** 25 % Abgeltungssteuer + Soli auf Kursgewinne und Dividenden
- **Immobilien:** Mietüberschüsse zum persönlichen Steuersatz, **aber** Verluste durch AfA und Zinsen voll absetzbar; Verkaufsgewinn nach 10 Jahren **steuerfrei**

## Fazit

Aktien sind liquider, Immobilien sind hebelbar und steuerlich privilegiert. Eine ausgewogene Strategie kombiniert beide – mit klarem Schwerpunkt auf Immobilien für den langfristigen Vermögensaufbau.`,
    quellen: [
      { titel: "MSCI World Index Factsheet 2025", url: "https://www.msci.com/" },
      { titel: "Bulwiengesa Immobilienmarkt-Report 2025", url: "https://www.bulwiengesa.de/" },
      { titel: "§ 23 EStG – Spekulationsfrist Immobilien", url: "https://www.gesetze-im-internet.de/estg/__23.html" },
    ],
  },
  {
    slug: "finanzierung-zinsbindung-strategie",
    titel: "Zinsbindung 2026: 10, 15 oder 20 Jahre?",
    kategorie: "Finanzierung",
    zusammenfassung:
      "Welche Zinsbindung passt zur aktuellen Marktphase? Eine Analyse mit Daten aus den letzten 25 Jahren.",
    lesedauer: 5,
    veroeffentlicht: "2026-01-08",
    inhalt: `## Aktuelle Konditionen (Stand: Januar 2026)

| Laufzeit | Bestkondition | Aufschlag zu 10 J. |
|---|---|---|
| 5 Jahre | 2,89 % | – 0,25 % |
| 10 Jahre | 3,14 % | Basis |
| 15 Jahre | 3,38 % | + 0,24 % |
| 20 Jahre | 3,52 % | + 0,38 % |

## Argumente für lange Zinsbindung (15–20 Jahre)

- **Planungssicherheit** über zwei Jahrzehnte
- Schutz vor Inflation und Zinsschock
- Sondertilgungsrecht meist enthalten (5 % p.a.)
- Sonderkündigungsrecht nach 10 Jahren gem. § 489 BGB

## Argumente für kurze Bindung (5–10 Jahre)

- Niedrigerer Sollzins
- Höhere Tilgung möglich → schneller schuldenfrei
- Bei sinkenden Zinsen Anschlussfinanzierung günstiger

## Strategie für Kapitalanleger

In der aktuellen Phase mit historisch niedrigen Zinsen und hoher Geldentwertung empfehlen wir **15-Jahres-Zinsbindungen mit § 489 BGB-Option**. Damit hat der Investor maximale Planungssicherheit, behält aber die Flexibilität, nach 10 Jahren bei Bedarf umzuschulden.

## Forward-Darlehen

Wer in 12–60 Monaten eine Anschlussfinanzierung benötigt, kann bereits heute Forward-Darlehen abschließen. Die Aufschläge betragen aktuell 0,02–0,03 % pro Vorlaufmonat – im historischen Vergleich günstig.`,
    quellen: [
      { titel: "Bundesbank Statistik MFI-Zinssätze", url: "https://www.bundesbank.de/de/statistiken/geld-und-kapitalmaerkte/zinssaetze-und-renditen" },
      { titel: "§ 489 BGB – Ordentliche Kündigungsrechte", url: "https://www.gesetze-im-internet.de/bgb/__489.html" },
      { titel: "Interhyp Bauzins-Trendindikator 2026", url: "https://www.interhyp.de/" },
    ],
  },
  {
    slug: "mietrecht-2026-mietpreisbremse",
    titel: "Mietpreisbremse 2026: Was Vermieter wissen müssen",
    kategorie: "Recht",
    zusammenfassung:
      "Die Mietpreisbremse wurde bis 2029 verlängert. Welche Ausnahmen gelten und wo Vermieter weiterhin Mietsteigerungen durchsetzen können.",
    lesedauer: 5,
    veroeffentlicht: "2025-12-12",
    inhalt: `## Was die Verlängerung bedeutet

Mit der Reform vom Oktober 2025 wurde die Mietpreisbremse (§ 556d ff. BGB) bis zum 31.12.2029 verlängert. In angespannten Wohnungsmärkten (rund 410 Kommunen) darf die Miete bei Neuvermietung höchstens 10 % über der ortsüblichen Vergleichsmiete liegen.

## Die wichtigen Ausnahmen

Vermieter dürfen oberhalb der 10-%-Grenze vermieten, wenn:

1. **Neubau** mit Erstbezug nach dem 01.10.2014
2. **Umfassend modernisierte Wohnungen** (Modernisierungskosten ≥ ein Drittel der Neubaukosten)
3. **Möblierte Wohnungen** mit nachweisbarem Möblierungszuschlag
4. **Vormiete höher** war (Bestandsschutz)

## Mieterhöhung im Bestand

Davon unberührt bleibt das Recht, die Miete im laufenden Mietverhältnis nach § 558 BGB an die ortsübliche Vergleichsmiete anzupassen – mit Kappungsgrenze von 20 % in drei Jahren (15 % in besonders angespannten Märkten).

## Tipp für Investoren

Wer in komplett sanierte Altbauten oder Neubauten investiert, ist von der Mietpreisbremse weitgehend befreit und kann die volle Marktmiete realisieren. Das macht den Unterschied von 2–4 €/m² aus – auf eine 80-m²-Wohnung gerechnet sind das bis zu 3.840 € Mehrertrag pro Jahr.`,
    quellen: [
      { titel: "§ 556d BGB – Zulässige Miethöhe bei Mietbeginn", url: "https://www.gesetze-im-internet.de/bgb/__556d.html" },
      { titel: "§ 558 BGB – Mieterhöhung bis zur ortsüblichen Vergleichsmiete", url: "https://www.gesetze-im-internet.de/bgb/__558.html" },
      { titel: "Bundesregierung – Mietrechtsreform 2025", url: "https://www.bundesregierung.de/" },
    ],
  },
  {
    slug: "energetische-sanierung-foerderung-2026",
    titel: "BEG-Förderung 2026: Bis zu 70 % Zuschuss für Sanierungen",
    kategorie: "Förderung",
    zusammenfassung:
      "Die Bundesförderung für effiziente Gebäude (BEG) bietet 2026 weiterhin attraktive Konditionen. Hier die wichtigsten Programme im Überblick.",
    lesedauer: 6,
    veroeffentlicht: "2025-11-30",
    inhalt: `## Die wichtigsten BEG-Bausteine

### BEG WG (Wohngebäude)
- KfW 261 (Kredit + Tilgungszuschuss): bis zu 150.000 € pro WE, Tilgungszuschuss 5–25 %
- BAFA-Zuschuss für Einzelmaßnahmen: 15–20 % Grundförderung

### iSFP-Bonus
Wer einen individuellen Sanierungsfahrplan (iSFP) erstellt und Maßnahmen daraus umsetzt, erhält **5 % zusätzliche Förderung** auf alle Einzelmaßnahmen.

### Heizungsförderung (KfW 458)
- Grundförderung: 30 %
- Klimageschwindigkeitsbonus: + 20 % (bis Ende 2028)
- Einkommensbonus: + 30 % (Haushalte unter 40.000 € zvE)
- **Maximal 70 % Zuschuss** auf den Einbau einer Wärmepumpe

## Steuerliche Alternative: § 35c EStG

Für selbstgenutzte Immobilien können energetische Maßnahmen alternativ über drei Jahre verteilt steuerlich abgesetzt werden – bis zu 40.000 € insgesamt (20 % von 200.000 €). Wahlrecht: BEG-Zuschuss **oder** Steuerbonus, nicht beides.

## Praxis-Tipp für Investoren

Bei Mietobjekten greift § 35c EStG nicht – hier sind die KfW/BAFA-Programme der einzige Förderweg. Wichtig: Förderantrag **vor** Auftragserteilung stellen, sonst entfällt die Förderung komplett.`,
    quellen: [
      { titel: "BMWK – Bundesförderung effiziente Gebäude", url: "https://www.bmwk.de/Redaktion/DE/Artikel/Energie/beg-bundesfoerderung-fuer-effiziente-gebaeude.html" },
      { titel: "KfW Förderprogramme 261/458", url: "https://www.kfw.de/" },
      { titel: "§ 35c EStG – Steuerermäßigung energetische Maßnahmen", url: "https://www.gesetze-im-internet.de/estg/__35c.html" },
    ],
  },
  {
    slug: "immobilien-standortanalyse-c-lagen",
    titel: "C-Lagen entdecken: Wo sich Investitionen 2026 noch lohnen",
    kategorie: "Standort",
    zusammenfassung:
      "Während A-Städte teuer bleiben, bieten C-Lagen wie Chemnitz, Plauen oder Salzgitter Renditen von 7–9 %. Welche Faktoren wirklich entscheiden.",
    lesedauer: 6,
    veroeffentlicht: "2025-11-14",
    inhalt: `## Die Klassifizierung

- **A-Städte** (München, Berlin, Hamburg, ...): Kaufpreisfaktor 28–38, Mietrendite 2,7–3,8 %
- **B-Städte** (Leipzig, Hannover, Dortmund, ...): Faktor 22–28, Rendite 3,8–4,8 %
- **C-Städte** (Chemnitz, Magdeburg, Salzgitter, ...): Faktor 12–18, Rendite **6,5–9 %**

## Was eine gute C-Lage auszeichnet

1. **Positive Bevölkerungsprognose** (BBSR-Vorausberechnung bis 2040)
2. **Diversifizierte Wirtschaft** – nicht abhängig von einem einzigen Großarbeitgeber
3. **Mietpreissteigerungen ≥ 3 % p.a.** in den letzten 5 Jahren
4. **Leerstandsquote unter 4 %** (BBSR-Wohnungsmarktbeobachtung)
5. **Universitäts- oder Hochschulstandort** (stabilisiert Nachfrage)

## Konkrete Beispiele 2026

| Stadt | Kaufpreisfaktor | Bruttorendite |
|---|---|---|
| Salzgitter | 13 | 7,7 % |
| Chemnitz | 14 | 7,1 % |
| Plauen | 12 | 8,3 % |
| Bremerhaven | 15 | 6,7 % |

## Risiken nicht ausblenden

C-Lagen erfordern intensiveres Property Management, höhere Instandhaltungsrücklagen (1,2–1,5 €/m²) und eine sorgfältigere Mieterauswahl. Wer das beachtet, erzielt jedoch deutlich bessere Cashflows als in A-Städten.`,
    quellen: [
      { titel: "BBSR-Wohnungsmarktbeobachtung 2025", url: "https://www.bbsr.bund.de/" },
      { titel: "Bulwiengesa Riwis-Datenbank", url: "https://www.bulwiengesa.de/de/riwis" },
      { titel: "JLL Wohnimmobilienreport 2025", url: "https://www.jll.de/" },
    ],
  },
  {
    slug: "kaufnebenkosten-richtig-kalkulieren",
    titel: "Kaufnebenkosten 2026: 9–12 % – und warum Eigenkapital Pflicht ist",
    kategorie: "Kapitalanlage",
    zusammenfassung:
      "Grunderwerbsteuer, Notar, Grundbuch und Makler – die Kaufnebenkosten summieren sich schnell auf 12 % des Kaufpreises. Ein Überblick mit Spartipps.",
    lesedauer: 5,
    veroeffentlicht: "2025-10-22",
    inhalt: `## Die einzelnen Posten

| Kostenart | Höhe | Anmerkung |
|---|---|---|
| Grunderwerbsteuer | 3,5 – 6,5 % | Bundeslandabhängig |
| Notar | ca. 1,5 % | Gebühren nach GNotKG |
| Grundbuch | ca. 0,5 % | Eigentumsumschreibung + Grundschuld |
| Makler (Käuferanteil) | 1,785 – 3,57 % | Nach BMI-Reform 2020: max. 50 % vom Käufer |
| **Summe** | **7,3 – 12 %** | |

## Bundesland-Unterschiede

- **Bayern, Sachsen:** 3,5 % GrESt – günstigster Standort
- **Brandenburg, NRW, Schleswig-Holstein, Saarland, Thüringen:** 6,5 % GrESt – Spitzenreiter
- Berlin hat 6 %, Hamburg 5,5 %, Hessen 6 %

## Wichtig: Kaufnebenkosten **nicht** finanzierbar (Regel)

Banken finanzieren in der Regel nur den **Kaufpreis** (max. 100 % Beleihung), nicht aber die Kaufnebenkosten. Das heißt: Investoren müssen mindestens 9–12 % Eigenkapital für die Nebenkosten aufbringen – meist aus liquiden Mitteln.

## Spartipps

1. **Inventar separat ausweisen** – auf Möbel & Einbauten fällt keine GrESt an (Rechtsprechung: bis ~15 % des Kaufpreises akzeptiert das FA)
2. **Maklerprovision verhandeln** – seit dem Bestellerprinzip-Reform deutlich verhandelbarer
3. **Notar-Vergleich** – die Gebühren sind zwar gesetzlich geregelt, aber bei Mehrobjekt-Käufen lassen sich Synergien heben

## Steuerliche Behandlung

Bei vermieteten Immobilien sind Kaufnebenkosten als Anschaffungskosten nicht direkt absetzbar, sondern werden über die AfA verteilt. Ausnahme: Finanzierungskosten (Bereitstellungszinsen, Schätzgebühren der Bank) sind sofort als Werbungskosten abziehbar.`,
    quellen: [
      { titel: "Grunderwerbsteuersätze der Bundesländer", url: "https://www.bundesfinanzministerium.de/" },
      { titel: "GNotKG – Gerichts- und Notarkostengesetz", url: "https://www.gesetze-im-internet.de/gnotkg/" },
      { titel: "BGH-Urteil zur Bestellerprinzip-Reform", url: "https://www.bundesgerichtshof.de/" },
    ],
  },
  {
    slug: "vermoegensaufbau-immobilien-rente",
    titel: "Vermögensaufbau mit Immobilien: Der Weg zur 4.000-€-Privatrente",
    kategorie: "Vermögensaufbau",
    zusammenfassung:
      "Wie viele Immobilien braucht es, um sich eine zweite Rente von 4.000 € netto aufzubauen? Eine Modellrechnung mit drei Wohnungen.",
    lesedauer: 6,
    veroeffentlicht: "2025-10-05",
    inhalt: `## Das Ziel: 4.000 € Netto-Mietüberschuss im Alter

Bei einem realistischen Mietzins von 11 €/m² in B-Lagen entspricht das einer vermieteten Wohnfläche von rund 360 m² – also 3 bis 4 Wohnungen mit 80–100 m².

## Modellrechnung: 3 Wohnungen, gestaffelt erworben

Annahmen pro Wohnung: Kaufpreis 280.000 €, Wohnfläche 75 m², Kaltmiete 12 €/m² = 900 €/Monat. Eigenkapital 40.000 €, Rest finanziert mit 3,5 % Sollzins, 30 Jahre Tilgung.

| Jahr | Wohnung 1 | Wohnung 2 | Wohnung 3 | Cashflow gesamt |
|---|---|---|---|---|
| 1 | gekauft | – | – | – 50 € / Monat |
| 5 | – | gekauft | – | + 80 € |
| 10 | – | – | gekauft | + 350 € |
| 30 | abbezahlt | abbezahlt | abbezahlt | **+ 4.100 €** |

## Was den Plan ermöglicht

1. **Mietsteigerungen** über 30 Jahre: Inflation + Indexmieten heben die Mieten von 900 € auf rund 1.700 €
2. **Tilgung wird Mieter-finanziert** – die Bank wird vom Mieter abbezahlt
3. **Steuerersparnisse in der Aufbauphase** – AfA + Zinsen senken die Steuerlast
4. **Wertsteigerung als Bonus** – Immobilien sind nach 30 Jahren statistisch das 2,5- bis 3-fache wert (HVPI-bereinigt 1,5-fach)

## Risikoabsicherung

- Risikolebensversicherung über die Restschuld
- Mindestens 3 Monatsnettomieten Liquiditätsreserve pro Wohnung
- Streuung auf verschiedene Standorte
- Property Management vor Ort

## Fazit

Ein realistischer Aufbau einer zweiten Rente ist mit drei vermieteten Wohnungen und systematischer Strategie machbar – wenn früh angefangen wird und die Finanzierung sauber strukturiert ist.`,
    quellen: [
      { titel: "Deutsche Bundesbank Vermögensbildung Privathaushalte", url: "https://www.bundesbank.de/" },
      { titel: "Statistisches Bundesamt – HVPI Wohnimmobilien", url: "https://www.destatis.de/" },
      { titel: "DIW Wochenbericht – Immobilienvermögen 2024", url: "https://www.diw.de/" },
    ],
  },
];

export function getArtikelBySlug(slug: string): WissensArtikel | undefined {
  return WISSENS_ARTIKEL.find((a) => a.slug === slug);
}

export function getNeighbourArtikel(slug: string): { prev?: WissensArtikel; next?: WissensArtikel } {
  const idx = WISSENS_ARTIKEL.findIndex((a) => a.slug === slug);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? WISSENS_ARTIKEL[idx - 1] : undefined,
    next: idx < WISSENS_ARTIKEL.length - 1 ? WISSENS_ARTIKEL[idx + 1] : undefined,
  };
}
