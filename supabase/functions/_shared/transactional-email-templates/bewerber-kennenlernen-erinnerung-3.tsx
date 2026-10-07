import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import {
  ERINNERUNG_3_BETREFF,
  ERINNERUNG_3_KNOPF,
  ERINNERUNG_3_OFFEN,
  ERINNERUNG_3_SCHLUSS,
  ERINNERUNG_3_TEXT,
  ERINNERUNG_3_TITEL,
  ERINNERUNG_3_VORSCHAU,
  KENNENLERNEN_BASIS_URL,
  erinnerung3KnopfHinweis,
} from '../bewerber-kennenlernen-mail.ts'

/**
 * Die letzte Erinnerung des Bewerberprozesses, Tag 11.
 *
 * Bis zum 26.09.2026 die dritte, seit dem Wegfall von Tag 8 die zweite. Der
 * Dateiname bleibt „-3", weil er in Idempotenzschlüsseln und im
 * Versandprotokoll älterer Akten steht.
 *
 * **Sie schließt das Verfahren.** Zusammen mit dieser Mail setzt der Zeitplan
 * den Bewerber auf „Kein Interesse". Vorher ging an dieser Stelle eine Bitte
 * an die HR-Managerin hinaus, doch einmal anzurufen. Die Kette endete damit
 * bei einem Menschen, der den Anruf erst noch machen musste, und meistens
 * machte ihn niemand: Der Fall blieb im Eingang liegen, ohne dass jemand es
 * merkte.
 *
 * **Warum nicht die vorhandene „Kein Interesse"-Mail.** Die ist für einen
 * anderen Anlass gebaut, nämlich für jemanden, der uns selbst gesagt hat, dass
 * es sich erledigt hat. Hier hat niemand etwas gesagt, und genau darin liegt
 * der Unterschied: Wir konnten ihn nicht erreichen. Deshalb sagt diese Mail
 * das auch so, ohne Vorwurf, und lässt die Tür ausdrücklich offen.
 *
 * **Kein Abmeldeknopf.** Die Erinnerung davor hat einen, und er
 * führt zu genau dem Stand, den diese Mail ohnehin setzt. Ein Knopf, der
 * nichts mehr ändert, ist eine Falle.
 *
 * Der Knopf zum Kennenlernen bleibt: Der Link gilt lange über Tag 11 hinaus,
 * und wer es sich anders überlegt, soll nicht erst antworten müssen.
 *
 * Wortlaut in `_shared/bewerber-kennenlernen-mail.ts`, damit der Vitest-Test
 * ihn lesen kann. Anrede Du, wie der gesamte Bewerberweg.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 176 60995539',
  email: 'office@more.immo',
}

interface Props {
  bewerberName?: string
  /** Der Link zum Kennenlernen. Fehlt er, entfällt der Knopf. */
  kennenlernenLink?: string
  /** Wie viele Tage der Link von Anfang an gilt. */
  gueltigTage?: number
  berater?: Ansprechpartner
  /** Die HR-Managerin für den Kasten am Fuß der Mail. */
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  hrKontakt,
  bewerberName,
  kennenlernenLink,
  gueltigTage = 180,
  berater,
}: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)

  return (
    <EmailLayout
      augenbraue="Deine Bewerbung"
      titel={ERINNERUNG_3_TITEL}
      vorschau={ERINNERUNG_3_VORSCHAU}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>{ERINNERUNG_3_TEXT}</Absatz>

      <Absatz letzter>{ERINNERUNG_3_OFFEN}</Absatz>

      {/* Ohne Ziel lieber kein Knopf, wie in den beiden Erinnerungen davor. */}
      {kennenlernenLink && (
        <Handlung
          href={kennenlernenLink}
          text={ERINNERUNG_3_KNOPF}
          hinweis={erinnerung3KnopfHinweis(gueltigTage)}
        />
      )}

      <Absatz letzter>{ERINNERUNG_3_SCHLUSS}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: ERINNERUNG_3_BETREFF,
  displayName: 'Bewerber Kennenlernen, letzte Erinnerung an Tag 11',
  previewData: {
    bewerberName: 'Max Mustermann',
    kennenlernenLink: `${KENNENLERNEN_BASIS_URL}/beispiel-token`,
    berater: STANDARD,
  },
} satisfies TemplateEntry
