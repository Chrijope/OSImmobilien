import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte der Beispielrechnung `EinheitFinanzen`, Deutsch und Englisch
 * (Kundensprache, Etappe 3). Englisch sieht nur der Kunde im Reiter
 * „Finanzen“ der Kundenansicht; das CRM hat keinen Sprachrahmen und bleibt
 * deutsch, auch mit den Sätzen, die nur Mitarbeiter lesen (`crm…`).
 *
 * Englisch nach `kundenspracheGlossar.ts`: Eigenkapital „equity“, Tilgung
 * „repayment“, Kaufnebenkosten „incidental purchase costs“, Hausgeld
 * „service charge“, AfA „depreciation (AfA)“, Grundbuch „land register“.
 */
export interface EinheitFinanzenTexte {
  monate: string[];
  jahre: (n: number) => string;
  werteAb: (monat: string, jahr: number) => string;
  werteImJahr: (jahr: number) => string;
  zweitesErsetzt: { bankdarlehen: string; eigenkapital: string };
  parameter: string;
  parameterSchliessen: string;
  eigenkapital: string;
  betrag: string;
  eigenkapitalHinweis: string;
  bankdarlehen: string;
  berechnungUeber: string;
  berechnungsmodus: string;
  tilgung: string;
  laufzeit: string;
  zinssatz: string;
  tilgungAusLaufzeit: string;
  tilgungAusLaufzeitInfo: string;
  laufzeitBisVolltilgung: string;
  rundJahre: (jahre: string) => string;
  keinDarlehen: string;
  monatlicheRate: string;
  zweitesDarlehen: string;
  zweitesAnsetzen: string;
  zweitesVerwendung: string;
  steuer: string;
  zve: string;
  familienstand: string;
  ledig: string;
  verheiratet: string;
  grenzsteuersatz: (satz: string, jahr: number, splitting: boolean) => string;
  erweitert: string;
  nkVerkaeufer: string;
  lohnsteuer: string;
  sonderAfa: string;
  optionen: string;
  monatlicheKaltmiete: string;
  mieteZuruecksetzen: (betrag: string) => string;
  stellplatzmiete: (betrag: string) => string;
  leerstandsquote: string;
  mietgarantie: (jahre: number) => string;
  mietsteigerung: string;
  kostensteigerung: string;
  wertentwicklung: string;
  afaSatzGebaeude: string;
  afaZuruecksetzen: (satz: string) => string;
  sevEinbeziehen: string;
  sevJeMonat: (betrag: string) => string;
  sevKeineAngabe: string;
  finanzierungsuebersicht: string;
  eigenkapitalMit: (prozent: string) => string;
  kaufnebenkosten: string;
  verkaeuferKlammer: (betrag: string) => string;
  eigenkapitalersatz: string;
  eigeninvestition: string;
  eigeninvestitionInfo: string;
  darlehensbetrag: string;
  darlehensbetragInfo: (quote: string) => string;
  davonBank: string;
  davonZweites: (zins: string, tilgung: string) => string;
  tilgungAusJahren: (jahre: number) => string;
  annuitaet: string;
  bruttomietrendite: string;
  bruttomietrenditeInfo: string;
  nettomietrendite: string;
  nettomietrenditeInfo: string;
  kaufpreisKarte: string;
  kaufpreisImmobilie: string;
  stellplatz: string;
  keinStellplatz: string;
  gesamtkaufpreis: string;
  kaufpreisaufteilung: string;
  grundstuecksanteil: (prozent: string) => string;
  gebaeudeanteil: (prozent: string) => string;
  aufteilungAngenommen: (prozent: string) => string;
  abschreibung: string;
  bemessungsgrundlage: string;
  bemessungsgrundlageInfo: string;
  afaSatz: string;
  angepasst: string;
  afaJahr: string;
  sonderAfaJahr: (jahre: number) => string;
  sanierungTitel: string;
  fertigstellung: (jahr: number) => string;
  massnahmeGesamt: string;
  miteigentumsanteil: string;
  deinAnteil: (art: string) => string;
  erhaltungsaufwand: (jahr: number) => string;
  herstellungskosten: string;
  nichtAngesetzt: string;
  steuerersparnis: (von: number, bis?: number) => string;
  hinweisErhaltung: (jahre: number) => string;
  hinweisWerkvertrag: string;
  hinweisNichtAngesetzt: string;
  nebenkostenTitel: string;
  satzGepflegt: string;
  grunderwerbsteuer: (land: string, prozent: string) => string;
  bundeslandUnbekannt: string;
  bundesland: string;
  notar: string;
  notarInfo: string;
  grundschuld: string;
  grundschuldInfo: (betrag: string) => string;
  grundbuch: string;
  grundbuchInfo: string;
  makler: (prozent: string) => string;
  gesamt: string;
  gesamtVomKaufpreis: (betrag: string, prozent: string) => string;
  /** Seit dem 30.09.2026: mit Sanierungsanteil laufen die Nebenkosten ohne ihn. */
  gesamtAufBasis: (betrag: string, prozent: string, basis: string) => string;
  nebenkostenOhneSanierung: string;
  nebenkostenHinweis: string;
  nebenkostenVerkaeufer: string;
  betrachtungsjahr: string;
  monatTitel: (jahr: number) => string;
  einnahmen: string;
  mieteinnahmen: string;
  steuervorteil: string;
  steuervorteilLohnsteuer: string;
  steuervorteilFolgejahr: string;
  einnahmenGesamt: string;
  ausgaben: string;
  finanzierungZinsTilgung: string;
  zinsUndTilgungInfo: (zins: string, tilgung: string) => string;
  sevMietverwaltung: string;
  ruecklage: string;
  imHausgeld: string;
  ruecklageInfo: string;
  hausgeldNichtUmlagefaehig: string;
  hausgeldNichtUmlagefaehigInfo: string;
  mietausfall: string;
  ausgabenGesamt: string;
  monatlicheEigeninvestition: string;
  monatlicherUeberschuss: string;
  entwicklung: string;
  restschuld10: string;
  volltilgung: string;
  imJahr: (jahr: number) => string;
  nichtInnerhalb: (jahre: number) => string;
  traegtSich: string;
  traegtSichAb: (jahr: number) => string;
  traegtSichInfo: string;
  vermoegenNach: (jahre: number) => string;
  jeJahr: (prozent: string) => string;
  vermoegenInfo: (wert: string, restschuld: string, cashflow: string, einsatz: string) => string;
  vermoegenErstAb: (jahre: number) => string;
  verlaufAusblenden: string;
  verlaufAnzeigen: string;
  spalten: { jahr: string; miete: string; zins: string; tilgung: string; steuer: string; cashflow: string; restschuld: string };
  cashflowHinweis: string;
  zweckKunde: string;
  kopfKunde: string;
}

export const EINHEIT_FINANZEN_TEXTE: ZweiSprachen<EinheitFinanzenTexte> = {
  de: {
    monate: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    jahre: (n) => `${n} Jahre`,
    werteAb: (monat, jahr) => `Werte ab ${monat} ${jahr}`,
    werteImJahr: (jahr) => `Werte im Jahr ${jahr}`,
    zweitesErsetzt: { bankdarlehen: "Teil des Bankdarlehens (z. B. KfW)", eigenkapital: "Eigenkapitalersatz (finanziert Nebenkosten und Eigenkapital)" },
    parameter: "Finanzierungsparameter",
    parameterSchliessen: "Parameter schließen",
    eigenkapital: "Eigenkapital",
    betrag: "Betrag",
    eigenkapitalHinweis: "Anteil an der Gesamtinvestition. Die Kaufnebenkosten kommen zusätzlich aus Eigenkapital, sofern nicht der Verkäufer sie übernimmt.",
    bankdarlehen: "Bankdarlehen",
    berechnungUeber: "Berechnung über",
    berechnungsmodus: "Berechnungsmodus",
    tilgung: "Tilgung",
    laufzeit: "Laufzeit",
    zinssatz: "Zinssatz",
    tilgungAusLaufzeit: "Tilgung aus der Laufzeit",
    tilgungAusLaufzeitInfo: "Anfängliche Tilgung, mit der das Darlehen nach der gewählten Laufzeit getilgt ist.",
    laufzeitBisVolltilgung: "Laufzeit bis zur Volltilgung",
    rundJahre: (jahre) => `rund ${jahre} Jahre`,
    keinDarlehen: "kein Darlehen",
    monatlicheRate: "Monatliche Rate",
    zweitesDarlehen: "Zweites Darlehen",
    zweitesAnsetzen: "Zweites Darlehen ansetzen",
    zweitesVerwendung: "Verwendung des zweiten Darlehens",
    steuer: "Steuer",
    zve: "Zu versteuerndes Einkommen vor Investition",
    familienstand: "Familienstand",
    ledig: "Ledig",
    verheiratet: "Verheiratet",
    grenzsteuersatz: (satz, jahr, splitting) => `Grenzsteuersatz ${satz} nach Tarif ${jahr}${splitting ? ", Splitting" : ""}`,
    erweitert: "Erweiterte Finanzierungsoptionen",
    nkVerkaeufer: "Kaufnebenkosten übernimmt Verkäufer",
    lohnsteuer: "Steuervorteil monatlich über Freibetrag (§ 39a EStG)",
    sonderAfa: "Sonder-AfA ansetzen (§ 7b EStG)",
    optionen: "Berechnungsoptionen",
    monatlicheKaltmiete: "Monatliche Kaltmiete",
    mieteZuruecksetzen: (betrag) => `Auf Miete der Einheit zurücksetzen (${betrag})`,
    stellplatzmiete: (betrag) => `Inklusive Stellplatzmiete ${betrag}, weil der Stellplatz in der Gesamtinvestition steckt.`,
    leerstandsquote: "Leerstandsquote",
    mietgarantie: (jahre) => `Mietgarantie ${jahre} ${jahre === 1 ? "Jahr" : "Jahre"}: in dieser Zeit wird kein Leerstand angesetzt.`,
    mietsteigerung: "Mietsteigerung je Jahr",
    kostensteigerung: "Kostensteigerung je Jahr",
    wertentwicklung: "Immobilienwertentwicklung je Jahr",
    afaSatzGebaeude: "AfA-Satz Gebäude",
    afaZuruecksetzen: (satz) => `Auf hinterlegte AfA zurücksetzen (${satz})`,
    sevEinbeziehen: "SEV (Mietverwaltung) einbeziehen",
    sevJeMonat: (betrag) => ` · ${betrag} je Monat`,
    sevKeineAngabe: " · keine Angabe",
    finanzierungsuebersicht: "Finanzierungsübersicht",
    eigenkapitalMit: (prozent) => `Eigenkapital (${prozent})`,
    kaufnebenkosten: "Kaufnebenkosten",
    verkaeuferKlammer: (betrag) => `${betrag} (Verkäufer)`,
    eigenkapitalersatz: "Eigenkapitalersatz durch zweites Darlehen",
    eigeninvestition: "Eigeninvestition",
    eigeninvestitionInfo: "Was der Käufer selbst einbringt: Eigenkapital an der Investition plus die Kaufnebenkosten.",
    darlehensbetrag: "Darlehensbetrag",
    darlehensbetragInfo: (quote) => `${quote} der Gesamtinvestition.`,
    davonBank: "davon Bankdarlehen",
    davonZweites: (zins, tilgung) => `davon zweites Darlehen (${zins}, Tilgung ${tilgung})`,
    tilgungAusJahren: (jahre) => `Tilgung (aus ${jahre} Jahren Laufzeit)`,
    annuitaet: "Monatliche Annuität",
    bruttomietrendite: "Bruttomietrendite",
    bruttomietrenditeInfo: "Jahreskaltmiete geteilt durch den Kaufpreis inklusive Stellplatz.",
    nettomietrendite: "Nettomietrendite",
    nettomietrenditeInfo: "Jahreskaltmiete abzüglich nicht umlegbarem Hausgeld, Rücklage und Mietverwaltung, geteilt durch Kaufpreis plus Nebenkosten.",
    kaufpreisKarte: "Kaufpreis und Kaufpreisaufteilung",
    kaufpreisImmobilie: "Kaufpreis Immobilie",
    stellplatz: "Stellplatz",
    keinStellplatz: "kein Stellplatz",
    gesamtkaufpreis: "Gesamtkaufpreis",
    kaufpreisaufteilung: "Kaufpreisaufteilung",
    grundstuecksanteil: (prozent) => `Grundstücksanteil (${prozent})`,
    gebaeudeanteil: (prozent) => `Gebäudeanteil (${prozent})`,
    aufteilungAngenommen: (prozent) => `Keine Aufteilung angegeben, ${prozent} Gebäudeanteil angenommen.`,
    abschreibung: "Abschreibung",
    bemessungsgrundlage: "Bemessungsgrundlage Gebäude",
    bemessungsgrundlageInfo: "Gebäudeanteil des Kaufpreises plus anteilige Kaufnebenkosten. Ein als Erhaltungsaufwand abgezogener Sanierungsanteil ist herausgerechnet, er wirkt nur einmal.",
    afaSatz: "AfA-Satz",
    angepasst: "angepasst",
    afaJahr: "Jährliche AfA Gebäude",
    sonderAfaJahr: (jahre) => `Sonder-AfA je Jahr (${jahre} Jahre)`,
    sanierungTitel: "Sanierung am Gemeinschaftseigentum",
    fertigstellung: (jahr) => `Fertigstellung ${jahr}`,
    massnahmeGesamt: "Maßnahme gesamt",
    miteigentumsanteil: "Miteigentumsanteil",
    deinAnteil: (art) => `Dein Anteil (${art})`,
    erhaltungsaufwand: (jahr) => `Erhaltungsaufwand ${jahr}`,
    herstellungskosten: "Herstellungskosten",
    nichtAngesetzt: "nicht angesetzt",
    steuerersparnis: (von, bis) => `Steuerersparnis ${von}${bis ? ` bis ${bis}` : ""}`,
    hinweisErhaltung: (jahre) => `Der Anteil wirkt als Erhaltungsaufwand${jahre > 1 ? `, verteilt auf ${jahre} Jahre (§ 82b EStDV)` : " im Jahr der Fertigstellung"}. Die Ersparnis ist einmalig und steckt nicht in der Monatsrechnung. Ob der Verkäufer den Betrag als Hausgeld vorab einzahlt, steht im Kaufvertrag.`,
    hinweisWerkvertrag: "Der Anteil gilt als Herstellungskosten und erhöht nur die AfA-Grundlage.",
    hinweisNichtAngesetzt: "Steuerlich nicht angesetzt.",
    nebenkostenTitel: "Kaufnebenkosten",
    satzGepflegt: "Satz wie am Objekt gepflegt",
    grunderwerbsteuer: (land, prozent) => `Grunderwerbsteuer (${land}, ${prozent})`,
    bundeslandUnbekannt: "Bundesland unbekannt, Mittelwert",
    bundesland: "Bundesland",
    notar: "Notar Kaufvertrag (Beurkundung, Vollzug, Betreuung)",
    notarInfo: "Gebührensätze 2,0 plus 0,5 plus 0,5 nach GNotKG Tabelle B auf den Gesamtkaufpreis ohne Sanierungsanteil, inklusive 19 % Umsatzsteuer.",
    grundschuld: "Grundschuld (Notar und Grundbuch)",
    grundschuldInfo: (betrag) => `Beurkundung 1,0 (mit Umsatzsteuer) und Eintragung 1,0 auf den Grundschuldbetrag ${betrag}.`,
    grundbuch: "Grundbuch (Vormerkung, Eigentumsumschreibung)",
    grundbuchInfo: "Gebührensätze 0,5 plus 1,0 nach GNotKG Tabelle B, ohne Umsatzsteuer.",
    makler: (prozent) => `Makler (${prozent})`,
    gesamt: "Gesamt",
    gesamtVomKaufpreis: (betrag, prozent) => `${betrag} · ${prozent} vom Kaufpreis`,
    gesamtAufBasis: (betrag, prozent, basis) => `${betrag} · ${prozent} auf ${basis}`,
    nebenkostenOhneSanierung: "Der Erhaltungsaufwand ist eine gesonderte Leistung und im Notarvertrag eigens ausgewiesen. Grunderwerbsteuer, Notar und Grundbuch rechnen wir deshalb nur auf den Kaufpreis der Immobilie. Ob das Finanzamt die Grunderwerbsteuer trotzdem auf den ganzen Betrag erhebt, hängt vom Vertrag ab. Das klärt dein Steuerberater. ",
    nebenkostenHinweis: "Notar und Grundbuch nach dem Gerichts- und Notarkostengesetz, ohne Auslagen und Löschungen alter Rechte.",
    nebenkostenVerkaeufer: " Der Verkäufer übernimmt diese Kosten laut Annahme.",
    betrachtungsjahr: "Betrachtungsjahr",
    monatTitel: (jahr) => `Monatliche Übersicht ${jahr}`,
    einnahmen: "Einnahmen",
    mieteinnahmen: "Mieteinnahmen",
    steuervorteil: "Steuervorteil",
    steuervorteilLohnsteuer: "Monatlich über den Freibetrag auf der Lohnsteuerkarte.",
    steuervorteilFolgejahr: "Als Erstattung im Folgejahr, hier auf den Monat umgelegt. Im ersten Jahr deshalb 0.",
    einnahmenGesamt: "Einnahmen gesamt",
    ausgaben: "Ausgaben",
    finanzierungZinsTilgung: "Finanzierung (Zins und Tilgung)",
    zinsUndTilgungInfo: (zins, tilgung) => `Zins ${zins}, Tilgung ${tilgung}.`,
    sevMietverwaltung: "SEV Mietverwaltung",
    ruecklage: "Instandhaltungsrücklage",
    imHausgeld: "im Hausgeld enthalten",
    ruecklageInfo: "Die Rücklage steckt im nicht umlagefähigen Hausgeld.",
    hausgeldNichtUmlagefaehig: "Hausgeld nicht umlagefähig",
    hausgeldNichtUmlagefaehigInfo: "Verwaltung und Rücklage der Eigentümergemeinschaft, die beim Eigentümer bleiben.",
    mietausfall: "Mietausfall (Leerstand)",
    ausgabenGesamt: "Ausgaben gesamt",
    monatlicheEigeninvestition: "Monatliche Eigeninvestition",
    monatlicherUeberschuss: "Monatlicher Überschuss",
    entwicklung: "Entwicklung und Vermögen",
    restschuld10: "Restschuld nach 10 Jahren",
    volltilgung: "Volltilgung",
    imJahr: (jahr) => `im Jahr ${jahr}`,
    nichtInnerhalb: (jahre) => `nicht innerhalb von ${jahre} Jahren`,
    traegtSich: "Wohnung trägt sich",
    traegtSichAb: (jahr) => `ab ${jahr}`,
    traegtSichInfo: "Erstes Jahr, in dem Miete und Steuervorteil die Ausgaben decken.",
    vermoegenNach: (jahre) => `Vermögen nach ${jahre} Jahren`,
    jeJahr: (prozent) => ` · ${prozent} je Jahr`,
    vermoegenInfo: (wert, restschuld, cashflow, einsatz) => `Immobilienwert ${wert} minus Restschuld ${restschuld} plus kumulierter Cashflow ${cashflow}. Rendite auf ${einsatz} Eigeninvestition.`,
    vermoegenErstAb: (jahre) => `Vermögensaufbau erst ab ${jahre} Jahren Haltedauer.`,
    verlaufAusblenden: "Tilgungsplan und Cashflow ausblenden",
    verlaufAnzeigen: "Tilgungsplan und Cashflow je Jahr anzeigen",
    spalten: { jahr: "Jahr", miete: "Miete", zins: "Zins", tilgung: "Tilgung", steuer: "Steuer", cashflow: "Cashflow", restschuld: "Restschuld" },
    cashflowHinweis: "Cashflow nach Steuern je Jahr: Miete minus Rate, nicht umlagefähiges Hausgeld und Mietverwaltung plus zahlungswirksamer Steuervorteil, ohne die einmalige Ersparnis aus einer Sanierung. Steuer negativ heißt Mehrsteuer.",
    zweckKunde: "Mit den Reglern probierst du eigene Werte aus, gespeichert wird nichts. Deine persönliche Rechnung gehst du mit deinem Ansprechpartner durch.",
    kopfKunde: "Kaltmiete und Abschreibung aus der Wohnung, Bundesland aus der Adresse. Jede Änderung rechnet sofort neu.",
  },
  en: {
    monate: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    jahre: (n) => `${n} years`,
    werteAb: (monat, jahr) => `Figures from ${monat} ${jahr}`,
    werteImJahr: (jahr) => `Figures for ${jahr}`,
    zweitesErsetzt: { bankdarlehen: "Part of the bank loan (e.g. KfW)", eigenkapital: "Equity substitute (finances incidental costs and equity)" },
    parameter: "Financing parameters",
    parameterSchliessen: "Close parameters",
    eigenkapital: "Equity",
    betrag: "Amount",
    eigenkapitalHinweis: "Share of the total investment. The incidental purchase costs are paid from equity on top, unless the seller covers them.",
    bankdarlehen: "Bank loan",
    berechnungUeber: "Calculate by",
    berechnungsmodus: "Calculation mode",
    tilgung: "Repayment",
    laufzeit: "Term",
    zinssatz: "Interest rate",
    tilgungAusLaufzeit: "Repayment from the term",
    tilgungAusLaufzeitInfo: "Initial repayment at which the loan is paid off after the chosen term.",
    laufzeitBisVolltilgung: "Term until fully repaid",
    rundJahre: (jahre) => `about ${jahre} years`,
    keinDarlehen: "no loan",
    monatlicheRate: "Monthly instalment",
    zweitesDarlehen: "Second loan",
    zweitesAnsetzen: "Include a second loan",
    zweitesVerwendung: "Use of the second loan",
    steuer: "Tax",
    zve: "Taxable income before the investment",
    familienstand: "Marital status",
    ledig: "Single",
    verheiratet: "Married",
    grenzsteuersatz: (satz, jahr, splitting) => `Marginal tax rate ${satz} according to the ${jahr} tax scale${splitting ? ", splitting table (Splittingtabelle)" : ""}`,
    erweitert: "Advanced financing options",
    nkVerkaeufer: "Seller covers the incidental purchase costs",
    lohnsteuer: "Monthly tax relief via tax allowance (Section 39a EStG)",
    sonderAfa: "Apply special depreciation (Section 7b EStG)",
    optionen: "Calculation options",
    monatlicheKaltmiete: "Monthly net cold rent",
    mieteZuruecksetzen: (betrag) => `Reset to the unit’s rent (${betrag})`,
    stellplatzmiete: (betrag) => `Including parking space rent of ${betrag}, because the parking space is part of the total investment.`,
    leerstandsquote: "Vacancy rate",
    mietgarantie: (jahre) => `Rent guarantee ${jahre} ${jahre === 1 ? "year" : "years"}: no vacancy is assumed during this period.`,
    mietsteigerung: "Rent increase per year",
    kostensteigerung: "Cost increase per year",
    wertentwicklung: "Property value growth per year",
    afaSatzGebaeude: "Building depreciation rate (AfA)",
    afaZuruecksetzen: (satz) => `Reset to the stored depreciation rate (${satz})`,
    sevEinbeziehen: "Include SEV (rental management)",
    sevJeMonat: (betrag) => ` · ${betrag} per month`,
    sevKeineAngabe: " · not specified",
    finanzierungsuebersicht: "Financing overview",
    eigenkapitalMit: (prozent) => `Equity (${prozent})`,
    kaufnebenkosten: "Incidental purchase costs",
    verkaeuferKlammer: (betrag) => `${betrag} (seller)`,
    eigenkapitalersatz: "Equity substitute from the second loan",
    eigeninvestition: "Own investment",
    eigeninvestitionInfo: "What the buyer contributes: equity in the investment plus the incidental purchase costs.",
    darlehensbetrag: "Loan amount",
    darlehensbetragInfo: (quote) => `${quote} of the total investment.`,
    davonBank: "of which bank loan",
    davonZweites: (zins, tilgung) => `of which second loan (${zins}, repayment ${tilgung})`,
    tilgungAusJahren: (jahre) => `Repayment (from a ${jahre}-year term)`,
    annuitaet: "Monthly annuity",
    bruttomietrendite: "Gross rental yield",
    bruttomietrenditeInfo: "Annual net cold rent divided by the purchase price including the parking space.",
    nettomietrendite: "Net rental yield",
    nettomietrenditeInfo: "Annual net cold rent less non-recoverable service charge, maintenance reserve and rental management, divided by purchase price plus incidental costs.",
    kaufpreisKarte: "Purchase price and price allocation",
    kaufpreisImmobilie: "Purchase price of the property",
    stellplatz: "Parking space",
    keinStellplatz: "no parking space",
    gesamtkaufpreis: "Total purchase price",
    kaufpreisaufteilung: "Purchase price allocation",
    grundstuecksanteil: (prozent) => `Land share (${prozent})`,
    gebaeudeanteil: (prozent) => `Building share (${prozent})`,
    aufteilungAngenommen: (prozent) => `No allocation specified, ${prozent} building share assumed.`,
    abschreibung: "Depreciation",
    bemessungsgrundlage: "Depreciation base, building",
    bemessungsgrundlageInfo: "Building share of the purchase price plus the proportional incidental costs. A renovation share deducted as maintenance expenses is taken out, so it only counts once.",
    afaSatz: "Depreciation rate (AfA)",
    angepasst: "adjusted",
    afaJahr: "Annual building depreciation",
    sonderAfaJahr: (jahre) => `Special depreciation per year (${jahre} years)`,
    sanierungTitel: "Renovation of the common property",
    fertigstellung: (jahr) => `Completion ${jahr}`,
    massnahmeGesamt: "Total works",
    miteigentumsanteil: "Co-ownership share",
    deinAnteil: (art) => `Your share (${art})`,
    erhaltungsaufwand: (jahr) => `maintenance expenses ${jahr}`,
    herstellungskosten: "production costs",
    nichtAngesetzt: "not applied",
    steuerersparnis: (von, bis) => `Tax relief ${von}${bis ? ` to ${bis}` : ""}`,
    hinweisErhaltung: (jahre) => `The share counts as maintenance expenses (Erhaltungsaufwand)${jahre > 1 ? `, spread over ${jahre} years (Section 82b EStDV)` : " in the year of completion"}. The saving is one-off and is not included in the monthly calculation. Whether the seller pays the amount in advance as service charge is set out in the purchase contract.`,
    hinweisWerkvertrag: "The share counts as production costs (Herstellungskosten) and only increases the depreciation base.",
    hinweisNichtAngesetzt: "Not applied for tax purposes.",
    nebenkostenTitel: "Incidental purchase costs",
    satzGepflegt: "Rate as recorded for the property",
    grunderwerbsteuer: (land, prozent) => `Real estate transfer tax (${land}, ${prozent})`,
    bundeslandUnbekannt: "federal state unknown, average",
    bundesland: "federal state",
    notar: "Notary, purchase contract (certification, execution, supervision)",
    notarInfo: "Fee rates 2.0 plus 0.5 plus 0.5 under GNotKG table B on the total purchase price excluding the renovation share, including 19% VAT.",
    grundschuld: "Land charge (notary and land register)",
    grundschuldInfo: (betrag) => `Certification 1.0 (with VAT) and registration 1.0 on the land charge amount of ${betrag}.`,
    grundbuch: "Land register (priority notice, transfer of ownership)",
    grundbuchInfo: "Fee rates 0.5 plus 1.0 under GNotKG table B, without VAT.",
    makler: (prozent) => `Estate agent (${prozent})`,
    gesamt: "Total",
    gesamtVomKaufpreis: (betrag, prozent) => `${betrag} · ${prozent} of the purchase price`,
    gesamtAufBasis: (betrag, prozent, basis) => `${betrag} · ${prozent} on ${basis}`,
    nebenkostenOhneSanierung: "The maintenance expenses are a separate service and stated separately in the notarial contract. We therefore calculate real estate transfer tax, notary and land registry fees on the purchase price of the property only. Whether the tax office still levies the transfer tax on the full amount depends on the contract. Your tax adviser will clarify this. ",
    nebenkostenHinweis: "Notary and land register fees under the German Court and Notary Fees Act (GNotKG), excluding expenses and the cancellation of old rights.",
    nebenkostenVerkaeufer: " According to the assumption, the seller covers these costs.",
    betrachtungsjahr: "Year shown",
    monatTitel: (jahr) => `Monthly overview ${jahr}`,
    einnahmen: "Income",
    mieteinnahmen: "Rental income",
    steuervorteil: "Tax relief",
    steuervorteilLohnsteuer: "Monthly via the tax allowance on your wage tax card.",
    steuervorteilFolgejahr: "As a refund in the following year, shown here per month. Therefore 0 in the first year.",
    einnahmenGesamt: "Total income",
    ausgaben: "Expenses",
    finanzierungZinsTilgung: "Financing (interest and repayment)",
    zinsUndTilgungInfo: (zins, tilgung) => `Interest ${zins}, repayment ${tilgung}.`,
    sevMietverwaltung: "SEV rental management",
    ruecklage: "Maintenance reserve",
    imHausgeld: "included in the service charge",
    ruecklageInfo: "The reserve is included in the non-recoverable service charge.",
    hausgeldNichtUmlagefaehig: "Non-recoverable service charge",
    hausgeldNichtUmlagefaehigInfo: "Management and maintenance reserve of the owners’ association that stay with the owner.",
    mietausfall: "Loss of rent (vacancy)",
    ausgabenGesamt: "Total expenses",
    monatlicheEigeninvestition: "Monthly own contribution",
    monatlicherUeberschuss: "Monthly surplus",
    entwicklung: "Development and wealth",
    restschuld10: "Remaining debt after 10 years",
    volltilgung: "Fully repaid",
    imJahr: (jahr) => `in ${jahr}`,
    nichtInnerhalb: (jahre) => `not within ${jahre} years`,
    traegtSich: "Flat pays for itself",
    traegtSichAb: (jahr) => `from ${jahr}`,
    traegtSichInfo: "First year in which rent and tax relief cover the expenses.",
    vermoegenNach: (jahre) => `Wealth after ${jahre} years`,
    jeJahr: (prozent) => ` · ${prozent} per year`,
    vermoegenInfo: (wert, restschuld, cashflow, einsatz) => `Property value ${wert} minus remaining debt ${restschuld} plus cumulative cash flow ${cashflow}. Return on an own investment of ${einsatz}.`,
    vermoegenErstAb: (jahre) => `Wealth building only from a holding period of ${jahre} years.`,
    verlaufAusblenden: "Hide repayment schedule and cash flow",
    verlaufAnzeigen: "Show repayment schedule and cash flow per year",
    spalten: { jahr: "Year", miete: "Rent", zins: "Interest", tilgung: "Repayment", steuer: "Tax", cashflow: "Cash flow", restschuld: "Remaining debt" },
    cashflowHinweis: "Cash flow after tax per year: rent minus instalment, non-recoverable service charge and rental management, plus tax relief paid out, excluding the one-off saving from a renovation. A negative tax figure means additional tax.",
    zweckKunde: "Use the sliders to try your own figures; nothing is saved. Go through your personal calculation with your contact.",
    kopfKunde: "Net cold rent and depreciation from the flat, federal state from the address. Every change recalculates immediately.",
  },
};
