import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { BEWERBER_ANZAHL_FRAGEN } from '../bewerber-eingangsmail.ts'

/**
 * Genau EINE Erinnerung, drei Tage nach der Eingangsmail.
 *
 * Bewusst nicht die dreistufige Kaskade, die für die Selbstauskunft gebaut ist.
 * Der Selbstauskunfts-Kunde hat sich bereits für eine Immobilie entschieden,
 * der Bewerber hat sich noch für gar nichts entschieden. Drei Erinnerungen
 * wären an dieser Stelle Druck und würden Absprünge erzeugen.
 *
 * Sie geht nur, solange der Fragebogen offen ist UND das Erstgespräch noch
 * nicht geführt wurde. Wer schon am Telefon war, braucht keinen Fragebogen
 * mehr.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 30 863289210',
  email: 'os@os-immobilien.com',
}

interface Props {
  bewerberName?: string
  formularLink?: string
  ablaufdatum?: string
  anzahlFragen?: number
  beraterName?: string
  beraterEmail?: string
  beraterTelefon?: string
  beraterRolle?: string
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
  formularLink,
  ablaufdatum,
  anzahlFragen = BEWERBER_ANZAHL_FRAGEN,
  beraterName,
  beraterEmail,
  beraterTelefon,
  beraterRolle,
  berater,
}: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : {
    name: berater?.name || beraterName || STANDARD.name,
    rolle: berater?.rolle || beraterRolle || STANDARD.rolle,
    telefon: berater?.telefon || beraterTelefon || STANDARD.telefon,
    email: berater?.email || beraterEmail || STANDARD.email,
  }

  return (
    <EmailLayout
      augenbraue="Deine Bewerbung"
      titel="Dein Fragebogen wartet noch"
      vorschau="Dein Fragebogen liegt noch offen, drei Minuten genügen."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz>
        vor ein paar Tagen haben wir dir einen kurzen Fragebogen geschickt. Er ist noch
        offen, und das ist überhaupt kein Problem, wir wollten dich nur einmal daran
        erinnern.
      </Absatz>

      <Absatz letzter>
        Es sind {anzahlFragen} kurze Fragen, das meiste zum Antippen. Drei Minuten, dann wissen
        wir vor unserem Telefonat, wo du stehst und was du vorhast.
      </Absatz>

      {/* Ohne Ziel lieber kein Knopf, siehe Einladungsvorlage. */}
      {formularLink && (
        <Handlung
          href={formularLink}
          text="Jetzt ausfüllen, 3 Minuten"
          hinweis={ablaufdatum ? `Der Link gilt noch bis zum ${ablaufdatum}` : undefined}
        />
      )}

      <Absatz letzter>
        Falls du es dir anders überlegt hast, sag uns einfach kurz Bescheid. Eine kurze
        Antwort auf diese Mail genügt, dann hören wir auf, dich zu behelligen.
      </Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Kurz zu dir, bevor wir telefonieren',
  displayName: 'Bewerber Fragebogen Erinnerung',
  previewData: {
    bewerberName: 'Max Mustermann',
    formularLink: 'https://osimmobilien.netlify.app/bewerberfragen/beispiel-token',
    ablaufdatum: '2. September 2026',
    berater: STANDARD,
  },
} satisfies TemplateEntry
