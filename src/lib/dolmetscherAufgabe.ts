/**
 * Die Aufgabe „Dolmetscher für Notartermin klären“ fürs Backoffice.
 *
 * Plan Kundensprache vom 25.09.2026, Abschnitt 4.3: Die Notarurkunde ist
 * deutsch. Spricht der Käufer Englisch, muss vor der Terminplanung geklärt
 * sein, ob ein Dolmetscher kommt, sonst platzt der Termin. Die Aufgabe
 * entsteht deshalb schon beim Versand der Reservierung, also Wochen vor dem
 * Notartermin.
 *
 * Über den vorhandenen Mechanismus: `addGeteilteAufgabe` legt sie in der
 * Tabelle `aufgaben` am Kunden an, sichtbar für jeden, der ihn betreut, und
 * `notifyBackoffice` meldet sie in der Glocke von Backoffice, Admin und
 * Inhaber. Der Auslöser verhindert, dass sie bei einem zweiten Versand
 * doppelt entsteht; einmal abgehakt, kommt sie für dieses Investment nicht
 * wieder.
 */
import { addGeteilteAufgabe } from "./aktivitaetenStore";
import { hatOffeneAutomatikAufgabe, wurdeAutomatikAufgabeErledigt } from "./aufgabenStore";
import { notifyBackoffice } from "./bellNotifications";
import { isTableLoaded } from "./dataCache";
import { DOLMETSCHER_AUFGABE_TITEL, dolmetscherAufgabeBeschreibung } from "./notarSprache";
import type { Sprache } from "./kundenSprache";

/** Der Auslöser, an dem die Aufgabe wiedererkannt wird. */
export function dolmetscherAusloeser(kundeId: string, investmentId?: string | null): string {
  return `dolmetscher_notar:${investmentId || kundeId}`;
}

/**
 * Legt die Aufgabe an, wenn der Kunde Englisch spricht und es sie noch nicht
 * gibt. Wirft nie: Eine fehlende Aufgabe darf den Versand der Reservierung
 * nicht aufhalten.
 *
 * @returns true, wenn eine neue Aufgabe entstanden ist
 */
export async function stelleDolmetscherAufgabeSicher(args: {
  sprache: Sprache;
  kundeId: string;
  kundeName: string;
  investmentId?: string | null;
}): Promise<boolean> {
  if (args.sprache !== "en" || !args.kundeId) return false;
  try {
    const ausloeser = dolmetscherAusloeser(args.kundeId, args.investmentId);
    // Ohne geladene Tabelle ließe sich eine vorhandene Aufgabe nicht
    // erkennen; dann lieber auf den nächsten Versand warten als doppeln.
    if (isTableLoaded("aufgaben")) {
      if (hatOffeneAutomatikAufgabe(ausloeser) || wurdeAutomatikAufgabeErledigt(ausloeser)) return false;
    }
    const heute = new Date().toISOString().slice(0, 10);
    const angelegt = await addGeteilteAufgabe({
      titel: `${DOLMETSCHER_AUFGABE_TITEL}: ${args.kundeName}`,
      beschreibung: dolmetscherAufgabeBeschreibung(args.kundeName),
      prioritaet: "mittel",
      typ: "aufgabe",
      kundeId: args.kundeId,
      kundeName: args.kundeName,
      faellig_am: heute,
      uhrzeit: "09:00",
      investmentId: args.investmentId || undefined,
      ausloeserSchluessel: ausloeser,
    });
    if (angelegt) {
      notifyBackoffice({
        titel: DOLMETSCHER_AUFGABE_TITEL,
        nachricht: `${args.kundeName} hat Englisch als Sprache. Die Notarurkunde ist deutsch; bitte vor der Terminplanung den Dolmetscher klären.`,
        link: `/kunden/${args.kundeId}`,
      });
    }
    return angelegt;
  } catch (fehler) {
    console.warn("Dolmetscher-Aufgabe nicht angelegt:", fehler);
    return false;
  }
}
