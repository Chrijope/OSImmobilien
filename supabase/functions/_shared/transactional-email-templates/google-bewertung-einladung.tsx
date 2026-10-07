import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/** Die öffentliche Bewertungsseite bei Google. */
const GOOGLE_URL = 'https://g.page/r/CQnu_vXGxzy_EAE/review'

/**
 * Bitte um eine öffentliche Google-Bewertung, eine Stunde nach dem Notartermin.
 *
 * Bewusst getrennt von der internen Bewertung des Vertriebspartners. Die beiden
 * Bitten haben verschiedene Adressaten: Google richtet sich an Menschen, die
 * gerade suchen, die interne Rückmeldung an unser Qualitätsmanagement. In einer
 * Mail zusammengefasst müsste der Leser wählen, und dann tut er meist keines
 * von beidem.
 *
 * Der Ton ist zurückhaltend. Eine Bewertung ist eine Gefälligkeit und keine
 * Gegenleistung, und der Kunde hat gerade sechsstellig investiert.
 */
interface Props {
  kundeName?: string
  vpName?: string
  googleUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: 'Würdest du uns weiterempfehlen?',
  wenRueckfall: 'deinen persönlichen Ansprechpartner',
  augenbraue: 'Nach deinem Notartermin',
  titel: 'Würdest du uns weiterempfehlen?',
  vorschau: 'Eine Minute bei Google hilft anderen bei ihrer Entscheidung.',
  glueckwunsch:
    'herzlichen Glückwunsch zu deinem Notartermin. Der wichtigste Schritt ist geschafft, und wir freuen uns, dass wir dich dabei begleiten durften.',
  vertrauen:
    'Eine Kapitalanlage ist Vertrauenssache. Die meisten, die sich bei uns melden, haben vorher gelesen, wie es anderen ergangen ist. Genau deshalb ist deine Erfahrung so wertvoll: Sie hilft Menschen, die gerade dort stehen, wo du vor einigen Wochen standest.',
  bitte: (wen: string) =>
    `Wenn du mit der Betreuung durch ${wen} zufrieden warst, würden wir uns über ein paar Sätze bei Google sehr freuen.`,
  knopf: 'Bei Google bewerten',
  hinweis: 'Etwa 1 Minute · Öffentlich sichtbar',
  direkt:
    'Sollte etwas nicht gut gelaufen sein, sag es uns bitte lieber direkt. Antworte einfach auf diese E-Mail, dann kümmern wir uns darum.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Would you recommend us?',
    wenRueckfall: 'your personal contact person',
    augenbraue: 'After your notary appointment',
    titel: 'Would you recommend us?',
    vorschau: 'One minute on Google helps others with their decision.',
    glueckwunsch:
      'Congratulations on your notary appointment. The most important step is done, and we are glad that we were able to accompany you along the way.',
    vertrauen:
      'An investment property is a matter of trust. Most people who contact us have first read about other people’s experiences. That is exactly why your experience is so valuable: it helps people who are now where you were a few weeks ago.',
    bitte: (wen: string) =>
      `If you were happy with the support from ${wen}, we would be very pleased if you could write a few sentences on Google.`,
    knopf: 'Review us on Google',
    hinweis: 'About 1 minute · Publicly visible',
    direkt:
      'If something did not go well, please tell us directly instead. Simply reply to this email and we will take care of it.',
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
      <Absatz>{t.glueckwunsch}</Absatz>

      <Absatz>{t.vertrauen}</Absatz>

      <Absatz letzter>{t.bitte(wen)}</Absatz>

      <Handlung sprache={sprache} href={googleUrl || GOOGLE_URL} text={t.knopf} hinweis={t.hinweis} />

      <Absatz letzter>{t.direkt}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) => texteFuer(TEXTE, d?.sprache).betreff,
  displayName: 'Google-Bewertung Einladung (Kunde)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    vpName: 'Christian Peetz',
    googleUrl: GOOGLE_URL,
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
