import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

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
  gueltigBis?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

/** Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4). */
const DE = {
  betreff: 'Ihre Selbstauskunft: bitte unterschreiben',
  augenbraue: 'Ihre Unterschrift',
  titel: 'Ihre Selbstauskunft liegt zur Unterschrift bereit',
  vorschau: 'Ihre Selbstauskunft ist ausgefüllt. Es fehlt nur noch Ihre Unterschrift.',
  fuss: 'Die Unterschrift erfolgt digital und ist rechtsverbindlich. Ihre Angaben werden verschlüsselt übertragen.',
  text: (vp: string) =>
    `${vp ? `${vp} hat ` : ''}Ihre Selbstauskunft mit Ihren Angaben ausgefüllt. Bitte lesen Sie sie in Ruhe durch und bestätigen Sie am Ende mit Ihrer Unterschrift. Erst danach können wir sie an die Bank weitergeben.`,
  knopf: 'Dokument prüfen und unterschreiben',
  hinweis: (bis: string) => `Etwa 3 Minuten${bis ? `  ·  Link gültig bis ${bis}` : ''}`,
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your self-disclosure: please sign',
    augenbraue: 'Your signature',
    titel: 'Your self-disclosure is ready for signature',
    vorschau: 'Your self-disclosure has been completed. All that is missing is your signature.',
    fuss: 'The signature is given digitally and is legally binding. Your details are transmitted in encrypted form.',
    text: (vp: string) =>
      `${vp ? `${vp} has completed` : 'We have completed'} your self-disclosure (Selbstauskunft) with your details. Please read it carefully and confirm it with your signature at the end. Only then can we pass it on to the bank.`,
    knopf: 'Review and sign the document',
    hinweis: (bis: string) => `About 3 minutes${bis ? `  ·  Link valid until ${bis}` : ''}`,
  },
}

const Mail = ({ name, vpName, signUrl, signatureUrl, gueltigBis, berater, sprache, kundeAnrede }: Props) => {
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

      <Handlung
        sprache={sprache}
        href={signUrl || signatureUrl || ''}
        text={t.knopf}
        hinweis={t.hinweis(datumFuer(gueltigBis, sprache))}
      />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Selbstauskunft Signatur-Anfrage',
  sprachen: DE_EN,
  previewData: {
    name: 'Herr Mustermann',
    vpName: 'Christian Peetz',
    signUrl: 'https://osimmobilien.netlify.app/sign/example',
    gueltigBis: '5. August 2026',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
