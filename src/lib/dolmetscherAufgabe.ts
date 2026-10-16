/**
 * Die Aufgabe „Kunde spricht Englisch: Dolmetscher für den Notar klären“.
 *
 * Plan Kundensprache vom 25.09.2026, Abschnitt 4.3: Die Notarurkunde ist
 * deutsch. Spricht der Käufer Englisch, muss vor der Terminplanung geklärt
 * sein, ob ein Dolmetscher kommt, sonst platzt der Termin. Die Aufgabe
 * entsteht deshalb schon beim Versand der Reservierung, also Wochen vor dem
 * Notartermin.
 *
 * Seit 15.10.2026 bekommt jede Person mit der Rolle Backoffice eine eigene
 * Aufgabe, alle mit demselben Auslöser. Hakt eine sie ab oder sagt sie ab,
 * schließt die Datenbank die übrigen mit (siehe `geschwisterAufgabenSchliessen`
 * in `aufgabenStore.ts`). Ohne Backoffice gilt die Empfängerregel aus
 * `prozessAufgabe.ts`. Die Glocke an das Backoffice kommt einmal. Der
 * Auslöser verhindert, dass sie bei einem zweiten Versand doppelt entsteht;
 * einmal abgehakt, kommt sie für dieses Investment nicht wieder.
 */
import { addGeteilteAufgabe } from "./aktivitaetenStore";
import { hatOffeneAutomatikAufgabe, wurdeAutomatikAufgabeErledigt } from "./aufgabenStore";
import { kennungenMitRolle, notifyBackoffice } from "./bellNotifications";
import { isTableLoaded } from "./dataCache";
import { DOLMETSCHER_AUFGABE_TITEL, dolmetscherAufgabeBeschreibung } from "./notarSprache";
import { addProzessAufgabe } from "./prozessAufgabe";
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
 * @returns true, wenn neue Aufgaben entstanden sind
 */
export async function stelleDolmetscherAufgabeSicher(args: {
  sprache: Sprache;
  kundeId: string;
  kundeName: string;
  investmentId?: string | null;
  /** Kennung des Zuständigen, falls der Kontakt im Zwischenspeicher fehlt. */
  rueckfallZustaendig?: string;
}): Promise<boolean> {
  if (args.sprache !== "en" || !args.kundeId) return false;
  try {
    const ausloeser = dolmetscherAusloeser(args.kundeId, args.investmentId);
    // Ohne geladene Tabelle ließe sich eine vorhandene Aufgabe nicht
    // erkennen; dann lieber auf den nächsten Versand warten als doppeln.
    if (isTableLoaded("aufgaben")) {
      if (hatOffeneAutomatikAufgabe(ausloeser) || wurdeAutomatikAufgabeErledigt(ausloeser)) return false;
    }
    const aufgabe = {
      titel: DOLMETSCHER_AUFGABE_TITEL,
      beschreibung: dolmetscherAufgabeBeschreibung(args.kundeName),
      prioritaet: "mittel" as const,
      typ: "aufgabe" as const,
      kundeId: args.kundeId,
      kundeName: args.kundeName,
      faellig_am: new Date().toISOString().slice(0, 10),
      uhrzeit: "09:00",
      investmentId: args.investmentId || undefined,
      ausloeserSchluessel: ausloeser,
    };
    const backoffice = kennungenMitRolle(["backoffice"]).sort();
    let angelegt = false;
    if (backoffice.length === 0) {
      angelegt = await addProzessAufgabe(aufgabe, args.rueckfallZustaendig);
    } else {
      for (const uid of backoffice) {
        if (await addGeteilteAufgabe({ ...aufgabe, zugewiesenAn: uid })) angelegt = true;
      }
    }
    if (angelegt) {
      notifyBackoffice({
        titel: "Dolmetscher für Notartermin klären",
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
