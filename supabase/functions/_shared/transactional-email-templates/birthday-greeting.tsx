import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz } from './_layout.tsx'

interface Props {
  name?: string
}

const Mail = ({ name }: Props) => (
  <EmailLayout
    augenbraue="Von uns allen"
    titel={name ? `Alles Gute, ${name}` : 'Alles Gute zum Geburtstag'}
    vorschau="Alles Gute zum Geburtstag vom ganzen Team."
    anrede={name ? `Hallo ${name.split(' ')[0]},` : 'Hallo,'}
    intern
    ohneUnterschrift
  >
    <Absatz>
      heute ist dein Geburtstag, und das ganze Team gratuliert dir von Herzen.
    </Absatz>
    <Absatz letzter>
      Danke für deinen Einsatz und dafür, dass du das hier mitträgst. Genieß den Tag, du hast ihn
      dir verdient.
    </Absatz>
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => data?.name ? `Alles Gute zum Geburtstag, ${data.name}` : 'Alles Gute zum Geburtstag',
  displayName: 'Geburtstagsgruß (Team)',
  previewData: {
    name: 'Julian Meyer',
  },
} satisfies TemplateEntry
