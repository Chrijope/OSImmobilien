import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import type { MailFelder, SpracheFelder } from './felder.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Hinweis } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { datumFuer, DE_EN, NOTAR_DOLMETSCHER_HINWEIS_EN, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Kundenmail: Der Notartermin steht fest. Sie-Form (Gruppe F, Notar).
 *
 * Verschickt aus der Kundenakte beim Klick auf „Freigeben“, und nur an den
 * Kunden. Mit `geaendert` sagt sie, dass ein schon freigegebener Termin
 * geaendert wurde. Vertriebspartner und Buero bekommen die interne Meldung
 * `notartermin-benachrichtigung`. Die Felder stehen in `./felder.ts`, damit
 * Absender und Vorlage dieselben Namen benutzen.
 *
 * Englisch foermlich (Plan 4.4), mit dem festen Dolmetscher-Hinweis
 * (Plan 4.3).
 */
type Props = MailFelder['notartermin-geplant'] & SpracheFelder

const DE = {
  betreff: (geaendert: boolean, datum: string) =>
    geaendert
      ? (datum ? `Ihr Notartermin wurde geändert: jetzt am ${datum}` : 'Ihr Notartermin wurde geändert')
      : (datum ? `Ihr Notartermin am ${datum}` : 'Ihr Notartermin steht fest'),
  augenbraue: (geaendert: boolean) => (geaendert ? 'Ihr Termin hat sich geändert' : 'Ihr Termin steht'),
  titel: (geaendert: boolean) => (geaendert ? 'Ihr geänderter Notartermin' : 'Ihr Notartermin'),
  vorschau: (geaendert: boolean, datum: string) =>
    geaendert
      ? (datum ? `Ihr Notartermin ist jetzt am ${datum}` : 'Ihr Notartermin hat sich geändert')
      : (datum ? `Ihr Notartermin am ${datum}` : 'Ihr Notartermin steht fest'),
  text: (geaendert: boolean) =>
    `${geaendert
      ? 'Ihr Termin für die Beurkundung hat sich geändert. Es gilt der Termin unten, der bisherige ist hinfällig. '
      : 'der Termin für die Beurkundung steht fest. '}Bringen Sie bitte Ihren Personalausweis mit. Alles Weitere übernimmt das Notariat, Sie müssen nichts vorbereiten.`,
  terminTitel: 'Ihr Termin',
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  notariat: 'Notariat',
  anschrift: 'Anschrift',
  objekt: 'Objekt',
  knopf: 'Details im Kundenportal',
  dolmetscher: '',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (geaendert: boolean, datum: string) =>
      geaendert
        ? (datum ? `Your notary appointment has been changed: now on ${datum}` : 'Your notary appointment has been changed')
        : (datum ? `Your notary appointment on ${datum}` : 'Your notary appointment has been set'),
    augenbraue: (geaendert: boolean) => (geaendert ? 'Your appointment has changed' : 'Your appointment is set'),
    titel: (geaendert: boolean) => (geaendert ? 'Your changed notary appointment' : 'Your notary appointment'),
    vorschau: (geaendert: boolean, datum: string) =>
      geaendert
        ? (datum ? `Your notary appointment is now on ${datum}` : 'Your notary appointment has changed')
        : (datum ? `Your notary appointment on ${datum}` : 'Your notary appointment has been set'),
    text: (geaendert: boolean) =>
      `${geaendert
        ? 'The appointment for the notarisation has changed. The appointment below applies; the previous one is no longer valid. '
        : 'The appointment for the notarisation (Beurkundung) has been set. '}Please bring a valid identity card or passport with you. The notary’s office will take care of everything else; you do not need to prepare anything.`,
    terminTitel: 'Your appointment',
    datum: 'Date',
    uhrzeit: 'Time',
    notariat: 'Notary’s office',
    anschrift: 'Address',
    objekt: 'Property',
    knopf: 'Details in the customer portal',
    dolmetscher: NOTAR_DOLMETSCHER_HINWEIS_EN,
  },
}

const Mail = ({ kundeName, objektName, wohnungName, datum, uhrzeit, notarName, notarAdresse, portalUrl, berater, geaendert, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const tag = datumFuer(datum, sprache)
  const uhr = uhrzeitFuer(uhrzeit, sprache)
  const neu = Boolean(geaendert)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue(neu)}
      titel={t.titel(neu)}
      vorschau={t.vorschau(neu, tag)}
      anrede={foermlich(kundeName, sprache, kundeAnrede)}
      person={berater}
      ohneUnterschrift
    >
      <Absatz letzter>{t.text(neu)}</Absatz>

      <Angaben titel={t.terminTitel} zeilen={[
        ...(tag ? ([[t.datum, tag]] as Array<[string, string]>) : []),
        ...(uhr ? ([[t.uhrzeit, uhr]] as Array<[string, string]>) : []),
        ...(notarName ? ([[t.notariat, notarName]] as Array<[string, string]>) : []),
        ...(notarAdresse ? ([[t.anschrift, notarAdresse]] as Array<[string, string]>) : []),
        ...(objektName ? ([[t.objekt, [objektName, wohnungName].filter(Boolean).join(', ')]] as Array<[string, string]>) : []),
      ]} />

      {portalUrl && <Handlung sprache={sprache} href={portalUrl} text={t.knopf} />}

      {t.dolmetscher && <Hinweis text={t.dolmetscher} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff(Boolean(data?.geaendert), datumFuer(data?.datum, data?.sprache)),
  displayName: 'Notartermin geplant',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Herr Mustermann',
    objektName: 'Breitscheidstraße 18',
    wohnungName: 'Wohnung 12',
    datum: 'Montag, 11. August 2026',
    uhrzeit: '10:00',
    notarName: 'Notariat Dr. Berger',
    notarAdresse: 'Königstraße 4, 90402 Nürnberg',
    portalUrl: 'https://osimmobilien.netlify.app/kunde/investments',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
