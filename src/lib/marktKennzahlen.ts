/**
 * Kennzahlen, die einen Standort einordnen statt ihn nur zu beschreiben.
 *
 * Eine Bruttorendite von 4,1 Prozent sagt für sich genommen wenig. Ob das viel
 * ist, hängt vom Vergleich ab: gegen das eigene Bundesland, gegen Deutschland,
 * gegen alle anderen Standorte in der Liste. Genau diese Einordnung fehlte
 * bisher, und ohne sie ist eine Zahl im Kundengespräch nicht zu gebrauchen.
 */

import { bruttomietrendite, type Standort } from "@/data/marktanalyseSeed";

/**
 * Kaufpreis-Miete-Faktor: das Wievielfache der Jahreskaltmiete kostet die
 * Wohnung? Die geläufigste Faustzahl im Ankauf. Unter 25 gilt als günstig,
 * über 35 als teuer.
 */
export function kaufpreisMieteFaktor(s: Standort): number {
  const jahresmiete = s.miete_qm_eur * 12;
  return jahresmiete > 0 ? s.kaufpreis_qm_wohnung_eur / jahresmiete : 0;
}

export function faktorEinordnung(faktor: number): { text: string; ton: "gut" | "neutral" | "teuer" } {
  if (faktor <= 0) return { text: "keine Angabe", ton: "neutral" };
  if (faktor < 25) return { text: "günstig bewertet", ton: "gut" };
  if (faktor <= 35) return { text: "marktüblich", ton: "neutral" };
  return { text: "hoch bewertet", ton: "teuer" };
}

/** Kennzahlen, für die ein Vergleich sinnvoll ist. */
export const VERGLEICHSFELDER = [
  { key: "rendite", label: "Bruttomietrendite", einheit: "%", hoeherIstBesser: true },
  { key: "kaufpreis_qm_wohnung_eur", label: "Kaufpreis Wohnung", einheit: "€/m²", hoeherIstBesser: false },
  { key: "miete_qm_eur", label: "Kaltmiete", einheit: "€/m²", hoeherIstBesser: true },
  { key: "faktor", label: "Kaufpreis-Miete-Faktor", einheit: "×", hoeherIstBesser: false },
  { key: "kaufkraftindex", label: "Kaufkraftindex", einheit: "", hoeherIstBesser: true },
  { key: "arbeitslosenquote_pct", label: "Arbeitslosenquote", einheit: "%", hoeherIstBesser: false },
  { key: "einwohner_trend_5j_pct", label: "Bevölkerung 5 Jahre", einheit: "%", hoeherIstBesser: true },
  { key: "leerstand_pct", label: "Leerstand", einheit: "%", hoeherIstBesser: false },
] as const;

export type VergleichsFeld = (typeof VERGLEICHSFELDER)[number]["key"];

export function feldwert(s: Standort, key: VergleichsFeld): number {
  if (key === "rendite") return bruttomietrendite(s);
  if (key === "faktor") return kaufpreisMieteFaktor(s);
  return Number((s as any)[key]) || 0;
}

function median(werte: number[]): number {
  if (werte.length === 0) return 0;
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 0
    ? (sortiert[mitte - 1] + sortiert[mitte]) / 2
    : sortiert[mitte];
}

export interface Einordnung {
  wert: number;
  medianBundesland: number;
  medianBund: number;
  /**
   * Rang in Prozent unter allen Standorten, 0 bis 100. Immer so gedreht, dass
   * 100 die beste Position ist, auch bei Kennzahlen, bei denen weniger besser
   * ist.
   */
  perzentil: number;
  /** Abweichung vom Bundesmedian in Prozent. */
  abweichungBundPct: number;
  hoeherIstBesser: boolean;
}

/**
 * Ordnet einen Standort in einer Kennzahl ein.
 *
 * @param alle Grundgesamtheit, üblicherweise sämtliche Standorte
 */
export function einordnen(
  s: Standort,
  key: VergleichsFeld,
  alle: Standort[],
): Einordnung {
  const def = VERGLEICHSFELDER.find((f) => f.key === key)!;
  const wert = feldwert(s, key);
  const alleWerte = alle.map((x) => feldwert(x, key)).filter((v) => Number.isFinite(v) && v !== 0);
  const imBundesland = alle
    .filter((x) => x.bundesland === s.bundesland)
    .map((x) => feldwert(x, key))
    .filter((v) => Number.isFinite(v) && v !== 0);

  const medianBund = median(alleWerte);
  const medianBundesland = median(imBundesland);

  const schlechter = alleWerte.filter((v) => (def.hoeherIstBesser ? v < wert : v > wert)).length;
  const perzentil = alleWerte.length > 1 ? (schlechter / (alleWerte.length - 1)) * 100 : 50;

  return {
    wert,
    medianBundesland,
    medianBund,
    perzentil: Math.max(0, Math.min(100, perzentil)),
    abweichungBundPct: medianBund > 0 ? ((wert - medianBund) / medianBund) * 100 : 0,
    hoeherIstBesser: def.hoeherIstBesser,
  };
}

/** "Besser als 78 % aller Standorte" bzw. das Gegenteil. */
export function perzentilText(perzentil: number): string {
  const p = Math.round(perzentil);
  if (p >= 90) return `Spitzenwert, besser als ${p} % aller Standorte`;
  if (p >= 60) return `Über dem Durchschnitt, besser als ${p} % aller Standorte`;
  if (p >= 40) return `Im Mittelfeld, besser als ${p} % aller Standorte`;
  if (p >= 10) return `Unter dem Durchschnitt, besser als ${p} % aller Standorte`;
  return `Schwacher Wert, nur ${p} % aller Standorte liegen darunter`;
}

/**
 * Normiert einen Wert auf 0 bis 100 für Netzdiagramme, gemessen an der
 * Spannweite aller Standorte. Bei Kennzahlen, bei denen weniger besser ist,
 * wird gedreht.
 */
export function normiert(s: Standort, key: VergleichsFeld, alle: Standort[]): number {
  const def = VERGLEICHSFELDER.find((f) => f.key === key)!;
  const werte = alle.map((x) => feldwert(x, key)).filter((v) => Number.isFinite(v) && v !== 0);
  if (werte.length === 0) return 50;
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  if (max === min) return 50;
  const wert = feldwert(s, key);
  const anteil = (wert - min) / (max - min);
  return Math.round((def.hoeherIstBesser ? anteil : 1 - anteil) * 100);
}
