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
  umsatzWoche?: string
  provisionenWoche?: string
  offeneAufgaben?: number
  erledigteAufgaben?: number
  ueberfaelligeFollowUps?: number
  highlights?: string[]
  zeitraumVon?: string
  zeitraumBis?: string
  rangPosition?: number
  teamGroesse?: number
  stagnierendeDeals?: number
  heisseDeals?: number
  ausblickErstgespraeche?: number
  ausblickBeratungen?: number
  ausblickNotartermine?: number
  ausblickFollowUps?: number
  ausblickGeburtstageKunden?: number
  ausblickVonBis?: string
  offeneBonitaet?: number
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
  umsatzWoche = '0 €',
  provisionenWoche = '0 €',
  offeneAufgaben = 0,
  erledigteAufgaben = 0,
  ueberfaelligeFollowUps = 0,
  highlights = [],
  zeitraumVon = '',
  zeitraumBis = '',
  rangPosition = 0,
  teamGroesse = 0,
  stagnierendeDeals = 0,
  heisseDeals = 0,
  ausblickErstgespraeche = 0,
  ausblickBeratungen = 0,
  ausblickNotartermine = 0,
  ausblickFollowUps = 0,
  ausblickGeburtstageKunden = 0,
  ausblickVonBis = '',
  offeneBonitaet = 0,
}: Props) => {
  const vorname = name ? name.split(' ')[0] : ''
  const zeitraum = zeitraumVon && zeitraumBis ? `${zeitraumVon} bis ${zeitraumBis}` : 'Diese Woche'

  return (
    <EmailLayout
      augenbraue={zeitraum}
      titel="Dein Wochenbericht"
      vorschau="Deine wichtigsten Zahlen der Woche auf einen Blick."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        hier ist dein persönlicher Wochenüberblick.
      </Absatz>

      <Kennzahlen
        titel="Deine Leads"
        werte={[
          { wert: neueLeads, label: 'Neu' },
          { wert: qualifizierteLeads, label: 'Qualifiziert' },
          { wert: termineBucht, label: 'Termine' },
        ]}
      />

      <Kennzahlen
        werte={[
          { wert: reservierungen, label: 'Reservierungen' },
          { wert: abschluesse, label: 'Abschlüsse' },
          { wert: conversionRate, label: 'Conversion' },
        ]}
      />

      <Kennzahlen
        titel="Umsatz"
        werte={[
          { wert: pipelineWert, label: 'Pipeline' },
          { wert: umsatzWoche, label: 'Woche' },
          { wert: provisionenWoche, label: 'Provisionen' },
        ]}
      />

      <Kennzahlen
        titel="Aufgaben"
        werte={[
          { wert: offeneAufgaben, label: 'Offen' },
          { wert: erledigteAufgaben, label: 'Erledigt' },
          { wert: ueberfaelligeFollowUps, label: 'Überfällig', ton: ueberfaelligeFollowUps > 0 ? 'warnung' : 'neutral' },
        ]}
      />

      <Kennzahlen
        titel="Deine Pipeline"
        werte={[
          { wert: heisseDeals, label: 'Heiß', ton: 'gut' },
          { wert: stagnierendeDeals, label: 'Stagnierend', ton: stagnierendeDeals > 0 ? 'warnung' : 'neutral' },
          { wert: offeneBonitaet, label: 'Bonität offen' },
        ]}
      />

      {teamGroesse > 0 && (
        <Kennzahlen werte={[{ wert: `${rangPosition} von ${teamGroesse}`, label: 'Dein Rang im Team' }]} />
      )}

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
          { wert: ausblickGeburtstageKunden, label: 'Geburtstage' },
        ]}
      />

      {highlights.length > 0 && (
        <Liste titel="Deine Highlights" punkte={highlights.map((h) => ({ text: h }))} />
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    `Dein Wochenbericht${data?.zeitraumVon ? ` ${data.zeitraumVon} bis ${data.zeitraumBis}` : ''}`,
  displayName: 'Wöchentlicher VP-Bericht',
  previewData: {
    name: 'Max Mustermann',
    neueLeads: 8,
    qualifizierteLeads: 3,
    termineBucht: 2,
    reservierungen: 1,
    abschluesse: 0,
    conversionRate: '0,0%',
    pipelineWert: '420.000 €',
    umsatzWoche: '0 €',
    provisionenWoche: '0 €',
    offeneAufgaben: 5,
    erledigteAufgaben: 3,
    ueberfaelligeFollowUps: 2,
    highlights: ['1 neue Reservierung', '3 Leads qualifiziert'],
    zeitraumVon: '17.03.',
    zeitraumBis: '21.03.2026',
    rangPosition: 3,
    teamGroesse: 12,
    stagnierendeDeals: 2,
    heisseDeals: 4,
    offeneBonitaet: 3,
    ausblickErstgespraeche: 2,
    ausblickBeratungen: 1,
    ausblickNotartermine: 0,
    ausblickFollowUps: 5,
    ausblickGeburtstageKunden: 2,
    ausblickVonBis: '24.03. bis 30.03.',
  },
} satisfies TemplateEntry
