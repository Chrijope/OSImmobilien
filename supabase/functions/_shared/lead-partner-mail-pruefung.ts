/**
 * Wer die Mail „Neuer Lead" bekommen darf (24.09.2026).
 *
 * `send-lead-partner-mail` schickt Name, Telefon und E-Mail eines Leads an
 * einen Partner. Bisher genuegte dafuer eine Kontaktkennung und eine
 * Partnerkennung im Aufruf. Wer beide kannte, konnte sich die Daten eines
 * fremden Leads an einen beliebigen Partner schicken lassen. Christian hat
 * entschieden: Die Mail geht nur raus, wenn der Kontakt dem Empfaenger
 * zugeordnet ist.
 *
 * Die Zuweisung im CRM schreibt die Zustaendigkeit ohne await und stoesst die
 * Mail gleich danach an. Die Function kann den Kontakt deshalb einen Moment
 * zu frueh lesen. Sie liest dann noch einmal nach, bevor sie einen Kontakt
 * verwirft (`LEAD_MAIL_NACHLESEN_MS`).
 */

/** Pausen vor dem erneuten Lesen, zusammen rund sechs Sekunden. */
export const LEAD_MAIL_NACHLESEN_MS = [1_500, 2_000, 2_500] as const;

export interface ZuordnungsZeile {
  id: string;
  zustaendig_id?: string | null;
}

/** Teilt die Kontakte in die, die dem Partner gehoeren, und die uebrigen. */
export function teileNachZuordnung<T extends ZuordnungsZeile>(
  kontakte: T[],
  partnerId: string,
): { zugeordnet: T[]; fremd: T[] } {
  const ziel = String(partnerId || "").trim();
  const zugeordnet: T[] = [];
  const fremd: T[] = [];
  for (const k of kontakte) {
    const zustaendig = String(k.zustaendig_id ?? "").trim();
    if (ziel && zustaendig === ziel) zugeordnet.push(k);
    else fremd.push(k);
  }
  return { zugeordnet, fremd };
}
