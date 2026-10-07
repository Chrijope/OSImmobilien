import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Schritte, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface SaInvitationProps {
  kundeName?: string
  fillUrl?: string
  /** Bis wann der Link gilt, bereits als Datum formatiert. */
  gueltigBis?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

/** Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4). */
const DE = {
  betreff: 'Ihre Selbstauskunft für MOREImmo',
  augenbraue: 'Nächster Schritt',
  titel: 'Ihre Selbstauskunft',
  vorschau: 'Damit wir Ihnen eine belastbare Empfehlung geben können, brauchen wir ein vollständiges Bild Ihrer Situation.',
  fuss: 'Ihre Angaben werden verschlüsselt übertragen und nach DSGVO verarbeitet. Sie sind ausschließlich für die Finanzierungsanfrage bestimmt.',
  text: 'damit wir Ihnen eine belastbare Empfehlung geben können, brauchen wir ein vollständiges Bild Ihrer finanziellen Situation. Dafür ist die Selbstauskunft da.',
  knopf: 'Selbstauskunft ausfüllen',
  hinweis: (bis: string) => `Etwa 12 Minuten${bis ? `  ·  Link gültig bis ${bis}` : ''}`,
  schritteTitel: 'Was Sie erwartet',
  schritte: [
    'Persönliche Angaben und Adresse',
    'Einnahmen und Ausgaben im Monat',
    'Vermögen und bestehende Verbindlichkeiten',
    'Ihre Unterschrift, digital',
  ],
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your self-disclosure for MOREImmo',
    augenbraue: 'Next step',
    titel: 'Your self-disclosure',
    vorschau: 'In order to give you a sound recommendation, we need a complete picture of your situation.',
    fuss: 'Your details are transmitted in encrypted form and processed in accordance with the GDPR. They are used exclusively for the financing request.',
    text: 'In order to give you a sound recommendation, we need a complete picture of your financial situation. This is what the self-disclosure form (Selbstauskunft) is for.',
    knopf: 'Complete the self-disclosure',
    hinweis: (bis: string) => `About 12 minutes${bis ? `  ·  Link valid until ${bis}` : ''}`,
    schritteTitel: 'What to expect',
    schritte: [
      'Personal details and address',
      'Monthly income and expenses',
      'Assets and existing liabilities',
      'Your signature, given digitally',
    ],
  },
}

const SaInvitationEmail = ({ kundeName, fillUrl, gueltigBis, berater, sprache, kundeAnrede }: SaInvitationProps) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={foermlich(kundeName, sprache, kundeAnrede)}
      person={berater}
      fussHinweis={t.fuss}
    >
      <Absatz letzter>{t.text}</Absatz>

      <Handlung
        sprache={sprache}
        href={fillUrl || ''}
        text={t.knopf}
        hinweis={t.hinweis(datumFuer(gueltigBis, sprache))}
      />

      <Schritte titel={t.schritteTitel} punkte={t.schritte} />
    </EmailLayout>
  )
}

export const template = {
  component: SaInvitationEmail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Selbstauskunft-Einladung',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Herr Mustermann',
    fillUrl: 'https://portal.more.immo/sa/example-token',
    gueltigBis: '5. August 2026',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
