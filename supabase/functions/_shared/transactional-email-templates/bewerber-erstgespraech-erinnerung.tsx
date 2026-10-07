import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Hinweis, type Ansprechpartner } from './_layout.tsx'

/**
 * Die Erinnerung an das telefonische Erstgespräch im Bewerberprozess.
 *
 * Anrede Du, wie der gesamte Bewerberweg. Bis zum 14.09.2026 siezte diese Mail
 * als eine der letzten: Der Bewerber wurde im Kennenlernen, in der Einladung
 * und in jeder Erinnerung geduzt und bekam ausgerechnet vor dem ersten
 * Telefonat ein „ich rufe Sie an".
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
  // Wer anruft, ist der Gespraechspartner und nicht die HR-Managerin.
  /* STANDARD.name ist als optional typisiert, deshalb kann die Kette
     undefined ergeben. Die Zeile verlangt aber einen Text. */
  const gespraechspartner = berater?.name || beraterName || STANDARD.name || 'MOREImmo'
  zeilen.push(['Wir rufen an', gespraechspartner])

  return (
    <EmailLayout
      augenbraue="Erinnerung"
      titel={`Unser Telefonat ${wann}`}
      vorschau={`Erinnerung an unser Erstgespräch ${wann}.`}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>
        ich freue mich auf unser Gespräch {wann} und rufe dich pünktlich zur vereinbarten Zeit an.
      </Absatz>

      <Angaben titel="Dein Termin" zeilen={zeilen} />

      <Hinweis text="Sei zur Uhrzeit bitte gut erreichbar, am besten in einer ruhigen Umgebung mit stabilem Empfang." />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => `Erinnerung: Unser Erstgespräch ${data?.vorText || 'steht bevor'}`,
  displayName: 'Bewerber Erstgespräch-Erinnerung',
  previewData: {
    bewerberName: 'Max Mustermann',
    terminDatum: '15.06.2026',
    terminUhrzeit: '15:00',
    vorText: 'in 48 Stunden',
    berater: STANDARD,
  },
} satisfies TemplateEntry
