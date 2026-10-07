import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Liste, Textblock, kurzesDatum, kuerze } from './_layout.tsx'

/**
 * Meldung an den Vertriebspartner, sobald ueber seinen Buchungslink gebucht
 * wurde.
 *
 * Bisher erfuhr er von einer Buchung nur, wenn er zufaellig ins CRM sah. Diese
 * Mail ist bewusst kurz und sachlich: wer, wann, worum es geht, wie man den
 * Bucher erreicht und wo im CRM er steht.
 */

interface Props {
  kundeName?: string
  kundeEmail?: string
  kundeTelefon?: string
  /** Freitext des Buchenden aus dem Formular. */
  nachricht?: string
  /** Ausgeschrieben, also "Donnerstag, 6. August 2026". */
  terminDatum?: string
  /** HH:MM ohne "Uhr". */
  terminUhrzeit?: string
  /** Minuten. */
  terminDauer?: number
  terminTitel?: string
  /** Ob der Buchende durch die Buchung neu angelegt wurde. */
  kundeNeu?: boolean
  /** Seite des Kontakts im CRM. */
  kundeUrl?: string
  /** Vollstaendige Adresse zum Videoraum oder Meeting. */
  zugangUrl?: string
}

const Mail = ({
  kundeName,
  kundeEmail,
  kundeTelefon,
  nachricht,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  terminTitel,
  kundeNeu,
  kundeUrl,
  zugangUrl,
}: Props) => {
  const wer = (kundeName || '').trim() || 'Ein Interessent'

  const zeilen: Array<[string, string]> = []
  if (kundeName) zeilen.push(['Name', kundeName])
  if (kundeEmail) zeilen.push(['E-Mail', kundeEmail])
  if (kundeTelefon) zeilen.push(['Telefon', kundeTelefon])
  zeilen.push(['Im CRM', kundeNeu ? 'Neu angelegt' : 'War bereits vorhanden'])

  const termin: Array<[string, string]> = []
  if (terminTitel) termin.push(['Terminart', terminTitel])
  if (terminDatum) termin.push(['Datum', terminDatum])
  if (terminUhrzeit) termin.push(['Uhrzeit', `${terminUhrzeit} Uhr`])
  if (terminDauer) termin.push(['Dauer', `${terminDauer} Minuten`])

  const links: Array<{ text: string; href?: string }> = []
  if (zugangUrl) links.push({ text: 'Videoraum zum Termin', href: zugangUrl })

  return (
    <EmailLayout
      augenbraue="Neue Buchung"
      titel={`${wer} hat einen Termin gebucht`}
      vorschau={`${wer}${terminDatum ? `, ${terminDatum}` : ''}${terminUhrzeit ? ` um ${terminUhrzeit} Uhr` : ''}.`}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        über deinen Buchungslink wurde gerade ein Termin gebucht. Der Termin steht bereits in
        deinem Kalender, der Kunde hat seine Bestätigung mit dem Videoraumlink erhalten.
      </Absatz>

      {kundeUrl && (
        <Handlung
          href={kundeUrl}
          text="Zum Kundenprofil"
          hinweis={kundeNeu ? 'Der Kontakt wurde durch diese Buchung neu angelegt' : undefined}
        />
      )}

      {zeilen.length > 0 && <Angaben titel="Wer gebucht hat" zeilen={zeilen} />}

      {termin.length > 0 && <Angaben titel="Der Termin" zeilen={termin} />}

      {nachricht && <Textblock titel="Nachricht des Buchenden" text={nachricht} />}

      {links.length > 0 && <Liste titel="Zugang" punkte={links} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  /**
   * Die alte Zeile war 71 Zeichen lang, das Postfach zeigt etwa 60. Der
   * Wochentag und die Jahreszahl entfallen, der Name wird notfalls gekuerzt.
   */
  subject: (data: Record<string, any>) => {
    const wer = kuerze(String(data?.kundeName || '').trim() || 'Ein Interessent', 28)
    const datum = kurzesDatum(String(data?.terminDatum || ''))
    const zeit = String(data?.terminUhrzeit || '').trim()
    if (datum && zeit) return `Neue Buchung: ${wer}, ${datum}, ${zeit} Uhr`
    if (datum) return `Neue Buchung: ${wer}, ${datum}`
    return `Neue Buchung: ${wer}`
  },
  displayName: 'Buchung: Meldung an den Vertriebspartner',
  previewData: {
    kundeName: 'Martina Brandl',
    kundeEmail: 'martina.brandl@example.de',
    kundeTelefon: '+49 170 1234567',
    nachricht: 'Ich interessiere mich für eine Eigentumswohnung als Kapitalanlage und hätte vorab ein paar Fragen zur Finanzierung.',
    terminDatum: 'Donnerstag, 6. August 2026',
    terminUhrzeit: '10:15',
    terminDauer: 15,
    terminTitel: 'Telefonisches Erstgespräch',
    kundeNeu: true,
    kundeUrl: 'https://portal.more.immo/kunden/00000000-0000-0000-0000-000000000000',
    zugangUrl: 'https://portal.more.immo/raum/abc123',
  },
} satisfies TemplateEntry
