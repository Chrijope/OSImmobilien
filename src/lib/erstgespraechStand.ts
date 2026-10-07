/**
 * Stand des Erstgesprächs und der daraus folgende Einstieg in Präsentation
 * und Moderation.
 *
 * Regel (Christian): Nur wenn Teil 1 des Erstgesprächs ABGESCHLOSSEN ist,
 * startet Präsentation bzw. Moderation mit Teil 2 (teil=2, Zähler 1 von 15).
 * Sonst starten beide mit Teil 1 und Teil 2 (teil=1, 1 von 22). Alle Knöpfe
 * nutzen dieselbe Funktion; die HR-Managerin kann sie an Ort und Stelle
 * übersteuern.
 *
 * Abgeschlossen heißt: Der Abschluss-Zeitstempel durchgefuehrtAm ist gesetzt.
 * Genau dieser Zeitstempel macht auch den Reiter Erstgespräch grün
 * (Kopf-Badge "Geführt am" in ErstgespraechsTab, Häkchen am Reiter im
 * Bewerbungsmanagement). Gesetzt wird er nur über "Erstgespräch abschließen",
 * "Follow-Up setzen" oder eine Absage (useErstgespraechAbschluss).
 *
 * Bewusst NICHT mehr: "mindestens ein gefülltes Gesprächsfeld". Das Autosave
 * füllt das Skript schon beim ersten Tippen, und damit sprang der Einstieg
 * auf Teil 2, obwohl der Reiter noch nicht grün war.
 *
 * Bewusst ohne Importe aus dem Versand oder aus Supabase, damit Tests und
 * Attrappen sie überall gefahrlos einbinden können.
 */
import type { Bewerber, ErstgespraechSkript } from "./bewerbungStore";
import type { DeckTeil } from "./praesentationsDeck";

/**
 * Ist Teil 1 des Erstgesprächs abgeschlossen? Die eine Definition für den
 * Einstieg (Präsentation, Moderation, Reiter Closing), die Fassungswahl des
 * Startfahrplans (startfahrplanVersand.ts) und das Häkchen am Reiter.
 */
export function istTeil1Abgeschlossen(s: ErstgespraechSkript | undefined | null): boolean {
  return !!(s?.durchgefuehrtAm ?? "").trim();
}

/** Der automatische Einstieg: Teil 2, wenn Teil 1 abgeschlossen ist, sonst Teil 1. */
export function einstiegTeilFuer(b: Pick<Bewerber, "erstgespraechSkript"> | null | undefined): DeckTeil {
  return istTeil1Abgeschlossen(b?.erstgespraechSkript) ? 2 : 1;
}

/** Kurze Begründung für die Anzeige neben den Knöpfen. */
export function einstiegBegruendung(teil: DeckTeil, automatisch: boolean): string {
  if (!automatisch) {
    return teil === 2 ? "Manuell gewählt: nur Teil 2" : "Manuell gewählt: ab Teil 1";
  }
  return teil === 2
    ? "Teil 1 bereits am Telefon geführt und abgeschlossen, Start bei Teil 2"
    : "Erstgespräch noch nicht abgeschlossen, Start bei Teil 1 mit Teil 2";
}
