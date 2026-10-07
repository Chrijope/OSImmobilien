import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Textblock, Hinweis } from './_layout.tsx'

/**
 * Der Kunde schickt seine Anlage-V-Aufstellung aus dem Portal an seinen
 * Steuerberater. Das PDF haengt der Mail als Datei an (send-anlage-v).
 *
 * Zwei bewusste Abweichungen vom ueblichen Kundenmail-Aufbau:
 *
 *   Kein Ansprechpartner-Block (ohneUnterschrift): Die Mail geht im Namen des
 *   Kunden an dessen Steuerberater. Ein OS Immobilien-Vertriebskontakt unter einer
 *   fremden Steuerunterlage waere fehl am Platz. Deshalb fuehrt previewData
 *   auch KEIN berater-Feld, sonst wuerde send-transactional-email den
 *   Ansprechpartner aus dem JWT ergaenzen (siehe ansprechpartnerErgaenzen).
 *
 *   Kein Abmeldelink (intern): Der Steuerberater ist kein Newsletter-Empfaenger,
 *   sondern bekommt eine einzelne, vom Kunden ausgeloeste Zustellung. Ein
 *   Abmeldelink wuerde ihn nur versehentlich auf die Sperrliste bringen.
 */
interface Props {
  /** Name des Kunden, der die Aufstellung verschickt. */
  kundenName?: string
  /** Anmeldeadresse des Kunden; Antworten gehen per Reply-To dorthin. */
  kundenEmail?: string
  investmentBezeichnung?: string
  jahr?: number
  dateiname?: string
  /** Optionale persoenliche Nachricht des Kunden. */
  nachricht?: string
}

const Mail = ({ kundenName, kundenEmail, investmentBezeichnung, jahr, dateiname, nachricht }: Props) => (
  <EmailLayout
    augenbraue="Unterlagen zur Steuererklärung"
    titel="Aufstellung zur Anlage V"
    vorschau={`Aufstellung zur Vorbereitung der Anlage V ${jahr ?? ''} als PDF im Anhang.`}
    anrede="Guten Tag,"
    ohneUnterschrift
    intern
    fussHinweis="Diese E-Mail wurde über das OS Immobilien Kundenportal versendet. Antworten gehen direkt an den Absender."
  >
    <Absatz>
      {kundenName ? `${kundenName} übersendet Ihnen` : 'anbei erhalten Sie'} die Aufstellung zur
      Vorbereitung der Anlage V. Das Dokument liegt dieser E-Mail als PDF bei; fehlende Angaben
      sind darin ausdrücklich gekennzeichnet.
    </Absatz>

    <Angaben
      titel="Zum Anhang"
      zeilen={[
        ['Objekt', investmentBezeichnung || 'Investment'],
        ['Veranlagungsjahr', jahr != null ? String(jahr) : ''],
        ['Datei', dateiname || 'anlage-v-vorbereitung.pdf'],
      ].filter(([, wert]) => wert !== '') as Array<[string, string]>}
    />

    {nachricht && <Textblock titel="Nachricht des Absenders" text={nachricht} />}

    <Hinweis text="Die Aufstellung dient der Vorbereitung der Anlage V und ersetzt keine Steuerberatung. Die Übertragung in das amtliche Formular nimmt der Steuerberater vor." />

    {kundenEmail && (
      <Absatz letzter>
        Rückfragen richten Sie bitte direkt an {kundenName || 'den Absender'} ({kundenEmail}).
        Eine Antwort auf diese E-Mail kommt dort an.
      </Absatz>
    )}
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) =>
    d?.subject || `Vorbereitung Anlage V ${d?.jahr ?? ''}: ${d?.investmentBezeichnung ?? 'Investment'}`.trim(),
  displayName: 'Anlage V Aufstellung an den Steuerberater',
  // Bewusst OHNE berater-Feld, siehe Kommentar oben.
  previewData: {
    kundenName: 'Max Mustermann',
    kundenEmail: 'max.mustermann@example.de',
    investmentBezeichnung: 'Wohnung Leipzig, Musterstraße 1',
    jahr: 2025,
    dateiname: 'anlage-v-vorbereitung_wohnung-leipzig_2025.pdf',
    nachricht: 'Guten Tag Frau Steuerberaterin, anbei die Aufstellung für die Wohnung in Leipzig.',
  },
} satisfies TemplateEntry
