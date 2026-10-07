import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung } from './_layout.tsx'

interface Props {
  vpName?: string
  kundeName?: string
  kundeLink?: string
}

const Mail = ({ vpName, kundeName, kundeLink }: Props) => (
  <EmailLayout
    augenbraue="Neuer Lead"
    titel="Ein Bestandskunde will weitermachen"
    vorschau={kundeName ? `${kundeName} interessiert sich für die nächste Einheit` : 'Ein Bestandskunde will weitermachen'}
    anrede={vpName ? `Hallo ${vpName.split(' ')[0]},` : 'Hallo,'}
    intern
    ohneUnterschrift
  >
    <Absatz letzter>
      {kundeName || 'Ein Bestandskunde'} hat Interesse an einer weiteren Einheit angemeldet. Das ist der einfachste Abschluss, den es gibt: Der Ablauf ist bekannt, das Vertrauen steht.
    </Absatz>

    {kundeLink && <Handlung href={kundeLink} text="Kundenprofil öffnen" />}
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => data?.kundeName ? `${data.kundeName} will weitermachen` : 'Ein Bestandskunde will weitermachen',
  displayName: 'Vermögensaufbau-Lead (an VP)',
  previewData: {
    vpName: 'Julian Meyer',
    kundeName: 'Max Mustermann',
    kundeLink: 'https://osimmobilien.netlify.app/kunden/123',
  },
} satisfies TemplateEntry
