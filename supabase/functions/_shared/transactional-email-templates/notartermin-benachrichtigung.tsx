import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import type { MailFelder } from './felder.ts'
import { EmailLayout, Absatz, Angaben } from './_layout.tsx'

/**
 * Interne Meldung: Fuer einen Kunden wurde ein Notartermin eingetragen.
 *
 * Geht an den zustaendigen Vertriebspartner und ans Buero. Frueher ging sie
 * auch an den Kunden, der dann eine Meldung in der dritten Person ueber sich
 * selbst bekam. Der Kunde bekommt jetzt `notartermin-geplant`.
 */
type Props = MailFelder['notartermin-benachrichtigung']

const Mail = ({
  kundeName,
  vertriebspartner,
  notarName,
  notarAdresse,
  notarEmail,
  terminDatum,
  terminUhrzeit,
  objektName,
  wohnungName,
  geaendert,
}: Props) => {
  const termin: Array<[string, string]> = []
  if (terminDatum) termin.push(['Datum', terminDatum])
  if (terminUhrzeit) termin.push(['Uhrzeit', `${terminUhrzeit} Uhr`])
  if (kundeName) termin.push(['Kunde', kundeName])
  if (vertriebspartner) termin.push(['Vertriebspartner', vertriebspartner])
  if (objektName) termin.push(['Objekt', objektName])
  if (wohnungName) termin.push(['Wohnung', wohnungName])

  const notar: Array<[string, string]> = []
  if (notarName) notar.push(['Name', notarName])
  if (notarAdresse) notar.push(['Adresse', notarAdresse])
  if (notarEmail) notar.push(['E-Mail', notarEmail])

  return (
    <EmailLayout
      augenbraue="Notartermin"
      titel={geaendert ? 'Der Termin wurde geändert' : 'Der Termin steht fest'}
      vorschau={`${geaendert ? 'Geänderter Notartermin' : 'Notartermin'} ${kundeName ? `für ${kundeName}` : ''} ${terminDatum || ''}`.trim()}
      anrede="Hallo,"
      intern
    >
      <Absatz letzter>
        {geaendert
          ? `für ${kundeName || 'den Kunden'} wurde der Notartermin geändert und neu freigegeben. Der bisherige Termin gilt nicht mehr.`
          : `für ${kundeName || 'den Kunden'} wurde ein Notartermin eingetragen und freigegeben.`}
      </Absatz>

      {termin.length > 0 && <Angaben titel="Der Termin" zeilen={termin} />}

      {notar.length > 0 && <Angaben titel="Notar" zeilen={notar} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    `${data?.geaendert ? 'Notartermin geändert' : 'Notartermin'}: ${data?.kundeName || 'Kunde'}, ${data?.terminDatum || 'neuer Termin'}`,
  displayName: 'Notartermin eingetragen (intern, an VP und Büro)',
  previewData: {
    kundeName: 'Max Mustermann',
    vertriebspartner: 'Christian Peetz',
    notarName: 'Dr. Hans Müller',
    notarAdresse: 'Maximilianstraße 10, 80539 München',
    notarEmail: 'mueller@notar-muenchen.de',
    terminDatum: '15.05.2026',
    terminUhrzeit: '14:00',
    objektName: 'Memmingen Süd',
    wohnungName: 'WHG 19',
  },
} satisfies TemplateEntry
