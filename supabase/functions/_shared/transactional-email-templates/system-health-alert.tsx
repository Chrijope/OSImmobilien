import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Liste, Hinweis } from './_layout.tsx'

interface Props {
  dlqAuth?: number
  dlqTransactional?: number
  reassignedLeads?: number
  reassignedTo?: string
  details?: string[]
}

const Mail = ({
  dlqAuth = 0,
  dlqTransactional = 0,
  reassignedLeads = 0,
  reassignedTo = '',
  details = [],
}: Props) => {
  const steckenGeblieben = dlqAuth + dlqTransactional
  const zeilen: Array<[string, string]> = [
    ['Anmeldemails in der Warteschlange', String(dlqAuth)],
    ['Transaktionsmails in der Warteschlange', String(dlqTransactional)],
    ['Automatisch zugewiesene Leads', String(reassignedLeads)],
  ]
  if (reassignedLeads > 0 && reassignedTo) zeilen.push(['Zugewiesen an', reassignedTo])

  return (
    <EmailLayout
      augenbraue="System-Monitoring"
      titel={steckenGeblieben > 0 ? 'Es hängt etwas' : 'Alles ruhig'}
      vorschau={
        steckenGeblieben > 0
          ? `${steckenGeblieben} Nachrichten sind nicht zugestellt worden.`
          : 'Täglicher Statusbericht, keine Auffälligkeiten.'
      }
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {steckenGeblieben > 0
          ? `${steckenGeblieben} Nachrichten konnten nicht zugestellt werden und liegen in der Fehlerwarteschlange.`
          : 'der tägliche Statusbericht zur Systemgesundheit, ohne Auffälligkeiten.'}
      </Absatz>

      <Angaben titel="Zahlen des Tages" zeilen={zeilen} />

      {details.length > 0 && (
        <Liste titel="Details" punkte={details.map((d) => ({ text: d }))} />
      )}

      {steckenGeblieben > 0 && (
        <Hinweis ton="warnung" text="Bitte die Fehlerwarteschlange prüfen, betroffene Empfänger bekommen sonst nichts." />
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const offen = (Number(data?.dlqAuth) || 0) + (Number(data?.dlqTransactional) || 0)
    return offen > 0
      ? `System-Health-Report: ${offen} Nachrichten hängen`
      : 'System-Health-Report: alles ruhig'
  },
  displayName: 'System Health Alert',
  previewData: {
    dlqAuth: 0,
    dlqTransactional: 3,
    reassignedLeads: 2,
    reassignedTo: 'Christian Peetz',
    details: ['Transactional-DLQ seit 06:00 Uhr unverändert'],
  },
} satisfies TemplateEntry
