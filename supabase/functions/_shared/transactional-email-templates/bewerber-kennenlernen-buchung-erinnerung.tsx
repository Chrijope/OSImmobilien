import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import {
  BUCHUNG_ERINNERUNG_2_BETREFF,
  BUCHUNG_ERINNERUNG_2_SCHLUSS,
  BUCHUNG_ERINNERUNG_2_TEXT,
  BUCHUNG_ERINNERUNG_2_TITEL,
  BUCHUNG_ERINNERUNG_2_VORSCHAU,
  BUCHUNG_ERINNERUNG_BETREFF,
  BUCHUNG_ERINNERUNG_KNOPF,
  BUCHUNG_ERINNERUNG_SCHLUSS,
  BUCHUNG_ERINNERUNG_TEXT,
  BUCHUNG_ERINNERUNG_TITEL,
  BUCHUNG_ERINNERUNG_VORSCHAU,
  zusammenfassungKnopfHinweis,
} from '../bewerber-kennenlernen-mail.ts'

/**
 * Die Erinnerungen an den Termin, drei und sieben Tage nach dem Absenden.
 *
 * Eine Vorlage für beide Stufen, der Unterschied steckt im Feld `stufe`.
 * Dieselbe Aufteilung wie bei `bewerber-termin-bestaetigung`, die drei
 * Vorgänge in einer Vorlage führt: Zwei getrennte Dateien für zwei Absätze
 * laufen mit der Zeit auseinander, und dann sieht die zweite Mail anders aus
 * als die erste.
 *
 * Bis zum 07.09.2026 gab es hier nur eine Stufe, und danach verschwand der
 * Bewerber still. Das war die größte Lücke des Ablaufs: Wer den Bogen
 * ausgefüllt hat, ist erkennbar interessiert. Die zweite Stufe kündigt den
 * Anruf an, die dritte Stufe ist keine Mail an ihn mehr, sondern die Bitte an
 * die HR-Managerin, zum Hörer zu greifen.
 *
 * Nicht zu verwechseln mit den beiden Erinnerungen an das Kennenlernen selbst
 * (`bewerber-kennenlernen-erinnerung-1` und `-2`). Die laufen vor dem
 * Absenden, diese danach, und beide zusammen können einen Bewerber nicht
 * treffen: Ein abgeschickter Bogen beendet die erste Kette.
 *
 * Kein Abmeldeknopf. Wer bis hierher gekommen ist, hat sein Kennenlernen
 * fertig gemacht; ihm hier einen Ausstieg vor die Nase zu halten, wäre das
 * falsche Angebot. Der Weg zurück steht als Satz darunter.
 */

/** Was sich je Stufe unterscheidet. Der Rest der Mail ist derselbe. */
const STUFEN = {
  '1': {
    titel: BUCHUNG_ERINNERUNG_TITEL,
    vorschau: BUCHUNG_ERINNERUNG_VORSCHAU,
    betreff: BUCHUNG_ERINNERUNG_BETREFF,
    text: BUCHUNG_ERINNERUNG_TEXT,
    schluss: BUCHUNG_ERINNERUNG_SCHLUSS,
  },
  '2': {
    titel: BUCHUNG_ERINNERUNG_2_TITEL,
    vorschau: BUCHUNG_ERINNERUNG_2_VORSCHAU,
    betreff: BUCHUNG_ERINNERUNG_2_BETREFF,
    text: BUCHUNG_ERINNERUNG_2_TEXT,
    schluss: BUCHUNG_ERINNERUNG_2_SCHLUSS,
  },
} as const

type StufenSchluessel = keyof typeof STUFEN

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 176 60995539',
  email: 'office@more.immo',
}

interface Props {
  /** „1" für Tag 3, „2" für Tag 7. Fehlt sie, gilt die erste. */
  stufe?: StufenSchluessel
  bewerberName?: string
  terminLink?: string
  dauerMinuten?: number
  berater?: Ansprechpartner
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  stufe = '1',
  hrKontakt,
  bewerberName,
  terminLink,
  dauerMinuten = 30,
  berater,
}: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)
  const wortlaut = STUFEN[stufe] ?? STUFEN['1']

  return (
    <EmailLayout
      augenbraue="Dein Kennenlernen"
      titel={wortlaut.titel}
      vorschau={wortlaut.vorschau}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>{wortlaut.text}</Absatz>

      {terminLink && (
        <Handlung
          href={terminLink}
          text={BUCHUNG_ERINNERUNG_KNOPF}
          hinweis={zusammenfassungKnopfHinweis(dauerMinuten)}
        />
      )}

      <Absatz letzter>{wortlaut.schluss}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    (STUFEN[(data?.stufe as StufenSchluessel) ?? '1'] ?? STUFEN['1']).betreff,
  displayName: 'Bewerber Kennenlernen, Erinnerung an den Termin (Tag 3 und Tag 7)',
  previewData: {
    stufe: '1',
    bewerberName: 'Max Mustermann',
    terminLink: 'https://portal.more.immo/kennenlernen/beispiel-token',
    dauerMinuten: 30,
    berater: STANDARD,
  },
} satisfies TemplateEntry
