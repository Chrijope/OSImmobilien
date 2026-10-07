/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { berufsbezeichnung } from '../berufsbezeichnung.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Liste, type Ansprechpartner } from './_layout.tsx'

interface DocLink {
  name: string
  url: string
}

interface Props {
  bewerberName?: string
  paketTitel?: string
  vertragUrl?: string
  documents?: DocLink[]
  signedAt?: string
  kurzSignedAt?: string
  berater?: Ansprechpartner
  /**
   * Die HR-Managerin, wie in allen anderen Bewerbermails. Unter diesem
   * Namen laesst send-transactional-email die Person unangetastet; ein
   * `berater` wuerde dort ueber die Nutzerrolle neu aufgeloest und hiesse
   * dann "Immobilienberater".
   */
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  bewerberName,
  paketTitel,
  vertragUrl,
  documents,
  signedAt,
  kurzSignedAt,
  berater,
  hrKontakt,
}: Props) => {
  const person = hrKontakt?.name ? hrKontakt : berater
  const dokumente = Array.isArray(documents) ? documents : []
  const vorname = (bewerberName || '').split(' ')[0]
  const zeilen: Array<[string, string]> = []
  if (paketTitel) zeilen.push(['Vertrag als', paketTitel])
  if (signedAt) zeilen.push(['Deine Unterschrift', signedAt])
  if (kurzSignedAt) zeilen.push(['OS Immobilien', kurzSignedAt])

  return (
    <EmailLayout
      augenbraue="Willkommen an Bord"
      titel={vorname ? `Willkommen, ${vorname}` : 'Willkommen an Bord'}
      vorschau="Dein Handelsvertretervertrag ist von beiden Seiten unterschrieben."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>
        dein Handelsvertretervertrag{paketTitel ? ` als ${paketTitel}` : ''} ist jetzt von beiden
        Seiten unterschrieben und damit verbindlich. Willkommen im Team.
      </Absatz>

      {vertragUrl && (
        <Handlung href={vertragUrl} text="Unterschriebenen Vertrag öffnen" />
      )}

      {zeilen.length > 0 && <Angaben titel="Unterschriften" zeilen={zeilen} />}

      {dokumente.length > 0 && (
        <Liste
          titel="Alle Vertragsunterlagen"
          punkte={dokumente.map((d) => ({ text: d.name, href: d.url }))}
        />
      )}

      <Absatz>
        Wir freuen uns auf die Zusammenarbeit. Wir melden uns in Kürze mit den nächsten
        Schritten: Rechnung, Onboarding und Zugang zur Academy.
      </Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Dein Vertrag ist unterschrieben',
  displayName: 'Vertrag, vollständig unterschrieben (Bewerber)',
  previewData: {
    bewerberName: 'Hermann Jürgen Vogl',
    paketTitel: 'Lead Berater',
    vertragUrl: 'https://example.com/vertrag.pdf',
    signedAt: '16.06.2026, 08:42',
    kurzSignedAt: '16.06.2026, 09:17',
    documents: [
      { name: 'Handelsvertretervertrag (unterschrieben).pdf', url: 'https://example.com/vertrag.pdf' },
      { name: 'Anlage 1, AGB.pdf', url: 'https://example.com/a1.pdf' },
    ],
    // Wie in den uebrigen Bewerbermails: die HR-Managerin, zur Laufzeit aus
    // der Rolle `hr` geladen (hr-ansprechpartner.ts).
    hrKontakt: {
      name: 'Sarah Kaiser-Thom',
      rolle: berufsbezeichnung('hr'),
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
