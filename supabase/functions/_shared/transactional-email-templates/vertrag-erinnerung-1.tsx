import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { berufsbezeichnung } from '../berufsbezeichnung.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { tageWort } from '../vertrag-erinnerung-text.ts'

/**
 * Erste von drei Erinnerungen an den Bewerber, dass sein Vertrag unsigniert
 * liegt, an Tag 5 nach dem Versand (Text freigegeben von Christian am
 * 30.09.2026). Verschickt von send-vertrag-hr-eskalation.
 *
 * Der Ton ist bewusst nicht mahnend. Ein unsignierter Vertrag ist fast nie
 * eine Entscheidung gegen uns, sondern eine offene Frage, die niemand gestellt
 * hat. Die Tageszahl kommt aus dem echten Abstand, fällt Tag 5 aufs
 * Wochenende, geht die Mail erst am Montag hinaus.
 *
 * Wie alle Bewerbermails: Du-Form, und der Ansprechpartner kommt ueber die
 * Rolle `hr` aus dem Profil (hr-ansprechpartner.ts), nicht aus dem Code.
 */

interface Props {
  name?: string
  signatureUrl?: string
  /** Wie viele Tage der Vertrag schon liegt. Steuert nur den ersten Satz. */
  tageOffen?: number
  berater?: Ansprechpartner
  /** Die HR-Managerin, wie in allen anderen Bewerbermails. */
  hrKontakt?: Ansprechpartner
}

const Mail = ({ name, signatureUrl, tageOffen, berater, hrKontakt }: Props) => {
  const person = hrKontakt?.name ? hrKontakt : berater
  const vorname = (name || '').trim().split(/\s+/)[0] || ''

  return (
    <EmailLayout
      augenbraue="Erinnerung"
      titel="Dein Vertrag wartet noch"
      vorschau="Eine kurze Erinnerung, und bei Fragen melde dich gern."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
      fussHinweis="Deine Daten werden verschlüsselt übertragen und nach DSGVO verarbeitet."
    >
      <Absatz letzter>
        vor {tageWort(tageOffen)} haben wir dir deinen Handelsvertretervertrag geschickt. Bisher ist
        er noch nicht unterschrieben. Vielleicht ist die Mail einfach im Postfach untergegangen.
      </Absatz>

      {/* Wortgleich mit vertrag-signatur.tsx, dort steht die Begründung für das Wort "prüfen". */}
      <Handlung
        href={signatureUrl || ''}
        text="Vertrag öffnen, prüfen und unterschreiben"
        hinweis="Etwa 5 Minuten"
      />

      <Absatz letzter>
        Falls beim Lesen eine Frage aufgekommen ist, zu einer Klausel, zur Provision oder zu einer
        der Anlagen: Schreib mir einfach zurück oder ruf kurz an. Wir klären das gern vor deiner
        Unterschrift.
      </Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Dein Handelsvertretervertrag wartet noch',
  displayName: 'Vertrag, erste Erinnerung an Tag 5',
  previewData: {
    name: 'Max Mustermann',
    signatureUrl: 'https://osimmobilien.netlify.app/signatur?token=example&type=vertrag',
    tageOffen: 5,
    hrKontakt: {
      name: 'Sarah Kaiser-Thom',
      rolle: berufsbezeichnung('hr'),
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
