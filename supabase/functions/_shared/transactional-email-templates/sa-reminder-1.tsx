import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'

/**
 * Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet.
 *
 * Frueher Tag 4 nach der Einladung zur Selbstauskunft.
 * Die Vorlage bleibt fuer Historie und Vorschau liegen und wird von keiner
 * Function mehr aufgerufen.
 */

/**
 * Erste Erinnerung, Tag 4.
 *
 * Bewusst kein Mahnton und keine Formulierung, die einen Zwischenstand
 * unterstellt. Der frühere Text sagte "Sie können dort weitermachen, wo Sie
 * aufgehört haben" und ging damit davon aus, dass der Kunde bereits angefangen
 * hat. Die meisten haben das nicht.
 *
 * Der Aufhänger ist stattdessen der Grund: Ohne unterschriebene Selbstauskunft
 * steht der finanzielle Rahmen nicht fest, und ohne den lassen sich keine
 * Objekte zeigen, die wirtschaftlich passen. Das gilt in jedem Fall, egal ob
 * der Kunde allein ausfüllt oder es später gemeinsam durchgegangen wird.
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
    titel="Ihre Selbstauskunft, der Schlüssel zur Objektauswahl"
    vorschau="Warum wir die Selbstauskunft brauchen, bevor es weitergehen kann."
    anrede={kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,'}
    person={berater}
  >
    <Absatz>
      vor ein paar Tagen haben wir Ihnen Ihre persönliche Selbstauskunft geschickt. Sie ist
      noch nicht abgeschlossen, deshalb melden wir uns kurz.
    </Absatz>

    <Absatz>
      <strong>Warum wir sie brauchen:</strong> Erst wenn uns die Selbstauskunft vollständig
      ausgefüllt und unterschrieben vorliegt, können wir Ihren finanziellen Rahmen sauber
      ermitteln. Und erst dann können wir Ihnen gezielt Objekte zeigen, die wirtschaftlich zu
      Ihnen passen. Ohne diese Grundlage könnten wir Ihnen nur Wohnungen vorstellen, von denen
      wir gar nicht wissen, ob sie für Sie überhaupt darstellbar sind. Das wäre für uns beide
      verlorene Zeit.
    </Absatz>

    <Absatz letzter>
      Sie brauchen dafür keine Unterlagen zusammenzusuchen. Es geht um Ihre Angaben zu
      Einkommen, Ausgaben und bestehenden Verpflichtungen.
    </Absatz>

    <Handlung
      href={fillUrl || ''}
      text="Selbstauskunft öffnen"
      hinweis={gueltigBis ? `Link gültig bis ${gueltigBis}` : undefined}
    />

    <Absatz letzter>
      Wenn Sie lieber gemeinsam durchgehen möchten oder eine Angabe unklar ist, melden Sie sich
      einfach. Am Telefon ist das meist in zehn Minuten geklärt.
    </Absatz>
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: 'Ihre Selbstauskunft, der Schlüssel zur Objektauswahl',
  displayName: 'Selbstauskunft-Erinnerung 1 (Tag 4)',
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
