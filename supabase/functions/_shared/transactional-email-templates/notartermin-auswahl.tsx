import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, NOTAR_DOLMETSCHER_HINWEIS_EN, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

interface TerminVorschlag {
  datum?: string
  uhrzeit?: string
}

interface NotarterminAuswahlProps {
  kundeName?: string
  objektName?: string
  wohnungName?: string
  notarName?: string
  notarAdresse?: string
  terminVorschlaege?: TerminVorschlag[]
  portalUrl?: string
  /** Bis wann bestätigt werden soll, bereits als Datum formatiert. */
  bitteBis?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

/**
 * Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4). Die
 * englische Fassung traegt den festen Dolmetscher-Hinweis (Plan 4.3).
 */
const DE = {
  betreff: (n: number) =>
    n === 1 ? 'Ihr Notartermin, bitte bestätigen' : `${n || 'Mehrere'} Termine beim Notar, bitte einen bestätigen`,
  augenbraue: 'Ihre Entscheidung',
  titel: (n: number) => (n === 1 ? 'Ihr Termin beim Notar' : `${n === 2 ? 'Zwei' : n === 3 ? 'Drei' : n} Termine beim Notar`),
  vorschau: 'Der Notar hat Termine freigehalten. Sobald Sie einen bestätigen, blockt er ihn verbindlich.',
  text: (notar: string, n: number, objekt: string) =>
    `${notar ? `${notar} hat ` : 'Der Notar hat '}${n === 1 ? 'einen Termin' : `${n} Termine`} für Ihren Kaufvertrag${objekt ? ` zu ${objekt}` : ''} freigehalten. Sobald Sie${n === 1 ? ' ihn' : ' einen davon'} in Ihrem Kundenportal bestätigen, wird er verbindlich ${n > 1 ? 'geblockt und die übrigen werden wieder frei' : 'geblockt'}.`,
  knopf: 'Termin im Kundenportal bestätigen',
  hinweis: (bis: string) => `Etwa 1 Minute${bis ? `  ·  Bitte bis ${bis}` : ''}`,
  auswahl: 'Zur Auswahl',
  notariat: 'Notariat',
  notar: 'Notar',
  anschrift: 'Anschrift',
  // Statt eines Strichs, wenn ein Vorschlag noch kein Datum hat.
  datumFolgt: 'Datum folgt',
  dolmetscher: '',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (n: number) =>
      n === 1 ? 'Your notary appointment: please confirm' : `${n || 'Several'} notary appointments: please confirm one`,
    augenbraue: 'Your decision',
    titel: (n: number) =>
      n === 1 ? 'Your notary appointment' : `${n === 2 ? 'Two' : n === 3 ? 'Three' : n} notary appointments`,
    vorschau: 'The notary has reserved appointments. As soon as you confirm one, it will be booked bindingly.',
    text: (notar: string, n: number, objekt: string) =>
      `${notar || 'The notary'} has reserved ${n === 1 ? 'an appointment' : `${n} appointments`} for the notarisation of your purchase contract${objekt ? ` for ${objekt}` : ''}. As soon as you confirm ${n === 1 ? 'it' : 'one of them'} in your customer portal, it will be booked bindingly${n > 1 ? ' and the others will be released' : ''}.`,
    knopf: 'Confirm the appointment in the customer portal',
    hinweis: (bis: string) => `About 1 minute${bis ? `  ·  Please confirm by ${bis}` : ''}`,
    auswahl: 'Available appointments',
    notariat: 'Notary’s office',
    notar: 'Notary',
    anschrift: 'Address',
    datumFolgt: 'Date to follow',
    dolmetscher: NOTAR_DOLMETSCHER_HINWEIS_EN,
  },
}

const NotarterminAuswahlEmail = ({
  kundeName,
  objektName,
  wohnungName,
  notarName,
  notarAdresse,
  terminVorschlaege = [],
  portalUrl,
  bitteBis,
  berater,
  sprache,
  kundeAnrede,
}: NotarterminAuswahlProps) => {
  const t = texteFuer(TEXTE, sprache)
  const anzahl = terminVorschlaege.length
  const objekt = [objektName, wohnungName].filter(Boolean).join(', ')

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(anzahl)}
      vorschau={t.vorschau}
      anrede={foermlich(kundeName, sprache, kundeAnrede)}
      person={berater}
    >
      <Absatz letzter>{t.text(notarName || '', anzahl, objekt)}</Absatz>

      <Handlung
        sprache={sprache}
        href={portalUrl || ''}
        text={t.knopf}
        hinweis={t.hinweis(datumFuer(bitteBis, sprache))}
      />

      {anzahl > 0 && (
        <Angaben
          titel={t.auswahl}
          zeilen={terminVorschlaege.map((v) => [datumFuer(v.datum, sprache) || t.datumFolgt, uhrzeitFuer(v.uhrzeit, sprache)])}
        />
      )}

      {(notarName || notarAdresse) && (
        <Angaben
          titel={t.notariat}
          zeilen={[
            ...(notarName ? ([[t.notar, notarName]] as Array<[string, string]>) : []),
            ...(notarAdresse ? ([[t.anschrift, notarAdresse]] as Array<[string, string]>) : []),
          ]}
        />
      )}

      {t.dolmetscher && <Hinweis text={t.dolmetscher} />}
    </EmailLayout>
  )
}

export const template = {
  component: NotarterminAuswahlEmail,
  subject: (data: Record<string, any>) => {
    const n = Array.isArray(data?.terminVorschlaege) ? data.terminVorschlaege.length : 0
    return texteFuer(TEXTE, data?.sprache).betreff(n)
  },
  displayName: 'Notartermin-Auswahl',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Herr Mustermann',
    objektName: 'Breitscheidstraße 18',
    wohnungName: 'Wohnung 12',
    notarName: 'Notariat Dr. Berger',
    notarAdresse: 'Königstraße 4, 90402 Nürnberg',
    terminVorschlaege: [
      { datum: 'Montag, 11. August 2026', uhrzeit: '10:00' },
      { datum: 'Mittwoch, 13. August 2026', uhrzeit: '14:30' },
      { datum: 'Freitag, 15. August 2026', uhrzeit: '09:00' },
    ],
    portalUrl: 'https://osimmobilien.netlify.app/kunde/investments',
    bitteBis: '5. August 2026',
    berater: {
      name: 'Julian Meyer',
      rolle: 'Ihr Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
