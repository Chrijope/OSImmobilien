/**
 * Wie eine gespeicherte Pipelinestufe im Trichter der Statistik gezählt wird.
 *
 * Die Zuordnung lag als private Funktion in `Statistiken.tsx` und war deshalb
 * nicht prüfbar. Sie entscheidet aber, wo jeder einzelne Kontakt im Trichter
 * erscheint, und genau daran ist sie schon einmal auseinandergelaufen. Hier
 * steht sie ohne weitere Abhängigkeiten und hat Tests.
 *
 * Der Trichter rechnet aus dem AKTUELLEN Zustand der Kontakte, nicht aus einer
 * Historie: Gezählt wird `meta.pipelineStufe` der Zeile, wie sie heute in der
 * Datenbank steht. Eine Korrektur hier wirkt deshalb sofort auch auf alle alten
 * Leads, ohne dass etwas nachgetragen werden muss.
 */
import { PIPELINE_STUFEN } from "./pipelineStufen";

/**
 * Zustände, die kein Schritt im Trichter sind.
 *
 * Sie haben keine Abschlusserwartung und dürfen deshalb weder das
 * Gesamtvolumen noch den gewichteten Forecast beeinflussen. "verloren" wurde
 * immer schon getrennt ausgewiesen, "archiviert" und "bestandsimport" fielen
 * dagegen still in den Auffangposten "neuer_lead".
 */
export const AUSSERHALB_TRICHTER = ["verloren", "archiviert", "bestandsimport"];

/**
 * Bildet Altbestand und Zusammenlegungen auf die heutigen Stufen ab.
 *
 * Eine leere Stufe gilt als "neuer_lead", das ist der Anfang des Trichters.
 */
export function normalizeStufe(stufe: string | null | undefined): string {
  if (!stufe) return "neuer_lead";
  if (stufe === "bedarfsanalyse") return "erstgespraech_geplant";
  // "Erstgespraech gefuehrt" und "geplant" sind zu einer Stufe zusammengelegt.
  if (stufe === "erstgespraech") return "erstgespraech_geplant";
  if (stufe === "after_sales" || stufe === "aftersales") return "faelligkeit";
  if (stufe === "closing") return "objektauswahl";
  /*
   * "zugewiesen" heißt: Ein Partner ist zuständig, angerufen hat ihn noch
   * niemand. Diese Stufe stand hier auf "nicht_erreicht" und war damit als
   * Altbestand einsortiert. Seit die Stufe an der Herkunft hängt, ist sie der
   * Normalfall jedes Leads über einen persönlichen Partnerlink. Ein frisch
   * gewonnener Lead mit null Kontaktversuchen erschien im Trichter als "Nicht
   * erreicht", obwohl ihn niemand angerufen hatte. Die Quote "Nicht erreicht"
   * war dadurch systematisch zu hoch und der Anfang des Trichters zu niedrig.
   *
   * Richtig ist der Anfang des Trichters. `pipelineStufen.ts` bildet die Stufe
   * im Rang ebenso auf "neuer_lead" ab (RANG_ALIAS), beide Stellen sagen jetzt
   * dasselbe.
   */
  if (stufe === "zugewiesen") return "neuer_lead";
  // Altbestand aus der früheren Pipeline
  if (stufe === "kontaktversuche") return "nicht_erreicht";
  if (stufe === "vermoegensaufbau") return "erreicht";
  return stufe;
}

/**
 * Die Stufen des Trichters, in genau der Reihenfolge der Pipeline.
 *
 * Bewusst abgeleitet und nicht abgeschrieben. Die Statistik führte dafür eine
 * eigene, von Hand gepflegte Liste, und die lief auseinander: Sie stellte die
 * Bonitätsunterlagen noch vor die Objektauswahl, obwohl die Pipeline sie seit
 * dem 06.08.2026 hinter die Reservierung führt. Ein Kunde in "Objektauswahl"
 * galt in der Statistik damit als "Bonität erreicht", im Kundenprofil nicht.
 *
 * Dasselbe Muster hat im Haus schon einmal Schaden angerichtet, nachzulesen im
 * Kopf von `bundeslandGrEst.ts`: zwei Listen von Grunderwerbsteuersätzen, vier
 * Stellen, die falsch gerechnet haben. Deshalb gibt es hier keine zweite Liste
 * mehr, sondern nur eine andere Sicht auf dieselbe Quelle.
 *
 * Wo der Trichter von `PIPELINE_STUFEN` abweicht, tut er es sichtbar und aus
 * genau zwei Gründen:
 *
 * 1. Zustände ohne Abschlusserwartung fallen raus (`AUSSERHALB_TRICHTER`).
 * 2. Legacy-Schlüssel fallen raus, weil `normalizeStufe` sie ohnehin auf ihre
 *    heutige Entsprechung abbildet. Sie hätten sonst einen eigenen Balken, in
 *    dem nie jemand steht.
 *
 * Die Reihenfolge selbst wird nirgends angefasst.
 */
export const TRICHTER_STUFEN: string[] = PIPELINE_STUFEN
  .map((stufe) => stufe.key as string)
  .filter((key) => normalizeStufe(key) === key && !AUSSERHALB_TRICHTER.includes(key));
