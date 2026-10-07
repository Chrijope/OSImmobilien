import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Liste, kurzesDatum, kuerze, echterAnlass } from './_layout.tsx'

/**
 * Meldung an den Vertriebspartner, dass ein Kunde seinen Termin verschoben hat.
 *
 * Der Termin in der Kundenakte wandert seit der Migration 20260804170000 mit,
 * der Kalender des Partners zeigt also die neue Zeit. Nur erfahren hat er es
 * bisher nicht: Wer morgens auf seinen Kalender sieht, merkt nicht, dass dort
 * seit gestern etwas anderes steht als das, was er im Kopf hatte.
 */

interface Props {
  kundeName?: string
  kundeEmail?: string
  kundeTelefon?: string
  /** Ausgeschrieben, also "Samstag, 8. August 2026". */
  terminDatum?: string
  /** HH:MM ohne "Uhr". */
  terminUhrzeit?: string
  terminDauer?: number
  terminTitel?: string
  /** Die bisherige Zeit als fertiger Satz. */
  alteZeit?: string
  /** Seite des Kontakts im CRM. */
  kundeUrl?: string
  /** Vollstaendige Adresse zum Videoraum oder Meeting. */
  zugangUrl?: string
}

const Mail = ({
  kundeName,
  kundeEmail,
  kundeTelefon,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  terminTitel,
  alteZeit,
  kundeUrl,
  zugangUrl,
}: Props) => {
  const wer = (kundeName || '').trim() || 'Ein Interessent'
  const anlass = echterAnlass(terminTitel)

  const zeilen: Array<[string, string]> = []
  if (kundeName) zeilen.push(['Name', kundeName])
  if (kundeEmail) zeilen.push(['E-Mail', kundeEmail])
  if (kundeTelefon) zeilen.push(['Telefon', kundeTelefon])

  const termin: Array<[string, string]> = []
  if (anlass) termin.push(['Terminart', anlass])
  if (terminDatum) termin.push(['Neues Datum', terminDatum])
  if (terminUhrzeit) termin.push(['Neue Uhrzeit', `${terminUhrzeit} Uhr`])
  if (terminDauer) termin.push(['Dauer', `${terminDauer} Minuten`])
  if (alteZeit) termin.push(['Bisher', alteZeit])

  const links: Array<{ text: string; href?: string }> = []
  if (zugangUrl) links.push({ text: 'Videoraum zum Termin', href: zugangUrl })

  return (
    <EmailLayout
      augenbraue="Termin verschoben"
      titel={`${wer} hat verschoben`}
      vorschau={`Neue Zeit${terminDatum ? `: ${terminDatum}` : ''}${terminUhrzeit ? `, ${terminUhrzeit} Uhr` : ''}.`}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        der Termin steht jetzt zu einer anderen Zeit. Dein Kalender und der Videoraum sind bereits
        umgestellt, die alte Zeit ist wieder frei. Der Kunde hat eine neue Bestätigung erhalten.
      </Absatz>

      {kundeUrl && <Handlung href={kundeUrl} text="Zum Kundenprofil" />}

      {zeilen.length > 0 && <Angaben titel="Wer verschoben hat" zeilen={zeilen} />}

      {termin.length > 0 && <Angaben titel="Der Termin" zeilen={termin} />}

      {links.length > 0 && <Liste titel="Zugang" punkte={links} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const wer = kuerze(String(data?.kundeName || '').trim() || 'Ein Interessent', 24)
    const datum = kurzesDatum(String(data?.terminDatum || ''))
    const zeit = String(data?.terminUhrzeit || '').trim()
    if (datum && zeit) return `Verschoben: ${wer}, ${datum}, ${zeit} Uhr`
    if (datum) return `Verschoben: ${wer}, ${datum}`
    return `Verschoben: ${wer}`
  },
  displayName: 'Buchung: neue Zeit an den Vertriebspartner',
  previewData: {
    kundeName: 'Martina Brandl',
    kundeEmail: 'martina.brandl@example.de',
    kundeTelefon: '+49 170 1234567',
    terminDatum: 'Samstag, 8. August 2026',
    terminUhrzeit: '14:00',
    terminDauer: 15,
    terminTitel: 'Telefonisches Erstgespräch',
    alteZeit: 'Donnerstag, 6. August 2026, 10:15 Uhr',
    kundeUrl: 'https://portal.more.immo/kunden/00000000-0000-0000-0000-000000000000',
    zugangUrl: 'https://portal.more.immo/raum/abc123',
  },
} satisfies TemplateEntry
