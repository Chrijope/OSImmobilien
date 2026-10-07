import type { AktivitaetEntry } from "./aktivitaetenStore";
import { zuZeitpunkt } from "./naechsterKontakt";

type Eintrag = Pick<AktivitaetEntry, "art" | "faelligAm" | "uhrzeit" | "erledigtAm">;

/**
 * Offene Aufgabe oder offenes Meeting, deren Zeitpunkt noch bevorsteht.
 *
 * Solche Einträge stehen im Verlauf oben fixiert, damit der vereinbarte
 * nächste Schritt nicht unter neueren Protokollen verschwindet. Ist der
 * Zeitpunkt erreicht, rutscht der Eintrag an seine normale Stelle zurück,
 * dort wird das Ergebnis eingetragen.
 */
export function istGeplant(a: Eintrag, jetzt: number = Date.now()): boolean {
  if (a.erledigtAm || (a.art !== "aufgabe" && a.art !== "meeting")) return false;
  const zeit = zuZeitpunkt(a.faelligAm, a.uhrzeit);
  return zeit !== null && zeit > jetzt;
}

/** Geplante zuerst, der nächste oben; danach der übrige Verlauf in seiner Reihenfolge. */
export function geplanteZuerst<T extends Eintrag>(liste: T[], jetzt: number = Date.now()): T[] {
  const zeit = (a: T) => zuZeitpunkt(a.faelligAm, a.uhrzeit) ?? 0;
  const geplant = liste.filter((a) => istGeplant(a, jetzt)).sort((a, b) => zeit(a) - zeit(b));
  return [...geplant, ...liste.filter((a) => !istGeplant(a, jetzt))];
}
