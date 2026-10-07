import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, NOTAR_DOLMETSCHER_HINWEIS_EN, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  kundeName?: string
  datum?: string
  uhrzeit?: string
  notarName?: string
  notarAdresse?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

/**
 * Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4). Die
 * englische Fassung traegt den festen Dolmetscher-Hinweis (Plan 4.3).
 */
const DE = {
  betreff: (datum: string) => (datum ? `Ihr Notartermin am ${datum} ist bestätigt` : 'Ihr Notartermin ist bestätigt'),
  augenbraue: 'Bestätigt',
  titel: 'Ihr Notartermin ist bestätigt',
  vorschau: (datum: string) => (datum ? `Bestätigt: ${datum}` : 'Ihr Notartermin ist bestätigt'),
  text: 'vielen Dank, Ihr Termin ist bestätigt und beim Notariat verbindlich eingetragen. Bringen Sie bitte Ihren Personalausweis mit.',
  terminTitel: 'Ihr Termin',
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  notariat: 'Notariat',
  anschrift: 'Anschrift',
  dolmetscher: '',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (datum: string) =>
      datum ? `Your notary appointment on ${datum} is confirmed` : 'Your notary appointment is confirmed',
    augenbraue: 'Confirmed',
    titel: 'Your notary appointment is confirmed',
    vorschau: (datum: string) => (datum ? `Confirmed: ${datum}` : 'Your notary appointment is confirmed'),
    text: 'Thank you. Your appointment is confirmed and has been entered bindingly with the notary’s office. Please bring a valid identity card or passport with you.',
    terminTitel: 'Your appointment',
    datum: 'Date',
    uhrzeit: 'Time',
    notariat: 'Notary’s office',
    anschrift: 'Address',
    dolmetscher: NOTAR_DOLMETSCHER_HINWEIS_EN,
  },
}

const Mail = ({ kundeName, datum, uhrzeit, notarName, notarAdresse, berater, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const tag = datumFuer(datum, sprache)
  const uhr = uhrzeitFuer(uhrzeit, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau(tag)}
      anrede={foermlich(kundeName, sprache, kundeAnrede)}
      person={berater}
    >
      <Absatz letzter>{t.text}</Absatz>

      <Angaben titel={t.terminTitel} zeilen={[
        ...(tag ? ([[t.datum, tag]] as Array<[string, string]>) : []),
        ...(uhr ? ([[t.uhrzeit, uhr]] as Array<[string, string]>) : []),
        ...(notarName ? ([[t.notariat, notarName]] as Array<[string, string]>) : []),
        ...(notarAdresse ? ([[t.anschrift, notarAdresse]] as Array<[string, string]>) : []),
      ]} />

      {t.dolmetscher && <Hinweis text={t.dolmetscher} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff(datumFuer(data?.datum, data?.sprache)),
  displayName: 'Notartermin bestätigt (Kunde)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Herr Mustermann',
    datum: 'Montag, 11. August 2026',
    uhrzeit: '10:00',
    notarName: 'Notariat Dr. Berger',
    notarAdresse: 'Königstraße 4, 90402 Nürnberg',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
