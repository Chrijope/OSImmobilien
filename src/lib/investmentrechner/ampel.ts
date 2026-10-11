/**
 * Ampel für die wichtigsten Kennzahlen, seit dem 11.10.2026 (Abgleich mit dem
 * Excel-Tool von immocation).
 *
 * Grün ab der ersten Schwelle, Gelb ab der zweiten, darunter Rot. Die
 * Schwellen sind ein Vorschlag und stehen nur hier. Christian passt sie an;
 * später sollen sie in den Einstellungen für Admins änderbar sein, dann wird
 * diese Konstante zum Standardwert.
 *
 * Rein und nur lesend, gerechnet wird mit dem Ergebnis des Rechenkerns.
 */

import { eigenkapitalrendite, type InvestmentEingabe, type InvestmentErgebnis } from "./rechenkern";

export type Ampelfarbe = "gruen" | "gelb" | "rot";

export type Ampelkennzahl =
  | "bruttorendite"
  | "nettorendite"
  | "eigenkapitalrendite"
  | "cashflowOperativ"
  | "cashflowNachSteuern";

export interface Ampelschwelle {
  label: string;
  /** Prozentwerte als Faktor (0,045), Cashflows in Euro je Monat. */
  gruenAb: number;
  gelbAb: number;
  einheit: "prozent" | "euroMonat";
  erklaerung: string;
}

export const AMPEL_SCHWELLEN: Record<Ampelkennzahl, Ampelschwelle> = {
  bruttorendite: {
    label: "Bruttomietrendite",
    gruenAb: 0.045,
    gelbAb: 0.035,
    einheit: "prozent",
    erklaerung: "Jahreskaltmiete durch Kaufpreis.",
  },
  nettorendite: {
    label: "Nettomietrendite",
    gruenAb: 0.035,
    gelbAb: 0.025,
    einheit: "prozent",
    erklaerung: "Miete nach Leerstand minus nicht umlagefähige Kosten und Rücklage, durch Gesamtkosten.",
  },
  eigenkapitalrendite: {
    label: "Eigenkapitalrendite",
    gruenAb: 0.08,
    gelbAb: 0.04,
    einheit: "prozent",
    erklaerung: "Vermögensaufbau je Jahr durch Eigenkapital plus Zuzahlung vor Steuer im ersten Jahr.",
  },
  cashflowOperativ: {
    label: "Cashflow operativ",
    gruenAb: 0,
    gelbAb: -100,
    einheit: "euroMonat",
    erklaerung: "Miete minus Bewirtschaftung, Zins und Tilgung im ersten Jahr, je Monat, vor Steuer.",
  },
  cashflowNachSteuern: {
    label: "Cashflow nach Steuern",
    gruenAb: 0,
    gelbAb: -150,
    einheit: "euroMonat",
    erklaerung: "Cashflow operativ plus Steuerwirkung im ersten Jahr, je Monat.",
  },
};

/** Die Farbe zu einem Wert. `null` ohne Wert, etwa eine nicht bestimmbare Rendite. */
export function ampelfarbe(wert: number | null, schwelle: Pick<Ampelschwelle, "gruenAb" | "gelbAb">): Ampelfarbe | null {
  if (wert === null || !Number.isFinite(wert)) return null;
  // Ein halber Cent beziehungsweise ein Hunderttausendstel Spielraum gegen Rundungsrauschen an der Schwelle.
  if (wert >= schwelle.gruenAb - 1e-6) return "gruen";
  if (wert >= schwelle.gelbAb - 1e-6) return "gelb";
  return "rot";
}

export interface Ampelzeile {
  kennzahl: Ampelkennzahl;
  schwelle: Ampelschwelle;
  wert: number | null;
  farbe: Ampelfarbe | null;
}

/** Alle fünf Kennzahlen mit Wert und Farbe, in fester Reihenfolge. */
export function ampel(
  input: Pick<InvestmentEingabe, "equity">,
  result: Pick<InvestmentErgebnis, "grossYield" | "netYield" | "years" | "vermoegensaufbauMonat">,
  schwellen: Record<Ampelkennzahl, Ampelschwelle> = AMPEL_SCHWELLEN,
): Ampelzeile[] {
  const erstes = result.years[0];
  const werte: Record<Ampelkennzahl, number | null> = {
    bruttorendite: result.grossYield,
    nettorendite: result.netYield,
    eigenkapitalrendite: eigenkapitalrendite(input, result).rendite,
    cashflowOperativ: erstes ? erstes.cashflowBeforeTax / 12 : null,
    cashflowNachSteuern: erstes ? erstes.cashflowAfterTax / 12 : null,
  };
  return (Object.keys(schwellen) as Ampelkennzahl[]).map((kennzahl) => ({
    kennzahl,
    schwelle: schwellen[kennzahl],
    wert: werte[kennzahl],
    farbe: ampelfarbe(werte[kennzahl], schwellen[kennzahl]),
  }));
}
