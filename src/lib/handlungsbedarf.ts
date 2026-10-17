/**
 * Handlungsbedarf je Einheit aus Eigentümersicht (Christian, 17.10.2026):
 * Welche Wohnungen rechnen sich nicht und wo muss er etwas anpassen?
 *
 * Die Regeln arbeiten nur mit Fakten aus den Objektdaten (Ist gegen Soll,
 * Termine, Leerstand, Unterlagen), nicht mit gesetzten Renditegrenzen. Die
 * einzige Annahme ist das Zeitfenster: Termine in den nächsten sechs Monaten
 * gelten als „bald“.
 */

export type HinweisArt = "potenzial" | "termin" | "risiko" | "kosten" | "unterlagen";

export interface Hinweis {
  art: HinweisArt;
  text: string;
  /** Mehrertrag oder Kosten je Monat, wenn sich das beziffern lässt. */
  betragMonat?: number;
}

export interface HandlungsEingabe {
  verkauft: boolean;
  /** Ist-Kaltmiete des aktuellen Mieters; null ohne Mieter. */
  istMiete: number | null;
  mieterGekuendigt: boolean;
  sollMiete: number | null;
  /** Miete, mit der der Vertrieb rechnet. */
  mieteVertrieb: number | null;
  befristetBis: string;
  naechsteErhoehungAb: string;
  naechsteErhoehungMiete: number | null;
  /** Nicht umlagefähiges Hausgeld plus Rücklage je Monat. */
  eigentuemerlast: number | null;
  garageFrei: boolean;
  garantieMonat: number | null;
  fehlendeUnterlagen: number;
}

const MONATE_BALD = 6;
const eur = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const datum = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

function bald(iso: string, heute: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const grenze = new Date(`${heute}T00:00:00Z`);
  grenze.setUTCMonth(grenze.getUTCMonth() + MONATE_BALD);
  return iso.slice(0, 10) <= grenze.toISOString().slice(0, 10);
}

export function handlungsbedarf(e: HandlungsEingabe, heute: string): Hinweis[] {
  if (e.verkauft) return [];
  const h: Hinweis[] = [];
  if (e.istMiete === null) {
    const ziel = e.sollMiete ?? e.mieteVertrieb;
    h.push({ art: "potenzial", text: `Kein Mieter erfasst${ziel ? `: vermietet ${eur(ziel)} im Monat` : ""}`, betragMonat: ziel ?? undefined });
  } else {
    if (e.sollMiete !== null && e.istMiete < e.sollMiete - 0.5) {
      h.push({ art: "potenzial", text: `Miete ${eur(e.istMiete)} unter Soll ${eur(e.sollMiete)}`, betragMonat: e.sollMiete - e.istMiete });
    }
    if (e.naechsteErhoehungAb && bald(e.naechsteErhoehungAb, heute)) {
      const plus = e.naechsteErhoehungMiete !== null ? e.naechsteErhoehungMiete - e.istMiete : undefined;
      h.push({ art: "termin", text: `Mieterhöhung ab ${datum(e.naechsteErhoehungAb)} möglich${e.naechsteErhoehungMiete !== null ? ` auf ${eur(e.naechsteErhoehungMiete)}` : ""}`, betragMonat: plus && plus > 0 ? plus : undefined });
    }
    if (e.mieterGekuendigt) h.push({ art: "risiko", text: "Mietverhältnis gekündigt: Nachvermietung planen" });
    if (e.befristetBis && bald(e.befristetBis, heute)) h.push({ art: "termin", text: `Befristung endet ${datum(e.befristetBis)}` });
  }
  const miete = e.istMiete ?? e.mieteVertrieb;
  if (e.eigentuemerlast !== null && miete !== null && e.eigentuemerlast >= miete && miete > 0) {
    h.push({ art: "risiko", text: `Eigentümerlast ${eur(e.eigentuemerlast)} deckt die Miete nicht`, betragMonat: e.eigentuemerlast - miete });
  }
  if (e.garageFrei) h.push({ art: "potenzial", text: "Garage oder Stellplatz frei: vermieten" });
  if (e.garantieMonat) h.push({ art: "kosten", text: `Mietgarantie kostet ${eur(e.garantieMonat)} im Monat`, betragMonat: e.garantieMonat });
  if (e.fehlendeUnterlagen > 0) h.push({ art: "unterlagen", text: `${e.fehlendeUnterlagen} Unterlagen fehlen` });
  return h;
}

/** Bezifferter Mehrertrag je Monat aus allen Hinweisen der Art „Potenzial“ und „Termin“. */
export function potenzialMonat(hinweise: Hinweis[]): number {
  return hinweise.filter((h) => h.art === "potenzial" || h.art === "termin").reduce((s, h) => s + (h.betragMonat ?? 0), 0);
}
