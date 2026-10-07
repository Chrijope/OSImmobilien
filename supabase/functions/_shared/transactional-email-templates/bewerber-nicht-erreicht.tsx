import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { BEWERBER_BUCHUNGSLINK } from '../bewerber-eingangsmail.ts'

/**
 * Seit dem 26.09.2026 gehen nur noch zwei davon hinaus: Text 1 nach dem
 * ersten und Text 5 nach dem fuenften erfolglosen Anruf (Entscheidung in
 * src/lib/bewerberNichtErreichtMail.ts). Die Texte 2 bis 4 bleiben stehen,
 * damit eine Vorschau oder ein alter Aufruf nicht ins Leere laeuft.
 *
 * Fuenf Anlaeufe, fuenf Tonlagen. Der letzte ist der deutlichste.
 *
 * Mit demselben Buchungslink wie in der Eingangsmail (Entscheidung Christian,
 * 02.09.2026): Wer uns nicht ans Telefon bekommt, soll sich den Zeitpunkt fuer
 * das Informationsgespraech selbst aussuchen koennen. Wir rufen trotzdem
 * weiter an.
 *
 * Ebenso bewusst ohne durchnummerierte Ueberschriften: Ein sichtbarer Zaehler
 * macht dem Bewerber klar, dass er eine Nummer in einer Abarbeitungsliste ist.
 * Die Texte werden trotzdem von Mal zu Mal anders, nur eben ohne Strichliste.
 *
 * Die fuenfte ist die letzte Mail, nicht der letzte Anruf. Angerufen werden
 * darf weiter, und niemand wird deshalb automatisch abgelehnt. Der Text sagt
 * deshalb nur, dass wir mit dem Schreiben aufhoeren, nicht dass die Bewerbung
 * erledigt ist.
 */
const UEBERSCHRIFTEN: Record<number, string> = {
  1: 'Wir haben dich nicht erreicht',
  2: 'Wir versuchen es weiter',
  3: 'Noch einmal ohne Erfolg',
  4: 'Wir bleiben dran',
  5: 'Melde dich gerne bei uns',
}

const TEXTE: Record<number, string> = {
  1: 'vielen Dank für dein Interesse an einer vertrieblichen Zusammenarbeit mit MOREImmo. Wir haben gerade versucht, dich telefonisch zu erreichen, leider ohne Erfolg. Wir versuchen es zeitnah erneut.',
  2: 'wir haben erneut versucht, dich telefonisch zu erreichen, leider wieder ohne Erfolg. Kein Problem, das liegt meistens einfach am Timing. Wir versuchen es zeitnah noch einmal.',
  3: 'auch unser dritter Anruf hat dich leider nicht erreicht. Wir versuchen es zeitnah erneut. Wenn dir eine bestimmte Uhrzeit besser passt, schreib uns gerne kurz.',
  4: 'wir haben es erneut versucht und dich telefonisch leider nicht erreicht. Wir bleiben dran und melden uns zeitnah wieder.',
  5: 'wir haben nun mehrfach versucht, dich telefonisch zu erreichen, leider ohne Erfolg. Deine Bewerbung bleibt bei uns offen, wir schreiben dir dazu aber nicht mehr. Wenn du weiterhin Interesse hast, melde dich einfach direkt bei uns. Die Kontaktdaten stehen unten.',
}

interface Props {
  bewerberName?: string
  /** 1 bis 5. */
  versuch?: number
  beraterName?: string
  berater?: Ansprechpartner
  /**
   * Die HR-Ansprechpartnerin, gesetzt von send-transactional-email ueber ihre
   * Kennung. Sie steht unter der Mail und ist zugleich Absenderin.
   */
  hrKontakt?: Ansprechpartner
}

const Mail = ({ bewerberName, versuch = 1, beraterName, berater, hrKontakt }: Props) => {
  const v = Math.min(Math.max(Number(versuch) || 1, 1), 5)
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const letzter = v === 5
  // Zuerst die HR-Ansprechpartnerin: Unterschrift und Absender sollen
  // dieselbe Person zeigen.
  const person: Ansprechpartner | undefined =
    hrKontakt?.name ? hrKontakt : berater || (beraterName ? { name: beraterName } : undefined)

  return (
    <EmailLayout
      augenbraue="Deine Bewerbung"
      titel={UEBERSCHRIFTEN[v]}
      vorschau={
        letzter
          ? 'Wir haben dich mehrfach nicht erreicht. Deine Bewerbung bleibt offen.'
          : 'Wir haben dich telefonisch nicht erreicht und versuchen es zeitnah erneut.'
      }
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz>{TEXTE[v]}</Absatz>

      <Absatz letzter>
        Wenn es dir leichter fällt, kannst du dir über den folgenden Link auch selbst einen
        passenden Zeitpunkt für dein Informationsgespräch buchen, dann sprechen wir in Ruhe
        über die mögliche Zusammenarbeit.
      </Absatz>

      <Handlung
        href={BEWERBER_BUCHUNGSLINK}
        text="Gesprächstermin buchen, 60 Minuten"
        hinweis="Du wählst Tag und Uhrzeit selbst"
      />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const v = Math.min(Math.max(Number(data?.versuch) || 1, 1), 5)
    if (v === 5) return 'Wir erreichen dich nicht, melde dich gerne bei uns'
    if (v === 1) return 'Wir haben dich nicht erreicht'
    // Bewusst ohne Nummer im Betreff, siehe Kommentar bei UEBERSCHRIFTEN.
    return 'Wir haben dich telefonisch nicht erreicht'
  },
  displayName: 'Bewerber: Nicht erreicht (nach Versuch 1 und 5)',
  previewData: {
    bewerberName: 'Max Mustermann',
    versuch: 1,
    berater: {
      name: 'Sarah Kaiser-Thom',
      rolle: 'Dein Kontakt bei MOREImmo',
      telefon: '+49 151 12345678',
      email: 's.kaiser-thom@more.immo',
    },
  },
} satisfies TemplateEntry
