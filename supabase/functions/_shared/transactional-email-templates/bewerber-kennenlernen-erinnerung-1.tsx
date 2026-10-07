import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, type Ansprechpartner } from './_layout.tsx'
import {
  ABMELDE_ERSATZ,
  ABMELDE_HINWEIS,
  ABMELDE_TEXT,
  ERINNERUNG_1_BETREFF,
  ERINNERUNG_1_NICHT_BEGONNEN,
  ERINNERUNG_1_SCHLUSS,
  ERINNERUNG_1_TITEL_NICHT_BEGONNEN,
  ERINNERUNG_1_TITEL_UNTERBROCHEN,
  ERINNERUNG_1_UNTERBROCHEN,
  ERINNERUNG_1_VORSCHAU_NICHT_BEGONNEN,
  ERINNERUNG_1_VORSCHAU_UNTERBROCHEN,
  ERINNERUNG_KNOPF_NICHT_BEGONNEN,
  ERINNERUNG_KNOPF_UNTERBROCHEN,
  KENNENLERNEN_BASIS_URL,
  kennenlernenLinkHinweis,
} from '../bewerber-kennenlernen-mail.ts'

/**
 * Die erste Erinnerung des neuen Bewerberprozesses, Tag 3.
 *
 * **Eine Vorlage, zwei Wortfassungen.** Wer noch gar nicht angefangen hat und
 * wer unterbrochen wurde, bekommt dieselbe Mail an demselben Tag, nur mit
 * einem anderen Satz. Zwei getrennte Vorlagen wären zwei Ketten, und zwei
 * Ketten schicken irgendwann zwei Mails an einem Vormittag.
 *
 * Der Wortlaut liegt in `_shared/bewerber-kennenlernen-mail.ts`, damit der
 * Vitest-Test ihn lesen kann.
 *
 * Der Abmeldeknopf steht bewusst als ruhiger Nebenweg unter dem Hauptknopf,
 * wie in der Nachfass-Mail. Wer erinnert wird und nicht mehr will, soll nicht
 * schweigen müssen; Schweigen ist in dieser Kette genau das Signal, das den
 * Anruf auslöst. Fehlt das Abmelde-Token, tritt an seine Stelle der Satz mit
 * dem Weg, den es sicher gibt: eine Antwort auf diese Mail.
 *
 * Anrede durchgängig Du, wie in der Einladung.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 30 863289210',
  email: 'os@os-immobilien.com',
}

interface Props {
  bewerberName?: string
  kennenlernenLink?: string
  /** Wie viele Tage der Link von Anfang an gilt. */
  gueltigTage?: number
  /** "unterbrochen" heißt: Es liegt schon ein Zwischenstand vor. */
  wortfassung?: 'nicht_begonnen' | 'unterbrochen'
  /** Der fertige Abmeldelink mit Token je Bewerber. Ohne ihn entfällt der Knopf. */
  abmeldeLink?: string
  berater?: Ansprechpartner
  /** Die HR-Managerin für den Kasten am Fuß der Mail. */
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  hrKontakt,
  bewerberName,
  kennenlernenLink,
  gueltigTage = 14,
  wortfassung = 'nicht_begonnen',
  abmeldeLink,
  berater,
}: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)
  const unterbrochen = wortfassung === 'unterbrochen'

  return (
    <EmailLayout
      augenbraue="Deine Bewerbung"
      titel={unterbrochen ? ERINNERUNG_1_TITEL_UNTERBROCHEN : ERINNERUNG_1_TITEL_NICHT_BEGONNEN}
      vorschau={unterbrochen ? ERINNERUNG_1_VORSCHAU_UNTERBROCHEN : ERINNERUNG_1_VORSCHAU_NICHT_BEGONNEN}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>
        {unterbrochen ? ERINNERUNG_1_UNTERBROCHEN : ERINNERUNG_1_NICHT_BEGONNEN}
      </Absatz>

      {/* Ohne Ziel lieber kein Knopf, siehe Einladungsvorlage. */}
      {kennenlernenLink && (
        <Handlung
          href={kennenlernenLink}
          text={unterbrochen ? ERINNERUNG_KNOPF_UNTERBROCHEN : ERINNERUNG_KNOPF_NICHT_BEGONNEN}
          hinweis={kennenlernenLinkHinweis(gueltigTage)}
        />
      )}

      {abmeldeLink
        ? <Nebenhandlung href={abmeldeLink} text={ABMELDE_TEXT} hinweis={ABMELDE_HINWEIS} />
        : <Absatz letzter>{ABMELDE_ERSATZ}</Absatz>}

      {/* Die Nebenhandlung setzt selbst keinen Abstand nach unten. */}
      {abmeldeLink && <div style={{ height: '28px', fontSize: 0, lineHeight: 0 }}>&nbsp;</div>}

      <Absatz letzter>{ERINNERUNG_1_SCHLUSS}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: ERINNERUNG_1_BETREFF,
  displayName: 'Bewerber Kennenlernen, erste Erinnerung an Tag 3',
  previewData: {
    bewerberName: 'Max Mustermann',
    kennenlernenLink: `${KENNENLERNEN_BASIS_URL}/beispiel-token`,
    wortfassung: 'nicht_begonnen',
    abmeldeLink: 'https://osimmobilien.netlify.app/bewerbung/kein-interesse/beispiel-token',
    berater: STANDARD,
  },
} satisfies TemplateEntry
