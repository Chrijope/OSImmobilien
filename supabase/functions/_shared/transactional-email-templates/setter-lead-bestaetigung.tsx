import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Schritte, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  kundeName?: string
  beraterName?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: 'Unser Telefonat und wie es weitergeht',
  augenbraue: 'Wir haben gesprochen',
  titel: 'Schön, dass wir uns gehört haben',
  vorschau: 'Die wichtigsten Punkte aus unserem Telefonat und wie es weitergeht.',
  text: (berater: string) =>
    `danke für das Telefonat. Wie besprochen meldet sich ${berater || 'dein Ansprechpartner'} bei dir, um mit dir in Ruhe durchzugehen, was in deiner Situation möglich ist.`,
  schritteTitel: 'Wie es weitergeht',
  schritte: [
    'Ein ausführliches Erstgespräch, meist per Videocall, etwa 45 Minuten.',
    'Wir rechnen deine Situation gemeinsam durch, mit deinen echten Zahlen.',
    'Du entscheidest danach in Ruhe, ob und wie es weitergeht.',
  ],
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Our phone call and what happens next',
    augenbraue: 'Following our call',
    titel: 'Great to have spoken with you',
    vorschau: 'The key points from our phone call and what happens next.',
    text: (berater: string) =>
      `Thank you for the phone call. As agreed, ${berater || 'your contact person at MOREImmo'} will get in touch with you to go through calmly what is possible in your situation.`,
    schritteTitel: 'What happens next',
    schritte: [
      'A detailed initial consultation, usually by video call, about 45 minutes.',
      'We work through your situation together, using your real figures.',
      'Afterwards, you decide in your own time whether and how to proceed.',
    ],
  },
}

const Mail = ({ kundeName, beraterName, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz letzter>{t.text(beraterName || '')}</Absatz>

      <Schritte titel={t.schritteTitel} punkte={t.schritte} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Lead-Bestätigung (nach Anruf)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    beraterName: 'Christian Peetz',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
