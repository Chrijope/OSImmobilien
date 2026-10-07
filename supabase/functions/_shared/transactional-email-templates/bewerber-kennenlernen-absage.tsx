import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz } from './_layout.tsx'
import {
  ABSAGE_BETREFF,
  ABSAGE_DANK,
  ABSAGE_ENTSCHEIDUNG,
  ABSAGE_SCHLUSS,
  ABSAGE_TITEL,
  ABSAGE_VORSCHAU,
} from '../bewerber-kooperationsgespraech-mail.ts'

/**
 * Die Absage nach einem gelesenen Kennenlernbogen.
 *
 * Nicht zu verwechseln mit `bewerber-absage`: Die sagt wörtlich „Nach unserem
 * Gespräch" und wird aus Erstgespräch, Closing und Videocall verschickt, also
 * immer nach einem geführten Gespräch. Diese hier kommt davor. Zum Zeitpunkt
 * dieser Mail hat niemand miteinander gesprochen, wir haben einen Bogen
 * gelesen. Ein Satz, der ein Gespräch behauptet, das es nie gab, ist für den
 * Empfänger nachweislich falsch, und daran erkennt er den Textbaustein.
 *
 * Ohne Unterschriftsblock, wie die Schwestervorlage: Eine Absage im Namen
 * einer einzelnen Person zu unterschreiben legt eine persönliche Beziehung
 * nahe, die es hier nicht gibt, und lädt zur Rückfrage bei ihr ein.
 *
 * Wortlaut in `_shared/bewerber-kooperationsgespraech-mail.ts`, damit der
 * Vitest-Test ihn lesen kann.
 */

interface Props {
  vorname?: string
}

const Mail = ({ vorname }: Props) => (
  <EmailLayout
    titel={ABSAGE_TITEL}
    vorschau={ABSAGE_VORSCHAU}
    anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
    ohneUnterschrift
  >
    <Absatz>{ABSAGE_DANK}</Absatz>
    <Absatz>{ABSAGE_ENTSCHEIDUNG}</Absatz>
    <Absatz letzter>{ABSAGE_SCHLUSS}</Absatz>
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: ABSAGE_BETREFF,
  displayName: 'Bewerber-Absage nach dem Kennenlernbogen',
  previewData: {
    vorname: 'Max',
  },
} satisfies TemplateEntry
