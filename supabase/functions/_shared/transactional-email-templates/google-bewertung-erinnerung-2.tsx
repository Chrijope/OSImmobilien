import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

const GOOGLE_URL = 'https://g.page/r/CQnu_vXGxzy_EAE/review'

/**
 * Zweite und letzte Erinnerung, zehn Tage nach der Einladung.
 *
 * Sie sagt ausdrücklich, dass es die letzte ist. Das ist keine Floskel, sondern
 * eine Zusage: Danach fragt das System nie wieder nach einer Bewertung zu
 * diesem Notartermin. Wer bis hierhin nicht reagiert hat, will nicht, und eine
 * dritte Bitte würde nur die Beziehung belasten.
 */
interface Props {
  kundeName?: string
  vpName?: string
  googleUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: 'Letzte Erinnerung: Deine Bewertung',
  augenbraue: 'Letzte Erinnerung',
  titel: 'Danach fragen wir nicht wieder',
  vorschau: 'Die letzte Bitte um deine Bewertung.',
  zweimal:
    'wir hatten dich zweimal um eine kurze Bewertung gebeten. Das war es dann auch, wir fragen nicht wieder nach.',
  moment:
    'Falls du doch noch einen Moment übrig hast, freuen wir uns sehr. Wenn nicht, ist das vollkommen in Ordnung, und wir wünschen dir viel Freude mit deiner Immobilie.',
  knopf: 'Bei Google bewerten',
  hinweis: 'Etwa 1 Minute',
  schon: 'Falls du uns bereits bewertet hast: vielen Dank, dann ist diese Nachricht hinfällig.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Final reminder: your review',
    augenbraue: 'Final reminder',
    titel: 'We will not ask again after this',
    vorschau: 'Our last request for your review.',
    zweimal: 'We have asked you twice for a short review. This is the last time; we will not ask again.',
    moment:
      'If you do have a moment to spare, we would be delighted. If not, that is perfectly fine, and we wish you every joy with your property.',
    knopf: 'Review us on Google',
    hinweis: 'About 1 minute',
    schon: 'If you have already reviewed us: thank you very much, in that case please disregard this message.',
  },
}

const Mail = ({ kundeName, googleUrl, berater, sprache }: Props) => {
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
      <Absatz>{t.zweimal}</Absatz>

      <Absatz letzter>{t.moment}</Absatz>

      <Handlung sprache={sprache} href={googleUrl || GOOGLE_URL} text={t.knopf} hinweis={t.hinweis} />

      <Absatz letzter>{t.schon}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) => texteFuer(TEXTE, d?.sprache).betreff,
  displayName: 'Google-Bewertung Erinnerung 2 (Kunde)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    googleUrl: GOOGLE_URL,
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
