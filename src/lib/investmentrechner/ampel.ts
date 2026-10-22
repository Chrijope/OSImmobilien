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

import { eigenkapitalrendite, monateErstesJahr, type InvestmentEingabe, type InvestmentErgebnis } from "./rechenkern";

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
    cashflowOperativ: erstes ? erstes.cashflowBeforeTax / monateErstesJahr(result) : null,
    cashflowNachSteuern: erstes ? erstes.cashflowAfterTax / monateErstesJahr(result) : null,
  };
  return (Object.keys(schwellen) as Ampelkennzahl[]).map((kennzahl) => ({
    kennzahl,
    schwelle: schwellen[kennzahl],
    wert: werte[kennzahl],
    farbe: ampelfarbe(werte[kennzahl], schwellen[kennzahl]),
  }));
}

/** Schlüssel in der Admin-Konfiguration `app_config`, seit dem 11.10.2026. */
export const AMPEL_CONFIG_SCHLUESSEL = "investmentrechner_ampel_schwellen";

/** Nur admin und inhaber ändern die Schwellen; die Datenbank (RLS über is_admin_role) sieht es genauso. */
export function darfAmpelSchwellenBearbeiten(rolle: string | null | undefined): boolean {
  return rolle === "admin" || rolle === "inhaber";
}

/** Gespeicherte Werte ({ kennzahl: { gruenAb, gelbAb } }) über die Standardwerte legen. Unsinn fällt weg. */
export function schwellenAusConfig(roh: unknown): Record<Ampelkennzahl, Ampelschwelle> {
  const daten = roh && typeof roh === "object" ? (roh as Record<string, unknown>) : {};
  return Object.fromEntries(
    (Object.keys(AMPEL_SCHWELLEN) as Ampelkennzahl[]).map((kennzahl) => {
      const standard = AMPEL_SCHWELLEN[kennzahl];
      const eintrag = daten[kennzahl] && typeof daten[kennzahl] === "object" ? (daten[kennzahl] as Record<string, unknown>) : {};
      const zahl = (wert: unknown, ersatz: number) => (typeof wert === "number" && Number.isFinite(wert) ? wert : ersatz);
      const gruenAb = zahl(eintrag.gruenAb, standard.gruenAb);
      const gelbAb = zahl(eintrag.gelbAb, standard.gelbAb);
      // Ein gespeichertes Paar, das nicht zusammenpasst, gilt nicht: lieber der Standard als eine falsche Farbe.
      return [kennzahl, gruenAb >= gelbAb ? { ...standard, gruenAb, gelbAb } : standard];
    }),
  ) as Record<Ampelkennzahl, Ampelschwelle>;
}

/** Nur die Zahlen, so wie sie in `app_config` stehen. */
export function schwellenFuerConfig(schwellen: Record<Ampelkennzahl, Ampelschwelle>): Record<Ampelkennzahl, { gruenAb: number; gelbAb: number }> {
  return Object.fromEntries(
    (Object.keys(schwellen) as Ampelkennzahl[]).map((k) => [k, { gruenAb: schwellen[k].gruenAb, gelbAb: schwellen[k].gelbAb }]),
  ) as Record<Ampelkennzahl, { gruenAb: number; gelbAb: number }>;
}

/** Fehler je Kennzahl, leer heißt speicherbar. Grün muss mindestens so streng sein wie Gelb. */
export function pruefeSchwellen(schwellen: Record<Ampelkennzahl, Pick<Ampelschwelle, "gruenAb" | "gelbAb" | "label">>): string[] {
  return (Object.keys(schwellen) as Ampelkennzahl[]).flatMap((k) => {
    const s = schwellen[k];
    if (!Number.isFinite(s.gruenAb) || !Number.isFinite(s.gelbAb)) return [`${s.label}: bitte beide Werte eintragen.`];
    if (s.gruenAb < s.gelbAb) return [`${s.label}: „Grün ab“ muss größer oder gleich „Gelb ab“ sein.`];
    return [];
  });
}
