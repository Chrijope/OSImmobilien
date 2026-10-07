import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import type { Standort } from "@/data/marktanalyseSeed";
import type { KategorieErgebnis } from "@/lib/umgebung";
import { KATEGORIEN } from "@/lib/umgebung";

/**
 * Testdaten: das Musterobjekt „MUSTER Wohnanlage Musterstraße 12, Augsburg"
 * mit der Wohneinheit WE 7, nachgebaut aus dem Muster-SQL
 * (supabase, Objekt 11111111-1111-4111-8111-000000000000). Alle Zahlen
 * sind frei erfunden. Dient den Tests und der Sichtprüfung des Exposé-PDFs.
 */

export const MUSTER_WE7: ObjektWohnung = {
  id: "11111111-1111-4111-8111-000000000007",
  weNr: "WE 7",
  etage: "2. OG",
  lage: "rechts",
  groesse: 61.4,
  zimmer: 3,
  mieteGesamt: 790,
  vkGesamt: 232000,
  qmPreis: 3778.5,
  rendite: 4.09,
  vermietet: true,
  vermietungsStatus: "vermietet",
  status: "frei",
  dokumente: [
    { id: "muster-wd-07-grundriss", name: "Grundriss WE 7 MUSTER", url: "/muster/objekt/grundriss-we-07.jpg", kategorie: "wohnungsunterlagen" },
    { id: "muster-wd-07-wirtschaftsplan", name: "Wirtschaftsplan 2026 MUSTER", url: "/muster/objekt/wirtschaftsplan-muster.pdf", kategorie: "wohnungsunterlagen" },
    { id: "muster-wd-07-mietvertrag", name: "Mietvertrag WE 7 MUSTER", url: "/muster/objekt/mietvertrag-we-07-muster.pdf", kategorie: "wohnungsunterlagen" },
    { id: "muster-wd-07-mieterakte", name: "Mieterakte intern MUSTER", url: "/muster/objekt/mieterakte-intern-muster.pdf", kategorie: "intern" },
  ],
  bilder: [
    { id: "muster-gr-07", url: "/muster/objekt/grundriss-we-07.jpg", alt: "Grundriss WE 7, Musterzeichnung", reihenfolge: 0 },
    { id: "muster-wz-07", url: "/muster/objekt/wohnzimmer.jpg", alt: "Wohnzimmer, Musterbild", reihenfolge: 1 },
    { id: "muster-ku-07", url: "/muster/objekt/kueche.jpg", alt: "Küche, Musterbild", reihenfolge: 2 },
    { id: "muster-ba-07", url: "/muster/objekt/bad.jpg", alt: "Bad, Musterbild", reihenfolge: 3 },
    { id: "muster-bk-07", url: "/muster/objekt/balkon.jpg", alt: "Balkon, Musterbild", reihenfolge: 4 },
  ],
  stellplatzPreis: 9500,
  stellplatzMiete: 35,
  ruecklageWohnung: 43,
  hausgeldMonat: 184,
  hausgeldNichtUmlagefaehigEuro: 71,
  hausgeldNichtUmlagefaehigP: 38.6,
  stadtteil: "Göggingen",
  sanierungsjahr: 2024,
  sanierungAnteilProzent: 9.5,
  sanierungAnteilBetrag: 17100,
  nebenkostenMonat: 113,
  verwaltungWegMonat: 28,
  verwaltungSevMonat: 25,
  sevErstesJahrInklusive: true,
  vermietetSeit: "2021-03",
};

export const MUSTER_OBJEKT: ObjektData = {
  id: "11111111-1111-4111-8111-000000000000",
  titel: "MUSTER Wohnanlage Musterstraße 12, Augsburg",
  adresse: "Musterstraße 12",
  plz: "86199",
  ort: "Augsburg",
  beschreibung: "Musterobjekt zur Ansicht der neuen Objektseite, der Einheiten-Seite und des Exposés. Alle Angaben sind frei erfunden.",
  highlights: ["Musterobjekt", "Sanierung 2023 und 2024", "Aufzug", "Stellplatz je Wohnung", "SEV im ersten Jahr inklusive"],
  bildUrl: "/muster/objekt/aussenansicht.jpg",
  bilder: [
    { id: "muster-ob-01", url: "/muster/objekt/aussenansicht.jpg", alt: "Außenansicht, Musterbild", reihenfolge: 0 },
    { id: "muster-ob-02", url: "/muster/objekt/wohnzimmer.jpg", alt: "Wohnzimmer, Musterbild", reihenfolge: 1 },
    { id: "muster-ob-03", url: "/muster/objekt/kueche.jpg", alt: "Küche, Musterbild", reihenfolge: 2 },
    { id: "muster-ob-04", url: "/muster/objekt/bad.jpg", alt: "Bad, Musterbild", reihenfolge: 3 },
    { id: "muster-ob-05", url: "/muster/objekt/balkon.jpg", alt: "Balkon, Musterbild", reihenfolge: 4 },
    { id: "muster-ob-06", url: "/muster/objekt/hausflur.jpg", alt: "Hausflur, Musterbild", reihenfolge: 5 },
  ],
  dokumente: [
    { id: "muster-od-energie", name: "Energieausweis MUSTER", url: "/muster/objekt/energieausweis-muster.pdf", typ: "custom", kategorie: "objektunterlagen", sichtbar: true },
    { id: "muster-od-teilung", name: "Teilungserklärung MUSTER", url: "/muster/objekt/teilungserklaerung-muster.pdf", typ: "custom", kategorie: "objektunterlagen", sichtbar: true },
    { id: "muster-od-wirtschaftsplan", name: "Wirtschaftsplan 2026 MUSTER", url: "/muster/objekt/wirtschaftsplan-muster.pdf", typ: "custom", kategorie: "objektunterlagen", sichtbar: true },
  ],
  wohnungen: [MUSTER_WE7],
  videoUrl: "",
  videoSichtbar: false,
  badge: "MUSTER",
  groesseVon: 45,
  groesseBis: 98,
  preisVon: 189000,
  preisBis: 412000,
  renditeVon: 3.44,
  renditeBis: 4.09,
  sichtbar: false,
  status: "entwurf",
  erstellt_am: "2026-09-02T09:00:00+02:00",
  sanierungskosten: 0,
  erhaltungsaufwandJahre: 1,
  afaDaten: { afaModell: "linear", afaSatz: 2, restnutzungsdauer: 50, grundstueckAnteil: 20, bodenrichtwert: 650 },
  globalDaten: {
    gesamtQm: 643.8, etagen: 5, baujahr: 1962, grundstueckQm: 1240, verkaufspreis: 2585000, qmPreis: 0, rendite: 3.76,
    jahresnettomiete: 97260, hausgeldMonat: 1932, kaufnebenkosten: 5, grundstueckAnteil: 20, zustand: "Kernsanierung", energieeffizienzklasse: "D",
    stellplaetze: 10, vermietungsstand: 90,
  },
  meta: {
    muster: true,
    objektart: "sanierter_bestand",
    kurzbeschreibung: "Sanierte Wohnanlage von 1962 in Augsburg-Göggingen mit zehn Eigentumswohnungen von 45 bis 98 m².",
    standortargumente: [
      "Wirtschaft und Arbeitgeber. Augsburg ist mit rund 300.000 Einwohnern die drittgrößte Stadt Bayerns, mit Arbeitgebern aus Maschinenbau, Luftfahrt und Medizintechnik (Musterangabe).",
      "Hochschulstandort. Universität und Technische Hochschule mit über 25.000 Studierenden sorgen für dauerhafte Nachfrage nach kleinen und mittleren Wohnungen (Musterangabe).",
      "Anbindung. Straßenbahn in fünf Gehminuten, Hauptbahnhof in zwölf Minuten, München in rund 30 Minuten mit dem Zug (Musterangabe).",
      "Stadtteil Göggingen. Gewachsener Stadtteil mit Kurhaus, Parkanlagen und Nahversorgung in Laufweite, ruhige Wohnstraße (Musterangabe).",
      "Mietmarkt. Angebotsmieten um 12,80 € je m² bei geringer Leerstandsquote, die Bestandsmieten des Objekts liegen darunter (Musterangabe).",
    ],
    energieausweis: { art: "Verbrauchsausweis", kennwert: 121, klasse: "D", energietraeger: "Gas", gueltigBis: "2034-03-15" },
    gemeinschaftseigentum: "5 Etagen mit 10 Wohneinheiten, Aufzug nachgerüstet 2024, 10 Außenstellplätze mit Sondernutzungsrecht, Fahrradraum und Kellerabteile, Erhaltungsrücklage 48.500 € zum 30.06.2026",
    sanierungen: [
      { jahr: "2023", massnahme: "Dach neu gedeckt und gedämmt", betrag: 62000 },
      { jahr: "2024", massnahme: "Fassade mit Wärmedämmverbund und neue Fenster", betrag: 78000 },
      { jahr: "2024", massnahme: "Gas-Brennwertheizung und Steigleitungen", betrag: 40000 },
    ],
    verwaltung: "Hausverwaltung Musterhaus GmbH, Augsburg, WEG und SEV",
    anlageklasse: "Eigentumswohnung",
    verwaltungsart: "WEG+SEV",
    verwaltungskostenWeg: 28,
    verwaltungskostenSev: 25,
    ruecklageWeg: 450,
    kalkulation: { hausgeldNichtUmlagefaehigP: 38 },
  },
};

/** Augsburg aus der Standortdatenbank, gekürzt auf das, was das Exposé zeigt. */
export const MUSTER_STANDORT: Standort = {
  id: "augsburg", ags: "09761", name: "Augsburg", bundesland: "Bayern", lat: 48.37, lng: 10.9,
  einwohner: 301000, einwohner_trend_5j_pct: 3.1, arbeitslosenquote_pct: 5.2, kaufkraftindex: 98, bip_pro_kopf_eur: 0,
  kaufpreis_qm_wohnung_eur: 4200, kaufpreis_qm_haus_eur: 0, miete_qm_eur: 12.8, leerstand_pct: 1.9, uni_stadt: true, oepnv_score: 4,
  top_arbeitgeber: [
    { name: "MAN Energy Solutions", branche: "Maschinenbau", mitarbeiter: 4000 },
    { name: "Premium Aerotec", branche: "Luftfahrt", mitarbeiter: 3000 },
    { name: "Universitätsklinikum Augsburg", branche: "Gesundheit", mitarbeiter: 6500 },
    { name: "KUKA", branche: "Robotik", mitarbeiter: 3500 },
  ],
  highlights: ["Uni-Stadt"],
  quellen: [],
} as Standort;

/** Eine erfundene Umgebungsmessung, wie sie umgebung() liefern würde. */
export function musterUmgebung(): KategorieErgebnis[] {
  const kat = (key: string) => KATEGORIEN.find((k) => k.key === key)!;
  const ort = (name: string, entfernung: number) => ({ id: name, name, address: "", lat: 0, lng: 0, entfernung });
  return [
    { kategorie: kat("supermarket"), orte: [ort("REWE Göggingen", 320), ort("Edeka Musterweg", 640)] },
    { kategorie: kat("bakery"), orte: [ort("Bäckerei Musterbrot", 180)] },
    { kategorie: kat("pharmacy"), orte: [ort("Kurhaus-Apotheke", 410)] },
    { kategorie: kat("park"), orte: [ort("Kurhauspark", 520), ort("Wertachauen", 1300)] },
    { kategorie: kat("sports"), orte: [ort("Sportanlage Süd", 900)] },
    { kategorie: kat("transit"), orte: [ort("Haltestelle Musterstraße", 240), ort("Haltestelle Göggingen Rathaus", 610)] },
    { kategorie: kat("kindergarten"), orte: [ort("Kita Sonnenblume", 350)] },
    { kategorie: kat("school"), orte: [ort("Grundschule Göggingen", 700)] },
  ];
}
