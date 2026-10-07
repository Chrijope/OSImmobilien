import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben } from './_layout.tsx'

interface Props {
  empfaengerName?: string
  kundeName?: string
  objektName?: string
  wohnungName?: string
  erstelltVon?: string
  kundeLink?: string
}

const Mail = ({ empfaengerName, kundeName, objektName, wohnungName, erstelltVon, kundeLink }: Props) => (
  <EmailLayout
    augenbraue="Zum Handeln"
    titel="Ein Notartermin muss vereinbart werden"
    vorschau={kundeName ? `Aufnahmebogen für ${kundeName} ist fertig` : 'Ein Aufnahmebogen ist fertig'}
    anrede={empfaengerName ? `Hallo ${empfaengerName.split(' ')[0]},` : 'Hallo,'}
    intern
    ohneUnterschrift
  >
    <Absatz letzter>
      der Aufnahmebogen für den Notar ist fertiggestellt. Bitte stimme den Termin mit dem Notariat
      und dem Verkäufer ab und trage ihn im Kundenprofil unter Notar ein.
    </Absatz>

    {kundeLink && <Handlung href={kundeLink} text="Kundenprofil öffnen" />}

    <Angaben titel="Der Vorgang" zeilen={[
      ...(kundeName ? ([['Kunde', kundeName]] as Array<[string, string]>) : []),
      ...(objektName ? ([['Objekt', [objektName, wohnungName].filter(Boolean).join(', ')]] as Array<[string, string]>) : []),
      ...(erstelltVon ? ([['Erstellt von', erstelltVon]] as Array<[string, string]>) : []),
    ]} />
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => data?.kundeName ? `Notartermin vereinbaren: ${data.kundeName}` : 'Notartermin vereinbaren',
  displayName: 'Notar-Aufnahmebogen erstellt',
  previewData: {
    empfaengerName: 'Christian Peetz',
    kundeName: 'Max Mustermann',
    objektName: 'Breitscheidstraße 18',
    wohnungName: 'Wohnung 12',
    erstelltVon: 'Julian Meyer',
    kundeLink: 'https://portal.more.immo/kunden/123',
  },
} satisfies TemplateEntry
