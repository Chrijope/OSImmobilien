import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import {
  EmailLayout, Absatz, Handlung, Angaben, Liste, Hinweis, kurzesDatum, echterAnlass,
  type Ansprechpartner,
} from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Neue Bestaetigung an den Kunden, nachdem er seinen Termin verschoben hat.
 *
 * Bisher ging nach dem Verschieben nichts hinaus. Der Kunde hatte damit zwei
 * Staende in der Hand: die alte Bestaetigungsmail mit der alten Zeit und einen
 * Kalendereintrag, der ebenfalls auf der alten Zeit stand. Die einzige Stelle
 * mit der Wahrheit war die Verwaltungsseite, die er nach dem Schliessen des
 * Fensters nicht wiederfand.
 *
 * Diese Mail ist deshalb eine vollstaendige neue Bestaetigung, nicht bloss ein
 * Hinweis: mit Videoraum, Kalenderdatei und dem Weg zum Aendern. Die alte Zeit
 * steht durchgestrichen daneben, damit der Kunde sieht, dass er die richtige
 * Mail vor sich hat.
 */

interface Props {
  /** Kommt vom Aufrufer weiter mit, die Anrede nutzt nur noch den Vornamen. */
  anrede?: string
  vorname?: string
  nachname?: string
  /** Ausgeschrieben, also "Samstag, 8. August 2026". */
  terminDatum?: string
  /** HH:MM ohne "Uhr". */
  terminUhrzeit?: string
  /** Minuten. */
  terminDauer?: number
  terminTitel?: string
  /** Die Zeit, die der Kunde bisher kannte, als fertiger Satz. */
  alteZeit?: string
  /** Vollstaendige Adresse zum Videoraum oder Meeting. */
  zugangUrl?: string
  /** Kalenderdatei ueber die Function get-ics, mit erhoehter SEQUENCE. */
  icsUrl?: string
  googleCalendarUrl?: string
  /** Seite, auf der der Kunde selbst absagen oder erneut verschieben kann. */
  verwaltenUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (datum: string, zeit: string) =>
    datum && zeit ? `Neue Terminzeit: ${datum}, ${zeit} Uhr` : datum ? `Neue Terminzeit: ${datum}` : 'Dein Termin wurde verschoben',
  augenbraue: 'Termin verschoben',
  titelRueckfall: 'Dein neuer Termin steht',
  vorschau: (datum: string, uhr: string) => `Neue Zeit${datum ? `: ${datum}` : ''}${uhr ? `, ${uhr}` : ''}.`,
  text: (datum: string, uhr: string, mitZugang: boolean) =>
    `dein Termin ist verschoben. Er findet jetzt${datum ? ` am ${datum}` : ''}${uhr ? ` um ${uhr}` : ''} statt.${mitZugang ? ' Der Zugang zum Gespräch bleibt derselbe.' : ''}`,
  neuesDatum: 'Neues Datum',
  neueUhrzeit: 'Neue Uhrzeit',
  dauer: 'Dauer',
  etwaMinuten: (n: number) => `etwa ${n} Minuten`,
  bisher: 'Bisher',
  ansprechpartner: 'Dein Ansprechpartner',
  kalenderIcs: 'Apple oder Outlook (.ics)',
  kalenderGoogle: 'Google Kalender',
  knopf: 'Zum Videoraum',
  hinweisGueltig: 'Der Link bleibt bis zum Termin gültig',
  terminTitel: 'Dein Termin',
  kalenderTitel: 'Kalendereintrag aktualisieren',
  aendernTitel: 'Termin verschieben oder absagen',
  aendern: 'Termin selbst ändern',
  ersetztMitKalender:
    'Diese Mail ersetzt deine bisherige Bestätigung. Der Kalendereintrag oben trägt dieselbe Kennung wie der alte und überschreibt ihn in den meisten Kalendern von selbst.',
  ersetzt: 'Diese Mail ersetzt deine bisherige Bestätigung. Bitte trag die neue Zeit in deinem Kalender nach.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (datum: string, zeit: string) =>
      datum && zeit ? `New appointment time: ${datum}, ${zeit}` : datum ? `New appointment time: ${datum}` : 'Your appointment has been rescheduled',
    augenbraue: 'Appointment rescheduled',
    titelRueckfall: 'Your new appointment is booked',
    vorschau: (datum: string, uhr: string) => `New time${datum ? `: ${datum}` : ''}${uhr ? `, ${uhr}` : ''}.`,
    text: (datum: string, uhr: string, mitZugang: boolean) =>
      `Your appointment has been rescheduled. It will now take place${datum ? ` on ${datum}` : ''}${uhr ? ` at ${uhr}` : ''}.${mitZugang ? ' The access link to the meeting stays the same.' : ''}`,
    neuesDatum: 'New date',
    neueUhrzeit: 'New time',
    dauer: 'Duration',
    etwaMinuten: (n: number) => `about ${n} minutes`,
    bisher: 'Previously',
    ansprechpartner: 'Your contact person',
    kalenderIcs: 'Apple or Outlook (.ics)',
    kalenderGoogle: 'Google Calendar',
    knopf: 'Join the video call',
    hinweisGueltig: 'The link remains valid until the appointment',
    terminTitel: 'Your appointment',
    kalenderTitel: 'Update your calendar entry',
    aendernTitel: 'Reschedule or cancel',
    aendern: 'Change the appointment yourself',
    ersetztMitKalender:
      'This email replaces your previous confirmation. The calendar entry above has the same identifier as the old one and replaces it automatically in most calendars.',
    ersetzt: 'This email replaces your previous confirmation. Please update the time in your calendar.',
  },
}

const Mail = ({
  vorname,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  terminTitel,
  alteZeit,
  zugangUrl,
  icsUrl,
  googleCalendarUrl,
  verwaltenUrl,
  berater,
  sprache,
}: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const anlass = echterAnlass(terminTitel)
  const datum = datumFuer(terminDatum, sprache)
  const uhr = uhrzeitFuer(terminUhrzeit, sprache)
  const bisher = datumFuer(alteZeit, sprache)

  const zeilen: Array<[string, string]> = []
  if (datum) zeilen.push([t.neuesDatum, datum])
  if (uhr) zeilen.push([t.neueUhrzeit, uhr])
  if (terminDauer) zeilen.push([t.dauer, t.etwaMinuten(terminDauer)])
  if (bisher) zeilen.push([t.bisher, bisher])
  if (berater?.name) zeilen.push([t.ansprechpartner, berater.name])

  const kalender: Array<{ text: string; href?: string }> = []
  if (icsUrl) kalender.push({ text: t.kalenderIcs, href: icsUrl })
  if (googleCalendarUrl) kalender.push({ text: t.kalenderGoogle, href: googleCalendarUrl })

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={anlass || t.titelRueckfall}
      vorschau={t.vorschau(datum, uhr)}
      anrede={hallo(vorname, sprache)}
      person={berater?.name ? berater : undefined}
    >
      <Absatz letzter>{t.text(datum, uhr, Boolean(zugangUrl))}</Absatz>

      {zugangUrl && (
        <Handlung
          sprache={sprache}
          href={zugangUrl}
          text={t.knopf}
          hinweis={datum && uhr ? `${datum}, ${uhr}` : t.hinweisGueltig}
        />
      )}

      {zeilen.length > 0 && <Angaben titel={t.terminTitel} zeilen={zeilen} />}

      {kalender.length > 0 && <Liste titel={t.kalenderTitel} punkte={kalender} />}

      {verwaltenUrl && (
        <Liste
          titel={t.aendernTitel}
          punkte={[{ text: t.aendern, href: verwaltenUrl }]}
        />
      )}

      <Hinweis text={kalender.length > 0 ? t.ersetztMitKalender : t.ersetzt} />
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
  displayName: 'Buchung: neue Zeit an den Kunden',
  sprachen: DE_EN,
  previewData: {
    anrede: 'Frau',
    vorname: 'Martina',
    nachname: 'Brandl',
    terminDatum: 'Samstag, 8. August 2026',
    terminUhrzeit: '14:00',
    terminDauer: 15,
    terminTitel: 'Telefonisches Erstgespräch',
    alteZeit: 'Donnerstag, 6. August 2026, 10:15 Uhr',
    zugangUrl: 'https://osimmobilien.netlify.app/raum/abc123',
    icsUrl: 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/get-ics?title=Telefonisches%20Erstgespr%C3%A4ch&seq=1786000000',
    googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
    verwaltenUrl: 'https://osimmobilien.netlify.app/termin/verwalten/abc123',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Senior Berater',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
