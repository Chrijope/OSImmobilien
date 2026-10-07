/**
 * Die festen Texte des Exposé-PDFs (seit 01.10.2026 `exposeDruck/daten.ts`) in
 * Deutsch und Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 5 (D10). Der Inhalt selbst
 * (Kennzahlen, Schritte, Hinweise) kommt schon in der Sprache des Kunden aus
 * `baueExposeInhalt`; hier steht nur, was das PDF selbst schreibt: Kopf,
 * Kacheltitel, Tabellenköpfe, Rechenhinweise, Fußzeile. Die deutschen Texte
 * sind wörtlich die bisherigen, ein Test prüft, dass beide Fassungen
 * dieselben Schlüssel haben (`exposeSprache.test.ts`).
 *
 * Begriffe nach `src/lib/kundenspracheGlossar.ts`. Keine Gedankenstriche.
 */
import type { FormatSprache } from "./sprachFormat";
import type { ErsatzArt } from "../../supabase/functions/_shared/grundriss-erkennung.ts";
import { ERSATZ_TEXT, ERSATZ_TITEL } from "./grundrissErsatz";
import { MAKROLAGE_LEER, MAKROLAGE_NICHT_GEMESSEN } from "./makrolage";
import { SANIERUNGEN_UEBERSCHRIFT } from "./objektdetailsAnzeige";

export interface ExposePdfTexte {
  kennung: string;
  dokumentTitel: (titel: string) => string;
  deckblattFuss: (preisstand: string, firma: string) => string;
  deineKapitalanlage: string;
  einwohnerIn: (zahl: string, ort: string) => string;
  wachstum: (prozent: string) => string;
  keineStandortkennzahlen: (ort: string) => string;
  warum: (ort: string) => string;
  argumenteImGespraech: string;
  marktUndStandort: string;
  arbeitgeber: string;
  beschaeftigte: (zahl: string) => string;
  quelle: (q: string) => string;
  umgebungVon: (adresse: string) => string;
  messpunkt: string;
  objekt: string;
  makrolage: string;
  umgebung: string;
  karteOnline: string;
  umgebungImGespraechTitel: string;
  umgebungImGespraech: string;
  makroLeer: string;
  makroNichtGemessen: string;
  sanierungenTitel: string;
  keineAngabenBautraeger: string;
  jahr: string;
  massnahme: string;
  kosten: string;
  energieTitel: string;
  baujahr: (jahr: number) => string;
  gueltigBis: (datum: string) => string;
  energieFehlt: string;
  ohneKennwert: string;
  ueberSkala: (max: number) => string;
  pflichtFehlenTitel: string;
  pflichtFehlen: (liste: string) => string;
  masseHinweis: string;
  ersatzTitel: Record<ErsatzArt, string>;
  ersatzText: Record<ErsatzArt, string>;
  alsDatei: string;
  weiterePlaene: (anzahl: number) => string;
  grundrissDateiTitel: string;
  grundrissDatei: (namen: string) => string;
  wirtschaftlichkeitVorspann: string;
  kaufFinanzierung: string;
  kaufpreisWohnung: string;
  preisanpassung: (wert: string) => string;
  stellplatz: string;
  gesamtinvestition: string;
  nebenkosten: (satz: string, land: string) => string;
  darlehen: (quote: string) => string;
  eigenkapitaleinsatz: string;
  nebenkostenNotiz: (a: {
    grest: string;
    notar: string;
    makler: string | null;
    quelle: "manuell" | "mittelwert" | "land";
    rate: string;
    zins: string;
    tilgung: string;
  }) => string;
  annahmen: string;
  annahme: string;
  wert: string;
  herkunft: string;
  herkunftWerte: { selbstauskunft: string; objekt: string; standard: string; angepasst: string; tarif: string };
  zeilen: {
    eigenkapital: string;
    zins: string;
    tilgung: string;
    zve: string;
    verheiratet: string;
    freibetrag: string;
    freibetragNein: string;
    grenzsteuersatz: string;
    grenzFest: string;
    grenzTarif: (jahr: number) => string;
    mietsteigerung: string;
    kostensteigerung: string;
    wertentwicklung: string;
    leerstand: string;
    makler: string;
    preisanpassung: string;
    afa: string;
    afaWert: (satz: string, anteil: string, angenommen: boolean) => string;
    sonderAfa: string;
    sonderAfaJa: (satz: string, jahre: number) => string;
    sonderAfaNicht: string;
    mietverwaltung: string;
    sanierung: string;
    sanierungErhaltung: (jahre: number) => string;
    sanierungWerkvertrag: string;
    sanierungNicht: string;
    startHaltedauerTitel: string;
    startHaltedauer: (start: number, jahre: number) => string;
    ja: string;
    nein: string;
  };
  eigenkapitalSa: (betrag: string) => string;
  monatTitel: (jahr: number) => string;
  einnahmen: string;
  kaltmiete: string;
  steuervorteil: string;
  steuervorteilMonatlich: string;
  steuervorteilErstattung: string;
  summeEinnahmen: string;
  ausgaben: string;
  zinsTilgung: string;
  hausgeldNu: string;
  ruecklage: string;
  mietverwaltung: string;
  mietausfall: string;
  summeAusgaben: string;
  eigenanteil: string;
  ueberschuss: string;
  vermoegensaufbau: string;
  nach: string;
  immobilienwert: string;
  restschuld: string;
  verkaufsertrag: string;
  eigenanteile: string;
  vermoegen: string;
  jahreKalender: (jahre: number, kalender: number) => string;
  jahre: (jahre: number) => string;
  achseMio: (wert: string) => string;
  achseTsd: (wert: number) => string;
  aufgebautesVermoegen: string;
  ekRenditeTitel: string;
  nachJahren: (jahre: number) => string;
  nichtBestimmbar: string;
  ausEinemEuro: (faktor: string) => string;
  ohneEigenkapital: string;
  vermoegenFuss: (wertsteigerung: string, eigenkapital: string) => string;
  keinVermoegensaufbau: string;
  sanierungTitel: string;
  sanierungText: (wirksam: string) => string;
  wirksamAb: (jahr: number) => string;
  wirksamErstesJahr: string;
  anteilMassnahme: string;
  einmaligeErsparnis: string;
  wirkung: string;
  ueberAfa: string;
  steuerlich: string;
  nichtAngesetzt: string;
  jeEuroTitel: string;
  jeEuroText: (jahre: number) => string;
  eingesetztesEk: string;
  ausEinemEuroLabel: string;
  verwaltungTitel: (name: string) => string;
  verwaltungStandard: string;
  verwaltungOhneLeistungen: string;
  verwaltungNotiz: string;
  erledigt: string;
  zeitplanNotiz: string;
  chancenVorspann: string;
  chance: string;
  risiko: string;
  entwurf: string;
  entwurfText: string;
  energiePflichtTitel: string;
  kontakt: string;
  naechsterSchritt: string;
  kontaktText: string;
  kontaktRolleFallback: string;
  ansprechpartnerVertrieb: string;
  kontaktMoreImmo: string;
  erstelltAm: (datum: string, fuer: string, von: string) => string;
  fussPreisstand: (firma: string, datum: string) => string;
  fussModell: (seite: number) => string;
}

export const EXPOSE_PDF_TEXTE_DE: ExposePdfTexte = {
  kennung: "Exposé",
  dokumentTitel: (titel) => `Exposé ${titel}`,
  deckblattFuss: (preisstand, firma) => `Preisstand ${preisstand}. Alle Zahlen sind Modellrechnungen, keine Zusage. ${firma}`,
  deineKapitalanlage: "Deine Kapitalanlage",
  einwohnerIn: (zahl, ort) => `${zahl} Einwohner in ${ort}`,
  wachstum: (prozent) => `${prozent} Einwohner in fünf Jahren`,
  keineStandortkennzahlen: (ort) => `Zu ${ort} liegen noch keine Standortkennzahlen vor.`,
  warum: (ort) => `Warum ${ort}`,
  argumenteImGespraech: "Die Argumente für diesen Standort erläutert dir dein Ansprechpartner im Gespräch.",
  marktUndStandort: "Markt und Standort",
  arbeitgeber: "Namhafte Arbeitgeber",
  beschaeftigte: (zahl) => `rund ${zahl} Beschäftigte`,
  quelle: (q) => `Quelle: ${q}.`,
  umgebungVon: (adresse) => `Umgebung von ${adresse}.`,
  messpunkt: "Messpunkt",
  objekt: "Objekt",
  makrolage: "Makrolage",
  umgebung: "Umgebung",
  karteOnline: " Die Karte dazu zeigt das Online-Exposé.",
  umgebungImGespraechTitel: "Umgebung im Gespräch",
  umgebungImGespraech:
    "Zu dieser Adresse liegt noch keine Messung der Umgebung vor. Einkaufen, Freizeit und Infrastruktur rund um die Immobilie bespricht dein Ansprechpartner mit dir.",
  makroLeer: MAKROLAGE_LEER,
  makroNichtGemessen: MAKROLAGE_NICHT_GEMESSEN,
  sanierungenTitel: SANIERUNGEN_UEBERSCHRIFT,
  keineAngabenBautraeger: "Keine Angaben vom Bauträger",
  jahr: "Jahr",
  massnahme: "Maßnahme",
  kosten: "Kosten",
  energieTitel: "Energieeffizienz des Gebäudes",
  baujahr: (jahr) => `Baujahr ${jahr}`,
  gueltigBis: (datum) => `Ausweis gültig bis ${datum}`,
  energieFehlt: "Angaben zum Energieausweis fehlen.",
  ohneKennwert: "Ohne Endenergiekennwert zeigt die Skala keine Marke.",
  ueberSkala: (max) => `über ${max} kWh/(m²·a)`,
  pflichtFehlenTitel: "Pflichtangaben fehlen",
  pflichtFehlen: (liste) => `Pflichtangaben nach GEG § 87 fehlen am Objekt: ${liste}. Die Angaben werden ergänzt, sobald sie vorliegen.`,
  masseHinweis: "Maße im Grundriss können vom Aufmaß abweichen. Möbel dienen nur der Veranschaulichung.",
  ersatzTitel: ERSATZ_TITEL,
  ersatzText: ERSATZ_TEXT,
  alsDatei: "Als Datei im Online-Exposé",
  weiterePlaene: (anzahl) => `Weitere ${anzahl} Pläne im Online-Exposé.`,
  grundrissDateiTitel: "Grundriss als Datei",
  grundrissDatei: (namen) => `Der Grundriss liegt als Datei vor: ${namen}. Im Online-Exposé lässt er sich öffnen.`,
  wirtschaftlichkeitVorspann:
    "Alle Zahlen sind eine Modellrechnung mit den Annahmen auf dieser Seite. Werte aus deiner Selbstauskunft sind in der Spalte Herkunft gekennzeichnet. Im Online-Exposé kannst du jeden Wert verändern, die Seite rechnet sofort neu.",
  kaufFinanzierung: "Kaufpreis und Finanzierung",
  kaufpreisWohnung: "Kaufpreis Wohnung",
  preisanpassung: (wert) => `Preisanpassung ${wert}`,
  stellplatz: "Stellplatz",
  gesamtinvestition: "Gesamtinvestition",
  nebenkosten: (satz, land) => `Kaufnebenkosten ${satz}${land ? ` (${land})` : ""}`,
  darlehen: (quote) => `Darlehen (${quote} Finanzierung)`,
  eigenkapitaleinsatz: "Eigenkapitaleinsatz",
  nebenkostenNotiz: (a) =>
    `Grunderwerbsteuer ${a.grest}, Notar und Grundbuch ${a.notar}${a.makler ? `, Makler ${a.makler}` : ", keine Maklerprovision"}. ${
      a.quelle === "manuell" ? "Satz laut Objektangaben." : a.quelle === "mittelwert" ? "Bundesland unbekannt, Mittelwert aller Länder." : "Satz nach Bundesland."
    } Der Eigenkapitaleinsatz ist Nebenkosten plus Eigenkapital an der Investition; die Nebenkosten trägst du immer selbst. Monatsrate ${a.rate} bei ${a.zins} Zins und ${a.tilgung} Tilgung.`,
  annahmen: "Annahmen",
  annahme: "Annahme",
  wert: "Wert",
  herkunft: "Herkunft",
  herkunftWerte: { selbstauskunft: "Selbstauskunft", objekt: "Objekt", standard: "Standard", angepasst: "Angepasst", tarif: "Tarif" },
  zeilen: {
    eigenkapital: "Eigenkapital",
    zins: "Zinssatz",
    tilgung: "Anfangstilgung",
    zve: "Zu versteuerndes Einkommen",
    verheiratet: "Verheiratet, Splittingtarif",
    freibetrag: "Steuervorteil monatlich über Freibetrag (§ 39a EStG)",
    freibetragNein: "Nein, Erstattung im Folgejahr",
    grenzsteuersatz: "Grenzsteuersatz",
    grenzFest: "fest vorgegeben",
    grenzTarif: (jahr) => `nach Tarif ${jahr}`,
    mietsteigerung: "Mietsteigerung je Jahr",
    kostensteigerung: "Kostensteigerung je Jahr",
    wertentwicklung: "Wertentwicklung je Jahr",
    leerstand: "Leerstand",
    makler: "Maklerprovision",
    preisanpassung: "Preisanpassung",
    afa: "AfA je Jahr",
    afaWert: (satz, anteil, angenommen) => `${satz} auf ${anteil} Gebäudeanteil${angenommen ? " (angenommen)" : ""}`,
    sonderAfa: "Sonder-AfA (§ 7b EStG)",
    sonderAfaJa: (satz, jahre) => `Ja, ${satz} über ${jahre} Jahre`,
    sonderAfaNicht: "Ja, aber nicht ansetzbar",
    mietverwaltung: "Mietverwaltung in den Ausgaben",
    sanierung: "Sanierung steuerlich",
    sanierungErhaltung: (jahre) => `Erhaltungsaufwand, sofort abziehbar, verteilt auf ${jahre} ${jahre === 1 ? "Jahr" : "Jahre"}`,
    sanierungWerkvertrag: "Werkvertrag, erhöht die AfA-Grundlage",
    sanierungNicht: "Nicht ansetzen",
    startHaltedauerTitel: "Startjahr und Haltedauer",
    startHaltedauer: (start, jahre) => `${start}, ${jahre} Jahre`,
    ja: "Ja",
    nein: "Nein",
  },
  eigenkapitalSa: (betrag) => `Laut Selbstauskunft stehen ${betrag} an liquidem Eigenkapital bereit.`,
  monatTitel: (jahr) => `Monatliche Betrachtung, Werte im Jahr ${jahr}`,
  einnahmen: "Einnahmen",
  kaltmiete: "Kaltmiete",
  steuervorteil: "Steuervorteil",
  steuervorteilMonatlich: "monatlich über den Freibetrag",
  steuervorteilErstattung: "Erstattung des Vorjahres, auf den Monat umgelegt",
  summeEinnahmen: "Summe Einnahmen",
  ausgaben: "Ausgaben",
  zinsTilgung: "Zins und Tilgung",
  hausgeldNu: "Hausgeld, nicht umlagefähig",
  ruecklage: "Erhaltungsrücklage",
  mietverwaltung: "Mietverwaltung",
  mietausfall: "Mietausfall (Leerstand)",
  summeAusgaben: "Summe Ausgaben",
  eigenanteil: "Dein monatlicher Eigenanteil",
  ueberschuss: "Dein monatlicher Überschuss",
  vermoegensaufbau: "Vermögensaufbau",
  nach: "Nach",
  immobilienwert: "Immobilienwert",
  restschuld: "Restschuld",
  verkaufsertrag: "Verkaufsertrag",
  eigenanteile: "Eigenanteile",
  vermoegen: "Vermögen",
  jahreKalender: (jahre, kalender) => `${jahre} Jahre (${kalender})`,
  jahre: (jahre) => `${jahre} Jahre`,
  achseMio: (wert) => `${wert} Mio. €`,
  achseTsd: (wert) => `${wert} Tsd. €`,
  aufgebautesVermoegen: "Aufgebautes Vermögen",
  ekRenditeTitel: "Eigenkapitalrendite je Jahr",
  nachJahren: (jahre) => `nach ${jahre} Jahren`,
  nichtBestimmbar: "nicht bestimmbar",
  ausEinemEuro: (faktor) => `aus 1 € werden ${faktor} €`,
  ohneEigenkapital: "ohne Eigenkapital",
  vermoegenFuss: (wertsteigerung, eigenkapital) =>
    `Verkaufsertrag ist Immobilienwert minus Restschuld. Eigenanteile ist die Summe aller laufenden Eigenanteile und Überschüsse bis dahin, negativ heißt zugezahlt. Aufgebautes Vermögen ist beides zusammen, ohne die einmalige Steuerersparnis aus einer Sanierung. Immobilienwert bei ${wertsteigerung} Wertentwicklung je Jahr, eingesetztes Eigenkapital ${eigenkapital}. Modellrechnung, keine Zusage: Zinsen nach der Zinsbindung und Steuern können abweichen.`,
  keinVermoegensaufbau: "Die Haltedauer ist kürzer als zehn Jahre, deshalb gibt es keinen Vermögensaufbau nach 10, 20, 30 und 40 Jahren.",
  sanierungTitel: "Sanierung am Gemeinschaftseigentum",
  sanierungText: (wirksam) =>
    `Dein Anteil nach Miteigentumsanteil, ${wirksam}. Die einmalige Ersparnis steht gesondert und fließt nicht in Monatsrechnung, Vermögensaufbau und Eigenkapitalrendite ein.`,
  wirksamAb: (jahr) => `wirksam ab ${jahr}`,
  wirksamErstesJahr: "wirksam im ersten Jahr",
  anteilMassnahme: "Dein Anteil an der Maßnahme",
  einmaligeErsparnis: "Einmalige Steuerersparnis",
  wirkung: "Wirkung",
  ueberAfa: "über die AfA",
  steuerlich: "Steuerlich",
  nichtAngesetzt: "nicht angesetzt",
  jeEuroTitel: "Für jeden eingesetzten Euro",
  jeEuroText: (jahre) => `Aufgebautes Vermögen nach ${jahre} Jahren geteilt durch dein eingesetztes Eigenkapital.`,
  eingesetztesEk: "Eingesetztes Eigenkapital",
  ausEinemEuroLabel: "Aus 1 € werden",
  verwaltungTitel: (name) => `Leistungen der Verwaltung, ${name}`,
  verwaltungStandard: "Leistungen der Mietverwaltung",
  verwaltungOhneLeistungen:
    "Der genaue Leistungsumfang der Verwaltung steht im Verwaltervertrag. Dein Ansprechpartner geht ihn im Beratungsgespräch mit dir durch.",
  verwaltungNotiz:
    "Die Mietverwaltung kümmert sich um deine Wohnung und den Mieter. Die Verwaltung der Eigentümergemeinschaft für das ganze Haus steckt im Hausgeld.",
  erledigt: "Erledigt",
  zeitplanNotiz: "Zeiträume sind Erfahrungswerte aus unserer Abwicklung, keine Zusage. Bank, Notar und Verkäufer bestimmen das Tempo mit.",
  chancenVorspann:
    "Jede Kapitalanlage hat Chancen und Risiken, auch diese Wohnung. Damit du entscheiden kannst, stehen hier beide Seiten nebeneinander, Thema für Thema.",
  chance: "CHANCE",
  risiko: "RISIKO",
  entwurf: "Entwurf",
  entwurfText: "Diese Hinweise sind noch nicht vom Anwalt freigegeben. Vor dem ersten Kundenlink werden sie geprüft und ersetzt.",
  energiePflichtTitel: "Pflichtangaben zum Energieausweis (GEG § 87)",
  kontakt: "Kontakt",
  naechsterSchritt: "Bereit für den nächsten Schritt?",
  kontaktText: "Dein Ansprechpartner geht das Exposé mit dir durch und beantwortet alle Fragen, ohne Verpflichtung.",
  kontaktRolleFallback: "Wir melden uns mit deinem persönlichen Ansprechpartner.",
  ansprechpartnerVertrieb: "Dein Ansprechpartner im Vertrieb",
  kontaktMoreImmo: "Dein Kontakt zu MOREImmo",
  erstelltAm: (datum, fuer, von) =>
    `Dieses Exposé wurde am ${datum}${fuer ? ` für ${fuer}` : ""}${von ? ` von ${von}` : ""} erstellt. Es gibt den Stand des Online-Exposés zu diesem Zeitpunkt wieder, mit den dort eingestellten Annahmen.`,
  fussPreisstand: (firma, datum) => `${firma} · Preisstand ${datum}`,
  fussModell: (seite) => `Alle Zahlen sind Modellrechnungen mit den auf Seite ${seite} genannten Annahmen.`,
};

export const EXPOSE_PDF_TEXTE_EN: ExposePdfTexte = {
  kennung: "Exposé",
  dokumentTitel: (titel) => `Exposé ${titel}`,
  deckblattFuss: (preisstand, firma) => `Prices as of ${preisstand}. All figures are model calculations, not a promise. ${firma}`,
  deineKapitalanlage: "Your investment",
  einwohnerIn: (zahl, ort) => `${zahl} residents in ${ort}`,
  wachstum: (prozent) => `${prozent} residents over five years`,
  keineStandortkennzahlen: (ort) => `No location figures are available for ${ort} yet.`,
  warum: (ort) => `Why ${ort}`,
  argumenteImGespraech: "Your contact will explain the reasons for this location in person.",
  marktUndStandort: "Market and location",
  arbeitgeber: "Well-known employers",
  beschaeftigte: (zahl) => `around ${zahl} employees`,
  quelle: (q) => `Source: ${q}.`,
  umgebungVon: (adresse) => `Surroundings of ${adresse}.`,
  messpunkt: "Measuring point",
  objekt: "Property",
  makrolage: "Wider area",
  umgebung: "Surroundings",
  karteOnline: " The online exposé shows the map.",
  umgebungImGespraechTitel: "Surroundings in person",
  umgebungImGespraech:
    "The surroundings of this address have not been measured yet. Your contact will go through shopping, leisure and infrastructure around the property with you.",
  makroLeer: "Universities and hospitals in the area are not recorded in OpenStreetMap. That does not mean there are none.",
  makroNichtGemessen: "Universities and hospitals in the region will be added with the next measurement of the surroundings.",
  sanierungenTitel: "Renovations and measures",
  keineAngabenBautraeger: "No details from the developer",
  jahr: "Year",
  massnahme: "Measure",
  kosten: "Costs",
  energieTitel: "Energy efficiency of the building",
  baujahr: (jahr) => `Built ${jahr}`,
  gueltigBis: (datum) => `Certificate valid until ${datum}`,
  energieFehlt: "Details of the energy certificate are missing.",
  ohneKennwert: "Without a final energy value, the scale shows no marker.",
  ueberSkala: (max) => `over ${max} kWh/(m²·a)`,
  pflichtFehlenTitel: "Mandatory details missing",
  pflichtFehlen: (liste) =>
    `Mandatory details under Section 87 GEG are missing for the property: ${liste}. They will be added as soon as they are available.`,
  masseHinweis: "Dimensions in the floor plan may differ from the actual measurements. Furniture is for illustration only.",
  ersatzTitel: { geschossplan: "Floor plan of the storey", hausplan: "Plan of the building" },
  ersatzText: {
    geschossplan: "There is no separate floor plan of this flat. Shown is the plan of its storey with all units on it.",
    hausplan: "There is no separate floor plan of this flat. Shown is a plan of the building.",
  },
  alsDatei: "As a file in the online exposé",
  weiterePlaene: (anzahl) => `${anzahl} more plans in the online exposé.`,
  grundrissDateiTitel: "Floor plan as a file",
  grundrissDatei: (namen) => `The floor plan is available as a file: ${namen}. You can open it in the online exposé.`,
  wirtschaftlichkeitVorspann:
    "All figures are a model calculation with the assumptions on this page. Values from your self-disclosure (Selbstauskunft) are marked in the Source column. In the online exposé you can change every value and the page recalculates immediately.",
  kaufFinanzierung: "Purchase price and financing",
  kaufpreisWohnung: "Purchase price of the flat",
  preisanpassung: (wert) => `Price adjustment ${wert}`,
  stellplatz: "Parking space",
  gesamtinvestition: "Total investment",
  nebenkosten: (satz, land) => `Incidental purchase costs ${satz}${land ? ` (${land})` : ""}`,
  darlehen: (quote) => `Loan (${quote} financing)`,
  eigenkapitaleinsatz: "Equity invested",
  nebenkostenNotiz: (a) =>
    `Real estate transfer tax ${a.grest}, notary and land register ${a.notar}${a.makler ? `, agent ${a.makler}` : ", no agent’s commission"}. ${
      a.quelle === "manuell"
        ? "Rate as stated for the property."
        : a.quelle === "mittelwert"
          ? "Federal state unknown, average of all states."
          : "Rate for the federal state."
    } The equity invested is the incidental costs plus your equity in the investment; you always pay the incidental costs yourself. Monthly instalment ${a.rate} at ${a.zins} interest and ${a.tilgung} repayment.`,
  annahmen: "Assumptions",
  annahme: "Assumption",
  wert: "Value",
  herkunft: "Source",
  herkunftWerte: { selbstauskunft: "Self-disclosure", objekt: "Property", standard: "Standard", angepasst: "Adjusted", tarif: "Tax scale" },
  zeilen: {
    eigenkapital: "Equity",
    zins: "Interest rate",
    tilgung: "Initial repayment",
    zve: "Taxable income",
    verheiratet: "Married, splitting tariff",
    freibetrag: "Monthly tax benefit via tax allowance (Section 39a EStG)",
    freibetragNein: "No, refund in the following year",
    grenzsteuersatz: "Marginal tax rate",
    grenzFest: "fixed",
    grenzTarif: (jahr) => `under the ${jahr} tax scale`,
    mietsteigerung: "Rent increase per year",
    kostensteigerung: "Cost increase per year",
    wertentwicklung: "Increase in value per year",
    leerstand: "Vacancy",
    makler: "Agent’s commission",
    preisanpassung: "Price adjustment",
    afa: "Depreciation (AfA) per year",
    afaWert: (satz, anteil, angenommen) => `${satz} on ${anteil} building share${angenommen ? " (assumed)" : ""}`,
    sonderAfa: "Special depreciation (Section 7b EStG)",
    sonderAfaJa: (satz, jahre) => `Yes, ${satz} over ${jahre} years`,
    sonderAfaNicht: "Yes, but not applicable",
    mietverwaltung: "Rental management in the expenses",
    sanierung: "Renovation for tax purposes",
    sanierungErhaltung: (jahre) =>
      `Maintenance expenses (Erhaltungsaufwand), deductible immediately, spread over ${jahre} ${jahre === 1 ? "year" : "years"}`,
    sanierungWerkvertrag: "Contract for work, increases the depreciation basis",
    sanierungNicht: "Not applied",
    startHaltedauerTitel: "Start year and holding period",
    startHaltedauer: (start, jahre) => `${start}, ${jahre} years`,
    ja: "Yes",
    nein: "No",
  },
  eigenkapitalSa: (betrag) => `According to your self-disclosure, ${betrag} of liquid equity is available.`,
  monatTitel: (jahr) => `Monthly view, values for ${jahr}`,
  einnahmen: "Income",
  kaltmiete: "Net cold rent",
  steuervorteil: "Tax benefit",
  steuervorteilMonatlich: "monthly via the tax allowance",
  steuervorteilErstattung: "refund for the previous year, spread over the month",
  summeEinnahmen: "Total income",
  ausgaben: "Expenses",
  zinsTilgung: "Interest and repayment",
  hausgeldNu: "Service charge, non-recoverable",
  ruecklage: "Maintenance reserve",
  mietverwaltung: "Rental management",
  mietausfall: "Loss of rent (vacancy)",
  summeAusgaben: "Total expenses",
  eigenanteil: "Your monthly own contribution",
  ueberschuss: "Your monthly surplus",
  vermoegensaufbau: "Wealth building",
  nach: "After",
  immobilienwert: "Property value",
  restschuld: "Remaining debt",
  verkaufsertrag: "Sale proceeds",
  eigenanteile: "Own contributions",
  vermoegen: "Wealth",
  jahreKalender: (jahre, kalender) => `${jahre} years (${kalender})`,
  jahre: (jahre) => `${jahre} years`,
  achseMio: (wert) => `€${wert}m`,
  achseTsd: (wert) => `€${wert}k`,
  aufgebautesVermoegen: "Wealth built up",
  ekRenditeTitel: "Return on equity per year",
  nachJahren: (jahre) => `after ${jahre} years`,
  nichtBestimmbar: "not determinable",
  ausEinemEuro: (faktor) => `€1 becomes €${faktor}`,
  ohneEigenkapital: "without equity",
  vermoegenFuss: (wertsteigerung, eigenkapital) =>
    `Sale proceeds are the property value minus the remaining debt. Own contributions are the sum of all ongoing own contributions and surpluses up to that point; negative means paid in. Wealth built up is both together, without the one-off tax saving from a renovation. Property value at ${wertsteigerung} increase in value per year, equity invested ${eigenkapital}. Model calculation, not a promise: interest after the fixed-interest period and taxes may differ.`,
  keinVermoegensaufbau: "The holding period is shorter than ten years, so there is no wealth building after 10, 20, 30 and 40 years.",
  sanierungTitel: "Renovation of the common property",
  sanierungText: (wirksam) =>
    `Your share according to your co-ownership share, ${wirksam}. The one-off saving is shown separately and is not included in the monthly calculation, wealth building or return on equity.`,
  wirksamAb: (jahr) => `effective from ${jahr}`,
  wirksamErstesJahr: "effective in the first year",
  anteilMassnahme: "Your share of the measure",
  einmaligeErsparnis: "One-off tax saving",
  wirkung: "Effect",
  ueberAfa: "via depreciation",
  steuerlich: "For tax purposes",
  nichtAngesetzt: "not applied",
  jeEuroTitel: "For every euro invested",
  jeEuroText: (jahre) => `Wealth built up after ${jahre} years divided by the equity you invested.`,
  eingesetztesEk: "Equity invested",
  ausEinemEuroLabel: "€1 becomes",
  verwaltungTitel: (name) => `Management services, ${name}`,
  verwaltungStandard: "Rental management services",
  verwaltungOhneLeistungen:
    "The exact scope of the management’s services is set out in the management agreement. Your contact will go through it with you in the consultation.",
  verwaltungNotiz:
    "The rental management looks after your flat and the tenant. The management of the owners’ association for the whole building is included in the service charge (Hausgeld).",
  erledigt: "Done",
  zeitplanNotiz: "Periods are based on our experience, not a promise. The bank, notary and seller also set the pace.",
  chancenVorspann:
    "Every investment has opportunities and risks, including this flat. To help you decide, both sides are set out here next to each other, topic by topic.",
  chance: "OPPORTUNITY",
  risiko: "RISK",
  entwurf: "Draft",
  entwurfText: "These notes have not yet been approved by our lawyer. They will be reviewed and replaced before the first customer link.",
  energiePflichtTitel: "Mandatory details on the energy certificate (Section 87 GEG)",
  kontakt: "Contact",
  naechsterSchritt: "Ready for the next step?",
  kontaktText: "Your contact will go through the exposé with you and answer all your questions, without obligation.",
  kontaktRolleFallback: "We will get in touch with your personal contact.",
  ansprechpartnerVertrieb: "Your contact person at MOREImmo",
  kontaktMoreImmo: "Your contact at MOREImmo",
  erstelltAm: (datum, fuer, von) =>
    `This exposé was prepared on ${datum}${fuer ? ` for ${fuer}` : ""}${von ? ` by ${von}` : ""}. It reflects the online exposé at that time, with the assumptions set there.`,
  fussPreisstand: (firma, datum) => `${firma} · Prices as of ${datum}`,
  fussModell: (seite) => `All figures are model calculations with the assumptions stated on page ${seite}.`,
};

export const EXPOSE_PDF_TEXTE: Record<FormatSprache, ExposePdfTexte> = { de: EXPOSE_PDF_TEXTE_DE, en: EXPOSE_PDF_TEXTE_EN };

export function exposePdfTexte(sprache: FormatSprache | undefined): ExposePdfTexte {
  return sprache === "en" ? EXPOSE_PDF_TEXTE_EN : EXPOSE_PDF_TEXTE_DE;
}

/* ── Umgebung: Kategorien, Listen und Messhinweise auf Englisch ── */

const KATEGORIE_EN: Record<string, string> = {
  einkaufen: "Shopping",
  freizeit: "Leisure",
  gruen: "Parks and green spaces",
  verkehr: "Public transport",
  einrichtungen: "Public facilities",
  kitas: "Nurseries",
  schulen: "Schools",
  aerzte: "Doctors",
  apotheken: "Pharmacies",
  behoerden: "Public authorities",
  hochschulen: "Universities",
  kliniken: "Hospitals",
};

/** Titel einer Umgebungskategorie oder -liste, auf Englisch über ihre Kennung. */
export function umgebungTitel(id: string, titel: string, sprache: FormatSprache | undefined): string {
  return sprache === "en" ? KATEGORIE_EN[id] ?? titel : titel;
}

/** Der Hinweis zur Genauigkeit der Messung, auf Englisch über die Genauigkeit. */
export function genauigkeitEnglisch(genauigkeit: string | undefined): string {
  if (genauigkeit === "ort") return "Measured from the town centre, not from the front door. The distances show what there is in the town, not the route from the building.";
  if (genauigkeit === "plz") return "Measured from the centre of the postcode area, not from the front door. The distances show what there is in the area, not the route from the building.";
  if (genauigkeit === "strasse") return "Measured from the street, as the house number is not recorded in OpenStreetMap. The distances are therefore only approximate.";
  return "";
}

/** Der Herkunftssatz unter der Umgebung auf Englisch. Die Messung speichert ihn deutsch. */
export function umgebungHinweisEnglisch(leer: boolean): string {
  return leer
    ? "No facilities are recorded in OpenStreetMap for this address. That does not mean there are none."
    : "Distances as the crow flies, facilities from OpenStreetMap, as at the time of the query.";
}

/** Entfernung „350 m“ oder „1.2 km“ in der Schreibweise der Sprache. */
export function entfernungFuer(meter: number, sprache: FormatSprache | undefined): string {
  if (meter < 1000) return `${Math.round(meter / 50) * 50} m`;
  return `${(meter / 1000).toLocaleString(sprache === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: 1 })} km`;
}

/**
 * Die Hinweise des Rechners (`ergebnis.hinweise`, deutsch erzeugt) auf
 * Englisch. Bekannte Sätze werden übersetzt, ein unbekannter bleibt deutsch,
 * damit keine Annahme stillschweigend verschwindet.
 */
export function rechnerHinweisEnglisch(hinweis: string): string {
  const regeln: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^Nebenkosten ([\d.,]+) % wie am Objekt gepflegt\.$/, (m) => `Incidental costs ${m[1].replace(",", ".")}% as stated for the property.`],
    [/^Bundesland unbekannt, Grunderwerbsteuer als Mittelwert aller Länder angesetzt\.$/, () => "Federal state unknown, real estate transfer tax applied as the average of all states."],
    [/^Kaufnebenkosten übernimmt der Verkäufer/, () => "The seller pays the incidental purchase costs: no equity is needed for them, and they do not increase the depreciation basis."],
    [/^Zweites Darlehen auf den Eigenkapitaleinsatz begrenzt/, () => "Second loan limited to the equity invested; there is nothing more to replace."],
    [/^Zweites Darlehen auf das Bankdarlehen begrenzt/, () => "Second loan limited to the bank loan; there is nothing more to replace."],
    [/^Gebäudeanteil nicht am Objekt gepflegt, ([\d.,]+) % angenommen\.$/, (m) => `Building share not stated for the property, ${m[1].replace(",", ".")}% assumed.`],
    [/^Sanierung als Werkvertrag/, () => "Renovation as a contract for work: production costs that increase the depreciation basis instead of being deductible immediately."],
    [/^Sonder-AfA ([\d.,]+) % auf den Gebäudeanteil über (\d+) Jahre\.$/, (m) => `Special depreciation ${m[1].replace(",", ".")}% on the building share over ${m[2]} years.`],
    [/^Steuerwirkung flach mit ([\d.,]+) % Grenzsteuersatz statt nach Tarif\.$/, (m) => `Tax effect at a flat ${m[1].replace(",", ".")}% marginal tax rate instead of the tax scale.`],
    [/^Kein zu versteuerndes Einkommen angegeben, Steuerwirkung 0\.$/, () => "No taxable income stated, tax effect 0."],
    [/^Mieterhöhung ab (\d{2})\/(\d{4}) berücksichtigt\.$/, (m) => `Rent increase from ${m[1]}/${m[2]} taken into account.`],
    [/^Ohne Lohnsteuerermäßigung kommt der Steuervorteil als Erstattung im Folgejahr an\.$/, () => "Without a wage tax reduction, the tax benefit arrives as a refund in the following year."],
  ];
  for (const [muster, uebersetzung] of regeln) {
    const m = hinweis.match(muster);
    if (m) return uebersetzung(m);
  }
  return hinweis;
}
