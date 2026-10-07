import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'

/**
 * Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet.
 *
 * Frueher Tag 10 nach der Einladung zur Selbstauskunft.
 * Die Vorlage bleibt fuer Historie und Vorschau liegen und wird von keiner
 * Function mehr aufgerufen.
 */

/**
 * Zweite und letzte Erinnerung, Tag 10.
 *
 * Sie bietet Hilfe an, statt zu mahnen, und nennt ausdrücklich die möglichen
 * Gründe, auch den, dass ohnehin ein gemeinsamer Termin ansteht. Ein Kunde, der
 * darauf wartet, erkennt sich in diesem Absatz wieder und legt die Nachricht
 * beruhigt weg, statt sich zu fragen, ob er etwas versäumt hat.
 *
 * Die frühere dritte Erinnerung fragte "Sollen wir Ihre Anfrage ruhen lassen?".
 * Diese Frage gehört in das Telefonat an Tag 14, nicht in eine Automatik: Ein
 * Mensch hört am Tonfall, ob jemand abgesprungen ist oder nur im Urlaub war.
 */

interface Props {
  kundeName?: string
  fillUrl?: string
  gueltigBis?: string
  berater?: Ansprechpartner
}

const Mail = ({ kundeName, fillUrl, gueltigBis, berater }: Props) => (
  <EmailLayout
    augenbraue="Erinnerung"
    titel="Sollen wir die Selbstauskunft gemeinsam ausfüllen?"
    vorschau="Kein Problem, wenn es noch nicht geklappt hat. Wir helfen gerne."
    anrede={kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,'}
    person={berater}
  >
    <Absatz>
      Ihre Selbstauskunft liegt uns noch nicht vollständig vor. Das kann viele Gründe haben,
      und keiner davon ist ein Problem.
    </Absatz>

    <Absatz>
      Vielleicht ist die Mail bei Ihnen im Spam-Ordner gelandet. Vielleicht sind Sie an einer
      Frage hängen geblieben. Vielleicht war schlicht keine Zeit. Und vielleicht warten Sie
      auch auf einen gemeinsamen Termin mit uns, dann ist alles in Ordnung und Sie können
      diese Nachricht ignorieren.
    </Absatz>

    <Absatz letzter>
      <strong>Falls Sie noch nicht dazu gekommen sind:</strong> Wir füllen sie gerne gemeinsam
      mit Ihnen aus. Viele Kunden machen das so, weil sich Fragen zu Einkommen oder bestehenden
      Verbindlichkeiten im Gespräch schneller klären als im Formular. Sagen Sie einfach kurz,
      wann es Ihnen passt.
    </Absatz>

    <Handlung
      href={fillUrl || ''}
      text="Selbstauskunft öffnen"
      hinweis={gueltigBis ? `Link gültig bis ${gueltigBis}` : undefined}
    />

    <Absatz letzter>
      Der Hintergrund bleibt derselbe: Erst mit der ausgefüllten und unterschriebenen
      Selbstauskunft steht Ihr finanzieller Rahmen fest, und erst dann können wir mit der
      Objektauswahl weitermachen.
    </Absatz>
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: 'Sollen wir die Selbstauskunft gemeinsam ausfüllen?',
  displayName: 'Selbstauskunft-Erinnerung 2 (Tag 10)',
  previewData: {
    kundeName: 'Herr Mustermann',
    fillUrl: 'https://portal.more.immo/sa/example-token',
    gueltigBis: '5. August 2026',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
