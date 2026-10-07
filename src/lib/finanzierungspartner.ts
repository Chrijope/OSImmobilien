import { loadAllUsers, type SystemUser } from "@/lib/loadAllUsers";

/**
 * Wer betreut die Finanzierung?
 *
 * Es gibt keine Zuordnung eines Finanzierungspartners zu einem Kunden oder
 * Investment. Massgeblich ist allein die Rolle `finanzierungspartner`, genau
 * so, wie die Bonitaetsfreigabe ihre Meldung adressiert
 * (`src/lib/bonitaetFreigabeMeldung.ts` und die Edge Function
 * `bonitaet-freigabe-mail`). Heute traegt diese Rolle Stefan Kurz allein.
 * Kommt jemand dazu, taucht er hier ohne weiteres Zutun auf, und niemand muss
 * daran denken, irgendwo einen Namen nachzutragen.
 *
 * Bewusst wird nichts erfunden: Ohne hinterlegte Rolle gibt es keinen Namen,
 * dann bleibt die Zeile leer statt zu raten.
 */

const ROLLE = "finanzierungspartner";

/** Alle Nutzer mit der Rolle, unabhaengig davon, ob sie ihre erste ist. */
export function filterFinanzierungspartner(users: SystemUser[]): SystemUser[] {
  return users.filter((u) => {
    const rollen = u.rollen && u.rollen.length > 0 ? u.rollen : (u.rolle ? [u.rolle] : []);
    return rollen.some((r) => (r || "").toLowerCase() === ROLLE);
  });
}

/**
 * Ein kurzer Name fuer die Anzeige.
 *
 * Auf einer Pipeline-Kachel ist wenig Platz. Bis zu zwei Namen stehen
 * ausgeschrieben da, ab dem dritten wird gezaehlt, damit die Kachel nicht
 * ueberlaeuft.
 */
export function finanzierungspartnerLabel(namen: string[]): string | null {
  const sauber = namen.map((n) => (n || "").trim()).filter(Boolean);
  if (sauber.length === 0) return null;
  if (sauber.length <= 2) return sauber.join(", ");
  return `${sauber[0]}, ${sauber[1]} und ${sauber.length - 2} weitere`;
}

/** Namen aller Finanzierungspartner im Haus. */
export function finanzierungspartnerNamen(): string[] {
  return filterFinanzierungspartner(loadAllUsers())
    .map((u) => (u.name || "").trim())
    .filter(Boolean);
}

/** Der Anzeigename fuer die Oberflaeche, oder null, wenn niemand die Rolle hat. */
export function finanzierungspartnerAnzeige(): string | null {
  return finanzierungspartnerLabel(finanzierungspartnerNamen());
}
