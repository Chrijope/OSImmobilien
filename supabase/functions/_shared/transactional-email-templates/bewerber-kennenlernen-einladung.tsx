import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Haken, Luft, T, type Ansprechpartner } from './_layout.tsx'
import {
  KENNENLERNEN_KNOPF_HINWEIS,
  KENNENLERNEN_DANKE,
  KENNENLERNEN_EINLADUNG,
  KENNENLERNEN_GESPRAECH,
  KENNENLERNEN_ABSAGE_HINWEIS,
  KENNENLERNEN_HINWEIS,
  KENNENLERNEN_PUNKTE,
  kennenlernenAntwortAdresse,
  kennenlernenLinkHinweis,
} from '../bewerber-kennenlernen-mail.ts'

/**
 * Die Eingangsmail des neuen Bewerberprozesses.
 *
 * Sie hat eine einzige Aufgabe: dass jemand das Kennenlernen öffnet. Deshalb
 * genau ein Knopf und kein zweiter daneben.
 *
 * Drei Dinge stehen hier bewusst nicht drin, anders als in der alten
 * Eingangsmail:
 *
 *   1. **Keine Zeitzusage.** Weder „etwa 8 Minuten" noch eine Zahl der Fragen.
 *      Die Bearbeitungszeit ist noch nicht gemessen, und eine ausgedachte Zahl
 *      hilft niemandem.
 *   2. **Kein Kalenderlink.** Der Termin kommt am Ende des Kennenlernens und
 *      nicht daneben. Zwei Wege am selben Punkt heben sich gegenseitig auf.
 *   3. **Keine Zusage eines Anrufs.** Den routinemäßigen Begrüßungsanruf gibt
 *      es im neuen Ablauf nicht mehr. Wer eine Frage hat, stellt sie
 *      schriftlich und bekommt eine Antwort.
 *
 * Wortlaut in `_shared/bewerber-kennenlernen-mail.ts`, damit der Vitest-Test
 * ihn lesen kann.
 *
 * Anrede durchgängig Du, wie auf der Website und im Kennenlernen selbst.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 176 60995539',
  email: 'office@more.immo',
}

interface Props {
  bewerberName?: string
  kennenlernenLink?: string
  gueltigTage?: number
  berater?: Ansprechpartner
  /** Die HR-Managerin für den Kasten am Fuß der Mail. */
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  hrKontakt,
  bewerberName,
  kennenlernenLink,
  gueltigTage = 14,
  berater,
}: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)

  /*
   * Die Adresse im Schlusssatz.
   *
   * Sie kommt aus derselben Person, die auch unten im Kasten steht, damit der
   * Satz „schreib mir direkt an" nicht auf jemand anderen zeigt als die
   * Unterschrift darunter. Fehlt sie, bleibt es bei der Sammeladresse.
   */
  const antwortAdresse = kennenlernenAntwortAdresse(person.email)

  return (
    <EmailLayout
      augenbraue="Deine Bewerbung"
      titel="Lass uns kennenlernen"
      vorschau="Wer wir sind, wer du bist, und was dabei für dich herauskommt. Etwa 15 Minuten."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
      fussHinweis={KENNENLERNEN_ABSAGE_HINWEIS}
    >
      <Absatz>{KENNENLERNEN_DANKE}</Absatz>

      <Absatz letzter>{KENNENLERNEN_EINLADUNG}</Absatz>

      <Haken punkte={KENNENLERNEN_PUNKTE} />

      {kennenlernenLink && (
        <Handlung
          href={kennenlernenLink}
          text="Kennenlernen starten"
          hinweis={KENNENLERNEN_KNOPF_HINWEIS}
        />
      )}

      {/* Christians Punkt A2: Der Schlussabsatz klebte an der Zeile unter dem Knopf. */}
      <Luft />

      {/*
        Der Ablaufabsatz steht seit dem 19.09.2026 UNTER dem Knopf.
        Davor standen 160 Woerter vor dem Knopf, jetzt sind es 110. Inhaltlich
        beantwortet er die Frage "und was passiert danach?", und die stellt man
        sich erst, wenn man weiss, was jetzt zu tun ist.
      */}
      <Absatz>{KENNENLERNEN_GESPRAECH}</Absatz>

      <Absatz letzter>{KENNENLERNEN_HINWEIS}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Lass uns kennenlernen',
  displayName: 'Bewerber Kennenlernen, Eingangsmail des neuen Prozesses',
  previewData: {
    bewerberName: 'Max Mustermann',
    kennenlernenLink: 'https://portal.more.immo/kennenlernen/beispiel-token',
    berater: STANDARD,
  },
} satisfies TemplateEntry
