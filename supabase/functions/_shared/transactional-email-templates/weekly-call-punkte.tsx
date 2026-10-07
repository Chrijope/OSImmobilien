import * as React from 'npm:react@18.3.1'
import { EmailLayout, Absatz, Handlung, Kennzahlen, Posten, Hinweis } from './_layout.tsx'

/**
 * Die Punkte für den heutigen Weekly Sales Call, montags um 17 Uhr.
 *
 * Empfänger sind die Leute, die den Call moderieren. Sie sollen die Mail am
 * Montagnachmittag überfliegen und wissen, worüber am Abend geredet wird.
 * Deshalb keine Kennzahlentapete, sondern die Punkte im Wortlaut, in der
 * Reihenfolge, in der sie eingetragen wurden.
 *
 * ── OHNE VERFASSER, UND DAS IST ABSICHT ─────────────────────────────────
 *
 * Die Punkte sind anonym. Das ist keine technische Einschränkung, sondern der
 * Zweck der ganzen Liste: Themen, die sonst niemand anspricht, sollen
 * hochkommen (siehe 20260824140000_weekly_call_punkte.sql). Stünde in dieser
 * Mail der Name des Verfassers, wäre die Anonymität aufgehoben, und genau die
 * unangenehmen Punkte kämen nicht mehr. Die Mail nennt deshalb nur, wann ein
 * Punkt eingetragen wurde, nicht von wem.
 *
 * Seit dem 05.10.2026 gibt es zwei Calls am Montag. Die offenen Punkte stehen
 * deshalb je Call unter einer eigenen Überschrift (19:00 Lead-Berater, 19:30
 * Vertriebspartner). Punkte ohne Angabe gehören zum 19:00-Call.
 *
 * Statt des Verfassers ordnet die Mail nach Alter: Was seit Freitag liegt,
 * steht oben mit dem Tag daneben. So sieht man auf einen Blick, ob jemand
 * lange auf eine Antwort wartet oder ob der Punkt eben erst kam.
 */

interface Punkt {
  /** Der Wortlaut, wie eingetragen. Höchstens 300 Zeichen. */
  text: string
  /** "Freitag, 09:14 Uhr" oder "heute, 16:02 Uhr". */
  wann: string
  /** Wie lange der Punkt schon liegt, etwa "seit 3 Tagen". Leer bei heute. */
  alter?: string
  /** Punkte, die vor dem Call schon abgehakt wurden, stehen stumm hinten. */
  besprochen?: boolean
  /** 'lead_berater' (19:00) oder 'vertriebspartner' (19:30). */
  runde?: string
}

interface Props {
  /** Vorname des Empfängers für die Anrede, darf fehlen. */
  name?: string
  /** "Montag, 21.09.2026", der Termin des Calls. */
  callTag?: string
  /** "19:00" und "19:30", die beiden Startzeiten. */
  zeitLeadBerater?: string
  zeitVertriebspartner?: string
  punkte?: Punkt[]
  /** Punkte, die schon länger als heute liegen. Für die Kennzahlenreihe. */
  anzahlAelter?: number
  link?: string
}

const Mail = ({
  name = '',
  callTag = '',
  zeitLeadBerater = '19:00',
  zeitVertriebspartner = '19:30',
  punkte = [],
  anzahlAelter = 0,
  link = 'https://portal.more.immo/weekly-call',
}: Props) => {
  const vorname = name ? name.split(' ')[0] : ''
  const anzahl = punkte.length
  const offen = punkte.filter((p) => !p.besprochen)
  const offenVertriebspartner = offen.filter((p) => p.runde === 'vertriebspartner')
  const offenLeadBerater = offen.filter((p) => p.runde !== 'vertriebspartner')
  const erledigt = punkte.filter((p) => p.besprochen)

  const zeile = (p: Punkt) => ({
    text: p.text,
    unter: p.wann,
    wert: p.alter || undefined,
    ton: 'neutral' as const,
  })

  return (
    <EmailLayout
      augenbraue={callTag || 'Weekly Sales Call'}
      titel={
        anzahl === 1
          ? 'Ein Punkt steht für heute Abend auf der Liste'
          : `${anzahl} Punkte stehen für heute Abend auf der Liste`
      }
      vorschau={
        anzahl === 1
          ? 'Ein Thema für den Weekly Sales Call heute Abend.'
          : `${anzahl} Themen für den Weekly Sales Call heute Abend.`
      }
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {`das sind die Themen, die bis heute 17 Uhr für den Weekly Sales Call eingetragen wurden. Die Lead-Berater starten um ${zeitLeadBerater} Uhr, die Vertriebspartner um ${zeitVertriebspartner} Uhr.`}
      </Absatz>

      <Handlung href={link} text="Liste im CRM öffnen" />

      {anzahlAelter > 0 && (
        <Kennzahlen
          werte={[
            { wert: anzahl, label: anzahl === 1 ? 'Punkt' : 'Punkte', ton: 'neutral' },
            { wert: anzahlAelter, label: 'davon vor heute', ton: 'neutral' },
          ]}
        />
      )}

      {offenLeadBerater.length > 0 && (
        <Posten
          titel={`Das steht an, ${zeitLeadBerater} Uhr Lead-Berater`}
          zeilen={offenLeadBerater.map(zeile)}
        />
      )}

      {offenVertriebspartner.length > 0 && (
        <Posten
          titel={`Das steht an, ${zeitVertriebspartner} Uhr Vertriebspartner`}
          zeilen={offenVertriebspartner.map(zeile)}
        />
      )}

      {erledigt.length > 0 && (
        <Posten titel="Schon abgehakt" zeilen={erledigt.map(zeile)} />
      )}

      <Hinweis
        text={
          'Wer einen Punkt eingetragen hat, steht bewusst nicht dabei. Die Liste ist anonym, damit auch unbequeme Themen hochkommen. Im CRM kannst du jeden Punkt während des Calls abhaken.'
        }
      />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const anzahl = Array.isArray(data?.punkte) ? data.punkte.length : 0
    if (anzahl === 1) return 'Weekly Sales Call heute: 1 Punkt auf der Liste'
    return `Weekly Sales Call heute: ${anzahl} Punkte auf der Liste`
  },
  displayName: 'Weekly Sales Call, Punkte für heute Abend (montags 17 Uhr)',
  previewData: {
    name: 'Christian',
    callTag: 'Montag, 21.09.2026',
    zeitLeadBerater: '19:00',
    zeitVertriebspartner: '19:30',
    anzahlAelter: 2,
    link: 'https://portal.more.immo/weekly-call',
    punkte: [
      {
        text: 'Die Selbstauskunft bricht bei Kunden mit zwei Arbeitgebern ab, ich musste sie zweimal von Hand nacherfassen.',
        wann: 'Freitag, 09:14 Uhr',
        alter: 'seit 3 Tagen',
        runde: 'vertriebspartner',
      },
      {
        text: 'Brauchen wir eine feste Regel, wie lange ein reserviertes Objekt blockiert bleibt, wenn die Bonität noch offen ist?',
        wann: 'Samstag, 11:40 Uhr',
        alter: 'seit 2 Tagen',
      },
      {
        text: 'Kurze Rückfrage zum neuen Objekt in Chemnitz: Rechnen wir dort mit der alten oder der neuen Mietannahme?',
        wann: 'heute, 16:02 Uhr',
      },
    ],
  },
}
