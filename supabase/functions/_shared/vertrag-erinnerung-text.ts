/**
 * Kleine Texthelfer fuer die beiden Vertragserinnerungen.
 *
 * Warum ueberhaupt: Die Mails sollen "vor vier Tagen" sagen und nicht
 * "vor 4 Tagen". Die Zahl steht aber nicht fest. Faellt der Versandtag auf ein
 * Wochenende, geht die Mail erst am Montag hinaus und der Vertrag liegt dann
 * sechs statt vier Tage. Ein fest geschriebenes Zahlwort waere in dem Fall
 * schlicht gelogen.
 */

const ZAHLWORT: Record<number, string> = {
  1: 'einem',
  2: 'zwei',
  3: 'drei',
  4: 'vier',
  5: 'fünf',
  6: 'sechs',
  7: 'sieben',
  8: 'acht',
  9: 'neun',
  10: 'zehn',
  11: 'elf',
  12: 'zwölf',
}

/**
 * "vier Tagen", "zwölf Tagen", ab dreizehn wieder als Ziffer.
 *
 * Ohne brauchbare Zahl bleibt es beim unbestimmten "einigen Tagen". Eine
 * erfundene Zahl waere schlimmer als gar keine, der Bewerber kann nachsehen,
 * wann die Vertragsmail kam.
 */
export function tageWort(tage?: number): string {
  if (typeof tage !== 'number' || !isFinite(tage) || tage < 1) return 'einigen Tagen'
  if (tage === 1) return 'einem Tag'
  return `${ZAHLWORT[tage] ?? tage} Tagen`
}

/**
 * Der Vorname der Person, die sich als Naechstes meldet.
 *
 * Steht keine HR-Managerin fest, nennt die Mail niemanden namentlich. Ein
 * Platzhalter unter einer angekuendigten persoenlichen Meldung waere die
 * schlechteste aller Varianten.
 */
export function meldeSichText(hrName?: string): string {
  const vorname = (hrName || '').trim().split(/\s+/)[0]
  return vorname ? `meldet sich ${vorname}` : 'melden wir uns'
}

/**
 * Die drei Erinnerungen an den Bewerber, gezählt ab der zuletzt versendeten
 * Signaturanfrage (Christian, 30.09.2026). Stufe 3 schließt den Vorgang: Der
 * Bewerber steht danach auf „Kein Interesse“, siehe send-vertrag-hr-eskalation.
 */
export const BEWERBER_ERINNERUNGEN = [
  { id: 'e1', abTagen: 5, vorlage: 'vertrag-erinnerung-1' },
  { id: 'e2', abTagen: 7, vorlage: 'vertrag-erinnerung-2' },
  { id: 'e3', abTagen: 14, vorlage: 'vertrag-erinnerung-3' },
] as const

export type BewerberErinnerung = (typeof BEWERBER_ERINNERUNGEN)[number]

/** Der Grund in der Akte, wenn Stufe 3 den Bewerber schließt. */
export const ABSCHLUSS_ABSAGEGRUND = 'Vertrag nicht unterschrieben, keine Rückmeldung nach 14 Tagen'

/**
 * Welche Erinnerung heute dran ist, oder keine.
 *
 * Immer die niedrigste offene Stufe, höchstens eine je Tag. Fällt Tag 5 aufs
 * Wochenende, kommt Stufe 1 am Montag und Stufe 2 einen Tag später, statt
 * Stufe 1 zu überspringen. So bekommt auch niemand die Abschlussmail, ohne
 * vorher beide Erinnerungen gehabt zu haben.
 *
 * `gespraechNachVersand`: HR hat nach dem Versand mit dem Bewerber
 * gesprochen. Dann schließt die Automatik nicht, Stufe 3 bleibt Handarbeit.
 */
export function naechsteBewerberErinnerung(
  tageSeitAnfrage: number,
  bereits: readonly string[],
  gespraechNachVersand: boolean,
): BewerberErinnerung | null {
  const offen = BEWERBER_ERINNERUNGEN.find((e) => !bereits.includes(e.id))
  if (!offen || tageSeitAnfrage < offen.abTagen) return null
  if (offen.id === 'e3' && gespraechNachVersand) return null
  return offen
}

/** Ein eingetragener Kontaktversuch nach dem Versand, bei dem jemand erreicht wurde. */
export function gespraechNach(
  kontaktversuche: unknown,
  versandAm: string,
): boolean {
  if (!Array.isArray(kontaktversuche)) return false
  const ab = Date.parse(versandAm)
  return kontaktversuche.some((k) => {
    const v = k as { datum?: unknown; ergebnis?: unknown }
    return typeof v?.datum === 'string' && Date.parse(v.datum) > ab && v.ergebnis !== 'nicht_erreicht'
  })
}
