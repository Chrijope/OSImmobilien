/**
 * Wer eine automatische Aufgabe zu einem Kunden bekommt (seit 15.10.2026).
 *
 * Regel: der aktuell Zuständige des Kontakts, gelesen aus dem Zwischenspeicher;
 * die mitgegebene Kennung gilt nur, wenn der Kontakt dort nicht steht. Ohne
 * Zuständigen bekommt jede Person der Leitung (admin, inhaber,
 * vertriebsleiter) eine eigene Aufgabe, dieselbe Regel wie bei den Glocken.
 * Nur wenn auch keine Leitung bekannt ist (Rollen nicht geladen), bleibt die
 * Aufgabe beim Anlegenden, damit sie nicht verloren geht. Den Kunden selbst
 * sperrt `addAufgabe`.
 *
 * Vorher landeten viele Aufgaben bei dem, der gerade geklickt hatte, und im
 * Kundenportal damit beim Kunden.
 */
import { addGeteilteAufgabe, type InboxTask } from "./aktivitaetenStore";
import { zustaendigOderLeitung } from "./bellNotifications";
import { getAufgaben } from "./aufgabenStore";

export type ProzessAufgabe = Omit<InboxTask, "id"> & {
  erstelltVonName?: string;
  investmentId?: string;
  ausloeserSchluessel?: string;
};

/** Zuständiger, sonst die Leitung, sonst leer. Jede Kennung einmal. */
export function aufgabenEmpfaenger(kundeId: string | undefined, rueckfallZustaendig?: string): string[] {
  if (!kundeId) return rueckfallZustaendig ? [rueckfallZustaendig] : [];
  return [...new Set(zustaendigOderLeitung(kundeId, rueckfallZustaendig))];
}

/** Hat dieser Empfänger zu diesem Auslöser schon eine offene Aufgabe? */
function hatOffene(schluessel: string, empfaenger: string): boolean {
  return getAufgaben().some((a) =>
    a.ausloeserSchluessel === schluessel &&
    a.zugewiesenAn === empfaenger &&
    a.status !== "erledigt" &&
    a.status !== "abgesagt");
}

/**
 * Legt die Aufgabe für jeden Empfänger an. Rückgabe true, wenn danach jeder
 * Empfänger eine hat (neu oder schon vorhanden).
 */
export async function addProzessAufgabe(task: ProzessAufgabe, rueckfallZustaendig?: string): Promise<boolean> {
  const empfaenger = aufgabenEmpfaenger(task.kundeId, rueckfallZustaendig);
  if (empfaenger.length === 0) return addGeteilteAufgabe(task);
  let alle = true;
  for (const uid of empfaenger) {
    if (task.ausloeserSchluessel && hatOffene(task.ausloeserSchluessel, uid)) continue;
    const ok = await addGeteilteAufgabe({ ...task, zugewiesenAn: uid });
    if (!ok) alle = false;
  }
  return alle;
}
