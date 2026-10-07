import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Hinweis, Schritte, type Ansprechpartner } from './_layout.tsx'

/**
 * Die Erinnerung an den Video-Call im Bewerberprozess.
 *
 * Anrede Du, wie der gesamte Bewerberweg. Sie siezte bis zum 14.09.2026 und
 * war damit neben der Erstgesprächserinnerung die letzte Mail, die aus der
 * Reihe fiel.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Peetz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 1515 0275108',
  email: 'c.peetz@more.immo',
}

interface Props {
  bewerberName?: string
  beraterName?: string
  beraterEmail?: string
  beraterTelefon?: string
  terminDatum?: string
  terminUhrzeit?: string
  vorText?: string
  berater?: Ansprechpartner
  /**
   * Die HR-Managerin fuer den Kasten am Fuss der Mail.
   *
   * Getrennt von `berater`: Der fuehrt das Gespraech und gehoert in die
   * Terminangabe, die HR-Managerin bearbeitet die Bewerbung und ist die,
   * bei der man sich meldet. Frueher war das dasselbe Feld, und dann stand
   * unter jeder Mail derselbe Name wie im Termin.
   */
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  hrKontakt,
  bewerberName,
  beraterName,
  beraterEmail,
  beraterTelefon,
  terminDatum,
  terminUhrzeit,
  vorText,
  berater,
}: Props) => {
  const wann = vorText?.trim() || 'in Kürze'
  // Nur der Vorname, wie in allen Mails des Bewerberwegs.
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  // Im Fusskasten steht die HR-Managerin, sobald ihr Profil geladen wurde.
  const person: Ansprechpartner = hrKontakt?.name
    ? hrKontakt
    : {
        name: berater?.name || beraterName || STANDARD.name,
        rolle: berater?.rolle || STANDARD.rolle,
        telefon: berater?.telefon || beraterTelefon || STANDARD.telefon,
        email: berater?.email || beraterEmail || STANDARD.email,
      }
  const zeilen: Array<[string, string]> = []
  if (terminDatum) zeilen.push(['Datum', terminDatum])
  if (terminUhrzeit) zeilen.push(['Uhrzeit', `${terminUhrzeit} Uhr`])
  // Wer das Gespraech fuehrt, ist nicht die HR-Managerin.
  /* STANDARD.name ist als optional typisiert, deshalb kann die Kette
     undefined ergeben. Die Zeile verlangt aber einen Text. */
  const gespraechspartner = berater?.name || beraterName || STANDARD.name || 'MOREImmo'
  zeilen.push(['Gesprächspartner', gespraechspartner])

  return (
    <EmailLayout
      augenbraue="Erinnerung"
      titel={`Unser Video-Call ${wann}`}
      vorschau={`Erinnerung an unseren Video-Call ${wann}.`}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>
        ich freue mich, {wann} mit dir tiefer einzusteigen, wie eine Zusammenarbeit aussehen kann.
      </Absatz>

      <Angaben titel="Dein Termin" zeilen={zeilen} />

      <Schritte
        titel="Worüber wir sprechen"
        punkte={[
          'Wie wir organisiert sind',
          'Welche Startmöglichkeiten du hast',
          'Welche davon zu dir passt',
        ]}
      />

      <Hinweis text="Den Zugangslink hast du mit der Terminbuchung per E-Mail bekommen. Halte ihn bitte rechtzeitig bereit." />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => `Erinnerung: Unser Video-Call ${data?.vorText || 'steht bevor'}`,
  displayName: 'Bewerber Closing-Termin Erinnerung',
  previewData: {
    bewerberName: 'Max Mustermann',
    terminDatum: '15.06.2026',
    terminUhrzeit: '15:00',
    vorText: 'in 48 Stunden',
    berater: STANDARD,
  },
} satisfies TemplateEntry
