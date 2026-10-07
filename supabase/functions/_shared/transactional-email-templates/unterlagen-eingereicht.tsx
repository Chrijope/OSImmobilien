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
    augenbraue="Eingegangen"
    titel="Unterlagen sind eingegangen"
    vorschau={kundeName ? `${kundeName} hat Unterlagen hochgeladen` : 'Ein Kunde hat Unterlagen hochgeladen'}
    anrede={vpName ? `Hallo ${vpName.split(' ')[0]},` : 'Hallo,'}
    intern
    ohneUnterschrift
  >
    <Absatz letzter>
      {kundeName || 'Dein Kunde'} hat Bonitätsunterlagen im Kundenportal hochgeladen. Bitte sieh sie durch und gib sie frei oder fordere Fehlendes nach.
    </Absatz>

    {kundeLink && <Handlung href={kundeLink} text="Kundenprofil öffnen" />}
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => data?.kundeName ? `${data.kundeName} hat Unterlagen hochgeladen` : 'Neue Unterlagen eingegangen',
  displayName: 'Unterlagen eingereicht (an VP)',
  previewData: {
    vpName: 'Julian Meyer',
    kundeName: 'Max Mustermann',
    kundeLink: 'https://osimmobilien.netlify.app/kunden/123',
  },
} satisfies TemplateEntry
