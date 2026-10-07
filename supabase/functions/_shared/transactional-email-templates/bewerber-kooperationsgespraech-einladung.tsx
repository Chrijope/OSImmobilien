import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Luft, type Ansprechpartner } from './_layout.tsx'
import {
  EINLADUNG_AUGENBRAUE,
  EINLADUNG_BETREFF,
  EINLADUNG_FUSS_HINWEIS,
  EINLADUNG_GEFALLEN,
  EINLADUNG_GESPRAECH,
  EINLADUNG_KNOPF,
  EINLADUNG_KNOPF_HINWEIS,
  EINLADUNG_SCHLUSS,
  EINLADUNG_TERMINWAHL,
  EINLADUNG_TITEL,
  EINLADUNG_VORSCHAU,
} from '../bewerber-kooperationsgespraech-mail.ts'

/**
 * Die Einladung zum persönlichen Gespräch.
 *
 * Sie wird aus dem Bewerberprofil heraus verschickt, nachdem jemand den
 * eingereichten Kennenlernbogen gelesen hat. Vorher hat sich der Bewerber
 * seinen Termin am Ende des Bogens selbst gebucht; künftig laden wir gezielt
 * ein, und zwar die, deren Antworten uns überzeugt haben.
 *
 * Genau ein Knopf, und der führt auf die vorhandene Buchungsstrecke. Der Link
 * trägt dasselbe Token wie das Kennenlernen, es gibt keinen zweiten
 * Buchungsweg. Fehlt das Token, kommt der Knopf gar nicht erst mit; einen
 * Knopf ins Leere gibt es hier nicht.
 *
 * Drei Dinge stehen bewusst nicht drin:
 *
 *   1. **Keine Zusage.** Der Schlussabsatz sagt ausdrücklich, dass nichts
 *      entschieden ist. Ohne ihn liest sich die Mail wie ein Angebot.
 *   2. **Keine Dauer.** Wie lange gesprochen wird, ergibt sich aus seinen
 *      eigenen Antworten und steht auf der Buchungsseite, wo die Zahl stimmt.
 *   3. **Kein zweiter Knopf.** Wer absagen will, antwortet auf die Mail; das
 *      steht im Fuß.
 *
 * Wortlaut in `_shared/bewerber-kooperationsgespraech-mail.ts`, damit der
 * Vitest-Test ihn lesen kann. Anrede durchgängig Du, wie im Kennenlernen.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 176 60995539',
  email: 'office@more.immo',
}

interface Props {
  bewerberName?: string
  /** Die Buchungsstrecke, gebaut mit `kooperationsBuchungsLink`. */
  buchungsLink?: string
  berater?: Ansprechpartner
  /** Die HR-Managerin für den Kasten am Fuß der Mail. */
  hrKontakt?: Ansprechpartner
}

const Mail = ({ hrKontakt, bewerberName, buchungsLink, berater }: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)

  return (
    <EmailLayout
      augenbraue={EINLADUNG_AUGENBRAUE}
      titel={EINLADUNG_TITEL}
      vorschau={EINLADUNG_VORSCHAU}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
      fussHinweis={EINLADUNG_FUSS_HINWEIS}
    >
      <Absatz>{EINLADUNG_GEFALLEN}</Absatz>

      <Absatz>{EINLADUNG_GESPRAECH}</Absatz>

      <Absatz letzter>{EINLADUNG_TERMINWAHL}</Absatz>

      {buchungsLink && (
        <Handlung href={buchungsLink} text={EINLADUNG_KNOPF} hinweis={EINLADUNG_KNOPF_HINWEIS} />
      )}

      {/* Sonst klebt der Schlussabsatz an der Zeile unter dem Knopf. */}
      <Luft />

      <Absatz letzter>{EINLADUNG_SCHLUSS}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: EINLADUNG_BETREFF,
  displayName: 'Bewerber, Einladung zum persönlichen Gespräch',
  previewData: {
    bewerberName: 'Max Mustermann',
    buchungsLink: 'https://portal.more.immo/kooperationsgespraech/beispiel-token',
    berater: STANDARD,
  },
} satisfies TemplateEntry
