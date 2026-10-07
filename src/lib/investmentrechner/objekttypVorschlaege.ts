/**
 * Die drei Objekttypen, die im Rechner zur Auswahl stehen.
 *
 * Die Bezeichnungen werden bewusst NICHT hier neu getippt, sondern aus den
 * Assetklassen des Steuerrechners übernommen. Dort stehen dieselben drei Arten
 * schon mit ihren steuerlichen Kennzahlen. Zwei Listen mit denselben Namen
 * wären zwei Wahrheiten, und sie liefen mit der Zeit auseinander.
 *
 * Das Feld „Objekttyp" im Rechner bleibt ein freier Text. Die Liste ist nur ein
 * Vorschlag für die drei häufigen Fälle, jede andere Angabe ist weiterhin
 * möglich und bleibt erhalten.
 */
import { ASSETKLASSEN } from "@/lib/steuerRechner";

export const OBJEKTTYP_VORSCHLAEGE: readonly string[] = [
  ASSETKLASSEN.wg.titel,
  ASSETKLASSEN.bestand.titel,
  ASSETKLASSEN.neubau.titel,
];

/** Passt der gespeicherte Wert zu einem der Vorschläge? */
export function istVorschlag(wert: string): boolean {
  return OBJEKTTYP_VORSCHLAEGE.includes(wert);
}
