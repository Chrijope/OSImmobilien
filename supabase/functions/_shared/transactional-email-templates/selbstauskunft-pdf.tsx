import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Hinweis, type Ansprechpartner } from './_layout.tsx'

interface Props {
  kundenName?: string
  berater?: Ansprechpartner
}

const Mail = ({ kundenName, berater }: Props) => (
  <EmailLayout
    augenbraue="Ihre Unterlagen"
    titel="Ihre Selbstauskunft"
    vorschau="Ihre unterschriebene Selbstauskunft liegt dieser Mail als PDF bei."
    anrede={kundenName ? `Guten Tag ${kundenName},` : 'Guten Tag,'}
    person={berater}
    fussHinweis="Die Selbstauskunft enthält persönliche Daten. Bewahren Sie sie entsprechend auf."
  >
    <Absatz letzter>
      anbei finden Sie Ihre Selbstauskunft als PDF. Sie wurde digital bestätigt und ist dieser
      E-Mail angehängt.
    </Absatz>

    <Hinweis text="Bei Fragen wenden Sie sich jederzeit an Ihren Berater." />
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) => d?.subject || 'Ihre Selbstauskunft',
  displayName: 'Selbstauskunft PDF Versand',
  previewData: {
    kundenName: 'Herr Mustermann',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
