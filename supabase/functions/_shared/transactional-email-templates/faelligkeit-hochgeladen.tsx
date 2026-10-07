import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import type { MailFelder } from './felder.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, Angaben } from './_layout.tsx'

/**
 * Interne Meldung: Der Nachweis zur Kaufpreisfaelligkeit liegt im
 * Kundenordner.
 *
 * ## Warum die Vorlage nach innen spricht und nicht zum Kunden
 *
 * Sie war als Kundenmail geschrieben, mit "Guten Tag <Kundenname>," und dem
 * Satz, der Kunde moege die Ueberweisung rechtzeitig veranlassen. Verschickt
 * wurde sie aber immer nur an drei interne Adressen, Buchhaltung und
 * Backoffice. Der Kunde stand also in der Anrede, bekam die Mail aber nie.
 * Jetzt liest sie sich so, wie sie verschickt wird.
 *
 * ## Die Felder
 *
 * Sie stehen in `./felder.ts`, nicht hier. Damit ist die Liste dieselbe, die
 * der Absender in `src/lib/mailVersand.ts` benutzt, und ein Feldname kann
 * nicht mehr auf einer Seite anders heissen als auf der anderen. Genau das
 * war hier der Fehler: Der Absender schickte `dokumentUrl` und
 * `hochgeladenVon`, die Vorlage erwartete `faelligkeitsdatum` und
 * `portalUrl`. Keine Seite hat es gemerkt.
 *
 * Der Link heisst deshalb auch `crmUrl` und nicht mehr `portalUrl`: Er fuehrt
 * in die Kundenakte, nicht ins Kundenportal.
 */
type Props = MailFelder['faelligkeit-hochgeladen']

const Mail = ({
  kundeName,
  objektName,
  wohnungName,
  faelligkeitsdatum,
  dokumentUrl,
  hochgeladenVon,
  crmUrl,
}: Props) => {
  const zeilen: Array<[string, string]> = []
  if (kundeName) zeilen.push(['Kunde', kundeName])
  if (faelligkeitsdatum) zeilen.push(['Fällig am', faelligkeitsdatum])
  if (objektName) zeilen.push(['Objekt', [objektName, wohnungName].filter(Boolean).join(', ')])
  if (hochgeladenVon) zeilen.push(['Hochgeladen von', hochgeladenVon])

  return (
    <EmailLayout
      augenbraue="Dokument"
      titel="Die Kaufpreisfälligkeit steht fest"
      vorschau={
        faelligkeitsdatum
          ? `${kundeName || 'Ein Vorgang'}: Kaufpreis fällig am ${faelligkeitsdatum}`
          : `${kundeName || 'Ein Vorgang'}: Nachweis zur Kaufpreisfälligkeit liegt vor`
      }
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {faelligkeitsdatum
          ? `der Nachweis zur Kaufpreisfälligkeit liegt im Kundenordner. Der Kaufpreis muss bis zum ${faelligkeitsdatum} auf dem Konto des Notars eingegangen sein.`
          : 'der Nachweis zur Kaufpreisfälligkeit liegt im Kundenordner. Ein Fälligkeitsdatum ist am Investment noch nicht eingetragen.'}
      </Absatz>

      {dokumentUrl && <Handlung href={dokumentUrl} text="Nachweis öffnen" hinweis="Der Link gilt sieben Tage." />}

      {zeilen.length > 0 && <Angaben titel="Der Vorgang" zeilen={zeilen} />}

      {crmUrl && <Nebenhandlung href={crmUrl} text="Kundenakte im CRM öffnen" />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    data?.faelligkeitsdatum
      ? `Kaufpreis fällig am ${data.faelligkeitsdatum}: ${data?.kundeName || 'neuer Vorgang'}`
      : `Kaufpreisfälligkeit hochgeladen: ${data?.kundeName || 'neuer Vorgang'}`,
  displayName: 'Kaufpreisfälligkeit hochgeladen',
  previewData: {
    kundeName: 'Max Mustermann',
    faelligkeitsdatum: '22. September 2026',
    objektName: 'Breitscheidstraße 18',
    wohnungName: 'Wohnung 12',
    dokumentUrl: 'https://example.com/faelligkeit.pdf',
    hochgeladenVon: 'Backoffice',
    crmUrl: 'https://osimmobilien.netlify.app/kunden/1234',
  },
} satisfies TemplateEntry
