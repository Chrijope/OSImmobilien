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
 * Finanzierungsanfrage zur Unterschrift (16.11.2026). Förmlich wie die
 * Selbstauskunft. Die Anfrage selbst ist das deutsche Formular des
 * Finanzierers; die Mail folgt der Kundensprache.
 */
const DE = {
  betreff: 'Ihre Finanzierungsanfrage: bitte prüfen und unterschreiben',
  augenbraue: 'Ihre Unterschrift',
  titel: 'Ihre Finanzierungsanfrage',
  vorschau: 'Ihre Finanzierungsanfrage liegt zur Unterschrift bereit.',
  fuss: 'Die Unterschrift erfolgt digital und ist rechtsverbindlich.',
  text: (objekt: string) =>
    `wir haben Ihre Finanzierungsanfrage${objekt ? ` für ${objekt}` : ''} mit den Angaben aus Ihrer Selbstauskunft vorbereitet. Bitte prüfen Sie die Angaben und die Erklärungen auf der letzten Seite und bestätigen Sie sie mit Ihrer Unterschrift, am Bildschirm oder per QR-Code am Smartphone.`,
  gueltig: (bis: string) => `Der Link gilt bis ${bis}.`,
  knopf: 'Finanzierungsanfrage prüfen und unterschreiben',
  hinweis: 'Etwa 5 Minuten',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your financing request: please review and sign',
    augenbraue: 'Your signature',
    titel: 'Your financing request',
    vorschau: 'Your financing request is ready for your signature.',
    fuss: 'The signature is given digitally and is legally binding.',
    text: (objekt: string) =>
      `we have prepared your financing request (Finanzierungsanfrage)${objekt ? ` for ${objekt}` : ''} using the details from your self-disclosure. Please check the details and the declarations on the last page and confirm them with your signature, on screen or via QR code on your smartphone. The form is in German.`,
    gueltig: (bis: string) => `The link is valid until ${bis}.`,
    knopf: 'Review and sign the financing request',
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
  displayName: 'Finanzierungsanfrage Signatur-Anfrage',
  sprachen: DE_EN,
  previewData: {
    name: 'Max Mustermann',
    signUrl: 'https://osimmobilien.netlify.app/signatur?token=beispiel&type=finanzierungsanfrage_p1',
    gueltigBis: '30.11.2026',
    objektTitel: 'Hauffstraße 38 d, Stuttgart',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
