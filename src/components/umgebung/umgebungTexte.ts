import type { ZweiSprachen } from "@/lib/seitenSprache";
import type { Sprache } from "../../../supabase/functions/_shared/kunden-sprache.ts";
import { HERKUNFT_HINWEIS_LEER } from "@/lib/standortanalyse";
import { MAKROLAGE_LEER, MAKROLAGE_NICHT_GEMESSEN } from "@/lib/makrolage";
import { entfernungText } from "@/lib/umgebung";
import { genauigkeitHinweis, nadelBeschriftung, UMGEBUNG_NICHT_GEMESSEN, type Umgebung, type UmgebungKategorieId } from "@/lib/umgebungspunkte";
import { herkunftHinweisEn, ortsartText } from "@/lib/exposeInhaltTexte";

/**
 * Texte von Karte und Lagekasten (`Umgebungsansicht`, `Lagekasten`,
 * `PunkteKarte`) in Deutsch und Englisch. Kundensprache, Etappe 3: Exposé und
 * Kundenlink zeigen die Mikrolage in der Sprache des Kunden
 * (`Mikrolage` reicht sie durch), das CRM ruft ohne Sprache und bleibt deutsch.
 *
 * Die deutsche Hälfte nimmt die bestehenden Konstanten aus den Bibliotheken,
 * damit Karte und PDF wortgleich bleiben. Namen der Orte stammen aus
 * OpenStreetMap und bleiben, wie sie sind; nur ihre Art („Supermarkt“) wird
 * über `ortsartText` übersetzt.
 */
export interface UmgebungTexte {
  karteFolgt: string;
  inOpenStreetMap: string;
  druckhinweis: string;
  mikrolage: string;
  makrolage: string;
  lageDerImmobilie: string;
  gehminutenSatz: string;
  mikroLeer: string;
  makroLeer: string;
  makroNichtGemessen: string;
  nichtGemessen: string;
  genauigkeit: (g: Umgebung["genauigkeit"]) => string;
  nadel: (umgebung: Umgebung | undefined, titel: string) => string;
  legende: string;
  messpunkt: string;
  objekt: string;
  karteVon: (titel: string) => string;
  abMesspunkt: string;
  zuFuss: (minuten: number) => string;
  entfernung: (meter: number) => string;
  kategorien: Record<UmgebungKategorieId, string>;
  listen: Record<string, string>;
}

export const UMGEBUNG_TEXTE: ZweiSprachen<UmgebungTexte> = {
  de: {
    karteFolgt: "Die Karte zur Lage folgt.",
    inOpenStreetMap: "In OpenStreetMap ansehen",
    druckhinweis: "Die Karte zur Lage findest du in der Online-Ansicht dieses Exposés.",
    mikrolage: "Mikrolage",
    makrolage: "Makrolage",
    lageDerImmobilie: "Lage der Immobilie",
    gehminutenSatz: "Gehminuten überschlägig mit 80 Metern je Minute.",
    mikroLeer: HERKUNFT_HINWEIS_LEER,
    makroLeer: MAKROLAGE_LEER,
    makroNichtGemessen: MAKROLAGE_NICHT_GEMESSEN,
    nichtGemessen: UMGEBUNG_NICHT_GEMESSEN,
    genauigkeit: (g) => genauigkeitHinweis(g),
    nadel: (umgebung, titel) => nadelBeschriftung(umgebung, titel),
    legende: "Legende der Karte",
    messpunkt: "Messpunkt",
    objekt: "Objekt",
    karteVon: (titel) => `Karte der Umgebung von ${titel}`,
    abMesspunkt: " ab dem Messpunkt",
    zuFuss: (minuten) => `${minuten} min zu Fuß`,
    entfernung: (meter) => entfernungText(meter),
    kategorien: {
      einkaufen: "Einkaufen",
      freizeit: "Freizeit",
      gruen: "Parks und Grün",
      verkehr: "Bus und Bahn",
      einrichtungen: "Öffentliche Einrichtungen",
      hochschulen: "Hochschulen",
      kliniken: "Krankenhäuser",
    },
    listen: {
      einkaufen: "Einkaufen",
      freizeit: "Freizeit",
      gruen: "Parks und Grün",
      verkehr: "Bus und Bahn",
      kitas: "Kitas",
      schulen: "Schulen",
      aerzte: "Ärzte",
      apotheken: "Apotheken",
      behoerden: "Behörden und Ämter",
      hochschulen: "Hochschulen",
      kliniken: "Krankenhäuser",
    },
  },
  en: {
    karteFolgt: "The location map will follow.",
    inOpenStreetMap: "View in OpenStreetMap",
    druckhinweis: "You can find the location map in the online view of this exposé.",
    mikrolage: "Immediate surroundings",
    makrolage: "Wider area",
    lageDerImmobilie: "Location of the property",
    gehminutenSatz: "Walking minutes estimated at 80 metres per minute.",
    mikroLeer: "No facilities are recorded in OpenStreetMap for this address. That does not mean there are none.",
    makroLeer: "No universities or hospitals are recorded in OpenStreetMap in the area. That does not mean there are none.",
    makroNichtGemessen: "Universities and hospitals in the region will be added with the next measurement of the surroundings.",
    nichtGemessen: "The analysis of the surroundings is not available yet. Once it is, you will find here what is nearby: shopping, leisure, parks, buses and trains, nurseries, schools, pharmacies and public offices.",
    genauigkeit: (g) =>
      g === "ort"
        ? "Measured from the town centre, not from the front door. The distances show what the town offers, not the route from the building."
        : g === "plz"
          ? "Measured from the centre of the postcode area, not from the front door. The distances show what the area offers, not the route from the building."
          : g === "strasse"
            ? "Measured from the street, as the house number is not recorded in OpenStreetMap. The distances are therefore approximate."
            : "",
    nadel: (umgebung, titel) =>
      umgebung?.genauigkeit === "ort"
        ? "Town centre, measured from here"
        : umgebung?.genauigkeit === "plz"
          ? "Centre of the postcode area, measured from here"
          : titel,
    legende: "Map legend",
    messpunkt: "Measuring point",
    objekt: "Property",
    karteVon: (titel) => `Map of the surroundings of ${titel}`,
    abMesspunkt: " from the measuring point",
    zuFuss: (minuten) => `${minuten} min walk`,
    entfernung: (meter) =>
      meter < 1000 ? `${Math.round(meter / 50) * 50} m` : `${(meter / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} km`,
    kategorien: {
      einkaufen: "Shopping",
      freizeit: "Leisure",
      gruen: "Parks and green spaces",
      verkehr: "Buses and trains",
      einrichtungen: "Public facilities",
      hochschulen: "Universities",
      kliniken: "Hospitals",
    },
    listen: {
      einkaufen: "Shopping",
      freizeit: "Leisure",
      gruen: "Parks and green spaces",
      verkehr: "Buses and trains",
      kitas: "Nurseries",
      schulen: "Schools",
      aerzte: "Doctors",
      apotheken: "Pharmacies",
      behoerden: "Public offices",
      hochschulen: "Universities",
      kliniken: "Hospitals",
    },
  },
};

export function umgebungTexte(sprache: Sprache | undefined | null): UmgebungTexte {
  return UMGEBUNG_TEXTE[sprache === "en" ? "en" : "de"];
}

/**
 * Die gemessene Umgebung für die Anzeige in der Sprache der Seite:
 * Kategorie- und Listentitel, Art der Orte und Herkunftssatz. Auf Deutsch
 * kommt sie unverändert zurück. Gespeichert wird nichts.
 */
export function umgebungInSprache(umgebung: Umgebung | undefined, sprache: Sprache | undefined | null): Umgebung | undefined {
  if (!umgebung || sprache !== "en") return umgebung;
  const t = UMGEBUNG_TEXTE.en;
  return {
    ...umgebung,
    kategorien: umgebung.kategorien.map((k) => ({
      ...k,
      titel: t.kategorien[k.id] ?? k.titel,
      listen: k.listen.map((l) => ({
        ...l,
        titel: t.listen[l.id] ?? l.titel,
        punkte: l.punkte.map((p) => ({ ...p, art: ortsartText(p.art, "en") })),
      })),
    })),
    hinweis: herkunftHinweisEn(umgebung.leer, umgebung.genauigkeit),
  };
}
