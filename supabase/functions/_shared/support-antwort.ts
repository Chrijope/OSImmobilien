/**
 * Regeln fuer die Mail "Du hast eine Antwort vom Support".
 *
 * Reine Datei ohne Importe, damit Vitest und Deno sie lesen koennen. Genutzt
 * von der Edge Function `support-antwort-mail` und vom Browser.
 */

/** Wer im Support antworten und Antworten melden darf. */
export const SUPPORT_ROLLEN: readonly string[] = ['admin', 'inhaber', 'backoffice']

export function istSupportRolle(rollen: readonly string[]): boolean {
  return rollen.some((r) => SUPPORT_ROLLEN.includes(r))
}

/**
 * Kunden nutzen "Support kontaktieren" nicht. Traegt jemand nur die Rolle
 * `kunde` (oder gar keine), geht keine Mail hinaus. Dieselbe Regel wie in
 * `chat-empfaenger.ts`.
 */
export function istNurKunde(rollen: readonly string[]): boolean {
  return rollen.every((r) => r === 'kunde')
}

/** Steht im Ticket mindestens eine Antwort vom Support? */
export function hatSupportAntwort(nachrichten: unknown): boolean {
  return Array.isArray(nachrichten) &&
    nachrichten.some((n) => (n as { absender?: unknown } | null)?.absender === 'backoffice')
}

/** Die Seite, die das Ticket direkt oeffnet. */
export function supportTicketAdresse(basis: string, ticketId: string): string {
  return `${basis.trim().replace(/\/+$/, '')}/support-kontaktieren?ticket=${encodeURIComponent(ticketId)}`
}

/**
 * Ein Schluessel je beanspruchtem Zeitfenster. Die 15-Minuten-Bremse sitzt in
 * der Datenbank (`support_ticket_mail_beanspruchen`); der Schluessel sorgt
 * zusaetzlich dafuer, dass derselbe Anspruch nicht zweimal versendet wird.
 */
export function supportMailSchluessel(ticketId: string, beanspruchtAm: string): string {
  return `support-antwort:${ticketId}:${beanspruchtAm}`
}
