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

/** Auf Englisch wird jede Fassung übersetzt, der lange Name zuerst. */
const JEDER_NAME = /Firmen- und Konzeptvorstellung|Konzeptvorstellung|Beratungsgespr(?:ä|ae)ch/gi;

/** Für die Anzeige: nennt den Termin in der Sprache, jeder andere Text bleibt. */
export function terminNameAnzeige(titel: string, en = false): string {
  return en ? titel.replace(JEDER_NAME, BERATUNG_NAME_EN) : titel.replace(ALTER_NAME, BERATUNG_NAME);
}

/**
 * Für den Mailversand: Erst dort steht die Sprache der Mail fest. Partner-Mails
 * bleiben deutsch, auch wenn der Kunde Englisch spricht.
 */
export function mitTerminNameInSprache<T extends Record<string, unknown>>(daten: T, sprache: "de" | "en"): T {
  const titel = daten.terminTitel;
  return typeof titel === "string" ? { ...daten, terminTitel: terminNameAnzeige(titel, sprache === "en") } : daten;
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
