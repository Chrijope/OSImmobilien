import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'

/**
 * Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet.
 *
 * War schon vor der Abschaltung nicht mehr eingeplant (frueher dritte Erinnerung).
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
    augenbraue="Letzte Erinnerung"
    titel="Sollen wir Ihre Anfrage ruhen lassen?"
    vorschau="Wenn gerade kein guter Zeitpunkt ist, ist das völlig in Ordnung. Sagen Sie uns kurz Bescheid."
    anrede={kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,'}
    person={berater}
  >
    <Absatz letzter>
      Ihre Selbstauskunft ist weiterhin offen. Falls gerade kein guter Zeitpunkt ist, ist das völlig in Ordnung: Sagen Sie uns kurz Bescheid, dann lassen wir Ihre Anfrage ruhen und melden uns erst wieder, wenn Sie es möchten. Wenn Sie weitermachen wollen, geht es hier weiter.
    </Absatz>

    <Handlung
      href={fillUrl || ''}
      text="Selbstauskunft ausfüllen"
      hinweis={`Etwa 12 Minuten${gueltigBis ? `  ·  Link gültig bis ${gueltigBis}` : ''}`}
    />

  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: 'Sollen wir Ihre Anfrage ruhen lassen?',
  displayName: 'Selbstauskunft-Erinnerung 3',
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
