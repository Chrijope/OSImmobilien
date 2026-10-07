import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import {
  EmailLayout, Absatz, Handlung, Angaben, Liste, Textblock, Hinweis, kurzesDatum, echterAnlass,
  type Ansprechpartner,
} from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Bestaetigung unmittelbar nach einer Buchung ueber den Buchungslink.
 *
 * Bisher passierte nach einer Buchung per Mail gar nichts. Die erste Nachricht
 * kam 24 Stunden vor dem Termin. Wer heute fuer naechste Woche bucht, hatte
 * tagelang nichts in der Hand, nicht einmal den Zugang zum Videoraum.
 *
 * Wichtigster Teil der Mail ist deshalb der Knopf zum Videoraum. Alles andere
 * ordnet sich unter, siehe die Gestaltungsregeln in _layout.tsx.
 */

interface Props {
  /**
   * Kommt vom Aufrufer weiter mit, wird aber nicht mehr angezeigt: Die
   * Anrede lautet "Hallo Vorname," und braucht weder Herr noch Frau.
   */
  anrede?: string
  vorname?: string
  nachname?: string
  /** Ausgeschrieben, also "Donnerstag, 6. August 2026". */
  terminDatum?: string
  /** HH:MM ohne "Uhr", das ergaenzt die Vorlage. */
  terminUhrzeit?: string
  /** Minuten. */
  terminDauer?: number
  /** Bezeichnung der Terminart, etwa "Telefonisches Erstgespräch". */
  terminTitel?: string
  /** Beschreibung der Terminart. Leerzeilen trennen die Absaetze. */
  terminBeschreibung?: string
  /** Vollstaendige Adresse zum Videoraum oder Meeting. */
  zugangUrl?: string
  /** Kalenderdatei ueber die Function get-ics. */
  icsUrl?: string
  googleCalendarUrl?: string
  /** Seite, auf der der Kunde selbst absagen oder verschieben kann. */
  verwaltenUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (datum: string, zeit: string) =>
    datum && zeit ? `Termin bestätigt: ${datum}, ${zeit} Uhr` : datum ? `Termin bestätigt: ${datum}` : 'Dein Termin ist bestätigt',
  augenbraue: 'Termin bestätigt',
  titelRueckfall: 'Dein Termin steht',
  vorschau: (datum: string, uhr: string) => `Dein Termin${datum ? ` am ${datum}` : ''}${uhr ? ` um ${uhr}` : ''} ist bestätigt.`,
  text: (datum: string, uhr: string, mitZugang: boolean) =>
    `vielen Dank für deine Buchung. Dein Termin ist fest eingetragen${datum ? ` für ${datum}` : ''}${uhr ? ` um ${uhr}` : ''}.${mitZugang ? ' Zum Termin genügt ein Klick auf den Knopf.' : ''}`,
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  dauer: 'Dauer',
  etwaMinuten: (n: number) => `etwa ${n} Minuten`,
  ansprechpartner: 'Dein Ansprechpartner',
  kalenderIcs: 'Apple oder Outlook (.ics)',
  kalenderGoogle: 'Google Kalender',
  knopf: 'Zum Videoraum',
  hinweisZeit: (datum: string, uhr: string) => `${datum}, ${uhr}`,
  hinweisGueltig: 'Der Link bleibt bis zum Termin gültig',
  terminTitel: 'Dein Termin',
  worum: 'Worum es geht',
  kalenderTitel: 'In deinen Kalender übernehmen',
  aendernTitel: 'Termin verschieben oder absagen',
  aendern: 'Termin selbst ändern',
  aufbewahrenZugang:
    'Bewahre diese Mail auf. Der Knopf oben ist dein Zugang zum Termin, du brauchst dafür weder ein Konto noch eine zusätzliche Software.',
  aufbewahren: 'Bewahre diese Mail auf. Alle Angaben zu deinem Termin stehen darin.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (datum: string, zeit: string) =>
      datum && zeit ? `Appointment confirmed: ${datum}, ${zeit}` : datum ? `Appointment confirmed: ${datum}` : 'Your appointment is confirmed',
    augenbraue: 'Appointment confirmed',
    titelRueckfall: 'Your appointment is booked',
    vorschau: (datum: string, uhr: string) => `Your appointment${datum ? ` on ${datum}` : ''}${uhr ? ` at ${uhr}` : ''} is confirmed.`,
    text: (datum: string, uhr: string, mitZugang: boolean) =>
      `Thank you for your booking. Your appointment is firmly scheduled${datum ? ` for ${datum}` : ''}${uhr ? ` at ${uhr}` : ''}.${mitZugang ? ' To join, simply click the button.' : ''}`,
    datum: 'Date',
    uhrzeit: 'Time',
    dauer: 'Duration',
    etwaMinuten: (n: number) => `about ${n} minutes`,
    ansprechpartner: 'Your contact person',
    kalenderIcs: 'Apple or Outlook (.ics)',
    kalenderGoogle: 'Google Calendar',
    knopf: 'Join the video call',
    hinweisZeit: (datum: string, uhr: string) => `${datum}, ${uhr}`,
    hinweisGueltig: 'The link remains valid until the appointment',
    terminTitel: 'Your appointment',
    worum: 'What it is about',
    kalenderTitel: 'Add to your calendar',
    aendernTitel: 'Reschedule or cancel',
    aendern: 'Change the appointment yourself',
    aufbewahrenZugang:
      'Please keep this email. The button above is your access to the appointment; you do not need an account or any additional software.',
    aufbewahren: 'Please keep this email. It contains all the details of your appointment.',
  },
}

/**
 * Die Beschreibung der Terminart in Absaetze zerlegen.
 *
 * Sie wird im CRM in einem mehrzeiligen Feld gepflegt und kommt mal mit
 * einfachen, mal mit doppelten Zeilenumbruechen an. Ohne diese Aufbereitung
 * stuende sie als ein einziger Block in der Mail.
 */
function alsAbsaetze(text?: string): string {
  return (text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|\n/)
    .map((zeile) => zeile.trim())
    .filter(Boolean)
    .join('\n\n')
}

const Mail = ({
  vorname,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  terminTitel,
  terminBeschreibung,
  zugangUrl,
  icsUrl,
  googleCalendarUrl,
  verwaltenUrl,
  berater,
  sprache,
}: Props) => {
  const t = texteFuer(TEXTE, sprache)
  // Terminart und Beschreibung sind Texte aus dem CRM und bleiben, wie sie
  // gepflegt sind. Datum und Uhrzeit folgen der Sprache.
  const beschreibung = alsAbsaetze(terminBeschreibung)
  const anlass = echterAnlass(terminTitel)
  const datum = datumFuer(terminDatum, sprache)
  const uhr = uhrzeitFuer(terminUhrzeit, sprache)

  // Der Anlass steht bewusst nicht noch einmal in den Angaben: er ist bereits
  // die Ueberschrift der Mail. Vorher stand er zweimal da, und wenn die
  // Terminart fehlte, hiess es oben "Termin" und darunter "Anlass: Termin".
  const zeilen: Array<[string, string]> = []
  if (datum) zeilen.push([t.datum, datum])
  if (uhr) zeilen.push([t.uhrzeit, uhr])
  if (terminDauer) zeilen.push([t.dauer, t.etwaMinuten(terminDauer)])
  // Nur der Name. Position, Telefon und E-Mail stehen vollstaendig in der
  // Unterschrift am Ende der Mail, siehe Unterschrift() in _layout.tsx. Das
  // hier zu wiederholen waere derselbe Block zweimal auf einer Seite.
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
          hinweis={datum && uhr ? t.hinweisZeit(datum, uhr) : t.hinweisGueltig}
        />
      )}

      {zeilen.length > 0 && <Angaben titel={t.terminTitel} zeilen={zeilen} />}

      {beschreibung && <Textblock titel={t.worum} text={beschreibung} />}

      {kalender.length > 0 && <Liste titel={t.kalenderTitel} punkte={kalender} />}

      {verwaltenUrl && (
        <Liste
          titel={t.aendernTitel}
          punkte={[{ text: t.aendern, href: verwaltenUrl }]}
        />
      )}

      <Hinweis text={zugangUrl ? t.aufbewahrenZugang : t.aufbewahren} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  /**
   * Postfaecher zeigen etwa 60 Zeichen. Die alte Zeile war 88 lang und damit
   * genau dort abgeschnitten, wo die Uhrzeit stand. Anlass und Wochentag
   * entfallen deshalb, sie stehen beide in der Mail selbst.
   */
  subject: (data: Record<string, any>) => {
    const datum = kurzesDatum(datumFuer(String(data?.terminDatum || ''), data?.sprache))
    const zeit = String(data?.terminUhrzeit || '').trim()
    return texteFuer(TEXTE, data?.sprache).betreff(datum, zeit)
  },
  displayName: 'Buchungsbestätigung an den Kunden',
  sprachen: DE_EN,
  previewData: {
    anrede: 'Frau',
    vorname: 'Martina',
    nachname: 'Brandl',
    terminDatum: 'Donnerstag, 6. August 2026',
    terminUhrzeit: '10:15',
    terminDauer: 15,
    terminTitel: 'Telefonisches Erstgespräch',
    terminBeschreibung:
      'In einem kurzen Gespräch klären wir, was du dir von einer Immobilie als Kapitalanlage versprichst und ob wir dafür der richtige Partner sind.\n\nDu brauchst nichts vorzubereiten. Bring einfach deine Fragen mit, alles Weitere besprechen wir gemeinsam.',
    zugangUrl: 'https://osimmobilien.netlify.app/raum/abc123',
    icsUrl: 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/get-ics?title=Telefonisches%20Erstgespr%C3%A4ch',
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
