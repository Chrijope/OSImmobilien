import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Textblock, Bilder, Handlung } from './_layout.tsx'

const PRIO_TEXT: Record<string, string> = {
  hoch: 'Hoch',
  mittel: 'Mittel',
  niedrig: 'Niedrig',
}

interface Props {
  reporterName?: string
  reporterEmail?: string
  reporterRole?: string
  prioritaet?: 'niedrig' | 'mittel' | 'hoch'
  betreff?: string
  beschreibung?: string
  url?: string
  bilder?: string[]
  ticketId?: string
}

const Mail = ({
  reporterName = 'unbekannt',
  reporterEmail = '',
  reporterRole = '',
  prioritaet = 'mittel',
  betreff = '',
  beschreibung = '',
  url = '',
  bilder = [],
  ticketId = '',
}: Props) => {
  const zeilen: Array<[string, string]> = [
    ['Priorität', PRIO_TEXT[prioritaet] || 'Mittel'],
    ['Gemeldet von', reporterRole ? `${reporterName} (${reporterRole})` : reporterName],
  ]
  if (reporterEmail) zeilen.push(['E-Mail', reporterEmail])
  if (url) zeilen.push(['Seite', url])
  if (ticketId) zeilen.push(['Ticket', ticketId])

  return (
    <EmailLayout
      augenbraue="Fehlerbericht"
      titel={betreff || 'Neuer Fehlerbericht'}
      vorschau={`${PRIO_TEXT[prioritaet] || 'Mittel'}: ${betreff || 'ohne Betreff'}`}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {reporterName} hat einen Fehler gemeldet
        {url ? `, aufgetreten auf ${url}` : ''}.
      </Absatz>

      {url && <Handlung href={url} text="Betroffene Seite öffnen" />}

      <Angaben titel="Der Vorgang" zeilen={zeilen} />

      <Textblock titel="Beschreibung" text={beschreibung || 'Keine Beschreibung angegeben.'} />

      {bilder.length > 0 && <Bilder titel={`Anhänge (${bilder.length})`} urls={bilder} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    `Fehlerbericht (${PRIO_TEXT[data?.prioritaet] || 'Mittel'}): ${data?.betreff || 'ohne Betreff'}`,
  displayName: 'Bug-Report',
  previewData: {
    reporterName: 'Max Mustermann',
    reporterEmail: 'max@example.com',
    reporterRole: 'Vertriebspartner',
    prioritaet: 'hoch',
    betreff: 'Speichern-Knopf reagiert nicht',
    beschreibung: 'Wenn ich auf "Speichern" klicke, passiert nichts.\n\nBrowser: Safari auf dem iPad.',
    url: 'https://osimmobilien.netlify.app/kunden/123',
    bilder: [],
    ticketId: 'abc-123',
  },
} satisfies TemplateEntry
