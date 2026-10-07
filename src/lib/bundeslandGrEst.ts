/**
 * Grunderwerbsteuer nach Bundesland, abgeleitet aus der zentralen Tabelle.
 *
 * Die Sätze standen hier früher als eigene Liste und sind mit der Zeit von der
 * zentralen Tabelle in `grunderwerbsteuer.ts` abgewichen: Bremen lag hier noch
 * bei 5,0 statt 5,5 Prozent und Thüringen bei 6,5 statt 5,0 Prozent. Da diese
 * Datei von der Objektseite, den Kalkulationen und dem Exposé gelesen wird, hat das CRM an all diesen Stellen mit falschen Sätzen
 * gerechnet. Deshalb gibt es hier keine eigenen Zahlen mehr, sondern nur noch
 * eine andere Sicht auf dieselbe Quelle.
 */
import { BUNDESLAENDER } from "./grunderwerbsteuer";

/** Satz je Bundesland, Schlüssel ist der ausgeschriebene Name. */
export const GREST_BY_BUNDESLAND: Record<string, number> = Object.fromEntries(
  BUNDESLAENDER.map((land) => [land.name, land.grunderwerbsteuer]),
);

/** Rückfall, wenn kein Bundesland erkannt wurde. */
export const DEFAULT_GREST_P = 3.5;

/**
 * Bundesland aus der Postleitzahl ableiten.
 *
 * Bewusst eine Näherung über die ersten Stellen: Postleitzahlen folgen keiner
 * Landesgrenze. Wo ein Bereich sich auf zwei Länder verteilt, entscheidet die
 * dritte Stelle oder es gilt der überwiegende Teil. Wer es genau braucht,
 * wählt das Bundesland von Hand.
 */
export function detectBundesland(plz?: string, ort?: string, hint?: string): string | undefined {
  if (hint && GREST_BY_BUNDESLAND[hint] !== undefined) return hint;
  if (!plz) return undefined;
  const text = String(plz).trim();
  const zwei = parseInt(text.substring(0, 2), 10);
  if (!isFinite(zwei)) return undefined;
  const drei = parseInt(text.substring(0, 3), 10);

  // Osten: 03 ist Cottbus, 06 Halle, 07 Gera. Sie lagen früher alle unter
  // Sachsen und trugen damit den falschen Steuersatz.
  if (zwei === 1 || zwei === 2 || zwei === 4 || zwei === 8 || zwei === 9) return "Sachsen";
  if (zwei === 3) return "Brandenburg";
  if (zwei === 6) return "Sachsen-Anhalt";
  if (zwei === 7) return "Thüringen";

  if (zwei >= 10 && zwei <= 14) return "Berlin";
  if (zwei === 15 || zwei === 16) return "Brandenburg";
  if (zwei >= 17 && zwei <= 19) return "Mecklenburg-Vorpommern";
  if (zwei >= 20 && zwei <= 22) return "Hamburg";
  if (zwei >= 23 && zwei <= 25) return "Schleswig-Holstein";
  if (zwei === 28) return "Bremen";
  if (zwei === 26 || zwei === 27 || zwei === 29 || zwei === 30 || zwei === 31) return "Niedersachsen";
  if (zwei === 32 || zwei === 33) return "Nordrhein-Westfalen";
  if (zwei >= 34 && zwei <= 37) return "Hessen";
  if (zwei === 38 || zwei === 39) return zwei === 38 ? "Niedersachsen" : "Sachsen-Anhalt";
  if (zwei >= 40 && zwei <= 53) return "Nordrhein-Westfalen";
  // 54 Trier, 55 Mainz, 56 Koblenz gehören zu Rheinland-Pfalz, 57 bis 59
  // wieder zu Nordrhein-Westfalen.
  if (zwei >= 54 && zwei <= 56) return "Rheinland-Pfalz";
  if (zwei >= 57 && zwei <= 59) return "Nordrhein-Westfalen";
  if (zwei >= 60 && zwei <= 65) return "Hessen";
  if (zwei === 66) return "Saarland";
  if (zwei === 67) return "Rheinland-Pfalz";
  if (zwei >= 68 && zwei <= 79) return "Baden-Württemberg";
  if (zwei >= 80 && zwei <= 87) return "Bayern";
  if (zwei === 88) return "Baden-Württemberg";
  // Der Bereich 89 teilt sich: Ulm und der Alb-Donau-Kreis (890 und 891) sowie
  // Heidenheim und Umgebung (895 und 896) liegen in Baden-Württemberg, dazwischen
  // liegen Neu-Ulm, Günzburg und Dillingen in Bayern. Der Unterschied ist kein
  // Detail: 5,0 gegen 3,5 Prozent sind bei 300.000 Euro Kaufpreis 4.500 Euro.
  if (zwei === 89) {
    if (drei >= 892 && drei <= 894) return "Bayern";
    return "Baden-Württemberg";
  }
  if (zwei >= 90 && zwei <= 97) return "Bayern";
  if (zwei === 98 || zwei === 99) return "Thüringen";
  return undefined;
}

export function grEstForBundesland(bundesland?: string): number {
  if (!bundesland) return DEFAULT_GREST_P;
  return GREST_BY_BUNDESLAND[bundesland] ?? DEFAULT_GREST_P;
}
