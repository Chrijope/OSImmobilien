/**
 * Der Name des zweiten Gesprächs im Kundenweg.
 *
 * Sichtbar heißt es „Firmen- und Konzeptvorstellung“. Gespeichert steht oft
 * noch „Beratungsgespräch“: in Terminarten, Buchungen und alten Aktivitäten,
 * und die Datenbank-Funktionen schreiben es für neue Buchungen weiter so.
 * Deshalb wird hier nur übersetzt, gespeicherte Werte bleiben unverändert.
 * Rein und ohne Abhängigkeiten, damit CRM und Edge Functions dieselbe Fassung
 * nutzen.
 */
export const BERATUNG_NAME = "Firmen- und Konzeptvorstellung";
export const BERATUNG_KURZ = "Konzeptvorstellung";
export const BERATUNG_NAME_EN = "Concept introduction";

/** Die Schreibweisen aus Migrationen und Altbestand, auch ohne Umlaut. */
const ALTER_NAME = /Beratungsgespr(?:ä|ae)ch/gi;

/** Für die Anzeige: nennt den alten Namen um, jeder andere Text bleibt. */
export function terminNameAnzeige(titel: string, en = false): string {
  return titel.replace(ALTER_NAME, en ? BERATUNG_NAME_EN : BERATUNG_NAME);
}

/** Exakt dieser Termin, unter altem, neuem oder kurzem Namen. */
export function istBeratungsName(titel?: string | null): boolean {
  return terminNameSchluessel(titel) === BERATUNG_NAME.toLowerCase();
}

/**
 * Für Vergleiche: Alter, neuer und kurzer Name ergeben denselben Wert, damit
 * ein Termin und seine Kopie im Verlauf zusammenfinden, wie auch immer sie
 * gespeichert sind.
 */
export function terminNameSchluessel(titel?: string | null): string {
  const wert = terminNameAnzeige((titel || "").trim()).toLowerCase();
  return wert === BERATUNG_KURZ.toLowerCase() ? BERATUNG_NAME.toLowerCase() : wert;
}
