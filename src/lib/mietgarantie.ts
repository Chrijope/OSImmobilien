/**
 * Mietdifferenz-Garantie und Garagen je Einheit, seit dem 17.10.2026.
 *
 * Bei manchen Objekten garantieren wir dem Käufer eine Zielmiete je m²
 * (Barfußstraße 13,50 €, Hauffstraße 13,00 €). Die Differenz zur Ist-Miete
 * zahlen wir für eine feste Laufzeit. Die Rechnung folgt der Entscheidung vom
 * 15.10.2026 („Rechnung B“, Liste „Mietdifferenz Hauffstraße Abgleich“):
 *
 *   Ist-Kaltmiete + Garage in der Rechnung + Garantie = Ziel €/m² × Wohnfläche
 *
 * - Eine zugeordnete Garage zählt mit dem Anrechnungsbetrag (100 €), egal ob
 *   und wie hoch sie vermietet ist. Sie senkt damit die Garantie.
 * - Die Garage subventionieren wir nur im ersten Jahr auf den
 *   Anrechnungsbetrag (Anrechnung − Ist-Miete der Garage).
 * - Ein Stellplatz zählt nur mit seiner Ist-Miete und nur, wenn er vermietet
 *   ist, ohne Subvention.
 * - Liegt die Ist-Miete schon über dem Ziel, ist die Garantie 0.
 *
 * Mieterhöhungen während der Laufzeit rechnet diese Datei bewusst nicht ein;
 * die Summe über die Laufzeit gilt „ohne Mieterhöhungen“ und ist damit die
 * Obergrenze. Die genaue Rechnung mit Erhöhungen steht in der Excel-Liste.
 *
 * Die Werte liegen in den Zusatzfeldern (`objekte.meta.mietgarantie`,
 * `wohnungen.meta.garage`), die der Investagon-Abgleich stehen lässt.
 */
import { cacheGet } from "./dataCache";

export interface ObjektMietgarantie {
  /** Zielmiete in € je m² Wohnfläche. */
  zielQm: number;
  /** Mit diesem Betrag zählt eine zugeordnete Garage zur Ist-Miete. */
  garageAnrechnung: number;
  /** Laufzeit der Mietdifferenz-Garantie in Monaten. */
  laufzeitMonate: number;
  /** So viele Monate subventionieren wir eine Garage auf den Anrechnungsbetrag. */
  garagenSubventionMonate: number;
}

export type GaragenArt = "garage" | "stellplatz";
export type GaragenStatus = "eigener_mieter" | "extern" | "frei";

export interface EinheitGarage {
  /** Nummer laut Teilungserklärung, etwa „G22“ oder „SP13“. */
  nr: string;
  art: GaragenArt;
  status: GaragenStatus;
  /** Ist-Miete der Garage oder des Stellplatzes je Monat, leer wenn unbekannt. */
  istMiete: number | null;
}

export const GARAGEN_STATUS_TEXT: Record<GaragenStatus, string> = {
  eigener_mieter: "an Wohnungsmieter",
  extern: "an Externen",
  frei: "frei",
};

const zahl = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Die Regel aus `meta.mietgarantie`, oder null, wenn das Objekt keine hat. */
export function mietgarantieAusMeta(meta: unknown): ObjektMietgarantie | null {
  const m = (meta as { mietgarantie?: Record<string, unknown> } | null)?.mietgarantie;
  const zielQm = zahl(m?.zielQm);
  if (!m || !zielQm || zielQm <= 0) return null;
  return {
    zielQm,
    garageAnrechnung: zahl(m.garageAnrechnung) ?? 0,
    laufzeitMonate: zahl(m.laufzeitMonate) ?? 36,
    garagenSubventionMonate: zahl(m.garagenSubventionMonate) ?? 12,
  };
}

export function garageAusMeta(meta: unknown): EinheitGarage | null {
  const g = (meta as { garage?: Record<string, unknown> } | null)?.garage;
  if (!g || typeof g !== "object") return null;
  const art: GaragenArt = g.art === "stellplatz" ? "stellplatz" : "garage";
  const status: GaragenStatus = g.status === "eigener_mieter" || g.status === "extern" ? g.status : "frei";
  return { nr: typeof g.nr === "string" ? g.nr : "", art, status, istMiete: zahl(g.istMiete) };
}

/** Regel eines Objekts aus dem Zwischenspeicher. */
export function mietgarantieFuerObjekt(objektId: string): ObjektMietgarantie | null {
  const zeile = cacheGet("objekte").find((o: { id: string }) => o.id === objektId);
  return mietgarantieAusMeta(zeile?.meta);
}

/** Garage einer Einheit aus dem Zwischenspeicher. */
export function garageFuerEinheit(wohnungId: string): EinheitGarage | null {
  const zeile = cacheGet("wohnungen").find((w: { id: string }) => w.id === wohnungId);
  return garageAusMeta(zeile?.meta);
}

export interface GarantieErgebnis {
  zielMiete: number;
  /** Was die Garage in der Rechnung zur Ist-Miete beiträgt. */
  garageInRechnung: number;
  garantieMonat: number;
  garagenSubventionMonat: number;
  /** Garantie über die Laufzeit plus Garagen-Subvention, ohne Mieterhöhungen. */
  summeLaufzeit: number;
}

const cent = (n: number) => Math.round(n * 100) / 100;

export function berechneGarantie(
  regel: ObjektMietgarantie,
  flaeche: number,
  istKaltmiete: number,
  garage: EinheitGarage | null,
): GarantieErgebnis {
  const zielMiete = cent(regel.zielQm * flaeche);
  const garageIst = garage?.istMiete ?? 0;
  const garageInRechnung = !garage ? 0
    : garage.art === "garage" ? regel.garageAnrechnung
    : garage.status === "frei" ? 0 : garageIst;
  const garantieMonat = cent(Math.max(0, zielMiete - istKaltmiete - garageInRechnung));
  const garagenSubventionMonat = garage?.art === "garage" ? cent(Math.max(0, regel.garageAnrechnung - garageIst)) : 0;
  return {
    zielMiete, garageInRechnung, garantieMonat, garagenSubventionMonat,
    summeLaufzeit: cent(garantieMonat * regel.laufzeitMonate + garagenSubventionMonat * regel.garagenSubventionMonate),
  };
}
