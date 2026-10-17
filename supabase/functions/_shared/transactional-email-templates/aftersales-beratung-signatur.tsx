import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich, hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  name?: string
  vpName?: string
  signUrl?: string
  /**
   * Derselbe Link unter dem Namen, den die aufrufende Function schickt.
   *
   * Die Vorlage hiess immer `signUrl`, die Function sendet aber
   * `signatureUrl`. Damit war der Knopf leer und fuehrte ins Nichts:
   * Der Kunde klickte, und es passierte nichts. Gemeldet bei Hermann
   * Vogl. Beide Namen werden angenommen, damit es unabhaengig davon
   * funktioniert, welche Seite zuerst ausgerollt wird.
   */
  signatureUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

/**
 * Deutsch seit 17.10.2026 in der Du-Form (Christian: das Beratungsprotokoll
 * duzt), Englisch weiter foermlich.
 */
const DE = {
  betreff: 'Beratungsprotokoll: bitte unterschreiben',
  augenbraue: 'Deine Unterschrift',
  titel: 'Das Beratungsprotokoll zu deinem Notartermin',
  vorschau: 'Das Beratungsprotokoll liegt zur Unterschrift bereit.',
  fuss: 'Die Unterschrift erfolgt digital und ist rechtsverbindlich.',
  text: (vp: string) =>
    `${vp ? `${vp} hat ` : 'Dein Ansprechpartner hat '}das Beratungsprotokoll zu deinem Notartermin ausgefüllt und bereits unterzeichnet. Bitte lies es vollständig durch und bestätige es mit deiner Unterschrift.`,
  knopf: 'Protokoll prüfen und unterschreiben',
  hinweis: 'Etwa 10 Minuten',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Consultation record: please sign',
    augenbraue: 'Your signature',
    titel: 'The consultation record for your notary appointment',
    vorschau: 'The consultation record is ready for your signature.',
    fuss: 'The signature is given digitally and is legally binding.',
    text: (vp: string) =>
      `${vp || 'Your contact person at OS Immobilien'} has completed and already signed the consultation record for your notary appointment (Notartermin). Please read it in full and confirm it with your signature.`,
    knopf: 'Review and sign the record',
    hinweis: 'About 10 minutes',
  },
}

const Mail = ({ name, vpName, signUrl, signatureUrl, berater, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={sprache === 'en' ? foermlich(name, sprache, kundeAnrede) : hallo(name, sprache)}
      person={berater}
      fussHinweis={t.fuss}
    >
      <Absatz letzter>{t.text(vpName || '')}</Absatz>

      <Handlung sprache={sprache} href={signUrl || signatureUrl || ''} text={t.knopf} hinweis={t.hinweis} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Aftersales-Beratung Signatur-Anfrage',
  sprachen: DE_EN,
  previewData: {
    name: 'Max Mustermann',
    vpName: 'Christian Peetz',
    signUrl: 'https://osimmobilien.netlify.app/sign/example',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
