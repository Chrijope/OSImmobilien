import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, Angaben, Liste, Haken, Hinweis } from './_layout.tsx'
import { foermlichAusTeilen } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'
import { terminAnsicht, type TerminArt, type TerminFelder } from './_termin-felder.ts'

/**
 * Einladung zur Objektvorstellung (Strategie Vertrieb, Abschnitt 8, seit
 * 16.10.2026).
 *
 * Ersetzt für den Anlass „objektvorstellung“ die allgemeine
 * Meeting-Einladung und die Buchungsbestätigung. Dazu die Bitte, bis zum
 * Termin Personalausweis (Vorder- und Rückseite) und die letzte
 * Gehaltsabrechnung im Kundenportal hochzuladen, damit die Reservierung im
 * selben Termin fallen kann (`src/lib/mindestunterlagen.ts`).
 *
 * Fehlen sie zwei Tage vorher noch, erinnert
 * `erinnerung-unterlagen-objektvorstellung` aus check-document-reminders.
 */

interface Props extends TerminFelder {
  /** Kundenportal, Bonität des Investments. */
  uploadUrl?: string
  sprache?: MailSprache
}

const DE = {
  betreff: (datum: string) => (datum ? `Einladung zur Objektvorstellung am ${datum}` : 'Einladung zur Objektvorstellung'),
  augenbraue: 'Einladung',
  titel: 'Ihre Objektvorstellung',
  vorschau: (datum: string) => `Wir laden Sie herzlich zur Objektvorstellung${datum ? ` am ${datum}` : ''} ein.`,
  absatz: (datum: string) =>
    `wir laden Sie herzlich zur Objektvorstellung${datum ? ` am ${datum}` : ''} ein. Wir stellen Ihnen das Objekt vor, das zu Ihren Zielen passt, mit allen Zahlen, und beantworten Ihre Fragen.`,
  ort: (art: TerminArt) =>
    art === 'video'
      ? 'Wir sprechen per Video, den Zugang finden Sie unten.'
      : art === 'telefon'
        ? 'Wir sprechen am Telefon. Wir rufen Sie pünktlich zum Termin an.'
        : 'Wir treffen uns in unserem Büro.',
  bitte: 'Bitte laden Sie bis dahin diese zwei Unterlagen im Kundenportal hoch:',
  unterlagen: ['Personalausweis, Vorder- und Rückseite', 'Ihre letzte Gehaltsabrechnung'],
  warum: 'Dann können wir im Termin alle nächsten Schritte direkt klären.',
  knopf: 'Unterlagen hochladen',
  zumVideo: 'Zum Videogespräch',
  termindaten: 'Ihre Termindaten',
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  dauer: 'Dauer',
  etwaMinuten: (n: number) => `etwa ${n} Minuten`,
  wo: 'Ort',
  woText: (art: TerminArt) => (art === 'video' ? 'Videogespräch' : art === 'telefon' ? 'Telefon' : 'Unser Büro'),
  treffpunkt: 'Adresse',
  berater: 'Ihr Ansprechpartner',
  zugangTitel: 'Zugang und Kalender',
  kalenderIcs: 'Apple oder Outlook (.ics)',
  kalenderGoogle: 'Google Kalender',
  aendern: 'Termin verschieben oder absagen',
  verschieben: 'Wenn Sie den Termin verschieben müssen, antworten Sie einfach auf diese Mail. Wir finden gemeinsam einen neuen.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (datum: string) => (datum ? `Invitation to the property presentation on ${datum}` : 'Invitation to the property presentation'),
    augenbraue: 'Invitation',
    titel: 'Your property presentation',
    vorschau: (datum: string) => `We cordially invite you to the property presentation${datum ? ` on ${datum}` : ''}.`,
    absatz: (datum: string) =>
      `We cordially invite you to the property presentation${datum ? ` on ${datum}` : ''}. We will present the property that suits your goals, with all the figures, and answer your questions.`,
    ort: (art: TerminArt) =>
      art === 'video'
        ? 'We will meet by video; you will find the access link below.'
        : art === 'telefon'
          ? 'We will speak by phone. We will call you punctually at the time of the appointment.'
          : 'We will meet at our office.',
    bitte: 'Before then, please upload these two documents in the customer portal:',
    unterlagen: ['ID card, front and back', 'Your latest payslip'],
    warum: 'This way we can settle all next steps directly in the appointment.',
    knopf: 'Upload documents',
    zumVideo: 'Join the video call',
    termindaten: 'Your appointment details',
    datum: 'Date',
    uhrzeit: 'Time',
    dauer: 'Duration',
    etwaMinuten: (n: number) => `about ${n} minutes`,
    wo: 'Where',
    woText: (art: TerminArt) => (art === 'video' ? 'Video call' : art === 'telefon' ? 'Phone' : 'Our office'),
    treffpunkt: 'Address',
    berater: 'Your contact person',
    zugangTitel: 'Access and calendar',
    kalenderIcs: 'Apple or Outlook (.ics)',
    kalenderGoogle: 'Google Calendar',
    aendern: 'Reschedule or cancel',
    verschieben: 'If you need to reschedule, simply reply to this email. We will find a new time together.',
  },
}

const Mail = (props: Props) => {
  const { sprache, treffpunkt, verwaltenUrl, uploadUrl, terminDauer } = props
  const t = texteFuer(TEXTE, sprache)
  const v = terminAnsicht(props, sprache, { ics: t.kalenderIcs, google: t.kalenderGoogle })

  const zeilen: Array<[string, string]> = []
  if (v.datum) zeilen.push([t.datum, v.datum])
  if (v.uhr) zeilen.push([t.uhrzeit, v.uhr])
  if (terminDauer) zeilen.push([t.dauer, t.etwaMinuten(terminDauer)])
  zeilen.push([t.wo, t.woText(v.art)])
  if (v.art === 'vor_ort' && treffpunkt) zeilen.push([t.treffpunkt, treffpunkt])
  if (v.person.name) zeilen.push([t.berater, v.person.name])

  const zugang = [...(v.zugang ? [{ text: t.zumVideo, href: v.zugang }] : []), ...v.kalender]

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau(v.datum)}
      anrede={foermlichAusTeilen({ ...props, name: props.kundeName, anrede: props.kundeAnrede || props.anrede }, sprache)}
      person={v.person.name ? v.person : undefined}
    >
      <Absatz>{t.absatz(v.datum)}</Absatz>
      <Absatz>{t.ort(v.art)}</Absatz>
      <Absatz letzter>{t.bitte}</Absatz>
      <Haken punkte={t.unterlagen} />
      <Absatz letzter>{t.warum}</Absatz>

      {uploadUrl && <Handlung sprache={sprache} href={uploadUrl} text={t.knopf} />}

      <Angaben titel={t.termindaten} zeilen={zeilen} />

      {zugang.length > 0 && <Liste titel={t.zugangTitel} punkte={zugang} />}

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
  displayName: 'Einladung Objektvorstellung (mit Unterlagen-Bitte)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    kundeAnrede: 'Herr',
    terminDatum: '25.03.2026',
    terminUhrzeit: '15:00',
    terminDauer: 45,
    terminModus: 'video',
    zoomJoinUrl: 'https://osimmobilien.netlify.app/raum/beispiel',
    uploadUrl: 'https://osimmobilien.netlify.app/kunde/investments?tab=osimmobilien&highlight=bonitaetsunterlagen',
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
