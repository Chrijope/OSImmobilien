import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Hinweis } from './_layout.tsx'

/**
 * Käufer einer Wohnung mit vermieteter Garage bekommen nach dem Notartermin
 * zwei PDFs (Christian, 17.10.2026): das Anschreiben „Ihre Garage: Miete und
 * Subvention für die ersten 12 Monate“ und das Musterschreiben an den
 * Garagennutzer einzeln. Beide erzeugt das CRM (src/lib/garagenUnterlagen.ts)
 * und hängt sie an.
 */
interface Props {
  name?: string
  /** „WE 46, Haus 38 f“ */
  wohnung?: string
  /** „G4“ */
  garage?: string
}

const Mail = ({ name, wohnung, garage }: Props) => (
  <EmailLayout
    augenbraue="Ihre Garage"
    titel="Garage: Miete und Subvention"
    vorschau="Anschreiben und Musterschreiben an den Garagennutzer als PDF im Anhang."
    anrede={name ? `Guten Tag ${name},` : 'Guten Tag,'}
  >
    <Absatz>
      zu Ihrer Wohnung gehört eine vermietete Garage. Im Anhang finden Sie zwei Schreiben: unser
      Anschreiben mit allen Angaben zu Miete und Subvention für die ersten zwölf Monate und das
      Musterschreiben an den Nutzer der Garage, das Sie ergänzen und verschicken können.
    </Absatz>

    <Angaben
      titel="Zum Anhang"
      zeilen={[
        ['Objekt', 'Hauffstraße 38 a–f, Geltow'],
        ['Wohnung', wohnung || ''],
        ['Garage', garage || ''],
      ].filter(([, wert]) => wert !== '') as Array<[string, string]>}
    />

    <Hinweis text="Bitte tragen Sie im Musterschreiben Ihre Bankverbindung, Ihre Telefonnummer und die Fristen selbst ein." />
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) =>
    `Ihre Garage${d?.garage ? ` ${d.garage}` : ''}: Miete und Subvention für die ersten 12 Monate`,
  displayName: 'Garagenunterlagen an den Käufer',
  previewData: {
    name: 'Anna Muster',
    wohnung: 'WE 46, Haus 38 f',
    garage: 'G4',
  },
} satisfies TemplateEntry
