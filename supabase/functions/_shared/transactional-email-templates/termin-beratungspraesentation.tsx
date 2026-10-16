import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, Angaben, Liste, Haken, Hinweis } from './_layout.tsx'
import { foermlichAusTeilen } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'
import { terminAnsicht, type TerminArt, type TerminFelder } from './_termin-felder.ts'

/**
 * Terminbestätigung zur Beratungspräsentation (Strategie Vertrieb,
 * Abschnitt 8, seit 16.10.2026).
 *
 * Ersetzt für den Anlass „beratung“ die allgemeine Meeting-Einladung
 * (`zoom-meeting-einladung`) und die Buchungsbestätigung
 * (`buchung-bestaetigung`). Welche Vorlage geht, entscheiden
 * `src/lib/meetingEinladung.ts` und `send-buchung-bestaetigung`.
 *
 * Sie-Form, wie im Drive-Prozessstandard vorgegeben. Inhalt: etwa eine
 * Stunde, Video oder Büro, es wird nichts unterschrieben, Mitentscheider sind
 * willkommen, die Renteninformation freiwillig bereitlegen.
 */

interface Props extends TerminFelder {
  sprache?: MailSprache
}

const DE = {
  betreff: (datum: string) => (datum ? `Ihre Beratungspräsentation am ${datum}` : 'Ihre Beratungspräsentation ist bestätigt'),
  augenbraue: 'Termin bestätigt',
  titel: 'Ihre Beratungspräsentation',
  vorschau: (datum: string) => `Ihr Termin${datum ? ` am ${datum}` : ''} steht. Es wird nichts unterschrieben.`,
  absatz:
    'vielen Dank für Ihre Zeit. Ihr Termin für die Beratungspräsentation steht. Wir nehmen uns etwa eine Stunde, gehen Ihre Ziele gemeinsam durch und zeigen Ihnen, wie ein Immobilieninvestment dazu passen kann.',
  ort: (art: TerminArt) =>
    art === 'video'
      ? 'Wir sprechen per Video. Zum Termin genügt ein Klick auf den Knopf, Sie brauchen keine zusätzliche Software.'
      : art === 'telefon'
        ? 'Wir sprechen am Telefon. Wir rufen Sie pünktlich zum Termin an.'
        : 'Wir treffen uns in unserem Büro.',
  knopf: 'Zum Videogespräch',
  gutZuWissen: 'Gut zu wissen',
  punkte: [
    'Es wird nichts unterschrieben.',
    'Wenn jemand mitentscheidet, etwa Ihr Partner oder Ihre Partnerin, ist er oder sie herzlich willkommen.',
    'Wenn Sie mögen, legen Sie Ihre letzte Renteninformation bereit. Das ist freiwillig und hilft, Ihre Situation greifbar zu machen.',
  ],
  termindaten: 'Ihre Termindaten',
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  dauer: 'Dauer',
  etwaEineStunde: 'etwa eine Stunde',
  wo: 'Ort',
  woText: (art: TerminArt) => (art === 'video' ? 'Videogespräch' : art === 'telefon' ? 'Telefon' : 'Unser Büro'),
  treffpunkt: 'Adresse',
  berater: 'Ihr Ansprechpartner',
  kalenderTitel: 'In Ihren Kalender übernehmen',
  kalenderIcs: 'Apple oder Outlook (.ics)',
  kalenderGoogle: 'Google Kalender',
  aendern: 'Termin verschieben oder absagen',
  verschieben: 'Wenn Sie den Termin verschieben müssen, antworten Sie einfach auf diese Mail. Wir finden gemeinsam einen neuen.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (datum: string) => (datum ? `Your advisory presentation on ${datum}` : 'Your advisory presentation is confirmed'),
    augenbraue: 'Appointment confirmed',
    titel: 'Your advisory presentation',
    vorschau: (datum: string) => `Your appointment${datum ? ` on ${datum}` : ''} is confirmed. Nothing will be signed.`,
    absatz:
      'Thank you for your time. Your appointment for the advisory presentation is confirmed. We will take about an hour to go through your goals together and show you how a property investment can fit them.',
    ort: (art: TerminArt) =>
      art === 'video'
        ? 'We will meet by video. To join, simply click the button; you do not need any additional software.'
        : art === 'telefon'
          ? 'We will speak by phone. We will call you punctually at the time of the appointment.'
          : 'We will meet at our office.',
    knopf: 'Join the video call',
    gutZuWissen: 'Good to know',
    punkte: [
      'Nothing will be signed.',
      'If someone else is part of the decision, such as your partner, they are very welcome to join.',
      'If you like, have your latest pension statement to hand. This is optional and helps to make your situation tangible.',
    ],
    termindaten: 'Your appointment details',
    datum: 'Date',
    uhrzeit: 'Time',
    dauer: 'Duration',
    etwaEineStunde: 'about one hour',
    wo: 'Where',
    woText: (art: TerminArt) => (art === 'video' ? 'Video call' : art === 'telefon' ? 'Phone' : 'Our office'),
    treffpunkt: 'Address',
    berater: 'Your contact person',
    kalenderTitel: 'Add to your calendar',
    kalenderIcs: 'Apple or Outlook (.ics)',
    kalenderGoogle: 'Google Calendar',
    aendern: 'Reschedule or cancel',
    verschieben: 'If you need to reschedule, simply reply to this email. We will find a new time together.',
  },
}

const Mail = (props: Props) => {
  const { sprache, treffpunkt, verwaltenUrl } = props
  const t = texteFuer(TEXTE, sprache)
  const v = terminAnsicht(props, sprache, { ics: t.kalenderIcs, google: t.kalenderGoogle })

  const zeilen: Array<[string, string]> = []
  if (v.datum) zeilen.push([t.datum, v.datum])
  if (v.uhr) zeilen.push([t.uhrzeit, v.uhr])
  zeilen.push([t.dauer, t.etwaEineStunde])
  zeilen.push([t.wo, t.woText(v.art)])
  if (v.art === 'vor_ort' && treffpunkt) zeilen.push([t.treffpunkt, treffpunkt])
  if (v.person.name) zeilen.push([t.berater, v.person.name])

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau(v.datum)}
      anrede={foermlichAusTeilen({ ...props, name: props.kundeName, anrede: props.kundeAnrede || props.anrede }, sprache)}
      person={v.person.name ? v.person : undefined}
    >
      <Absatz>{t.absatz}</Absatz>
      <Absatz letzter>{t.ort(v.art)}</Absatz>

      {v.zugang && (
        <Handlung
          sprache={sprache}
          href={v.zugang}
          text={t.knopf}
          hinweis={v.datum && v.uhr ? `${v.datum}, ${v.uhr}` : undefined}
        />
      )}

      <Angaben titel={t.termindaten} zeilen={zeilen} />

      <Absatz letzter>{t.gutZuWissen}</Absatz>
      <Haken punkte={t.punkte} />

      {v.kalender.length > 0 && <Liste titel={t.kalenderTitel} punkte={v.kalender} />}

      {verwaltenUrl && <Nebenhandlung href={verwaltenUrl} text={t.aendern} />}
      <Hinweis text={t.verschieben} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const sprache = data?.sprache
    return texteFuer(TEXTE, sprache).betreff(terminAnsicht(data || {}, sprache, { ics: '', google: '' }).datum)
  },
  displayName: 'Terminbestätigung Beratungspräsentation',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    kundeAnrede: 'Herr',
    terminDatum: '25.03.2026',
    terminUhrzeit: '15:00',
    terminModus: 'video',
    zoomJoinUrl: 'https://osimmobilien.netlify.app/raum/beispiel',
    icsUrl: 'https://example.com/invite.ics',
    googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
    berater: {
      name: 'Vorname Nachname',
      rolle: 'Vertriebspartner',
      telefon: '+49 30 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
