/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben } from './_layout.tsx'

/**
 * Interne Meldung an HR: Der Bewerber hat den Handelsvertretervertrag
 * unterschrieben.
 *
 * Der Bewerber wartet ab diesem Moment auf den Anruf, weil ihm das im
 * Erstgespraech ausdruecklich zugesagt wurde. Die Glocke und die Aufgabe in
 * der Inbox legt finalize-vertrag an; diese Mail ist der Weg zu jemandem, der
 * das CRM gerade nicht offen hat.
 *
 * Bewusst schon bei der Unterschrift des Bewerbers und nicht erst nach der
 * Gegenzeichnung: Die Kontaktaufnahme kann parallel laufen.
 */

interface Props {
  bewerberName?: string
  bewerberEmail?: string
  bewerberTelefon?: string
  paketTitel?: string
  unterschriebenAm?: string
  naechsterSchritt?: string
  bewerberLink?: string
}

const Mail = ({
  bewerberName,
  bewerberEmail,
  bewerberTelefon,
  paketTitel,
  unterschriebenAm,
  naechsterSchritt,
  bewerberLink,
}: Props) => {
  const name = bewerberName || 'Ein Bewerber'

  const zeilen: Array<[string, string]> = [['Name', name]]
  if (paketTitel) zeilen.push(['Paket', paketTitel])
  zeilen.push(['E-Mail', bewerberEmail || 'nicht hinterlegt'])
  zeilen.push(['Telefon', bewerberTelefon || 'nicht hinterlegt'])
  if (unterschriebenAm) zeilen.push(['Unterschrieben am', unterschriebenAm])

  return (
    <EmailLayout
      augenbraue="Vertrag unterschrieben"
      titel={`${name} hat unterschrieben`}
      vorschau={`Handelsvertretervertrag unterschrieben. ${naechsterSchritt || ''}`}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {name} hat den Handelsvertretervertrag digital unterschrieben.{' '}
        {naechsterSchritt ||
          'Bitte kontaktieren und den Onboarding-Termin vereinbaren. Die Aufgabe dazu liegt in der Inbox.'}
      </Absatz>

      {bewerberLink && <Handlung href={bewerberLink} text="Bewerberakte öffnen" />}

      <Angaben titel="Der Vorgang" zeilen={zeilen} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, unknown>) =>
    `Vertrag unterschrieben: ${data.bewerberName ?? 'Bewerber'}`,
  displayName: 'Intern: Bewerber hat den Vertrag unterschrieben',
  previewData: {
    bewerberName: 'Max Mustermann',
    bewerberEmail: 'max@example.com',
    bewerberTelefon: '+49 170 1234567',
    paketTitel: 'Vertriebspartner',
    unterschriebenAm: '26.08.2026, 14:02',
    naechsterSchritt:
      'Bitte kontaktieren und den Onboarding-Termin vereinbaren. Die Aufgabe dazu liegt in der Inbox.',
    bewerberLink: 'https://osimmobilien.netlify.app/bewerberprozess?openBewerber=beispiel',
  },
} satisfies TemplateEntry
