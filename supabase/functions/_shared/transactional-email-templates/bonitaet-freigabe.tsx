import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung } from './_layout.tsx'

/**
 * An den Finanzierungspartner, wenn die Bonitätsunterlagen freigegeben sind.
 *
 * Seit die Bonität hinter der Reservierung liegt, ist ihre Freigabe der
 * Startschuss für die Finanzierung. Diese Mail ist der Weckruf dafür.
 *
 * Bewusst ohne Ansprechpartner-Signatur: Sie geht an einen Kollegen, nicht an
 * einen Kunden, und ein Kontaktblock mit Telefonnummer wäre dort Beiwerk.
 */

interface Props {
  /** Name des Finanzierungspartners. */
  name?: string
  kundeName?: string
  link?: string
}

const Mail = ({ name, kundeName, link }: Props) => (
  <EmailLayout
    augenbraue="Finanzierung"
    titel="Bonitätsunterlagen sind freigegeben"
    vorschau={`${kundeName || 'Ein Kunde'}: Die Bonitätsunterlagen sind geprüft, die Finanzierung kann starten.`}
    anrede={name ? `Hallo ${name},` : 'Hallo,'}
    ohneUnterschrift
  >
    <Absatz letzter>
      die Bonitätsunterlagen von <b>{kundeName || 'einem Kunden'}</b> sind vollständig
      hochgeladen, vom Vertriebspartner geprüft und freigegeben. Die Finanzierung kann
      jetzt angestoßen werden.
    </Absatz>

    <Handlung
      href={link || ''}
      text="Unterlagen ansehen"
      hinweis="Du findest die Unterlagen im Reiter Finanzierungen"
    />
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: 'Bonitätsunterlagen freigegeben: Finanzierung kann starten',
  displayName: 'Bonitätsfreigabe an Finanzierungspartner',
  previewData: {
    name: 'Stefan Kurz',
    kundeName: 'Kai Laube-Richtsteiger',
    link: 'https://osimmobilien.netlify.app/kunden/beispiel?tab=investments',
  },
} satisfies TemplateEntry
