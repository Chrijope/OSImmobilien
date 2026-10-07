import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung } from './_layout.tsx'
import { hallo } from './_anrede.ts'

/*
 * Meldung an den Ersteller eines Support-Tickets, dass der Support geantwortet
 * hat. Seit dem 28.09.2026, verschickt von der Edge Function
 * `support-antwort-mail`, hoechstens einmal je Ticket in 15 Minuten.
 *
 * Bewusst ohne den Antworttext: In einem Ticket stehen oft Kundendaten, und
 * eine Mail ist schnell weitergeleitet. Die Antwort liest man im CRM.
 */
interface Props {
  empfaengerName?: string
  ticketNummer?: string | number
  betreff?: string
  ticketUrl?: string
}

function ticketBezeichnung(nummer?: string | number): string {
  return nummer ? `T-${nummer}` : 'dein Ticket'
}

const Mail = ({ empfaengerName, ticketNummer, betreff, ticketUrl }: Props) => (
  <EmailLayout
    augenbraue="Support"
    titel="Du hast eine Antwort vom Support"
    vorschau={betreff ? `Antwort zu „${betreff}“` : 'Antwort auf dein Support-Ticket'}
    anrede={hallo(empfaengerName)}
    intern
    ohneUnterschrift
  >
    <Absatz letzter>
      {betreff
        ? `zu deinem Ticket ${ticketBezeichnung(ticketNummer)} „${betreff}“ liegt eine neue Antwort vom Support für dich bereit. Über den Knopf kommst du direkt ins Ticket und kannst dort antworten.`
        : `zu ${ticketBezeichnung(ticketNummer)} liegt eine neue Antwort vom Support für dich bereit. Über den Knopf kommst du direkt ins Ticket und kannst dort antworten.`}
    </Absatz>

    <Handlung href={ticketUrl || ''} text="Zum Ticket" />
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    data?.betreff ? `Antwort vom Support: ${data.betreff}` : 'Du hast eine Antwort vom Support',
  displayName: 'Support-Antwort',
  previewData: {
    empfaengerName: 'Max Mustermann',
    ticketNummer: 1042,
    betreff: 'Frage zur Provisionsabrechnung',
    ticketUrl: 'https://osimmobilien.netlify.app/support-kontaktieren?ticket=00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry
