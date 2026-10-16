/**
 * Die festen Texte des Exposé-PDFs (seit 01.10.2026 `exposeDruck/daten.ts`) in
 * Deutsch und Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 5 (D10). Der Inhalt selbst
 * (Kennzahlen, Schritte, Hinweise) kommt schon in der Sprache des Kunden aus
 * `baueExposeInhalt`; hier steht nur, was das PDF selbst schreibt: Kopf,
 * Kacheltitel, Tabellenköpfe, Fußzeile. Die deutschen Texte
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
  kontaktOsImmobilien: string;
  erstelltAm: (datum: string, fuer: string, von: string) => string;
  fussPreisstand: (firma: string, datum: string) => string;
}

export const EXPOSE_PDF_TEXTE_DE: ExposePdfTexte = {
  kennung: "Exposé",
  dokumentTitel: (titel) => `Exposé ${titel}`,
  deckblattFuss: (preisstand, firma) => `Preisstand ${preisstand}. ${firma}`,
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
  kontaktOsImmobilien: "Dein Kontakt zu OS Immobilien",
  erstelltAm: (datum, fuer, von) =>
    `Dieses Exposé wurde am ${datum}${fuer ? ` für ${fuer}` : ""}${von ? ` von ${von}` : ""} erstellt. Es gibt den Stand des Online-Exposés zu diesem Zeitpunkt wieder, mit den dort eingestellten Annahmen.`,
  fussPreisstand: (firma, datum) => `${firma} · Preisstand ${datum}`,
};

export const EXPOSE_PDF_TEXTE_EN: ExposePdfTexte = {
  kennung: "Exposé",
  dokumentTitel: (titel) => `Exposé ${titel}`,
  deckblattFuss: (preisstand, firma) => `Prices as of ${preisstand}. ${firma}`,
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
  ansprechpartnerVertrieb: "Your contact person at OS Immobilien",
  kontaktOsImmobilien: "Your contact at OS Immobilien",
  erstelltAm: (datum, fuer, von) =>
    `This exposé was prepared on ${datum}${fuer ? ` for ${fuer}` : ""}${von ? ` by ${von}` : ""}. It reflects the online exposé at that time, with the assumptions set there.`,
  fussPreisstand: (firma, datum) => `${firma} · Prices as of ${datum}`,
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
