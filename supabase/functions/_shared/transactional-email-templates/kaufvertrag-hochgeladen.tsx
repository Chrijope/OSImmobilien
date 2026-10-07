import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben } from './_layout.tsx'

interface Props {
  kundeName?: string
  objektName?: string
  wohnungName?: string
  dokumentUrl?: string
  hochgeladenVon?: string
}

const Mail = ({ kundeName, objektName, wohnungName, dokumentUrl, hochgeladenVon }: Props) => {
  const zeilen: Array<[string, string]> = []
  if (kundeName) zeilen.push(['Kunde', kundeName])
  if (objektName) zeilen.push(['Objekt', objektName])
  if (wohnungName) zeilen.push(['Wohnung', wohnungName])
  if (hochgeladenVon) zeilen.push(['Hochgeladen von', hochgeladenVon])

  return (
    <EmailLayout
      augenbraue="Dokument"
      titel="Kaufvertrag hochgeladen"
      vorschau={`Kaufvertrag im Kundenordner: ${kundeName || 'neuer Vorgang'}`}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        der Kaufvertrag liegt im Kundenordner und steht zum Download bereit.
      </Absatz>

      {dokumentUrl && <Handlung href={dokumentUrl} text="Kaufvertrag öffnen" />}

      {zeilen.length > 0 && <Angaben titel="Details" zeilen={zeilen} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    `Kaufvertrag hochgeladen: ${data?.kundeName || 'neuer Vorgang'}`,
  displayName: 'Kaufvertrag hochgeladen',
  previewData: {
    kundeName: 'Max Mustermann',
    objektName: 'Memmingen Süd',
    wohnungName: 'WHG 19',
    dokumentUrl: 'https://example.com/kaufvertrag.pdf',
    hochgeladenVon: 'Admin',
  },
} satisfies TemplateEntry
