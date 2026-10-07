import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Textblock, kurzesDatum, kuerze, echterAnlass } from './_layout.tsx'

/**
 * Meldung an den Vertriebspartner, dass ein Kunde seinen Termin abgesagt hat.
 *
 * Vorher erfuhr er davon nur, wenn er zufaellig ins CRM sah. Er sass also
 * moeglicherweise um zehn im Videoraum und wartete auf jemanden, der zwei Tage
 * vorher abgesagt hatte.
 */

interface Props {
  kundeName?: string
  kundeEmail?: string
  kundeTelefon?: string
  /** Was der Kunde als Grund angegeben hat. Freiwillig, oft leer. */
  grund?: string
  /** Ausgeschrieben, also "Donnerstag, 6. August 2026". */
  terminDatum?: string
  /** HH:MM ohne "Uhr". */
  terminUhrzeit?: string
  terminDauer?: number
  terminTitel?: string
  /** Seite des Kontakts im CRM. */
  kundeUrl?: string
}

const Mail = ({
  kundeName,
  kundeEmail,
  kundeTelefon,
  grund,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  terminTitel,
  kundeUrl,
}: Props) => {
  const wer = (kundeName || '').trim() || 'Ein Interessent'
  const anlass = echterAnlass(terminTitel)

  const zeilen: Array<[string, string]> = []
  if (kundeName) zeilen.push(['Name', kundeName])
  if (kundeEmail) zeilen.push(['E-Mail', kundeEmail])
  if (kundeTelefon) zeilen.push(['Telefon', kundeTelefon])

  const termin: Array<[string, string]> = []
  if (anlass) termin.push(['Terminart', anlass])
  if (terminDatum) termin.push(['Datum', terminDatum])
  if (terminUhrzeit) termin.push(['Uhrzeit', `${terminUhrzeit} Uhr`])
  if (terminDauer) termin.push(['Dauer', `${terminDauer} Minuten`])

  return (
    <EmailLayout
      augenbraue="Absage"
      titel={`${wer} hat abgesagt`}
      vorschau={`${wer} hat den Termin${terminDatum ? ` am ${terminDatum}` : ''} abgesagt.`}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        der Termin ist abgesagt. Die Zeit in deinem Kalender ist wieder frei, der Videoraum ist
        geschlossen, und der Termin in der Kundenakte ist als abgesagt gekennzeichnet. Der Kunde hat
        eine Bestätigung der Absage erhalten.
      </Absatz>

      {kundeUrl && <Handlung href={kundeUrl} text="Zum Kundenprofil" />}

      {zeilen.length > 0 && <Angaben titel="Wer abgesagt hat" zeilen={zeilen} />}

      {termin.length > 0 && <Angaben titel="Der abgesagte Termin" zeilen={termin} />}

      {grund && <Textblock titel="Angegebener Grund" text={grund} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const wer = kuerze(String(data?.kundeName || '').trim() || 'Ein Interessent', 28)
    const datum = kurzesDatum(String(data?.terminDatum || ''))
    const zeit = String(data?.terminUhrzeit || '').trim()
    if (datum && zeit) return `Absage: ${wer}, ${datum}, ${zeit} Uhr`
    if (datum) return `Absage: ${wer}, ${datum}`
    return `Absage: ${wer}`
  },
  displayName: 'Buchung: Absage an den Vertriebspartner',
  previewData: {
    kundeName: 'Martina Brandl',
    kundeEmail: 'martina.brandl@example.de',
    kundeTelefon: '+49 170 1234567',
    grund: 'Mir ist beruflich etwas dazwischengekommen, ich melde mich nächste Woche noch einmal.',
    terminDatum: 'Donnerstag, 6. August 2026',
    terminUhrzeit: '10:15',
    terminDauer: 15,
    terminTitel: 'Telefonisches Erstgespräch',
    kundeUrl: 'https://osimmobilien.netlify.app/kunden/00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry
