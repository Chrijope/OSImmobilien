/**
 * Wer bei `generate-standortanalyse` was bekommt (Christian, 23.09.2026).
 *
 * Bis dahin konnte jeder mit dem öffentlichen Schlüssel für jede Objekt-ID
 * eine Messung auslösen, ohne Anmeldung, und das Ergebnis wurde mit der
 * Dienstrolle gespeichert. Jetzt gilt:
 *
 *   - Ohne Anmeldung: 401.
 *   - Angemeldet, aber nicht intern (Kunde, Bewerber, ohne Rolle): 403.
 *   - Ein ausgeblendetes Objekt (`sichtbar = false`) sehen nur Admin und
 *     Inhaber, alle anderen bekommen 404, als gäbe es es nicht.
 *   - Messen dürfen nur Admin und Inhaber. Alle anderen internen Nutzer
 *     bekommen die gespeicherte Analyse, falls es eine gibt.
 *   - Eine gemessene Analyse gilt dauerhaft, nicht mehr 30 Tage. Neu gemessen
 *     wird nur, wenn keine da ist, wenn sich die Adresse geändert hat oder
 *     wenn Admin oder Inhaber es ausdrücklich verlangen (`neuMessen`).
 *
 * Nur reine Funktionen, damit `src/lib/standortanalyseZugang.test.ts` sie
 * ohne Server prüfen kann.
 */

import { istLeitung } from "../_shared/objekt-texte-kontingent.ts";

/** Rollen, die kein interner Zugang sind. */
const NICHT_INTERN: readonly string[] = ["kunde", "bewerber"];

/** Hat der Nutzer wenigstens eine interne Rolle? */
export function istIntern(rollen: unknown): boolean {
  if (!Array.isArray(rollen)) return false;
  return rollen.some((r) => typeof r === "string" && !!r.trim() && !NICHT_INTERN.includes(r.trim()));
}

export type Zugang =
  | { art: "abgelehnt"; status: 401 | 403 | 404; grund: string }
  | { art: "gespeichert" }
  | { art: "messen" };

export function entscheideZugang(e: {
  angemeldet: boolean;
  rollen: unknown;
  /** Ist das Objekt eingeblendet? */
  sichtbar: boolean;
  /** Liegt eine gemessene Analyse (Schema 2) am Objekt? */
  gemessen: boolean;
  /** Weicht die Adresse von der gemessenen ab (`standortAdresseGeaendert`)? */
  adresseGeaendert: boolean;
  /** Ausdrücklicher Wunsch nach einer neuen Messung. */
  neuMessen: boolean;
}): Zugang {
  if (!e.angemeldet) return { art: "abgelehnt", status: 401, grund: "Bitte neu anmelden." };
  if (!istIntern(e.rollen)) return { art: "abgelehnt", status: 403, grund: "Die Standortanalyse ist nur für interne Nutzer." };
  const leitung = istLeitung(e.rollen);
  if (!e.sichtbar && !leitung) return { art: "abgelehnt", status: 404, grund: "Objekt nicht gefunden" };
  if (!leitung) return { art: "gespeichert" };
  if (e.gemessen && !e.adresseGeaendert && !e.neuMessen) return { art: "gespeichert" };
  return { art: "messen" };
}
