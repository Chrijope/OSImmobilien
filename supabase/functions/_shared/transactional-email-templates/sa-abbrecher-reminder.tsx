import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'

/**
 * Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet.
 *
 * Gehoert zur nie eingeplanten Function send-sa-abbrecher-reminder.
 * Die Vorlage bleibt fuer Historie und Vorschau liegen und wird von keiner
 * Function mehr aufgerufen.
 */

interface Props {
  kundeName?: string
  fillUrl?: string
  gueltigBis?: string
  berater?: Ansprechpartner
}

const Mail = ({ kundeName, fillUrl, gueltigBis, berater }: Props) => (
  <EmailLayout
    augenbraue="Angefangen, nicht beendet"
    titel="Ihre Selbstauskunft ist halb fertig"
    vorschau="Sie haben angefangen, aber nicht abgeschickt. Ihre Eingaben sind gespeichert."
    anrede={kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,'}
    person={berater}
  >
    <Absatz letzter>
      Sie haben Ihre Selbstauskunft begonnen, aber noch nicht abgeschickt. Ihre bisherigen Eingaben sind gespeichert, Sie müssen also nicht von vorn anfangen und können dort weitermachen, wo Sie aufgehört haben.
    </Absatz>

    <Handlung
      href={fillUrl || ''}
      text="Dort weitermachen, wo ich war"
      hinweis={`Etwa 12 Minuten${gueltigBis ? `  ·  Link gültig bis ${gueltigBis}` : ''}`}
    />

  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: 'Ihre Selbstauskunft ist halb fertig',
  displayName: 'Selbstauskunft-Abbrecher',
  previewData: {
    kundeName: 'Herr Mustermann',
    fillUrl: 'https://portal.more.immo/sa/example-token',
    gueltigBis: '5. August 2026',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
