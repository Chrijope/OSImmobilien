import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Schritte, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
// Die beiden Entscheidungen liegen daneben, damit sie Tests haben. Vitest
// laedt keine Vorlage mit `npm:react`, siehe `steuer-auswertung-text.ts`.
import { auswertungPerson, naechsterSchrittZeile } from '../steuer-auswertung-text.ts'

/**
 * Die Auswertung aus dem oeffentlichen Steuerrechner.
 *
 * SIE IST DER EINZIGE WEG ZUR AUSWERTUNG. Seit dem 17.09.2026 zeigt die
 * oeffentliche Seite das Ergebnis nicht mehr auf dem Bildschirm. Wer seine
 * Kontaktdaten eintraegt, bekommt sie hier und sonst nirgends. Das PDF haengt
 * deshalb AN DER MAIL und steht nicht nur hinter einem Knopf: Ein Anhang ist
 * da, auch wenn ein Link laengst abgelaufen ist.
 *
 * Dazu der Vermerk, dass wir uns zeitnah fuer ein Erstgespraech melden, in dem
 * die genauen Zahlen fuer seinen Fall gerechnet werden. Die Auswertung selbst
 * arbeitet mit einer Spanne, und die Mail sagt offen, warum: Ohne sein Objekt
 * und seine Unterlagen gibt es keine Punktzahl, die im Gespraech haelt.
 *
 * LEAD OHNE ZUGEORDNETEN PARTNER
 *
 * Seit der Rechner ohne Kuerzel fuer bezahlte Werbung laeuft, kommen Leads an,
 * denen noch kein Vertriebspartner zugeteilt ist. Dann traegt die Mail keinen
 * Unterschriftsblock: Der Platzhalter "OS Immobilien Team" mit der allgemeinen
 * Nummer sieht aus wie ein persoenlicher Ansprechpartner, ist aber keiner. Das
 * Layout kennt dafuer `ohneUnterschrift`, so wie die neutralen Systemmails.
 *
 * Auch die Zeile "Wie es weitergeht" aendert sich dann. Die Zusage bleibt, es
 * meldet sich jemand, nur steht der Name noch nicht fest.
 */

interface Props {
  kundeName?: string
  pdfUrl?: string
  beraterName?: string
  beraterEmail?: string
  beraterTelefon?: string
  beraterPosition?: string
  berater?: Ansprechpartner
}

const Mail = ({
  kundeName,
  pdfUrl,
  beraterName,
  beraterEmail,
  beraterTelefon,
  beraterPosition,
  berater,
}: Props) => {
  /*
   * Der Name entscheidet. Frueher genuegte ein vorhandenes `berater`-Objekt,
   * dann stand bei einem leeren Objekt ein Unterschriftsblock ohne Namen in
   * der Mail. Ohne Namen gibt es keinen Ansprechpartner, und dann bleibt der
   * Block ganz weg.
   */
  const person: Ansprechpartner | undefined = auswertungPerson({
    beraterName,
    beraterEmail,
    beraterTelefon,
    beraterPosition,
    berater,
  })

  return (
    <EmailLayout
      augenbraue="Deine Berechnung"
      titel="Deine Steuerauswertung"
      vorschau="Deine Zahlen aus dem Steuerrechner, als PDF zum Behalten."
      anrede={hallo(kundeName)}
      person={person}
      ohneUnterschrift={!person}
    >
      <Absatz>
        vielen Dank für deine Angaben. Deine Auswertung aus dem Steuerrechner liegt dieser Mail als
        PDF bei, mit deinen Zahlen und der Erklärung, warum eine vermietete Wohnung
        Steuern spart.
      </Absatz>

      <Absatz letzter>
        Du findest darin eine Spanne und keine einzelne Zahl. Das ist Absicht: Für dieselbe Wohnung
        stehen zwei Abschreibungswege offen, und welcher bei dir gilt, hängt am Objekt und daran,
        ob eine kürzere Restnutzungsdauer nachgewiesen wird. Das untere Ende bekommt jeder, das
        obere setzt ein anerkanntes Gutachten voraus.
      </Absatz>

      {/* Der Knopf ist der ZWEITE Weg, nicht der erste. Manche Postfaecher
          sortieren PDF-Anhaenge aus, dann fuehrt er trotzdem zur Auswertung. */}
      {pdfUrl && (
        <Handlung
          href={pdfUrl}
          text="Auswertung öffnen"
          hinweis="Falls der Anhang bei dir nicht ankommt  ·  Link 90 Tage gültig"
        />
      )}

      <Schritte
        titel="Wie es weitergeht"
        punkte={[
          naechsterSchrittZeile(person?.name),
          'Darin rechnen wir die genauen Zahlen für deinen Fall, statt einer Spanne.',
          'Erst danach geht es um konkrete Objekte, die zu diesen Zahlen passen.',
        ]}
      />

      <Hinweis text="Die Auswertung ist eine Modellrechnung und keine Steuerberatung. Sie zeigt eine Größenordnung und ersetzt keine individuelle Steuer- oder Anlageberatung. Gerechnet ist mit einem typisierten Objekt, ein konkretes Angebot ist damit nicht verbunden." />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Deine Steuerauswertung von OS Immobilien',
  displayName: 'Steuerauswertung (öffentlicher Steuerrechner)',
  previewData: {
    kundeName: 'Max Mustermann',
    pdfUrl: 'https://example.com/moreimmo-steuerauswertung.pdf',
    beraterName: 'Christian Peetz',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
