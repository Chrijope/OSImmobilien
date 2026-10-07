import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung } from './_layout.tsx'

interface Props {
  vpName?: string
  kundeName?: string
  kundeLink?: string
  anzahlUnterschriften?: number
}

const Mail = ({ vpName, kundeName, kundeLink, anzahlUnterschriften }: Props) => (
  <EmailLayout
    augenbraue="Unterschrieben"
    titel="Die Selbstauskunft ist unterschrieben"
    vorschau={kundeName ? `${kundeName} hat die Selbstauskunft unterschrieben` : 'Eine Selbstauskunft wurde unterschrieben'}
    anrede={vpName ? `Hallo ${vpName.split(' ')[0]},` : 'Hallo,'}
    intern
    ohneUnterschrift
  >
    <Absatz letzter>
      {kundeName || 'Dein Kunde'} hat die Selbstauskunft ausgefüllt und unterschrieben{anzahlUnterschriften && anzahlUnterschriften > 1 ? ` (${anzahlUnterschriften} Unterschriften)` : ''}. Du kannst sie jetzt an die Bank weitergeben.
    </Absatz>

    {kundeLink && <Handlung href={kundeLink} text="Kundenprofil öffnen" />}
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => data?.kundeName ? `${data.kundeName} hat die Selbstauskunft unterschrieben` : 'Eine Selbstauskunft wurde unterschrieben',
  displayName: 'Selbstauskunft unterschrieben (an VP)',
  previewData: {
    vpName: 'Julian Meyer',
    kundeName: 'Max Mustermann',
    kundeLink: 'https://portal.more.immo/kunden/123',
    anzahlUnterschriften: 2,
  },
} satisfies TemplateEntry
