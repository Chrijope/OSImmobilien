import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  name?: string
  vpName?: string
  objektTitel?: string
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

/**
 * Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4).
 *
 * Die Vereinbarung selbst ist bis Etappe 4 nur deutsch. Die englische Mail
 * sagt das, damit der Kunde nicht ueberrascht auf der Signaturseite steht.
 */
const DE = {
  betreff: 'Ihre Reservierungsvereinbarung: bitte unterschreiben',
  augenbraue: 'Ihre Unterschrift',
  titel: 'Ihre Reservierungsvereinbarung',
  vorschau: 'Die Reservierungsvereinbarung liegt zur Unterschrift bereit.',
  fuss: 'Die Unterschrift erfolgt digital und ist rechtsverbindlich.',
  text: (objekt: string, vp: string) =>
    `die Reservierungsvereinbarung${objekt ? ` für ${objekt}` : ''} ist vorbereitet${vp ? ` und von ${vp} bereits unterzeichnet` : ''}. Mit Ihrer Unterschrift ist die Einheit für Sie reserviert und wird niemandem sonst angeboten.`,
  nurDeutsch: '',
  knopf: 'Reservierung prüfen und unterschreiben',
  hinweis: (bis: string) => `Etwa 3 Minuten${bis ? `  ·  Link gültig bis ${bis}` : ''}`,
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your reservation agreement: please sign',
    augenbraue: 'Your signature',
    titel: 'Your reservation agreement',
    vorschau: 'The reservation agreement is ready for your signature.',
    fuss: 'The signature is given digitally and is legally binding.',
    text: (objekt: string, vp: string) =>
      `The reservation agreement${objekt ? ` for ${objekt}` : ''} has been prepared${vp ? ` and has already been signed by ${vp}` : ''}. With your signature, the unit is reserved for you and will not be offered to anyone else.`,
    nurDeutsch:
      'Please note that the agreement itself is currently only available in German. Your contact person at OS Immobilien will be glad to go through it with you before you sign.',
    knopf: 'Review and sign the reservation',
    hinweis: (bis: string) => `About 3 minutes${bis ? `  ·  Link valid until ${bis}` : ''}`,
  },
}

const Mail = ({ name, vpName, objektTitel, signUrl, signatureUrl, gueltigBis, berater, sprache, kundeAnrede }: Props) => {
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
      <Absatz letzter={!t.nurDeutsch}>{t.text(objektTitel || '', vpName || '')}</Absatz>
      {t.nurDeutsch && <Absatz letzter>{t.nurDeutsch}</Absatz>}

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
  displayName: 'Reservierung Signatur-Anfrage',
  sprachen: DE_EN,
  previewData: {
    name: 'Herr Mustermann',
    vpName: 'Christian Peetz',
    objektTitel: 'Breitscheidstraße 18, Wohnung 12',
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
