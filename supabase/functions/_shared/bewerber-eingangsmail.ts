/**
 * Wortlaut und Buchungslink der Bewerber-Eingangsmail.
 *
 * Die Vorlage selbst (`transactional-email-templates/bewerber-formular-einladung.tsx`)
 * importiert React über einen npm:-Spezifizierer und ist damit für Vitest
 * unerreichbar. Link und Kernsätze liegen deshalb hier in einer reinen
 * TypeScript-Datei, die beide Welten lesen können: die Vorlage in Deno und der
 * Test in `src/lib/bewerberEingangsmail.test.ts`.
 */

/**
 * Der Buchungskalender der HR-Managerin für das 60-minütige Gespräch.
 *
 * Bewusst ohne den Parameter `?month=...`: Mit ihm zeigt Calendly dauerhaft
 * den festgeschriebenen Monat an, auch wenn der längst vorbei ist. Ohne ihn
 * öffnet sich immer der aktuelle Monat. Es ist derselbe Kalender wie
 * CLOSING_BUCHUNGSLINK in `src/lib/assessmentSkript.ts`.
 */
export const BEWERBER_BUCHUNGSLINK =
  'https://calendly.com/sarah-kaiser-thom-more/gespraechstermin'

/**
 * Wie viele Fragen jeder Bewerber sieht, ohne die bedingten Zusatzfragen.
 *
 * Muss zum Katalog in `src/lib/bewerberFormular.ts` passen (Fragen ohne
 * `nurWenn`). Der Test `bewerberEingangsmail.test.ts` vergleicht beides, damit
 * die Mail nicht wieder eine veraltete Zahl verspricht: Bis 02.09.2026 stand
 * hier 10, der Katalog hatte längst 13.
 */
export const BEWERBER_ANZAHL_FRAGEN = 13

/** Die Zeile unter dem Fragebogen-Link in der Eingangsmail. */
export function bewerberFragebogenHinweis(anzahlFragen: number, gueltigTage: number): string {
  return `${anzahlFragen} kurze Fragen  ·  etwa 3 Minuten  ·  der Link gilt ${gueltigTage} Tage`
}

/** Der Dank samt kurzer Vorstellung, direkt nach der Anrede. */
export const BEWERBER_EINGANG_DANKE =
  'vielen Dank für dein Interesse an einer vertrieblichen Zusammenarbeit mit ' +
  'MOREImmo. Wir sind ein Kapitalanlage-Vertrieb aus Rosenheim und erweitern ' +
  'gerade unser Vertriebsteam.'

/** Die Zusage des Anrufs und die Terminbuchung als Alternative. */
export const BEWERBER_EINGANG_TERMIN =
  'Wir melden uns zeitnah telefonisch bei dir. Alternativ kannst du dir unten ' +
  'direkt einen Termin für ein 60-minütiges Gespräch buchen, dann stimmen wir ' +
  'die mögliche Zusammenarbeit in Ruhe ab.'
