/**
 * Absender, Antwortadresse und Linkadresse der Mails an Bewerber.
 *
 * Seit dem 26.09.2026 kommt jede Mail an einen Bewerber persönlich von der
 * HR-Ansprechpartnerin: "Sarah … | MOREImmo <noreply@more.immo>", und eine
 * Antwort landet bei ihr. Anlass waren Bewerbermails im Spamordner. Ein
 * Absender mit Menschennamen und eine Antwortadresse, die jemand liest, sehen
 * für Mailprogramme weniger nach Massenversand aus als "MOREImmo" von noreply@.
 *
 * Vorbild ist `zustaendiger-absender.ts` für die Mails an nicht erreichte
 * Leads. Wer die Ansprechpartnerin ist, entscheidet allein
 * `hr-ansprechpartner.ts`: zuerst die feste Wahl in `app_config`, dann die
 * Rolle `hr`, immer über die Kennung und nie über den Namen. Diese Datei
 * nimmt nur deren Ergebnis und macht daraus Kopfzeilen.
 *
 * Ohne importierte Bibliotheken, damit Vitest die Entscheidung prüfen kann.
 */

import { absenderName, TEAM_ABSENDER } from './zustaendiger-absender.ts'

/**
 * Die öffentliche Adresse für Links in Bewerbermails.
 *
 * Fest und nicht aus einer Umgebungsvariable: Links in Mails sollen nur auf
 * more.immo zeigen, auch wenn jemand für Tests eine andere Basis einträgt.
 */
export const BEWERBER_MAIL_BASIS = 'https://portal.more.immo'

/** Der Absender, wenn keine HR-Ansprechpartnerin gefunden wird. */
export const BEWERBER_ABSENDER_RUECKFALL = 'MOREImmo'

/**
 * `bewerber-*`-Vorlagen, die NICHT an den Bewerber gehen, sondern an HR oder
 * die Geschäftsleitung. Sie behalten den neutralen Absender: Eine Meldung an
 * Sarah, die von "Sarah | MOREImmo" kommt, wäre verwirrend.
 */
export const BEWERBER_INTERNE_VORLAGEN: ReadonlySet<string> = new Set([
  'bewerber-termin-hr',
  'bewerber-hr-anruf',
  'bewerber-neu-intern',
  'bewerber-vertrag-unterschrieben-intern',
])

/**
 * Vorlagen ohne `bewerber-` im Namen, die trotzdem nur an Bewerber gehen.
 *
 * `paket-uebersicht` ist der Startfahrplan nach dem Videocall, verschickt aus
 * `src/lib/startfahrplanVersand.ts`. Die Vertragsmails (`vertrag-*`) gehören
 * nicht hierher: Sie siezen, gehen auch an Bestandspartner, und dort
 * entscheidet der Aufrufer.
 */
// Die drei Vertragserinnerungen seit 30.09.2026: Sie bitten um eine Antwort,
// die sonst bei noreply@ landete statt bei der HR-Ansprechpartnerin.
export const WEITERE_BEWERBERMAILS: ReadonlySet<string> = new Set([
  'paket-uebersicht',
  'vertrag-erinnerung-1',
  'vertrag-erinnerung-2',
  'vertrag-erinnerung-3',
])

/** Geht diese Vorlage an einen Bewerber? */
export function istBewerbermail(vorlage: string): boolean {
  if (WEITERE_BEWERBERMAILS.has(vorlage)) return true
  return vorlage.startsWith('bewerber-') && !BEWERBER_INTERNE_VORLAGEN.has(vorlage)
}

const EINFACHE_ADRESSE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

export interface BewerberAbsender {
  /** Der Anzeigename vor `<noreply@more.immo>`. */
  anzeige: string
  /** Die Reply-To-Adresse. */
  antwortAn: string
}

/**
 * Absender und Antwortadresse aus der HR-Ansprechpartnerin.
 *
 *   mit Name und Adresse   "Sarah Kaiser-Thom | MOREImmo", Antwort an sie
 *   mit Name, ohne Adresse "Sarah Kaiser-Thom | MOREImmo", Antwort an office@
 *   ohne Person            "MOREImmo", Antwort an office@
 *
 * office@ statt gar keiner Antwortadresse: Sonst landet eine Antwort bei
 * noreply@, und dieses Postfach liest niemand.
 */
export function bewerberAbsender(
  hr: { name?: string; email?: string } | null | undefined,
): BewerberAbsender {
  const name = typeof hr?.name === 'string' ? hr.name.trim() : ''
  const adresse = typeof hr?.email === 'string' ? hr.email.trim() : ''
  return {
    anzeige: name ? absenderName({ name }) : BEWERBER_ABSENDER_RUECKFALL,
    antwortAn: EINFACHE_ADRESSE.test(adresse) ? adresse : TEAM_ABSENDER.email,
  }
}
