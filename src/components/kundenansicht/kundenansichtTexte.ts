import { texteFuer, type Sprache, type ZweiSprachen } from "@/lib/seitenSprache";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";

/**
 * Alle festen Texte der Kundenansicht (`/immobilie/:token`), Deutsch und
 * Englisch. Kundensprache, Etappe 3 (S1).
 *
 * Die Bausteine lesen die Sprache über `useAnzeigeSprache()`. Ohne
 * `SeitenSpracheProvider` gilt Deutsch. Die Vorschau „Als Kunde ansehen“
 * setzt ihn seit dem 05.10.2026 mit der Sprache des gewählten Kunden.
 *
 * Englisch nach `kundenspracheGlossar.ts`: der Berater ist „your contact“,
 * nie „advisor“; Kaltmiete „net cold rent“, Hausgeld „service charge
 * (Hausgeld)“, Kaufnebenkosten „incidental purchase costs“.
 */
export interface KundenansichtTexte {
  seite: {
    laedt: string;
    vergebenTitel: string;
    vergebenText: string;
    nichtGefundenTitel: string;
    nichtGefundenText: string;
    fehlerTitel: string;
    fehlerText: string;
    erneutLaden: string;
  };
  chips: { fuerDich: string; verfuegbar: string };
  renditeErklaerung: string;
  galerie: { gruppe: string; wohnung: string; haus: string };
  lage: { titel: string; leer: string };
  beschreibung: { titel: string; markt: string };
  merkmale: { titel: string; quelle: string };
  fuss: {
    stand: (zeit: string) => string;
    haftung: string;
    impressum: string;
    datenschutz: string;
  };
  partner: { titel: string };
  expose: { herunterladen: string; fehler: string };
  wechsel: {
    nav: string;
    verfuegbar: (n: number) => string;
    waehlen: string;
    fuerDichKlammer: string;
    fuerDichKurz: string;
    zimmerKurz: (z: string) => string;
  };
  dokumente: {
    haus: string;
    objekt: string;
    wohnung: string;
    leerTitel: string;
    leerText: string;
  };
  wohnungName: (nummer: string) => string;
  wohnungOhneNummer: string;
  erklaerung: { bauzustand: string; anlageklasse: string; kaltmiete: string; rendite: string };
  haus: {
    vergebenSatz: string;
    objekt: string;
    keineAngabe: string;
    bis: string;
    zzglNebenkosten: (prozent: string, bundesland?: string) => string;
    zzglNebenkostenJeLand: string;
    kaufpreisGesamt: string;
    wohnflaecheGesamt: string;
    summeEinheiten: string;
    jahresmiete: string;
    jeMonat: (betrag: string, summe: boolean) => string;
    mietrendite: string;
    jahresmieteDurchKaufpreis: string;
    einheiten: string;
    imHaus: string;
    baujahr: string;
    sanierung: (spanne: string) => string;
    wohnflaechen: string;
    zimmer: string;
    kaufpreise: string;
    kaltmieteJeMonat: string;
    kaltmieteJeQm: (von: string, bis: string) => string;
    rendite: string;
    preisJeQm: string;
    kaufpreisDurchFlaeche: string;
    verfuegbar: string;
    wohnungen: (n: number) => string;
    keineFrei: string;
    anzahlVerfuegbar: (n: number) => string;
    objektdetails: string;
    energieausweis: string;
    klasse: (k: string) => string;
    gueltigBis: (d: string) => string;
    gemeinschaftseigentum: string;
    sanierungen: string;
    sanierungSumme: (betrag: string) => string;
    verwaltung: string;
    mietenspiegel: string;
    einheit: string;
    lage: string;
    wohnflaeche: string;
    kaltmiete: string;
    vermietung: string;
    vermietet: string;
    frei: string;
    nurImGanzen: string;
    verfuegbareWohnungen: string;
    keineFreiLang: string;
    wohnung: string;
    etage: string;
    flaeche: string;
    kaufpreis: string;
    oeffnen: (name: string) => string;
    fuerDichReserviert: string;
    zimmerAnzahl: (z: string) => string;
    kaltmieteMit: (betrag: string) => string;
    renditeMit: (wert: string) => string;
    klickHinweis: string;
  };
  wohnung: {
    zurHaus: string;
    reiter: { uebersicht: string; dokumente: string; finanzen: string; karte: string };
    objektangaben: string;
    objektart: string;
    keineAngabe: string;
    gesamtinvestition: string;
    kaufpreisPlusStellplatz: (kaufpreis: string, stellplatz: string) => string;
    kaufpreis: (kaufpreis: string) => string;
    monatsmiete: string;
    renditeUnter: (wert: string) => string;
    hausgeldNichtUmlegbar: (betrag: string) => string;
    wohnflaeche: string;
    jeQm: (betrag: string) => string;
    kaufpreisDurchFlaeche: string;
    typUndNutzung: string;
    eigentumswohnung: string;
    kapitalanlage: string;
    kapitalanlageVermietet: string;
    afa: (modell: string, satz: string) => string;
    objektdetails: string;
    infoHinweis: string;
    fakten: string;
    mietuebersicht: string;
    neubauOhne: (wert: string) => string;
    keineAngabenBautraeger: string;
    massnahmenBautraeger: (vermerk: string) => string;
    deinAnteil: string;
    deinAnteilInfo: string;
    gemeinschaftseigentum: (text: string) => string;
    finanzenHinweis: string;
  };
}

export const KUNDENANSICHT_TEXTE: ZweiSprachen<KundenansichtTexte> = {
  de: {
    seite: {
      laedt: "Deine Objektübersicht wird geladen…",
      vergebenTitel: "Diese Immobilie ist inzwischen vergeben",
      vergebenText: "Dein Ansprechpartner zeigt dir gern Alternativen.",
      nichtGefundenTitel: "Diese Seite ist nicht verfügbar",
      nichtGefundenText: "Der Link ist unvollständig oder nicht mehr gültig. Melde dich gern bei uns, dann bekommst du einen neuen.",
      fehlerTitel: "Die Seite lässt sich gerade nicht laden",
      fehlerText: "Bitte versuche es gleich noch einmal.",
      erneutLaden: "Erneut laden",
    },
    chips: { fuerDich: "Für dich reserviert", verfuegbar: "Verfügbar" },
    renditeErklaerung: "Zwölf Monatskaltmieten geteilt durch den Kaufpreis, ohne Nebenkosten, Hausgeld und Rücklage.",
    galerie: { gruppe: "Welche Fotos", wohnung: "Fotos der Wohnung", haus: "Fotos des Hauses" },
    lage: {
      titel: "Lage und Umgebung",
      leer: "Zur Lage dieser Immobilie liegen noch keine Angaben vor. Dein Ansprechpartner beantwortet dir Fragen zur Umgebung gern.",
    },
    beschreibung: { titel: "Beschreibung und Standort", markt: "Markt und Standort" },
    merkmale: { titel: "Ausstattung und Merkmale", quelle: "Quelle: Objektangaben des Anbieters." },
    fuss: {
      stand: (zeit) => `Stand ${zeit} Uhr.`,
      haftung: "Alle Angaben ohne Gewähr, sie stammen vom Anbieter und aus öffentlichen Quellen. Maßgeblich sind Kaufvertrag, Teilungserklärung und Wirtschaftsplan. Die Beispielrechnung ersetzt keine Finanzierungs- oder Steuerberatung.",
      impressum: "Impressum",
      datenschutz: "Datenschutz",
    },
    partner: { titel: "Dein Ansprechpartner" },
    expose: {
      herunterladen: "Exposé herunterladen",
      fehler: "Das Exposé ließ sich gerade nicht erstellen. Versuch es bitte gleich noch einmal.",
    },
    wechsel: {
      nav: "Wohnung wechseln",
      verfuegbar: (n) => `${n} Wohnungen in diesem Haus verfügbar`,
      waehlen: "Wohnung wählen",
      fuerDichKlammer: " (für dich reserviert)",
      fuerDichKurz: " · für dich",
      zimmerKurz: (z) => `${z} Zi.`,
    },
    dokumente: {
      haus: "Dokumente zum Haus",
      objekt: "Dokumente zum Objekt",
      wohnung: "Dokumente zu dieser Wohnung",
      leerTitel: "Noch keine Unterlagen zum Ansehen",
      leerText: "Dein Ansprechpartner schickt dir die Unterlagen gern persönlich.",
    },
    wohnungName: (nummer) => `Wohnung ${nummer}`,
    wohnungOhneNummer: "Wohnung",
    erklaerung: {
      bauzustand: "Bestand, Kernsanierung oder Neubau.",
      anlageklasse: "Die Art der Kapitalanlage.",
      kaltmiete: "Die Nettokaltmiete je Monat, ohne Nebenkosten.",
      rendite: "Zwölf Monatskaltmieten geteilt durch den Kaufpreis. Hausgeld und Rücklage sind nicht abgezogen, sie stehen darunter.",
    },
    haus: {
      vergebenSatz: "Diese Wohnung ist inzwischen vergeben. Dein Ansprechpartner zeigt dir gern Alternativen.",
      objekt: "Objekt",
      keineAngabe: "Keine Angabe",
      bis: "bis",
      zzglNebenkosten: (prozent, bundesland) => `zuzüglich Kaufnebenkosten ${prozent}${bundesland ? ` in ${bundesland}` : ""}`,
      zzglNebenkostenJeLand: "zuzüglich Kaufnebenkosten je Bundesland",
      kaufpreisGesamt: "Kaufpreis Gesamtobjekt",
      wohnflaecheGesamt: "Wohnfläche gesamt",
      summeEinheiten: "Summe der Einheiten",
      jahresmiete: "Jahresnettokaltmiete",
      jeMonat: (betrag, summe) => `${betrag} je Monat${summe ? ", Summe der Einheiten" : ""}`,
      mietrendite: "Mietrendite",
      jahresmieteDurchKaufpreis: "Jahreskaltmiete durch Kaufpreis",
      einheiten: "Einheiten",
      imHaus: "im Haus",
      baujahr: "Baujahr",
      sanierung: (spanne) => `Sanierung ${spanne}`,
      wohnflaechen: "Wohnflächen",
      zimmer: "Zimmer",
      kaufpreise: "Kaufpreise",
      kaltmieteJeMonat: "Kaltmiete je Monat",
      kaltmieteJeQm: (von, bis) => `${von} bis ${bis} € je m²`,
      rendite: "Rendite",
      preisJeQm: "Preis je m²",
      kaufpreisDurchFlaeche: "Kaufpreis durch Wohnfläche",
      verfuegbar: "Verfügbar",
      wohnungen: (n) => (n === 1 ? "1 Wohnung" : `${n} Wohnungen`),
      keineFrei: "Im Moment ist keine Wohnung frei",
      anzahlVerfuegbar: (n) => (n === 1 ? "1 Wohnung verfügbar" : `${n} Wohnungen verfügbar`),
      objektdetails: "Objektdetails",
      energieausweis: "Energieausweis",
      klasse: (k) => `Klasse ${k}`,
      gueltigBis: (d) => `gültig bis ${d}`,
      gemeinschaftseigentum: "Gemeinschaftseigentum",
      sanierungen: "Sanierungen",
      sanierungSumme: (betrag) => `${betrag} gesamt, Anteil je Wohnung nach Miteigentumsanteil`,
      verwaltung: "Verwaltung",
      mietenspiegel: "Einheiten und Mieten im Haus",
      einheit: "Einheit",
      lage: "Lage",
      wohnflaeche: "Wohnfläche",
      kaltmiete: "Kaltmiete",
      vermietung: "Vermietung",
      vermietet: "Vermietet",
      frei: "Frei",
      nurImGanzen: "Verkauft wird das Haus im Ganzen, die Einheiten nicht einzeln.",
      verfuegbareWohnungen: "Verfügbare Wohnungen",
      keineFreiLang: "Im Moment ist in diesem Haus keine Wohnung frei. Dein Ansprechpartner sagt dir gern, wann wieder etwas frei wird.",
      wohnung: "Wohnung",
      etage: "Etage",
      flaeche: "Fläche",
      kaufpreis: "Kaufpreis",
      oeffnen: (name) => `${name} öffnen`,
      fuerDichReserviert: "für dich reserviert",
      zimmerAnzahl: (z) => `${z} Zimmer`,
      kaltmieteMit: (betrag) => `Kaltmiete ${betrag}`,
      renditeMit: (wert) => `Rendite ${wert}`,
      klickHinweis: "Ein Klick öffnet die Wohnung mit Fotos, Unterlagen und Beispielrechnung.",
    },
    wohnung: {
      zurHaus: "Zur Hausübersicht",
      reiter: { uebersicht: "Übersicht", dokumente: "Dokumente", finanzen: "Finanzen", karte: "Karte" },
      objektangaben: "Objektangaben",
      objektart: "Objektart",
      keineAngabe: "Keine Angabe",
      gesamtinvestition: "Gesamtinvestition",
      kaufpreisPlusStellplatz: (kaufpreis, stellplatz) => `Kaufpreis ${kaufpreis} plus Stellplatz ${stellplatz}`,
      kaufpreis: (kaufpreis) => `Kaufpreis ${kaufpreis}`,
      monatsmiete: "Monatsmiete kalt",
      renditeUnter: (wert) => `${wert} Rendite, Jahreskaltmiete durch Kaufpreis`,
      hausgeldNichtUmlegbar: (betrag) => `Hausgeld nicht umlegbar ${betrag} je Monat`,
      wohnflaeche: "Wohnfläche",
      jeQm: (betrag) => `${betrag} je m²`,
      kaufpreisDurchFlaeche: "Kaufpreis geteilt durch Wohnfläche.",
      typUndNutzung: "Typ und Nutzung",
      eigentumswohnung: "Eigentumswohnung",
      kapitalanlage: "Kapitalanlage",
      kapitalanlageVermietet: "Kapitalanlage, vermietet",
      afa: (modell, satz) => `AfA ${modell} ${satz}`,
      objektdetails: "Objektdetails",
      infoHinweis: "Info-Symbol zeigt die Erklärung",
      fakten: "Fakten",
      mietuebersicht: "Mietübersicht",
      neubauOhne: (wert) => `${wert}, keine Sanierungen genannt.`,
      keineAngabenBautraeger: "Keine Angaben vom Bauträger.",
      massnahmenBautraeger: (vermerk) => `Maßnahmen ${vermerk}, nicht von uns geprüft.`,
      deinAnteil: "Dein Anteil",
      deinAnteilInfo: "Anteil dieser Wohnung nach Miteigentumsanteil. Ob und wie er steuerlich wirkt, prüft dein Steuerberater.",
      gemeinschaftseigentum: (text) => `Gemeinschaftseigentum: ${text}`,
      finanzenHinweis: "Beispielrechnung mit Standardannahmen, keine Finanzierungszusage.",
    },
  },
  en: {
    seite: {
      laedt: "Loading your property overview…",
      vergebenTitel: "This property has been taken in the meantime",
      vergebenText: "Your contact will be happy to show you alternatives.",
      nichtGefundenTitel: "This page is not available",
      nichtGefundenText: "The link is incomplete or no longer valid. Just get in touch and we’ll send you a new one.",
      fehlerTitel: "The page can’t be loaded right now",
      fehlerText: "Please try again in a moment.",
      erneutLaden: "Reload",
    },
    chips: { fuerDich: "Reserved for you", verfuegbar: "Available" },
    renditeErklaerung: "Twelve months’ net cold rent divided by the purchase price, excluding incidental costs, service charge and maintenance reserve.",
    galerie: { gruppe: "Which photos", wohnung: "Photos of the flat", haus: "Photos of the building" },
    lage: {
      titel: "Location and surroundings",
      leer: "There is no information on the location of this property yet. Your contact will be happy to answer any questions about the area.",
    },
    beschreibung: { titel: "Description and location", markt: "Market and location" },
    merkmale: { titel: "Features and fittings", quelle: "Source: property details provided by the seller." },
    fuss: {
      stand: (zeit) => `As of ${zeit}.`,
      haftung: "All information without guarantee; it comes from the seller and from public sources. The purchase contract, the declaration of division (Teilungserklärung) and the budget plan are authoritative. The sample calculation does not replace financing or tax advice.",
      impressum: "Legal notice",
      datenschutz: "Privacy policy",
    },
    partner: { titel: "Your contact" },
    expose: {
      herunterladen: "Download exposé",
      fehler: "The exposé couldn’t be created just now. Please try again in a moment.",
    },
    wechsel: {
      nav: "Switch flat",
      verfuegbar: (n) => `${n} flats available in this building`,
      waehlen: "Choose a flat",
      fuerDichKlammer: " (reserved for you)",
      fuerDichKurz: " · for you",
      zimmerKurz: (z) => `${z} rooms`,
    },
    dokumente: {
      haus: "Documents for the building",
      objekt: "Documents for the property",
      wohnung: "Documents for this flat",
      leerTitel: "No documents to view yet",
      leerText: "Your contact will be happy to send you the documents personally.",
    },
    wohnungName: (nummer) => `Flat ${nummer}`,
    wohnungOhneNummer: "Flat",
    erklaerung: {
      bauzustand: "Existing building, full refurbishment or new build.",
      anlageklasse: "The type of investment.",
      kaltmiete: "The net cold rent per month, excluding utilities.",
      rendite: "Twelve months’ net cold rent divided by the purchase price. Service charge and maintenance reserve are not deducted; they are shown below.",
    },
    haus: {
      vergebenSatz: "This flat has been taken in the meantime. Your contact will be happy to show you alternatives.",
      objekt: "Property",
      keineAngabe: "Not specified",
      bis: "to",
      zzglNebenkosten: (prozent, bundesland) => `plus incidental purchase costs of ${prozent}${bundesland ? ` in ${bundesland}` : ""}`,
      zzglNebenkostenJeLand: "plus incidental purchase costs depending on the federal state",
      kaufpreisGesamt: "Purchase price, whole building",
      wohnflaecheGesamt: "Total living space",
      summeEinheiten: "Sum of all units",
      jahresmiete: "Annual net cold rent",
      jeMonat: (betrag, summe) => `${betrag} per month${summe ? ", sum of all units" : ""}`,
      mietrendite: "Gross rental yield",
      jahresmieteDurchKaufpreis: "Annual net cold rent divided by purchase price",
      einheiten: "Units",
      imHaus: "in the building",
      baujahr: "Year built",
      sanierung: (spanne) => `Renovated ${spanne}`,
      wohnflaechen: "Living space",
      zimmer: "Rooms",
      kaufpreise: "Purchase prices",
      kaltmieteJeMonat: "Net cold rent per month",
      kaltmieteJeQm: (von, bis) => `€${von} to €${bis} per m²`,
      rendite: "Gross rental yield",
      preisJeQm: "Price per m²",
      kaufpreisDurchFlaeche: "Purchase price divided by living space",
      verfuegbar: "Available",
      wohnungen: (n) => (n === 1 ? "1 flat" : `${n} flats`),
      keineFrei: "No flat is available at the moment",
      anzahlVerfuegbar: (n) => (n === 1 ? "1 flat available" : `${n} flats available`),
      objektdetails: "Property details",
      energieausweis: "Energy certificate",
      klasse: (k) => `Class ${k}`,
      gueltigBis: (d) => `valid until ${d}`,
      gemeinschaftseigentum: "Common property",
      sanierungen: "Renovations",
      sanierungSumme: (betrag) => `${betrag} in total, share per flat by co-ownership share`,
      verwaltung: "Management",
      mietenspiegel: "Units and rents in the building",
      einheit: "Unit",
      lage: "Position",
      wohnflaeche: "Living space",
      kaltmiete: "Net cold rent",
      vermietung: "Letting",
      vermietet: "Let",
      frei: "Vacant",
      nurImGanzen: "The building is sold as a whole; the units are not sold individually.",
      verfuegbareWohnungen: "Available flats",
      keineFreiLang: "No flat in this building is available at the moment. Your contact will be happy to let you know when one becomes available.",
      wohnung: "Flat",
      etage: "Floor",
      flaeche: "Area",
      kaufpreis: "Purchase price",
      oeffnen: (name) => `Open ${name}`,
      fuerDichReserviert: "reserved for you",
      zimmerAnzahl: (z) => `${z} rooms`,
      kaltmieteMit: (betrag) => `Net cold rent ${betrag}`,
      renditeMit: (wert) => `Yield ${wert}`,
      klickHinweis: "Click to open the flat with photos, documents and a sample calculation.",
    },
    wohnung: {
      zurHaus: "Back to the building overview",
      reiter: { uebersicht: "Overview", dokumente: "Documents", finanzen: "Finances", karte: "Map" },
      objektangaben: "Property information",
      objektart: "Property type",
      keineAngabe: "Not specified",
      gesamtinvestition: "Total investment",
      kaufpreisPlusStellplatz: (kaufpreis, stellplatz) => `Purchase price ${kaufpreis} plus parking space ${stellplatz}`,
      kaufpreis: (kaufpreis) => `Purchase price ${kaufpreis}`,
      monatsmiete: "Monthly net cold rent",
      renditeUnter: (wert) => `${wert} yield, annual net cold rent divided by purchase price`,
      hausgeldNichtUmlegbar: (betrag) => `Non-recoverable service charge ${betrag} per month`,
      wohnflaeche: "Living space",
      jeQm: (betrag) => `${betrag} per m²`,
      kaufpreisDurchFlaeche: "Purchase price divided by living space.",
      typUndNutzung: "Type and use",
      eigentumswohnung: "Freehold flat",
      kapitalanlage: "Investment property",
      kapitalanlageVermietet: "Investment property, let",
      afa: (modell, satz) => `Depreciation (AfA) ${modell} ${satz}`,
      objektdetails: "Property details",
      infoHinweis: "The info icon shows an explanation",
      fakten: "Facts",
      mietuebersicht: "Rent overview",
      neubauOhne: (wert) => `${wert}, no renovations mentioned.`,
      keineAngabenBautraeger: "No details from the developer.",
      massnahmenBautraeger: (vermerk) => `Works ${vermerk}, not checked by us.`,
      deinAnteil: "Your share",
      deinAnteilInfo: "This flat’s share by co-ownership share. Whether and how it affects your taxes is for your tax adviser to check.",
      gemeinschaftseigentum: (text) => `Common property: ${text}`,
      finanzenHinweis: "Sample calculation with standard assumptions, not a financing commitment.",
    },
  },
};

/** Texte und Sprache für einen Baustein der Kundenansicht. Im CRM Deutsch. */
export function useKundenTexte(): { t: KundenansichtTexte; sprache: Sprache } {
  const sprache = useAnzeigeSprache();
  return { t: texteFuer(KUNDENANSICHT_TEXTE, sprache), sprache };
}

/** Die Objektarten aus `OBJEKTARTEN` (objektseiteDaten.ts), nach Kennung. */
export const OBJEKTART_EN: Record<string, string> = {
  sanierter_bestand: "Refurbished existing building",
  neubau: "New build",
  kfw40: "New build, KfW 40",
  wg_coliving: "Shared flat and co-living",
};

/**
 * Gepflegte Werte wie Anlageklasse und Bauzustand sind freie deutsche Texte
 * in der Datenbank. Die gängigen bekommen in der Anzeige eine englische
 * Fassung, alles andere bleibt, wie es gepflegt ist. Gespeichert wird nie
 * etwas anderes.
 */
export const WERTE_EN: Record<string, string> = {
  eigentumswohnung: "Freehold flat",
  globalobjekt: "Whole building",
  mehrfamilienhaus: "Apartment building",
  mikroapartment: "Micro apartment",
  mikroapartments: "Micro apartments",
  denkmal: "Listed building",
  denkmalschutz: "Listed building",
  neubau: "New build",
  bestand: "Existing building",
  "sanierter bestand": "Refurbished existing building",
  kernsanierung: "Full refurbishment",
  kernsaniert: "Fully refurbished",
  saniert: "Refurbished",
  teilsaniert: "Partly refurbished",
  pflegeimmobilie: "Care property",
  "wg und co-living": "Shared flat and co-living",
  kapitalanlage: "Investment property",
};

export function wertAnzeige(wert: string, sprache: Sprache): string {
  if (sprache !== "en") return wert;
  return WERTE_EN[wert.trim().toLowerCase()] ?? wert;
}

export function objektartAnzeige(art: { id: string; label: string }, sprache: Sprache): string {
  return sprache === "en" ? OBJEKTART_EN[art.id] ?? art.label : art.label;
}
