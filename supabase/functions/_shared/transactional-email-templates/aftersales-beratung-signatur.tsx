import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
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

/** Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4). */
const DE = {
  betreff: 'Beratungsprotokoll: bitte unterschreiben',
  augenbraue: 'Ihre Unterschrift',
  titel: 'Das Beratungsprotokoll zu Ihrem Notartermin',
  vorschau: 'Das Beratungsprotokoll liegt zur Unterschrift bereit.',
  fuss: 'Die Unterschrift erfolgt digital und ist rechtsverbindlich.',
  text: (vp: string) =>
    `${vp ? `${vp} hat ` : 'Ihr Berater hat '}das Beratungsprotokoll zu Ihrem Notartermin ausgefüllt und bereits unterzeichnet. Bitte prüfen Sie, ob alles Ihrem Gespräch entspricht, und bestätigen Sie es mit Ihrer Unterschrift.`,
  knopf: 'Protokoll prüfen und unterschreiben',
  hinweis: 'Etwa 3 Minuten',
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
      `${vp || 'Your contact person at OS Immobilien'} has completed and already signed the consultation record for your notary appointment (Notartermin). Please check that everything reflects your conversation and confirm it with your signature.`,
    knopf: 'Review and sign the record',
    hinweis: 'About 3 minutes',
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
      anrede={foermlich(name, sprache, kundeAnrede)}
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
    name: 'Herr Mustermann',
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
