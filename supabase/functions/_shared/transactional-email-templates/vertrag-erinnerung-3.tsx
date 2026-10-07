import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { berufsbezeichnung } from '../berufsbezeichnung.ts'
import { EmailLayout, Absatz, type Ansprechpartner } from './_layout.tsx'

/**
 * Dritte Stufe an den Bewerber, Tag 14 nach dem Versand: der freundliche
 * Abschluss (Text freigegeben von Christian am 30.09.2026).
 *
 * Bewusst ohne Knopf. Mit dieser Mail setzt send-vertrag-hr-eskalation den
 * Bewerber auf „Kein Interesse“ und schließt den Signaturlink. Die Tür bleibt
 * trotzdem offen: Wer sich meldet, bekommt über „Erneut zur Unterschrift
 * senden“ einen neuen Vertrag.
 */

interface Props {
  name?: string
  berater?: Ansprechpartner
  hrKontakt?: Ansprechpartner
}

const Mail = ({ name, berater, hrKontakt }: Props) => {
  const person = hrKontakt?.name ? hrKontakt : berater
  const vorname = (name || '').trim().split(/\s+/)[0] || ''

  return (
    <EmailLayout
      augenbraue="Abschluss"
      titel="Wir legen deinen Vertrag vorerst beiseite"
      vorschau="Kein Problem. Wenn es wieder passt, melde dich gern."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz>
        vor zwei Wochen haben wir dir deinen Handelsvertretervertrag geschickt, und seitdem haben wir
        nichts mehr von dir gehört. Wir gehen deshalb davon aus, dass sich deine Prioritäten
        verschoben haben, und das ist völlig in Ordnung.
      </Absatz>

      <Absatz>
        Wir schließen den Vorgang damit ab und melden uns nicht weiter. Der Link aus der
        Vertragsmail ist damit nicht mehr aktiv.
      </Absatz>

      <Absatz>
        Wird das Thema für dich wieder interessant, komm gern jederzeit auf uns zu. Dann gehen wir
        neu ins Gespräch und schauen gemeinsam, was zu dir passt.
      </Absatz>

      <Absatz letzter>Danke für die Zeit, die du dir für die Gespräche mit uns genommen hast.</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Wir legen deinen Vertrag vorerst beiseite',
  displayName: 'Vertrag, Abschluss an Tag 14',
  previewData: {
    name: 'Max Mustermann',
    hrKontakt: {
      name: 'Sarah Kaiser-Thom',
      rolle: berufsbezeichnung('hr'),
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
