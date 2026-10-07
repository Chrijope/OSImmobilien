import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Haken, Handlung, Hinweis, Luft, type Ansprechpartner } from './_layout.tsx'
import {
  STARTFAHRPLAN_AUGENBRAUE,
  STARTFAHRPLAN_BETREFF,
  STARTFAHRPLAN_EINLEITUNG,
  STARTFAHRPLAN_HERKUNFT,
  STARTFAHRPLAN_HINWEIS,
  STARTFAHRPLAN_KNOPF,
  STARTFAHRPLAN_KNOPF_HINWEIS,
  STARTFAHRPLAN_KOSTEN,
  STARTFAHRPLAN_SCHLUSS,
  STARTFAHRPLAN_TITEL,
  STARTFAHRPLAN_VORSCHAU,
  STARTFAHRPLAN_WEGE,
  STARTFAHRPLAN_WEGE_VORSATZ,
} from '../bewerber-startfahrplan-mail.ts'

/**
 * Der Startfahrplan, nachdem der Bewerber im Gespräch um die Unterlagen
 * gebeten hat.
 *
 * Der Wortlaut steht in `_shared/bewerber-startfahrplan-mail.ts`, damit der
 * Vitest-Test ihn lesen kann. Dort steht auch, was an der Fassung bis zum
 * 09.09.2026 nicht mehr stimmte: Sie siezte als einzige Mail des
 * Bewerberwegs, sie versprach „alle vier Startmöglichkeiten", die es seit dem
 * Wegfall der Servicevereinbarung nicht mehr gibt, sie sagte „Quereinsteiger",
 * und sie verwies auf eine Anlage 2, die heute etwas anderes enthält.
 *
 * Anrede Du, wie im Kennenlernen und im persönlichen Gespräch.
 */

interface Props {
  bewerberName?: string
  pdfUrl?: string
  beraterName?: string
  /* Das Profilbild kam flach herein, die Vorlage las aber nur
     berater.bildUrl. Deshalb fehlte es in der Mail. */
  beraterBild?: string
  beraterEmail?: string
  beraterTelefon?: string
  trackingClickUrl?: string
  berater?: Ansprechpartner
}

const Mail = ({
  bewerberName,
  pdfUrl,
  beraterName,
  beraterBild,
  beraterEmail,
  beraterTelefon,
  trackingClickUrl,
  berater,
}: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner | undefined =
    berater || beraterName
      ? {
          name: berater?.name || beraterName,
          rolle: berater?.rolle,
          telefon: berater?.telefon || beraterTelefon,
          email: berater?.email || beraterEmail,
          bildUrl: berater?.bildUrl || beraterBild,
        }
      : undefined

  return (
    <EmailLayout
      augenbraue={STARTFAHRPLAN_AUGENBRAUE}
      titel={STARTFAHRPLAN_TITEL}
      vorschau={STARTFAHRPLAN_VORSCHAU}
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz>{STARTFAHRPLAN_EINLEITUNG}</Absatz>

      <Absatz>{STARTFAHRPLAN_WEGE_VORSATZ}</Absatz>

      <Haken punkte={STARTFAHRPLAN_WEGE} />

      <Absatz>{STARTFAHRPLAN_KOSTEN}</Absatz>

      <Absatz letzter>{STARTFAHRPLAN_HERKUNFT}</Absatz>

      {pdfUrl && (
        <Handlung
          href={trackingClickUrl || pdfUrl}
          text={STARTFAHRPLAN_KNOPF}
          hinweis={STARTFAHRPLAN_KNOPF_HINWEIS}
        />
      )}

      {/* Sonst klebt der Schlussabsatz an der Zeile unter dem Knopf. */}
      <Luft />

      <Absatz letzter>{STARTFAHRPLAN_SCHLUSS}</Absatz>

      <Hinweis text={STARTFAHRPLAN_HINWEIS} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: STARTFAHRPLAN_BETREFF,
  displayName: 'Bewerber Startfahrplan, nach der Bitte um die Unterlagen',
  previewData: {
    bewerberName: 'Max Mustermann',
    pdfUrl: 'https://example.com/paket-uebersicht.pdf',
    berater: {
      // Nur die Vorschau. Im Versand steht hier die HR-Ansprechpartnerin aus
      // ihrem Nutzerprofil (`ladeHrAnsprechpartner`).
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
