import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { berufsbezeichnung } from '../berufsbezeichnung.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { tageWort } from '../vertrag-erinnerung-text.ts'

/**
 * Zweite von drei Erinnerungen an den Bewerber, an Tag 7 nach dem Versand
 * (Text freigegeben von Christian am 30.09.2026).
 *
 * Sie kündigt ehrlich an, was an Tag 14 geschieht: Hören wir nichts, legen
 * wir den Vertrag beiseite (Stufe 3, vertrag-erinnerung-3). Das Datum kommt
 * aus dem Versand der Anfrage, das Ablaufdatum aus
 * `signature_requests.expires_at`.
 */

interface Props {
  name?: string
  signatureUrl?: string
  /** Wie viele Tage der Vertrag schon liegt. */
  tageOffen?: number
  /** Ablauf des Signaturlinks, bereits deutsch formatiert. */
  gueltigBis?: string
  /** Wann Stufe 3 den Vertrag beiseitelegt, bereits deutsch formatiert. */
  abschlussAm?: string
  berater?: Ansprechpartner
  /** Die HR-Managerin. Ihr Vorname steht auch im Text. */
  hrKontakt?: Ansprechpartner
}

const Mail = ({ name, signatureUrl, tageOffen, gueltigBis, abschlussAm, berater, hrKontakt }: Props) => {
  const person = hrKontakt?.name ? hrKontakt : berater
  const vorname = (name || '').trim().split(/\s+/)[0] || ''
  const hrVorname = (person?.name || '').trim().split(/\s+/)[0] || ''

  return (
    <EmailLayout
      augenbraue="Zweite Erinnerung"
      titel="Dein Vertrag ist noch nicht unterschrieben"
      vorschau="Dein Vertrag ist noch offen. Sag uns gern, wo du gerade stehst."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
      fussHinweis="Deine Daten werden verschlüsselt übertragen und nach DSGVO verarbeitet."
    >
      <Absatz letzter>
        dein Handelsvertretervertrag liegt jetzt seit {tageWort(tageOffen)} bei dir und ist noch
        nicht unterschrieben. Deshalb fragen wir noch einmal nach.
      </Absatz>

      {/* Wortgleich mit vertrag-signatur.tsx, dort steht die Begründung für das Wort "prüfen". */}
      <Handlung
        href={signatureUrl || ''}
        text="Vertrag öffnen, prüfen und unterschreiben"
        hinweis={gueltigBis ? `Gültig bis ${gueltigBis}` : 'Etwa 5 Minuten'}
      />

      <Absatz>
        Wenn du noch überlegst, ist das völlig in Ordnung. Uns hilft aber eine kurze Rückmeldung:
        Gibt es einen Punkt, den wir gemeinsam besprechen sollten, oder passt der Zeitpunkt gerade
        nicht? Eine Antwort auf diese Mail genügt,{' '}
        {hrVorname ? `${hrVorname} meldet sich dann bei dir.` : 'wir melden uns dann bei dir.'}
      </Absatz>

      <Absatz letzter>
        Hören wir {abschlussAm ? `bis zum ${abschlussAm}` : 'in den nächsten Tagen'} nichts von dir,
        legen wir deinen Vertrag vorerst beiseite. Und falls du dich gegen die Zusammenarbeit
        entschieden hast, sag es uns gern offen. Auch das ist eine gute Antwort.
      </Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Noch einmal zu deinem Handelsvertretervertrag',
  displayName: 'Vertrag, zweite Erinnerung an Tag 7',
  previewData: {
    name: 'Max Mustermann',
    signatureUrl: 'https://portal.more.immo/signatur?token=example&type=vertrag',
    tageOffen: 7,
    gueltigBis: '30.10.2026',
    abschlussAm: '14.10.2026',
    hrKontakt: {
      name: 'Sarah Kaiser-Thom',
      rolle: berufsbezeichnung('hr'),
      email: 's.kaiser-thom@more.immo',
    },
  },
} satisfies TemplateEntry
