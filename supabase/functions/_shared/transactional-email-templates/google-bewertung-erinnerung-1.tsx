import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

const GOOGLE_URL = 'https://g.page/r/CQnu_vXGxzy_EAE/review'

/**
 * Erste Erinnerung an die Google-Bewertung, vier Tage nach der Einladung.
 *
 * Kürzer als die Einladung, weil der Anlass bekannt ist.
 *
 * Der Satz zu einer bereits abgegebenen Bewertung ist notwendig, nicht höflich:
 * Google meldet uns nicht zurück, wer dort bewertet hat. Wir können also nicht
 * wissen, ob diese Mail überflüssig ist, und wer schon bewertet hat, soll sich
 * nicht falsch angesprochen fühlen.
 */
interface Props {
  kundeName?: string
  vpName?: string
  googleUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: 'Eine Minute für deine Bewertung?',
  wenRueckfall: 'deinen persönlichen Ansprechpartner',
  augenbraue: 'Kurze Erinnerung',
  titel: 'Eine Minute für uns?',
  vorschau: 'Ein paar Sätze bei Google helfen anderen weiter.',
  frage: (wen: string) =>
    `vor ein paar Tagen hatten wir gefragt, wie du die Betreuung durch ${wen} erlebt hast. Falls du noch nicht dazu gekommen bist, hier noch einmal der Link.`,
  saetze:
    'Zwei, drei Sätze genügen völlig. Sie helfen Menschen, die gerade vor derselben Entscheidung stehen wie du vor einigen Wochen.',
  knopf: 'Bei Google bewerten',
  hinweis: 'Etwa 1 Minute',
  schon: 'Falls du uns bereits bewertet hast: vielen Dank, dann ist diese Nachricht hinfällig.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'One minute for your review?',
    wenRueckfall: 'your personal contact person',
    augenbraue: 'A quick reminder',
    titel: 'One minute for us?',
    vorschau: 'A few sentences on Google help others.',
    frage: (wen: string) =>
      `A few days ago we asked how you experienced the support from ${wen}. In case you have not got round to it yet, here is the link once more.`,
    saetze:
      'Two or three sentences are quite enough. They help people who are now facing the same decision you faced a few weeks ago.',
    knopf: 'Review us on Google',
    hinweis: 'About 1 minute',
    schon: 'If you have already reviewed us: thank you very much, in that case please disregard this message.',
  },
}

const Mail = ({ kundeName, vpName, googleUrl, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const wen = vpName || berater?.name || t.wenRueckfall

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz>{t.frage(wen)}</Absatz>

      <Absatz letzter>{t.saetze}</Absatz>

      <Handlung sprache={sprache} href={googleUrl || GOOGLE_URL} text={t.knopf} hinweis={t.hinweis} />

      <Absatz letzter>{t.schon}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) => texteFuer(TEXTE, d?.sprache).betreff,
  displayName: 'Google-Bewertung Erinnerung 1 (Kunde)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    vpName: 'Christian Peetz',
    googleUrl: GOOGLE_URL,
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
