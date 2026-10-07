/**
 * Zahlenformate des Investmentrechners, eins zu eins aus der Web-App.
 *
 * Seit dem 25.09.2026 mit Sprache (Plan Kundensprache, Etappe 5): Der Druck
 * der Berechnung erscheint für englischsprachige Kunden auf Englisch, dann
 * britisch nach `sprachFormat.ts` („€1,234“, „4.32%“). Ohne Angabe bleibt es
 * Deutsch, die Rechneransicht ändert sich also nicht.
 */
import { SPRACH_LOCALE, type FormatSprache } from "../sprachFormat";

type Formate = {
  euroGanz: Intl.NumberFormat;
  euroCent: Intl.NumberFormat;
  prozent: Intl.NumberFormat;
  prozentEineStelle: Intl.NumberFormat;
};

function formateFuer(locale: string): Formate {
  return {
    euroGanz: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
    euroCent: new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    prozent: new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    prozentEineStelle: new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  };
}

const FORMATE: Record<FormatSprache, Formate> = {
  de: formateFuer(SPRACH_LOCALE.de),
  en: formateFuer(SPRACH_LOCALE.en),
};

const formate = (sprache: FormatSprache | undefined) => FORMATE[sprache === "en" ? "en" : "de"];

/** Euro ohne Nachkommastellen (Original „W"). */
export function formatEuro(wert: number, sprache: FormatSprache = "de"): string {
  return formate(sprache).euroGanz.format(Number.isFinite(wert) ? wert : 0);
}

/** Euro mit zwei Nachkommastellen (Original „G"). */
export function formatEuroCent(wert: number, sprache: FormatSprache = "de"): string {
  return formate(sprache).euroCent.format(Number.isFinite(wert) ? wert : 0);
}

/** Prozent mit zwei Nachkommastellen aus einem Faktor (Original „K"). */
export function formatProzent(wert: number, sprache: FormatSprache = "de"): string {
  return formate(sprache).prozent.format(Number.isFinite(wert) ? wert : 0);
}

/** Prozent mit einer Nachkommastelle aus einem Faktor, für die Eigenkapitalrendite (30.09.2026). */
export function formatProzentEineStelle(wert: number, sprache: FormatSprache = "de"): string {
  return formate(sprache).prozentEineStelle.format(Number.isFinite(wert) ? wert : 0);
}

/** Eine schlichte Zahl, etwa Fläche oder Zimmer, höchstens `stellen` Nachkommastellen. */
export function formatZahl(wert: number, sprache: FormatSprache = "de", stellen = 2): string {
  return (Number.isFinite(wert) ? wert : 0).toLocaleString(SPRACH_LOCALE[sprache === "en" ? "en" : "de"], {
    maximumFractionDigits: stellen,
  });
}

/** Energieeffizienzklassen der Skala, von A+ bis H. */
export const ENERGIEKLASSEN = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"] as const;
