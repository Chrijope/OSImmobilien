/**
 * Gemeinsames der drei Mails an einen nicht erreichten Lead
 * (nicht-erreicht-mail-1, -2, -3).
 *
 * Absender, Antwortadresse und Unterschrift setzt send-transactional-email
 * aus `kontakte.zustaendig_id`, siehe _shared/zustaendiger-absender.ts. Die
 * Vorlagen lesen nur, was dort in `berater` landet.
 *
 * Ohne Bibliotheken, damit Vitest die Datei lesen kann.
 */
import { vornameAus } from './_anrede.ts'
import { mailSprache } from './_sprache.ts'

export const TEAM_ADRESSE = 'os@os-immobilien.com'

export interface Absender {
  name?: string
  email?: string
  telefon?: string
}

/**
 * Schreibt das Haus statt eines Partners? Dann spricht die Mail als "wir".
 * Das ist der Fall, wenn niemand zuständig ist.
 */
export function istTeam(berater?: Absender | null): boolean {
  const name = (berater?.name || '').trim()
  return !name || /moreimmo/i.test(name)
}

/** Der Vorname des Partners für Betreff und Text, beim Haus leer. */
export function partnerVorname(berater?: Absender | null): string {
  return istTeam(berater) ? '' : vornameAus(berater?.name)
}

/** Die Adresse, an die eine Antwort geht. */
export function antwortAn(berater?: Absender | null): string {
  const mail = (berater?.email || '').trim()
  return mail.includes('@') ? mail : TEAM_ADRESSE
}

/** Ein mailto-Link mit fertigem Betreff und Text. */
export function antwortLink(an: string, betreff: string, text?: string): string {
  const teile = [`subject=${encodeURIComponent(betreff)}`]
  if (text) teile.push(`body=${encodeURIComponent(text)}`)
  return `mailto:${an}?${teile.join('&')}`
}

/** "Christian von OS Immobilien: kurz verpasst", beim Haus "OS Immobilien: kurz verpasst". */
export function betreffMitAbsender(vorname: string, rest: string, sprache?: unknown): string {
  if (!vorname) return `OS Immobilien: ${rest}`
  return mailSprache(sprache) === 'en' ? `${vorname} from OS Immobilien: ${rest}` : `${vorname} von OS Immobilien: ${rest}`
}
