/**
 * Die OS-Objekte im Handbuch und auf der Handbuch-Seite (seit dem 17.10.2026,
 * freigegeben im Entwurf /vorschau/handbuch-entwurf).
 *
 * Barfusstraße, Hauffstraße und Zossen wie `OBJEKTE` in beratungOsDaten.ts,
 * Luisenstraße 72, Agnesstraße, Brück und Cottbus aus den Exposé-Quellen
 * (Stand 16.10.2026). Brück: 12 Wohnungen, weil das EG geteilt wird.
 * Konzept bei Brück und Cottbus vorläufig, von Christian so belassen.
 * ponytail: fest wie die Mikroseite; aus „Objekte“ im CRM, sobald die
 * OS-Objekte dort mit Bildern gepflegt sind (heute stehen dort nur Objekte
 * aus dem Ursprungsprojekt).
 */
import type { Block } from "./bausteine";
import { aufbauSprache, tx } from "./diagramme";

export type Bundesland = "Berlin" | "Brandenburg";
export type OsKonzept = "steuer" | "alter";

/** Kaufnebenkosten wie im CRM seit dem 16.10.2026: Grunderwerbsteuer + 1,5 % Notar + 0,5 % Grundbuch. */
export const KAUFNEBENKOSTEN: Record<Bundesland, { grunderwerbsteuer: number; gesamt: number }> = {
  Berlin: { grunderwerbsteuer: 6.0, gesamt: 8.0 },
  Brandenburg: { grunderwerbsteuer: 6.5, gesamt: 8.5 },
};

export interface OsObjekt {
  titel: string;
  ort: string;
  land: Bundesland;
  text: [string, string];
  daten: [string, string];
  preisVon: number;
  preisBis: number;
  preis: [string, string];
  konzepte: OsKonzept[];
  bild: string;
}

const M = "/images/mikroseite";
const H = "/images/handbuch";

export const OS_OBJEKTE: OsObjekt[] = [
  {
    titel: "Barfusstraße 9",
    ort: "Berlin-Wedding",
    land: "Berlin",
    text: [
      "Gründerzeit-Altbau um 1900, U6 vor der Tür, Volkspark Rehberge und Schillerpark nebenan.",
      "Period building from around 1900, U6 underground on the doorstep, Rehberge and Schillerpark nearby.",
    ],
    daten: ["28 Wohnungen · 37 bis 92 m²", "28 flats · 37 to 92 m²"],
    preisVon: 186850,
    preisBis: 469000,
    preis: ["186.850 bis 469.000 €", "€186,850 to €469,000"],
    konzepte: ["steuer"],
    bild: `${M}/barfuss-fassade.jpg`,
  },
  {
    titel: "Hauffstraße 38",
    ort: "Schwielowsee bei Potsdam",
    land: "Brandenburg",
    text: [
      "Gepflegte Wohnanlage mit Garten, Aufzug und Garage. Rund 350.000 € Instandhaltung von 2020 bis 2026.",
      "Well-kept residential complex with garden, lift and garage. Around €350,000 invested in maintenance from 2020 to 2026.",
    ],
    daten: ["Baujahr 2000 · 46 Wohnungen · 42 bis 80 m²", "Built 2000 · 46 flats · 42 to 80 m²"],
    preisVon: 176000,
    preisBis: 314000,
    preis: ["176.000 bis 314.000 € inkl. Garage", "€176,000 to €314,000 incl. garage"],
    konzepte: ["alter"],
    bild: `${M}/hauff-garten.jpg`,
  },
  {
    titel: "Luisenstraße 72",
    ort: "Zossen-Wünsdorf",
    land: "Brandenburg",
    text: [
      "Doppelhaushälfte in der Waldsiedlung, eigenes Grundstück, kein Hausgeld. Bahnhof 650 m, BER 22 km.",
      "Semi-detached house in the forest estate, own plot, no service charge. Station 650 m, BER airport 22 km.",
    ],
    daten: ["91 m² · ca. 600 m² Grundstück · Miete 1.600 €", "91 m² · approx. 600 m² plot · rent €1,600"],
    preisVon: 379000,
    preisBis: 379000,
    preis: ["379.000 € inkl. Sanierungspaket", "€379,000 incl. renovation package"],
    konzepte: ["alter"],
    bild: `${M}/zossen-luisenstrasse.jpg`,
  },
  {
    titel: "Agnesstraße 5/6",
    ort: "Zossen-Wünsdorf",
    land: "Brandenburg",
    text: [
      "Zwei baugleiche Doppelhaushälften in der Waldsiedlung, mit Vollsanierung und eigenem Garten.",
      "Two identical semi-detached houses in the forest estate, fully renovated, each with its own garden.",
    ],
    daten: ["96 m², 4 Zimmer · Zielmiete 1.800 €", "96 m², 4 rooms · target rent €1,800"],
    preisVon: 419000,
    preisBis: 419000,
    preis: ["419.000 € je Haus inkl. Vollsanierung", "€419,000 per house incl. full renovation"],
    konzepte: ["alter"],
    bild: `${H}/agnes-6.jpg`,
  },
  {
    titel: "Marktstraße 6",
    ort: "Brück bei Potsdam",
    land: "Brandenburg",
    text: [
      "Mehrfamilienhaus mit kleinen und mittleren Wohnungen, Einstieg schon mit kleinem Kaufpreis.",
      "Apartment building with small and medium-sized flats, an entry point even with a small budget.",
    ],
    daten: ["12 Wohnungen · 25 bis 90 m² · Sollmiete 10 €/m²", "12 flats · 25 to 90 m² · target rent €10 per m²"],
    preisVon: 64500,
    preisBis: 203500,
    preis: ["64.500 bis 203.500 €", "€64,500 to €203,500"],
    konzepte: ["alter", "steuer"],
    bild: `${H}/brueck-1.jpg`,
  },
  {
    titel: "Jamlitzer Straße 9/10",
    ort: "Cottbus",
    land: "Brandenburg",
    text: [
      "Studentisches Wohnen, möbliertes Apartment, vermietet. Rund 7.000 Studierende in der Stadt.",
      "Student living, furnished apartment, let. Around 7,000 students in the city.",
    ],
    daten: ["22 m², 1 Zimmer · Miete 340 €", "22 m², 1 room · rent €340"],
    preisVon: 79995,
    preisBis: 79995,
    preis: ["79.995 €", "€79,995"],
    konzepte: ["steuer"],
    bild: `${H}/cottbus-luftbild.jpg`,
  },
];

export type Passung = "passt" | "teilweise" | "darunter" | "darueber";

const PASSUNG_RANG: Record<Passung, number> = { passt: 0, teilweise: 1, darunter: 2, darueber: 3 };

export function passungText(p: Passung): string {
  switch (p) {
    case "passt":
      return tx("Passt in deinen Rahmen", "Fits your budget");
    case "teilweise":
      return tx("Einzelne Wohnungen passen", "Some flats fit");
    case "darunter":
      return tx("Kleiner Einstieg unter deinem Rahmen", "Smaller entry below your budget");
    default:
      return tx("Über deinem Rahmen", "Above your budget");
  }
}

export function passung(o: Pick<OsObjekt, "preisVon" | "preisBis">, von: number, bis: number): Passung {
  if (o.preisVon > bis) return "darueber";
  if (o.preisBis < von) return "darunter";
  if (o.preisVon >= von && o.preisBis <= bis) return "passt";
  return "teilweise";
}

/** Das Konzept zum Ziel aus Frage 1: Altersvorsorge oder Steuerersparnis. */
export function konzeptZumZiel(ziel: string): OsKonzept {
  return ziel === "alter" ? "alter" : "steuer";
}

export function konzeptText(k: OsKonzept): string {
  return k === "steuer" ? tx("Steuerersparnis", "Tax savings") : tx("Altersvorsorge", "Retirement provision");
}

/** Objekte sortiert: passend vor teilweise, darunter und darüber; bei Gleichstand das Konzept des Ziels zuerst. */
export function objekteFuerRahmen(von: number, bis: number, ziel: string) {
  const konzept = konzeptZumZiel(ziel);
  return OS_OBJEKTE.map((o) => ({ objekt: o, passung: passung(o, von, bis) })).sort(
    (x, y) =>
      PASSUNG_RANG[x.passung] - PASSUNG_RANG[y.passung] ||
      Number(y.objekt.konzepte.includes(konzept)) - Number(x.objekt.konzepte.includes(konzept)),
  );
}

/** Der Block „objekte“ für Handbuch und PDF, im Aufbau mit `inSprache` aufrufen. */
export function objekteBlock(von: number, bis: number, ziel: string): Block {
  const en = aufbauSprache() === "en";
  return {
    typ: "objekte",
    objekte: objekteFuerRahmen(von, bis, ziel).map(({ objekt: o, passung: p }) => ({
      titel: o.titel,
      ort: `${o.ort} · ${tx("Kaufnebenkosten", "Purchase costs")} ${KAUFNEBENKOSTEN[o.land].gesamt.toLocaleString(en ? "en-GB" : "de-DE", { minimumFractionDigits: 1 })} %`,
      text: en ? o.text[1] : o.text[0],
      daten: en ? o.daten[1] : o.daten[0],
      preis: en ? o.preis[1] : o.preis[0],
      konzepte: o.konzepte.map(konzeptText).join(" · "),
      passung: passungText(p),
      passt: p === "passt" || p === "teilweise",
      bild: o.bild,
    })),
  };
}
