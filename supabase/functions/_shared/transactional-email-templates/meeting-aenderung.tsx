import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Handlung, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { meetingDatum, meetingZeitpunkt } from '../meeting-datum.ts'
import { DE_EN, type MailSprache, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Was der Kunde liest, wenn ein Termin verschoben oder abgesagt wird.
 *
 * Zwei Korrekturen vom 19.09.2026:
 *
 * 1. Datum und alte Zeit kamen roh aus der Datenbank durch. Der Kunde las
 *    "Bisher: 2026-09-19 09:30". Das ist Maschinensprache in einer Mail an
 *    einen Menschen. Jetzt steht dort der ausgeschriebene Wochentag.
 *
 * 2. Beim Verschieben bleibt der RAUM DERSELBE, Link und Zugang aendern sich
 *    nicht. Das steht jetzt ausdruecklich da. Ohne den Satz sucht der Kunde in
 *    der Mail nach neuen Zugangsdaten, findet keine, und weiss nicht, ob der
 *    alte Link noch gilt.
 */

interface Props {
  name?: string
  titel?: string
  datum?: string
  uhrzeit?: string
  dauer?: number
  abgesagt?: boolean
  alteZeit?: string
  modus?: string
  treffpunkt?: string
  zugangUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (abgesagt: boolean, titel: string) => `${abgesagt ? 'Termin abgesagt' : 'Termin verschoben'}: ${titel || 'Dein Termin'}`,
  augenbraue: (abgesagt: boolean) => (abgesagt ? 'Termin abgesagt' : 'Termin verschoben'),
  titelRueckfall: 'Dein Termin',
  vorschauAbgesagt: 'Dein Termin findet nicht statt.',
  vorschauNeu: (zeit: string) => `Neuer Termin: ${zeit}.`,
  textAbgesagt: 'dein Ansprechpartner hat den Termin abgesagt. Der Termin findet nicht statt.',
  textNeu: 'dein Termin hat sich verschoben. Hier stehen die neuen Angaben.',
  angabenAbgesagt: 'Abgesagter Termin',
  angabenNeu: 'Neuer Termin',
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  dauer: 'Dauer',
  minuten: (n: number) => `${n} Minuten`,
  bisher: 'Bisher',
  treffpunkt: 'Treffpunkt',
  vorOrt: 'Vor Ort',
  durchfuehrung: 'Durchführung',
  telefontermin: 'Telefontermin',
  knopf: 'Zum Gespräch',
  raumBleibt:
    'Dein Zugang bleibt derselbe. Es ist derselbe Raum wie bisher, nur die Zeit ist neu. Zum Termin genügt ein Klick auf den Knopf, du brauchst keine zusätzliche Software.',
  kalenderAbsage:
    'Eine Kalender-Absage ist beigefügt. Bitte prüfe, ob dein Kalender den Termin entfernt oder als abgesagt markiert hat.',
  kalenderNeu:
    'Die aktualisierte Kalenderdatei ist beigefügt. Bitte übernimm die Änderung und prüfe den Termin in deinem Kalender.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (abgesagt: boolean, titel: string) =>
      `${abgesagt ? 'Appointment cancelled' : 'Appointment rescheduled'}: ${titel || 'Your appointment'}`,
    augenbraue: (abgesagt: boolean) => (abgesagt ? 'Appointment cancelled' : 'Appointment rescheduled'),
    titelRueckfall: 'Your appointment',
    vorschauAbgesagt: 'Your appointment will not take place.',
    vorschauNeu: (zeit: string) => `New appointment: ${zeit}.`,
    textAbgesagt: 'Your contact person has cancelled the appointment. It will not take place.',
    textNeu: 'Your appointment has been rescheduled. Here are the new details.',
    angabenAbgesagt: 'Cancelled appointment',
    angabenNeu: 'New appointment',
    datum: 'Date',
    uhrzeit: 'Time',
    dauer: 'Duration',
    minuten: (n: number) => `${n} minutes`,
    bisher: 'Previously',
    treffpunkt: 'Meeting point',
    vorOrt: 'In person',
    durchfuehrung: 'Format',
    telefontermin: 'Phone call',
    knopf: 'Join the meeting',
    raumBleibt:
      'Your access stays the same. It is the same room as before, only the time has changed. To join, simply click the button; you do not need any additional software.',
    kalenderAbsage:
      'A calendar cancellation is attached. Please check that your calendar has removed the appointment or marked it as cancelled.',
    kalenderNeu:
      'The updated calendar file is attached. Please accept the change and check the appointment in your calendar.',
  },
}

const Mail = ({
  name, titel, datum, uhrzeit, dauer, abgesagt, alteZeit, modus, treffpunkt, zugangUrl, berater, sprache,
}: Props) => {
  const t = texteFuer(TEXTE, sprache)
  // Nur beim Videogespraech gibt es ueberhaupt einen Zugang, der bleiben kann.
  const zeigtRaumbleibt = !abgesagt && !!zugangUrl && modus !== 'vor_ort' && modus !== 'telefon'

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue(Boolean(abgesagt))}
      titel={titel || t.titelRueckfall}
      vorschau={abgesagt ? t.vorschauAbgesagt : t.vorschauNeu(meetingZeitpunkt(datum, uhrzeit, sprache))}
      anrede={hallo(name, sprache)}
      person={berater?.name ? berater : undefined}
    >
      <Absatz>{abgesagt ? t.textAbgesagt : t.textNeu}</Absatz>

      <Angaben
        titel={abgesagt ? t.angabenAbgesagt : t.angabenNeu}
        zeilen={[
          [t.datum, meetingDatum(datum, sprache)],
          [t.uhrzeit, uhrzeitFuer(uhrzeit || '', sprache)],
          [t.dauer, t.minuten(dauer || 60)],
          ...(!abgesagt && alteZeit ? [[t.bisher, meetingZeitpunkt(alteZeit, undefined, sprache)] as [string, string]] : []),
          ...(modus === 'vor_ort' ? [[t.treffpunkt, treffpunkt || t.vorOrt] as [string, string]] : []),
          ...(modus === 'telefon' ? [[t.durchfuehrung, t.telefontermin] as [string, string]] : []),
        ]}
      />

      {!abgesagt && zugangUrl && <Handlung sprache={sprache} href={zugangUrl} text={t.knopf} />}

      {/* Der Satz nimmt die naheliegende Sorge vorweg: Gilt mein alter Link noch? */}
      {zeigtRaumbleibt && <Absatz>{t.raumBleibt}</Absatz>}

      <Hinweis text={abgesagt ? t.kalenderAbsage : t.kalenderNeu} />
    </EmailLayout>
  )
}

export const template: TemplateEntry = {
  component: Mail,
  subject: (d) => texteFuer(TEXTE, d?.sprache).betreff(Boolean(d?.abgesagt), d?.titel || ''),
  displayName: 'Manuelles Meeting: Änderung oder Absage',
  sprachen: DE_EN,
  previewData: {
    name: 'Alex',
    titel: 'Beratung',
    datum: '2026-12-10',
    uhrzeit: '10:00',
    dauer: 60,
    alteZeit: '2026-12-08 14:30',
    modus: 'video',
    zugangUrl: 'https://portal.more.immo/raum/beispiel',
    berater: {},
  },
}
