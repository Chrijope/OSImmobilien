/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Posten, Hinweis } from './_layout.tsx'

/**
 * Interne Meldung an HR: Ein neuer Bewerber hat sich eingetragen.
 *
 * Geht an die HR-Rolle, nicht an den Bewerber. Der bekommt getrennt davon die
 * Einladung zum Kennenlernbogen.
 *
 * Knapp im Grundzustand: Wer sich beworben hat, wann, ueber welchen Weg, und
 * ein Knopf in die Akte. Alles Weitere steht dort und muss nicht in der Mail
 * stehen.
 *
 * ## Die Vorabeinschaetzung, seit dem 18.09.2026
 *
 * Wer ueber die Anzeige kommt, hat vier Fragen schon beantwortet, bevor diese
 * Mail hinausgeht. Genau diese vier Antworten stehen jetzt darin, zusammen mit
 * der Zahl, die sich aus ihnen ergibt. Das beantwortet die einzige Frage, die
 * die HR-Managerin an dieser Stelle hat: Wen rufe ich zuerst an. Vorher stand
 * das nur in der Akte, und dafuer musste sie sich anmelden.
 *
 * Drei Dinge dazu, bewusst so und nicht anders:
 *
 *   1. **Die Zahl ist ein Hinweis, kein Urteil.** Sie steht mit Tilde, mit
 *      ihrer Herleitung Posten fuer Posten und mit dem Satz darunter, dass die
 *      Entscheidung ein Mensch trifft. Eine nackte Zahl neben einem Namen
 *      liest sich anders als vier Antworten mit ihren Punkten.
 *   2. **Die Punkte stehen hier nirgends von Hand.** Sie kommen aus
 *      `_shared/bewerber-meta-score.ts`, derselben Rechnung, aus der auch die
 *      Zahl entsteht. Eine Herleitung, die neben der Rechnung entsteht, laeuft
 *      auseinander.
 *   3. **Keine Freitexte.** Motivation und Erfahrung bleiben in der Akte. Eine
 *      Mail liegt jahrelang in einem Postfach und wird weitergeleitet; die
 *      vier Antworten der Anzeige sind feste Auswahlmoeglichkeiten zur Sache,
 *      ein Freitext kann alles Moegliche enthalten.
 *
 * Fehlt die Einschaetzung, etwa beim Eingang ueber die Website oder bei einem
 * von Hand angelegten Bewerber, sieht die Mail aus wie vorher. Sie faellt
 * still weg, sie hinterlaesst keine leere Ueberschrift.
 */

/** Ein Posten der Aufschluesselung, wie ihn `metaScore` liefert. */
interface EinschaetzungPosten {
  frage: string
  antwort: string
  punkte: number
  moeglich: number
}

interface Einschaetzung {
  /** 0 bis 100, bezogen auf die beantworteten Fragen. */
  wert: number
  /** A, B oder C. */
  stufe: string
  posten: EinschaetzungPosten[]
}

interface Props {
  bewerberName?: string
  bewerberEmail?: string
  bewerberTelefon?: string
  ort?: string
  quelle?: string
  stelleTitel?: string
  eingegangenAm?: string
  bewerberLink?: string
  /** Die Vorabeinschaetzung aus den Bewerbungsfragen der Anzeige, falls es sie gibt. */
  einschaetzung?: Einschaetzung | null
}

/** Nimmt nur an, was wirklich wie eine Einschaetzung aussieht. */
function brauchbar(e: Einschaetzung | null | undefined): e is Einschaetzung {
  return (
    !!e &&
    typeof e.wert === 'number' &&
    Number.isFinite(e.wert) &&
    Array.isArray(e.posten) &&
    e.posten.length > 0
  )
}

const Mail = ({
  bewerberName,
  bewerberEmail,
  bewerberTelefon,
  ort,
  quelle,
  stelleTitel,
  eingegangenAm,
  bewerberLink,
  einschaetzung,
}: Props) => {
  const name = bewerberName || 'Ein Bewerber'
  const schaetzung = brauchbar(einschaetzung) ? einschaetzung : null

  const zeilen: Array<[string, string]> = [['Name', name]]
  if (stelleTitel) zeilen.push(['Stelle', stelleTitel])
  zeilen.push(['E-Mail', bewerberEmail || 'nicht hinterlegt'])
  zeilen.push(['Telefon', bewerberTelefon || 'nicht hinterlegt'])
  if (ort) zeilen.push(['Ort', ort])
  if (quelle) zeilen.push(['Eingang über', quelle])
  if (eingegangenAm) zeilen.push(['Eingegangen am', eingegangenAm])

  return (
    <EmailLayout
      augenbraue="Neuer Bewerber"
      titel={`${name} hat sich beworben`}
      vorschau={`${name}${stelleTitel ? ` als ${stelleTitel}` : ''}, eingegangen über ${quelle || 'die Website'}.`}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {name} hat sich{stelleTitel ? ` als ${stelleTitel}` : ''} beworben
        {quelle ? `, eingegangen über ${quelle}` : ''}. Der Kennenlernbogen ist automatisch
        hinausgegangen. Bitte den Eingang sichten und den Anruf einplanen.
      </Absatz>

      {bewerberLink && <Handlung href={bewerberLink} text="Bewerberakte öffnen" />}

      <Angaben titel="Die Angaben" zeilen={zeilen} />

      {schaetzung && (
        <>
          <Posten
            titel={`Aus den Bewerbungsfragen: etwa ${schaetzung.wert} von 100, Stufe ${schaetzung.stufe}`}
            zeilen={schaetzung.posten.map((p) => ({
              text: p.frage,
              unter: p.antwort,
              wert: `${p.punkte} von ${p.moeglich}`,
            }))}
          />
          <Hinweis
            text={
              'Diese Zahl ist ein Hinweis auf die Reihenfolge, kein Urteil über den Bewerber. ' +
              'Sie ergibt sich allein aus den vier Antworten oben und sagt, wen du zuerst anrufen ' +
              'solltest. Sobald der Kennenlernbogen da ist, steht in der Akte der richtige Score, ' +
              'und der kann deutlich anders ausfallen. Entschieden wird im Gespräch, von dir.'
            }
          />
        </>
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, unknown>) =>
    `Neuer Bewerber: ${data.bewerberName ?? 'unbekannt'}`,
  displayName: 'Intern: Neuer Bewerber eingegangen',
  previewData: {
    bewerberName: 'Max Mustermann',
    bewerberEmail: 'max@example.com',
    bewerberTelefon: '+49 170 1234567',
    ort: 'Rosenheim',
    quelle: 'Meta (Zapier)',
    stelleTitel: 'Vertriebspartner',
    eingegangenAm: '26.08.2026, 09:14',
    bewerberLink: 'https://portal.more.immo/bewerberprozess?openBewerber=beispiel',
    einschaetzung: {
      wert: 78,
      stufe: 'B',
      posten: [
        { frage: 'Immobilienvertrieb', antwort: 'Ja', punkte: 30, moeglich: 30 },
        { frage: 'Vertriebsbereich', antwort: 'Finanzdienstleistungen', punkte: 22, moeglich: 25 },
        { frage: 'Vertriebserfahrung', antwort: '3 bis 5 Jahre', punkte: 18, moeglich: 25 },
        { frage: 'Stunden pro Woche', antwort: '20 bis 30 Stunden', punkte: 15, moeglich: 20 },
      ],
    },
  },
} satisfies TemplateEntry
