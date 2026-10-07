import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import type { MailFelder } from './felder.ts'
import { EmailLayout, Absatz, Handlung } from './_layout.tsx'

/**
 * Interne Meldung: Der Kunde hat im Portal einen Vorschlag bestaetigt. Geht
 * an den zustaendigen Vertriebspartner und ans Buero, siehe
 * `src/lib/notarterminMail.ts`.
 */
type Props = MailFelder['notartermin-bestaetigt']

const Mail = ({ vpName, kundeName, kundeLink, datum, uhrzeit }: Props) => (
  <EmailLayout
    augenbraue="Bestätigt"
    titel="Der Notartermin ist bestätigt"
    vorschau={kundeName ? `${kundeName} hat einen Notartermin bestätigt` : 'Ein Notartermin wurde bestätigt'}
    anrede={vpName ? `Hallo ${vpName.split(' ')[0]},` : 'Hallo,'}
    intern
    ohneUnterschrift
  >
    <Absatz letzter>
      {kundeName || 'Dein Kunde'} hat aus den vorgeschlagenen Terminen einen verbindlich ausgewählt{datum ? `: ${datum}${uhrzeit ? `, ${uhrzeit} Uhr` : ''}` : ''}. Die übrigen Vorschläge sind damit hinfällig.
    </Absatz>

    {kundeLink && <Handlung href={kundeLink} text="Kundenprofil öffnen" />}
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => data?.kundeName ? `${data.kundeName} hat den Notartermin bestätigt` : 'Ein Notartermin wurde bestätigt',
  displayName: 'Notartermin bestätigt (an VP und Büro)',
  previewData: {
    vpName: 'Julian Meyer',
    kundeName: 'Max Mustermann',
    kundeLink: 'https://osimmobilien.netlify.app/kunden/123',
    datum: 'Montag, 11. August 2026',
    uhrzeit: '10:00',
  },
} satisfies TemplateEntry
