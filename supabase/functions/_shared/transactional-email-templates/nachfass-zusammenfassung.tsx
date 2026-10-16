import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Textblock, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'
import { istTeam } from './_nicht-erreicht.ts'

/**
 * Die Nachfass-Mail nach Erstgespräch oder Beratungspräsentation
 * (Strategie Vertrieb, Abschnitt 8, seit 16.10.2026).
 *
 * Eine Vorlage für den Partner: Er schickt sie innerhalb von zwei Stunden
 * nach dem Gespräch (Aufgabe „Gespräch zusammenfassen“, `nachfassplan.ts`)
 * und füllt vier Felder: das Ziel in den Worten des Kunden, was ihm wichtig
 * ist, offene Fragen, nächste Schritte. Ein leeres Feld fällt weg, damit nie
 * ein Platzhalter beim Kunden ankommt; die Platzhalter stehen nur in den
 * Vorschaudaten.
 *
 * Absender ist der zuständige Partner, wie bei den Mails an nicht erreichte
 * Leads.
 */

interface Props {
  kundeName?: string
  kundeAnrede?: string
  /** Tag des Gesprächs. */
  gespraechDatum?: string
  ziel?: string
  wichtig?: string
  offeneFragen?: string
  naechsteSchritte?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: 'Unser Gespräch in Kürze',
  augenbraue: 'Zusammenfassung',
  titel: 'Unser Gespräch in Kürze',
  vorschau: 'Was wir besprochen haben und wie es weitergeht.',
  dank: (datum: string, team: boolean) =>
    `vielen Dank für das Gespräch${datum ? ` am ${datum}` : ''}. Hier ${team ? 'haben wir' : 'habe ich'} das Wichtigste für Sie zusammengefasst, damit Sie alles in Ruhe nachlesen können.`,
  ziel: 'Ihr Ziel, in Ihren Worten',
  wichtig: 'Was Ihnen wichtig ist',
  offeneFragen: 'Offene Fragen',
  naechsteSchritte: 'Die nächsten Schritte',
  schluss: (team: boolean) =>
    team
      ? 'Wenn wir etwas falsch verstanden haben oder Ihnen noch etwas einfällt, antworten Sie einfach auf diese Mail.'
      : 'Wenn ich etwas falsch verstanden habe oder Ihnen noch etwas einfällt, antworten Sie einfach auf diese Mail.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Our conversation in brief',
    augenbraue: 'Summary',
    titel: 'Our conversation in brief',
    vorschau: 'What we discussed and what happens next.',
    dank: (datum: string, team: boolean) =>
      `Thank you for the conversation${datum ? ` on ${datum}` : ''}. ${team ? 'We have' : 'I have'} summarised the key points for you here so that you can read through everything at your leisure.`,
    ziel: 'Your goal, in your own words',
    wichtig: 'What matters to you',
    offeneFragen: 'Open questions',
    naechsteSchritte: 'The next steps',
    schluss: (team: boolean) =>
      team
        ? 'If we have misunderstood anything or something else occurs to you, simply reply to this email.'
        : 'If I have misunderstood anything or something else occurs to you, simply reply to this email.',
  },
}

const Mail = ({ kundeName, kundeAnrede, gespraechDatum, ziel, wichtig, offeneFragen, naechsteSchritte, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const team = istTeam(berater)
  const bloecke: Array<[string, string | undefined]> = [
    [t.ziel, ziel],
    [t.wichtig, wichtig],
    [t.offeneFragen, offeneFragen],
    [t.naechsteSchritte, naechsteSchritte],
  ]

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={foermlich(kundeName, sprache, kundeAnrede)}
      person={berater}
    >
      <Absatz letzter>{t.dank(datumFuer(gespraechDatum, sprache), team)}</Absatz>
      {bloecke
        .filter(([, text]) => (text || '').trim())
        .map(([titel, text]) => <Textblock key={titel} titel={titel} text={(text || '').trim()} />)}
      <Absatz letzter>{t.schluss(team)}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Nachfass-Mail: Zusammenfassung des Gesprächs (Vorlage für Partner)',
  sprachen: DE_EN,
  absender: 'zustaendiger-partner',
  previewData: {
    kundeName: 'Herr Mustermann',
    gespraechDatum: '25.03.2026',
    ziel: '[Ziel des Kunden, in seinen eigenen Worten]',
    wichtig: '[Was dem Kunden wichtig ist]',
    offeneFragen: '[Offene Fragen aus dem Gespräch]',
    naechsteSchritte: '[Die vereinbarten nächsten Schritte]',
    berater: {
      name: 'Vorname Nachname',
      rolle: 'Vertriebspartner',
      telefon: '+49 30 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
