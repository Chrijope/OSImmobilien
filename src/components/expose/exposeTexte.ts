import type { ZweiSprachen } from "@/lib/seitenSprache";
import type { ExposeAbschnittId } from "@/lib/exposeInhalt";
import type { ErsatzArt } from "../../../supabase/functions/_shared/grundriss-erkennung.ts";
import { ERSATZ_TEXT, ERSATZ_TITEL } from "@/lib/grundrissErsatz";

/**
 * Die festen Texte der Exposé-Seite am Bildschirm (`ExposeAnsicht`,
 * `ExposeAbschnitte`, `Energieskala`, Grundriss, `ExposePublic`) in Deutsch
 * und Englisch. Plan Kundensprache, Etappe 3 (S2).
 *
 * Die Bausteine lesen die Sprache über `useAnzeigeSprache()`; ohne
 * `SeitenSpracheProvider` (im CRM) gilt Deutsch, dort ändert sich nichts.
 * Die Texte des Rechners stehen in `src/lib/exposeRechnerTexte.ts`, die des
 * Inhalts (Kennzahlen, Schritte, Hinweise) in `src/lib/exposeInhaltTexte.ts`.
 *
 * Englisch nach dem Glossar: britisch, der Berater heißt „your contact“.
 */
type KopfId = Exclude<ExposeAbschnittId, "start">;

export interface ExposeSeitenTexte {
  koepfe: Record<KopfId, [string, string]>;
  rechnerHinweisOhneSpeichern: string;
  slogan: string;
  pdfHerunterladen: string;
  pdfLaeuft: string;
  pdfFehler: string;
  navLabel: string;
  keinBild: string;
  ansichtenDerImmobilie: string;
  vorherigesBild: string;
  naechstesBild: string;
  eyebrowObjekt: string;
  eyebrowEinheit: string;
  karteOeffnen: string;
  lageUndUmgebung: string;
  einwohnerIn: (ort: string) => string;
  entwicklungFuenfJahre: string;
  marktUndStandort: string;
  namhafteArbeitgeber: string;
  beschaeftigte: (anzahl: string) => string;
  quelle: (q: string) => string;
  besonderheiten: string;
  quelleAnbieter: string;
  ausstattung: string;
  mietenspiegelTitel: string;
  spalteEinheit: string;
  spalteLage: string;
  spalteWohnflaeche: string;
  spalteZimmer: string;
  spalteKaltmiete: string;
  spalteVermietung: string;
  spalteKaufpreis: string;
  spalteStatus: string;
  spalteExpose: string;
  einheit: string;
  vermietet: string;
  frei: string;
  hausImGanzen: string;
  einheitenUeberblick: string;
  statusVerfuegbar: string;
  statusReserviert: string;
  statusVerkauft: string;
  ansehen: string;
  exposeEinheit: (nummer: string) => string;
  unterlagen: string;
  grundrissHinweis: string;
  passendeEinheitTitel: string;
  berechnungNichtVerfuegbar: string;
  passendeEinheitText: string;
  ohneKaufpreisText: string;
  zuDenObjektdaten: string;
  kaufpreisLabelObjekt: string;
  kaufpreisLabelEinheit: string;
  verwaltungOffen: string;
  einblicke: string;
  objektbild: (nr: number) => string;
  bildVergroessern: (bild: string) => string;
  erledigt: string;
  zeitplanHinweis: string;
  alleAufklappen: string;
  alleEinklappen: string;
  chance: string;
  risiko: string;
  entwurf: string;
  stand: (datum: string) => string;
  impressum: string;
  datenschutz: string;
  bildSchliessen: string;
  // Objektdaten
  energieeffizienz: string;
  baujahrMit: (jahr: number) => string;
  ausweisGueltig: (bis: string) => string;
  energieFehlt: string;
  pflichtangabenFehlen: (liste: string) => string;
  // Kontakt
  bereit: string;
  bereitText: string;
  imVertrieb: string;
  kontaktFirma: string;
  kontaktFirmaText: string;
  email: string;
  anrufen: string;
  termin: string;
  // Energieskala
  energieklassen: string;
  ohneKennwert: string;
  ueber300: string;
  // Grundriss
  karussell: string;
  grundrisse: string;
  folie: string;
  vorherigerGrundriss: string;
  naechsterGrundriss: string;
  vonGesamt: (nr: number, anzahl: number) => string;
  grundrisseBlaettern: string;
  seite: (nr: number) => string;
  seiteVon: (titel: string, nr: number) => string;
  imVollbild: (bild: string) => string;
  vollbild: string;
  originalOeffnen: string;
  seitenRegion: (titel: string, anzahl: number) => string;
  weitereSeiten: (anzahl: number) => string;
  vorschauFehler: string;
  grundrissLaedt: string;
  nichtAnzeigbar: string;
  ersatzTitel: Record<ErsatzArt, string>;
  ersatzText: Record<ErsatzArt, string>;
  // Seite
  laedt: string;
  nichtVerfuegbarTitel: string;
  nichtVerfuegbarText: string;
  ladeFehler: string;
  erneutLaden: string;
  einheitNichtGefunden: string;
  einheitGehoertNicht: string;
}

export const EXPOSE_SEITEN_TEXTE: ZweiSprachen<ExposeSeitenTexte> = {
  de: {
    koepfe: {
      standort: ["Investitionsstandort", "Standort"],
      mikrolage: ["Mitten im Leben", "Mikrolage"],
      objektdaten: ["Deine Immobilie im Detail", "Objektdaten"],
      grundriss: ["Raum für deine Investition", "Der Grundriss"],
      wirtschaftlichkeit: ["Deine Zahlen auf einen Blick", "Wirtschaftlichkeit"],
      verwaltung: ["Gut betreut", "Verwaltung vor Ort"],
      zeitplan: ["Der Weg zum Eigentum", "Nächste Schritte und Zeitplan"],
      "chancen-risiken": ["Informiert entscheiden", "Chancen und Risiken"],
      rechtliches: ["Transparent dokumentiert", "Wichtige Hinweise"],
      kontakt: ["OS Immobilien · Persönlich an deiner Seite", "Dein Ansprechpartner"],
    },
    rechnerHinweisOhneSpeichern: "Die Regler sind zum Ausprobieren. Deine Einstellungen werden hier nicht gespeichert.",
    slogan: "IMMOBILIEN MIT PERSPEKTIVE",
    pdfHerunterladen: "Exposé herunterladen",
    pdfLaeuft: "Exposé wird erstellt",
    pdfFehler: "Das Exposé konnte nicht als PDF erstellt werden. Bitte versuche es gleich noch einmal.",
    navLabel: "Exposé-Abschnitte",
    keinBild: "Für diese Immobilie ist noch kein Bild hinterlegt.",
    ansichtenDerImmobilie: "Ansichten der Immobilie",
    vorherigesBild: "Vorheriges Bild",
    naechstesBild: "Nächstes Bild",
    eyebrowObjekt: "Deine Immobilie im Überblick",
    eyebrowEinheit: "Deine Immobilie als Kapitalanlage",
    karteOeffnen: "Karte öffnen",
    lageUndUmgebung: "Lage und Umgebung",
    einwohnerIn: (ort) => `Einwohner in ${ort}`,
    entwicklungFuenfJahre: "Entwicklung in fünf Jahren",
    marktUndStandort: "Markt und Standort",
    namhafteArbeitgeber: "Namhafte Arbeitgeber",
    beschaeftigte: (anzahl) => `${anzahl} Beschäftigte`,
    quelle: (q) => `Quelle: ${q}`,
    besonderheiten: "Besonderheiten dieser Immobilie",
    quelleAnbieter: "Quelle: Objektangaben des Anbieters.",
    ausstattung: "Ausstattung und Merkmale",
    mietenspiegelTitel: "Einheiten und Mieten im Haus",
    spalteEinheit: "Einheit",
    spalteLage: "Lage",
    spalteWohnflaeche: "Wohnfläche",
    spalteZimmer: "Zimmer",
    spalteKaltmiete: "Kaltmiete",
    spalteVermietung: "Vermietung",
    spalteKaufpreis: "Kaufpreis",
    spalteStatus: "Status",
    spalteExpose: "Exposé",
    einheit: "Einheit",
    vermietet: "Vermietet",
    frei: "Frei",
    hausImGanzen: "Verkauft wird das Haus im Ganzen, die Einheiten nicht einzeln.",
    einheitenUeberblick: "Einheiten im Überblick",
    statusVerfuegbar: "Verfügbar",
    statusReserviert: "Reserviert",
    statusVerkauft: "Verkauft",
    ansehen: "Ansehen",
    exposeEinheit: (nummer) => `Exposé Einheit ${nummer}`,
    unterlagen: "Unterlagen zur Immobilie",
    grundrissHinweis: "Maße im Grundriss können vom Aufmaß abweichen. Möbel dienen nur der Veranschaulichung.",
    passendeEinheitTitel: "Die passende Einheit macht den Unterschied.",
    berechnungNichtVerfuegbar: "Berechnung noch nicht verfügbar",
    passendeEinheitText: "Öffne das Exposé einer Einheit, um deren Kaufpreis, Miete und Finanzierung im Detail zu betrachten.",
    ohneKaufpreisText: "Für die Berechnung fehlt ein hinterlegter Kaufpreis. Dein Ansprechpartner rechnet sie gern mit dir persönlich durch.",
    zuDenObjektdaten: "Zu den Objektdaten",
    kaufpreisLabelObjekt: "Kaufpreis Gesamtobjekt",
    kaufpreisLabelEinheit: "Kaufpreis Wohnung",
    verwaltungOffen: "Der genaue Leistungsumfang der Verwaltung steht im Verwaltervertrag. Dein Ansprechpartner geht ihn im Beratungsgespräch mit dir durch.",
    einblicke: "Einblicke in die Immobilie",
    objektbild: (nr) => `Objektbild ${nr}`,
    bildVergroessern: (bild) => `Bild vergrößern: ${bild}`,
    erledigt: "Erledigt",
    zeitplanHinweis: "Zeiträume sind Orientierungswerte. Maßgeblich sind die individuell vereinbarten Termine.",
    alleAufklappen: "Alle aufklappen",
    alleEinklappen: "Alle einklappen",
    chance: "Chance:",
    risiko: "Risiko:",
    entwurf: "Entwurf der rechtlichen Hinweise · noch nicht freigegeben.",
    stand: (datum) => `Stand ${datum}`,
    impressum: "Impressum",
    datenschutz: "Datenschutz",
    bildSchliessen: "Bild schließen",
    energieeffizienz: "Energieeffizienz des Gebäudes",
    baujahrMit: (jahr) => `Baujahr ${jahr}`,
    ausweisGueltig: (bis) => `Ausweis gültig bis ${bis}`,
    energieFehlt: "Angaben zum Energieausweis fehlen.",
    pflichtangabenFehlen: (liste) => `Pflichtangaben nach GEG § 87 fehlen am Objekt: ${liste}. Die Angaben werden ergänzt, sobald sie vorliegen.`,
    bereit: "Bereit für den nächsten Schritt?",
    bereitText: "Dein Ansprechpartner geht das Exposé mit dir durch und beantwortet alle Fragen, ohne Verpflichtung.",
    imVertrieb: "Dein Ansprechpartner im Vertrieb",
    kontaktFirma: "Dein Kontakt zu OS Immobilien",
    kontaktFirmaText: "Schreib uns oder ruf an, wir melden uns mit deinem persönlichen Ansprechpartner.",
    email: "E-Mail",
    anrufen: "Anrufen",
    termin: "Termin vereinbaren",
    energieklassen: "Energieeffizienzklassen",
    ohneKennwert: "Ohne Endenergiekennwert zeigt die Skala keine Marke.",
    ueber300: "über 300 kWh/(m²·a)",
    karussell: "Karussell",
    grundrisse: "Grundrisse",
    folie: "Folie",
    vorherigerGrundriss: "Vorheriger Grundriss",
    naechsterGrundriss: "Nächster Grundriss",
    vonGesamt: (nr, anzahl) => `${nr} von ${anzahl}`,
    grundrisseBlaettern: "Grundrisse, mit den Pfeiltasten blättern",
    seite: (nr) => `Seite ${nr}`,
    seiteVon: (titel, nr) => `${titel}, Seite ${nr}`,
    imVollbild: (bild) => `${bild} im Vollbild zeigen`,
    vollbild: "Vollbild",
    originalOeffnen: "Original öffnen",
    seitenRegion: (titel, anzahl) => `${titel}: Seite 1 von ${anzahl}, weitere Seiten durch Scrollen`,
    weitereSeiten: (anzahl) => `Weitere ${anzahl} Seiten im Original.`,
    vorschauFehler: "Die Vorschau konnte nicht geladen werden. Der Grundriss lässt sich über „Original öffnen“ ansehen.",
    grundrissLaedt: "Der Grundriss wird für Ansicht und Druck geladen…",
    nichtAnzeigbar: "Diesen Grundriss kann der Browser nicht selbst anzeigen. Er lässt sich über „Original öffnen“ ansehen.",
    // Dieselben Sätze wie im PDF, aus einer Quelle.
    ersatzTitel: ERSATZ_TITEL,
    ersatzText: ERSATZ_TEXT,
    laedt: "Exposé wird geladen…",
    nichtVerfuegbarTitel: "Exposé nicht verfügbar",
    nichtVerfuegbarText: "Exposé nicht verfügbar. Das Objekt ist nicht freigegeben oder konnte nicht geladen werden.",
    ladeFehler: "Exposé konnte nicht geladen werden.",
    erneutLaden: "Erneut laden",
    einheitNichtGefunden: "Einheit nicht gefunden",
    einheitGehoertNicht: "Diese Einheit gehört nicht zum aufgerufenen Objekt.",
  },
  en: {
    koepfe: {
      standort: ["Investment location", "Location"],
      mikrolage: ["In the midst of life", "Neighbourhood"],
      objektdaten: ["Your property in detail", "Property details"],
      grundriss: ["Space for your investment", "The floor plan"],
      wirtschaftlichkeit: ["Your figures at a glance", "Financials"],
      verwaltung: ["Well looked after", "Local management"],
      zeitplan: ["The path to ownership", "Next steps and timeline"],
      "chancen-risiken": ["Informed decisions", "Opportunities and risks"],
      rechtliches: ["Transparently documented", "Important notes"],
      kontakt: ["OS Immobilien · Personally at your side", "Your contact"],
    },
    rechnerHinweisOhneSpeichern: "The sliders are for trying things out. Your settings are not saved here.",
    slogan: "PROPERTY WITH PERSPECTIVE",
    pdfHerunterladen: "Download exposé",
    pdfLaeuft: "Creating exposé",
    pdfFehler: "The exposé could not be created as a PDF. Please try again in a moment.",
    navLabel: "Exposé sections",
    keinBild: "No image has been added for this property yet.",
    ansichtenDerImmobilie: "Views of the property",
    vorherigesBild: "Previous image",
    naechstesBild: "Next image",
    eyebrowObjekt: "Your property at a glance",
    eyebrowEinheit: "Your property as an investment",
    karteOeffnen: "Open map",
    lageUndUmgebung: "Location and surroundings",
    einwohnerIn: (ort) => `Residents in ${ort}`,
    entwicklungFuenfJahre: "Change over five years",
    marktUndStandort: "Market and location",
    namhafteArbeitgeber: "Major employers",
    beschaeftigte: (anzahl) => `${anzahl} employees`,
    quelle: (q) => `Source: ${q}`,
    besonderheiten: "Special features of this property",
    quelleAnbieter: "Source: property information from the provider.",
    ausstattung: "Features and fittings",
    mietenspiegelTitel: "Units and rents in the building",
    spalteEinheit: "Unit",
    spalteLage: "Position",
    spalteWohnflaeche: "Living space",
    spalteZimmer: "Rooms",
    spalteKaltmiete: "Net cold rent",
    spalteVermietung: "Letting",
    spalteKaufpreis: "Purchase price",
    spalteStatus: "Status",
    spalteExpose: "Exposé",
    einheit: "Unit",
    vermietet: "Let",
    frei: "Vacant",
    hausImGanzen: "The building is sold as a whole; the units are not sold individually.",
    einheitenUeberblick: "Units at a glance",
    statusVerfuegbar: "Available",
    statusReserviert: "Reserved",
    statusVerkauft: "Sold",
    ansehen: "View",
    exposeEinheit: (nummer) => `Exposé for unit ${nummer}`,
    unterlagen: "Property documents",
    grundrissHinweis: "Dimensions in the floor plan may differ from the actual measurements. Furniture is shown for illustration only.",
    passendeEinheitTitel: "The right unit makes the difference.",
    berechnungNichtVerfuegbar: "Calculation not yet available",
    passendeEinheitText: "Open the exposé of a unit to look at its purchase price, rent and financing in detail.",
    ohneKaufpreisText: "A purchase price is needed for the calculation. Your contact will be happy to go through it with you personally.",
    zuDenObjektdaten: "Go to property details",
    kaufpreisLabelObjekt: "Purchase price, whole property",
    kaufpreisLabelEinheit: "Purchase price, apartment",
    verwaltungOffen: "The exact scope of the management’s services is set out in the management agreement. Your contact will go through it with you in the consultation.",
    einblicke: "Inside the property",
    objektbild: (nr) => `Property image ${nr}`,
    bildVergroessern: (bild) => `Enlarge image: ${bild}`,
    erledigt: "Done",
    zeitplanHinweis: "Time frames are for guidance only. The individually agreed dates are what count.",
    alleAufklappen: "Expand all",
    alleEinklappen: "Collapse all",
    chance: "Opportunity:",
    risiko: "Risk:",
    entwurf: "Draft of the legal notes · not yet approved.",
    stand: (datum) => `As of ${datum}`,
    impressum: "Legal notice",
    datenschutz: "Privacy policy",
    bildSchliessen: "Close image",
    energieeffizienz: "Energy efficiency of the building",
    baujahrMit: (jahr) => `Built ${jahr}`,
    ausweisGueltig: (bis) => `Certificate valid until ${bis}`,
    energieFehlt: "Energy certificate details are missing.",
    pflichtangabenFehlen: (liste) => `Mandatory information under the German Buildings Energy Act (GEG § 87) is missing for this property: ${liste}. It will be added as soon as it is available.`,
    bereit: "Ready for the next step?",
    bereitText: "Your contact will go through the exposé with you and answer all your questions, with no obligation.",
    imVertrieb: "Your contact person at OS Immobilien",
    kontaktFirma: "Your contact at OS Immobilien",
    kontaktFirmaText: "Write to us or give us a call, and we will get back to you with your personal contact.",
    email: "Email",
    anrufen: "Call",
    termin: "Book an appointment",
    energieklassen: "Energy efficiency classes",
    ohneKennwert: "Without a final energy figure, the scale shows no marker.",
    ueber300: "over 300 kWh/(m²·a)",
    karussell: "carousel",
    grundrisse: "Floor plans",
    folie: "slide",
    vorherigerGrundriss: "Previous floor plan",
    naechsterGrundriss: "Next floor plan",
    vonGesamt: (nr, anzahl) => `${nr} of ${anzahl}`,
    grundrisseBlaettern: "Floor plans, use the arrow keys to browse",
    seite: (nr) => `Page ${nr}`,
    seiteVon: (titel, nr) => `${titel}, page ${nr}`,
    imVollbild: (bild) => `Show ${bild} full screen`,
    vollbild: "Full screen",
    originalOeffnen: "Open original",
    seitenRegion: (titel, anzahl) => `${titel}: page 1 of ${anzahl}, scroll for more pages`,
    weitereSeiten: (anzahl) => `${anzahl} more pages in the original.`,
    vorschauFehler: "The preview could not be loaded. You can view the floor plan via “Open original”.",
    grundrissLaedt: "Loading the floor plan for viewing and printing…",
    nichtAnzeigbar: "Your browser cannot display this floor plan itself. You can view it via “Open original”.",
    ersatzTitel: { geschossplan: "Storey plan", hausplan: "Building plan" },
    ersatzText: {
      geschossplan: "There is no separate floor plan for this apartment. Shown is the plan of its storey with all units on it.",
      hausplan: "There is no separate floor plan for this apartment. Shown is a plan of the building.",
    },
    laedt: "Loading exposé…",
    nichtVerfuegbarTitel: "Exposé not available",
    nichtVerfuegbarText: "Exposé not available. The property has not been released or could not be loaded.",
    ladeFehler: "The exposé could not be loaded.",
    erneutLaden: "Reload",
    einheitNichtGefunden: "Unit not found",
    einheitGehoertNicht: "This unit does not belong to the property you opened.",
  },
};

export function exposeSeitenTexte(sprache: "de" | "en" | undefined | null): ExposeSeitenTexte {
  return EXPOSE_SEITEN_TEXTE[sprache === "en" ? "en" : "de"];
}
