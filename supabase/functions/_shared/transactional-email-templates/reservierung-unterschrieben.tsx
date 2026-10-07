import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Handlung, Hinweis, Nebenhandlung } from './_layout.tsx'

/**
 * Interne Meldung: Die Reservierungsvereinbarung ist unterschrieben.
 *
 * Geht an den zuständigen Vertriebspartner und an die Geschäftsführung
 * (Christian Peetz, Christian Kurz), verschickt über
 * `_shared/reservierung-unterschrieben-meldung.ts`, sobald die PDF abgelegt
 * ist. Der Knopf lädt die unterschriebene Vereinbarung über eine signierte
 * Adresse mit sieben Tagen Laufzeit; danach bleibt der Weg über das
 * Kundenprofil.
 *
 * Drei Sonderfälle, damit die Mail nie mehr verspricht, als geschehen ist:
 *   - `einheitVergeben`: unterschrieben, aber die Einheit war schon weg.
 *     Dann gibt es keine Reservierung, und die Mail sagt das.
 *   - `reservierungAb`: Der Kunde wartet die Widerrufsfrist ab, die
 *     Reservierung wird erst an diesem Tag wirksam.
 *   - `pdfFehlt`: Die PDF kam nicht an. Die Mail meldet die Unterschrift
 *     trotzdem und verweist auf das Kundenprofil.
 *
 * Nur die Mail an die Geschäftsführung trägt zusätzlich den Abschnitt
 * „Nächster Schritt: WhatsApp-Gruppe eröffnen“ (`whatsappVertriebspartner`,
 * `whatsappFinanzierer`). Die Zeilen setzt
 * `_shared/reservierung-unterschrieben-meldung.ts`, dort steht auch der Text
 * für fehlende Werte.
 *
 * Intern und ohne Unterschriftsblock, wie die übrigen Meldungen an Kollegen.
 */
interface Props {
  /** Name des Empfängers, für die Anrede. */
  vpName?: string
  kundeName?: string
  kundeLink?: string
  objektTitel?: string
  unterschriebenAm?: string
  pdfUrl?: string
  pdfGueltigBis?: string
  pdfFehlt?: boolean
  einheitVergeben?: boolean
  gesamtobjekt?: boolean
  reservierungAb?: string
  whatsappVertriebspartner?: string
  whatsappFinanzierer?: string
}

const Mail = ({
  vpName, kundeName, kundeLink, objektTitel, unterschriebenAm,
  pdfUrl, pdfGueltigBis, pdfFehlt, einheitVergeben, gesamtobjekt, reservierungAb,
  whatsappVertriebspartner, whatsappFinanzierer,
}: Props) => {
  const kunde = kundeName || 'Ein Kunde'
  const gegenstand = gesamtobjekt ? 'Das Objekt' : 'Die Einheit'
  const zeilen: Array<[string, string]> = [['Kunde', kunde]]
  if (objektTitel) zeilen.push([gesamtobjekt ? 'Objekt' : 'Objekt und Einheit', objektTitel])
  if (unterschriebenAm) zeilen.push(['Unterschrieben am', unterschriebenAm])
  if (reservierungAb && !einheitVergeben) zeilen.push(['Reservierung wirksam ab', reservierungAb])

  return (
    <EmailLayout
      augenbraue="Unterschrieben"
      titel={einheitVergeben ? 'Unterschrieben, aber schon vergeben' : 'Die Reservierung ist unterschrieben'}
      vorschau={`${kunde} hat die Reservierungsvereinbarung unterschrieben`}
      anrede={vpName ? `Hallo ${vpName.split(' ')[0]},` : 'Hallo,'}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {kunde} hat die Reservierungsvereinbarung{objektTitel ? ` für ${objektTitel}` : ''} digital unterschrieben.{' '}
        {einheitVergeben
          ? `${gegenstand} war zum Zeitpunkt der Unterschrift aber schon anderweitig vergeben. Eine Reservierung ist deshalb nicht zustande gekommen, und an den Kunden ging keine Zahlungsaufforderung. Bitte den Kunden informieren.`
          : reservierungAb
          ? `Der Kunde wartet die Widerrufsfrist ab. Die Reservierung wird am ${reservierungAb} wirksam, bis dahin bleibt ${gesamtobjekt ? 'das Objekt' : 'die Einheit'} frei.`
          : `${gegenstand} ist damit verbindlich reserviert.`}
      </Absatz>

      <Angaben zeilen={zeilen} />

      {(whatsappVertriebspartner || whatsappFinanzierer) && !einheitVergeben && (
        <Angaben
          titel="Nächster Schritt: WhatsApp-Gruppe eröffnen"
          zeilen={[
            ['Anlass', 'Start in die Finanzierung'],
            ['Vertriebspartner', whatsappVertriebspartner || 'Vertriebspartner nicht zugeordnet'],
            ['MORE Immo Leitung', 'Christian Peetz, Christian Kurz'],
            ['Finanzierer', whatsappFinanzierer || 'Finanzierer noch nicht zugeordnet'],
          ]}
        />
      )}

      {pdfUrl ? (
        <>
          <Handlung
            href={pdfUrl}
            text="Reservierungsvereinbarung herunterladen"
            hinweis={pdfGueltigBis ? `Der Link gilt bis ${pdfGueltigBis}. Danach findest du die PDF im Kundenprofil.` : undefined}
          />
          {kundeLink && <Nebenhandlung href={kundeLink} text="Kundenprofil öffnen" />}
        </>
      ) : (
        <>
          {pdfFehlt && (
            <Hinweis text="Die unterschriebene PDF ist noch nicht im System angekommen. Die Unterschrift selbst ist gültig. Bitte im Kundenprofil nachsehen und die PDF bei Bedarf dort ablegen." ton="warnung" />
          )}
          {kundeLink && <Handlung href={kundeLink} text="Kundenprofil öffnen" />}
        </>
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => data?.kundeName ? `Reservierung unterschrieben: ${data.kundeName}` : 'Eine Reservierung wurde unterschrieben',
  displayName: 'Reservierung unterschrieben (an Partner und Geschäftsführung)',
  previewData: {
    vpName: 'Julian Meyer',
    kundeName: 'Max Mustermann',
    kundeLink: 'https://portal.more.immo/kunden/123',
    objektTitel: 'Breitscheidstraße 18, Wohnung 12',
    unterschriebenAm: '24.09.2026',
    pdfUrl: 'https://example.invalid/reservierungsvereinbarung.pdf',
    pdfGueltigBis: '01.10.2026',
    whatsappVertriebspartner: 'Julian Meyer, 0171 2345678',
    whatsappFinanzierer: 'Finanzierer noch nicht zugeordnet',
  },
} satisfies TemplateEntry
