import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Liste, Textblock, kurzesDatum, kuerze } from './_layout.tsx'

/**
 * Meldung an die HR-Managerin, sobald ein Bewerber seinen Termin selbst
 * gebucht, verschoben oder abgesagt hat.
 *
 * Bis hierher lief die Terminvereinbarung ueber einen externen Kalender, und
 * im CRM stand davon nichts. Wer wissen wollte, ob jemand gebucht hat, musste
 * in ein zweites Werkzeug sehen.
 *
 * Eine Vorlage fuer alle drei Vorgaenge und nicht drei Vorlagen: Der Inhalt ist
 * bis auf zwei Saetze derselbe, und drei fast gleiche Dateien liefen mit der
 * Zeit auseinander. Was sich unterscheidet, steht in `EINLEITUNG` und im
 * Betreff.
 *
 * Sie ist ausdruecklich **intern**: kein Abmeldelink, keine Werbezeile, keine
 * Unterschrift. Der Empfaenger arbeitet hier, er hat sich nichts abbestellt.
 *
 * Anrede Du, wie im ganzen Bewerberprozess.
 */

type Vorgang = 'gebucht' | 'verschoben' | 'abgesagt'

const EINLEITUNG: Record<Vorgang, string> = {
  gebucht:
    'ein eingeladener Bewerber hat sich einen Termin ausgesucht. Er steht bereits in deinem ' +
    'Kalender, ein Gesprächsraum ist angelegt.',
  verschoben:
    'ein Bewerber hat seinen Termin auf eine andere Zeit gelegt. Dein Kalender und der ' +
    'Gesprächsraum sind bereits umgetragen, die alte Zeit ist wieder frei.',
  abgesagt:
    'ein Bewerber hat seinen Termin abgesagt. Die Zeit ist wieder frei und der Gesprächsraum ' +
    'ist geschlossen. Es ist nichts weiter zu tun; wenn du magst, meldest du dich bei ihm.',
}

const TITEL: Record<Vorgang, (wer: string) => string> = {
  gebucht: (wer) => `${wer} hat einen Termin gebucht`,
  verschoben: (wer) => `${wer} hat seinen Termin verschoben`,
  abgesagt: (wer) => `${wer} hat seinen Termin abgesagt`,
}

const AUGENBRAUE: Record<Vorgang, string> = {
  gebucht: 'Bewerbergespräch',
  verschoben: 'Bewerbergespräch verschoben',
  abgesagt: 'Bewerbergespräch abgesagt',
}

interface Props {
  vorgang?: Vorgang
  bewerberName?: string
  bewerberEmail?: string
  bewerberTelefon?: string
  /** Ausgeschrieben, also "Montag, 7. September 2026". */
  terminDatum?: string
  /** HH:MM ohne "Uhr". */
  terminUhrzeit?: string
  /** Minuten. Ergibt sich aus dem Klärungsbedarf des Bewerbers: 30 oder 45. */
  terminDauer?: number
  terminTitel?: string
  /** Nur beim Verschieben: wo der Termin vorher lag. */
  alteZeit?: string
  /** Die Themen, die der Bewerber im Kennenlernen markiert hat. */
  themen?: string[]
  /** Seine eigene Frage, falls er eine gestellt hat. */
  eigeneFrage?: string
  /** Seite des Bewerbers im CRM. */
  bewerberUrl?: string
  /** Vollstaendige Adresse zum Gespraechsraum. */
  zugangUrl?: string
}

const Mail = ({
  vorgang = 'gebucht',
  bewerberName,
  bewerberEmail,
  bewerberTelefon,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  terminTitel,
  alteZeit,
  themen,
  eigeneFrage,
  bewerberUrl,
  zugangUrl,
}: Props) => {
  const wer = (bewerberName || '').trim() || 'Ein Bewerber'
  const abgesagt = vorgang === 'abgesagt'

  const person: Array<[string, string]> = []
  if (bewerberName) person.push(['Name', bewerberName])
  if (bewerberEmail) person.push(['E-Mail', bewerberEmail])
  if (bewerberTelefon) person.push(['Telefon', bewerberTelefon])

  const termin: Array<[string, string]> = []
  if (terminTitel) termin.push(['Gespräch', terminTitel])
  if (terminDatum) termin.push([abgesagt ? 'War geplant für' : 'Datum', terminDatum])
  if (terminUhrzeit) termin.push(['Uhrzeit', `${terminUhrzeit} Uhr`])
  if (terminDauer) termin.push(['Dauer', `${terminDauer} Minuten`])
  if (alteZeit && vorgang === 'verschoben') termin.push(['Vorher', alteZeit])

  const punkte = (themen || []).filter(Boolean).map((t) => ({ text: t }))

  return (
    <EmailLayout
      augenbraue={AUGENBRAUE[vorgang]}
      titel={TITEL[vorgang](wer)}
      vorschau={`${wer}${terminDatum ? `, ${terminDatum}` : ''}${terminUhrzeit ? ` um ${terminUhrzeit} Uhr` : ''}.`}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>{EINLEITUNG[vorgang]}</Absatz>

      {bewerberUrl && (
        <Handlung
          href={bewerberUrl}
          text="Bewerber öffnen"
          hinweis="Kennenlernen, Antworten und der ganze Ablauf an einer Stelle"
        />
      )}

      {termin.length > 0 && <Angaben titel="Der Termin" zeilen={termin} />}

      {person.length > 0 && <Angaben titel="Wer gebucht hat" zeilen={person} />}

      {!abgesagt && punkte.length > 0 && (
        <Liste titel="Seine Tagesordnung" punkte={punkte} />
      )}

      {!abgesagt && eigeneFrage && <Textblock titel="Seine eigene Frage" text={eigeneFrage} />}

      {!abgesagt && zugangUrl && (
        <Liste titel="Zugang" punkte={[{ text: 'Gesprächsraum zum Termin', href: zugangUrl }]} />
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  /**
   * Kurz genug fuers Postfach: Wochentag und Jahr entfallen, der Name wird
   * notfalls gekuerzt. Dieselbe Rechnung wie bei buchung-benachrichtigung.
   */
  subject: (data: Record<string, any>) => {
    const vorgang = (data?.vorgang || 'gebucht') as Vorgang
    const wer = kuerze(String(data?.bewerberName || '').trim() || 'Ein Bewerber', 28)
    const datum = kurzesDatum(String(data?.terminDatum || ''))
    const zeit = String(data?.terminUhrzeit || '').trim()
    const kopf =
      vorgang === 'abgesagt'
        ? 'Bewerbertermin abgesagt'
        : vorgang === 'verschoben'
          ? 'Bewerbertermin verschoben'
          : 'Neuer Bewerbertermin'
    if (datum && zeit) return `${kopf}: ${wer}, ${datum}, ${zeit} Uhr`
    if (datum) return `${kopf}: ${wer}, ${datum}`
    return `${kopf}: ${wer}`
  },
  displayName: 'Bewerber: Termin gebucht, verschoben oder abgesagt',
  previewData: {
    vorgang: 'gebucht',
    bewerberName: 'Max Mustermann',
    bewerberEmail: 'max.mustermann@example.de',
    bewerberTelefon: '+49 170 1234567',
    terminDatum: 'Montag, 7. September 2026',
    terminUhrzeit: '10:00',
    terminDauer: 45,
    terminTitel: 'Bewerbergespräch',
    themen: ['Vergütung und Rechenwege', 'Zeit und Vereinbarkeit'],
    eigeneFrage: 'Wie viele Kontakte bekomme ich in den ersten drei Monaten?',
    bewerberUrl: 'https://osimmobilien.netlify.app/bewerberprozess?bewerber=1',
    // Die Gastgeberansicht, nicht der Warteraum. Die Vorschau zeigte bis zum
    // 14.09.2026 den Gastlink und widersprach damit dem, was
    // `send-bewerber-termin` tatsaechlich verschickt.
    zugangUrl: 'https://osimmobilien.netlify.app/videocall/raum/11111111-2222-3333-4444-555555555555',
  },
} satisfies TemplateEntry
