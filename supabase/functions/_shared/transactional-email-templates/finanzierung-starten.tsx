import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben } from './_layout.tsx'
import { finanzierungBetreff } from '../finanzierung-starten-mail.ts'

interface Props {
  finanzierungspartnerName?: string
  kundeName?: string
  vpName?: string
  objektTitel?: string
  kaufpreis?: string
  reserviertAm?: string
  kundeLink?: string
}

const Mail = ({ finanzierungspartnerName, kundeName, vpName, objektTitel, kaufpreis, reserviertAm, kundeLink }: Props) => (
  <EmailLayout
    augenbraue="Zum Handeln"
    titel="Eine Finanzierung kann starten"
    vorschau={kundeName ? `Die Reservierung von ${kundeName} ist unterschrieben` : 'Eine neue Finanzierung kann starten'}
    anrede={finanzierungspartnerName ? `Hallo ${finanzierungspartnerName.split(' ')[0]},` : 'Hallo,'}
    intern
    ohneUnterschrift
  >
    <Absatz letzter>
      die Reservierungsvereinbarung von {kundeName || 'einem Kunden'} ist unterschrieben, die
      Einheit ist verbindlich reserviert. Bitte beginne zeitnah mit der Finanzierung, damit der
      Notartermin planmäßig stattfinden kann.
    </Absatz>

    {kundeLink && <Handlung href={kundeLink} text="Kundenprofil öffnen" />}

    <Angaben titel="Der Vorgang" zeilen={[
      ...(kundeName ? ([['Kunde', kundeName]] as Array<[string, string]>) : []),
      ...(objektTitel ? ([['Objekt', objektTitel]] as Array<[string, string]>) : []),
      ...(kaufpreis ? ([['Kaufpreis', kaufpreis]] as Array<[string, string]>) : []),
      ...(vpName ? ([['Vertriebspartner', vpName]] as Array<[string, string]>) : []),
      ...(reserviertAm ? ([['Reserviert am', reserviertAm]] as Array<[string, string]>) : []),
    ]} />
  </EmailLayout>
)

export const template = {
  component: Mail,
  // Der Wortlaut liegt in `../finanzierung-starten-mail.ts`, damit ein Test
  // unter `src` ihn pruefen kann. Diese Datei ist wegen ihrer npm-Importe dort
  // nicht ladbar.
  subject: (data: Record<string, any>) => finanzierungBetreff(data?.kundeName),
  displayName: 'Finanzierung starten (Finanzierungspartner)',
  previewData: {
    finanzierungspartnerName: 'Sabine Wolf',
    kundeName: 'Max Mustermann',
    vpName: 'Julian Meyer',
    objektTitel: 'Breitscheidstraße 18, Wohnung 12',
    kaufpreis: '132.000 €',
    reserviertAm: '29. Juli 2026',
    kundeLink: 'https://portal.more.immo/kunden/123',
  },
} satisfies TemplateEntry
