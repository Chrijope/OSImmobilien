import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import {
  EmailLayout, Absatz, Handlung, Angaben, Hinweis, kurzesDatum, echterAnlass,
  type Ansprechpartner,
} from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Bestaetigung der Absage an den Kunden.
 *
 * Bisher passierte nach einer Absage gar nichts. Der Kunde sah auf der Seite
 * einen gruenen Kasten, bekam aber nichts in die Hand: keine Bestaetigung,
 * nichts, worauf er sich spaeter berufen koennte. Wer aus Versehen absagt oder
 * sich nicht sicher ist, ob der Klick angekommen ist, hatte keinen Beleg.
 *
 * Die Mail ist deshalb kurz und tut genau zwei Dinge: sie bestaetigt die
 * Absage mit der Zeit, um die es ging, und sie sagt, wie es weitergeht.
 */

interface Props {
  /** Kommt vom Aufrufer weiter mit, die Anrede nutzt nur noch den Vornamen. */
  anrede?: string
  vorname?: string
  nachname?: string
  /** Ausgeschrieben, also "Donnerstag, 6. August 2026". */
  terminDatum?: string
  /** HH:MM ohne "Uhr". */
  terminUhrzeit?: string
  terminTitel?: string
  /** Buchungslink, falls der Kunde gleich neu buchen kann. */
  neuBuchenUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (datum: string, zeit: string) =>
    datum && zeit ? `Termin abgesagt: ${datum}, ${zeit} Uhr` : datum ? `Termin abgesagt: ${datum}` : 'Dein Termin ist abgesagt',
  augenbraue: 'Termin abgesagt',
  titel: 'Dein Termin ist abgesagt',
  vorschau: (datum: string) => `Dein Termin${datum ? ` am ${datum}` : ''} ist abgesagt.`,
  text: (datum: string, uhr: string) =>
    `dein Termin${datum ? ` am ${datum}` : ''}${uhr ? ` um ${uhr}` : ''} ist abgesagt. Du brauchst nichts weiter zu tun. Dein Ansprechpartner ist informiert, und der Zugang zum Gespräch ist erloschen.`,
  knopf: 'Neuen Termin wählen',
  hinweis: 'Dauert weniger als eine Minute',
  anlass: 'Anlass',
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  abgesagtTitel: 'Der abgesagte Termin',
  neuBuchen:
    'Falls du doch noch sprechen möchtest, such dir einfach eine neue Zeit aus. Ein Anruf bei deinem Ansprechpartner geht genauso.',
  melden:
    'Falls du doch noch sprechen möchtest, melde dich einfach bei deinem Ansprechpartner. Er findet einen neuen Termin für dich.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (datum: string, zeit: string) =>
      datum && zeit ? `Appointment cancelled: ${datum}, ${zeit}` : datum ? `Appointment cancelled: ${datum}` : 'Your appointment has been cancelled',
    augenbraue: 'Appointment cancelled',
    titel: 'Your appointment has been cancelled',
    vorschau: (datum: string) => `Your appointment${datum ? ` on ${datum}` : ''} has been cancelled.`,
    text: (datum: string, uhr: string) =>
      `Your appointment${datum ? ` on ${datum}` : ''}${uhr ? ` at ${uhr}` : ''} has been cancelled. You do not need to do anything else. Your contact person has been informed, and the access link to the meeting is no longer valid.`,
    knopf: 'Choose a new appointment',
    hinweis: 'Takes less than a minute',
    anlass: 'Occasion',
    datum: 'Date',
    uhrzeit: 'Time',
    abgesagtTitel: 'The cancelled appointment',
    neuBuchen:
      'If you would still like to talk, simply choose a new time. You are equally welcome to call your contact person.',
    melden:
      'If you would still like to talk, simply get in touch with your contact person, who will find a new appointment for you.',
  },
}

const Mail = ({
  vorname,
  terminDatum,
  terminUhrzeit,
  terminTitel,
  neuBuchenUrl,
  berater,
  sprache,
}: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const anlass = echterAnlass(terminTitel)
  const datum = datumFuer(terminDatum, sprache)
  const uhr = uhrzeitFuer(terminUhrzeit, sprache)

  const zeilen: Array<[string, string]> = []
  if (anlass) zeilen.push([t.anlass, anlass])
  if (datum) zeilen.push([t.datum, datum])
  if (uhr) zeilen.push([t.uhrzeit, uhr])

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau(datum)}
      anrede={hallo(vorname, sprache)}
      person={berater?.name ? berater : undefined}
    >
      <Absatz letzter>{t.text(datum, uhr)}</Absatz>

      {neuBuchenUrl && (
        <Handlung sprache={sprache} href={neuBuchenUrl} text={t.knopf} hinweis={t.hinweis} />
      )}

      {zeilen.length > 0 && <Angaben titel={t.abgesagtTitel} zeilen={zeilen} />}

      <Hinweis text={neuBuchenUrl ? t.neuBuchen : t.melden} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const datum = kurzesDatum(datumFuer(String(data?.terminDatum || ''), data?.sprache))
    const zeit = String(data?.terminUhrzeit || '').trim()
    return texteFuer(TEXTE, data?.sprache).betreff(datum, zeit)
  },
  displayName: 'Buchung: Absage an den Kunden',
  sprachen: DE_EN,
  previewData: {
    anrede: 'Frau',
    vorname: 'Martina',
    nachname: 'Brandl',
    terminDatum: 'Donnerstag, 6. August 2026',
    terminUhrzeit: '10:15',
    terminTitel: 'Telefonisches Erstgespräch',
    neuBuchenUrl: 'https://osimmobilien.netlify.app/termin/christian-peetz',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Senior Berater',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
