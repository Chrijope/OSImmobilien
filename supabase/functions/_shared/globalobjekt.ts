/**
 * Globalobjekt: eine Wahrheit, der Schalter `objekte.global_objekt`.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Bis zum 23.09.2026 gab es zwei Stellen, die sagten, ob ein Objekt als
 * Ganzes verkauft wird: die Anlageklasse „Globalobjekt“ in `meta.anlageklasse`
 * und der Schalter `global_objekt`. Der Schalter steuert alles, was zaehlt
 * (Vermarktungsart in der Portfoliokachel, Exposé des ganzen Hauses,
 * Hausreservierung, Sperre einzelner Einheiten in der Datenbank). Der
 * Investagon-Import setzte ihn aber nie. So zeigte die Kachel „Globalobjekt 2“
 * unter den Anlageklassen und unter der Vermarktungsart kein einziges.
 *
 * Christians Entscheidung vom 23.09.2026: Massgeblich ist der Schalter. Die
 * Anlageklasse „Globalobjekt“ und der Schalter stimmen immer ueberein:
 *
 *   - In der Objektanlage setzt die Wahl der Anlageklasse den Schalter und
 *     umgekehrt (`src/pages/ObjektNeu.tsx`).
 *   - Der Import setzt den Schalter nach der Anlageklasse aus Investagon
 *     (`globalSchalterNachImport`). Eine Hausreservierung im CRM verhindert
 *     das Zuruecksetzen.
 *   - Wer fragt, ob ein Objekt ein Globalobjekt ist, fragt `istGlobalobjekt`.
 *
 * Nur reine Funktionen ohne Deno- oder Browser-API. Der Browser liest die
 * Datei ueber einen relativen Pfad, wie `objekt-belegung.ts`.
 */
import { hausBelegt } from "./objekt-belegung.ts";
import { vormerkungAktiv } from "./einheit-vormerkung.ts";

/** Die Anlageklasse, die zum Schalter gehoert, so wie die Objektanlage sie schreibt. */
export const GLOBALOBJEKT_ANLAGEKLASSE = "Globalobjekt";

/**
 * Nennt diese Anlageklasse ein Globalobjekt?
 *
 * Tolerant gegen Schreibweisen, weil der Wert auch aus Investagon kommt:
 * „Globalobjekt“, „Global-Objekt“, „global objekt“, „Globalobjekte“ ja,
 * „Globalverkauf“ oder „Mehrfamilienhaus“ nein.
 */
export function istGlobalAnlageklasse(wert: unknown): boolean {
  if (typeof wert !== "string") return false;
  const kern = wert.toLowerCase().replace(/[^a-zäöüß]/g, "");
  return kern === "globalobjekt" || kern === "globalobjekte";
}

/**
 * Ist das Objekt ein Globalobjekt? Liest nur den Schalter.
 *
 * Nimmt beide Formen an: das Objekt aus dem Store (`globalObjekt`) und die
 * rohe Tabellenzeile (`global_objekt`). Im Zweifel nein.
 */
export function istGlobalobjekt(
  objekt: { globalObjekt?: boolean | null; global_objekt?: boolean | null } | null | undefined,
): boolean {
  if (!objekt) return false;
  return (objekt.globalObjekt ?? objekt.global_objekt) === true;
}

/** Was aus der Zeile `objekte` fuer die Frage „ist das Haus im CRM gebunden?“ zaehlt. */
export interface HausBindung {
  belegung?: unknown;
  belegung_kunde_id?: unknown;
  vorgemerkt_bis?: unknown;
}

function text(wert: unknown): string {
  return typeof wert === "string" ? wert.trim() : "";
}

/**
 * Haengt am Haus im CRM gerade ein Kunde?
 *
 * Ja, wenn das Haus reserviert oder verkauft ist (`belegung` ungleich frei,
 * oder ein Kunde steht daran) oder wenn eine Reservierungsvereinbarung fuers
 * ganze Haus gerade zur Unterschrift draussen ist (laufende Vormerkung). Die
 * Vormerkung zaehlt mit, weil die Unterschrift sonst an einem Haus ankaeme,
 * das kein Globalobjekt mehr ist, und die Datenbank sie ablehnen muesste.
 *
 * Fehlen die Spalten, weil `20260923152000_globalobjekt_reservierung.sql`
 * noch nicht gelaufen ist, gibt es auch keine Hausreservierung: nein.
 */
export function hausImCrmGebunden(zeile: HausBindung | null | undefined, jetzt: Date = new Date()): boolean {
  if (!zeile) return false;
  if (hausBelegt({ belegung: text(zeile.belegung) || null, kundeId: text(zeile.belegung_kunde_id) || null })) {
    return true;
  }
  return vormerkungAktiv({ vorgemerktBis: text(zeile.vorgemerkt_bis) || null }, jetzt);
}

/**
 * Der Schalter nach einem Abgleich mit Investagon.
 *
 *   1. Nennt die Anlageklasse ein Globalobjekt: an.
 *   2. Sonst bleibt ein gesetzter Schalter stehen, solange das Haus im CRM
 *      gebunden ist (siehe `hausImCrmGebunden`). Ein reserviertes Haus darf
 *      nicht unter der Hand wieder in einzelne Einheiten zerfallen.
 *   3. Sonst folgt der Schalter Investagon: aus.
 *
 * `anlageklasse` ist die Klasse, die nach dem Abgleich am Objekt steht. Ein
 * leerer Investagon-Wert loescht sie nicht (`anlageklasseNachImport` im
 * Import), deshalb bleibt ein Globalobjekt auch dann eines, wenn Investagon
 * einmal nichts liefert.
 */
export function globalSchalterNachImport(e: {
  anlageklasse: unknown;
  bisher: boolean;
  hausGebunden: boolean;
}): boolean {
  if (istGlobalAnlageklasse(e.anlageklasse)) return true;
  return e.bisher && e.hausGebunden;
}
