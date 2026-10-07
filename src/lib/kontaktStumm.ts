import { cacheGet } from "@/lib/dataCache";

/**
 * Stumme Kontakte: Testkunden, die keine Erinnerungen auslösen sollen.
 *
 * Anlass war der Musterkunde Otto Hans. Er hat einen Notartermin und kein
 * Kaufpreisfälligkeitsdatum, weil ihn niemand zu Ende pflegt. Genau das ist
 * für die Automatik ein liegen gebliebener Vorgang, und so stand jeden Tag
 * "Kaufpreisfälligkeit prüfen" in der Inbox. Abhaken half nicht, am nächsten
 * Tag war die Aufgabe wieder da.
 *
 * Das Merkmal hängt am Kontakt, nicht am Nutzer: Ein Testkunde ist für alle
 * ein Testkunde. Wer ihn stummschaltet, schaltet ihn für das ganze Haus
 * stumm, und das ist auch gewollt.
 *
 * Bewusst nur für Erinnerungen und Hinweise. Die Kundenakte, die Pipeline und
 * die Auswertungen bleiben unberührt: Der Kontakt verschwindet nicht, er
 * meldet sich nur nicht mehr von selbst.
 */

/** Der Schlüssel im `meta` des Kontakts. */
export const STUMM_FELD = "keineBenachrichtigungen";

/**
 * Ist dieser Kontakt stummgeschaltet?
 *
 * Liest bewusst aus dem Zwischenspeicher und nicht aus der Datenbank: Die
 * Prüfung sitzt in Schleifen über alle Investments und läuft alle paar
 * Minuten. Eine Abfrage je Kontakt wäre dort nicht vertretbar.
 */
export function istKontaktStumm(kontaktId?: string | null): boolean {
  if (!kontaktId) return false;
  try {
    const zeile = (cacheGet("kontakte") || []).find((k: { id?: string }) => k?.id === kontaktId);
    if (!zeile) return false;
    const meta = ((zeile as { meta?: Record<string, unknown> }).meta || {}) as Record<string, unknown>;
    return meta[STUMM_FELD] === true;
  } catch {
    // Ist der Zwischenspeicher noch nicht da, lieber nicht stumm schalten.
    // Eine Erinnerung zu viel ist harmloser als eine, die nie kommt.
    return false;
  }
}

/** Umgekehrt, für Filterausdrücke lesbarer. */
export function kontaktDarfMelden(kontaktId?: string | null): boolean {
  return !istKontaktStumm(kontaktId);
}
