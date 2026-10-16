import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { finanzierungBetreff } from '../finanzierung-starten-mail.ts'

/**
 * An den gewählten Finanzierungspartner, wenn die Reservierung unterschrieben
 * ist. Versand: Edge Function `finanzierung-partner-benachrichtigen`.
 *
 * Bewusst ohne Anhang: Personalausweis und Gehaltsnachweise gehören nicht
 * unverschlüsselt in eine Mail. Der Knopf führt ins CRM, dort liegen Kunden-
 * und Objektunterlagen nach der Anmeldung als ZIP bereit.
 */

interface Props {
  finanzierungspartnerName?: string
  kundeName?: string
  objektTitel?: string
  kaufpreis?: string
  unterschriebenAm?: string
  link?: string
}

const Mail = ({ finanzierungspartnerName, kundeName, objektTitel, kaufpreis, unterschriebenAm, link }: Props) => (
  <EmailLayout
    augenbraue="Finanzierung"
    titel="Reservierung unterschrieben"
    vorschau="Der Finanzierungsprozess kann gestartet werden."
    anrede={hallo(finanzierungspartnerName)}
    intern
    ohneUnterschrift
  >
    <Absatz>
      die Reservierungsvereinbarung von {kundeName || 'einem Kunden'} ist unterschrieben.
      Der Finanzierungsprozess kann gestartet werden.
    </Absatz>

    <Angaben titel="Der Vorgang" zeilen={[
      ['Kunde', kundeName || 'Ein Kunde'],
      ...(objektTitel ? ([['Objekt', objektTitel]] as Array<[string, string]>) : []),
      ...(kaufpreis ? ([['Kaufpreis', kaufpreis]] as Array<[string, string]>) : []),
      ...(unterschriebenAm ? ([['Reservierung unterschrieben am', unterschriebenAm]] as Array<[string, string]>) : []),
    ]} />

    <Handlung
      href={link || ''}
      text="Unterlagen im CRM öffnen"
      hinweis="Nach der Anmeldung liegen dort Kunden- und Objektunterlagen als ZIP bereit."
    />

    <Absatz letzter>
      Aus Datenschutzgründen sind dieser Mail keine Unterlagen angehängt.
    </Absatz>
  </EmailLayout>
)

export const template = {
  component: Mail,
  // Der Wortlaut liegt in `../finanzierung-starten-mail.ts`, damit ein Test
  // unter `src` ihn pruefen kann. Diese Datei ist wegen ihrer npm-Importe dort
  // nicht ladbar.
  subject: () => finanzierungBetreff(),
  displayName: 'Finanzierung starten (Finanzierungspartner)',
  previewData: {
    finanzierungspartnerName: 'Erika Mustermann',
    kundeName: 'Max Mustermann',
    objektTitel: 'Musterstraße 1, WE 12',
    kaufpreis: '132.000 €',
    unterschriebenAm: '29.07.2026',
    link: 'https://osimmobilien.netlify.app/kunden/123?tab=investments&investment=456#finanzierung',
  },
} satisfies TemplateEntry
