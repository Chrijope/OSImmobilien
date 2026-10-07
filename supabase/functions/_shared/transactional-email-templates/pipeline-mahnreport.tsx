import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Kennzahlen, Posten, Hinweis } from './_layout.tsx'

interface MahnLead {
  id: string
  name: string
  pipelineStufe: string
  stufeLabel: string
  daysInactive: number
  isRed: boolean
  link: string
  berater?: string
}

interface StufeGruppe {
  stufeLabel: string
  leads: MahnLead[]
}

interface Props {
  vpName?: string
  rotGruppen?: StufeGruppe[]
  orangeGruppen?: StufeGruppe[]
  pipelineLink?: string
  totalKritisch?: number
  totalRot?: number
  totalOrange?: number
  zeitraum?: string
  /**
   * Führungsfassung: dieselbe Aufstellung, aber für den ganzen Bereich statt
   * für die eigenen Leads. Ändert nur die Anrede und die Einleitung, denn
   * "Diese Leads warten auf dich" stimmt für einen Vertriebsleiter nicht. Die
   * Betreuernamen kommen ohnehin über `berater` je Zeile mit.
   */
  fuehrung?: boolean
}

const postenAus = (gruppen: StufeGruppe[], ton: 'fehler' | 'warnung') =>
  gruppen.flatMap((g) =>
    g.leads.map((l) => ({
      text: l.name,
      href: l.link,
      unter: l.berater ? `${g.stufeLabel}  ·  ${l.berater}` : g.stufeLabel,
      wert: `${l.daysInactive} Tage still`,
      ton,
    })),
  )

const Mail = ({
  vpName = '',
  rotGruppen = [],
  orangeGruppen = [],
  pipelineLink = 'https://osimmobilien.netlify.app/pipeline',
  totalRot = 0,
  totalOrange = 0,
  totalKritisch = 0,
  zeitraum = '',
  fuehrung = false,
}: Props) => {
  const vorname = vpName ? vpName.split(' ')[0] : ''
  const alleRuhig = totalKritisch === 0

  const titel = alleRuhig
    ? 'Alles im grünen Bereich'
    : fuehrung
    ? 'Diese Leads liegen in deinem Bereich'
    : 'Diese Leads warten auf dich'

  const einleitung = alleRuhig
    ? fuehrung
      ? 'dein wöchentlicher Pipeline-Check: In deinem Bereich liegt kein Lead zu lange still.'
      : 'dein wöchentlicher Pipeline-Check: kein Lead liegt zu lange still. Weiter so.'
    : fuehrung
    ? 'dein wöchentlicher Pipeline-Check für deinen Bereich. Diese Leads hatten länger keine Aktivität mehr. Hinter jedem Namen steht, in welcher Stufe er liegt und wer ihn betreut.'
    : 'dein wöchentlicher Pipeline-Check. Diese Leads hatten länger keine Aktivität mehr und brauchen deine Aufmerksamkeit, damit kein Kunde verloren geht.'

  return (
    <EmailLayout
      augenbraue={zeitraum || 'Pipeline-Check'}
      titel={titel}
      vorschau={
        alleRuhig
          ? 'Kein Lead liegt zu lange still.'
          : `${totalKritisch} Lead${totalKritisch === 1 ? '' : 's'} ohne Aktivität.`
      }
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>{einleitung}</Absatz>

      <Handlung href={pipelineLink} text="Pipeline öffnen" />

      {!alleRuhig && (
        <Kennzahlen
          werte={[
            { wert: totalRot, label: 'Kritisch', ton: 'fehler' },
            { wert: totalOrange, label: 'Bald kritisch', ton: 'warnung' },
          ]}
        />
      )}

      {rotGruppen.length > 0 && (
        <Posten titel="Sofort handeln" zeilen={postenAus(rotGruppen, 'fehler')} />
      )}

      {orangeGruppen.length > 0 && (
        <Posten titel="Bald handeln" zeilen={postenAus(orangeGruppen, 'warnung')} />
      )}

      {!alleRuhig && (
        <Hinweis
          text={
            fuehrung
              ? 'Ein Klick auf den Namen öffnet das Kundenprofil. Jede Aktivität dort setzt den Zähler zurück. Der Zuständige bekommt zu jedem dieser Leads eine eigene Aufgabe.'
              : 'Ein Klick auf den Namen öffnet das Kundenprofil. Jede Aktivität dort setzt den Zähler zurück.'
          }
        />
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const total = data?.totalKritisch ?? 0
    if (total === 0) return 'Pipeline-Check: alles im grünen Bereich'
    if (data?.fuehrung) {
      return `Pipeline-Check: ${total} Lead${total === 1 ? '' : 's'} in deinem Bereich liegen still`
    }
    return `Pipeline-Check: ${total} Lead${total === 1 ? '' : 's'} brauchen deine Aufmerksamkeit`
  },
  displayName: 'Pipeline-Mahnreport (wöchentlich)',
  previewData: {
    vpName: 'Max Mustermann',
    zeitraum: 'Montag, 28.04.2026',
    totalRot: 2,
    totalOrange: 3,
    totalKritisch: 5,
    pipelineLink: 'https://osimmobilien.netlify.app/pipeline',
    rotGruppen: [
      {
        stufeLabel: 'Erstgespräch',
        leads: [
          { id: '1', name: 'Anna Beispiel', pipelineStufe: 'erstgespraech', stufeLabel: 'Erstgespräch', daysInactive: 12, isRed: true, link: 'https://osimmobilien.netlify.app/kunden/1' },
          { id: '2', name: 'Bernd Demo', pipelineStufe: 'erstgespraech', stufeLabel: 'Erstgespräch', daysInactive: 8, isRed: true, link: 'https://osimmobilien.netlify.app/kunden/2' },
        ],
      },
    ],
    orangeGruppen: [
      {
        stufeLabel: 'Bonitätsunterlagen',
        leads: [
          { id: '3', name: 'Clara Test', pipelineStufe: 'bonitaetsunterlagen', stufeLabel: 'Bonitätsunterlagen', daysInactive: 8, isRed: false, link: 'https://osimmobilien.netlify.app/kunden/3' },
        ],
      },
      {
        stufeLabel: 'Reservierung',
        leads: [
          { id: '4', name: 'Doreen Probe', pipelineStufe: 'reservierung', stufeLabel: 'Reservierung', daysInactive: 13, isRed: false, link: 'https://osimmobilien.netlify.app/kunden/4' },
          { id: '5', name: 'Erik Sample', pipelineStufe: 'reservierung', stufeLabel: 'Reservierung', daysInactive: 11, isRed: false, link: 'https://osimmobilien.netlify.app/kunden/5' },
        ],
      },
    ],
  },
} satisfies TemplateEntry
