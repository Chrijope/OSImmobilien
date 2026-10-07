/**
 * Wann ein nicht erreichter Bewerber eine Mail bekommt.
 *
 * Seit dem 26.09.2026 genau zweimal: nach dem ersten erfolglosen Anruf und
 * nach dem letzten, dem fünften. Vorher ging bei jedem der ersten fünf Anrufe
 * eine Mail hinaus. Fünf fast gleiche Mails in wenigen Tagen sehen für
 * Mailprogramme nach Massenversand aus und landen im Spam, und den Bewerber
 * erreichen sie danach auch mit den wichtigen Mails nicht mehr.
 *
 * Warum der fünfte Anruf der letzte ist: Ab ihm gilt der Bewerber im Code als
 * nicht erreichbar, was Mails angeht. Die Vorlage `bewerber-nicht-erreicht`
 * sagt in ihrer fünften Fassung „wir schreiben dir dazu aber nicht mehr", und
 * die Akte vermerkt danach „bewusst ohne Mail". Angerufen werden darf weiter,
 * eine automatische Absage gibt es nicht.
 *
 * Reine Datei ohne Supabase, damit Vitest sie prüfen kann.
 */

/** Der Anruf, nach dem die letzte Mail hinausgeht. */
export const LETZTER_MAIL_VERSUCH = 5;

export type NichtErreichtStufe = "erster" | "letzter";

/**
 * Welche Mail zu diesem Versuch gehört, oder `null` für keine.
 *
 * `versuch` ist die laufende Nummer des erfolglosen Anrufs, beginnend bei 1.
 */
export function nichtErreichtMailStufe(versuch: number): NichtErreichtStufe | null {
  if (!Number.isInteger(versuch)) return null;
  if (versuch === 1) return "erster";
  if (versuch === LETZTER_MAIL_VERSUCH) return "letzter";
  return null;
}

/**
 * Der Schlüssel gegen doppelten Versand, je Bewerber und Stufe.
 *
 * Bewusst dieselbe Form wie bisher (`-v1`, `-v5`): Wer eine dieser Mails
 * schon vor der Umstellung bekommen hat, bekommt sie nicht noch einmal.
 */
export function nichtErreichtIdempotenzSchluessel(bewerberId: string, stufe: NichtErreichtStufe): string {
  return `bewerber-nicht-erreicht-${bewerberId}-v${stufe === "erster" ? 1 : LETZTER_MAIL_VERSUCH}`;
}
