import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { berufsbezeichnung } from '../berufsbezeichnung.ts'
import { EmailLayout, Absatz, Handlung, Liste, type Ansprechpartner } from './_layout.tsx'

interface Props {
  name?: string
  signatureUrl?: string
  paketTitel?: string
  documents?: { name: string }[]
  berater?: Ansprechpartner
  /**
   * Die HR-Managerin, wie in allen anderen Bewerbermails. Unter diesem
   * Namen laesst send-transactional-email die Person unangetastet; ein
   * `berater` wuerde dort ueber die Nutzerrolle neu aufgeloest und hiesse
   * dann "Immobilienberater".
   */
  hrKontakt?: Ansprechpartner
}

const Mail = ({ name, signatureUrl, paketTitel, documents, berater, hrKontakt }: Props) => {
  const person = hrKontakt?.name ? hrKontakt : berater
  const dokumente = Array.isArray(documents) ? documents : []
  // Nur der Vorname in der Anrede: Die Mail duzt, wie das ganze Bewerbergespräch.
  const vorname = (name || '').trim().split(/\s+/)[0] || ''
  // "als Vertriebspartner" statt "für das Paket Vertriebspartner": Der
  // Pakettitel ist die Rolle, in der jemand startet, kein Produkt.
  const rolle = (paketTitel || '').trim()

  return (
    <EmailLayout
      augenbraue="Unterschrift erforderlich"
      titel="Dein Handelsvertretervertrag"
      vorschau="Dein Handelsvertretervertrag wartet auf deine Unterschrift."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
      fussHinweis="Deine Daten werden verschlüsselt übertragen und nach DSGVO verarbeitet."
    >
      <Absatz letzter>
        schön, dass du dabei bist. Dein Handelsvertretervertrag{rolle ? ` als ${rolle}` : ''} ist
        fertig und wartet auf deine Unterschrift. Das geht digital, direkt am Bildschirm oder mit
        dem QR-Code auf dem Handy.
      </Absatz>

      {/*
        "prüfen" steht bewusst mit im Aufruf. Ohne das Wort denken die meisten,
        sie unterschreiben mit dem Klick sofort. Tatsächlich öffnet sich erst
        die Seite mit dem Vertrag und den Anlagen, die man in Ruhe lesen kann,
        und unterschrieben wird erst danach. Derselbe Wortlaut steht in den
        beiden Erinnerungen (vertrag-erinnerung-1, vertrag-erinnerung-2), damit
        der Knopf überall gleich heißt.
      */}
      <Handlung
        href={signatureUrl || ''}
        text="Vertrag öffnen, prüfen und unterschreiben"
        hinweis="Etwa 5 Minuten  ·  Link 30 Tage gültig"
      />

      {dokumente.length > 0 && (
        <Liste titel="Das bekommst du zum Lesen" punkte={dokumente.map((d) => ({ text: d.name }))} />
      )}

      <Absatz>
        Nimm dir für Vertrag und Anlagen in Ruhe Zeit. Mit deiner Unterschrift bestätigst du auch,
        dass du die Anlagen gelesen hast. Wenn dir etwas unklar ist, melde dich einfach vorher,
        dafür sind wir da.
      </Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Dein Handelsvertretervertrag, bitte unterschreiben',
  displayName: 'Vertrag Signatur-Anfrage',
  previewData: {
    name: 'Max Mustermann',
    signatureUrl: 'https://osimmobilien.netlify.app/signatur?token=example&type=vertrag',
    paketTitel: 'Vertriebspartner',
    documents: [
      { name: 'Handelsvertretervertrag' },
      { name: 'Anlage 1, AGB' },
      { name: 'Anlage 2, Grundgebühr-Paket' },
      { name: 'Anlage 3, DSGVO-Auftragsverarbeitung' },
      { name: 'Anlage 4, Provisionsordnung' },
      { name: 'Anlage 5, CRM- und Leadnutzungsbedingungen' },
      { name: 'Anlage 6, Compliance und Beratungsrichtlinien' },
    ],
    // Wie in den uebrigen Bewerbermails: die HR-Managerin, zur Laufzeit aus
    // der Rolle `hr` geladen (hr-ansprechpartner.ts).
    hrKontakt: {
      name: 'Sarah Kaiser-Thom',
      rolle: berufsbezeichnung('hr'),
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
