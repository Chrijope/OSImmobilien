import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Liste, Schritte } from './_layout.tsx'

/**
 * Interne Sammelmail an den Vertriebspartner, wenn ihm mehrere Kontakte auf
 * einmal zugewiesen wurden, etwa ueber die Massenzuweisung in der Kontaktliste
 * oder beim Umhaengen eines abgeschalteten Kontos.
 *
 * Eine Mail statt fuenfzig: Ab drei Kontakten in einem Rutsch waere je eine
 * Einzelmail nur noch Laerm im Postfach. Die Liste nennt jeden Kontakt mit
 * Link ins CRM, gekuerzt ab einer Obergrenze, damit die Mail lesbar bleibt.
 *
 * Wie die Einzelmail bewusst im internen Du und ohne Ansprechpartner-Block
 * (`intern`, `ohneUnterschrift`): Empfaenger ist ein Partner, kein Kunde.
 */
interface LeadEintrag {
  name: string
  url?: string
}

interface Props {
  partnerVorname?: string
  anzahl?: number
  leads?: LeadEintrag[]
  /** Wie viele Kontakte ueber die gezeigte Liste hinaus dazukamen. */
  weitere?: number
  uebersichtUrl?: string
}

const Mail = ({ partnerVorname, anzahl, leads, weitere, uebersichtUrl }: Props) => {
  const zahl = anzahl || (leads || []).length || 0
  const punkte = (leads || [])
    .filter((l) => (l.name || '').trim())
    .map((l) => ({ text: l.name.trim(), href: l.url || undefined }))
  if (weitere && weitere > 0) {
    punkte.push({ text: `und ${weitere} weitere Kontakte`, href: uebersichtUrl || undefined })
  }

  return (
    <EmailLayout
      augenbraue="Neue Zuweisung"
      titel={`${zahl} Kontakte warten auf dich`}
      vorschau={`Dir wurden gerade ${zahl} Kontakte zugewiesen.`}
      anrede={partnerVorname ? `Hey ${partnerVorname},` : 'Hey,'}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        dir wurden gerade <strong>{zahl} Kontakte</strong> zugewiesen. Sie liegen jetzt in deiner
        Kontaktliste und warten auf deinen Anruf. Je schneller der erste Kontakt, desto groesser
        die Chance auf ein Erstgespraech.
      </Absatz>

      <Handlung
        href={uebersichtUrl || ''}
        text="Kontakte im CRM oeffnen"
        hinweis="Am besten noch heute mit den ersten Anrufen starten"
      />

      {punkte.length > 0 && <Liste titel="Deine neuen Kontakte" punkte={punkte} />}

      <Schritte titel="Was jetzt zu tun ist" punkte={[
        'Die Liste durchgehen und jeden Kontakt anrufen.',
        'Jeden Kontaktversuch im Profil protokollieren.',
        'Nicht erreicht? Follow-up setzen, damit niemand liegen bleibt.',
      ]} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const zahl = Number(data?.anzahl) || (Array.isArray(data?.leads) ? data.leads.length : 0)
    return zahl > 0
      ? `Neue Zuweisung: ${zahl} Kontakte warten auf dich`
      : 'Neue Zuweisung: mehrere Kontakte warten auf dich'
  },
  displayName: 'Sammelzuweisung an Vertriebspartner',
  previewData: {
    partnerVorname: 'Julian',
    anzahl: 5,
    leads: [
      { name: 'Maja Mustermann', url: 'https://portal.more.immo/kunden/00000000-0000-0000-0000-000000000001' },
      { name: 'Bernd Beispiel', url: 'https://portal.more.immo/kunden/00000000-0000-0000-0000-000000000002' },
      { name: 'Carla Conrad', url: 'https://portal.more.immo/kunden/00000000-0000-0000-0000-000000000003' },
    ],
    weitere: 2,
    uebersichtUrl: 'https://portal.more.immo/kontakte',
  },
} satisfies TemplateEntry
