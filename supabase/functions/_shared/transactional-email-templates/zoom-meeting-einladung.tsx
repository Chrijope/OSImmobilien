import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Liste, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  kundeName?: string
  beraterName?: string
  /* Das Profilbild kam flach herein, die Vorlage las aber nur
     berater.bildUrl. Deshalb fehlte es in der Mail. */
  beraterBild?: string
  beraterEmail?: string
  beraterTelefon?: string
  beraterPosition?: string
  terminDatum?: string
  terminUhrzeit?: string
  terminDauer?: number
  /**
   * Zugangslink zum Termin, heute der eigene Videoraum. Der Name stammt aus
   * der Zeit der Zoom-Anbindung und bleibt, weil das CRM ihn so an die
   * ausgerollte Function send-transactional-email schickt.
   */
  zoomJoinUrl?: string
  icsUrl?: string
  googleCalendarUrl?: string
  outlookCalendarUrl?: string
  agenda?: string
  berater?: Ansprechpartner
  /**
   * Wie der Termin stattfindet: video (eigener Videoraum), vor_ort, telefon.
   * Ohne Angabe gilt video.
   */
  terminModus?: 'video' | 'vor_ort' | 'telefon'
  /** Adresse bei einem Treffen vor Ort. */
  treffpunkt?: string
  /** Nummer, auf der der Kunde beim Telefontermin angerufen wird. */
  kundeTelefon?: string
  sprache?: MailSprache
}

type Art = 'video' | 'vor_ort' | 'telefon'

const DE = {
  betreff: (art: Art, datum: string) => {
    const wann = datum ? ` am ${datum}` : ''
    if (art === 'vor_ort') return `Deine Termineinladung${wann}`
    if (art === 'telefon') return `Dein Telefontermin${wann}`
    return `Deine Einladung zum Videogespräch${wann}`
  },
  augenbraue: 'Dein Termin',
  titel: (art: Art) =>
    art === 'vor_ort' ? 'Dein Termin steht'
    : art === 'telefon' ? 'Dein Telefontermin steht'
    : 'Dein Videotermin steht',
  absatz: (art: Art) =>
    art === 'vor_ort'
      ? 'wie besprochen treffen wir uns persönlich. Alle Angaben zu Ort und Zeit findest du unten, den Termin kannst du direkt in deinen Kalender übernehmen.'
      : art === 'telefon'
        ? 'wie besprochen melde ich mich telefonisch bei dir. Ich rufe dich pünktlich zum Termin an, du musst nichts weiter tun.'
        : 'wie besprochen ist dein persönlicher Videotermin eingerichtet. Zum Termin genügt ein Klick auf den Knopf, du brauchst keine zusätzliche Software.',
  knopf: 'Am Videogespräch teilnehmen',
  vorschau: (datum: string) => `Dein Termin${datum ? ` am ${datum}` : ''}.`,
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  dauer: 'Dauer',
  etwaMinuten: (n: number) => `etwa ${n} Minuten`,
  treffpunkt: 'Treffpunkt',
  erreichen: 'So erreichen wir dich',
  anrufMit: (tel: string) => `Wir rufen dich an: ${tel}`,
  anrufOhne: 'Wir rufen dich auf deiner hinterlegten Nummer an',
  berater: 'Dein Berater',
  thema: 'Thema',
  kalenderIcs: 'Apple oder Outlook (.ics)',
  kalenderGoogle: 'Google Kalender',
  kalenderOutlook: 'Outlook im Browser',
  termindaten: 'Deine Termindaten',
  kalenderTitel: 'In deinen Kalender übernehmen',
  verschieben: 'Wenn du den Termin verschieben musst, melde dich einfach. Wir finden gemeinsam einen neuen.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (art: Art, datum: string) => {
      const wann = datum ? ` on ${datum}` : ''
      if (art === 'vor_ort') return `Your appointment invitation${wann}`
      if (art === 'telefon') return `Your phone appointment${wann}`
      return `Your invitation to a video call${wann}`
    },
    augenbraue: 'Your appointment',
    titel: (art: Art) =>
      art === 'vor_ort' ? 'Your appointment is booked'
      : art === 'telefon' ? 'Your phone appointment is booked'
      : 'Your video appointment is booked',
    absatz: (art: Art) =>
      art === 'vor_ort'
        ? 'As agreed, we will meet in person. You will find all details on the place and time below, and you can add the appointment directly to your calendar.'
        : art === 'telefon'
          ? 'As agreed, I will call you. I will ring you punctually at the time of the appointment; you do not need to do anything else.'
          : 'As agreed, your personal video appointment has been set up. To join, simply click the button; you do not need any additional software.',
    knopf: 'Join the video call',
    vorschau: (datum: string) => `Your appointment${datum ? ` on ${datum}` : ''}.`,
    datum: 'Date',
    uhrzeit: 'Time',
    dauer: 'Duration',
    etwaMinuten: (n: number) => `about ${n} minutes`,
    treffpunkt: 'Meeting point',
    erreichen: 'How we will reach you',
    anrufMit: (tel: string) => `We will call you on: ${tel}`,
    anrufOhne: 'We will call you on the number you gave us',
    berater: 'Your contact person',
    thema: 'Topic',
    kalenderIcs: 'Apple or Outlook (.ics)',
    kalenderGoogle: 'Google Calendar',
    kalenderOutlook: 'Outlook on the web',
    termindaten: 'Your appointment details',
    kalenderTitel: 'Add to your calendar',
    verschieben: 'If you need to reschedule, just let us know. We will find a new time together.',
  },
}

const Mail = ({
  kundeName,
  beraterName,
  beraterBild,
  beraterEmail,
  beraterTelefon,
  beraterPosition,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  zoomJoinUrl,
  icsUrl,
  googleCalendarUrl,
  outlookCalendarUrl,
  agenda,
  berater,
  terminModus,
  treffpunkt,
  kundeTelefon,
  sprache,
}: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const person: Ansprechpartner = {
    name: berater?.name || beraterName,
    rolle: berater?.rolle || beraterPosition,
    telefon: berater?.telefon || beraterTelefon,
    email: berater?.email || beraterEmail,
    bildUrl: berater?.bildUrl || beraterBild,
  }

  // Wortlaut je nach Art des Termins.
  const art: Art = terminModus ?? 'video'
  const datum = datumFuer(terminDatum, sprache)
  const uhr = uhrzeitFuer(terminUhrzeit, sprache)

  // Treffpunkt und Thema sind Eingaben aus dem CRM und bleiben, wie sie sind.
  const termin: Array<[string, string]> = []
  if (datum) termin.push([t.datum, datum])
  if (uhr) termin.push([t.uhrzeit, uhr])
  if (terminDauer) termin.push([t.dauer, t.etwaMinuten(terminDauer)])
  if (art === 'vor_ort' && treffpunkt) termin.push([t.treffpunkt, treffpunkt])
  if (art === 'telefon') termin.push([t.erreichen, kundeTelefon ? t.anrufMit(kundeTelefon) : t.anrufOhne])
  if (person.name) termin.push([t.berater, person.name])
  if (agenda) termin.push([t.thema, agenda])

  const kalender: Array<{ text: string; href?: string }> = []
  if (icsUrl) kalender.push({ text: t.kalenderIcs, href: icsUrl })
  if (googleCalendarUrl) kalender.push({ text: t.kalenderGoogle, href: googleCalendarUrl })
  if (outlookCalendarUrl) kalender.push({ text: t.kalenderOutlook, href: outlookCalendarUrl })

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(art)}
      vorschau={t.vorschau(datum)}
      anrede={hallo(kundeName, sprache)}
      person={person.name ? person : undefined}
    >
      <Absatz letzter>{t.absatz(art)}</Absatz>

      {zoomJoinUrl && (
        <Handlung
          sprache={sprache}
          href={zoomJoinUrl}
          text={t.knopf}
          hinweis={datum && uhr ? `${datum}, ${uhr}` : undefined}
        />
      )}

      {termin.length > 0 && <Angaben titel={t.termindaten} zeilen={termin} />}

      {kalender.length > 0 && <Liste titel={t.kalenderTitel} punkte={kalender} />}

      <Hinweis text={t.verschieben} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff(data?.terminModus ?? 'video', datumFuer(data?.terminDatum, data?.sprache)),
  displayName: 'Meeting-Einladung (mit ICS)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    terminDatum: '25.03.2026',
    terminUhrzeit: '15:00',
    terminDauer: 60,
    zoomJoinUrl: 'https://osimmobilien.netlify.app/raum/beispiel',
    icsUrl: 'https://example.com/invite.ics',
    googleCalendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
    outlookCalendarUrl: 'https://outlook.live.com/calendar/0/deeplink/compose',
    agenda: 'Investmentstrategie und nächste Schritte',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Senior Berater',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
