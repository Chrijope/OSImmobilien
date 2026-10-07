import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Schritte, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

const PORTAL_URL = 'https://portal.more.immo/kunde/vp-bewertung'

/**
 * Interne Bewertung des Vertriebspartners, eine Stunde nach dem Notartermin.
 *
 * Getrennt von der Google-Bitte, die zur selben Zeit hinausgeht. Diese hier
 * ist die vertrauliche: Sie landet im Kundenportal und geht nur an unser
 * Qualitätsmanagement. Deshalb darf sie nach Dingen fragen, die niemand
 * öffentlich schreiben würde.
 */
interface Props {
  kundeName?: string
  vpName?: string
  portalUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (vp: string) => (vp ? `Vertraulich: Wie war die Betreuung durch ${vp}?` : 'Vertraulich: Wie war deine Betreuung?'),
  wenRueckfall: 'deinen persönlichen Ansprechpartner',
  augenbraue: 'Vertraulich',
  titel: 'Wie war die Betreuung?',
  vorschau: (wen: string) => `Deine offene Rückmeldung zu ${wen}, nur für uns.`,
  einleitung: (wen: string) =>
    `neben der öffentlichen Bewertung interessiert uns noch etwas anderes, und dafür haben wir einen eigenen Weg: deine offene Rückmeldung zu ${wen}.`,
  vertraulich:
    'Diese Bewertung ist nicht öffentlich. Sie geht ausschließlich an unser Qualitätsmanagement und ist die Grundlage dafür, wie wir unsere Vertriebspartner weiterentwickeln und schulen.',
  kritik:
    'Deshalb hilft uns hier vor allem, was nicht rund lief. Kritik ist ausdrücklich erwünscht und hat keine Nachteile für dich.',
  knopf: 'Im Kundenportal bewerten',
  hinweis: 'Etwa 2 Minuten · Vertraulich',
  schritteTitel: 'So funktioniert es',
  schritte: [
    'Im persönlichen Kundenportal anmelden',
    'Die einzelnen Kategorien bewerten',
    'Wenn du möchtest, einen Kommentar hinterlassen',
  ],
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (vp: string) => (vp ? `Confidential: how was the support from ${vp}?` : 'Confidential: how was your support?'),
    wenRueckfall: 'your personal contact person',
    augenbraue: 'Confidential',
    titel: 'How was the support?',
    vorschau: (wen: string) => `Your honest feedback on ${wen}, for our eyes only.`,
    einleitung: (wen: string) =>
      `Besides the public review, there is something else we would like to know, and we have a separate channel for it: your honest feedback on ${wen}.`,
    vertraulich:
      'This review is not public. It goes exclusively to our quality management team and is the basis for how we develop and train our sales partners.',
    kritik:
      'That is why what did not go well is especially helpful here. Criticism is expressly welcome and has no disadvantages for you.',
    knopf: 'Leave your review in the customer portal',
    hinweis: 'About 2 minutes · Confidential',
    schritteTitel: 'How it works',
    schritte: [
      'Sign in to your personal customer portal',
      'Rate the individual categories',
      'Leave a comment if you like',
    ],
  },
}

const Mail = ({ kundeName, vpName, portalUrl, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const wen = vpName || berater?.name || t.wenRueckfall

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau(wen)}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz>{t.einleitung(wen)}</Absatz>

      <Absatz>{t.vertraulich}</Absatz>

      <Absatz letzter>{t.kritik}</Absatz>

      <Handlung sprache={sprache} href={portalUrl || PORTAL_URL} text={t.knopf} hinweis={t.hinweis} />

      <Schritte titel={t.schritteTitel} punkte={t.schritte} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) => texteFuer(TEXTE, d?.sprache).betreff(d?.vpName || ''),
  displayName: 'VP-Bewertung Einladung (Kunde, vertraulich)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    vpName: 'Christian Peetz',
    portalUrl: PORTAL_URL,
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
