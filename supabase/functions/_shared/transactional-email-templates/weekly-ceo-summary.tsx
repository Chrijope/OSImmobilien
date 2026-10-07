import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Kennzahlen, Liste } from './_layout.tsx'

interface Props {
  name?: string
  neueLeads?: number
  qualifizierteLeads?: number
  termineBucht?: number
  reservierungen?: number
  abschluesse?: number
  conversionRate?: string
  pipelineWert?: string
  pipelineVeraenderung?: string
  umsatzWoche?: string
  provisionenWoche?: string
  offeneFinanzierungen?: number
  gesamtKontakte?: number
  neueKontakteWoche?: number
  aktiveBerater?: number
  topBerater?: string
  topBeraterLeads?: number
  neueEinreichungen?: number
  reservierteWohnungen?: number
  freieWohnungen?: number
  neueBewerbungen?: number
  offeneAufgaben?: number
  erledigteAufgaben?: number
  ueberfaelligeFollowUps?: number
  highlights?: string[]
  zeitraumVon?: string
  zeitraumBis?: string
  ausblickErstgespraeche?: number
  ausblickBeratungen?: number
  ausblickNotartermine?: number
  ausblickFollowUps?: number
  ausblickFaelligkeiten?: number
  ausblickGeburtstageTeam?: number
  ausblickGeburtstageKunden?: number
  geburtstageTeamListe?: string[]
  geburtstageKundenListe?: string[]
  ausblickVonBis?: string
  stagnierendeDeals?: number
  verloreneWoche?: number
}

const Mail = ({
  name = '',
  neueLeads = 0,
  qualifizierteLeads = 0,
  termineBucht = 0,
  reservierungen = 0,
  abschluesse = 0,
  conversionRate = '0%',
  pipelineWert = '0 €',
  pipelineVeraenderung = '',
  umsatzWoche = '0 €',
  provisionenWoche = '0 €',
  offeneFinanzierungen = 0,
  gesamtKontakte = 0,
  neueKontakteWoche = 0,
  aktiveBerater = 0,
  topBerater = '',
  topBeraterLeads = 0,
  neueEinreichungen = 0,
  reservierteWohnungen = 0,
  freieWohnungen = 0,
  neueBewerbungen = 0,
  offeneAufgaben = 0,
  erledigteAufgaben = 0,
  ueberfaelligeFollowUps = 0,
  highlights = [],
  zeitraumVon = '',
  zeitraumBis = '',
  ausblickErstgespraeche = 0,
  ausblickBeratungen = 0,
  ausblickNotartermine = 0,
  ausblickFollowUps = 0,
  ausblickFaelligkeiten = 0,
  geburtstageTeamListe = [],
  geburtstageKundenListe = [],
  ausblickVonBis = '',
  stagnierendeDeals = 0,
  verloreneWoche = 0,
}: Props) => {
  const vorname = name ? name.split(' ')[0] : ''
  const zeitraum = zeitraumVon && zeitraumBis ? `${zeitraumVon} bis ${zeitraumBis}` : 'Diese Woche'
  const geburtstage = [
    ...geburtstageTeamListe.map((n) => ({ text: `${n} (Team)` })),
    ...geburtstageKundenListe.map((n) => ({ text: `${n} (Kunde)` })),
  ]

  return (
    <EmailLayout
      augenbraue={zeitraum}
      titel="Der Wochenbericht"
      vorschau="Alle relevanten Kennzahlen der abgelaufenen Woche."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        hier ist der Überblick über die Kennzahlen und Entwicklungen der vergangenen Woche.
      </Absatz>

      <Kennzahlen
        titel="Vertrieb und Leads"
        werte={[
          { wert: neueLeads, label: 'Neue Leads' },
          { wert: qualifizierteLeads, label: 'Qualifiziert' },
          { wert: termineBucht, label: 'Termine' },
        ]}
      />

      <Kennzahlen
        werte={[
          { wert: reservierungen, label: 'Reservierungen' },
          { wert: abschluesse, label: 'Abschlüsse', ton: abschluesse > 0 ? 'gut' : 'neutral' },
          { wert: conversionRate, label: 'Conversion' },
        ]}
      />

      <Kennzahlen
        titel="Pipeline und Umsatz"
        werte={[
          { wert: pipelineVeraenderung ? `${pipelineWert} ${pipelineVeraenderung}` : pipelineWert, label: 'Pipeline' },
          { wert: umsatzWoche, label: 'Umsatz Woche' },
          { wert: provisionenWoche, label: 'Provisionen' },
        ]}
      />

      <Kennzahlen
        werte={[
          { wert: offeneFinanzierungen, label: 'Offene Finanzierungen' },
          { wert: gesamtKontakte, label: 'Kontakte gesamt' },
          { wert: neueKontakteWoche, label: 'Neue Kontakte' },
        ]}
      />

      <Kennzahlen
        titel="Team"
        werte={[
          { wert: aktiveBerater, label: 'Aktive Berater' },
          { wert: topBerater || 'niemand', label: 'Stärkster Partner' },
          { wert: topBeraterLeads, label: 'Dessen Leads' },
        ]}
      />

      <Kennzahlen
        titel="Objekte"
        werte={[
          { wert: neueEinreichungen, label: 'Neue Einreichungen' },
          { wert: reservierteWohnungen, label: 'Reserviert' },
          { wert: freieWohnungen, label: 'Frei' },
        ]}
      />

      <Kennzahlen
        titel="Operatives"
        werte={[
          { wert: offeneAufgaben, label: 'Offene Aufgaben' },
          { wert: erledigteAufgaben, label: 'Erledigt' },
          { wert: ueberfaelligeFollowUps, label: 'Überfällig', ton: ueberfaelligeFollowUps > 0 ? 'warnung' : 'neutral' },
        ]}
      />

      <Kennzahlen
        werte={[
          { wert: neueBewerbungen, label: 'Bewerbungen' },
          { wert: stagnierendeDeals, label: 'Stagnierend', ton: stagnierendeDeals > 0 ? 'warnung' : 'neutral' },
          { wert: verloreneWoche, label: 'Verloren', ton: verloreneWoche > 0 ? 'fehler' : 'neutral' },
        ]}
      />

      <Kennzahlen
        titel={ausblickVonBis ? `Nächste Woche, ${ausblickVonBis}` : 'Nächste Woche'}
        werte={[
          { wert: ausblickErstgespraeche, label: 'Erstgespräche' },
          { wert: ausblickBeratungen, label: 'Beratungen' },
          { wert: ausblickNotartermine, label: 'Notartermine' },
        ]}
      />

      <Kennzahlen
        werte={[
          { wert: ausblickFollowUps, label: 'Fällige Follow-Ups' },
          { wert: ausblickFaelligkeiten, label: 'Fällige Kaufpreise' },
        ]}
      />

      {geburtstage.length > 0 && (
        <Liste titel="Geburtstage nächste Woche" punkte={geburtstage} />
      )}

      {highlights.length > 0 && (
        <Liste titel="Highlights der Woche" punkte={highlights.map((h) => ({ text: h }))} />
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    `Wochenbericht${data?.zeitraumVon ? ` ${data.zeitraumVon} bis ${data.zeitraumBis}` : ''}`,
  displayName: 'Wöchentliche CEO-Zusammenfassung',
  previewData: {
    name: 'Christian Peetz',
    neueLeads: 24,
    qualifizierteLeads: 8,
    termineBucht: 5,
    reservierungen: 2,
    abschluesse: 1,
    conversionRate: '4,2%',
    pipelineWert: '1.240.000 €',
    pipelineVeraenderung: '+12%',
    umsatzWoche: '385.000 €',
    provisionenWoche: '11.550 €',
    offeneFinanzierungen: 3,
    gesamtKontakte: 412,
    neueKontakteWoche: 24,
    aktiveBerater: 6,
    topBerater: 'Max M.',
    topBeraterLeads: 9,
    neueEinreichungen: 1,
    reservierteWohnungen: 4,
    freieWohnungen: 12,
    neueBewerbungen: 2,
    offeneAufgaben: 14,
    erledigteAufgaben: 9,
    ueberfaelligeFollowUps: 4,
    highlights: ['Erster Abschluss im Objekt Memmingen Süd', 'Zwei neue Vertriebspartner unterschrieben'],
    zeitraumVon: '17.03.',
    zeitraumBis: '21.03.2026',
    ausblickErstgespraeche: 6,
    ausblickBeratungen: 3,
    ausblickNotartermine: 1,
    ausblickFollowUps: 12,
    ausblickFaelligkeiten: 2,
    geburtstageTeamListe: ['Anna Berater'],
    geburtstageKundenListe: ['Max Mustermann', 'Clara Test'],
    ausblickVonBis: '24.03. bis 30.03.',
    stagnierendeDeals: 5,
    verloreneWoche: 2,
  },
} satisfies TemplateEntry
