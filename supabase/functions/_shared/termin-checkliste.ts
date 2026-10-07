/**
 * Termine aus der Checkliste im Kundenprofil, für send-termin-erinnerungen.
 *
 * Die Checkliste (und das Setter-Skript) schreibt den Termin nur in
 * `kontakte.meta.setterTerminDatum` und `-Uhrzeit`, ohne Aktivität mit Datum.
 * Trotz des Namens nutzen sie vor allem die Vertriebspartner. Bis zum
 * 04.10.2026 (M12) sah send-termin-erinnerungen diese Termine gar nicht, und
 * eine Aktivität zum selben Zeitpunkt übersprang es zugunsten der älteren
 * send-erstgespraech-reminders, für die in den Migrationen kein Zeitplan steht.
 *
 * Jetzt erinnert send-termin-erinnerungen auch an diese Termine. Doppelt wird
 * es an drei Stellen ausgeschlossen:
 *   - Aktivität und Checkliste zeigen auf denselben Zeitpunkt: nur eine Mail.
 *   - Hat die alte Erinnerung diese Stufe schon geschickt (`remindersSent`),
 *     geht keine zweite hinaus.
 *   - Je Kontakt, Terminzeitpunkt und Stufe sperrt EIN Schlüssel in
 *     `buchung_mail_sperren` (`terminSperrSchluessel`), für Aktivität und
 *     Checkliste derselbe. Seit der Gegenprüfung vom 04.10.2026; vorher hatte
 *     jeder Weg seine eigene Sperre.
 */

/** Zwei Zeitpunkte gelten als derselbe Termin, wenn sie keine Minute auseinander liegen. */
export function gleicherZeitpunkt(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  const da = a.getTime();
  const db = b.getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return Math.abs(da - db) < 60_000;
}

/** Hat send-erstgespraech-reminders diese Stufe für genau diesen Checklisten-Termin schon geschickt? */
export function alteErinnerungVerschickt(
  meta: Record<string, unknown> | null | undefined,
  checklistenZeit: Date | null,
  terminAt: Date,
  stufe: string,
): boolean {
  if (!gleicherZeitpunkt(checklistenZeit, terminAt)) return false;
  const gesendet = meta?.remindersSent;
  return Array.isArray(gesendet) && gesendet.includes(stufe);
}

/**
 * Der Sperrschlüssel einer Terminerinnerung, für beide Versandwege gleich.
 * Der Zeitpunkt ist auf die Minute normiert: Aktivität und Checkliste führen
 * mal Sekunden mit, mal nicht.
 */
export function terminSperrSchluessel(kontaktId: string, terminAt: Date, stufe: string): string {
  const minute = new Date(Math.floor(terminAt.getTime() / 60_000) * 60_000).toISOString();
  return `termin-erinnerung:${kontaktId}:${minute}:${stufe}`;
}

/** So oft wird ein gescheiterter Versand in späteren Läufen wiederholt, dann nicht mehr. */
export const MAX_VERSUCHE = 3;

/** Je Versuch ein eigener Schlüssel; ist er belegt, war dieser Versuch schon. */
export function versuchsSchluessel(sperre: string, versuch: number): string {
  return `${sperre}:versuch-${versuch}`;
}

/**
 * Stufen, in denen der Checklisten-Termin nicht mehr gilt: verloren, oder der
 * Kunde ist nicht erschienen. Dann steht im Feld oft noch der alte Termin.
 */
export const CHECKLISTE_OHNE_ERINNERUNG: ReadonlySet<string> = new Set(["verloren", "eg_noshow", "bg_noshow"]);

/**
 * Bekommt der Checklisten-Termin eine eigene Erinnerung?
 *
 * Nein, wenn die Stufe ihn ausschliesst, oder wenn beim selben Kunden eine
 * Meeting-Aktivitaet auf denselben Zeitpunkt zeigt, auch eine erledigte oder
 * abgesagte: Dann erinnert die Aktivitaet, oder es soll gar nicht erinnert
 * werden.
 */
export function checklistenTerminErinnern(
  meta: Record<string, unknown> | null | undefined,
  meetingZeiten: readonly Date[],
  terminAt: Date,
): boolean {
  const stufe = meta?.pipelineStufe;
  if (typeof stufe === "string" && CHECKLISTE_OHNE_ERINNERUNG.has(stufe)) return false;
  return !meetingZeiten.some((z) => gleicherZeitpunkt(z, terminAt));
}
