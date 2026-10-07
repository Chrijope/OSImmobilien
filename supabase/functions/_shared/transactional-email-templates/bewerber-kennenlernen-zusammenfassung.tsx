import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, type Ansprechpartner } from './_layout.tsx'
import {
  ZUSAMMENFASSUNG_EINLEITUNG,
  ZUSAMMENFASSUNG_KORREKTUR,
  ZUSAMMENFASSUNG_MELDEN,
  ZUSAMMENFASSUNG_BETREFF,
  ZUSAMMENFASSUNG_TITEL,
  ZUSAMMENFASSUNG_VORSCHAU,
  ZUSAMMENFASSUNG_VORSCHAU_TERMIN,
  zusammenfassungTerminSatz,
} from '../bewerber-kennenlernen-mail.ts'
import { mailWortwahl } from '../bewerber-kennenlernen-ueberblick.ts'

/**
 * Nachricht 3 des neuen Bewerberprozesses: der persönliche Überblick.
 *
 * Sie geht beim Absenden des Kennenlernens hinaus und zeigt dieselbe
 * Zusammenfassung wie der Überblick am Ende des Bogens, nur eben zum
 * Aufheben. Die letzte Ansicht
 * verspricht sie ausdrücklich („Du bekommst gleich eine Mail mit deinen
 * Angaben"); bis zum 06.09.2026 gab es sie nicht.
 *
 * ## Seit dem 08.09.2026 ohne jeden Knopf
 *
 * Vorher stand hier „Termin aussuchen". Der Bewerber buchte sich damit selbst
 * eine Zeit, bevor irgendjemand seine Antworten gelesen hatte, und die Auswahl
 * nach dem Bewerberscore lief leer. Gebucht wird jetzt erst nach unserer
 * Einladung, und die ist eine eigene Mail
 * (`bewerber-kooperationsgespraech-einladung`). An der Stelle des Knopfes
 * steht deshalb der Satz, dass wir uns melden.
 *
 * Drei Dinge stehen hier bewusst nicht drin:
 *
 *   1. **Keine Bewertung.** Keine Punktzahl, keine Eignungsprozente, keine
 *      Farbskala. Was hier steht, sind seine eigenen Angaben, geordnet.
 *   2. **Kein Knopf „Angaben ändern".** Ein abgeschickter Bogen lässt sich
 *      heute nicht mehr öffnen, und ein Knopf ins Leere ist schlimmer als
 *      keiner. Stattdessen der Weg, den es sicher gibt: auf diese Mail
 *      antworten.
 *   3. **Keine Frist.** „In der Regel ein paar Tage" ist alles, was der Ablauf
 *      wirklich hergibt. Ein Datum wäre ein Versprechen ohne Deckung.
 *
 * Steht ausnahmsweise schon ein Termin, etwa weil die HR-Managerin ihn von
 * Hand eingetragen hat, ersetzt der konkrete Satz den allgemeinen. Ob ein
 * Termin steht, entscheidet die aufrufende Function über `terminAusMeta`; hier
 * hängt es allein daran, ob `terminDatum` mitkommt.
 *
 * Wortlaut in `_shared/bewerber-kennenlernen-mail.ts`, die Beschriftungen der
 * Antworten in `_shared/bewerber-kennenlernen-ueberblick.ts`, damit Vitest
 * beides lesen kann.
 *
 * Anrede durchgängig Du, wie im Kennenlernen selbst.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 176 60995539',
  email: 'office@more.immo',
}

interface Props {
  bewerberName?: string
  /** Der gebuchte Termin, JJJJ-MM-TT. Nur gesetzt, wenn einer steht. */
  terminDatum?: string
  /** Die Uhrzeit dazu, HH:MM. Darf fehlen. */
  terminUhrzeit?: string
  /** Der Überblick, gebaut in `submit-bewerber-formular`. */
  gruppen?: Array<{ titel: string; zeilen: Array<{ label: string; wert: string }> }>
  berater?: Ansprechpartner
  /** Die HR-Managerin für den Kasten am Fuß der Mail. */
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  hrKontakt,
  bewerberName,
  terminDatum,
  terminUhrzeit,
  gruppen = [],
  berater,
}: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)
  const terminSteht = !!(terminDatum && terminDatum.trim())

  return (
    <EmailLayout
      augenbraue="Dein Kennenlernen"
      titel={ZUSAMMENFASSUNG_TITEL}
      vorschau={terminSteht ? ZUSAMMENFASSUNG_VORSCHAU_TERMIN : ZUSAMMENFASSUNG_VORSCHAU}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>{ZUSAMMENFASSUNG_EINLEITUNG}</Absatz>

      {terminSteht ? (
        <Absatz letzter>{zusammenfassungTerminSatz(terminDatum || '', terminUhrzeit)}</Absatz>
      ) : (
        <Absatz letzter>{ZUSAMMENFASSUNG_MELDEN}</Absatz>
      )}

      {gruppen.map((gruppe, i) => (
        <Angaben
          key={i}
          titel={gruppe.titel}
          // Schonendere Wörter nur in der Mail, siehe MAIL_WORTWAHL.
          zeilen={gruppe.zeilen.map((z) => [mailWortwahl(z.label), mailWortwahl(z.wert)] as [string, string])}
        />
      ))}

      <Absatz letzter>{ZUSAMMENFASSUNG_KORREKTUR}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: ZUSAMMENFASSUNG_BETREFF,
  displayName: 'Bewerber Kennenlernen, Zusammenfassung nach dem Absenden',
  previewData: {
    bewerberName: 'Max Mustermann',
    gruppen: [
      {
        titel: 'So möchtest du starten',
        zeilen: [
          { label: 'Zeit pro Woche', wert: '10 bis 20 Stunden, das ist mir wichtig' },
          { label: 'Perspektive', wert: 'Nebenberuflich starten, perspektivisch hauptberuflich' },
          { label: 'Start', wert: 'In den nächsten vier Wochen' },
        ],
      },
      {
        titel: 'Das bringst du mit',
        zeilen: [
          { label: 'Der gewählte Weg', wert: 'Ich verkaufe schon Immobilien' },
          { label: 'Abschlüsse im letzten Jahr', wert: '4 bis 10' },
        ],
      },
      {
        titel: 'Das klären wir im Gespräch',
        zeilen: [
          { label: 'Gewerbe', wert: 'Ja, habe ich' },
          { label: 'Eigene Themen', wert: 'Vergütung und Rechenwege, Leads und Kundengewinnung' },
        ],
      },
    ],
    berater: STANDARD,
  },
} satisfies TemplateEntry
