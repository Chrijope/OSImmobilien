import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  name?: string
  signUrl?: string
  gueltigBis?: string
  objektTitel?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

/**
 * Vereinbarung über eine Mietzuzahlung zur Unterschrift (30.10.2026).
 * Förmlich wie die Reservierungsvereinbarung: ein Vertrag mit dem Kunden.
 */
const DE = {
  betreff: 'Vereinbarung über eine Mietzuzahlung: bitte unterschreiben',
  augenbraue: 'Ihre Unterschrift',
  titel: 'Ihre Vereinbarung über eine Mietzuzahlung',
  vorschau: 'Die Vereinbarung über eine Mietzuzahlung liegt zur Unterschrift bereit.',
  fuss: 'Die Unterschrift erfolgt digital und ist rechtsverbindlich.',
  text: (objekt: string) =>
    `die Vereinbarung über die Mietzuzahlung${objekt ? ` für ${objekt}` : ''} ist vorbereitet und von der OS Mietpool Verwaltung bereits unterzeichnet. Bitte lesen Sie sie vollständig durch und bestätigen Sie sie mit Ihrer Unterschrift, am Bildschirm oder per QR-Code am Smartphone.`,
  gueltig: (bis: string) => `Der Link gilt bis ${bis}.`,
  knopf: 'Vereinbarung prüfen und unterschreiben',
  hinweis: 'Etwa 5 Minuten',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Rent subsidy agreement: please sign',
    augenbraue: 'Your signature',
    titel: 'Your rent subsidy agreement',
    vorschau: 'The rent subsidy agreement is ready for your signature.',
    fuss: 'The signature is given digitally and is legally binding.',
    text: (objekt: string) =>
      `the agreement on a rent subsidy (Mietzuzahlung)${objekt ? ` for ${objekt}` : ''} has been prepared and already signed by OS Mietpool Verwaltung. Please read it in full and confirm it with your signature, on screen or via QR code on your smartphone.`,
    gueltig: (bis: string) => `The link is valid until ${bis}.`,
    knopf: 'Review and sign the agreement',
    hinweis: 'About 5 minutes',
  },
}

const Mail = ({ name, signUrl, gueltigBis, objektTitel, berater, sprache, kundeAnrede }: Props) => {
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
      <Absatz letzter={!gueltigBis}>{t.text(objektTitel || '')}</Absatz>
      {gueltigBis && <Absatz letzter>{t.gueltig(gueltigBis)}</Absatz>}
      <Handlung sprache={sprache} href={signUrl || ''} text={t.knopf} hinweis={t.hinweis} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Mietzuzahlung Signatur-Anfrage',
  sprachen: DE_EN,
  previewData: {
    name: 'Max Mustermann',
    signUrl: 'https://osimmobilien.netlify.app/signatur?token=beispiel&type=mietzuzahlung_kunde',
    gueltigBis: '13.11.2026',
    objektTitel: 'Hauffstraße 38 d, WE 21',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
