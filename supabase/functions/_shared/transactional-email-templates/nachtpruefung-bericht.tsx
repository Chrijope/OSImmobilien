import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Kennzahlen, Posten, Hinweis } from './_layout.tsx'
import type { MailObjektdatenBereich } from '../nachtpruefung-objektdaten.ts'

/**
 * Die Morgenmail des Nachtwächters.
 *
 * Der Nachtlauf schreibt seine Befunde seit jeher in `nachtpruefung_befunde`,
 * und gelesen hat sie niemand. Nach 28 Tagen wurden sie gelöscht. Diese
 * Vorlage bringt die Befunde einer Nacht dorthin, wo morgens ohnehin
 * jemand hinsieht.
 *
 * Sie geht nur hinaus, wenn es tatsächlich etwas zu melden gibt. Eine
 * tägliche "alles in Ordnung" Mail wird nach einer Woche weggeklickt, und
 * dann fällt die eine wichtige auch nicht mehr auf. Darum steht in dieser
 * Vorlage kein Zweig für den ruhigen Fall.
 *
 * Seit dem 24.09.2026 kommen die Unstimmigkeiten in den Objektdaten dazu, je
 * Bereich (Objektmanagement, Finanzierung, Aftersales) ein Abschnitt. Darin
 * stehen nur die NEUEN Treffer einzeln, mit Link auf die Objektseite. Was
 * schon gestern gemeldet war, steht als eine Zahl da. Die Aufbereitung liegt
 * in `../nachtpruefung-objektdaten.ts`.
 */

interface Befund {
  /** Die fertige Meldung aus der Datenbank, ein Satz in verständlichem Deutsch. */
  meldung: string
  /** Wie viele Fälle. */
  anzahl: number
  /** Bis zu drei Beispiele, schon zu einer Zeile zusammengefasst. */
  beispiele?: string
}

interface Props {
  /** "Freitag, 07.08.2026" */
  nacht?: string
  fehler?: Befund[]
  warnungen?: Befund[]
  hinweise?: Befund[]
  /** Objektbefunde je Bereich, schon aufbereitet von `objektdatenFuerMail`. */
  objektdaten?: MailObjektdatenBereich[]
  berichtLink?: string
}

/** Wie viele neue Objekttreffer die Mail insgesamt meldet. */
const neueObjekttreffer = (bereiche: unknown): number =>
  Array.isArray(bereiche)
    ? bereiche.reduce(
        (n: number, b: Partial<MailObjektdatenBereich>) =>
          n + (Array.isArray(b?.neu) ? b.neu.length : 0) + (typeof b?.neuWeitere === 'number' ? b.neuWeitere : 0),
        0,
      )
    : 0

/** Die Zeilen eines Bereichs: neue einzeln, danach Rest, Bestand und Sammelbefunde. */
const objektZeilen = (b: MailObjektdatenBereich, berichtLink: string) => [
  ...b.neu.map((z) => ({ text: z.text, unter: z.unter, href: z.href, wert: 'neu', ton: 'warnung' as const })),
  ...(b.neuWeitere > 0
    ? [{
        text: `${b.neuWeitere} weitere neue Punkt${b.neuWeitere === 1 ? '' : 'e'}`,
        unter: 'Alle stehen im CRM auf der Seite Nachtprüfung.',
        href: berichtLink,
        wert: String(b.neuWeitere),
        ton: 'warnung' as const,
      }]
    : []),
  ...(b.bestehend > 0
    ? [{
        text: `${b.bestehend} bestehende${b.bestehend === 1 ? 'r Punkt' : ' Punkte'}, schon zuvor gemeldet`,
        wert: String(b.bestehend),
        ton: 'neutral' as const,
      }]
    : []),
  ...b.sammel.map((meldung) => ({ text: meldung, ton: 'neutral' as const })),
]

const zeilen = (liste: Befund[], ton: 'fehler' | 'warnung' | 'neutral') =>
  liste.map((b) => ({
    text: b.meldung,
    unter: b.beispiele,
    wert: String(b.anzahl),
    ton,
  }))

const Mail = ({
  nacht = '',
  fehler = [],
  warnungen = [],
  hinweise = [],
  objektdaten = [],
  berichtLink = 'https://osimmobilien.netlify.app/nachtpruefung',
}: Props) => {
  const anzahlFehler = fehler.length
  const anzahlWarnungen = warnungen.length
  const neuObjekt = neueObjekttreffer(objektdaten)
  const gesamt = anzahlFehler + anzahlWarnungen + hinweise.length + neuObjekt

  return (
    <EmailLayout
      augenbraue={nacht ? `Nachtprüfung ${nacht}` : 'Nachtprüfung'}
      titel={anzahlFehler > 0 ? 'Etwas ist kaputt' : 'Das ist heute Nacht aufgefallen'}
      vorschau={
        anzahlFehler > 0
          ? `${anzahlFehler} Sache${anzahlFehler === 1 ? '' : 'n'} ist kaputt, ${anzahlWarnungen} weitere solltest du ansehen.`
          : `${gesamt} Punkt${gesamt === 1 ? '' : 'e'} aus der Nachtprüfung.`
      }
      anrede="Guten Morgen,"
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {anzahlFehler > 0
          ? 'die Nachtprüfung hat etwas gefunden, das nicht funktioniert. Solche Fehler machen von sich aus keinen Lärm, deshalb steht das hier.'
          : 'die Nachtprüfung hat ein paar Punkte gefunden, die jemand ansehen sollte. Nichts davon ist kaputt, liegen bleiben sollte es trotzdem nicht.'}
      </Absatz>

      <Handlung href={berichtLink} text="Alle Befunde ansehen" />

      <Kennzahlen
        werte={[
          { wert: anzahlFehler, label: 'Kaputt', ton: 'fehler' },
          { wert: anzahlWarnungen, label: 'Anzusehen', ton: 'warnung' },
          ...(objektdaten.length > 0
            ? [{ wert: neuObjekt, label: 'Neu in Objektdaten', ton: 'warnung' as const }]
            : []),
        ]}
      />

      {fehler.length > 0 && <Posten titel="Kaputt" zeilen={zeilen(fehler, 'fehler')} />}

      {warnungen.length > 0 && <Posten titel="Bitte ansehen" zeilen={zeilen(warnungen, 'warnung')} />}

      {hinweise.length > 0 && <Posten titel="Zur Kenntnis" zeilen={zeilen(hinweise, 'neutral')} />}

      {objektdaten.map((b) => (
        <Posten key={b.bereich} titel={`Objektdaten, ${b.titel}`} zeilen={objektZeilen(b, berichtLink)} />
      ))}

      <Hinweis
        ton={anzahlFehler > 0 ? 'fehler' : 'warnung'}
        text="Die Zahl rechts ist die Anzahl der betroffenen Fälle. Im CRM stehen zu jedem Punkt bis zu zehn Beispiele."
      />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const fehler = Array.isArray(data?.fehler) ? data.fehler.length : 0
    const warnungen = Array.isArray(data?.warnungen) ? data.warnungen.length : 0
    const hinweise = Array.isArray(data?.hinweise) ? data.hinweise.length : 0
    const neuObjekt = neueObjekttreffer(data?.objektdaten)
    if (fehler > 0) {
      return `Nachtprüfung: ${fehler} Sache${fehler === 1 ? '' : 'n'} ist kaputt`
    }
    const rest = warnungen + hinweise
    if (rest === 0 && neuObjekt > 0) {
      return `Nachtprüfung: ${neuObjekt} neue Unstimmigkeit${neuObjekt === 1 ? '' : 'en'} in den Objektdaten`
    }
    const zusatz = neuObjekt > 0 ? `, ${neuObjekt} neu in den Objektdaten` : ''
    return `Nachtprüfung: ${rest} Punkt${rest === 1 ? '' : 'e'} zum Ansehen${zusatz}`
  },
  displayName: 'Nachtprüfung, Morgenbericht',
  previewData: {
    nacht: 'Freitag, 07.08.2026',
    berichtLink: 'https://osimmobilien.netlify.app/nachtpruefung',
    fehler: [
      {
        meldung: '2 anstehende Termine verweisen auf einen Videoraum, den es nicht mehr gibt. Diese Kunden kommen nicht hinein.',
        anzahl: 2,
        beispiele: 'Erstgespräch Anna Beispiel, Beratung Bernd Demo',
      },
    ],
    warnungen: [
      {
        meldung: '5 Kontakte haben keinen Zuständigen, obwohl sie länger als drei Tage liegen oder an ihnen bereits etwas läuft.',
        anzahl: 5,
        beispiele: 'Clara Test, Doreen Probe, Erik Sample',
      },
      {
        meldung: '3 Unterschriften sind abgelaufen, ohne dass jemand unterschrieben hat. Hier lohnt ein Anruf.',
        anzahl: 3,
        beispiele: 'Frank Muster, Greta Vorlage',
      },
    ],
    hinweise: [],
    objektdaten: [
      {
        bereich: 'OBJ',
        titel: 'Objektmanagement (Tobias Ammann)',
        neu: [
          {
            text: 'Musterweg 1, 12345 Musterstadt: PLZ im Titel weicht vom Feld ab',
            unter: 'Titel nennt PLZ 12345, im Feld steht 12354. In Investagon korrigieren. Eine Änderung im CRM überschreibt der nächste Abgleich.',
            href: 'https://osimmobilien.netlify.app/objekte/00000000-0000-0000-0000-000000000000',
          },
        ],
        neuWeitere: 0,
        bestehend: 4,
        sammel: [],
      },
      {
        bereich: 'FIN',
        titel: 'Finanzierung (Fabian Kortmann)',
        neu: [],
        neuWeitere: 0,
        bestehend: 2,
        sammel: ['Rücklage fehlt: bei 80 von 91 Objekten, davon 78 aus Investagon. Das Feld wird offenbar grundsätzlich nicht gepflegt, deshalb ein Sammelbefund statt einer Liste.'],
      },
    ],
  },
} satisfies TemplateEntry
