import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz } from './_layout.tsx'

/**
 * Wertschätzende Absage an einen Bewerber nach dem Gespräch. Kurz gehalten
 * und bewusst ohne Begründung im Detail; der interne Grund bleibt im CRM.
 * Folgt dem Muster der anderen Bewerbermails (paket-uebersicht,
 * muster-vertrag): externe Mail mit normalem Fuß.
 */
interface Props {
  vorname?: string
}

const Mail = ({ vorname }: Props) => (
  <EmailLayout
    titel="Danke für deine Zeit"
    vorschau="Danke für dein Interesse an MOREImmo."
    anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
    ohneUnterschrift
  >
    <Absatz>
      danke für deine Zeit und dein Interesse an MOREImmo. Nach unserem Gespräch sind wir zu
      dem Schluss gekommen, dass es aktuell nicht passt.
    </Absatz>
    <Absatz letzter>Wir wünschen dir für deinen Weg alles Gute.</Absatz>
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: 'Deine Bewerbung bei MOREImmo',
  displayName: 'Bewerber-Absage (wertschätzend)',
  previewData: {
    vorname: 'Max',
  },
} satisfies TemplateEntry
