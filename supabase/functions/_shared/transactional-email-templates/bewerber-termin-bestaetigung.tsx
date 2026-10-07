import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import {
  EmailLayout,
  Absatz,
  Angaben,
  Handlung,
  Liste,
  Luft,
  Nebenhandlung,
  type Ansprechpartner,
} from './_layout.tsx'
import {
  TERMIN_KALENDER_TEXT,
  TERMIN_KNOPF,
  TERMIN_KNOPF_HINWEIS,
  TERMIN_VERWALTEN_TEXT,
  TERMIN_WORTLAUT,
  type TerminVorgang,
} from '../bewerber-termin-mail.ts'

/**
 * Die Bestätigung an den Bewerber: gebucht, verschoben oder abgesagt.
 *
 * Das Gegenstück zu `bewerber-termin-hr`, die dasselbe Ereignis der
 * HR-Managerin meldet. Eine Vorlage für alle drei Vorgänge, der Unterschied
 * steckt im Feld `vorgang` und im Wortlaut dazu.
 *
 * Der Bewerber bekam bis zum 06.09.2026 gar nichts. Er sah eine Bestätigung
 * auf dem Bildschirm, und danach gab es nichts mehr zum Wiederfinden: kein
 * Datum im Postfach, keinen Kalendereintrag, keinen Link zum Videoraum.
 *
 * Die Kalenderdatei hängt als `videocall.ics` an, gebaut in
 * `_shared/bewerber-termin-mail.ts`. Bei einer Absage hängt bewusst keine an:
 * Eine Absage-Datei richtet in den verbreiteten Programmen mehr Verwirrung an
 * als Nutzen, deshalb steht stattdessen die Bitte, den Eintrag zu löschen.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 176 60995539',
  email: 'office@more.immo',
}

interface Props {
  vorgang?: TerminVorgang
  bewerberName?: string
  terminDatum?: string
  terminUhrzeit?: string
  terminDauer?: number
  /** Wo der Termin vorher lag. Nur beim Verschieben gesetzt. */
  alteZeit?: string
  /** Der eigene Videoraum. Fehlt er, entfällt der Knopf. */
  zugangUrl?: string
  /** Der persönliche Link: verschieben, absagen, neu buchen. */
  verwaltenUrl?: string
  /**
   * Die Kalenderdatei noch einmal als Link, für Postfächer, die den Anhang
   * nicht zum Eintragen anbieten. Fehlt er, entfällt die Zeile.
   */
  kalenderUrl?: string
  /** Die Themen, die er selbst markiert hat. */
  themen?: string[]
  eigeneFrage?: string
  berater?: Ansprechpartner
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  vorgang = 'gebucht',
  hrKontakt,
  bewerberName,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  alteZeit,
  zugangUrl,
  verwaltenUrl,
  kalenderUrl,
  themen = [],
  eigeneFrage,
  berater,
}: Props) => {
  const wortlaut = TERMIN_WORTLAUT[vorgang] ?? TERMIN_WORTLAUT.gebucht
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)
  const abgesagt = vorgang === 'abgesagt'

  const zeilen: Array<[string, string]> = []
  if (terminDatum) zeilen.push([abgesagt ? 'Abgesagt war' : 'Datum', terminDatum])
  if (terminUhrzeit) zeilen.push(['Uhrzeit', `${terminUhrzeit} Uhr`])
  if (terminDauer) zeilen.push(['Dauer', `${terminDauer} Minuten`])
  if (alteZeit) zeilen.push(['Vorher lag er', alteZeit])

  // Die Tagesordnung aus seinen eigenen Angaben. Sie steht hier, weil sie im
  // Gespraech ganz oben steht, und weil sie zeigt, dass wir gelesen haben, was
  // er markiert hat.
  const tagesordnung = [
    ...themen.map((t) => ({ text: t })),
    ...(eigeneFrage ? [{ text: `Deine Frage: ${eigeneFrage}` }] : []),
  ]

  // Der Knopf fuehrt beim abgesagten Termin auf die Terminwahl, sonst in den
  // Videoraum. Fehlt das jeweilige Ziel, zeichnet `Handlung` keinen Knopf.
  const knopfZiel = abgesagt ? verwaltenUrl : zugangUrl

  return (
    <EmailLayout
      augenbraue={wortlaut.augenbraue}
      titel={wortlaut.titel}
      vorschau={wortlaut.vorschau}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>{wortlaut.einleitung}</Absatz>

      {zeilen.length > 0 && (
        <Angaben titel={abgesagt ? 'Der abgesagte Termin' : 'Dein Termin'} zeilen={zeilen} />
      )}

      {/*
        Wofuer der Termin ueberhaupt gut ist. Zwischen Terminblock und Knopf
        stand bisher nichts darueber; wer 45 Minuten hergibt, soll vorher
        wissen, wofuer. Bei einer Absage entfaellt der Absatz, dort waere er
        eine Werbung fuer etwas, das gerade nicht stattfindet.
      */}
      {!abgesagt && wortlaut.worumEsGeht && <Absatz letzter>{wortlaut.worumEsGeht}</Absatz>}

      {knopfZiel && (
        <Handlung
          href={knopfZiel}
          text={TERMIN_KNOPF[vorgang] ?? TERMIN_KNOPF.gebucht}
          hinweis={abgesagt ? undefined : TERMIN_KNOPF_HINWEIS}
        />
      )}

      {/*
        Der zweite Weg in den Kalender, Christians Punkt P5.
        Die Datei haengt an, aber nicht jedes Postfach bietet sie zum Eintragen
        an. Bewusst als ruhiger Textlink und nicht als zweiter blauer Knopf:
        Zwei gleich kraeftige Knoepfe lassen den Leser waehlen, statt ihn zu
        fuehren, und der Videoraum ist die wichtigere der beiden Handlungen.
      */}
      {!abgesagt && kalenderUrl && (
        <Nebenhandlung href={kalenderUrl} text={TERMIN_KALENDER_TEXT} />
      )}

      {!abgesagt && verwaltenUrl && (
        <Nebenhandlung href={verwaltenUrl} text={TERMIN_VERWALTEN_TEXT} />
      )}

      {!abgesagt && tagesordnung.length > 0 && (
        <Liste titel="Das steht im Gespräch ganz oben" punkte={tagesordnung} />
      )}

      {/* Christians Punkt E1: der Schlussabsatz klebte am Block darueber. */}
      <Luft />

      <Absatz letzter>{wortlaut.schluss}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    (TERMIN_WORTLAUT[(data?.vorgang as TerminVorgang) ?? 'gebucht'] ?? TERMIN_WORTLAUT.gebucht).betreff,
  displayName: 'Bewerber Persönliches Gespräch, Bestätigung an den Bewerber',
  previewData: {
    vorgang: 'gebucht',
    bewerberName: 'Max Mustermann',
    terminDatum: 'Dienstag, 15. September 2026',
    terminUhrzeit: '10:00',
    terminDauer: 45,
    zugangUrl: 'https://portal.more.immo/raum/beispiel-token',
    verwaltenUrl: 'https://portal.more.immo/kooperationsgespraech/beispiel-token',
    kalenderUrl:
      'https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/get-ics?title=Kooperationsgespr%C3%A4ch%20mit%20MOREImmo',
    themen: ['Vergütung und Rechenwege', 'Leads und Kundengewinnung'],
    eigeneFrage: 'Wie läuft die Einarbeitung neben dem Hauptberuf?',
    berater: STANDARD,
  },
} satisfies TemplateEntry
