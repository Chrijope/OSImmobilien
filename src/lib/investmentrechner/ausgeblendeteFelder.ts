/**
 * Felder ohne Wirkung auf Analyse und PDF, ausgeblendet am 08.11.2026
 * (Christian, Prüfung gegen die Einhauser-Rechnung).
 *
 * Analyse und PDF rechnen im Aufbau der Einhauser-Rechnung
 * (kundenObjektvergleich.ts): Darlehen 100 % des Kaufpreises, Annuität,
 * Miete linear bis zur Zielmiete, lineare AfA, keine weiteren Darlehen. Die
 * Felder unten sahen in der Maske so aus, als wirkten sie, taten es dort
 * aber nicht. Sie werden deshalb nicht angezeigt und gehen auch nicht mehr
 * in den Rechenkern.
 *
 * Code und gespeicherte Werte bleiben: Die Eingabe behält, was gespeichert
 * ist, nur die Rechnung bekommt die neutralen Werte. Zurück geht es mit
 * `UNWIRKSAME_FELDER_ZEIGEN = true`.
 */
import { standardEingabe, type InvestmentEingabe } from "./rechenkern";

export const UNWIRKSAME_FELDER_ZEIGEN: boolean = false;

/** Die Eingabe, mit der gerechnet wird: ausgeblendete Felder auf ihrem neutralen Wert. */
export function ohneAusgeblendeteFelder(eingabe: InvestmentEingabe): InvestmentEingabe {
  if (UNWIRKSAME_FELDER_ZEIGEN) return eingabe;
  return {
    ...eingabe,
    // Das Darlehen folgt dem Kaufpreis: immer 100 % in Prozent, nie ein stehengebliebener Eurobetrag.
    seniorLoanMode: "percent",
    seniorLoanValue: 100,
    seniorRepaymentType: "annuitaet",
    seniorGracePeriodYears: 0,
    juniorLoanValue: 0,
    secondLoanAmount: 0,
    kfwEnabled: false,
    vacancyRate: 0,
    annualRentGrowth: 0,
    depreciationMethod: "linear",
    specialDepreciationRate: 0,
    acquisitionMonth: 1,
    forecastYears: standardEingabe.forecastYears,
  };
}
