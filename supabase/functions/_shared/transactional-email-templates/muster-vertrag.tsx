import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'

/**
 * Du-Form wie der ganze Bewerberweg und `vertrag-signatur`. Bis zum
 * 26.09.2026 stand hier ein Gemisch aus "Guten Tag Vorname," und Sie.
 */

interface Props {
  bewerberName?: string
  paketTitel?: string
  pdfUrl?: string
  beraterName?: string
  /* Das Profilbild kam flach herein, die Vorlage las aber nur
     berater.bildUrl. Deshalb fehlte es in der Mail. */
  beraterBild?: string
  beraterEmail?: string
  beraterTelefon?: string
  trackingClickUrl?: string
  berater?: Ansprechpartner
}

const Mail = ({
  bewerberName,
  paketTitel,
  pdfUrl,
  beraterName,
  beraterBild,
  beraterEmail,
  beraterTelefon,
  trackingClickUrl,
  berater,
}: Props) => {
  const person: Ansprechpartner | undefined =
    berater || beraterName
      ? {
          name: berater?.name || beraterName,
          rolle: berater?.rolle,
          telefon: berater?.telefon || beraterTelefon,
          email: berater?.email || beraterEmail,
          bildUrl: berater?.bildUrl || beraterBild,
        }
      : undefined

  return (
    <EmailLayout
      augenbraue="Zur Vorab-Ansicht"
      titel="Der Mustervertrag"
      vorschau={paketTitel ? `Anonymisierter Mustervertrag für ${paketTitel}.` : 'Anonymisierter Mustervertrag zur Vorab-Ansicht.'}
      anrede={hallo(bewerberName)}
      person={person}
    >
      <Absatz letzter>
        wie besprochen kommt hier der anonymisierte Mustervertrag
        {paketTitel ? ` für das Paket ${paketTitel}` : ''}, ausschließlich zur Ansicht und zur
        eigenen Prüfung.
      </Absatz>

      {pdfUrl && (
        <Handlung
          href={trackingClickUrl || pdfUrl}
          text="Mustervertrag öffnen"
          hinweis="PDF  ·  Link 90 Tage gültig"
        />
      )}

      <Hinweis ton="warnung" text="Der Mustervertrag ist unverbindlich und nicht zu unterschreiben. Verbindliche Konditionen ergeben sich erst aus dem von dir unterschriebenen Handelsvertretervertrag samt Anlage 2." />

      <Absatz>
        Wenn du Fragen zu einzelnen Paragraphen, zur Provisionsstaffel oder zur Zahlungsweise
        hast, gehen wir den Vertrag gerne gemeinsam durch.
      </Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    data?.paketTitel
      ? `Mustervertrag ${data.paketTitel} zur Vorab-Ansicht`
      : 'Mustervertrag zur Vorab-Ansicht',
  displayName: 'Mustervertrag (anonymisiert)',
  previewData: {
    bewerberName: 'Max Mustermann',
    paketTitel: 'Lead Berater',
    pdfUrl: 'https://example.com/muster-vertrag.pdf',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
