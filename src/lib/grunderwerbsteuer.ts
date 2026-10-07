/**
 * Grunderwerbsteuer und Kaufnebenkosten je Bundesland.
 *
 * Die Sätze lagen bisher nur im AfA-Rechner. Da sie auch das Analysetool
 * braucht, stehen sie hier an einer Stelle. Wer sie ändert, ändert sie überall.
 *
 * Stand Juli 2026. Bremen liegt seit dem 1. Juli 2025 bei 5,5 Prozent,
 * Thüringen seit dem 1. Januar 2024 bei 5,0 Prozent.
 */

export interface Bundesland {
  id: string;
  name: string;
  /** Grunderwerbsteuer in Prozent. */
  grunderwerbsteuer: number;
}

/** Notar und Grundbuch, Richtwert in Prozent vom Kaufpreis. */
export const NOTAR_GRUNDBUCH_PROZENT = 2;

export const BUNDESLAENDER: Bundesland[] = [
  { id: "bw", name: "Baden-Württemberg", grunderwerbsteuer: 5.0 },
  { id: "by", name: "Bayern", grunderwerbsteuer: 3.5 },
  { id: "be", name: "Berlin", grunderwerbsteuer: 6.0 },
  { id: "bb", name: "Brandenburg", grunderwerbsteuer: 6.5 },
  { id: "hb", name: "Bremen", grunderwerbsteuer: 5.5 },
  { id: "hh", name: "Hamburg", grunderwerbsteuer: 5.5 },
  { id: "he", name: "Hessen", grunderwerbsteuer: 6.0 },
  { id: "mv", name: "Mecklenburg-Vorpommern", grunderwerbsteuer: 6.0 },
  { id: "ni", name: "Niedersachsen", grunderwerbsteuer: 5.0 },
  { id: "nw", name: "Nordrhein-Westfalen", grunderwerbsteuer: 6.5 },
  { id: "rp", name: "Rheinland-Pfalz", grunderwerbsteuer: 5.0 },
  { id: "sl", name: "Saarland", grunderwerbsteuer: 6.5 },
  { id: "sn", name: "Sachsen", grunderwerbsteuer: 5.5 },
  { id: "st", name: "Sachsen-Anhalt", grunderwerbsteuer: 5.0 },
  { id: "sh", name: "Schleswig-Holstein", grunderwerbsteuer: 6.5 },
  { id: "th", name: "Thüringen", grunderwerbsteuer: 5.0 },
];

export function bundeslandById(id?: string | null): Bundesland | undefined {
  return id ? BUNDESLAENDER.find((b) => b.id === id) : undefined;
}

/** Niedrigster und höchster Satz, für Formulierungen wie "zwischen x und y Prozent". */
export function grunderwerbsteuerSpanne(): { min: number; max: number } {
  const werte = BUNDESLAENDER.map((b) => b.grunderwerbsteuer);
  return { min: Math.min(...werte), max: Math.max(...werte) };
}

/**
 * Kaufnebenkosten in Prozent: Grunderwerbsteuer plus Notar und Grundbuch.
 * Ohne Bundesland wird der Mittelwert genommen.
 */
export function kaufnebenkostenProzent(bundeslandId?: string | null): number {
  const bl = bundeslandById(bundeslandId);
  if (bl) return bl.grunderwerbsteuer + NOTAR_GRUNDBUCH_PROZENT;
  const schnitt =
    BUNDESLAENDER.reduce((s, b) => s + b.grunderwerbsteuer, 0) / BUNDESLAENDER.length;
  return Math.round((schnitt + NOTAR_GRUNDBUCH_PROZENT) * 10) / 10;
}

/**
 * Der hoechste Gesamtsatz an Kaufnebenkosten in Deutschland: 6,5 Prozent
 * Grunderwerbsteuer plus Notar und Grundbuch, zusammen 8,5 Prozent.
 *
 * Wofuer der Wert da ist: Die Grunderwerbsteuer richtet sich nach der LAGE der
 * Immobilie, nicht nach dem Wohnsitz des Kaeufers. Wer in Hamburg wohnt und in
 * Magdeburg kauft, zahlt den Satz von Sachsen-Anhalt. Solange gar kein Objekt
 * feststeht, laesst sich der Satz deshalb nicht bestimmen, und ein zu
 * niedriger Ansatz waere der schlechtere Fehler: Die Kaufnebenkosten sind der
 * Eigenkapitaleinsatz des Kaeufers. Wer mit einer zu kleinen Zahl rechnet,
 * verspricht einen zu kleinen Einsatz.
 *
 * Deshalb rechnet der Steuerrechner mit diesem Hoechstsatz und schreibt es auf
 * die Seite. In jedem anderen Bundesland faellt der Einsatz niedriger aus.
 */
export const KAUFNEBENKOSTEN_HOECHSTSATZ =
  grunderwerbsteuerSpanne().max + NOTAR_GRUNDBUCH_PROZENT;
